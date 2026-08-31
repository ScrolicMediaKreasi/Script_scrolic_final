"""
cTrader Open API Official OAuth 2.0 & Token Supervisor
Single Runtime Owner: Python FastAPI (:8001)
================================================================================
Features:
1. Strict Cryptographic State Validation & CSRF Protection (HMAC SHA-256 with 15-minute TTL)
2. Exact Canonical Redirect URI Correlation
3. Official Authorization Code Exchange & Token Persistence
4. Mandatory Account Verification prior to setting Connected state
5. Strict removal of synthetic tokens & random account IDs
6. Scheduled Proactive Token Refresh Supervisor before expiry
7. Token Validation on Refresh with automatic degradation handling upon failure
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

from backend.ctrader_config import (
    get_ctrader_client_id,
    get_ctrader_client_secret,
    get_ctrader_env,
    mask_credential,
    AUTH_BASE_URL,
    TOKEN_ENDPOINT_URL
)
from backend.database import db_store

logger = logging.getLogger("scrolic.ctrader_oauth")

OAUTH_STATE_SECRET = os.environ.get("SESSION_SECRET") or get_ctrader_client_secret() or "scrolic_ctrader_secure_state_salt_2026"
OAUTH_STATE_TTL_SECONDS = 900  # 15 minutes validity

def generate_oauth_state(user_id: str) -> str:
    """
    Generates a cryptographically signed state parameter containing user_id,
    issued timestamp, and an HMAC-SHA256 signature to prevent CSRF and session spoofing.
    """
    ts = int(time.time())
    payload = f"{user_id}:{ts}"
    sig = hmac.new(
        OAUTH_STATE_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()[:16]
    state_token = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(state_token.encode("utf-8")).decode("utf-8")

def validate_oauth_state(state_str: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validates the state parameter signature and TTL.
    Returns (is_valid, user_id, error_message).
    """
    if not state_str:
        return False, None, "Missing OAuth state parameter (CSRF protection violation)"
    try:
        raw = base64.urlsafe_b64decode(state_str.encode("utf-8")).decode("utf-8")
        parts = raw.split(":")
        if len(parts) != 3:
            return False, None, "Malformed OAuth state format"
        
        user_id, ts_str, sig = parts
        ts = int(ts_str)
        now = int(time.time())

        # Check TTL
        if now - ts > OAUTH_STATE_TTL_SECONDS:
            return False, user_id, "OAuth state expired (exceeded 15 minutes)"
        if ts > now + 60:
            return False, user_id, "OAuth state timestamp in the future"

        # Verify HMAC signature
        expected_sig = hmac.new(
            OAUTH_STATE_SECRET.encode("utf-8"),
            f"{user_id}:{ts_str}".encode("utf-8"),
            hashlib.sha256
        ).hexdigest()[:16]

        if not hmac.compare_digest(sig, expected_sig):
            return False, None, "Invalid OAuth state cryptographic signature (CSRF mismatch)"

        return True, user_id, None
    except Exception as e:
        return False, None, f"Failed to parse OAuth state: {str(e)}"

def get_canonical_redirect_uri(request: Any) -> str:
    """Resolves exact canonical Redirect URI with no trailing slash or protocol mismatches."""
    env_redirect = os.environ.get("CTRADER_REDIRECT_URI", "").strip()
    if env_redirect:
        return env_redirect

    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "127.0.0.1:8001")
    proto = request.headers.get("x-forwarded-proto") or getattr(request, "url", None).scheme if hasattr(request, "url") else "http"
    
    if "127.0.0.1" in host or "localhost" in host:
        return "http://localhost:8001/api/ctrader/callback"

    if "127.0.0.1" not in host and "localhost" not in host:
        proto = "https"

    return f"{proto}://{host}/api/ctrader/callback"

def get_grant_access_url(redirect_uri: str, user_id: str) -> str:
    """Generates official Spotware Grant Access URL with signed state."""
    client_id = get_ctrader_client_id()
    state = generate_oauth_state(user_id) if user_id else ""
    scope = "trading"
    encoded_redirect = urllib.parse.quote(redirect_uri, safe="")
    return f"{AUTH_BASE_URL}/apps/auth?client_id={client_id}&redirect_uri={encoded_redirect}&scope={scope}&state={state}"

async def exchange_code_for_token(code: str, redirect_uri: str) -> Dict[str, Any]:
    """
    Exchanges authorization code for access token via official Spotware Token endpoint.
    Spec: POST https://connect.spotware.com/apps/token
    """
    client_id = get_ctrader_client_id()
    client_secret = get_ctrader_client_secret()

    if not client_id or not client_secret:
        raise ValueError("CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET is not configured in backend environment.")

    post_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri
    }).encode("utf-8")

    req = urllib.request.Request(
        TOKEN_ENDPOINT_URL,
        data=post_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scrolic/7.0",
            "Accept": "application/json"
        },
        method="POST"
    )

    loop = asyncio.get_event_loop()
    def _do_post():
        with urllib.request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)

    token_data = await loop.run_in_executor(None, _do_post)
    access_token = token_data.get("accessToken") or token_data.get("access_token")
    if not access_token:
        error_desc = token_data.get("errorDescription") or token_data.get("errorCode") or "Token exchange returned no accessToken"
        raise ValueError(f"Spotware Token Error: {error_desc}")

    expires_in = int(token_data.get("expiresIn") or token_data.get("expires_in") or 2592000)
    refresh_token = token_data.get("refreshToken") or token_data.get("refresh_token") or ""

    logger.info(f"[cTrader.OAuth] Code exchange success. Access Token: {mask_credential(access_token)}, Expires in: {expires_in}s")
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresIn": expires_in
    }

async def fetch_and_validate_accounts(access_token: str) -> List[Dict[str, Any]]:
    """Fetches authorized accounts using the official Open API protobuf flow."""
    if not access_token:
        return []
    from backend.ctrader_client import ctrader_client
    raw_accounts = await ctrader_client.get_accounts_by_access_token(access_token)
    validated_accounts = []
    for account in raw_accounts:
        acct_num = str(account.get("ctidTraderAccountId") or "")
        if not acct_num:
            continue
        is_live = bool(account.get("isLive", False))
        validated_accounts.append({
            "accountId": f"cTrader-{acct_num}",
            "accountNo": acct_num,
            "brokerName": "Spotware cTrader",
            "accountType": "LIVE" if is_live else "DEMO",
            "currency": "USD",
            "balance": 0.0,
            "leverage": 500,
            "isLive": is_live,
            "source": "broker_ctrader"
        })
    if validated_accounts:
        logger.info(f"[cTrader.OAuth] Validated {len(validated_accounts)} accounts with Open API.")
    return validated_accounts

async def refresh_user_token(user_id: str) -> bool:
    """
    Refreshes access token for user, validates with official Spotware request,
    and cleanly handles degradation if refresh fails.
    """
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        return False

    refresh_token = user.get("ctrader_refresh_token")
    if not refresh_token:
        logger.warning(f"[cTrader.Refresh] User {user.get('username')} has no refresh token. Marking disconnected.")
        db_store.update_user(user.get("id") or user.get("username"), {
            "ctrader_connected": False,
            "ctrader_access_token": None
        })
        return False

    client_id = get_ctrader_client_id()
    client_secret = get_ctrader_client_secret()
    if not client_id or not client_secret:
        return False

    try:
        post_data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret
        }).encode("utf-8")

        req = urllib.request.Request(
            TOKEN_ENDPOINT_URL,
            data=post_data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scrolic/7.0",
                "Accept": "application/json"
            },
            method="POST"
        )

        loop = asyncio.get_event_loop()
        def _do_refresh():
            with urllib.request.urlopen(req, timeout=12) as resp:
                return json.loads(resp.read().decode("utf-8"))

        token_data = await loop.run_in_executor(None, _do_refresh)
        new_access_token = token_data.get("accessToken") or token_data.get("access_token")
        new_refresh_token = token_data.get("refreshToken") or token_data.get("refresh_token") or refresh_token
        expires_in = int(token_data.get("expiresIn") or token_data.get("expires_in") or 2592000)

        if not new_access_token:
            raise ValueError("Refresh response did not contain an accessToken")

        # Validate refreshed token against official accounts endpoint
        validated_accounts = await fetch_and_validate_accounts(new_access_token)
        if not validated_accounts:
            raise ValueError("Refreshed access token failed official account validation")

        new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        db_store.update_user(user.get("id") or user.get("username"), {
            "ctrader_access_token": new_access_token,
            "ctrader_refresh_token": new_refresh_token,
            "ctrader_token_expires_at": new_expires_at,
            "ctrader_accounts": validated_accounts,
            "ctrader_connected": True
        })
        from backend.ctrader_client import ctrader_client
        user_id = user.get("id") or user.get("username")
        for account in validated_accounts:
            account_id = account.get("accountId") if isinstance(account, dict) else account
            if account_id:
                await ctrader_client.authenticate_account(account_id, new_access_token, user_id)
        logger.info(f"[cTrader.Refresh] Successfully refreshed and validated token for user: {user.get('username')}")
        return True
    except Exception as exc:
        logger.error(f"[cTrader.Refresh] Token refresh failed for user {user.get('username')}: {exc}. Marking status DEGRADED / DISCONNECTED.")
        db_store.update_user(user.get("id") or user.get("username"), {
            "ctrader_connected": False,
            "ctrader_access_token": None
        })
        return False

class TokenRefreshSupervisor:
    """Background supervisor that checks and proactively refreshes expiring tokens."""
    def __init__(self, check_interval_sec: float = 900.0):
        self.check_interval_sec = check_interval_sec
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def _supervisor_loop(self):
        logger.info("[cTrader.Supervisor] Proactive token refresh supervisor started.")
        while self._running:
            try:
                now = datetime.now(timezone.utc)
                # Check all connected users
                for user in list(db_store.users):
                    if not user.get("ctrader_connected"):
                        continue
                    expires_at = user.get("ctrader_token_expires_at")
                    if isinstance(expires_at, str):
                        try:
                            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                        except ValueError:
                            expires_at = None
                    if isinstance(expires_at, datetime):
                        if expires_at.tzinfo is None:
                            expires_at = expires_at.replace(tzinfo=timezone.utc)
                        # If token expires within next 24 hours or is expired, refresh proactively
                        if expires_at < now + timedelta(hours=24):
                            u_id = user.get("id") or user.get("username")
                            logger.info(f"[cTrader.Supervisor] Proactively refreshing token for user {user.get('username')} (Expires: {expires_at.isoformat()})")
                            await refresh_user_token(u_id)
            except Exception as e:
                logger.warning(f"[cTrader.Supervisor] Loop warning: {e}")
            await asyncio.sleep(self.check_interval_sec)

    def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._supervisor_loop())

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

token_refresh_supervisor = TokenRefreshSupervisor(check_interval_sec=900.0)
