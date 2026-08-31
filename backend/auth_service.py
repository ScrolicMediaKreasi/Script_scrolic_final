"""
Auth Service & Google OAuth Handler for Python FastAPI Backend
Decodes Google Identity Services (GSI) credential JWT tokens, handles login, registration,
and processes referral rewards (+20 Energy).
"""
import base64, hashlib, json, re, secrets, sys, logging, os, urllib.parse, urllib.request
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import bcrypt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from backend.services.email_service import email_service

current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

try:
    from backend.database import db_store
except ImportError:
    from database import db_store

logger = logging.getLogger("scrolic.auth")

def format_auth_user_response(user: Dict[str, Any]) -> Dict[str, Any]:
    """Formats Python user dict into the standard AuthUser payload expected by the frontend."""
    created_at = user.get("created_at")
    if isinstance(created_at, datetime):
        created_at_str = created_at.isoformat()
    elif created_at:
        created_at_str = str(created_at)
    else:
        created_at_str = datetime.now(timezone.utc).isoformat()

    bank_accounts = []
    for b in user.get("bank_accounts", []):
        b_created = b.get("created_at")
        b_created_str = b_created.isoformat() if isinstance(b_created, datetime) else (str(b_created) if b_created else created_at_str)
        bank_accounts.append({
            "id": b.get("id", f"bank-{b.get('bank_code', 'id')}"),
            "bankCode": b.get("bank_code", b.get("bankCode", "")),
            "bankName": b.get("bank_name", b.get("bankName", "")),
            "accountNumber": b.get("account_number", b.get("accountNumber", "")),
            "accountHolderName": b.get("account_holder_name", b.get("accountHolderName", "")),
            "isPrimary": bool(b.get("is_primary", b.get("isPrimary", False))),
            "createdAt": b_created_str
        })

    return {
        "id": str(user.get("id") or user.get("_id") or "user-unknown"),
        "username": user.get("username", "trader"),
        "displayName": user.get("display_name") or user.get("displayName") or user.get("username", "Trader"),
        "email": user.get("email"),
        "emailVerified": bool(user.get("email_verified", user.get("emailVerified", False))),
        "avatar": user.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={user.get('username', 'trader')}",
        "bio": user.get("bio", ""),
        "role": str(user.get("role", "user")).lower(),
        "isBanned": bool(user.get("is_banned", False)),
        "strategyDNA": user.get("strategy_dna") or user.get("strategyDNA") or "breakout",
        "primaryStrategyId": user.get("primary_strategy_id") or user.get("primaryStrategyId") or "breakout",
        "subscriptionTier": user.get("subscription_tier") or user.get("subscriptionTier") or "free",
        "isVerified": bool(user.get("is_verified", user.get("isVerified", True))),
        "winRate": float(user.get("win_rate", user.get("winRate", 0.0))),
        "totalTrades": int(user.get("trades_count", user.get("totalTrades", 0))),
        "totalTradesCount": int(user.get("trades_count", user.get("totalTradesCount", 0))),
        "totalProfitUSD": float(user.get("total_profit_usd", user.get("totalProfitUSD", 0.0))),
        "totalPips": float(user.get("total_pips", user.get("totalPips", 0.0))),
        "followersCount": int(user.get("followers_count", user.get("followersCount", 0))),
        "followingCount": int(user.get("following_count", user.get("followingCount", 0))),
        "followingList": user.get("following_list", user.get("followingList", [])),
        "energyBalance": int(user.get("energy", user.get("energyBalance", 0))),
        "referralCode": user.get("referral_code", user.get("referralCode", "")),
        "referralsCount": int(user.get("referrals_count", user.get("referralsCount", 0))),
        "affiliateEarningsEnergy": int(user.get("affiliate_earnings_energy", user.get("affiliateEarningsEnergy", 0))),
        "tradeEarningsEnergy": int(user.get("trade_earnings_energy", user.get("tradeEarningsEnergy", 0))),
        "kycStatus": user.get("kyc_status", user.get("kycStatus", "unverified")),
        "kycFullName": user.get("kyc_full_name") or user.get("kycFullName") or None,
        "bankAccounts": bank_accounts,
        "cTraderAccountId": user.get("ctrader_account_id") or user.get("cTraderAccountId") or None,
        "cTraderAccounts": user.get("ctrader_accounts") or user.get("cTraderAccounts") or [],
        "cTraderConnected": bool(user.get("ctrader_connected", user.get("cTraderConnected", False))),
        "pwaBonusClaimed": bool(user.get("pwa_bonus_claimed", user.get("pwaBonusClaimed", False))),
        "defaultUnlockFee": int(user.get("default_unlock_price", user.get("defaultUnlockFee", 1))),
        "defaultFollowFee": int(user.get("default_follow_price", user.get("defaultFollowFee", 1))),
        "createdAt": created_at_str
    }

class AuthService:
    _reset_requests: Dict[str, list[datetime]] = {}
    _verification_requests: Dict[str, list[datetime]] = {}

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _create_email_token(self, user_id: str, token_type: str, ttl_minutes: int = 30) -> str:
        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        self._invalidate_active_tokens(user_id, token_type)
        db_store.create_email_token({
            "user_id": user_id,
            "token_hash": self._token_hash(raw_token),
            "type": token_type,
            "expires_at": now.replace(microsecond=0) + timedelta(minutes=ttl_minutes),
            "used_at": None,
            "created_at": now,
        })
        return raw_token

    def _invalidate_active_tokens(self, user_id: str, token_type: str):
        for item in db_store.email_tokens:
            if item.get("user_id") == user_id and item.get("type") == token_type and not item.get("used_at"):
                item["used_at"] = datetime.now(timezone.utc)
        if db_store.is_mongo_connected and db_store.db is not None:
            try:
                db_store.db.email_tokens.update_many(
                    {"user_id": user_id, "type": token_type, "used_at": None},
                    {"$set": {"used_at": datetime.now(timezone.utc)}}
                )
            except Exception as exc:
                logger.warning("[Auth] Could not invalidate prior email tokens for user_id=%s: %s", user_id, exc)

    def _consume_email_token(self, raw_token: str, token_type: str) -> Dict[str, Any]:
        record = db_store.find_email_token(self._token_hash(raw_token), token_type)
        now = datetime.now(timezone.utc)
        if not record or record.get("used_at"):
            raise ValueError("Token tidak valid atau sudah kedaluwarsa")
        expires_at = record.get("expires_at")
        if expires_at and now >= (expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)):
            raise ValueError("Token tidak valid atau sudah kedaluwarsa")
        db_store.mark_email_token_used(record, now)
        return record

    async def _send_welcome_email(self, user: Dict[str, Any]):
        email = user.get("email")
        if not email:
            return
        username = user.get("username") or user.get("display_name") or "trader"
        await email_service.send_welcome_email(str(user.get("id")), email, str(username), str(email))

    async def _check_new_device(self, user: Dict[str, Any], device_key: str):
        if not user.get("email") or not device_key:
            return
        device_hash = hashlib.sha256(device_key.encode("utf-8")).hexdigest()
        known_devices = user.get("known_login_devices") or []
        if device_hash in known_devices:
            return
        db_store.update_user(str(user.get("id") or user.get("username")), {
            "known_login_devices": (known_devices + [device_hash])[-10:]
        })
        if known_devices:
            await email_service.send_security_alert_email(
                str(user.get("id") or user.get("username")),
                user["email"],
                "Login dari perangkat baru",
                datetime.now(timezone.utc).isoformat()
            )
    @staticmethod
    def decode_google_credential(credential: str) -> Dict[str, Any]:
        """Base64 decode Google GSI JWT token payload."""
        try:
            parts = credential.split(".")
            if len(parts) == 3:
                # Add padding if needed
                payload_b64 = parts[1]
                padded = payload_b64 + "=" * (-len(payload_b64) % 4)
                decoded_bytes = base64.urlsafe_b64decode(padded)
                return json.loads(decoded_bytes.decode("utf-8"))
        except Exception as e:
            logger.warning(f"[auth.google] Failed to decode Google credential: {e}")
        return {}

    async def handle_google_auth(self, body: Dict[str, Any]) -> Dict[str, Any]:
        credential = body.get("credential")
        email = body.get("email")
        name = body.get("name")
        avatar = body.get("avatar")
        username_req = body.get("username")
        strategy_id = body.get("strategyId", "breakout")
        referral_code = body.get("referralCode")
        terms_accepted = body.get("termsAccepted") is True
        privacy_accepted = body.get("privacyAccepted") is True
        legal_version = str(body.get("legalVersion") or "2026-02-26")

        if credential:
            payload = self.decode_google_credential(credential)
            if payload.get("email"):
                email = payload.get("email")
            if payload.get("name"):
                name = payload.get("name")
            if payload.get("picture"):
                avatar = payload.get("picture")

        clean_email = email.lower().strip() if email else None
        if not clean_email and not username_req:
            raise ValueError("Email Google atau Username wajib diisi untuk autentikasi")

        raw_user_name = username_req or (clean_email.split("@")[0] if clean_email else "trader")
        clean_username = re.sub(r"[^a-z0-9_]", "_", raw_user_name.lower())

        user = None
        if clean_email:
            user = db_store.find_user_by_email(clean_email)
        if not user:
            user = db_store.find_user_by_username(clean_username)

        if not user:
            if not terms_accepted or not privacy_accepted:
                raise ValueError("Persetujuan Terms & Conditions dan Privacy Policy wajib untuk membuat akun")
            referrer_id = None
            if referral_code:
                referrer = db_store.find_user_by_referral_code(referral_code)
                if referrer:
                    referrer_id = referrer.get("id") or referrer.get("username")
                    # Reward referrer with 20 Energy
                    db_store.update_energy(referrer_id, 20)
                    db_store.update_user(referrer_id, {
                        "referrals_count": referrer.get("referrals_count", 0) + 1,
                        "affiliate_earnings_energy": referrer.get("affiliate_earnings_energy", 0) + 20
                    })
                    db_store.create_transaction({
                        "user_id": referrer_id,
                        "type": "AFFILIATE_COMMISSION",
                        "amount": 20,
                        "balance_before": referrer.get("energy", 0),
                        "balance_after": referrer.get("energy", 0) + 20,
                        "metadata": {"newUserId": f"user-{clean_username}", "referralCode": referral_code}
                    })
                    db_store.create_notification({
                        "user_id": referrer_id,
                        "title": "Referral Baru Bergabung!",
                        "message": f"@{clean_username} mendaftar lewat link referral Anda. Anda mendapatkan +20 ENERGY!",
                        "type": "AFFILIATE_COMMISSION"
                    })

            display_name = name or (clean_email.split("@")[0].title() if clean_email else clean_username)
            new_user = {
                "id": f"user-{clean_username}",
                "username": clean_username,
                "display_name": display_name,
                "email": clean_email,
                "avatar": avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={clean_username}",
                "bio": "trader baru scrolic",
                "role": "user",
                "premium": False,
                "subscription_tier": "free",
                "strategy_dna": strategy_id,
                "primary_strategy_id": strategy_id,
                "energy": 0,
                "referral_code": f"{clean_username.upper()}50",
                "referrer_id": referrer_id,
                "legal_consents": {
                    "termsAccepted": True,
                    "privacyAccepted": True,
                    "version": legal_version,
                    "acceptedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "web_auth_modal"
                }
            }
            user = db_store.create_user(new_user)
            await self._send_welcome_email(user)

        return user

    async def handle_google_code(self, code: str, terms_accepted: bool, privacy_accepted: bool, legal_version: str, device_key: str = "") -> Dict[str, Any]:
        client_id = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
        if not client_id or not client_secret:
            raise ValueError('Google OAuth belum dikonfigurasi di backend')
        if not code:
            raise ValueError('Google authorization code wajib diisi')

        token_request = urllib.request.Request(
            'https://oauth2.googleapis.com/token',
            data=urllib.parse.urlencode({
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'grant_type': 'authorization_code',
                'redirect_uri': 'postmessage'
            }).encode('utf-8'),
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            method='POST'
        )
        with urllib.request.urlopen(token_request, timeout=12) as response:
            token_data = json.loads(response.read().decode('utf-8'))
        raw_id_token = token_data.get('id_token')
        if not raw_id_token:
            raise ValueError('Google tidak mengembalikan identity token')
        payload = id_token.verify_oauth2_token(raw_id_token, google_requests.Request(), client_id)
        user = await self.handle_google_auth({
            'email': payload.get('email'),
            'name': payload.get('name'),
            'avatar': payload.get('picture'),
            'termsAccepted': terms_accepted,
            'privacyAccepted': privacy_accepted,
            'legalVersion': legal_version
        })
        if user.get('email'):
            await email_service.send_security_alert_email(
                str(user.get('id') or user.get('username')),
                user['email'],
                'Akun Google berhasil terhubung',
                datetime.now(timezone.utc).isoformat()
            )
        await self._check_new_device(user, device_key)
        return user

    async def handle_password_auth(self, email: str, password: str, terms_accepted: bool, privacy_accepted: bool, legal_version: str, device_key: str = "") -> Dict[str, Any]:
        clean_email = (email or '').lower().strip()
        if not clean_email or not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', clean_email):
            raise ValueError('Email tidak valid')
        if not password or len(password) < 8:
            raise ValueError('Password minimal 8 karakter')

        user = db_store.find_user_by_email(clean_email)
        if user:
            password_hash = user.get('password_hash')
            if not password_hash or not bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8')):
                raise ValueError('Email atau password salah')
            await self._check_new_device(user, device_key)
            return user

        if not terms_accepted or not privacy_accepted:
            raise ValueError('Persetujuan Terms & Conditions dan Privacy Policy wajib untuk membuat akun')
        username = re.sub(r'[^a-z0-9_]', '_', clean_email.split('@')[0])
        username = username or 'trader'
        if db_store.find_user_by_username(username):
            username = f'{username}_{hashlib.sha256(clean_email.encode("utf-8")).hexdigest()[:8]}'
        user = db_store.create_user({
            'id': f'user-{username}',
            'username': username,
            'display_name': username,
            'email': clean_email,
            'password_hash': bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
            'bio': 'trader baru scrolic',
            'role': 'user',
            'premium': False,
            'subscription_tier': 'free',
            'strategy_dna': 'breakout',
            'primary_strategy_id': 'breakout',
            'legal_consents': {
                'termsAccepted': True,
                'privacyAccepted': True,
                'version': legal_version,
                'acceptedAt': datetime.now(timezone.utc).isoformat(),
                'source': 'web_auth_modal'
            }
        })
        await self._send_welcome_email(user)
        return user

    async def verify_email(self, raw_token: str) -> Dict[str, Any]:
        record = self._consume_email_token(raw_token, "verification")
        user = db_store.find_user_by_id_or_username(str(record.get("user_id")))
        if not user:
            raise ValueError("Akun tidak ditemukan")
        now = datetime.now(timezone.utc)
        db_store.update_user(str(user.get("id") or user.get("username")), {
            "email_verified": True,
            "email_verified_at": now,
        })
        return user

    async def resend_verification(self, email: str):
        clean_email = (email or "").lower().strip()
        now = datetime.now(timezone.utc)
        recent = [stamp for stamp in self._verification_requests.get(clean_email, []) if (now - stamp).total_seconds() < 3600]
        self._verification_requests[clean_email] = recent
        if len(recent) >= 3:
            return
        self._verification_requests[clean_email].append(now)
        user = db_store.find_user_by_email(clean_email)
        if user and user.get("email") and not user.get("email_verified"):
            token = self._create_email_token(str(user.get("id")), "verification", 30)
            await email_service.send_registration_verification_email(str(user.get("id")), user["email"], token)

    async def request_password_reset(self, email: str):
        clean_email = (email or "").lower().strip()
        now = datetime.now(timezone.utc)
        recent = [stamp for stamp in self._reset_requests.get(clean_email, []) if (now - stamp).total_seconds() < 3600]
        self._reset_requests[clean_email] = recent
        if len(recent) >= 3:
            return
        self._reset_requests[clean_email].append(now)
        user = db_store.find_user_by_email(clean_email)
        if user and user.get("email"):
            token = self._create_email_token(str(user.get("id")), "reset_password", 30)
            await email_service.send_password_reset_email(str(user.get("id")), user["email"], token)

    async def reset_password(self, raw_token: str, new_password: str):
        if not new_password or len(new_password) < 8:
            raise ValueError("Password minimal 8 karakter")
        record = self._consume_email_token(raw_token, "reset_password")
        user = db_store.find_user_by_id_or_username(str(record.get("user_id")))
        if not user:
            raise ValueError("Akun tidak ditemukan")
        db_store.update_user(str(user.get("id") or user.get("username")), {
            "password_hash": bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        })
        if user.get("email"):
            await email_service.send_security_alert_email(
                str(user.get("id") or user.get("username")),
                user["email"],
                "Password berhasil diubah",
                datetime.now(timezone.utc).isoformat()
            )
        return user

    async def login(self, identifier: str) -> Optional[Dict[str, Any]]:
        clean = (identifier or "").lower().strip()
        if "@" in clean:
            by_email = db_store.find_user_by_email(clean)
            if by_email:
                return by_email
        return db_store.find_user_by_username(clean)

    async def register(self, body: Dict[str, Any]) -> Dict[str, Any]:
        if body.get("termsAccepted") is not True or body.get("privacyAccepted") is not True:
            raise ValueError("Persetujuan Terms & Conditions dan Privacy Policy wajib untuk membuat akun")
        username_raw = body.get("username", "trader")
        clean = re.sub(r"[^a-z0-9_]", "_", username_raw.lower())
        existing = db_store.find_user_by_username(clean)
        if existing:
            return existing

        strategy_id = body.get("strategyId", "breakout")
        new_user = {
            "id": f"user-{clean}",
            "username": clean,
            "display_name": body.get("displayName") or clean,
            "strategy_dna": strategy_id,
            "primary_strategy_id": strategy_id,
            "energy": 0,
            "referral_code": f"{clean.upper()}50"
        }
        return db_store.create_user(new_user)

auth_service = AuthService()
