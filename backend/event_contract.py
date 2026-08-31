"""
Official Scrolic Realtime Event Contract & Socket.IO Broadcaster
Single Runtime Owner: Python FastAPI (:8001)
================================================================================
Standardized Schemas & Event Naming Conventions:
- feed:new_post            -> Public broadcast when new post/position is created
- feed:position_update     -> Public/follower broadcast for live ticks & price valuation
- feed:position_closed     -> Public/follower broadcast when position is closed
- account:metrics_update   -> Private room broadcast (user_{userId} / account_{accountId})
- connection:status_update -> Public/diagnostics lifecycle updates
All payloads are standardized in camelCase with strict eventId & sequence numbering.
"""

import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

logger = logging.getLogger("scrolic.event_contract")

class EventContractManager:
    def __init__(self):
        self._sequence: int = 0

    def _next_sequence(self) -> int:
        self._sequence += 1
        return self._sequence

    def _generate_event_id(self, prefix: str = "evt") -> str:
        ts = int(time.time() * 1000)
        uid = uuid.uuid4().hex[:8]
        return f"{prefix}_{ts}_{uid}"

    def build_new_post_payload(self, post: Dict[str, Any]) -> Dict[str, Any]:
        """Builds standardized camelCase payload for feed:new_post."""
        opened_at_val = post.get("opened_at")
        opened_at_str = opened_at_val.isoformat() if isinstance(opened_at_val, datetime) else str(opened_at_val or datetime.now(timezone.utc).isoformat())

        return {
            "eventId": self._generate_event_id("post_new"),
            "sequence": self._next_sequence(),
            "timestamp": int(time.time() * 1000),
            "postId": str(post.get("id")),
            "tradeId": str(post.get("trade_id") or post.get("id")),
            "positionId": str(post.get("trade_id") or post.get("id")),
            "userId": str(post.get("user_id", "")),
            "username": str(post.get("username", "")),
            "avatar": str(post.get("avatar", "")),
            "accountId": str(post.get("account_id", "")),
            "symbol": str(post.get("symbol", "XAUUSD")),
            "market": str(post.get("market", "Forex")),
            "strategyId": str(post.get("strategy_id", "breakout")),
            "positionType": str(post.get("position_type", "BUY")).upper(),
            "status": str(post.get("status", "OPEN")),
            "entryPrice": float(post.get("entry_price") or post.get("price") or 0.0),
            "currentPrice": float(post.get("current_price") or post.get("entry_price") or 0.0),
            "stopLoss": float(post.get("stop_loss")) if post.get("stop_loss") else None,
            "takeProfit": float(post.get("take_profit")) if post.get("take_profit") else None,
            "progress": int(post.get("progress", 50)),
            "profit": float(post.get("profit", 0.0)),
            "profitPercent": float(post.get("profit_percent", 0.0)),
            "lot": float(post.get("lot", 0.1)),
            "pips": float(post.get("pips", 0.0)),
            "duration": str(post.get("duration", "Live")),
            "openedAt": opened_at_str,
            "visibility": str(post.get("visibility", "LOCKED")),
            "unlockPrice": int(post.get("unlock_price", 1)),
            "followPrice": int(post.get("follow_price", 1)),
            "isSimulation": bool(post.get("is_simulation", False)),
            "source": str(post.get("source", "broker_ctrader")),
            "autoDescription": str(post.get("auto_description", "")),
            "customDescription": str(post.get("custom_description", ""))
        }

    def build_position_update_payload(self, raw_update: Dict[str, Any]) -> Dict[str, Any]:
        """Builds standardized camelCase payload for feed:position_update."""
        return {
            "eventId": self._generate_event_id("pos_upd"),
            "sequence": self._next_sequence(),
            "timestamp": int(time.time() * 1000),
            "postId": str(raw_update.get("postId") or raw_update.get("id")),
            "tradeId": str(raw_update.get("positionId") or raw_update.get("tradeId") or raw_update.get("postId")),
            "positionId": str(raw_update.get("positionId") or raw_update.get("tradeId") or raw_update.get("postId")),
            "symbol": str(raw_update.get("symbol", "XAUUSD")),
            "side": str(raw_update.get("side") or raw_update.get("positionType", "BUY")).upper(),
            "direction": str(raw_update.get("direction") or raw_update.get("side", "BUY")).upper(),
            "entry": float(raw_update.get("entry") or raw_update.get("entryPrice") or 0.0),
            "current": float(raw_update.get("current") or raw_update.get("currentPrice") or 0.0),
            "currentPrice": float(raw_update.get("currentPrice") or raw_update.get("current") or 0.0),
            "bid": float(raw_update.get("bid", 0.0)) if raw_update.get("bid") is not None else None,
            "ask": float(raw_update.get("ask", 0.0)) if raw_update.get("ask") is not None else None,
            "pips": float(raw_update.get("pips", 0.0)),
            "profit": float(raw_update.get("profit") or raw_update.get("profitUsd") or 0.0),
            "profitUsd": float(raw_update.get("profitUsd") or raw_update.get("profit") or 0.0),
            "profitPercent": float(raw_update.get("profitPercent", 0.0)),
            "stopLoss": float(raw_update.get("sl") or raw_update.get("stopLoss", 0.0)) if (raw_update.get("sl") or raw_update.get("stopLoss")) else None,
            "takeProfit": float(raw_update.get("tp") or raw_update.get("takeProfit", 0.0)) if (raw_update.get("tp") or raw_update.get("takeProfit")) else None,
            "progress": int(raw_update.get("progress", 50)),
            "status": str(raw_update.get("status", "OPEN"))
        }

    def build_position_closed_payload(self, closed_data: Dict[str, Any]) -> Dict[str, Any]:
        """Builds standardized camelCase payload for feed:position_closed."""
        closed_at_val = closed_data.get("closedAt")
        closed_at_str = closed_at_val.isoformat() if isinstance(closed_at_val, datetime) else str(closed_at_val or datetime.now(timezone.utc).isoformat())

        return {
            "eventId": self._generate_event_id("pos_close"),
            "sequence": self._next_sequence(),
            "timestamp": int(time.time() * 1000),
            "postId": str(closed_data.get("postId", "")),
            "tradeId": str(closed_data.get("tradeId", "")),
            "positionId": str(closed_data.get("tradeId", "")),
            "closePrice": float(closed_data.get("closePrice", 0.0)),
            "profit": float(closed_data.get("profit", 0.0)),
            "closedAt": closed_at_str,
            "status": "CLOSED"
        }

    def build_account_metrics_payload(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Builds standardized camelCase payload for private account:metrics_update."""
        return {
            "eventId": self._generate_event_id("acct_upd"),
            "sequence": self._next_sequence(),
            "timestamp": int(time.time() * 1000),
            "accountId": str(state.get("accountId", "")),
            "ctidTraderAccountId": int(state.get("ctidTraderAccountId", 0)),
            "balance": float(state.get("balance", 0.0)),
            "equity": float(state.get("equity", 0.0)),
            "unrealizedPnL": float(state.get("unrealizedPnL", 0.0)),
            "usedMargin": float(state.get("usedMargin", 0.0)),
            "freeMargin": float(state.get("freeMargin", 0.0)),
            "marginLevel": float(state.get("marginLevel")) if state.get("marginLevel") is not None else None,
            "leverage": int(state.get("leverage", 500)),
            "currency": str(state.get("currency", "USD")),
            "moneyDigits": int(state.get("moneyDigits", 2)),
            "openPositionsCount": int(state.get("openPositionsCount", 0)),
            "isStale": bool(state.get("isStale", False)),
            "staleReason": state.get("staleReason")
        }

    def build_connection_status_payload(self, diag: Dict[str, Any]) -> Dict[str, Any]:
        """Builds standardized camelCase payload for connection:status_update."""
        return {
            "eventId": self._generate_event_id("conn_upd"),
            "sequence": self._next_sequence(),
            "timestamp": int(time.time() * 1000),
            "state": str(diag.get("state", "DISCONNECTED")),
            "isBrokerConnected": bool(diag.get("is_broker_connected", False)),
            "isAuthenticated": bool(diag.get("is_authenticated", False)),
            "environment": str(diag.get("environment", "demo")),
            "transport": str(diag.get("transport", "WEBSOCKET")),
            "host": str(diag.get("host", "")),
            "tcpPort": int(diag.get("tcp_port", 5035)),
            "wsPort": int(diag.get("ws_port", 5036)),
            "connectedAt": diag.get("connected_at"),
            "authenticatedAt": diag.get("authenticated_at"),
            "lastHeartbeatSentAt": diag.get("last_heartbeat_sent_at"),
            "lastHeartbeatReceivedAt": diag.get("last_heartbeat_received_at"),
            "lastMessageAt": diag.get("last_message_at"),
            "reconnectCount": int(diag.get("reconnect_count", 0)),
            "lastError": diag.get("last_error"),
            "lastErrorAt": diag.get("last_error_at"),
            "authenticatedAccounts": diag.get("authenticated_accounts", [])
        }

event_contract_manager = EventContractManager()
