"""
cTrader Open API Centralized Configuration & Environment Specification
Single Runtime Owner: Python FastAPI (:8001)
=====================================================================
Official Spotware Open API v2 endpoints and specifications:
- Demo Host: demo.ctraderapi.com (Protobuf TCP: 5035 / Protobuf WebSocket: 5035 / JSON Socket: 5036)
- Live Host: live.ctraderapi.com (Protobuf TCP: 5035 / Protobuf WebSocket: 5035 / JSON Socket: 5036)
- Auth Portal: https://connect.spotware.com/apps/auth
- Token Endpoint: https://connect.spotware.com/apps/token
- Default Environment: demo (can be set to 'live' via CTRADER_ENV)
- Timezone Standard: UTC (ISO 8601 timestamps)
"""

import os
from typing import Dict, Any

# Environment configuration: demo or live
CTRADER_ENV = os.environ.get("CTRADER_ENV", os.environ.get("CTRADER_ENVIRONMENT", "demo")).strip().lower()
if CTRADER_ENV not in ("demo", "live"):
    CTRADER_ENV = "demo"

# Spotware Open API Server Endpoints
SPOTWARE_ENDPOINTS = {
    "demo": {
        "ws_url": "wss://demo.ctraderapi.com:5035",
        "tcp_host": "demo.ctraderapi.com",
        "tcp_port": 5035,
        "ws_port": 5035,
        "json_port": 5036,
        "is_live": False,
    },
    "live": {
        "ws_url": "wss://live.ctraderapi.com:5035",
        "tcp_host": "live.ctraderapi.com",
        "tcp_port": 5035,
        "ws_port": 5035,
        "json_port": 5036,
        "is_live": True,
    }
}

AUTH_BASE_URL = "https://connect.spotware.com"
TOKEN_ENDPOINT_URL = "https://connect.spotware.com/apps/token"

def get_ctrader_client_id() -> str:
    return os.environ.get("CTRADER_CLIENT_ID", "").strip()

def get_ctrader_client_secret() -> str:
    return os.environ.get("CTRADER_CLIENT_SECRET", "").strip()

def get_ctrader_env() -> str:
    return CTRADER_ENV

def get_active_endpoint() -> Dict[str, Any]:
    return SPOTWARE_ENDPOINTS.get(CTRADER_ENV, SPOTWARE_ENDPOINTS["demo"])

def mask_credential(credential: str, visible_prefix: int = 4, visible_suffix: int = 4) -> str:
    """Masks secret tokens/passwords for safe logging in observability."""
    if not credential:
        return "[NOT_SET]"
    if len(credential) <= (visible_prefix + visible_suffix):
        return "[REDACTED]"
    return f"{credential[:visible_prefix]}...{credential[-visible_suffix:]}"
