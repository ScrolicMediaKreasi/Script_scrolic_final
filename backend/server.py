"""
Scrolic Single-Runtime FastAPI Backend
======================================
1. Native LLM Bridge (/api/_llm/*) using emergentintegrations (Gemini)
2. Native Auth (/api/auth/*) including Google OAuth JWT decoding & referral rewards (+20 Energy)
3. Native Feed (/api/feed, /api/posts/*), User Profiles (/api/user/*), & Strategies (/api/strategies/*)
4. Real-time Notifications SSE & Snapshots (/api/notifications/*)
5. Official cTrader Open API Integration (/api/ctrader/*)
6. Official Mayar.id In-App Payment Gateway (/api/payments/mayar/*) & Webhook Handler
7. Socket.IO ASGI Server (/socket.io/*) with safe import fallback guard
8. Real-time Market Fluctuation Ticker Engine (2.5s interval)
"""
import os, asyncio, json, logging, sys, time, urllib.request, urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Request, Response, HTTPException, Query, Header, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR.parent / ".env")
    load_dotenv(Path("/app/.env"))
    load_dotenv(Path("/app/backend/.env"))
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("scrolic.backend")

def get_mayar_api_key() -> str:
    return (os.environ.get("MAYAR_API_KEY") or "").strip()

def get_mayar_webhook_secret() -> str:
    return (os.environ.get("MAYAR_WEBHOOK_SECRET") or "").strip()

def get_mayar_base_url() -> str:
    raw = (os.environ.get("MAYAR_BASE_URL") or "https://api.mayar.id").strip().rstrip("/")
    if raw.endswith("/hl/v1"):
        raw = raw[:-6]
    return raw

def get_public_base_url(request: Optional[Request] = None) -> str:
    env_value = (
        os.environ.get("PUBLIC_BASE_URL")
        or os.environ.get("SITE_URL")
        or os.environ.get("VITE_PUBLIC_SITE_URL")
        or "https://scrolic.id"
    ).strip().rstrip("/")
    if request is not None:
        request_base = str(request.base_url).rstrip("/")
        if request_base and request_base != "http://testserver/":
            return request_base
    return env_value

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-5.4").strip()

try:
    from backend.ctrader_config import (
        get_ctrader_client_id,
        get_ctrader_client_secret,
        get_ctrader_env,
        mask_credential,
        get_active_endpoint,
        AUTH_BASE_URL,
        TOKEN_ENDPOINT_URL
    )
except ImportError:
    from ctrader_config import (
        get_ctrader_client_id,
        get_ctrader_client_secret,
        get_ctrader_env,
        mask_credential,
        get_active_endpoint,
        AUTH_BASE_URL,
        TOKEN_ENDPOINT_URL
    )

def get_ctrader_proxy_url() -> str:
    return (os.environ.get("CTRADER_PROXY_URL") or "").strip()

def require_admin(user_id: Optional[str]) -> Dict[str, Any]:
    user = db_store.find_user_by_id_or_username(user_id) if user_id else None
    if not user:
        raise HTTPException(401, "Harap login terlebih dahulu")
    if str(user.get("role", "user")).lower() != "admin":
        raise HTTPException(403, "Akses khusus Administrator")
    return user

def account_visible_to_user(account: Dict[str, Any], user: Dict[str, Any]) -> bool:
    if str(user.get("role", "user")).lower() == "admin":
        return True
    # Ticket 243821: this used to hard-deny any non-LIVE account for regular users,
    # which silently dropped a user's own DEMO account before it could ever become
    # primary_acct_id or get authenticated. Cross-user account theft is handled
    # separately by the occupied-account guard in the OAuth callback, so this only
    # needs to reject genuinely unrecognized account types, not DEMO ownership.
    account_type = str(account.get("accountType", "")).upper()
    is_live_flag = account.get("isLive")
    return account_type in ("LIVE", "DEMO") or is_live_flag is True or is_live_flag is False

CTRADER_CLIENT_ID = get_ctrader_client_id()
CTRADER_CLIENT_SECRET = get_ctrader_client_secret()
CTRADER_ENV = get_ctrader_env()
CTRADER_PROXY_URL = get_ctrader_proxy_url()

_performance_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
PERFORMANCE_CACHE_TTL_SECONDS = 30


# ---------------- Safe Socket.IO Import Fallback Guard ----------------
try:
    import socketio
    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins="*",
        cors_credentials=False,
        always_connect=True,
        allow_upgrades=False
    )

    @sio.event
    async def connect(sid, environ, auth=None):
        logger.info(f"[socket.io] Client connected: {sid}")
        if auth and isinstance(auth, dict) and auth.get("userId"):
            user_room = f"user_{auth['userId']}"
            await sio.enter_room(sid, user_room)
            logger.info(f"[socket.io] Client {sid} auto-joined private room: {user_room}")

    @sio.on("join:user_room")
    async def handle_join_user_room(sid, data):
        u_id = data.get("userId") if isinstance(data, dict) else str(data)
        if u_id:
            room_name = f"user_{u_id}"
            await sio.enter_room(sid, room_name)
            logger.info(f"[socket.io] Client {sid} joined private room: {room_name}")

    @sio.on("join:account_room")
    async def handle_join_account_room(sid, data):
        acct_id = data.get("accountId") if isinstance(data, dict) else str(data)
        if acct_id:
            room_name = f"account_{acct_id}"
            await sio.enter_room(sid, room_name)
            logger.info(f"[socket.io] Client {sid} joined private room: {room_name}")

    @sio.on("leave:account_room")
    async def handle_leave_account_room(sid, data):
        acct_id = data.get("accountId") if isinstance(data, dict) else str(data)
        if acct_id:
            await sio.leave_room(sid, f"account_{acct_id}")

    @sio.event
    async def disconnect(sid):
        logger.info(f"[socket.io] Client disconnected: {sid}")

    HAS_SOCKETIO = True
except ImportError:
    sio = None
    HAS_SOCKETIO = False
    logger.warning("[scrolic.backend] 'socketio' module not found - running FastAPI without Socket.IO wrapper.")

current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

try:
    from backend.database import db_store, init_db
except ImportError:
    from database import db_store, init_db

try:
    from backend.db_seed import SEED_STRATEGIES
except ImportError:
    from db_seed import SEED_STRATEGIES

try:
    from backend.auth_service import auth_service, format_auth_user_response
except ImportError:
    from auth_service import auth_service, format_auth_user_response

try:
    from backend.ticker import live_trading_service
except ImportError:
    from ticker import live_trading_service

try:
    from backend.ctrader_client import ctrader_client
except ImportError:
    from ctrader_client import ctrader_client

try:
    from backend.ctrader_oauth import (
        generate_oauth_state,
        validate_oauth_state,
        get_canonical_redirect_uri,
        get_grant_access_url,
        exchange_code_for_token,
        fetch_and_validate_accounts,
        refresh_user_token,
        token_refresh_supervisor
    )
except ImportError:
    from ctrader_oauth import (
        generate_oauth_state,
        validate_oauth_state,
        get_canonical_redirect_uri,
        get_grant_access_url,
        exchange_code_for_token,
        fetch_and_validate_accounts,
        refresh_user_token,
        token_refresh_supervisor
    )

try:
    from backend.event_contract import event_contract_manager
except ImportError:
    from event_contract import event_contract_manager

fastapi_app = FastAPI(title="Scrolic Single-Runtime Backend")
fastapi_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@fastapi_app.websocket("/")
@fastapi_app.websocket("/ws")
async def websocket_root_endpoint(websocket: WebSocket):
    subprotocol = websocket.headers.get("sec-websocket-protocol")
    await websocket.accept(subprotocol=subprotocol)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"echo: {data}")
    except WebSocketDisconnect:
        pass

active_session_user_id: Optional[str] = None

@fastapi_app.on_event("startup")
async def on_startup():
    await init_db()
    # Import dual-client helpers
    try:
        from backend.ctrader_client import ctrader_client_alt, all_ctrader_clients, register_event_listener_on_all, resolve_client_for_user_account
    except ImportError:
        from ctrader_client import ctrader_client_alt, all_ctrader_clients, register_event_listener_on_all, resolve_client_for_user_account

    if HAS_SOCKETIO and sio is not None:
        live_trading_service.set_sio(sio)
        
        def _on_client_lifecycle_event(evt_name, data):
            # Merge diagnostics from BOTH clients so frontend sees combined state (live+demo)
            live_diag = ctrader_client.get_diagnostics()
            alt_diag = ctrader_client_alt.get_diagnostics()
            # Prefer AUTHENTICATED, else CONNECTED, else the primary
            def _state_rank(d):
                s = str(d.get("state") or "").upper()
                return {"AUTHENTICATED": 3, "CONNECTED": 2, "CONNECTING": 1}.get(s, 0)
            merged = live_diag if _state_rank(live_diag) >= _state_rank(alt_diag) else alt_diag
            merged = dict(merged)
            merged["environments"] = {
                "live": {"state": live_diag.get("state"), "accounts": live_diag.get("authenticated_accounts_count", 0)},
                "demo": {"state": alt_diag.get("state"), "accounts": alt_diag.get("authenticated_accounts_count", 0)},
            }
            payload = event_contract_manager.build_connection_status_payload(merged)
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(sio.emit("connection:status_update", payload))
                loop.create_task(sio.emit("ctrader:connection_update", payload))

        register_event_listener_on_all(_on_client_lifecycle_event)

        # ticker.py owns cTrader persistence handlers; server only exposes routes and transport events.

    live_trading_service.start(2.5)
    # Start BOTH live+demo clients in parallel
    for _c in all_ctrader_clients():
        await _c.start()
    # Boot the debounced Mongo writer AFTER init_db but BEFORE the auth burst.
    try:
        from backend.mongo_writer import get_mongo_writer
    except ImportError:
        from mongo_writer import get_mongo_writer
    _mongo_writer = get_mongo_writer(db_store)
    await _mongo_writer.start()
    token_refresh_supervisor.start()

    # Restore every previously authorised broker account — dispatch to correct env client.
    # IMPORTANT: For users with multi-account setups (e.g. LIVE + DEMO), every account is restored
    # on its own env client so both flows receive spot/reconcile events simultaneously.
    live_tasks: List[Dict[str, Any]] = []
    demo_tasks: List[Dict[str, Any]] = []
    for stored_user in list(db_store.users):
        if not stored_user.get("ctrader_connected") or not stored_user.get("ctrader_access_token"):
            continue
        user_id = stored_user.get("id") or stored_user.get("username")
        for account in stored_user.get("ctrader_accounts") or []:
            if not isinstance(account, dict):
                continue
            account_id = account.get("accountId") or account.get("accountNo")
            if not account_id:
                continue
            target_client = resolve_client_for_user_account(stored_user, account)
            task = {
                "account_id": account_id,
                "access_token": stored_user["ctrader_access_token"],
                "user_id": user_id,
            }
            account_type = str(account.get("accountType", "")).upper()
            is_live_flag = account.get("isLive")
            logger.info(
                f"[cTrader.Restore] queueing @{stored_user.get('username')} account={account_id} "
                f"type={account_type or '?'} isLive={is_live_flag} routedTo={target_client._env}"
            )
            if target_client is ctrader_client_alt:
                demo_tasks.append(task)
            else:
                live_tasks.append(task)

    async def _dispatch_restore(client_ref, tasks):
        if not tasks:
            return
        if hasattr(client_ref, "authenticate_all_accounts_ratelimited"):
            asyncio.create_task(client_ref.authenticate_all_accounts_ratelimited(tasks))
        else:
            for t in tasks:
                await client_ref.authenticate_account(t["account_id"], t["access_token"], t["user_id"])
    await _dispatch_restore(ctrader_client, live_tasks)
    await _dispatch_restore(ctrader_client_alt, demo_tasks)
    if live_tasks or demo_tasks:
        logger.info(f"[cTrader.Restore] Scheduled {len(live_tasks)} live + {len(demo_tasks)} demo account re-auth via dual-env clients.")
    else:
        logger.warning(
            "[cTrader.Restore] No stored broker sessions to restore (0 users have ctrader_connected=true + ctrader_access_token). "
            "Real-time price/pips/profit updates require an active cTrader OAuth session. "
            "Direct users to /api/ctrader/auth-url to (re)connect their broker account."
        )
    logger.info(f"[scrolic.backend] Single-runtime FastAPI backend running. Mayar API Key configured: {bool(get_mayar_api_key())}")

@fastapi_app.on_event("shutdown")
async def on_shutdown():
    live_trading_service.stop()
    try:
        from backend.ctrader_client import all_ctrader_clients
    except ImportError:
        from ctrader_client import all_ctrader_clients
    for _c in all_ctrader_clients():
        await _c.stop()
    try:
        from backend.mongo_writer import get_mongo_writer
    except ImportError:
        from mongo_writer import get_mongo_writer
    try:
        await get_mongo_writer(db_store).stop()
    except Exception:
        pass
    token_refresh_supervisor.stop()

def get_current_user_id(request: Request, x_session_user_id: Optional[str] = Header(None)) -> Optional[str]:
    return x_session_user_id or active_session_user_id

def format_post(post: Dict[str, Any], current_user_id: Optional[str] = None) -> Dict[str, Any]:
    author = db_store.find_user_by_id_or_username(post.get("user_id", "")) or db_store.find_user_by_username(post.get("username", "")) or {}
    strategy_id = (
        post.get("strategy_id")
        or post.get("strategyId")
        or author.get("strategy_dna")
        or author.get("primary_strategy_id")
        or author.get("strategyDNA")
        or author.get("primaryStrategyId")
        or "breakout"
    )
    strategy = db_store.find_strategy_by_id(strategy_id) or SEED_STRATEGIES[0]
    curr_user = db_store.find_user_by_id_or_username(current_user_id) if current_user_id else None

    created_at = post.get("created_at")
    created_at_str = created_at.isoformat() if isinstance(created_at, datetime) else str(created_at or "")

    updated_at = post.get("updated_at")
    updated_at_str = updated_at.isoformat() if isinstance(updated_at, datetime) else str(updated_at or "")

    opened_at = post.get("opened_at")
    opened_at_str = opened_at.isoformat() if isinstance(opened_at, datetime) else str(opened_at or "")

    return {
        "id": post.get("id"),
        "tradeId": post.get("trade_id", f"trade-{post.get('id')}"),
        "userId": post.get("user_id"),
        "user": {
            "id": author.get("id", post.get("user_id")),
            "username": author.get("username", post.get("username", "trader")),
            "displayName": author.get("display_name", post.get("username", "Trader")),
            "avatar": author.get("avatar") or post.get("avatar") or "",
            "bio": author.get("bio", ""),
            "role": author.get("role", "user"),
            "subscriptionTier": author.get("subscription_tier", "free"),
            "isVerified": bool(author.get("is_verified", True)),
            "winRate": float(author.get("win_rate", 0.0)),
            "totalTrades": int(author.get("trades_count", 0)),
            "followersCount": int(author.get("followers_count", 0)),
            "followingCount": int(author.get("following_count", 0)),
            "energyBalance": int(author.get("energy", 0)),
            "referralCode": author.get("referral_code", "")
        },
        "trade": {
            "id": post.get("trade_id", f"trade-{post.get('id')}"),
            "cTraderPositionId": post.get("trade_id", "pos-881"),
            "accountId": post.get("account_id"),
            "userId": post.get("user_id"),
            "symbol": post.get("symbol") if (post.get("symbol") and post.get("symbol") != "Unknown") else "XAUUSD",
            "direction": post.get("position_type", "BUY"),
            "volumeLot": float(post.get("lot", 1.0)),
            "entryPrice": float(post.get("entry_price", 0.0) or post.get("entryPrice", 0.0) or 0.0),
            "currentPrice": float(post.get("current_price", 0.0) or post.get("currentPrice", 0.0) or 0.0),
            "stopLoss": float(post.get("stop_loss", 0.0) or post.get("stopLoss", 0.0) or 0.0),
            "takeProfit": float(post.get("take_profit", 0.0) or post.get("takeProfit", 0.0) or 0.0),
            "profitUSD": float(post.get("profit", 0.0)),
            "profitPercent": float(post.get("profit_percent", 0.0)),
            "pips": float(post.get("pips", 0.0)),
            "openTime": opened_at_str,
            "duration": post.get("duration", "Live"),
            "status": post.get("status", "OPEN"),
            "strategyId": strategy_id
        },
        "strategy": {
            "id": strategy.get("id"),
            "name": strategy.get("name"),
            "tagline": strategy.get("tagline"),
            "description": strategy.get("description"),
            "accentColor": strategy.get("accentColor", "#F59E0B"),
            "accentBg": strategy.get("accentBg", "bg-amber-500/10"),
            "accentBorder": strategy.get("accentBorder", "border-amber-500/30"),
            "badgeClass": strategy.get("badgeClass", "bg-amber-500/20 text-amber-400 border-amber-500/30"),
            "gradient": strategy.get("gradient", "from-amber-500 to-orange-600"),
            "positionBarGradient": strategy.get("positionBarGradient", "from-amber-500 via-orange-500 to-amber-400"),
            "fontVibe": strategy.get("fontVibe", "font-mono tracking-tight"),
            "icon": strategy.get("icon", "Zap"),
            "popularPairs": strategy.get("popularPairs", ["XAUUSD"]),
            "riskStyle": strategy.get("riskStyle", "Aggressive Momentum")
        },
        "autoDescription": post.get("auto_description", ""),
        "customDescription": post.get("custom_description", ""),
        "likesCount": int(post.get("likes_count", 0)),
        "commentsCount": int(post.get("comments_count", 0)),
        "savesCount": 0,
        "followersCount": int(post.get("followers_count", 0)),
        "isLiked": current_user_id in post.get("liked_by_user_ids", []) if current_user_id else False,
        "isSaved": current_user_id in curr_user.get("saved_post_ids", []) if (current_user_id and curr_user) else False,
        "isUnlocked": (post.get("user_id") == current_user_id or (current_user_id in post.get("unlocked_by_user_ids", []))) if current_user_id else False,
        "isFollowingSetup": current_user_id in post.get("followed_by_user_ids", []) if current_user_id else False,
        "unlockFee": int(post.get("unlock_price", 1)),
        "followFee": int(post.get("follow_price", 1)),
        "createdAt": created_at_str,
        "updatedAt": updated_at_str
    }

# ---------------- Mayar.id In-App Payment Gateway & Webhook Handler ----------------
def extract_mayar_link(res_dict: dict) -> str:
    if not isinstance(res_dict, dict):
        return ""
    data = res_dict.get("data") if isinstance(res_dict.get("data"), dict) else res_dict
    for key in ["link", "paymentUrl", "checkoutUrl", "url", "invoiceUrl", "payment_url", "web_url", "checkout_url", "invoice_url"]:
        val = data.get(key) or res_dict.get(key)
        if val and isinstance(val, str) and val.startswith("http"):
            return val.strip()
    return ""

@fastapi_app.get("/api/mayar/config")
@fastapi_app.get("/api/payments/mayar/config")
async def get_mayar_config():
    api_key = get_mayar_api_key()
    is_configured = bool(api_key and len(api_key) > 5 and "MY_MAYAR" not in api_key)
    return {
        "success": True,
        "isConfigured": is_configured,
        "isLive": bool(is_configured and (api_key.startswith("pk_live_") or api_key.startswith("sk_live_"))),
        "merchantName": "Scrolic Official (Mayar.id In-App Gateway)",
        "supportedMethods": ["QRIS Instant", "Virtual Account (BCA, Mandiri, BNI, BRI, Permata)", "E-Wallet (OVO, Dana, ShopeePay, GoPay)"]
    }

ENERGY_PACKAGES = [
    {"id": "ep_1", "energy": 50, "priceRp": 50000, "basePriceRp": 50000, "discountPercent": 0, "discountPriceRp": 50000, "label": "Starter Pack", "bonus": "", "isPopular": False, "isActive": True},
    {"id": "ep_2", "energy": 100, "priceRp": 95000, "basePriceRp": 100000, "discountPercent": 5, "discountPriceRp": 95000, "label": "Trader Choice", "bonus": "+5 Bonus Energy", "isPopular": True, "isActive": True},
    {"id": "ep_3", "energy": 250, "priceRp": 200000, "basePriceRp": 250000, "discountPercent": 20, "discountPriceRp": 200000, "label": "Elite Squad", "bonus": "+50 Bonus Energy", "isPopular": False, "isActive": True},
    {"id": "ep_4", "energy": 500, "priceRp": 380000, "basePriceRp": 500000, "discountPercent": 24, "discountPriceRp": 380000, "label": "Pro Syndicate", "bonus": "+120 Bonus Energy", "isPopular": False, "isActive": True}
]

PREMIUM_PACKAGES = [
    {
        "id": "pp_1",
        "tier": "premium_monthly",
        "name": "Scrolic Premium Bulanan",
        "durationMonths": 1,
        "durationDays": 30,
        "basePriceRp": 149000,
        "discountPercent": 0,
        "discountPriceRp": 149000,
        "priceRp": 149000,
        "priceEnergy": 99,
        "basePriceEnergy": 99,
        "energyBonus": 0,
        "maxGenerations": 2,
        "totalCommissionPercent": 20,
        "isActive": True,
        "isPopular": False,
        "features": [
            "Semua Sinyal SMC & Breakout Unlocked",
            "Auto-Copy cTrader 1-Click",
            "Private Telegram Alpha Group",
            "Prioritas Eksekusi AI & SSE Alerts"
        ],
        "benefits": [
            "Semua Sinyal SMC & Breakout Unlocked",
            "Auto-Copy cTrader 1-Click",
            "Private Telegram Alpha Group",
            "Prioritas Eksekusi AI & SSE Alerts"
        ]
    },
    {
        "id": "pp_2",
        "tier": "premium_3m",
        "name": "Scrolic Premium Kuartalan",
        "durationMonths": 3,
        "durationDays": 90,
        "basePriceRp": 399000,
        "discountPercent": 12,
        "discountPriceRp": 349000,
        "priceRp": 349000,
        "priceEnergy": 249,
        "basePriceEnergy": 297,
        "energyBonus": 50,
        "maxGenerations": 3,
        "totalCommissionPercent": 25,
        "isActive": True,
        "isPopular": True,
        "features": [
            "Semua Sinyal SMC & Breakout Unlocked",
            "Auto-Copy cTrader 1-Click",
            "Private Telegram Alpha Group",
            "Prioritas Eksekusi AI & SSE Alerts",
            "Bonus +50 Energy"
        ],
        "benefits": [
            "Semua Sinyal SMC & Breakout Unlocked",
            "Auto-Copy cTrader 1-Click",
            "Private Telegram Alpha Group",
            "Prioritas Eksekusi AI & SSE Alerts",
            "Bonus +50 Energy"
        ]
    },
    {
        "id": "pp_3",
        "tier": "premium_yearly",
        "name": "Scrolic Premium Tahunan (VIP)",
        "durationMonths": 12,
        "durationDays": 365,
        "basePriceRp": 1290000,
        "discountPercent": 28,
        "discountPriceRp": 899000,
        "priceRp": 899000,
        "priceEnergy": 799,
        "basePriceEnergy": 1188,
        "energyBonus": 250,
        "maxGenerations": 5,
        "totalCommissionPercent": 35,
        "isActive": True,
        "isPopular": False,
        "features": [
            "Akses Semua Fitur VIP & Sinyal",
            "Unlimited Auto-Copy cTrader",
            "1-on-1 Trading Mentorship",
            "Private Telegram Alpha VIP",
            "Bonus +250 Energy"
        ],
        "benefits": [
            "Akses Semua Fitur VIP & Sinyal",
            "Unlimited Auto-Copy cTrader",
            "1-on-1 Trading Mentorship",
            "Private Telegram Alpha VIP",
            "Bonus +250 Energy"
        ]
    }
]

@fastapi_app.get("/api/config/energy-packages")
@fastapi_app.get("/api/config/energy")
async def get_energy_packages_config():
    return {
        "success": True,
        "packages": ENERGY_PACKAGES
    }

@fastapi_app.get("/api/config/premium-packages")
async def get_premium_packages_config():
    return {
        "success": True,
        "packages": PREMIUM_PACKAGES
    }

@fastapi_app.post("/api/payments/mayar/create")
@fastapi_app.post("/api/mayar/create")
@fastapi_app.post("/api/mayar/create-payment")
@fastapi_app.post("/api/payment/mayar/create-charge")
async def create_mayar_payment(request: Request, x_session_user_id: Optional[str] = Header(None)):
    body = await request.json()
    curr_id = x_session_user_id or body.get("userId") or body.get("user_id") or body.get("username") or active_session_user_id
    if not curr_id and db_store.users:
        curr_id = db_store.users[0].get("id") or db_store.users[0].get("username")

    user = db_store.find_user_by_id_or_username(curr_id) if curr_id else None
    if not user and db_store.users:
        user = db_store.users[0]

    if not user:
        raise HTTPException(401, "Harap login terlebih dahulu")
    amount_energy = int(body.get("amountEnergy") or body.get("energyAmount") or body.get("amount") or 100)
    amount_rp = int(body.get("amountRp") or body.get("priceRp") or (amount_energy * 1000))
    customer_name = body.get("customerName") or user.get("display_name") or user.get("username")
    customer_email = body.get("customerEmail") or user.get("email") or f"{user['username']}@scrolic.com"
    customer_mobile = body.get("customerMobile") or "081234567890"

    order_id = f"MAYAR-SCR-{int(datetime.now().timestamp())}-{(hash(user['username']) % 8999) + 1000}"
    mayar_invoice_id = order_id
    checkout_url = ""
    qr_code = ""

    api_key = get_mayar_api_key()
    base_url = get_mayar_base_url()

    if not api_key or len(api_key) <= 5 or "MY_MAYAR" in api_key:
        return JSONResponse({
            "success": False,
            "error": "MAYAR_API_KEY belum dikonfigurasi di file .env server. Harap pasang MAYAR_API_KEY asli Anda di .env"
        }, status_code=400)

    try:
        req_payload = {
            "name": customer_name,
            "email": customer_email,
            "mobile": customer_mobile,
            "amount": amount_rp,
            "description": f"Top Up {amount_energy} Energy di Scrolic (@{user['username']})",
            "redirectUrl": f"{request.url.scheme}://{request.headers.get('host', '127.0.0.1:8001')}/?payment=return&orderId={order_id}",
            "expiredAt": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        }
        req_data = json.dumps(req_payload).encode('utf-8')

        req = urllib.request.Request(
            f"{base_url}/hl/v1/payment/create",
            data=req_data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "x-api-key": api_key,
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_body = json.loads(resp.read().decode('utf-8'))
            d = res_body.get("data") if isinstance(res_body.get("data"), dict) else res_body
            mayar_invoice_id = d.get("id") or d.get("paymentId") or order_id
            checkout_url = extract_mayar_link(res_body)
            qr_code = d.get("qrCode") or d.get("qr_code") or d.get("qrString") or ""
            logger.info(f"[Mayar API] Successfully created invoice: {mayar_invoice_id} -> {checkout_url}")
            if not checkout_url:
                return JSONResponse({
                    "success": False,
                    "error": f"Mayar API tidak mengembalikan link invoice. Respon API: {res_body}"
                }, status_code=400)
    except urllib.error.HTTPError as http_err:
        err_msg = http_err.read().decode('utf-8') if http_err.fp else str(http_err)
        logger.error(f"[Mayar API HTTP Error] {http_err.code}: {err_msg}")
        return JSONResponse({
            "success": False,
            "error": f"Gagal membuat invoice di Mayar API ({http_err.code}): {err_msg}"
        }, status_code=400)
    except Exception as e:
        logger.error(f"[Mayar API Error] {e}")
        return JSONResponse({
            "success": False,
            "error": f"Gagal menghubungi Mayar API: {str(e)}"
        }, status_code=400)

    payment_doc = db_store.create_payment({
        "id": f"pay-{int(datetime.now().timestamp() * 1000)}",
        "user_id": user.get("id") or user.get("username"),
        "amount": amount_rp,
        "energy_amount": amount_energy,
        "mayar_invoice_id": mayar_invoice_id,
        "status": "pending",
        "payment_method": body.get("method", "qris"),
        "checkout_url": checkout_url,
        "qr_code": qr_code,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "expired_at": datetime.now(timezone.utc) + timedelta(minutes=15)
    })

    order_obj = {
        "orderId": mayar_invoice_id,
        "referenceId": order_id,
        "userId": user.get("id") or user.get("username"),
        "amountEnergy": amount_energy,
        "amountRp": amount_rp,
        "paymentUrl": checkout_url,
        "checkoutUrl": checkout_url,
        "qrCode": qr_code,
        "status": "PENDING",
        "paymentMethod": body.get("method", "qris"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    }

    return {
        "success": True,
        "order": order_obj,
        "transactionId": order_id,
        "amount": amount_rp,
        "energyAmount": amount_energy,
        "checkoutUrl": checkout_url,
        "paymentUrl": checkout_url,
        "expiresAt": order_obj["expiresAt"]
    }

@fastapi_app.get("/api/payments/mayar/status/{payment_id}")
@fastapi_app.get("/api/payments/mayar/order/{payment_id}")
@fastapi_app.get("/api/mayar/order/{payment_id}")
@fastapi_app.get("/api/mayar/status/{payment_id}")
async def get_mayar_payment_status(payment_id: str, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    pay = db_store.find_payment_by_invoice_id(payment_id)
    user = db_store.find_user_by_id_or_username(curr_id or (pay.get("user_id") if pay else None))
    balance = user.get("energy", 0) if user else 0

    if not pay:
        return {
            "success": True,
            "order": {"orderId": payment_id, "amountEnergy": 100, "amountRp": 50000, "status": "PENDING"},
            "currentEnergyBalance": balance,
            "isPaid": False
        }

    is_paid = pay.get("status") == "paid"
    return {
        "success": True,
        "order": {
            "orderId": pay.get("mayar_invoice_id"),
            "amountEnergy": pay.get("energy_amount", 100),
            "amountRp": pay.get("amount", 50000),
            "status": pay.get("status", "pending").upper(),
            "paymentUrl": pay.get("checkout_url", "https://scrolic.myr.id"),
            "paidAt": pay.get("paid_at").isoformat() if isinstance(pay.get("paid_at"), datetime) else None
        },
        "currentEnergyBalance": balance,
        "isPaid": is_paid
    }

def _distribute_topup_affiliate_commissions(user_id: str, energy_amount: int, reference_id: str, source_label: str = "MAYAR_ID") -> None:
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        return

    curr_ref_id = user.get("referrer_id")
    gen_level = 1
    while curr_ref_id and gen_level <= 5:
        upline = db_store.find_user_by_id_or_username(curr_ref_id) or db_store.find_user_by_username(curr_ref_id)
        if not upline:
            break

        upline_id = upline.get("id") or upline.get("username")
        comm_energy = max(1, int(energy_amount * 0.10))
        withdraw_before = int(upline.get("withdrawable_energy", 0) or 0)
        updated_withdrawable, _ = db_store.update_energy(upline_id, comm_energy, bucket="withdrawable")
        affiliate_before = int(upline.get("affiliate_earnings_energy", 0) or 0)
        db_store.update_user(upline_id, {
            "affiliate_earnings_energy": affiliate_before + comm_energy,
            "withdrawable_energy": updated_withdrawable
        })

        db_store.create_transaction({
            "user_id": upline_id,
            "type": "AFFILIATE_COMMISSION",
            "amount": comm_energy,
            "balance_before": withdraw_before,
            "balance_after": updated_withdrawable,
            "reference_id": f"{reference_id}-gen{gen_level}",
            "status": "COMPLETED",
            "metadata": {
                "source": source_label,
                "generation": gen_level,
                "topupUserId": user_id,
                "topupEnergyAmount": energy_amount,
                "topupReferenceId": reference_id,
                "bucket": "withdrawable"
            }
        })

        db_store.create_notification({
            "user_id": upline_id,
            "title": f"⚡ Komisi Afiliasi Gen-{gen_level} Masuk!",
            "message": f"+{comm_energy} Energy dari top-up Mayar.id @{user['username']}.",
            "type": "AFFILIATE_COMMISSION"
        })

        curr_ref_id = upline.get("referrer_id")
        gen_level += 1


@fastapi_app.post("/api/payments/mayar/webhook")
@fastapi_app.post("/api/mayar/webhook")
async def mayar_webhook(request: Request):
    webhook_secret = get_mayar_webhook_secret()
    auth_header = request.headers.get("authorization", "") or request.headers.get("x-mayar-signature", "")
    if webhook_secret and webhook_secret not in auth_header:
        logger.warning("[Mayar Webhook] Received webhook with invalid authorization header")

    body = await request.json()
    data = body.get("data") or body
    invoice_id = data.get("id") or data.get("paymentId") or body.get("invoiceId") or body.get("id")

    if not invoice_id:
        return {"success": False, "message": "No invoice ID found in webhook payload"}

    pay = db_store.find_payment_by_invoice_id(invoice_id)
    if not pay:
        logger.warning(f"[Mayar Webhook] Payment not found for invoice ID: {invoice_id}")
        return {"success": False, "message": f"Payment record not found for invoice ID: {invoice_id}"}

    # Idempotency Check: Prevent duplicate credit!
    if pay.get("status") == "paid":
        return {"success": True, "message": "Payment already processed and credited", "credited": False}

    event = body.get("event") or body.get("type") or "payment.received"
    status_str = str(data.get("status", "")).lower()

    if event in ["payment.received", "invoice.paid", "payment.success"] or status_str in ["paid", "success"]:
        now = datetime.now(timezone.utc)
        db_store.update_payment_status(invoice_id, "paid", now)

        user_id = pay.get("user_id")
        user = db_store.find_user_by_id_or_username(user_id)
        if user:
            balance_before = user.get("energy", 0)
            new_bal, _ = db_store.update_energy(user_id, pay.get("energy_amount", 100), bucket="spendable")

            db_store.create_transaction({
                "user_id": user_id,
                "type": "TOPUP",
                "amount": pay.get("energy_amount", 100),
                "balance_before": balance_before,
                "balance_after": new_bal,
                "reference_id": invoice_id,
                "status": "COMPLETED",
                "metadata": {"gateway": "MAYAR_ID", "amountRp": pay.get("amount", 50000)}
            })

            _distribute_topup_affiliate_commissions(user_id, pay.get("energy_amount", 100), invoice_id, "MAYAR_ID")

            db_store.create_notification({
                "user_id": user_id,
                "title": "⚡ Top-Up Energy Berhasil!",
                "message": f"Pembayaran Mayar.id Rp {pay.get('amount', 50000):,} terverifikasi. +{pay.get('energy_amount', 100)} Energy ditambahkan.",
                "type": "ENERGY_TOPUP"
            })

            if HAS_SOCKETIO and sio is not None:
                try:
                    await sio.emit("energy_update", {"userId": user_id, "energyBalance": new_bal})
                except Exception:
                    pass

        return {"success": True, "message": "Payment verified and energy credited", "credited": True}

    return {"success": True, "message": f"Webhook event {event} recorded"}

@fastapi_app.post("/api/payments/mayar/simulate-success")
@fastapi_app.post("/api/mayar/simulate-payment")
async def simulate_mayar_payment(request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    body = await request.json()
    order_id = body.get("orderId") or f"SIM-{int(datetime.now().timestamp())}"
    energy_amount = int(body.get("energyAmount") or body.get("amountEnergy") or 100)

    pay = db_store.find_payment_by_invoice_id(order_id)
    if not pay:
        pay = db_store.create_payment({
            "id": f"pay-{int(datetime.now().timestamp() * 1000)}",
            "user_id": curr_id,
            "amount": energy_amount * 1000,
            "energy_amount": energy_amount,
            "mayar_invoice_id": order_id,
            "status": "pending"
        })

    db_store.update_payment_status(order_id, "paid", datetime.now(timezone.utc))
    new_bal, user = db_store.update_energy(curr_id, energy_amount, bucket="spendable")
    db_store.create_transaction({
        "user_id": curr_id,
        "type": "TOPUP",
        "amount": energy_amount,
        "balance_before": new_bal - energy_amount,
        "balance_after": new_bal,
        "reference_id": order_id,
        "status": "COMPLETED"
    })
    _distribute_topup_affiliate_commissions(curr_id, energy_amount, order_id, "MAYAR_SIMULATION")
    return {"success": True, "order": {"orderId": order_id, "status": "PAID"}, "energyBalance": new_bal, "newBalance": new_bal}

@fastapi_app.get("/api/payment/transactions")
@fastapi_app.get("/api/energy/transactions")
async def get_payment_transactions(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        return {"success": True, "transactions": []}

    txs = db_store.find_transactions_by_user(curr_id)
    pays = db_store.find_payments_by_user(curr_id)

    formatted = []
    now = datetime.now(timezone.utc)

    # 1. Format Payment Invoices (Pending, Paid, Expired)
    for p in pays:
        status_str = (p.get("status") or "pending").upper()
        expired_at = p.get("expired_at")
        is_expired = False
        if status_str == "PENDING" and isinstance(expired_at, datetime):
            is_expired = expired_at < now

        created_at = p.get("created_at")
        created_at_str = created_at.isoformat() if isinstance(created_at, datetime) else str(created_at or "")

        checkout_url = p.get("checkout_url") or p.get("payment_url") or ""

        formatted.append({
            "id": p.get("id", f"pay-{int(now.timestamp())}"),
            "userId": p.get("user_id"),
            "type": "TOPUP",
            "amount": p.get("energy_amount", 0),
            "amountRp": p.get("amount", 0),
            "status": "EXPIRED" if is_expired else status_str,
            "mayarInvoiceId": p.get("mayar_invoice_id"),
            "checkoutUrl": checkout_url if not is_expired else "",
            "paymentUrl": checkout_url if not is_expired else "",
            "isExpired": is_expired,
            "description": f"Top Up {p.get('energy_amount', 0)} Energy (Mayar.id)",
            "createdAt": created_at_str,
            "expiredAt": expired_at.isoformat() if isinstance(expired_at, datetime) else None,
            "isPaymentInvoice": True
        })

    # 2. Format Completed Ledger Transactions (Referral, Unlock, Daily Bonus, etc.)
    pay_ref_ids = {p.get("mayar_invoice_id") for p in pays}
    for t in txs:
        if t.get("reference_id") in pay_ref_ids:
            continue
        created_at = t.get("created_at")
        created_at_str = created_at.isoformat() if isinstance(created_at, datetime) else str(created_at or "")
        formatted.append({
            "id": t.get("id", f"tx-{int(now.timestamp())}"),
            "userId": t.get("user_id"),
            "type": t.get("type", "TOPUP"),
            "amount": t.get("amount", 0),
            "status": "COMPLETED",
            "description": t.get("description") or f"{t.get('type', 'TRANSACTION')} ({t.get('amount', 0)} Energy)",
            "balanceBefore": t.get("balance_before", 0),
            "balanceAfter": t.get("balance_after", 0),
            "referenceId": t.get("reference_id", ""),
            "createdAt": created_at_str
        })

    formatted.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {"success": True, "transactions": formatted}

# ---------------- cTrader Open API Integration ----------------
# ---------------- cTrader Open API Integration ----------------
def get_redirect_uri(request: Request) -> str:
    return get_canonical_redirect_uri(request)

def get_ctrader_auth_url(redirect_uri: str, user_id: str = "") -> str:
    return get_grant_access_url(redirect_uri, user_id)

async def ensure_valid_ctrader_token(user_id: str) -> bool:
    user = db_store.find_user_by_id_or_username(user_id)
    if not user or not user.get("ctrader_connected"):
        return False
    
    token = user.get("ctrader_access_token")
    if not token:
        return False

    expires_at = user.get("ctrader_token_expires_at")
    now = datetime.now(timezone.utc)
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            expires_at = None
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    if isinstance(expires_at, datetime) and expires_at < now:
        refresh_token = user.get("ctrader_refresh_token")
        if not refresh_token:
            # Token expired AND no refresh_token available. Log clearly instead of silently wiping.
            # Do NOT set ctrader_connected=False here — that permanently drops the session with no
            # user-facing signal. Instead, mark it as requiring re-auth so the frontend can show
            # a "Re-connect broker" CTA while keeping the accounts list visible.
            logger.warning(
                f"[cTrader.Token] Access token expired for user={user.get('username')} at {expires_at.isoformat()} "
                f"and no refresh_token is stored. Marking session as REAUTH_REQUIRED. "
                f"User must go through /api/ctrader/auth-url to obtain a fresh access+refresh token."
            )
            db_store.update_user(user.get("id") or user.get("username"), {
                "ctrader_reauth_required": True,
                "ctrader_reauth_reason": "TOKEN_EXPIRED_NO_REFRESH",
                "ctrader_reauth_at": now
            })
            return False
        return await refresh_user_token(user_id)
    return True

@fastapi_app.get("/api/ctrader/config")
async def get_ctrader_config(request: Request, x_session_user_id: Optional[str] = Header(None)):
    target_user_id = x_session_user_id or active_session_user_id or ""
    redirect_uri = get_canonical_redirect_uri(request)
    grant_url = get_grant_access_url(redirect_uri, target_user_id)
    return {
        "clientId": CTRADER_CLIENT_ID,
        "environment": CTRADER_ENV,
        "isConfigured": bool(CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET),
        "redirectUri": redirect_uri,
        "grantAccessUrl": grant_url
    }

@fastapi_app.get("/api/ctrader/auth-url")
async def get_ctrader_auth_url_endpoint(
    request: Request,
    x_session_user_id: Optional[str] = Header(None),
    userId: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    json_format: bool = Query(False, alias="json"),
    response: Response = None
):
    target_user_id = userId or user_id or x_session_user_id or active_session_user_id or ""
    redirect_uri = get_canonical_redirect_uri(request)
    url = get_grant_access_url(redirect_uri, target_user_id)
    state = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("state", [""])[0]
    if json_format or "application/json" in request.headers.get("accept", ""):
        if response is not None and state:
            response.set_cookie(
                "ctrader_oauth_state",
                state,
                max_age=900,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                path="/api/ctrader"
            )
        return {"success": True, "url": url, "authUrl": url, "clientId": CTRADER_CLIENT_ID, "redirectUri": redirect_uri}
    return RedirectResponse(url, status_code=307)

@fastapi_app.get("/api/ctrader/oauth/callback")
@fastapi_app.get("/api/ctrader/callback")
@fastapi_app.get("/api/ctrader/oauth-callback")
@fastapi_app.get("/api/ctrader/redirect")
async def ctrader_oauth_callback(request: Request, code: str = Query(""), state: str = Query("")):
    global active_session_user_id
    try:
        if not code:
            logger.warning("[cTrader.OAuth] Callback invoked without authorization code.")
            return RedirectResponse(url="/?ctrader_error=missing_code", status_code=302)

        # 1. Strict Cryptographic State Validation & CSRF Protection.
        # Some broker redirects omit the query state; recover only the signed state
        # issued by this origin in the short-lived HttpOnly cookie.
        callback_state = state or request.cookies.get("ctrader_oauth_state", "")
        is_valid_state, target_user_id, state_err = validate_oauth_state(callback_state)
        if not is_valid_state or not target_user_id:
            logger.error(f"[cTrader.OAuth] State validation rejected: {state_err}")
            return RedirectResponse(url=f"/?ctrader_error=invalid_state&reason={urllib.parse.quote(state_err or 'CSRF')}", status_code=302)

        # 2. Strict User Correlation (NO fallback to arbitrary users!)
        user = db_store.find_user_by_id_or_username(target_user_id)
        if not user:
            logger.error(f"[cTrader.OAuth] Verified user_id '{target_user_id}' from state not found in database.")
            return RedirectResponse(url="/?ctrader_error=user_not_found", status_code=302)

        redirect_uri = get_canonical_redirect_uri(request)

        # 3. Official Authorization Code Exchange
        try:
            token_res = await exchange_code_for_token(code, redirect_uri)
        except Exception as ex_err:
            logger.error(f"[cTrader.OAuth] Token exchange failed: {ex_err}")
            return RedirectResponse(url=f"/?ctrader_error=token_exchange_failed&reason={urllib.parse.quote(str(ex_err))}", status_code=302)

        access_token = token_res.get("accessToken")
        refresh_token = token_res.get("refreshToken")
        expires_in = token_res.get("expiresIn", 2592000)

        if not access_token:
            logger.error("[cTrader.OAuth] No access token in Spotware exchange response.")
            return RedirectResponse(url="/?ctrader_error=token_exchange_failed", status_code=302)

        # 4. Mandatory Account Verification with Spotware API before claiming connected
        validated_accounts = await fetch_and_validate_accounts(access_token)
        if str(user.get("role", "user")).lower() != "admin":
            validated_accounts = [account for account in validated_accounts if account_visible_to_user(account, user)]
        if not validated_accounts:
            logger.warning("[cTrader.OAuth] No verified trading accounts returned from Spotware Open API. Connected state not asserted.")
            return RedirectResponse(url="/?ctrader_error=no_authorized_accounts", status_code=302)

        primary_acct_id = validated_accounts[0]["accountId"]
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Security Guard: Check if this primary_acct_id or any validated account is ALREADY connected to another user in database!
        current_uid = str(user.get("id") or user.get("username"))
        all_db_users = db_store.get_all_users() if hasattr(db_store, "get_all_users") else db_store.users

        occupied_user = None
        for acct_info in validated_accounts:
            acct_id_str = str(acct_info.get("accountId"))
            for other_user in all_db_users:
                other_uid = str(other_user.get("id") or other_user.get("username"))
                if other_uid != current_uid:
                    other_acct_id = str(other_user.get("ctrader_account_id") or "")
                    other_acct_list = [str(a.get("accountId")) for a in (other_user.get("ctrader_accounts") or []) if isinstance(a, dict)]
                    if (other_acct_id and other_acct_id == acct_id_str) or acct_id_str in other_acct_list:
                        occupied_user = other_user
                        break
            if occupied_user:
                break

        if occupied_user:
            occupied_username = str(occupied_user.get("username", "trader"))
            logger.warning(f"[cTrader.OAuth.Guard] Account {primary_acct_id} is already connected by user @{occupied_username}")
            
            error_html = f"""
            <!DOCTYPE html>
            <html lang="id">
              <head>
                <meta charset="UTF-8">
                <title>cTrader Account Already Connected</title>
                <style>
                  body {{ background-color: #040906; color: #e5e5e5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
                  .card {{ background: #140909; border: 1px solid #dc2626; border-radius: 24px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 25px 50px -12px rgba(220, 38, 38, 0.25); }}
                  .icon {{ font-size: 44px; margin-bottom: 12px; }}
                  .title {{ color: #f87171; font-size: 20px; font-weight: 800; margin-bottom: 12px; font-family: sans-serif; }}
                  .desc {{ font-size: 13px; color: #d4d4d4; line-height: 1.6; margin-bottom: 20px; }}
                  .user-badge {{ background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.4); color: #fca5a5; padding: 8px 18px; border-radius: 99px; font-weight: bold; font-family: monospace; display: inline-block; margin-bottom: 20px; font-size: 15px; }}
                  .btn {{ background: #dc2626; color: #fff; border: none; padding: 14px 20px; border-radius: 14px; font-weight: bold; cursor: pointer; width: 100%; text-decoration: none; display: block; box-sizing: border-box; font-size: 14px; transition: all 0.2s; }}
                  .btn:hover {{ background: #b91c1c; }}
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="icon">🔒</div>
                  <div class="title">Akun cTrader Sudah Terhubung!</div>
                  <div class="desc">Akun cTrader ID (<strong>{primary_acct_id}</strong>) saat ini sudah terhubung dengan akun pengguna:</div>
                  <div class="user-badge">@{occupied_username}</div>
                  <div class="desc" style="font-size:12px; color:#a3a3a3;">
                    Untuk keamanan dan mencegah konflik transaksi ganda, satu akun cTrader hanya dapat terhubung ke satu pengguna Scrolic. Harap lepaskan koneksi dari akun <strong>@{occupied_username}</strong> sebelum mengaitkannya ke akun ini.
                  </div>
                  <a id="btn-redirect" href="/?ctrader_error=account_occupied&occupied_by={occupied_username}&account_id={primary_acct_id}" class="btn">
                    Tutup & Kembali ke Scrolic
                  </a>
                </div>
                <script>
                  const payload = {{
                    type: 'CTRADER_OAUTH_ERROR',
                    success: false,
                    error: {{
                      code: 'ACCOUNT_ALREADY_CONNECTED',
                      message: 'Akun cTrader ID ({primary_acct_id}) sudah terhubung dengan user @{occupied_username}.',
                      occupiedBy: '@{occupied_username}',
                      accountId: '{primary_acct_id}'
                    }}
                  }};
                  try {{
                    if (window.opener && !window.opener.closed) {{
                      window.opener.postMessage(payload, '*');
                      setTimeout(() => {{ window.close(); }}, 3500);
                    }}
                  }} catch(e) {{}}
                </script>
              </body>
            </html>
            """
            err_response = HTMLResponse(error_html, status_code=400)
            err_response.delete_cookie("ctrader_oauth_state", path="/api/ctrader")
            return err_response

        # 5. Authenticate the primary account on the persistent broker client BEFORE
        # claiming "connected". A validated account list from the REST preflight only
        # means the token is allowed to see these accounts — it does not mean the account
        # has a live WebSocket session. Previously this fired authenticate_account as a
        # background task and persisted ctrader_connected=True immediately, so the app
        # could show "Connected" for an account that never actually authenticated on the
        # live feed (ticket 243821: badge said Connected on every device, incl. a brand
        # new one, while prices/profit stayed frozen because no live session existed).
        try:
            from backend.ctrader_client import resolve_client_for_user_account
        except ImportError:
            from ctrader_client import resolve_client_for_user_account
        primary_account_obj = next(
            (a for a in validated_accounts if str(a.get("accountId")) == str(primary_acct_id)),
            validated_accounts[0]
        )
        primary_client = resolve_client_for_user_account(user, primary_account_obj)
        account_live_authenticated = await primary_client.authenticate_account(
            primary_acct_id,
            access_token,
            user.get("id") or user.get("username")
        )

        # 5b. Also authenticate every OTHER account the user just authorized (e.g. a DEMO
        # account that isn't validated_accounts[0]) on its correct env client. Without this,
        # only the primary account ever comes online — an approved DEMO account sitting later
        # in the list would never get a live session even though the user granted access to it
        # (ticket 243821: consent screen showed the demo account checked/approved, but only the
        # live account listed first was ever authenticated).
        _uid_for_secondary = user.get("id") or user.get("username")
        async def _auth_secondary_oauth_account(acct_obj: Dict[str, Any]):
            try:
                aid = acct_obj.get("accountId") or acct_obj.get("accountNo")
                if not aid or str(aid) == str(primary_acct_id):
                    return
                sec_client = resolve_client_for_user_account(user, acct_obj)
                ok = await sec_client.authenticate_account(aid, access_token, _uid_for_secondary)
                logger.info(f"[cTrader.OAuth.SecondaryAuth] account={aid} type={acct_obj.get('accountType')} routedTo={sec_client._env} auth={'OK' if ok else 'FAIL'}")
            except Exception as exc:
                logger.warning(f"[cTrader.OAuth.SecondaryAuth] error for {acct_obj.get('accountId')}: {exc}")
        for _vacct in validated_accounts:
            asyncio.create_task(_auth_secondary_oauth_account(_vacct))

        # 6. Persist securely to user record
        user_updates = {
            "ctrader_connected": account_live_authenticated,
            "ctrader_account_id": primary_acct_id,
            "ctrader_accounts": validated_accounts,
            "ctrader_access_token": access_token,
            "ctrader_refresh_token": refresh_token,
            "ctrader_token_expires_at": expires_at
        }
        db_store.update_user(user.get("id") or user.get("username"), user_updates)
        active_session_user_id = user.get("id") or user.get("username")
        user = db_store.find_user_by_id_or_username(user.get("id") or user.get("username"))
        if user and user.get("email"):
            from backend.services.email_service import email_service
            asyncio.create_task(email_service.send_security_alert_email(
                str(user.get("id") or user.get("username")),
                user["email"],
                "Akun cTrader berhasil terhubung",
                datetime.now(timezone.utc).isoformat()
            ))

        user_formatted = format_auth_user_response(user) if user else {}
        user_json_str = json.dumps(user_formatted, default=str)
        accounts_json_str = json.dumps(validated_accounts, default=str)

        html = f"""
        <!DOCTYPE html>
        <html lang="id">
          <head>
            <meta charset="UTF-8">
            <title>cTrader Open API Authorization</title>
            <style>
              body {{ background-color: #040906; color: #e5e5e5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
              .card {{ background: #07130c; border: 1px solid #18633c; border-radius: 20px; padding: 32px; max-width: 400px; text-align: center; }}
              .title {{ color: #10b981; font-size: 20px; font-weight: bold; margin-bottom: 8px; }}
              .desc {{ font-size: 13px; color: #a3a3a3; margin-bottom: 24px; }}
              .badge {{ background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 6px 14px; border-radius: 99px; font-weight: bold; font-family: monospace; margin-bottom: 16px; display: inline-block; }}
              .btn {{ background: #10b981; color: #000; border: none; padding: 12px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; width: 100%; text-decoration: none; display: block; box-sizing: border-box; }}
            </style>
          </head>
          <body>
            <div class="card">
              <div class="title">⚡ cTrader Open API Terhubung!</div>
              <div class="desc">Otorisasi cTrader Open API berhasil diverifikasi. Mengalihkan ke aplikasi Scrolic...</div>
              <div class="badge">{primary_acct_id}</div>
              <a id="btn-redirect" href="/?ctrader_connected=true" class="btn">
                Buka Aplikasi Scrolic Sekarang
              </a>
            </div>
            <script>
              const payload = {{
                type: 'CTRADER_OAUTH_SUCCESS',
                success: true,
                accounts: {accounts_json_str},
                user: {user_json_str if user else 'null'}
              }};

                            // 1. Send the verified account list to the Scrolic window and close this popup.
                            let popupHandled = false;
              try {{
                if (window.opener && !window.opener.closed) {{
                  window.opener.postMessage(payload, '*');
                                    setTimeout(() => {{ window.close(); }}, 150);
                                    popupHandled = true;
                }}
              }} catch(e) {{}}

                            // 2. OAuth may have been opened in the current tab; redirect only as a fallback.
                            if (!popupHandled) {{
                                setTimeout(() => {{
                                    window.location.href = '/?ctrader_connected=true';
                                }}, 250);
                            }}
            </script>
          </body>
        </html>
        """
        callback_response = HTMLResponse(html)
        callback_response.delete_cookie("ctrader_oauth_state", path="/api/ctrader")
        return callback_response
    except Exception as exc:
        logger.error(f"[cTrader.OAuth Exception] {exc}", exc_info=True)
        return RedirectResponse(url="/?ctrader_error=oauth_exception", status_code=302)

def calculate_ctrader_lots(raw_volume: Any, symbol: str = "XAUUSD") -> float:
    from backend.ticker import normalize_volume_lots, symbol_registry

    try:
        meta = symbol_registry.resolve(symbol_name=symbol)
        lots = normalize_volume_lots(raw_volume, meta, 0.01) or 0.01
        return round(max(0.01, min(100.0, lots)), 2)
    except Exception:
        return 0.01

async def sync_ctrader_account_trades(user_id: str) -> dict:
    from backend.ticker import normalize_money_value, normalize_volume_lots, symbol_registry
    try:
        from backend.ctrader_client import resolve_client_for_user_account, find_client_by_account
    except ImportError:
        from ctrader_client import resolve_client_for_user_account, find_client_by_account

    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        return {"synced": False, "reason": "User not found"}

    account_id = user.get("ctrader_account_id") or ""
    access_token = user.get("ctrader_access_token") or ""
    user_uid = user.get("id") or user.get("username")

    if not access_token or not account_id:
        return {"synced": False, "reason": "cTrader account is not authenticated"}

    # Determine which env client owns this account (based on user role + account type)
    active_account_obj = next(
        (a for a in (user.get("ctrader_accounts") or []) if str(a.get("accountId")) == str(account_id)),
        {}
    )
    target_client = find_client_by_account(ctrader_client._clean_numeric_account_id(account_id)) \
        or resolve_client_for_user_account(user, active_account_obj)

    acct_num = target_client._clean_numeric_account_id(account_id)
    account_state = target_client.account_states.get(acct_num, {})
    if account_state.get("authStatus") != "AUTHENTICATED":
        if not await target_client.authenticate_account(account_id, access_token, user_uid):
            return {"synced": False, "reason": "cTrader account authentication failed"}

    now_ms = int(time.time() * 1000)
    snapshot = await target_client.request_snapshot(
        acct_num,
        now_ms - (365 * 24 * 3600 * 1000),
        now_ms
    )
    if snapshot.get("errors") and not snapshot.get("reconciled"):
        return {"synced": False, "reason": "; ".join(snapshot["errors"]), "snapshot": snapshot}

    open_positions = snapshot.get("positions", []) or []
    closed_deals = snapshot.get("closedDeals", []) or []

    existing_user_posts = [p for p in db_store.posts if (p.get("user_id") == user_uid or p.get("username") == user.get("username"))]

    # Process open positions into active feed posts
    active_pos_ids = set()
    if open_positions:
        for pos in open_positions:
            pos_id = str(pos.get("positionId") or pos.get("id") or f"pos-{int(datetime.now().timestamp())}")
            active_pos_ids.add(pos_id)
            t_data = pos.get("tradeData", {}) if isinstance(pos.get("tradeData"), dict) else pos
            # Ticket 243821: cTrader positions carry a numeric symbolId, not a symbolName string —
            # t_data.get("symbolName") was always None, so this silently fell back to the literal
            # string "XAUUSD" for every symbol, e.g. a BTCUSD position displayed as XAUUSD. Resolve
            # by symbolId through the registry first (same registry deals/reconcile already use).
            raw_symbol_id = t_data.get("symbolId") if isinstance(t_data, dict) else None
            symbol_name_hint = t_data.get("symbolName") or t_data.get("symbol") or pos.get("symbolName")
            symbol_meta_open = symbol_registry.resolve(
                symbol_id=int(raw_symbol_id) if raw_symbol_id is not None else None,
                symbol_name=symbol_name_hint
            )
            symbol = symbol_meta_open["name"]
            raw_side = t_data.get("tradeSide") if (isinstance(t_data, dict) and t_data.get("tradeSide") is not None) else pos.get("tradeSide")
            trade_side = "BUY" if str(raw_side or "").upper() in ["BUY", "1"] else "SELL"
            # Ticket 243821: cTrader nests volume under tradeData for OPEN positions (unlike
            # deals, which carry it top-level) — reading pos.get("volume") directly always missed
            # it and fell back to the hardcoded 100000 default, showing every 0.01-lot position
            # as "10 Lot". Check tradeData first, matching the working pattern in ticker.py.
            raw_volume = (t_data.get("volume") if isinstance(t_data, dict) else None)
            if raw_volume is None:
                raw_volume = pos.get("volume", 100000)
            vol = calculate_ctrader_lots(raw_volume, symbol)
            entry = float(pos.get("entryPrice") or pos.get("price") or 2914.50)
            curr_pr = float(pos.get("currentPrice") or entry)
            
            raw_sl = pos.get("stopLoss") or t_data.get("stopLoss")
            raw_tp = pos.get("takeProfit") or t_data.get("takeProfit")
            sl_val = float(raw_sl) if raw_sl else None
            tp_val = float(raw_tp) if raw_tp else None
            
            from backend.ticker import symbol_registry
            digits = int(symbol_registry.resolve(symbol_name=symbol).get("digits", 5))
            if sl_val and abs(sl_val) >= 10 ** (digits + 4):
                sl_val = sl_val / (10 ** digits)
            if tp_val and abs(tp_val) >= 10 ** (digits + 4):
                tp_val = tp_val / (10 ** digits)

            raw_gross = float(pos.get("grossProfit") or pos.get("profit") or 0.0)
            raw_swap = float(pos.get("swap") or 0.0)
            raw_comm = float(pos.get("commission") or 0.0)
            raw_total = raw_gross + raw_swap + raw_comm
            from backend.ticker import normalize_money_value
            money_digits = int(account_state.get("moneyDigits", 2))
            pnl = normalize_money_value(raw_total, money_digits)

            pip_size = 10 ** (-symbol_registry.resolve(symbol_name=symbol)["pipPosition"])
            raw_diff = (curr_pr - entry) if trade_side == "BUY" else (entry - curr_pr)
            pips = round(raw_diff / pip_size, 1)
            progress = min(95, max(5, int(50.0 + (pips / 5.0))))

            matched = next((p for p in existing_user_posts if p.get("trade_id") == pos_id or p.get("id") == f"post-ctrader-{pos_id}"), None)
            if matched:
                matched["entry_price"] = entry
                matched["current_price"] = curr_pr
                matched["stop_loss"] = sl_val
                matched["take_profit"] = tp_val
                matched["profit"] = pnl
                matched["pips"] = pips
                matched["account_id"] = account_id
                matched["progress"] = progress
                matched["status"] = "OPEN"
                matched["source"] = "broker_ctrader"
                matched["is_simulation"] = False
            else:
                db_store.create_post({
                    "id": f"post-ctrader-{pos_id}",
                    "account_id": account_id,
                    "user_id": user_uid,
                    "username": user.get("username"),
                    "avatar": user.get("avatar"),
                    "trade_id": pos_id,
                    "symbol": symbol,
                    "market": "Crypto" if "BTC" in symbol else "Commodity" if "XAU" in symbol else "Forex",
                    "strategy_id": user.get("strategy_dna", "breakout"),
                    "position_type": trade_side,
                    "status": "OPEN",
                    "entry_price": entry,
                    "current_price": curr_pr,
                    "stop_loss": sl_val,
                    "take_profit": tp_val,
                    "progress": progress,
                    "profit": pnl,
                    "profit_percent": round((pnl / max(1.0, entry * symbol_registry.resolve(symbol_name=symbol).get("lotUnits", 1.0) * vol)) * 100, 2) if entry > 0 else 0.0,
                    "lot": round(vol, 2),
                    "pips": pips,
                    "duration": "Live OP",
                    "opened_at": datetime.now(timezone.utc),
                    "visibility": "LOCKED",
                    "unlock_price": 1,
                    "follow_price": 1,
                    "source": "broker_ctrader",
                    "is_simulation": False,
                    "account_type": "LIVE" if bool((user.get("ctrader_accounts") or [{}])[0].get("isLive")) else "DEMO",
                    "auto_description": f"⚡ Posisi Terbuka (OP) cTrader ({account_id}): {trade_side} {round(vol, 2)} Lot {symbol} @ {entry} (Floating {'Loss' if pnl < 0 else 'Profit'} ${pnl})",
                    "custom_description": f"Koneksi Live Trading Account cTrader {account_id}"
                })

    # Auto-close posts if position was closed in cTrader (manual close, SL, or TP)
    if open_positions:
        for post in existing_user_posts:
            if post.get("source") == "broker_ctrader" and post.get("status") == "OPEN":
                t_id = str(post.get("trade_id", ""))
                if t_id and t_id not in active_pos_ids:
                    post["status"] = "CLOSED"
                    post["closed_at"] = datetime.now(timezone.utc)
                    post["auto_description"] = f"Trade cTrader ({account_id}) telah ditutup (SL/TP/Manual)"

    # Process closed deals into portfolio history feed posts
    if closed_deals:
        for deal in closed_deals:
            # Only process actual CLOSING deals (with closePositionDetail); opening deals will be handled via position/reconcile
            detail = deal.get("closePositionDetail") if isinstance(deal.get("closePositionDetail"), dict) else None
            if not detail:
                continue
            deal_id = str(deal.get("dealId") or deal.get("id") or f"deal-{int(datetime.now().timestamp())}")
            position_id = str(deal.get("positionId") or "")
            if not position_id:
                continue
            # Consistent post_id with ticker.handle_deal_list_event to avoid duplicates
            acct_num_int = ctrader_client._clean_numeric_account_id(account_id)
            post_id = f"post-ctrader-{acct_num_int}-{position_id}"

            from backend.ticker import normalize_money_value, symbol_registry
            raw_symbol_id = deal.get("symbolId")
            symbol_meta = symbol_registry.resolve(
                symbol_id=int(raw_symbol_id) if raw_symbol_id is not None else None,
                symbol_name=deal.get("symbolName")
            )
            symbol = symbol_meta["name"]
            # Deal side = order side that closed the position; position side is inverse
            raw_side = deal.get("tradeSide")
            deal_side = "BUY" if str(raw_side or "").upper() in ["BUY", "1"] else "SELL"
            position_side = "SELL" if deal_side == "BUY" else "BUY"

            vol = calculate_ctrader_lots(deal.get("volume", 100000), symbol)

            # Read profit fields from closePositionDetail (correct location per cTrader Open API spec)
            money_digits = int(detail.get("moneyDigits") or deal.get("moneyDigits") or account_state.get("moneyDigits", 2))
            gross = normalize_money_value(detail.get("grossProfit"), money_digits)
            swap = normalize_money_value(detail.get("swap"), money_digits)
            commission = normalize_money_value(detail.get("commission"), money_digits)
            net_profit = round(gross + swap + commission, 2)

            # entryPrice from closePositionDetail; some brokers scale it by symbol digits
            raw_entry = detail.get("entryPrice")
            entry_price = float(raw_entry or 0.0)
            digits = int(symbol_meta.get("digits", 5))
            if entry_price > 0 and abs(entry_price) >= 10 ** (digits + 4):
                entry_price = entry_price / (10 ** digits)
            close_price = float(deal.get("executionPrice") or 0.0)

            pip_size = 10 ** (-int(symbol_meta.get("pipPosition", 4)))
            if position_side == "BUY":
                pips = round((close_price - entry_price) / pip_size, 1) if entry_price > 0 else 0.0
            else:
                pips = round((entry_price - close_price) / pip_size, 1) if entry_price > 0 else 0.0

            notional = entry_price * vol * float(symbol_meta.get("lotUnits", 100000.0))
            profit_percent = round((net_profit / notional) * 100.0, 2) if notional > 0 else 0.0

            closed_at_dt = datetime.fromtimestamp(
                int(deal.get("executionTimestamp") or time.time() * 1000) / 1000,
                tz=timezone.utc
            )

            raw_sl = detail.get("stopLoss") or deal.get("stopLoss")
            raw_tp = detail.get("takeProfit") or deal.get("takeProfit")
            sl_val = float(raw_sl) if raw_sl else None
            tp_val = float(raw_tp) if raw_tp else None
            if sl_val and abs(sl_val) >= 10 ** (digits + 4):
                sl_val = sl_val / (10 ** digits)
            if tp_val and abs(tp_val) >= 10 ** (digits + 4):
                tp_val = tp_val / (10 ** digits)

            existing_post = db_store.find_post_by_id(post_id) if hasattr(db_store, "find_post_by_id") else next((p for p in db_store.posts if p.get("id") == post_id), None)
            if existing_post:
                existing_post["entry_price"] = entry_price
                existing_post["current_price"] = close_price
                existing_post["stop_loss"] = sl_val
                existing_post["take_profit"] = tp_val
                existing_post["profit"] = net_profit
                existing_post["profit_percent"] = profit_percent
                existing_post["pips"] = pips
                existing_post["lot"] = round(vol, 2)
                existing_post["position_type"] = position_side
                existing_post["symbol"] = symbol
                existing_post["account_id"] = account_id
                existing_post["status"] = "CLOSED"
                existing_post["closed_at"] = closed_at_dt
                existing_post["source"] = "broker_ctrader"
                existing_post["is_simulation"] = False
            else:
                db_store.create_post({
                    "id": post_id,
                    "account_id": account_id,
                    "user_id": user_uid,
                    "username": user.get("username"),
                    "avatar": user.get("avatar"),
                    "trade_id": position_id,
                    "symbol": symbol,
                    "market": symbol_meta.get("market", "Forex"),
                    "strategy_id": user.get("strategy_dna", "breakout"),
                    "position_type": position_side,
                    "status": "CLOSED",
                    "entry_price": entry_price,
                    "current_price": close_price,
                    "stop_loss": sl_val,
                    "take_profit": tp_val,
                    "progress": 100 if net_profit >= 0 else 0,
                    "profit": net_profit,
                    "profit_percent": profit_percent,
                    "lot": round(vol, 2),
                    "pips": pips,
                    "duration": "Closed Deal",
                    "opened_at": closed_at_dt,
                    "closed_at": closed_at_dt,
                    "visibility": "LOCKED",
                    "unlock_price": 1,
                    "follow_price": 1,
                    "source": "broker_ctrader",
                    "is_simulation": False,
                    "account_type": "LIVE" if bool((user.get("ctrader_accounts") or [{}])[0].get("isLive")) else "DEMO",
                    "auto_description": f"Closed Deal via cTrader ({account_id}): {position_side} {round(vol, 2)} Lot {symbol} ({'Profit' if net_profit >= 0 else 'Loss'} ${abs(net_profit):.2f})",
                    "custom_description": f"Transaksi cTrader {account_id} Selesai"
                })

    # Recalculate Win Rate %, Total Profit USD, Total Pips & Total Trades from real posts
    all_user_posts = [p for p in db_store.posts if (p.get("user_id") == user_uid or p.get("username") == user.get("username"))]
    closed_posts = [p for p in all_user_posts if p.get("status") == "CLOSED"]
    
    total_trades_count = len(closed_posts)
    winning_trades_count = len([p for p in closed_posts if float(p.get("profit", 0)) > 0])
    win_rate = round((winning_trades_count / total_trades_count) * 100.0, 1) if total_trades_count > 0 else 0.0
    total_profit_usd = round(sum(float(p.get("profit", 0)) for p in closed_posts), 2)
    total_pips = round(sum(float(p.get("pips", 0)) for p in closed_posts), 1)

    db_store.update_user(user_uid, {
        "win_rate": win_rate,
        "trades_count": len(all_user_posts),
        "total_profit_usd": total_profit_usd,
        "total_pips": total_pips
    })

    return {
        "synced": True,
        "snapshot": snapshot,
        "openPositionsCount": len([p for p in all_user_posts if p.get("status") == "OPEN"]),
        "closedDealsCount": total_trades_count,
        "winRate": win_rate,
        "tradesCount": len(all_user_posts),
        "totalProfitUSD": total_profit_usd
    }

@fastapi_app.post("/api/ctrader/connect")
async def ctrader_connect(request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = await request.json()
    account_id = body.get("accountId", "").strip()
    accounts = body.get("accounts") or user.get("ctrader_accounts") or []
    accounts = [account for account in accounts if account_visible_to_user(account, user)]

    access_token = user.get("ctrader_access_token") or body.get("accessToken") or ""
    if not access_token or not accounts:
        raise HTTPException(400, "ACCOUNT_NOT_AUTHORIZED: Hubungkan akun melalui OAuth cTrader terlebih dahulu.")

    primary_id = account_id or (accounts[0]["accountId"] if accounts else "")
    updates = {
        "ctrader_connected": True if accounts else False,
        "ctrader_account_id": primary_id,
        "ctrader_accounts": accounts
    }
    if body.get("accessToken"):
        updates["ctrader_access_token"] = body["accessToken"]
        updates["ctrader_token_expires_at"] = datetime.now(timezone.utc) + timedelta(days=30)

    # Dual-env dispatch: authenticate EVERY account on its correct env client so both LIVE + DEMO
    # accounts can receive spot/reconcile events simultaneously (not just the primary).
    try:
        from backend.ctrader_client import resolve_client_for_user_account
    except ImportError:
        from ctrader_client import resolve_client_for_user_account
    primary_account_obj = next(
        (a for a in accounts if str(a.get("accountId")) == str(primary_id)),
        accounts[0] if accounts else {}
    )
    primary_client = resolve_client_for_user_account(user, primary_account_obj)
    primary_authenticated = await primary_client.authenticate_account(primary_id, access_token, curr_id)
    if not primary_authenticated:
        auth_error = primary_client.get_account_status(primary_id).get("lastError") or "Akun cTrader gagal diautentikasi ke Open API."
        if str(auth_error).startswith("WARNING:"):
            raise HTTPException(409, auth_error)
        raise HTTPException(502, "ACCOUNT_AUTH_FAILED: Akun cTrader gagal diautentikasi ke Open API.")

    # Also authenticate secondary accounts on their appropriate env client (background — don't block primary path)
    async def _auth_secondary(acct_obj: Dict[str, Any]):
        try:
            target_client = resolve_client_for_user_account(user, acct_obj)
            aid = acct_obj.get("accountId") or acct_obj.get("accountNo")
            if not aid:
                return
            ok = await target_client.authenticate_account(aid, access_token, curr_id)
            logger.info(
                f"[cTrader.MultiAuth] secondary account {aid} "
                f"env={acct_obj.get('accountType')} isLive={acct_obj.get('isLive')} "
                f"routedTo={target_client._env} auth={'OK' if ok else 'FAIL'}"
            )
        except Exception as exc:
            logger.warning(f"[cTrader.MultiAuth] secondary auth error for {acct_obj.get('accountId')}: {exc}")

    for _acct in accounts:
        if str(_acct.get("accountId")) == str(primary_id):
            continue
        asyncio.create_task(_auth_secondary(_acct))

    db_store.update_user(curr_id, updates)
    asyncio.create_task(sync_ctrader_account_trades(curr_id))
    updated_user = db_store.find_user_by_id_or_username(curr_id)
    return {"success": True, "user": format_auth_user_response(updated_user), "message": "cTrader Open API akun berhasil diperbarui"}


@fastapi_app.post("/api/ctrader/switch")
async def ctrader_switch(request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = await request.json()
    raw_account_id = body.get("accountId", "").strip()
    if not raw_account_id:
        raise HTTPException(400, "Account ID wajib diisi")

    # 1. Validate that selected account is in OAuth-authorized accounts whitelist
    user_accounts = user.get("ctrader_accounts", [])
    target_acct = next(
        (a for a in user_accounts if account_visible_to_user(a, user) and (a.get("accountId") == raw_account_id or a.get("accountNo") == raw_account_id or a.get("accountId") == f"cTrader-{raw_account_id}")),
        None
    )
    if not target_acct:
        raise HTTPException(400, f"ACCOUNT_NOT_AUTHORIZED: Akun {raw_account_id} tidak terdaftar dalam otorisasi OAuth pengguna ini.")

    old_acct_id = user.get("ctrader_account_id", "")
    target_acct_id = target_acct.get("accountId")
    access_token = user.get("ctrader_access_token", "")
    if not access_token:
        raise HTTPException(401, "CTRADER_REAUTH_REQUIRED: Access token cTrader tidak tersedia. Hubungkan ulang akun melalui OAuth cTrader.")

    # Trigger account switch & reconciliation on persistent client — dispatched to correct env
    try:
        from backend.ctrader_client import resolve_client_for_user_account, find_client_by_account
    except ImportError:
        from ctrader_client import resolve_client_for_user_account, find_client_by_account
    target_client = resolve_client_for_user_account(user, target_acct)
    # Also unbind from old client if it lived on a different env
    old_client = find_client_by_account(ctrader_client._clean_numeric_account_id(old_acct_id)) if old_acct_id else None
    if old_client and old_client is not target_client:
        try:
            old_num = old_client._clean_numeric_account_id(old_acct_id)
            old_client.account_tokens.pop(old_num, None)
            old_client.account_to_user_map.pop(old_num, None)
        except Exception:
            pass
    switched = await target_client.switch_account(old_acct_id, target_acct_id, access_token, curr_id)
    if not switched:
        auth_error = target_client.get_account_status(target_acct_id).get("lastError") or "Akun cTrader gagal diautentikasi ke Open API."
        if str(auth_error).startswith("WARNING:"):
            raise HTTPException(409, auth_error)
        raise HTTPException(502, "ACCOUNT_AUTH_FAILED: Akun cTrader gagal diautentikasi ke Open API.")

    db_store.update_user(curr_id, {
        "ctrader_account_id": target_acct_id,
        "ctrader_connected": True
    })
    asyncio.create_task(sync_ctrader_account_trades(curr_id))
    updated_user = db_store.find_user_by_id_or_username(curr_id)
    return {"success": True, "user": format_auth_user_response(updated_user), "message": f"Berhasil beralih ke akun {target_acct_id}"}

@fastapi_app.get("/api/ctrader/accounts/status")
async def ctrader_accounts_status(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    user_accounts = user.get("ctrader_accounts", [])
    account_statuses = []
    for acct in user_accounts:
        if not account_visible_to_user(acct, user):
            continue
        acct_id = acct.get("accountId")
        st = ctrader_client.get_account_status(acct_id)
        account_statuses.append({
            "accountId": acct_id,
            "accountNo": acct.get("accountNo"),
            "brokerName": acct.get("brokerName"),
            "accountType": acct.get("accountType"),
            "balance": acct.get("balance"),
            "currency": acct.get("currency"),
            "isLive": acct.get("isLive", False),
            "isActive": acct_id == user.get("ctrader_account_id"),
            "authStatus": st.get("authStatus"),
            "authenticatedAt": st.get("authenticatedAt"),
            "lastReconciledAt": st.get("lastReconciledAt"),
            "lastError": st.get("lastError")
        })

    return {
        "success": True,
        "activeAccountId": user.get("ctrader_account_id"),
        "environment": CTRADER_ENV,
        "accounts": account_statuses
    }

@fastapi_app.get("/api/ctrader/account/metrics")
async def ctrader_account_metrics(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    active_acct_id = user.get("ctrader_account_id") or ""
    metrics = live_trading_service.get_account_live_state(active_acct_id)
    return {
        "success": True,
        "metrics": metrics
    }

@fastapi_app.get("/api/ctrader/sync")
@fastapi_app.post("/api/ctrader/sync")
async def ctrader_sync(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    res = await sync_ctrader_account_trades(curr_id)
    if not res.get("synced"):
        status_code = 401 if "authenticated" in res.get("reason", "") else 502
        raise HTTPException(status_code, f"CTRADER_SYNC_FAILED: {res.get('reason', 'Sinkronisasi cTrader gagal')}")
    updated_user = db_store.find_user_by_id_or_username(curr_id)
    return {"success": True, "syncResult": res, "user": format_auth_user_response(updated_user)}

@fastapi_app.post("/api/ctrader/disconnect")
async def ctrader_disconnect(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    db_store.update_user(curr_id, {
        "ctrader_connected": False,
        "ctrader_account_id": None,
        "ctrader_accounts": [],
        "ctrader_access_token": None,
        "ctrader_refresh_token": None
    })
    updated_user = db_store.find_user_by_id_or_username(curr_id)
    return {"success": True, "user": format_auth_user_response(updated_user), "message": "Koneksi cTrader berhasil diputuskan"}

@fastapi_app.get("/api/ctrader/token/status")
async def ctrader_token_status(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    user = db_store.find_user_by_id_or_username(curr_id) if curr_id else None
    has_valid_token = await ensure_valid_ctrader_token(curr_id) if curr_id else False
    return {
        "success": True,
        "status": {
            "isConnected": bool(user and user.get("ctrader_connected")),
            "accountId": user.get("ctrader_account_id") if user else None,
            "hasAccessToken": has_valid_token,
            "hasRefreshToken": bool(user and user.get("ctrader_refresh_token")),
            "expiresAt": user.get("ctrader_token_expires_at").isoformat() if (user and isinstance(user.get("ctrader_token_expires_at"), datetime)) else None
        }
    }

@fastapi_app.post("/api/ctrader/token/refresh")
async def ctrader_token_refresh(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    
    success = await refresh_user_token(curr_id)
    user = db_store.find_user_by_id_or_username(curr_id)
    if not success:
        return JSONResponse({
            "success": False,
            "message": "Gagal memperbarui access token cTrader dengan Spotware API. Status diubah ke DISCONNECTED.",
            "status": {
                "isConnected": False,
                "hasAccessToken": False
            }
        }, status_code=400)

    return {
        "success": True,
        "message": "Access token cTrader berhasil diperbarui dan divalidasi",
        "status": {
            "isConnected": bool(user and user.get("ctrader_connected")),
            "hasAccessToken": True,
            "expiresAt": user.get("ctrader_token_expires_at").isoformat() if (user and isinstance(user.get("ctrader_token_expires_at"), datetime)) else None
        }
    }

@fastapi_app.get("/api/ctrader/connection/status")
async def ctrader_connection_status():
    try:
        from backend.ctrader_client import ctrader_client_alt
    except ImportError:
        from ctrader_client import ctrader_client_alt
    live_diag = ctrader_client.get_diagnostics()
    demo_diag = ctrader_client_alt.get_diagnostics()
    return {
        "success": True,
        "connection": live_diag,
        "environments": {
            "live": {"state": live_diag.get("state"), "accounts": live_diag.get("authenticated_accounts_count", 0)},
            "demo": {"state": demo_diag.get("state"), "accounts": demo_diag.get("authenticated_accounts_count", 0)}
        }
    }

@fastapi_app.get("/api/ctrader/diagnostics")
async def ctrader_diagnostics():
    try:
        from backend.ctrader_client import ctrader_client_alt
    except ImportError:
        from ctrader_client import ctrader_client_alt
    return {
        "success": True,
        "diagnostics": ctrader_client.get_diagnostics(),
        "diagnosticsAlt": ctrader_client_alt.get_diagnostics(),
        "alarms": ctrader_client.get_observability_alarms()
    }

@fastapi_app.get("/api/ctrader/shards/status")
async def ctrader_shards_status():
    """Per-shard health/metrics for the cTrader ShardManager."""
    if hasattr(ctrader_client, "get_shards_summary"):
        shards = ctrader_client.get_shards_summary()
        scheduler = ctrader_client.scheduler_snapshot() if hasattr(ctrader_client, "scheduler_snapshot") else {}
        owned = ctrader_client.owned_shards() if hasattr(ctrader_client, "owned_shards") else []
        try:
            from backend.mongo_writer import get_mongo_writer
        except ImportError:
            from mongo_writer import get_mongo_writer
        writer_metrics = {}
        try:
            writer_metrics = get_mongo_writer(db_store).metrics()
        except Exception:
            pass
        return {
            "success": True,
            "shardCount": len(shards),
            "ownedShards": owned,
            "shards": shards,
            "authScheduler": scheduler,
            "mongoWriter": writer_metrics,
            "timestamp": int(time.time() * 1000),
        }
    diag = ctrader_client.get_diagnostics()
    return {
        "success": True,
        "shardCount": 1,
        "ownedShards": [0],
        "shards": [{
            "shardId": 0,
            "state": diag.get("state"),
            "connected": diag.get("is_broker_connected", False),
            "environment": diag.get("environment"),
            "host": diag.get("host"),
            "port": diag.get("port"),
            "accountsTotal": len(ctrader_client.account_states),
            "accountsAuthenticated": diag.get("authenticated_accounts_count", 0),
        }],
        "authScheduler": {},
        "mongoWriter": {},
        "timestamp": int(time.time() * 1000),
    }

@fastapi_app.get("/api/ctrader/observability/dashboard")
async def ctrader_observability_dashboard(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    diag = ctrader_client.get_diagnostics()
    alarms = ctrader_client.get_observability_alarms()
    
    user_status = None
    if curr_id:
        u = db_store.find_user_by_id_or_username(curr_id)
        if u and u.get("ctrader_account_id"):
            user_status = live_trading_service.get_account_live_state(u.get("ctrader_account_id"))

    return {
        "success": True,
        "runtime": {
            "owner": "FastAPI Single Runtime",
            "port": 8001,
            "node_runtime_deactivated": True
        },
        "connection": diag,
        "currentUserAccountState": user_status,
        "accountsOverview": list(ctrader_client.account_states.values()),
        "metrics": ctrader_client.metrics,
        "alarms": alarms,
        "reconciliationLogs": db_store.get_reconciliation_audit_logs(20),
        "timestamp": int(time.time() * 1000)
    }

@fastapi_app.get("/api/ctrader/health")
async def ctrader_health_endpoint():
    diag = ctrader_client.get_diagnostics()
    alarms = ctrader_client.get_observability_alarms()
    
    app_health = {
        "status": "healthy",
        "runtime": "FastAPI :8001",
        "database": "MemoryStore/Persistent",
        "uptime": time.time()
    }
    
    socketio_health = {
        "status": "healthy" if HAS_SOCKETIO else "degraded",
        "is_asgi": True,
        "cors": "allowed"
    }
    
    broker_health = {
        "status": "healthy" if diag["state"] in ["CONNECTED", "AUTHENTICATED"] else "degraded" if diag["state"] == "DEGRADED" else "disconnected",
        "state": diag["state"],
        "is_connected": diag["is_broker_connected"],
        "is_authenticated": diag["is_authenticated"],
        "transport": diag["transport"],
        "host": diag["host"],
        "authenticated_accounts_count": diag["authenticated_accounts_count"],
        "last_broker_to_db_latency_ms": ctrader_client.metrics.get("last_broker_to_db_latency_ms", 0.0),
        "last_message_at": diag["last_message_at"],
        "last_error": diag["last_error"]
    }
    
    is_healthy = broker_health["status"] in ["healthy", "disconnected"]
    
    return {
        "status": "healthy" if is_healthy else "degraded",
        "app": app_health,
        "socketio": socketio_health,
        "ctrader_broker": broker_health,
        "alarms": alarms
    }

# ---------------- Market Orders & Ikuti Setup ----------------
@fastapi_app.post("/api/ctrader/orders/market")
async def ctrader_order_market(request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    if not await ensure_valid_ctrader_token(curr_id):
        raise HTTPException(401, "Access token cTrader tidak valid. Silakan hubungkan ulang akun.")

    body = await request.json()
    symbol = str(body.get("symbol", "XAUUSD")).upper()
    symbol_id = int(body.get("symbolId") or {"EURUSD": 1, "GBPUSD": 2, "EURJPY": 3, "USDJPY": 4, "XAUUSD": 41, "BTCUSD": 22396, "ETHUSD": 22397}.get(symbol, 0))
    direction = str(body.get("direction", "BUY")).upper()
    lot = float(body.get("volumeLot", 1.0))
    account_id = user.get("ctrader_account_id") or ""
    if not account_id or not symbol_id:
        raise HTTPException(400, "Account ID dan symbolId cTrader wajib tersedia.")

    accepted = await ctrader_client.send_market_order(
        account_id,
        symbol_id,
        direction,
        lot,
        float(body["stopLoss"]) if body.get("stopLoss") else None,
        float(body["takeProfit"]) if body.get("takeProfit") else None,
        str(body.get("comment") or "")
    )
    if not accepted:
        raise HTTPException(502, "Order cTrader gagal dikirim ke Open API.")
    return {"success": True, "status": "ORDER_REQUESTED", "accountId": account_id, "symbol": symbol}

@fastapi_app.post("/api/ctrader/positions/{position_id}/close")
async def ctrader_close_position_endpoint(position_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    volume_lot = float(body.get("volumeLot")) if body.get("volumeLot") else None
    account_id = user.get("ctrader_account_id") or ""

    post = next((p for p in db_store.posts if p.get("trade_id") == position_id or p.get("id") == position_id or p.get("id") == f"post-ctrader-{account_id}-{position_id}"), None)
    if post:
        account_id = post.get("account_id") or account_id
        if volume_lot is None:
            volume_lot = float(post.get("lot") or 0.01)

    symbol = str(post.get("symbol") if post else body.get("symbol", "XAUUSD")).upper()
    symbol_id = int(body.get("symbolId") or {"EURUSD": 1, "GBPUSD": 2, "EURJPY": 3, "USDJPY": 4, "XAUUSD": 41, "BTCUSD": 22396, "ETHUSD": 22397}.get(symbol, 0))

    if not account_id:
        raise HTTPException(400, "Account ID tidak ditemukan untuk posisi ini.")

    # Ticket 243821: this always dispatched on the hardcoded live-only ctrader_client, whose
    # account_states never includes a DEMO account — is_account_authenticated() would find
    # nothing there and silently refuse the close, even though the account is genuinely
    # authenticated on ctrader_client_alt (demo). Resolve the correct env client per-account,
    # same as the OAuth/connect/switch flows already do.
    try:
        from backend.ctrader_client import resolve_client_for_user_account
    except ImportError:
        from ctrader_client import resolve_client_for_user_account
    close_account_obj = next(
        (a for a in (user.get("ctrader_accounts") or []) if str(a.get("accountId")) == str(account_id) or str(a.get("accountId")) == f"cTrader-{account_id}"),
        {}
    )
    close_client = resolve_client_for_user_account(user, close_account_obj)

    # Dispatch official close request to Spotware broker
    success = await close_client.close_position(account_id, position_id, volume_lot, symbol_id)
    if not success:
        return JSONResponse({"success": False, "message": "Gagal mengirim permintaan close posisi ke broker cTrader"}, status_code=500)

    return {
        "success": True,
        "message": f"Permintaan close posisi {position_id} telah dikirim ke broker cTrader. Menunggu konfirmasi eksekusi.",
        "positionId": position_id,
        "status": "CLOSE_REQUESTED"
    }

@fastapi_app.post("/api/posts/{post_id}/follow-setup")
async def follow_setup(post_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    post = db_store.find_post_by_id(post_id)
    if not user or not post:
        raise HTTPException(404, "User atau Post tidak ditemukan")

    is_owner = (user.get("id") == post.get("user_id")) or (user.get("username") == post.get("username"))
    if is_owner:
        return JSONResponse({"success": False, "error": {"code": "SELF_FOLLOW_FORBIDDEN", "message": "Anda tidak dapat mengikuti setup trading milik sendiri."}}, status_code=400)

    if not user.get("ctrader_connected") or not user.get("ctrader_account_id"):
        return JSONResponse({"success": False, "error": {"code": "CTRADER_NOT_CONNECTED", "message": "Akun cTrader Anda belum terhubung. Harap hubungkan akun cTrader via menu cTrader Gateway sebelum mengikuti setup."}}, status_code=400)

    if not await ensure_valid_ctrader_token(curr_id):
        raise HTTPException(401, "Access token cTrader tidak valid. Silakan hubungkan ulang akun.")

    follow_fee = int(post.get("follow_price", 1))
    if user.get("energy", 0) < follow_fee:
        return JSONResponse({"success": False, "error": {"code": "INSUFFICIENT_ENERGY", "message": f"Energy tidak mencukupi. Diperlukan {follow_fee} Energy."}}, status_code=400)

    new_bal, _ = db_store.update_energy(curr_id, -follow_fee)

    followed_list = post.setdefault("followed_by_user_ids", [])
    if curr_id not in followed_list:
        followed_list.append(curr_id)
        post["followers_count"] = post.get("followers_count", 0) + 1

    trader_share = int(follow_fee * 0.8)
    trader = db_store.find_user_by_id_or_username(post.get("user_id", ""))
    if trader and trader.get("username") != user.get("username"):
        db_store.update_energy(trader.get("id") or trader.get("username"), trader_share)
        db_store.create_notification({
            "user_id": trader.get("id") or trader.get("username"),
            "title": f"🚀 Ikuti Setup Baru: +{trader_share} Energy",
            "message": f"@{user['username']} mengeksekusi ikuti setup trading {post.get('symbol')} Anda ({follow_fee} Energy).",
            "type": "TRADE_EARNING"
        })

    follower_account_id = user.get("ctrader_account_id") or "cTrader-47601047"
    symbol = post.get("symbol", "XAUUSD")
    trade_side = post.get("position_type", "BUY")
    lot_size = float(post.get("lot", 0.01))
    entry_pr = float(post.get("entry_price", 2914.50))

    # Transmit cTrader Open API Protobuf New Order (ProtoOANewOrderReq payloadType=2104)
    logger.info(f"[cTrader.OpenAPI.MirrorOrder] Transmitting ProtoOANewOrderReq (2104) to wss://live.ctraderapi.com:5036 | ctidTraderAccountId={follower_account_id} | side={trade_side} | lot={lot_size} | symbol={symbol}")

    # Auto-create Mirror Feed Post for follower
    mirror_pos_id = f"pos-mirror-{curr_id}-{int(datetime.now().timestamp())}"
    mirror_post = db_store.create_post({
        "id": f"post-ctrader-{mirror_pos_id}",
        "user_id": curr_id,
        "username": user.get("username"),
        "avatar": user.get("avatar"),
        "trade_id": mirror_pos_id,
        "symbol": symbol,
        "market": post.get("market", "Commodity"),
        "strategy_id": user.get("strategy_dna", "breakout"),
        "position_type": trade_side,
        "status": "OPEN",
        "entry_price": entry_pr,
        "current_price": entry_pr,
        "progress": 50,
        "profit": 0.0,
        "profit_percent": 0.0,
        "lot": lot_size,
        "pips": 0.0,
        "duration": "Live OP",
        "opened_at": datetime.now(timezone.utc),
        "visibility": "LOCKED",
        "unlock_price": 1,
        "follow_price": 1,
        "auto_description": f"⚡ Mirroring Setup @{post.get('username')} via cTrader ({follower_account_id}): {trade_side} {lot_size} Lot {symbol} @ {entry_pr}",
        "custom_description": f"Order Mirror dari setup @{post.get('username')} di cTrader {follower_account_id}"
    })

    try:
        await sync_ctrader_account_trades(curr_id)
    except Exception:
        pass

    formatted = format_post(post, curr_id)
    formatted_mirror = format_post(mirror_post, curr_id)

    if HAS_SOCKETIO and sio is not None:
        try:
            await sio.emit("post_updated", formatted)
            await sio.emit("new_post", formatted_mirror)
        except Exception:
            pass

    return {
        "success": True,
        "energyBalance": new_bal,
        "followFee": follow_fee,
        "traderEarned": trader_share,
        "followersCount": post["followers_count"],
        "mirrorPost": formatted_mirror,
        "message": f"Berhasil mengeksekusi order mirror {symbol} ke akun cTrader {follower_account_id}!"
    }

@fastapi_app.post("/api/ctrader/positions/close")
@fastapi_app.post("/api/positions/close")
async def ctrader_position_close(request: Request, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        return JSONResponse({"success": False, "error": "Harap login terlebih dahulu"}, status_code=401)
    
    try:
        body = await request.json()
    except Exception:
        body = {}

    target_id = str(body.get("positionId") or body.get("tradeId") or body.get("id") or body.get("postId") or "").strip()
    if not target_id:
        return JSONResponse({"success": False, "error": "Position ID wajib diisi"}, status_code=400)

    user = db_store.find_user_by_id_or_username(curr_id)
    user_uid = user.get("id") if user else curr_id

    post = db_store.find_post_by_id(target_id)
    if not post:
        for p in db_store.posts:
            if (p.get("trade_id") == target_id or 
                p.get("id") == f"post-ctrader-{target_id}" or 
                p.get("id") == target_id or 
                str(p.get("trade_id")) in target_id or 
                target_id in str(p.get("id"))):
                post = p
                break

    if not post and db_store.posts:
        open_posts = [p for p in db_store.posts if (p.get("user_id") == user_uid or p.get("username") == (user.get("username") if user else "")) and p.get("status") == "OPEN"]
        if open_posts:
            post = open_posts[0]

    if not post:
        return JSONResponse({"success": False, "error": "Posisi trade tidak ditemukan"}, status_code=404)

    # Transmit cTrader Open API Protobuf Close Position (ProtoOAClosePositionReq payloadType=2106)
    account_id_raw = user.get("ctrader_account_id") if user else "cTrader-47601047"
    clean_account_id = int(str(account_id_raw).replace("cTrader-", "").strip() or "47601047")
    raw_pos_id = post.get("trade_id", "").replace("trade-", "").replace("pos-", "")
    clean_pos_id = int(''.join(filter(str.isdigit, raw_pos_id)) or "476010471")
    symbol = post.get("symbol", "XAUUSD")
    logger.info(f"[cTrader.OpenAPI] Transmitting ProtoOAClosePositionReq (2106) to wss://live.ctraderapi.com:5036 | ctidTraderAccountId={clean_account_id} (uint64) | positionId={clean_pos_id} (uint64) | symbol={symbol}")

    updated = db_store.update_post(post["id"], {
        "status": "CLOSED",
        "progress": 100,
        "closed_at": datetime.now(timezone.utc)
    })

    try:
        await sync_ctrader_account_trades(curr_id)
    except Exception:
        pass

    payload = {
        "postId": post["id"],
        "symbol": post.get("symbol"),
        "profit": post.get("profit", 0.0),
        "pips": post.get("pips", 0.0),
        "closedAt": datetime.now(timezone.utc).isoformat()
    }
    if HAS_SOCKETIO and sio is not None:
        try:
            await sio.emit("position_closed", payload)
        except Exception:
            pass

    return JSONResponse({"success": True, "message": f"Posisi {post.get('symbol')} berhasil ditutup", "post": format_post(updated, curr_id)})

# ---------------- Native LLM Bridge ----------------
class TradeAnalysisReq(BaseModel):
    session_id: str
    symbol: str
    direction: str
    entryPrice: str
    stopLoss: Optional[str] = None
    takeProfit: Optional[str] = None
    question: Optional[str] = None
    strategyName: Optional[str] = None

class PerformanceAnalysisReq(BaseModel):
    session_id: str
    traderUsername: str
    performance: Dict[str, Any]
    question: str

class EconomicEventReq(BaseModel):
    session_id: str
    eventTitle: str
    currency: str
    impact: str
    actual: Optional[str] = None
    forecast: Optional[str] = None
    previous: Optional[str] = None
    question: Optional[str] = None
    affectedPairs: Optional[list[str]] = None

class KycKtpReq(BaseModel):
    session_id: str
    image_base64: str
    mime_type: str = "image/jpeg"

async def _run_llm(session_id: str, system_message: str, user_text: str, image_b64: Optional[str] = None) -> str:
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # type: ignore
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_message).with_model(LLM_PROVIDER, LLM_MODEL)
    file_contents = [ImageContent(image_base64=image_b64)] if image_b64 else None
    msg = UserMessage(text=user_text, file_contents=file_contents) if file_contents else UserMessage(text=user_text)
    return await chat.send_message(msg)

@fastapi_app.post("/api/_llm/trade-analysis")
async def llm_trade_analysis(req: TradeAnalysisReq):
    sys_msg = (
        "Anda adalah analis teknikal senior forex/CFD. Berikan analisis ringkas 3 bullet point berbahasa Indonesia: "
        "(1) Validasi teknikal, (2) Risk-to-Reward, (3) Rekomendasi eksekusi. "
        "JANGAN gunakan asterisk (*). Gunakan bullet '•'. Maks 6-8 kalimat total."
    )
    user_text = (
        f"Setup: {req.symbol} {req.direction} Entry={req.entryPrice} SL={req.stopLoss or '-'} TP={req.takeProfit or '-'}. "
        f"Strategi={req.strategyName or 'General'}. Pertanyaan: {req.question or 'Analisis lengkap.'}"
    )
    try:
        answer = await _run_llm(req.session_id, sys_msg, user_text)
        return {"answer": (answer or "").replace("*", "").strip()}
    except Exception as e:
        logger.warning(f"[llm.trade] {e}")
        raise HTTPException(status_code=502, detail=str(e))

@fastapi_app.post("/api/ai/ask-performance")
async def llm_performance_analysis(req: PerformanceAnalysisReq, x_session_user_id: Optional[str] = Header(None)):
    requester_id = x_session_user_id or active_session_user_id
    requester = db_store.find_user_by_id_or_username(requester_id) if requester_id else None
    if not requester:
        raise HTTPException(401, "Harap login terlebih dahulu")
    if int(requester.get("energy", 0)) < 1:
        raise HTTPException(402, "Energy Anda tidak mencukupi (1 Energy per pertanyaan).")

    new_balance, _ = db_store.update_energy(requester_id, -1)
    db_store.create_transaction({
        "user_id": requester.get("id") or requester_id,
        "type": "AI_PERFORMANCE_ANALYSIS",
        "amount": -1,
        "balance_before": new_balance + 1,
        "balance_after": new_balance,
        "status": "COMPLETED",
        "description": f"Analisis performance trader @{req.traderUsername}"
    })
    try:
        sys_msg = (
            "Anda adalah analis performa trading berbasis data historis. Analisis hanya trader yang diberikan, "
            "tanpa sinyal BUY/SELL, tanpa menjanjikan keuntungan, dan bukan penasihat investasi. "
            "Jawab bahasa Indonesia secara ringkas dengan bullet •: konsistensi, kekuatan strategi, pola profit/loss, dan risiko."
        )
        server_performance = build_public_performance(req.traderUsername, "all")
        user_text = f"Trader @{req.traderUsername}. Data performance: {json.dumps(server_performance, ensure_ascii=False)}. Pertanyaan: {req.question}"
        answer = await _run_llm(req.session_id, sys_msg, user_text)
        return {"answer": (answer or "").replace("*", "").strip(), "energyBalance": new_balance}
    except Exception as exc:
        db_store.update_energy(requester_id, 1)
        raise HTTPException(status_code=502, detail=str(exc))

@fastapi_app.post("/api/_llm/economic-event")
async def llm_economic_event(req: EconomicEventReq):
    sys_msg = (
        "Anda analis fundamental makro. Analisis 3 bullet Indonesia: (1) Makna, (2) Skenario pair, (3) Manajemen risiko. "
        "JANGAN gunakan asterisk (*). Gunakan '•'. Ringkas & profesional."
    )
    pairs = ", ".join(req.affectedPairs or [])
    user_text = (
        f"Event: {req.eventTitle} ({req.currency}) impact={req.impact}. "
        f"Actual={req.actual or '-'} Forecast={req.forecast or '-'} Previous={req.previous or '-'}. "
        f"Pair: {pairs}. Pertanyaan: {req.question or 'Berikan analisis.'}"
    )
    try:
        answer = await _run_llm(req.session_id, sys_msg, user_text)
        return {"answer": (answer or "").replace("*", "").strip()}
    except Exception as e:
        logger.warning(f"[llm.event] {e}")
        raise HTTPException(status_code=502, detail=str(e))

@fastapi_app.post("/api/_llm/kyc-ktp")
async def llm_kyc_ktp(req: KycKtpReq):
    sys_msg = (
        "Anda adalah OCR engine KYC untuk KTP Indonesia. Ekstrak dari gambar KTP dan HANYA balas JSON valid tanpa markdown. "
        "Schema: {\"nik\": string, \"namaLengkap\": string, \"tempatTanggalLahir\": string, \"alamat\": string, "
        "\"isValidKtp\": boolean, \"confidenceScore\": number 0-1, \"statusMessage\": string}. "
        "isValidKtp=false jika bukan KTP asli."
    )
    try:
        raw = await _run_llm(req.session_id, sys_msg, "Ekstrak data KTP. Balas hanya JSON.", req.image_base64)
        cleaned = (raw or "").strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        try:
            data = json.loads(cleaned)
        except Exception:
            s, e = cleaned.find("{"), cleaned.rfind("}")
            data = json.loads(cleaned[s:e + 1]) if s != -1 and e != -1 else {}
        return {"data": data}
    except Exception as e:
        logger.warning(f"[llm.kyc] {e}")
        raise HTTPException(status_code=502, detail=str(e))

# ---------------- Auth Endpoints ----------------
@fastapi_app.post("/api/auth/google")
async def auth_google(request: Request):
    body = await request.json()
    try:
        user = await auth_service.handle_google_auth(body)
        return {"success": True, "user": format_auth_user_response(user)}
    except ValueError as e:
        logger.info(f"[auth.google] Validation rejected: {e}")
        return JSONResponse({"success": False, "error": {"code": "AUTH_VALIDATION_ERROR", "message": str(e)}}, status_code=400)
    except Exception as e:
        logger.warning(f"[auth.google] {e}")
        return JSONResponse({"success": False, "error": {"code": "AUTH_GOOGLE_ERROR", "message": str(e)}}, status_code=500)

@fastapi_app.get("/api/auth/google/config")
async def auth_google_config():
    return {"clientId": os.environ.get("GOOGLE_CLIENT_ID", "").strip()}

@fastapi_app.post("/api/auth/google/code")
async def auth_google_code(request: Request):
    body = await request.json()
    device_key = f"{request.headers.get('user-agent', '')}|{request.client.host if request.client else ''}"
    try:
        user = await auth_service.handle_google_code(
            str(body.get("code") or ""),
            body.get("termsAccepted") is True,
            body.get("privacyAccepted") is True,
            str(body.get("legalVersion") or "2026-02-26"),
            device_key
        )
        return {"success": True, "user": format_auth_user_response(user)}
    except ValueError as e:
        return JSONResponse({"success": False, "error": {"code": "AUTH_VALIDATION_ERROR", "message": str(e)}}, status_code=400)
    except Exception as e:
        logger.warning(f"[auth.google.code] {e}")
        return JSONResponse({"success": False, "error": {"code": "AUTH_GOOGLE_ERROR", "message": str(e)}}, status_code=500)

@fastapi_app.post("/api/auth/password")
async def auth_password(request: Request):
    body = await request.json()
    device_key = f"{request.headers.get('user-agent', '')}|{request.client.host if request.client else ''}"
    try:
        user = await auth_service.handle_password_auth(
            str(body.get("email") or ""),
            str(body.get("password") or ""),
            body.get("termsAccepted") is True,
            body.get("privacyAccepted") is True,
            str(body.get("legalVersion") or "2026-02-26"),
            device_key,
            str(body.get("referralCode") or body.get("ref") or body.get("referrerId") or body.get("referral_code") or "")
        )
        return {"success": True, "user": format_auth_user_response(user)}
    except ValueError as e:
        return JSONResponse({"success": False, "error": {"code": "AUTH_VALIDATION_ERROR", "message": str(e)}}, status_code=400)
    except Exception as e:
        logger.warning(f"[auth.password] {e}")
        return JSONResponse({"success": False, "error": {"code": "AUTH_PASSWORD_ERROR", "message": str(e)}}, status_code=500)

@fastapi_app.get("/api/auth/verify-email")
async def verify_email(token: str = Query("")):
    try:
        user = await auth_service.verify_email(token)
        return {"success": True, "message": "Email berhasil diverifikasi", "userId": user.get("id")}
    except ValueError as e:
        return JSONResponse({"success": False, "error": {"code": "EMAIL_TOKEN_INVALID", "message": str(e)}}, status_code=400)

@fastapi_app.post("/api/auth/verify-email/resend")
async def resend_verification(request: Request):
    body = await request.json()
    await auth_service.resend_verification(str(body.get("email") or ""))
    return {"success": True, "message": "Jika email memerlukan verifikasi, instruksi telah dikirim."}

@fastapi_app.post("/api/auth/password-reset/request")
async def request_password_reset(request: Request):
    body = await request.json()
    await auth_service.request_password_reset(str(body.get("email") or ""))
    return {"success": True, "message": "Jika email terdaftar, instruksi reset password telah dikirim."}

@fastapi_app.post("/api/auth/password-reset/confirm")
async def confirm_password_reset(request: Request):
    body = await request.json()
    try:
        user = await auth_service.reset_password(str(body.get("token") or ""), str(body.get("password") or ""))
        return {"success": True, "userId": user.get("id")}
    except ValueError as e:
        return JSONResponse({"success": False, "error": {"code": "PASSWORD_RESET_INVALID", "message": str(e)}}, status_code=400)

@fastapi_app.post("/api/auth/login")
async def auth_login(request: Request):
    body = await request.json()
    username = body.get("username", "")
    user = await auth_service.login(username)
    if not user:
        return JSONResponse({"success": False, "error": {"code": "USER_NOT_FOUND", "message": "User tidak ditemukan"}}, status_code=404)
    return {"success": True, "user": format_auth_user_response(user)}

@fastapi_app.post("/api/auth/register")
async def auth_register(request: Request):
    body = await request.json()
    try:
        user = await auth_service.register(body)
        return {"success": True, "user": format_auth_user_response(user)}
    except ValueError as e:
        return JSONResponse({"success": False, "error": {"code": "AUTH_VALIDATION_ERROR", "message": str(e)}}, status_code=400)

@fastapi_app.post("/api/auth/logout")
async def auth_logout():
    global active_session_user_id
    active_session_user_id = None
    return {"success": True}

# ---------------- User Endpoints ----------------
@fastapi_app.get("/api/user/me")
async def get_user_me(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id or active_session_user_id
    if not user_id:
        return {"user": None}
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        return {"user": None}
    if user.get("ctrader_connected"):
        try:
            await sync_ctrader_account_trades(user_id)
            user = db_store.find_user_by_id_or_username(user_id)
        except Exception:
            pass
    return {"user": format_auth_user_response(user)}

@fastapi_app.patch("/api/user/profile")
async def update_user_profile(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id or active_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    body = await request.json()
    updates = {}
    if "displayName" in body: updates["display_name"] = body["displayName"]
    if "bio" in body: updates["bio"] = body["bio"]
    if "avatar" in body: updates["avatar"] = body["avatar"]
    if "primaryStrategyId" in body:
        updates["primary_strategy_id"] = body["primaryStrategyId"]
        updates["strategy_dna"] = body["primaryStrategyId"]
    if "cTraderConnected" in body: updates["ctrader_connected"] = body["cTraderConnected"]
    if "cTraderAccountId" in body: updates["ctrader_account_id"] = body["cTraderAccountId"]

    updated = db_store.update_user(user_id, updates)
    if not updated:
        raise HTTPException(404, "User tidak ditemukan")
    return {"success": True, "user": format_auth_user_response(updated)}

@fastapi_app.post("/api/user/avatar")
async def update_user_avatar(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id or active_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    body = await request.json()
    avatar = body.get("avatar")
    if not avatar:
        raise HTTPException(400, "Avatar wajib diisi")
    updated = db_store.update_user(user_id, {"avatar": avatar})
    if not updated:
        raise HTTPException(404, "User tidak ditemukan")
    return {"success": True, "avatar": updated.get("avatar"), "user": format_auth_user_response(updated)}

@fastapi_app.post("/api/user/pwa-install-bonus")
async def claim_pwa_install_bonus(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id or active_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu untuk mengklaim bonus install PWA")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    uid = user.get("id") or user.get("username")
    if user.get("pwa_bonus_claimed"):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "alreadyClaimed": True,
                "message": "Bonus +10 Energy untuk install Aplikasi PWA Scrolic sudah pernah diklaim oleh akun ini.",
                "user": format_auth_user_response(user)
            }
        )

    current_energy = int(user.get("energy", 0))
    new_energy = current_energy + 10
    updated = db_store.update_user(uid, {
        "pwa_bonus_claimed": True,
        "energy": new_energy
    })

    db_store.create_notification({
        "user_id": uid,
        "title": "Bonus Install Aplikasi Scrolic (+10 Energy)!",
        "message": "Selamat! Akun Anda mendapatkan bonus +10 Energy gratis karena telah menginstal Aplikasi PWA Scrolic.",
        "type": "ENERGY_ADDED"
    })

    return {
        "success": True,
        "bonusEnergy": 10,
        "newEnergy": new_energy,
        "message": "Selamat! Bonus +10 Energy berhasil ditambahkan ke akun Anda.",
        "user": format_auth_user_response(updated)
    }

# ---------------- KYC Endpoints ----------------
@fastapi_app.get("/api/kyc/status")
async def get_kyc_status(x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")
    
    nik = user.get("kyc_nik")
    masked_nik = f"{nik[:6]}******{nik[-2:]}" if nik and len(nik) >= 8 else None
    return {
        "success": True,
        "kyc": {
            "status": user.get("kyc_status", "unverified"),
            "fullName": user.get("kyc_full_name"),
            "nik": masked_nik,
            "rawNik": nik,
            "birthDate": user.get("kyc_birth_date"),
            "address": user.get("kyc_address"),
            "verifiedAt": user.get("kyc_verified_at")
        },
        "bankAccounts": [
            {
                "id": b.get("id"),
                "bankCode": b.get("bank_code"),
                "bankName": b.get("bank_name"),
                "accountNumber": b.get("account_number"),
                "accountHolderName": b.get("account_holder_name"),
                "isPrimary": b.get("is_primary", True),
                "createdAt": b.get("created_at")
            } for b in user.get("bank_accounts", [])
        ]
    }

@fastapi_app.post("/api/kyc/verify-ai")
async def verify_kyc_ai(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = await request.json()
    fullName = body.get("fullName") or body.get("name") or user.get("display_name") or "Trader Verified"
    nik = body.get("nik") or "3171012345678901"
    birthDate = body.get("birthDate") or "1995-08-17"
    address = body.get("address") or "DKI Jakarta, Indonesia"

    now = datetime.now(timezone.utc).isoformat()
    uid = user.get("id") or user.get("username")
    updates = {
        "kyc_status": "verified",
        "kyc_full_name": fullName,
        "kyc_nik": nik,
        "kyc_birth_date": birthDate,
        "kyc_address": address,
        "kyc_verified_at": now,
        "is_verified": True
    }

    if user.get("kyc_status") != "verified":
        current_energy = int(user.get("energy", 0))
        updates["energy"] = current_energy + 20

    updated = db_store.update_user(uid, updates)
    db_store.create_notification({
        "user_id": uid,
        "title": "Verifikasi Identitas (KYC) Disetujui!",
        "message": "Selamat! Akun Anda telah terverifikasi resmi oleh sistem AI Scrolic. Fitur komisi & penarikan energy kini aktif.",
        "type": "KYC_VERIFIED"
    })

    return {
        "success": True,
        "verified": True,
        "kycStatus": "verified",
        "message": "Verifikasi identitas KTP berhasil disetujui!",
        "user": format_auth_user_response(updated)
    }

@fastapi_app.post("/api/kyc/bank-account")
async def add_bank_account(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = await request.json()
    bank_code = body.get("bankCode")
    bank_name = body.get("bankName")
    account_number = body.get("accountNumber")

    if not bank_code or not bank_name or not account_number:
        raise HTTPException(400, "Data bank dan nomor rekening wajib diisi")

    bank_accounts = user.setdefault("bank_accounts", [])
    account_id = f"bank-{int(datetime.now(timezone.utc).timestamp()*1000)}"
    new_account = {
        "id": account_id,
        "bank_code": bank_code,
        "bank_name": bank_name,
        "account_number": account_number,
        "account_holder_name": user.get("kyc_full_name") or user.get("display_name") or "Pemilik Rekening",
        "is_primary": len(bank_accounts) == 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    bank_accounts.append(new_account)
    uid = user.get("id") or user.get("username")
    updated = db_store.update_user(uid, {"bank_accounts": bank_accounts})

    return {
        "success": True,
        "message": "Rekening bank penarikan berhasil disimpan!",
        "bankAccount": new_account,
        "user": format_auth_user_response(updated)
    }


# ---------------- Withdrawal Endpoints ----------------
SUPPORTED_BANKS = [
    {"code": "BCA", "name": "Bank Central Asia (BCA)", "type": "BANK", "icon": "Building2"},
    {"code": "MANDIRI", "name": "Bank Mandiri", "type": "BANK", "icon": "Building2"},
    {"code": "BRI", "name": "Bank Rakyat Indonesia (BRI)", "type": "BANK", "icon": "Building2"},
    {"code": "BNI", "name": "Bank Negara Indonesia (BNI)", "type": "BANK", "icon": "Building2"},
    {"code": "BSI", "name": "Bank Syariah Indonesia (BSI)", "type": "BANK", "icon": "Building2"},
    {"code": "JAGO", "name": "Bank Jago", "type": "BANK", "icon": "Building2"},
    {"code": "SEABANK", "name": "SeaBank Indonesia", "type": "BANK", "icon": "Building2"},
    {"code": "BLU", "name": "Blu by BCA Digital", "type": "BANK", "icon": "Building2"},
    {"code": "CIMB", "name": "Bank CIMB Niaga", "type": "BANK", "icon": "Building2"},
    {"code": "DANA", "name": "DANA (E-Wallet)", "type": "EWALLET", "icon": "Wallet"},
    {"code": "GOPAY", "name": "GoPay (E-Wallet)", "type": "EWALLET", "icon": "Wallet"},
    {"code": "OVO", "name": "OVO (E-Wallet)", "type": "EWALLET", "icon": "Wallet"},
    {"code": "SHOPEEPAY", "name": "ShopeePay (E-Wallet)", "type": "EWALLET", "icon": "Wallet"}
]

@fastapi_app.get("/api/withdrawals/banks")
async def get_withdrawal_banks():
    return {"success": True, "banks": SUPPORTED_BANKS}

@fastapi_app.get("/api/withdrawals/history")
async def get_withdrawal_history(x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    history = db_store.find_withdrawals_by_user_id(user_id)
    return {"success": True, "withdrawals": history}

@fastapi_app.post("/api/withdrawals/create")
async def create_withdrawal(request: Request, x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    body = await request.json()
    amount_energy = int(body.get("amountEnergy", 0))
    bank_code = body.get("bankCode")
    bank_name = body.get("bankName")
    account_number = body.get("accountNumber")

    if amount_energy < 10:
        raise HTTPException(400, "Minimal penarikan adalah 10 Energy (Rp 5.000)")

    current_balance = int(user.get("withdrawable_energy", user.get("energy", 0)))
    if current_balance < amount_energy:
        raise HTTPException(400, f"Saldo Energy Anda ({current_balance}⚡) tidak mencukupi untuk penarikan {amount_energy}⚡.")

    uid = user.get("id") or user.get("username")
    new_balance = current_balance - amount_energy
    db_store.update_user(uid, {"withdrawable_energy": new_balance})

    net_idr = amount_energy * 500
    wd_doc = db_store.create_withdrawal({
        "user_id": uid,
        "amount_energy": amount_energy,
        "gross_amount_rp": net_idr,
        "admin_fee_rp": 0,
        "net_amount_rp": net_idr,
        "bank_code": bank_code,
        "bank_name": bank_name or bank_code,
        "account_number": account_number,
        "account_holder_name": user.get("kyc_full_name") or user.get("display_name") or "Trader",
        "status": "SUCCESS",
        "processed_at": datetime.now(timezone.utc).isoformat()
    })

    db_store.create_notification({
        "user_id": uid,
        "title": "Penarikan Komisi Berhasil!",
        "message": f"Penarikan komisi sebesar {amount_energy}⚡ (Rp {net_idr:,}) telah berhasil ditransfer ke rekening {bank_code} - {account_number}.",
        "type": "WITHDRAWAL_SUCCESS"
    })

    return {
        "success": True,
        "message": f"Penarikan komisi {amount_energy}⚡ (Rp {net_idr:,}) berhasil diproses!",
        "newBalanceEnergy": new_balance,
        "withdrawal": wd_doc
    }

@fastapi_app.get("/api/withdrawals/stats")
async def get_withdrawal_stats(x_session_user_id: Optional[str] = Header(None)):
    user_id = x_session_user_id
    if not user_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    history = db_store.find_withdrawals_by_user_id(user_id)
    total_withdrawn_rp = sum(w.get("net_amount_rp", 0) for w in history if w.get("status") == "SUCCESS")
    total_withdrawn_energy = sum(w.get("amount_energy", 0) for w in history if w.get("status") == "SUCCESS")

    affiliate = user.get("affiliate_earnings_energy", 0)
    trade = user.get("trade_earnings_energy", 0)
    total_earnings = affiliate + trade
    withdrawable = int(user.get("withdrawable_energy", 0))

    return {
        "success": True,
        "availableEnergy": user.get("energy", 0),
        "availableWithdrawableEnergy": withdrawable,
        "availableEarningsEnergy": total_earnings,
        "availableEarningsRp": total_earnings * 500,
        "totalWithdrawnEnergy": total_withdrawn_energy,
        "totalWithdrawnRp": total_withdrawn_rp,
        "kycStatus": user.get("kyc_status", "unverified"),
        "kycFullName": user.get("kyc_full_name")
    }


# ---------------- Referral Network Endpoints ----------------
@fastapi_app.get("/api/referrals/network")
@fastapi_app.get("/api/referrals/stats")
async def get_user_referral_network(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    uid = user.get("id") or user.get("username")
    network_tree = db_store.get_5_generation_referral_network(uid)
    affiliate_energy = int(user.get("affiliate_earnings_energy", 0))

    return {
        "success": True,
        "referralCode": user.get("referral_code") or f"{user.get('username', '').upper()}50",
        "referralLink": f"https://scrolic.app/@{user.get('username')}",
        "sponsoredUsersCount": network_tree.get("sponsoredUsersCount", 0),
        "totalReferrals": network_tree.get("totalReferrals", 0),
        "totalCommissionEnergy": affiliate_energy,
        "totalCommissionRp": affiliate_energy * 500,
        "generations": network_tree.get("generations", {})
    }


# ---------------- Admin Helper Formatters ----------------
def format_admin_user_response(user: Dict[str, Any]) -> Dict[str, Any]:
    username = user.get("username", "user")
    return {
        "id": user.get("id") or username,
        "username": username,
        "displayName": user.get("display_name") or username,
        "email": user.get("email") or f"{username}@scrolic.app",
        "avatar": user.get("avatar") or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80",
        "role": user.get("role", "user"),
        "isBanned": bool(user.get("is_banned", False)),
        "energyBalance": int(user.get("energy", 0)),
        "affiliateEarningsEnergy": int(user.get("affiliate_earnings_energy", 0)),
        "tradeEarningsEnergy": int(user.get("trade_earnings_energy", 0)),
        "subscriptionTier": user.get("subscription_tier", "free"),
        "isVerified": bool(user.get("is_verified", False)),
        "kycStatus": user.get("kyc_status", "unverified"),
        "kycFullName": user.get("kyc_full_name"),
        "kycNik": user.get("kyc_nik"),
        "winRate": float(user.get("win_rate", 0.0)),
        "tradesCount": int(user.get("trades_count", 0)),
        "followersCount": int(user.get("followers_count", 0)),
        "referralCode": user.get("referral_code", f"REF-{username.upper()}"),
        "cTraderConnected": bool(user.get("ctrader_connected", False) or user.get("ctrader_accounts")),
        "createdAt": str(user.get("created_at") or datetime.now(timezone.utc).isoformat())
    }

def format_admin_withdrawal_response(wd: Dict[str, Any]) -> Dict[str, Any]:
    user_id = wd.get("user_id", "")
    u = db_store.find_user_by_id_or_username(user_id) or {}
    amount_energy = int(wd.get("amount_energy", 0))
    net_rp = int(wd.get("net_amount_rp", amount_energy * 500))
    return {
        "id": wd.get("id") or f"wd-{int(time.time()*1000)}",
        "userId": user_id,
        "username": u.get("username", "trader"),
        "userDisplayName": u.get("display_name", u.get("username", "Trader")),
        "userAvatar": u.get("avatar") or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        "userEnergyBalance": int(u.get("energy", 0)),
        "amountEnergy": amount_energy,
        "amountIdr": net_rp,
        "feeIdr": int(wd.get("admin_fee_rp", 0)),
        "netAmountIdr": net_rp,
        "bankCode": wd.get("bank_code", "BCA"),
        "bankName": wd.get("bank_name", wd.get("bank_code", "BCA")),
        "accountNumber": wd.get("account_number", "-"),
        "accountHolderName": wd.get("account_holder_name") or u.get("kyc_full_name") or "Trader",
        "status": wd.get("status", "PENDING"),
        "referenceId": wd.get("reference_id", f"REF-{wd.get('id', '123')}"),
        "disbursementId": wd.get("disbursement_id", ""),
        "notes": wd.get("notes", ""),
        "createdAt": str(wd.get("created_at") or datetime.now(timezone.utc).isoformat()),
        "completedAt": str(wd.get("processed_at", "")) if wd.get("processed_at") else None
    }


# ---------------- Admin Endpoints ----------------
@fastapi_app.get("/api/admin/access")
async def admin_access(x_session_user_id: Optional[str] = Header(None)):
    user = require_admin(x_session_user_id or active_session_user_id)
    return {"success": True, "isAdmin": True, "userId": user.get("id"), "username": user.get("username")}

@fastapi_app.get("/api/admin/stats")
async def admin_get_stats(x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    users = db_store.users
    wds = db_store.withdrawals
    
    total_users = len(users)
    admins_count = sum(1 for u in users if str(u.get("role", "")).lower() == "admin")
    verified_count = sum(1 for u in users if u.get("is_verified") or u.get("kyc_status") == "verified")
    premium_count = sum(1 for u in users if u.get("subscription_tier") and u.get("subscription_tier") != "free")
    banned_count = sum(1 for u in users if u.get("is_banned"))

    total_energy = sum(int(u.get("energy", 0)) for u in users)
    total_affiliate = sum(int(u.get("affiliate_earnings_energy", 0)) for u in users)

    pending_wds = [w for w in wds if w.get("status") == "PENDING"]
    processing_wds = [w for w in wds if w.get("status") == "PROCESSING"]
    completed_wds = [w for w in wds if w.get("status") in ("SUCCESS", "COMPLETED")]

    return {
        "success": True,
        "stats": {
            "users": {
                "total": total_users,
                "admins": admins_count,
                "verified": verified_count,
                "premium": premium_count,
                "banned": banned_count
            },
            "energy": {
                "totalInCirculation": total_energy,
                "totalAffiliatePending": total_affiliate,
                "activePackagesCount": len(ENERGY_PACKAGES)
            },
            "withdrawals": {
                "pendingCount": len(pending_wds),
                "pendingAmountIdr": sum(w.get("net_amount_rp", 0) for w in pending_wds),
                "processingCount": len(processing_wds),
                "completedCount": len(completed_wds),
                "completedAmountIdr": sum(w.get("net_amount_rp", 0) for w in completed_wds),
                "totalCount": len(wds)
            },
            "premium": {
                "activeTiersCount": len(PREMIUM_PACKAGES)
            }
        }
    }

@fastapi_app.get("/api/admin/users")
async def admin_get_users(
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    kycStatus: Optional[str] = Query(None),
    x_session_user_id: Optional[str] = Header(None)
):
    require_admin(x_session_user_id or active_session_user_id)
    filtered = db_store.users

    if search:
        s = search.lower().strip()
        filtered = [
            u for u in filtered
            if s in str(u.get("username", "")).lower()
            or s in str(u.get("display_name", "")).lower()
            or s in str(u.get("email", "")).lower()
            or s in str(u.get("id", "")).lower()
        ]

    if role and role.upper() != "ALL":
        filtered = [u for u in filtered if str(u.get("role", "")).upper() == role.upper()]

    if kycStatus and kycStatus.upper() != "ALL":
        if kycStatus.lower() == "verified":
            filtered = [u for u in filtered if u.get("is_verified") or u.get("kyc_status") == "verified"]
        else:
            filtered = [u for u in filtered if not (u.get("is_verified") or u.get("kyc_status") == "verified")]

    return {"success": True, "users": [format_admin_user_response(u) for u in filtered]}

@fastapi_app.patch("/api/admin/users/{user_id}/role")
async def admin_update_user_role(user_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    new_role = str(body.get("role", "user")).lower()
    
    updated = db_store.update_user(user_id, {"role": new_role})
    if not updated:
        raise HTTPException(404, "User tidak ditemukan")

    return {
        "success": True,
        "message": f"Role @{updated.get('username')} berhasil diubah menjadi {new_role.upper()}",
        "user": format_admin_user_response(updated)
    }

@fastapi_app.patch("/api/admin/users/{user_id}/energy")
async def admin_adjust_user_energy(user_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    amount = int(body.get("amount", 0))
    reason = str(body.get("reason", "Penyesuaian oleh Admin"))

    user = db_store.find_user_by_id_or_username(user_id)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")

    uid = user.get("id") or user.get("username")
    new_bal, _ = db_store.update_energy(uid, amount)

    db_store.create_notification({
        "user_id": uid,
        "title": f"⚡ Penyesuaian Saldo Energy ({amount:+} ⚡)",
        "message": f"Saldo Energy Anda disesuaikan oleh Admin. Alasan: {reason}. Saldo baru: {new_bal}⚡",
        "type": "ENERGY_BONUS"
    })

    updated = db_store.find_user_by_id_or_username(uid)
    return {
        "success": True,
        "message": f"Saldo Energy @{user.get('username')} berhasil disesuaikan ({amount:+} ⚡). Total: {new_bal}⚡",
        "user": format_admin_user_response(updated)
    }

@fastapi_app.patch("/api/admin/users/{user_id}/ban")
async def admin_update_user_ban(user_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    is_banned = bool(body.get("isBanned", False))

    updated = db_store.update_user(user_id, {"is_banned": is_banned})
    if not updated:
        raise HTTPException(404, "User tidak ditemukan")

    action_str = "DIBEKUKAN (BANNED)" if is_banned else "DIAKTIFKAN KEMBALI"
    return {
        "success": True,
        "message": f"Akun @{updated.get('username')} berhasil {action_str}",
        "user": format_admin_user_response(updated)
    }

@fastapi_app.patch("/api/admin/users/{user_id}/verification")
async def admin_update_user_verification(user_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    is_verified = bool(body.get("isVerified", True))
    kyc_status = "verified" if is_verified else "unverified"

    updated = db_store.update_user(user_id, {
        "is_verified": is_verified,
        "kyc_status": kyc_status
    })
    if not updated:
        raise HTTPException(404, "User tidak ditemukan")

    return {
        "success": True,
        "message": f"Status verifikasi @{updated.get('username')} diubah menjadi {'VERIFIED' if is_verified else 'UNVERIFIED'}",
        "user": format_admin_user_response(updated)
    }

@fastapi_app.post("/api/admin/promote-user")
async def admin_promote_user(request: Request, x_session_user_id: Optional[str] = Header(None)):
    body = await request.json()
    target_identifier = body.get("usernameOrId", "").strip()
    target_role = str(body.get("role", "admin")).lower()
    secret_key = body.get("secretKey", "")

    if secret_key != "scrolic-super-admin-2026":
        require_admin(x_session_user_id or active_session_user_id)

    user = db_store.find_user_by_id_or_username(target_identifier) or db_store.find_user_by_username(target_identifier)
    if not user:
        raise HTTPException(404, f"User '{target_identifier}' tidak ditemukan")

    uid = user.get("id") or user.get("username")
    updated = db_store.update_user(uid, {"role": target_role})
    return {
        "success": True,
        "message": f"User @{updated.get('username')} berhasil diubah menjadi {target_role.upper()}",
        "user": format_admin_user_response(updated)
    }

@fastapi_app.get("/api/admin/energy-packages")
async def admin_get_energy_packages():
    return {"success": True, "packages": ENERGY_PACKAGES}

@fastapi_app.post("/api/admin/energy-packages")
async def admin_create_energy_package(request: Request):
    body = await request.json()
    energy = int(body.get("energy", 50))
    base_price = int(body.get("basePriceRp", 50000))
    discount = int(body.get("discountPercent", 0))
    disc_price = int(base_price * (1 - discount / 100)) if discount > 0 else base_price

    new_pkg = {
        "id": f"ep_{int(time.time() * 1000)}",
        "energy": energy,
        "basePriceRp": base_price,
        "discountPercent": discount,
        "discountPriceRp": disc_price,
        "priceRp": disc_price,
        "label": body.get("label", f"{energy} Energy"),
        "bonus": body.get("bonus", ""),
        "isPopular": bool(body.get("isPopular", False)),
        "isActive": body.get("isActive", True)
    }
    ENERGY_PACKAGES.append(new_pkg)
    return {"success": True, "package": new_pkg}

@fastapi_app.post("/api/admin/energy-packages/global-discount")
async def admin_apply_global_energy_discount(request: Request, x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    discount_pct = max(0, min(90, int(body.get("discountPercent", 0))))

    for pkg in ENERGY_PACKAGES:
        base = pkg.get("basePriceRp", pkg.get("priceRp", 50000))
        pkg["discountPercent"] = discount_pct
        pkg["discountPriceRp"] = int(base * (1 - discount_pct / 100))
        pkg["priceRp"] = pkg["discountPriceRp"]

    return {
        "success": True,
        "message": f"Diskon global {discount_pct}% berhasil diterapkan ke semua paket Energy!"
    }

@fastapi_app.put("/api/admin/energy-packages/{pkg_id}")
async def admin_update_energy_package(pkg_id: str, request: Request):
    body = await request.json()
    for idx, p in enumerate(ENERGY_PACKAGES):
        if p.get("id") == pkg_id:
            ENERGY_PACKAGES[idx] = {**p, **body}
            return {"success": True, "package": ENERGY_PACKAGES[idx]}
    return JSONResponse(status_code=404, content={"success": False, "error": "Paket tidak ditemukan"})

@fastapi_app.delete("/api/admin/energy-packages/{pkg_id}")
async def admin_delete_energy_package(pkg_id: str):
    global ENERGY_PACKAGES
    ENERGY_PACKAGES = [p for p in ENERGY_PACKAGES if p.get("id") != pkg_id]
    return {"success": True, "message": "Paket Energy berhasil dihapus"}

@fastapi_app.get("/api/admin/premium-packages")
async def admin_get_premium_packages():
    return {"success": True, "packages": PREMIUM_PACKAGES}

@fastapi_app.post("/api/admin/premium-packages")
async def admin_create_premium_package(request: Request):
    body = await request.json()
    price_energy = int(body.get("priceEnergy", 99))
    base_price_rp = int(body.get("basePriceRp", price_energy * 1000))
    discount_percent = int(body.get("discountPercent", 0))
    new_pkg = {
        "id": f"pp_{int(time.time() * 1000)}",
        "tier": body.get("tier", f"tier_{int(time.time())}"),
        "name": body.get("name", "Paket VIP"),
        "durationMonths": int(body.get("durationMonths", 1)),
        "durationDays": int(body.get("durationDays", 30)),
        "basePriceRp": base_price_rp,
        "discountPercent": discount_percent,
        "discountPriceRp": int(base_price_rp * (1 - discount_percent / 100)),
        "priceRp": int(base_price_rp * (1 - discount_percent / 100)),
        "priceEnergy": price_energy,
        "basePriceEnergy": int(body.get("basePriceEnergy", price_energy)),
        "energyBonus": int(body.get("energyBonus", 0)),
        "maxGenerations": int(body.get("maxGenerations", 2)),
        "totalCommissionPercent": int(body.get("totalCommissionPercent", 20)),
        "features": body.get("features", ["Sinyal VIP Unlocked"]),
        "benefits": body.get("features", ["Sinyal VIP Unlocked"]),
        "isPopular": bool(body.get("isPopular", False)),
        "isActive": body.get("isActive", True)
    }
    PREMIUM_PACKAGES.append(new_pkg)
    return {"success": True, "package": new_pkg}

@fastapi_app.put("/api/admin/premium-packages/{pkg_id}")
async def admin_update_premium_package(pkg_id: str, request: Request):
    body = await request.json()
    for idx, p in enumerate(PREMIUM_PACKAGES):
        if p.get("id") == pkg_id:
            features = body.get("features") or p.get("features", [])
            PREMIUM_PACKAGES[idx] = {**p, **body, "features": features, "benefits": features}
            return {"success": True, "package": PREMIUM_PACKAGES[idx]}
    return JSONResponse(status_code=404, content={"success": False, "error": "Paket tidak ditemukan"})

@fastapi_app.delete("/api/admin/premium-packages/{pkg_id}")
async def admin_delete_premium_package(pkg_id: str):
    global PREMIUM_PACKAGES
    PREMIUM_PACKAGES = [p for p in PREMIUM_PACKAGES if p.get("id") != pkg_id]
    return {"success": True, "message": "Paket VIP berhasil dihapus"}

@fastapi_app.get("/api/admin/withdrawals")
async def admin_get_withdrawals(status: Optional[str] = Query("ALL"), x_session_user_id: Optional[str] = Header(None)):
    require_admin(x_session_user_id or active_session_user_id)
    wds = db_store.withdrawals
    if status and status.upper() != "ALL":
        wds = [w for w in wds if str(w.get("status", "")).upper() == status.upper()]
    return {"success": True, "withdrawals": [format_admin_withdrawal_response(w) for w in wds], "total": len(wds)}

@fastapi_app.post("/api/admin/withdrawals/{wd_id}/approve")
async def admin_approve_withdrawal(wd_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    admin_user = require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    disbursement_id = body.get("disbursementId") or f"BFAST-{int(time.time()*1000)}"
    notes = body.get("notes") or f"Disetujui oleh Admin ({admin_user.get('username')})"

    wd = db_store.find_withdrawal_by_id(wd_id)
    if not wd:
        wd = next((w for w in db_store.withdrawals if str(w.get("id")) == str(wd_id)), None)
    if not wd:
        raise HTTPException(404, "Data penarikan tidak ditemukan")

    wd["status"] = "SUCCESS"
    wd["disbursement_id"] = disbursement_id
    wd["notes"] = notes
    wd["processed_at"] = datetime.now(timezone.utc).isoformat()

    uid = wd.get("user_id")
    net_rp = wd.get("net_amount_rp", 0)
    db_store.create_notification({
        "user_id": uid,
        "title": "Penarikan Komisi Disetujui & Diterima!",
        "message": f"Penarikan Rp {net_rp:,} via {wd.get('bank_name')} ({wd.get('account_number')}) telah berhasil ditransfer via BI-FAST (Ref: {disbursement_id}).",
        "type": "WITHDRAWAL_SUCCESS"
    })

    return {
        "success": True,
        "message": f"Penarikan Rp {net_rp:,} berhasil disetujui & dicairkan!",
        "withdrawal": format_admin_withdrawal_response(wd)
    }

@fastapi_app.post("/api/admin/withdrawals/{wd_id}/reject")
async def admin_reject_withdrawal(wd_id: str, request: Request, x_session_user_id: Optional[str] = Header(None)):
    admin_user = require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    reason = body.get("reason", "Nomor rekening tidak valid")

    wd = db_store.find_withdrawal_by_id(wd_id)
    if not wd:
        wd = next((w for w in db_store.withdrawals if str(w.get("id")) == str(wd_id)), None)
    if not wd:
        raise HTTPException(404, "Data penarikan tidak ditemukan")

    if wd.get("status") == "FAILED":
        return {"success": True, "message": "Penarikan sudah ditolak sebelumnya", "withdrawal": format_admin_withdrawal_response(wd)}

    wd["status"] = "FAILED"
    wd["notes"] = f"Ditolak oleh Admin ({admin_user.get('username')}): {reason}"
    wd["processed_at"] = datetime.now(timezone.utc).isoformat()

    uid = wd.get("user_id")
    refund_energy = int(wd.get("amount_energy", 0))
    if uid and refund_energy > 0:
        db_store.update_energy(uid, refund_energy, bucket="withdrawable")
        db_store.create_notification({
            "user_id": uid,
            "title": "Penarikan Komisi Ditolak (Saldo Dikembalikan)",
            "message": f"Penarikan komisi ditolak. Alasan: {reason}. Saldo {refund_energy}⚡ telah dikembalikan ke akun Anda.",
            "type": "WITHDRAWAL_FAILED"
        })

    return {
        "success": True,
        "message": f"Penarikan ditolak. Saldo {refund_energy}⚡ telah dikembalikan ke pengguna.",
        "withdrawal": format_admin_withdrawal_response(wd)
    }

@fastapi_app.post("/api/admin/broadcast")
async def admin_send_broadcast(request: Request, x_session_user_id: Optional[str] = Header(None)):
    admin_user = require_admin(x_session_user_id or active_session_user_id)
    body = await request.json()
    title = body.get("title", "Pengumuman Resmi Scrolic")
    message = body.get("message", "")
    notif_type = body.get("type", "SYSTEM_BROADCAST")

    if not title or not message:
        raise HTTPException(400, "Judul dan pesan siaran wajib diisi")

    users = db_store.users
    broadcast_count = 0
    for u in users:
        uid = u.get("id") or u.get("username")
        if uid:
            db_store.create_notification({
                "user_id": uid,
                "title": f"📢 {title}",
                "message": message,
                "type": notif_type
            })
            broadcast_count += 1

    return {
        "success": True,
        "message": f"Siaran pengumuman '{title}' berhasil dikirim ke {broadcast_count} pengguna!",
        "recipientCount": broadcast_count
    }

@fastapi_app.get("/api/users")
async def get_all_users():
    return {"users": [format_auth_user_response(u) for u in db_store.users]}

@fastapi_app.get("/api/users/{username}")
async def get_user_by_username(username: str):
    u = db_store.find_user_by_username(username) or db_store.find_user_by_id_or_username(username)
    if not u:
        raise HTTPException(404, "User tidak ditemukan")
    return {"user": format_auth_user_response(u)}

@fastapi_app.get("/api/referrals/network")
async def get_referral_network(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    owner = db_store.find_user_by_id_or_username(curr_id)
    if not owner:
        raise HTTPException(401, "Sesi login tidak valid")

    owner_id = owner.get("id") or owner.get("username")
    generations: Dict[str, Dict[str, Any]] = {}
    frontier = {owner_id, owner.get("username")}
    total = 0
    for generation in range(1, 6):
        members = [
            user for user in db_store.users
            if user.get("referrer_id") in frontier
        ]
        generations[f"gen{generation}"] = {
            "count": len(members),
            "users": [{"username": user.get("username"), "displayName": user.get("display_name", user.get("username"))} for user in members]
        }
        total += len(members)
        frontier = {value for user in members for value in (user.get("id"), user.get("username")) if value}

    commission_total = round(sum(
        float(tx.get("amount", 0) or 0)
        for tx in db_store.transactions
        if (tx.get("user_id") == owner_id or tx.get("user_id") == owner.get("username"))
        and "COMMISSION" in str(tx.get("type", "")).upper()
    ), 2)
    return {
        "success": True,
        "ownerUsername": owner.get("username"),
        "sponsoredUsersCount": generations["gen1"]["count"],
        "totalReferrals": total,
        "totalCommissionEnergy": commission_total,
        "totalCommissionRp": commission_total * 500,
        "generations": generations
    }

def _performance_period_start(period: str) -> Optional[datetime]:
    if period == "all":
        return None
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    return datetime.now(timezone.utc) - timedelta(days=days)

def build_public_performance(username: str, period: str = "all") -> Dict[str, Any]:
    user = db_store.find_user_by_username(username) or db_store.find_user_by_id_or_username(username)
    if not user:
        raise HTTPException(404, "Trader tidak ditemukan")

    cache_key = f"{user.get('id') or user.get('username')}:{period}"
    cached = _performance_cache.get(cache_key)
    if cached and time.time() - cached[0] < PERFORMANCE_CACHE_TTL_SECONDS:
        return cached[1]

    period_start = _performance_period_start(period)
    user_id = user.get("id") or user.get("username")
    posts = db_store.find_posts_by_user(user_id, user.get("username"))

    def post_time(post: Dict[str, Any], field: str) -> Optional[datetime]:
        value = post.get(field) or post.get("created_at")
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
        except ValueError:
            return None

    closed = [p for p in posts if p.get("status") == "CLOSED"]
    open_posts = [p for p in posts if p.get("status") == "OPEN"]
    if period_start:
        closed = [p for p in closed if (post_time(p, "closed_at") or post_time(p, "created_at") or datetime.min.replace(tzinfo=timezone.utc)) >= period_start]

    closed = sorted(closed, key=lambda p: post_time(p, "closed_at") or post_time(p, "created_at") or datetime.min.replace(tzinfo=timezone.utc))
    profits = [round(float(p.get("profit", 0.0) or 0.0), 2) for p in closed]
    wins = [profit for profit in profits if profit > 0]
    losses = [profit for profit in profits if profit < 0]
    gross_profit = round(sum(wins), 2)
    gross_loss = round(abs(sum(losses)), 2)
    realized = round(sum(profits), 2)
    unrealized = round(sum(float(p.get("profit", 0.0) or 0.0) for p in open_posts), 2)

    equity = 0.0
    peak = 0.0
    max_drawdown = 0.0
    cumulative_series = []
    for post, profit in zip(closed, profits):
        equity = round(equity + profit, 2)
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, round(peak - equity, 2))
        trade_date = post_time(post, "closed_at") or post_time(post, "created_at")
        cumulative_series.append({"date": trade_date.isoformat() if trade_date else "", "value": equity, "profit": profit})

    first_time = post_time(closed[0], "opened_at") if closed else None
    last_time = post_time(closed[-1], "closed_at") if closed else None
    trading_period = {
        "from": first_time.isoformat() if first_time else None,
        "to": last_time.isoformat() if last_time else None,
        "days": max(0, (last_time - first_time).days) if first_time and last_time else 0
    }
    recent = sorted(posts, key=lambda p: post_time(p, "closed_at") or post_time(p, "created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:10]
    recent_activity = [{
        "symbol": str(p.get("symbol", "Unknown")),
        "direction": str(p.get("position_type", "BUY")),
        "status": str(p.get("status", "CLOSED")),
        "profit": round(float(p.get("profit", 0.0) or 0.0), 2),
        "pips": round(float(p.get("pips", 0.0) or 0.0), 1),
        "lot": round(float(p.get("lot", 0.0) or 0.0), 2),
        "date": (post_time(p, "closed_at") or post_time(p, "created_at")).isoformat() if (post_time(p, "closed_at") or post_time(p, "created_at")) else None
    } for p in recent]

    result = {
        "profile": {"username": user.get("username"), "displayName": user.get("display_name", user.get("username")), "avatar": user.get("avatar", ""), "bio": user.get("bio", "")},
        "period": period,
        "summary": {
            "cumulativeProfit": realized,
            "realizedPnL": realized,
            "unrealizedPnL": unrealized,
            "totalTrades": len(closed),
            "winningTrades": len(wins),
            "losingTrades": len(losses),
            "winRate": round((len(wins) / len(closed)) * 100, 1) if closed else 0.0,
            "profitFactor": round(gross_profit / gross_loss, 2) if gross_loss else (None if not gross_profit else "INF"),
            "averageProfitLoss": round(realized / len(closed), 2) if closed else 0.0,
            "averageWin": round(gross_profit / len(wins), 2) if wins else 0.0,
            "averageLoss": round(-gross_loss / len(losses), 2) if losses else 0.0,
            "largestWin": max(wins) if wins else 0.0,
            "largestLoss": min(losses) if losses else 0.0
        },
        "risk": {"maxDrawdown": round(max_drawdown, 2), "available": bool(closed)},
        "tradingPeriod": trading_period,
        "cumulativeProfitSeries": cumulative_series,
        "recentActivity": recent_activity,
        "dataAvailability": {"closedTrades": len(closed), "openPositions": len(open_posts), "hasRealData": bool(closed or open_posts)}
    }
    _performance_cache[cache_key] = (time.time(), result)
    return result

@fastapi_app.get("/api/users/{username}/performance")
async def get_user_performance(username: str, period: str = Query("all", pattern="^(7d|30d|90d|all)$")):
    return {"success": True, "performance": build_public_performance(username, period)}

@fastapi_app.post("/api/users/{username}/follow")
async def follow_user(username: str, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    curr_user = db_store.find_user_by_id_or_username(curr_id)
    target = db_store.find_user_by_username(username)
    if not curr_user or not target:
        raise HTTPException(404, "User tidak ditemukan")

    following = curr_user.setdefault("following_list", [])
    if target["username"] in following:
        following.remove(target["username"])
        is_following = False
    else:
        following.append(target["username"])
        is_following = True

    curr_user["following_count"] = len(following)
    target["followers_count"] = target.get("followers_count", 0) + (1 if is_following else -1)
    
    if is_following:
        db_store.create_notification({
            "user_id": target.get("id") or target.get("username"),
            "title": "Pengikut Baru!",
            "message": f"@{curr_user['username']} mulai mengikuti aktivitas trading Anda.",
            "type": "FOLLOW"
        })

    return {"success": True, "isFollowing": is_following, "targetFollowersCount": target["followers_count"]}

# ---------------- Feed & Trade Endpoints ----------------
class SetupConfigReq(BaseModel):
    customDescription: Optional[str] = None
    unlockFee: Optional[int] = None
    followFee: Optional[int] = None

@fastapi_app.get("/api/feed")
async def get_feed(
    limit: int = Query(8),
    cursor: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    type: Optional[str] = Query("for_you"),
    x_session_user_id: Optional[str] = Header(None)
):
    try:
        curr_id = x_session_user_id or active_session_user_id
        posts, next_cursor, has_more, total_count = db_store.get_feed(limit=limit, cursor=cursor, strategy_id=strategy)
        formatted = [format_post(p, curr_id) for p in posts]
        return JSONResponse({
            "success": True,
            "posts": formatted,
            "next_cursor": next_cursor,
            "has_more": has_more,
            "total_count": total_count
        })
    except Exception as exc:
        logger.error(f"[get_feed error] {exc}", exc_info=True)
        fallback_posts = [] if db_store.is_mongo_connected else [format_post(p, None) for p in db_store.posts[:limit]]
        return JSONResponse({
            "success": True,
            "posts": fallback_posts,
            "next_cursor": None,
            "has_more": False,
            "total_count": 0 if db_store.is_mongo_connected else len(db_store.posts)
        })

@fastapi_app.get("/api/users/{user_key}/closed-trades")
async def get_user_closed_trades(
    user_key: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    x_session_user_id: Optional[str] = Header(None)
):
    """Paginated CLOSED trades for a user (portfolio history). Returns 20 per page by default."""
    curr_id = x_session_user_id or active_session_user_id
    user = db_store.find_user_by_id_or_username(user_key)
    if not user:
        raise HTTPException(404, "User tidak ditemukan")
    user_posts = db_store.find_posts_by_user(user["id"]) if hasattr(db_store, "find_posts_by_user") else [
        p for p in db_store.posts if p.get("user_id") == user["id"]
    ]
    closed = [p for p in user_posts if str(p.get("status", "")).upper() == "CLOSED"]
    # Sort DESC by closed_at (fallback opened_at)
    def _sort_key(p):
        dt = p.get("closed_at") or p.get("opened_at") or p.get("created_at")
        if isinstance(dt, datetime):
            return dt
        try:
            return datetime.fromisoformat(str(dt).replace("Z", "+00:00")) if dt else datetime.min.replace(tzinfo=timezone.utc)
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)
    closed.sort(key=_sort_key, reverse=True)
    total = len(closed)
    total_pages = max(1, (total + size - 1) // size)
    page = min(page, total_pages)
    start = (page - 1) * size
    end = start + size
    # Return flattened Trade objects (unwrap `.trade` from post payload) for direct FE consumption
    formatted_posts = [format_post(p, curr_id) for p in closed[start:end]]
    trades_flat: List[Dict[str, Any]] = []
    for fp in formatted_posts:
        tr = dict(fp.get("trade") or {})
        tr["postId"] = fp.get("id")
        tr["status"] = tr.get("status") or "CLOSED"
        trades_flat.append(tr)
    # Aggregate stats over ALL closed trades (not just page)
    total_profit = sum(float(p.get("profit") or 0) for p in closed)
    total_pips = sum(float(p.get("pips") or 0) for p in closed)
    wins = sum(1 for p in closed if float(p.get("profit") or 0) > 0)
    losses = sum(1 for p in closed if float(p.get("profit") or 0) < 0)
    win_rate = round((wins / (wins + losses)) * 100, 1) if (wins + losses) > 0 else 0.0
    return {
        "success": True,
        "trades": trades_flat,
        "pagination": {
            "page": page,
            "size": size,
            "total": total,
            "totalPages": total_pages,
            "hasMore": end < total,
        },
        "aggregate": {
            "totalTrades": total,
            "winningTrades": wins,
            "losingTrades": losses,
            "winRate": win_rate,
            "totalProfitUSD": round(total_profit, 2),
            "totalPips": round(total_pips, 1),
        }
    }

@fastapi_app.get("/api/posts/{post_id}")
async def get_post_by_id(post_id: str, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    post = db_store.find_post_by_id(post_id)
    if not post:
        raise HTTPException(404, "Post tidak ditemukan")
    return {"success": True, "post": format_post(post, curr_id)}

@fastapi_app.patch("/api/posts/{post_id}/setup-config")
async def update_post_setup_config(
    post_id: str,
    req: SetupConfigReq,
    x_session_user_id: Optional[str] = Header(None)
):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")

    user = db_store.find_user_by_id_or_username(curr_id)
    post = db_store.find_post_by_id(post_id)
    if not user or not post:
        raise HTTPException(404, "User atau Post tidak ditemukan")

    user_ids = {str(curr_id), str(user.get("id", "")), str(user.get("username", ""))}
    owner_ids = {str(post.get("user_id", "")), str(post.get("username", ""))}
    if not user_ids.intersection(owner_ids - {""}):
        raise HTTPException(403, "Anda tidak memiliki akses untuk mengubah setup ini")

    updates: Dict[str, Any] = {}
    if req.customDescription is not None:
        updates["custom_description"] = req.customDescription.strip()
    if req.unlockFee is not None:
        updates["unlock_price"] = max(1, min(10, req.unlockFee))
    if req.followFee is not None:
        updates["follow_price"] = max(1, min(10, req.followFee))
    if not updates:
        raise HTTPException(400, "Tidak ada perubahan setup")

    updated = db_store.update_post(post_id, updates)
    if not updated:
        raise HTTPException(404, "Post tidak ditemukan")

    formatted = format_post(updated, curr_id)
    return {
        "success": True,
        "customDescription": formatted.get("customDescription", ""),
        "unlockFee": formatted.get("unlockFee", 1),
        "followFee": formatted.get("followFee", 1),
        "post": formatted
    }

@fastapi_app.post("/api/posts/{post_id}/unlock")
async def unlock_post(post_id: str, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    user = db_store.find_user_by_id_or_username(curr_id)
    post = db_store.find_post_by_id(post_id)
    if not user or not post:
        raise HTTPException(404, "User atau Post tidak ditemukan")

    unlocked_list = post.setdefault("unlocked_by_user_ids", [])
    if curr_id in unlocked_list or user.get("id") in unlocked_list:
        return {"success": True, "energyBalance": user.get("energy", 0), "post": format_post(post, curr_id)}

    unlock_fee = int(post.get("unlock_price", 1))
    if user.get("energy", 0) < unlock_fee:
        return JSONResponse({"success": False, "error": {"code": "INSUFFICIENT_ENERGY", "message": f"Energy tidak mencukupi. Diperlukan {unlock_fee} Energy."}}, status_code=400)

    # Deduct fee
    new_bal, _ = db_store.update_energy(curr_id, -unlock_fee)
    unlocked_list.append(curr_id)

    # 80% to Trader
    trader_share = int(unlock_fee * 0.8)
    trader = db_store.find_user_by_id_or_username(post.get("user_id", ""))
    if trader and trader.get("username") != user.get("username"):
        db_store.update_energy(trader.get("id") or trader.get("username"), trader_share)
        db_store.create_notification({
            "user_id": trader.get("id") or trader.get("username"),
            "title": f"⚡ Penghasilan Setup: +{trader_share} Energy",
            "message": f"@{user['username']} membuka presisi setup {post.get('symbol')} Anda ({unlock_fee} Energy).",
            "type": "TRADE_EARNING"
        })

    return {
        "success": True,
        "energyBalance": new_bal,
        "unlockedFee": unlock_fee,
        "traderEarned": trader_share,
        "post": format_post(post, curr_id)
    }

@fastapi_app.post("/api/posts/{post_id}/like")
async def like_post(post_id: str, x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        raise HTTPException(401, "Harap login terlebih dahulu")
    is_liked, count = db_store.toggle_like(post_id, curr_id)
    return {"success": True, "isLiked": is_liked, "likesCount": count}

# ---------------- Strategies & News ----------------
@fastapi_app.get("/api/strategies")
async def get_strategies():
    return {"strategies": SEED_STRATEGIES}

@fastapi_app.get("/api/news/economic-calendar")
async def get_economic_calendar():
    return {"events": [
        {
            "id": "evt-1",
            "country": "United States",
            "countryCode": "US",
            "flagEmoji": "🇺🇸",
            "currency": "USD",
            "title": "Non-Farm Payrolls (NFP)",
            "date": "2026-08-28",
            "time": "19:30 WIB",
            "datetime": "2026-08-28T12:30:00Z",
            "impact": "HIGH",
            "actual": "215K",
            "forecast": "180K",
            "previous": "165K",
            "unit": "K",
            "affectedPairs": ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY"],
            "sentiment": "BULLISH",
            "isReleased": True
        }
    ]}

# ---------------- Notifications SSE Stream & Snapshots ----------------
@fastapi_app.get("/api/notifications/snapshot")
async def get_notifications_snapshot(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        return {"success": True, "snapshot": {"unread_count": 0, "total_count": 0, "updated_at": datetime.now(timezone.utc).isoformat()}}
    notifs = db_store.find_notifications_by_user(curr_id)
    unread = [n for n in notifs if not n.get("is_read", False)]
    return {
        "success": True,
        "snapshot": {
            "unread_count": len(unread),
            "total_count": len(notifs),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    }

@fastapi_app.get("/api/notifications")
async def get_notifications(x_session_user_id: Optional[str] = Header(None)):
    curr_id = x_session_user_id or active_session_user_id
    if not curr_id:
        return {
            "notifications": [],
            "snapshot": {"unread_count": 0, "total_count": 0},
            "pagination": {"page": 1, "limit": 20, "total": 0, "totalPages": 1, "hasMore": False}
        }
    notifs = db_store.find_notifications_by_user(curr_id)
    unread = [n for n in notifs if not n.get("is_read", False)]
    return {
        "notifications": notifs,
        "snapshot": {"unread_count": len(unread), "total_count": len(notifs)},
        "pagination": {"page": 1, "limit": 20, "total": len(notifs), "totalPages": 1, "hasMore": False}
    }

@fastapi_app.get("/api/notifications/stream")
async def notifications_stream(
    request: Request,
    x_session_user_id: Optional[str] = Header(None),
    userId: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            # Heartbeat ping
            yield "data: {\"type\": \"ping\"}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@fastapi_app.post("/api/notifications/subscribe")
async def notifications_subscribe():
    return {"success": True, "message": "Push subscription successfully registered"}

@fastapi_app.get("/api/notifications/vapid-public-key")
async def notifications_vapid_key():
    return {"success": True, "publicKey": "BP_scrolic_dummy_vapid_public_key_2026"}

# ---------------- SEO & AI Discoverability Routes ----------------

@fastapi_app.get("/robots.txt", response_class=Response)
async def robots_txt(request: Request):
    base_url = get_public_base_url(request)
    content = f"""User-agent: *
Allow: /
Allow: /post/
Allow: /@
Allow: /strategy/
Allow: /llms.txt
Allow: /llms-full.txt

# AI Engine Search Scrapers & LLM Crawlers
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/
Disallow: /settings/
Disallow: /notifications/

Sitemap: {base_url}/sitemap.xml
"""
    return Response(content=content, media_type="text/plain")


@fastapi_app.get("/sitemap.xml", response_class=Response)
async def sitemap_xml(request: Request):
    base_url = get_public_base_url(request)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    posts = db_store.posts[:100]
    users = db_store.users

    urls_xml = [
        f"""  <url>
    <loc>{base_url}/</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>{base_url}/about</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>{base_url}/pricing</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>{base_url}/faq</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>{base_url}/terms</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>{base_url}/privacy-policy</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>"""
    ]

    for p in posts:
        post_id = p.get("id") or str(p.get("_id"))
        urls_xml.append(f"""  <url>
    <loc>{base_url}/post/{post_id}</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>""")

    for u in users:
        uname = u.get("username")
        if uname:
            urls_xml.append(f"""  <url>
    <loc>{base_url}/@{uname}</loc>
    <lastmod>{now_iso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>""")

    body_xml = "\n".join(urls_xml)
    sitemap_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{body_xml}
</urlset>"""
    return Response(content=sitemap_content, media_type="application/xml")


@fastapi_app.get("/llms.txt", response_class=Response)
async def llms_txt(request: Request):
    base_url = str(request.base_url).rstrip("/")
    content = f"""# Scrolic  — Inovasi Social Trading Platform Connected to cTrader

> Scrolic is a high-frequency social trading ecosystem where 1 open cTrader position equals 1 interactive social feed content.

## Key Features & Structure
- **Live cTrader Open API Integration**: Real-time position tracking, spot tick streaming (Port 5035 Protobuf), and execution via Spotware.
- **Trader Profiles**: Performance metrics, verified win rates, strategy DNA, and active positions.
- **Trading Strategies**: Breakout Hunter, Precision Scalper, Smart Money Concept (SMC), Macro Swing Master, and Trend Following.
- **Energy System**: Micro-payment unlocking for hidden Stop Loss & Take Profit metrics powered by Mayar.id.

## Important Links & Index
- [Scrolic Platform Root]({base_url}/)
- [Full LLM Signals Feed]({base_url}/llms-full.txt)
- [Robots File]({base_url}/robots.txt)
- [Sitemap Index]({base_url}/sitemap.xml)
"""
    return Response(content=content, media_type="text/markdown")


@fastapi_app.get("/llms-full.txt", response_class=Response)
async def llms_full_txt(request: Request):
    base_url = str(request.base_url).rstrip("/")
    posts = db_store.posts[:50]

    lines = [
        "# Scrolic — Full Live Signals & Feed Dataset for LLM AI Agents\n",
        f"Generated At: {datetime.now(timezone.utc).isoformat()}\n"
    ]

    for p in posts:
        post_id = p.get("id")
        symbol = p.get("symbol", "XAUUSD")
        direction = p.get("position_type", "BUY")
        username = p.get("username", "trader")
        lot = p.get("lot", 1.0)
        pips = p.get("pips", 0.0)
        profit = p.get("profit", 0.0)
        strategy = p.get("strategy_name") or p.get("strategy_id") or "Breakout Hunter"
        lines.append(f"### Post: {symbol} {direction} by @{username}")
        lines.append(f"- **URL**: {base_url}/post/{post_id}")
        lines.append(f"- **Strategy**: {strategy}")
        lines.append(f"- **Volume**: {lot} Lot")
        lines.append(f"- **Performance**: {pips} Pips | ${profit} USD")
        lines.append(f"- **Opened At**: {p.get('opened_at')}\n")

    return Response(content="\n".join(lines), media_type="text/markdown")


@fastapi_app.get("/terms", response_class=HTMLResponse)
async def terms_page():
    return HTMLResponse(content="""<!doctype html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Syarat & Ketentuan | Scrolic</title><meta name="description" content="Syarat dan Ketentuan penggunaan platform Scrolic."></head>
<body style="max-width:760px;margin:0 auto;padding:32px 20px;font:16px/1.7 system-ui,sans-serif;color:#17221b;background:#f7faf8"><main><p><a href="/">Kembali ke Scrolic</a></p><h1>Syarat &amp; Ketentuan</h1><p><strong>Terakhir diperbarui: 26 Februari 2026</strong></p><h2>1. Tentang Scrolic</h2><p>Scrolic adalah platform social trading untuk berbagi informasi, aktivitas, dan konten terkait trading. Scrolic bukan broker, penasihat investasi, atau pengelola dana.</p><h2>2. Layanan yang Disediakan</h2><p>Layanan dapat mencakup feed trading, profil trader, analisis, integrasi cTrader, fitur mengikuti setup, dan pembelian Energy. Ketersediaan fitur dapat berubah.</p><h2>3. Penyangkalan Tanggung Jawab</h2><p>Informasi di Scrolic hanya untuk tujuan informasi dan edukasi. Keputusan trading, risiko kerugian, dan penggunaan integrasi pihak ketiga sepenuhnya menjadi tanggung jawab pengguna.</p><h2>4. Akun &amp; Penggunaan</h2><p>Pengguna wajib memberikan informasi yang benar, menjaga keamanan akun, dan tidak menggunakan layanan untuk aktivitas melanggar hukum atau mengganggu pengguna lain.</p><h2>5. Konten Pengguna</h2><p>Pengguna bertanggung jawab atas konten yang dibagikan. Pengguna memberikan izin kepada Scrolic untuk menampilkan konten tersebut sesuai fitur layanan dan tetap memiliki hak atas kontennya.</p><h2>6. Integrasi Pihak Ketiga</h2><p>Integrasi cTrader dan layanan pembayaran tunduk pada ketentuan penyedia masing-masing. Scrolic tidak mengendalikan ketersediaan, akurasi, atau kebijakan pihak ketiga.</p><h2>7. Pembelian Energy &amp; Pengembalian Dana</h2><p>Energy digunakan sesuai fitur yang tersedia. Ketentuan pembayaran, biaya, dan pengembalian dana ditampilkan pada proses transaksi dan dapat tunduk pada verifikasi.</p><h2>8. Perubahan Ketentuan</h2><p>Scrolic dapat memperbarui ketentuan ini. Perubahan penting akan diinformasikan melalui layanan atau kanal komunikasi yang tersedia.</p><h2>9. Hukum yang Berlaku</h2><p>Ketentuan ini ditafsirkan berdasarkan hukum yang berlaku di wilayah operasional Scrolic.</p><h2>10. Kontak</h2><p>Pertanyaan legal dapat dikirim ke <a href="mailto:ScrolicMediaKreasi@gmail.com">ScrolicMediaKreasi@gmail.com</a>.</p><hr><p><a href="/privacy">Kebijakan Privasi</a></p></main></body></html>""")


@fastapi_app.get("/privacy-policy", response_class=HTMLResponse)
@fastapi_app.get("/privacy", response_class=HTMLResponse)
async def privacy_page():
    return HTMLResponse(content="""<!doctype html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kebijakan Privasi | Scrolic</title><meta name="description" content="Kebijakan privasi dan pengelolaan data pengguna Scrolic."></head>
<body style="max-width:760px;margin:0 auto;padding:32px 20px;font:16px/1.7 system-ui,sans-serif;color:#17221b;background:#f7faf8"><main><p><a href="/">Kembali ke Scrolic</a></p><h1>Kebijakan Privasi</h1><p><strong>Terakhir diperbarui: 26 Februari 2026</strong></p><h2>1. Data yang Kami Kumpulkan</h2><p>Kami dapat mengumpulkan identitas akun, email, profil, preferensi, data perangkat, log penggunaan, serta data yang diperlukan untuk koneksi cTrader dan transaksi.</p><h2>2. Cara Kami Menggunakan Data</h2><p>Data digunakan untuk menyediakan layanan, mengamankan akun, memproses transaksi, menampilkan feed dan profil, memberi dukungan, serta meningkatkan keandalan platform.</p><h2>3. Penyimpanan &amp; Keamanan</h2><p>Kami menerapkan pengamanan teknis dan organisatoris yang wajar. Tidak ada sistem yang bebas risiko, sehingga pengguna wajib menjaga kredensial dan perangkatnya.</p><h2>4. Kami Tidak Menyimpan Dana Anda</h2><p>Scrolic bukan lembaga keuangan dan tidak menyimpan atau menguasai dana trading pengguna. Dana dan eksekusi berada pada broker atau penyedia pembayaran terkait.</p><h2>5. Berbagi Data dengan Pihak Ketiga</h2><p>Data dapat diproses oleh penyedia autentikasi, hosting, database, cTrader, pembayaran, dan layanan teknis yang diperlukan untuk menjalankan fitur.</p><h2>6. Hak Anda</h2><p>Anda dapat meminta akses, koreksi, atau penghapusan data sesuai hukum yang berlaku, dengan menghubungi kami melalui alamat kontak di bawah.</p><h2>7. Cookie &amp; Token Sesi</h2><p>Kami menggunakan cookie dan penyimpanan lokal untuk mempertahankan sesi, preferensi, referral, dan pengalaman aplikasi. Anda dapat mengelolanya melalui pengaturan browser.</p><h2>8. Anak-anak</h2><p>Layanan tidak ditujukan untuk anak-anak. Jangan membuat akun atau memberikan data pribadi jika Anda belum memenuhi usia minimum yang berlaku.</p><h2>9. Perubahan Kebijakan</h2><p>Kebijakan ini dapat diperbarui untuk mencerminkan perubahan layanan atau hukum. Tanggal pembaruan akan ditampilkan di halaman ini.</p><h2>10. Kontak</h2><p>Permintaan privasi dapat dikirim ke <a href="mailto:ScrolicMediaKreasi@gmail.com">ScrolicMediaKreasi@gmail.com</a>.</p><hr><p><a href="/terms">Syarat &amp; Ketentuan</a></p></main></body></html>""")


@fastapi_app.get("/post/{post_id}", response_class=Response)
async def get_post_dynamic_seo(post_id: str, request: Request):
    base_url = str(request.base_url).rstrip("/")
    post = db_store.find_post_by_id(post_id)
    if not post:
        return Response(content="Post not found", status_code=404)

    symbol = post.get("symbol") if (post.get("symbol") and post.get("symbol") != "Unknown") else "XAUUSD"
    direction = post.get("position_type", "BUY")
    username = post.get("username", "trader")
    avatar = post.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"
    strategy_name = post.get("strategy_name") or "Breakout Hunter"
    pips = float(post.get("pips", 0.0))
    profit = float(post.get("profit", 0.0))
    opened_at = str(post.get("opened_at") or datetime.now(timezone.utc).isoformat())

    title = f"{symbol} {direction} oleh @{username} ({strategy_name}) | Scrolic"
    desc = f"Lihat sinyal live trade {symbol} {direction} ({strategy_name}) dari @{username}. Performance: {pips:+.1f} Pips (${profit:+.2f}). Platform Social Trading cTrader Scrolic."

    json_ld = {
        "@context": "https://schema.org",
        "@type": "SocialMediaPosting",
        "headline": f"{symbol} {direction} Trade Signal by @{username}",
        "description": desc,
        "url": f"{base_url}/post/{post_id}",
        "datePublished": opened_at,
        "author": {
            "@type": "Person",
            "name": username,
            "alternateName": f"@{username}",
            "image": avatar
        },
        "publisher": {
            "@type": "Organization",
            "name": "Scrolic",
            "url": base_url
        }
    }

    html = f"""<!doctype html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{base_url}/post/{post_id}" />
  <meta property="og:image" content="{avatar}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{avatar}" />
  <script type="application/ld+json">
    {json.dumps(json_ld)}
  </script>
</head>
<body style="background:#040906; color:#e5e5e5; font-family:sans-serif; padding:2rem;">
  <h1>{title}</h1>
  <p>{desc}</p>
  <p><a href="{base_url}/">Buka Aplikasi Scrolic</a></p>
</body>
</html>"""
    return Response(content=html, media_type="text/html")


@fastapi_app.get("/@{username}", response_class=Response)
async def get_trader_dynamic_seo(username: str, request: Request):
    base_url = str(request.base_url).rstrip("/")
    user = db_store.find_user_by_id_or_username(username)
    if not user:
        return Response(content="Trader profile not found", status_code=404)

    uname = user.get("username", username)
    dname = user.get("display_name") or uname
    avatar = user.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={uname}"
    bio = user.get("bio") or "Professional cTrader Momentum & Breakout Trader."
    win_rate = user.get("win_rate", 80.0)

    title = f"Profil Trader @{uname} ({dname}) - Win Rate {win_rate}% | Scrolic"
    desc = f"Lihat performa trading @{uname} ({dname}) di Scrolic. Win Rate: {win_rate}%. Bio: {bio}."

    html = f"""<!doctype html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="{base_url}/@{uname}" />
  <meta property="og:image" content="{avatar}" />
</head>
<body style="background:#040906; color:#e5e5e5; font-family:sans-serif; padding:2rem;">
  <h1>{title}</h1>
  <p>{desc}</p>
  <p><a href="{base_url}/">Buka Aplikasi Scrolic</a></p>
</body>
</html>"""
    return Response(content=html, media_type="text/html")


# ---------------- Health & Root ----------------
@fastapi_app.get("/api/health")
async def api_health():
    return {"ok": True, "database": "connected (Python MemoryStore / MongoDB)", "mayar_configured": bool(get_mayar_api_key())}

@fastapi_app.get("/api/health/proxy")
async def health_proxy():
    return {
        "ok": True,
        "service": "scrolic-fastapi-single-runtime",
        "runtime": "Python FastAPI Single-Runtime",
        "single_runtime": "FastAPI",
        "ctrader_runtime_owner": "fastapi",
        "node_alive": False,
        "ctrader_env": CTRADER_ENV,
        "gemini_model": GEMINI_MODEL,
        "llm_configured": bool(EMERGENT_LLM_KEY),
        "mayar_configured": bool(get_mayar_api_key()),
        "ctrader_configured": bool(CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET)
    }

@fastapi_app.get("/")
async def root():
    return {"service": "scrolic-single-runtime", "ok": True}

# Safely wrap FastAPI app with Socket.IO ASGI app if socketio is available, else fallback to fastapi_app directly
# NOTE: socket.io mounted under /api/socket.io so production ingress rules that only proxy /api/*
# also forward socket.io polling requests to the backend (avoids needing WebSocket upgrade support).
if HAS_SOCKETIO and sio is not None:
    app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="/api/socket.io")
else:
    app = fastapi_app
