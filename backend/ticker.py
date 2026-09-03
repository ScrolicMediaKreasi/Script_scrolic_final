"""
cTrader Open API v2 Realtime Market Data, Spot Pricing & Position Reconciliation Engine
Single Runtime Owner: Python FastAPI (:8001)
================================================================================
Spec & Official Spotware Open API v2 Protocol:
- Dynamic Symbol Metadata Registry (ProtoOASymbolsListRes 2115 & ProtoOASymbolByIdRes 2117)
- Official Price Subscriptions (ProtoOASubscribeSpotsReq 2104)
- Live Spot Streaming (ProtoOASpotEvent 2131) with strict Bid/Ask side valuation
- Official Position Reconciliation (ProtoOAReconcileReq 2124 & ProtoOAReconcileRes 2125)
- Canonical Entity Mapping: accountId -> positionId -> postId -> tradeId
- Strict Deduplication by (accountId, positionId)
"""

import asyncio
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Set

current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

try:
    from backend.database import db_store, ensure_utc
except ImportError:
    from database import db_store, ensure_utc

try:
    from backend.ctrader_client import (
        ctrader_client,
        find_account_state,
        find_user_for_account,
        find_client_by_account,
        all_authenticated_accounts,
        merged_account_to_user_map,
        merged_account_states,
        PROTO_OA_SUBSCRIBE_SPOTS_REQ,
        PROTO_OA_SPOT_EVENT,
        PROTO_OA_EXECUTION_EVENT,
        PROTO_OA_SYMBOLS_LIST_RES,
        PROTO_OA_RECONCILE_RES,
        PROTO_OA_TRADER_RES,
        PROTO_OA_DEAL_LIST_RES,
        PROTO_OA_MARGIN_CHANGED_EVENT,
        PROTO_OA_GET_POSITION_UNREALIZED_PNL_RES
    )
except ImportError:
    from ctrader_client import (
        ctrader_client,
        find_account_state,
        find_user_for_account,
        find_client_by_account,
        all_authenticated_accounts,
        merged_account_to_user_map,
        merged_account_states,
        PROTO_OA_SUBSCRIBE_SPOTS_REQ,
        PROTO_OA_SPOT_EVENT,
        PROTO_OA_EXECUTION_EVENT,
        PROTO_OA_SYMBOLS_LIST_RES,
        PROTO_OA_RECONCILE_RES,
        PROTO_OA_TRADER_RES,
        PROTO_OA_DEAL_LIST_RES,
        PROTO_OA_MARGIN_CHANGED_EVENT,
        PROTO_OA_GET_POSITION_UNREALIZED_PNL_RES
    )

try:
    from backend.event_contract import event_contract_manager
except ImportError:
    from event_contract import event_contract_manager

logger = logging.getLogger("scrolic.ctrader_engine")

class SymbolRegistry:
    """Dynamic Symbol Metadata Registry loaded and cached from Spotware Open API."""
    def __init__(self):
        # Baseline reference metadata (augmented dynamically by ProtoOASymbolsListRes & ProtoOASymbolByIdRes)
        self._symbols_by_id: Dict[int, Dict[str, Any]] = {
            1: {"symbolId": 1, "name": "EURUSD", "digits": 5, "pipPosition": 4, "lotUnits": 100000.0, "market": "Forex", "base": "EUR", "quote": "USD"},
            2: {"symbolId": 2, "name": "GBPUSD", "digits": 5, "pipPosition": 4, "lotUnits": 100000.0, "market": "Forex", "base": "GBP", "quote": "USD"},
            3: {"symbolId": 3, "name": "EURJPY", "digits": 3, "pipPosition": 2, "lotUnits": 100000.0, "market": "Forex", "base": "EUR", "quote": "JPY"},
            4: {"symbolId": 4, "name": "USDJPY", "digits": 3, "pipPosition": 2, "lotUnits": 100000.0, "market": "Forex", "base": "USD", "quote": "JPY"},
            41: {"symbolId": 41, "name": "XAUUSD", "digits": 2, "pipPosition": 1, "lotUnits": 100.0, "lotSize": 100.0, "measurementUnits": 1.0, "market": "Commodity", "base": "XAU", "quote": "USD"},
            # Ticket 243821: 22396 was a fabricated/guessed BTCUSD id that never matched this
            # broker (FPMarkets) — confirmed live: the customer's real BTCUSD trades carry
            # symbolId 101 (seen both in broker_deals and in production's own SYMBOL_101
            # fallback label after the resolve-by-id fix). Registering the confirmed real id
            # so BTCUSD gets a correct name AND correct crypto lot/margin metadata instead of
            # the unknown-symbol placeholder's forex-scale defaults (lotUnits 100000).
            101: {"symbolId": 101, "name": "BTCUSD", "digits": 2, "pipPosition": 0, "lotUnits": 1.0, "lotSize": 1.0, "market": "Crypto", "base": "BTC", "quote": "USD"},
            22397: {"symbolId": 22397, "name": "ETHUSD", "digits": 2, "pipPosition": 1, "lotUnits": 1.0, "lotSize": 1.0, "market": "Crypto", "base": "ETH", "quote": "USD"}
        }
        self._symbols_by_name: Dict[str, Dict[str, Any]] = {
            v["name"]: v for v in self._symbols_by_id.values()
        }

    def register_symbol_metadata(self, symbol_id: int, name: str, digits: int = 5, pip_position: int = 4, lot_units: float = 100000.0, market: str = "Forex", base: str = "", quote: str = "", lot_size: Optional[float] = None, measurement_units: Optional[float] = None, volume_scale: Optional[float] = None):
        data = {
            "symbolId": symbol_id,
            "name": name.upper(),
            "digits": digits,
            "pipPosition": pip_position,
            "lotUnits": lot_units,
            "lotSize": lot_size if lot_size is not None else lot_units,
            "measurementUnits": measurement_units if measurement_units is not None else 1.0,
            "volumeScale": volume_scale,
            "market": market,
            "base": base,
            "quote": quote
        }
        self._symbols_by_id[symbol_id] = data
        self._symbols_by_name[name.upper()] = data

    def resolve(self, symbol_id: Optional[int] = None, symbol_name: Optional[str] = None) -> Dict[str, Any]:
        if symbol_id and symbol_id in self._symbols_by_id:
            return self._symbols_by_id[symbol_id]
        if symbol_name:
            clean = symbol_name.upper().strip()
            if clean in self._symbols_by_name:
                return self._symbols_by_name[clean]
            
            # Robust Suffix Stripping for Demo/Live brokers (e.g. BTCUSD.demo -> BTCUSD, XAUUSD.m -> XAUUSD)
            base_clean = clean.split('.')[0].split('_')[0].split('-')[0]
            if base_clean in self._symbols_by_name:
                return self._symbols_by_name[base_clean]

            # Heuristic Symbol Matching for Demo/Live symbols
            if "BTC" in clean:
                return self._symbols_by_id[22396]
            if "ETH" in clean:
                return self._symbols_by_id[22397]
            if "XAU" in clean or "GOLD" in clean:
                return self._symbols_by_id[41]
            if "JPY" in clean:
                return self._symbols_by_id[4]
            if any(k in clean for k in ["EUR", "GBP", "AUD", "USD"]):
                return self._symbols_by_id[1]

            return {
                "symbolId": symbol_id or 0,
                "name": clean,
                "digits": 5,
                "pipPosition": 4,
                "lotUnits": 100000.0,
                "lotSize": 100000.0,
                "measurementUnits": 1.0,
                "market": "Forex",
                "base": "",
                "quote": ""
            }
        unknown_id = symbol_id or 0
        return {"symbolId": unknown_id, "name": f"SYMBOL_{unknown_id}", "digits": 5, "pipPosition": 4, "lotUnits": 100000.0, "lotSize": 100000.0, "measurementUnits": 1.0, "market": "Unknown", "base": "", "quote": ""}

symbol_registry = SymbolRegistry()
_scaling_debug_seen: Set[Any] = set()

def normalize_trade_side(value: Any, default: Optional[str] = None) -> Optional[str]:
    if value is None or value == "":
        return default
    normalized = str(value).upper().strip()
    if normalized in {"BUY", "1", "LONG", "TRADE_SIDE_BUY"}:
        return "BUY"
    if normalized in {"SELL", "2", "SHORT", "TRADE_SIDE_SELL"}:
        return "SELL"
    return default

def _lot_scale_from_symbol_meta(meta: Dict[str, Any]) -> float:
    symbol_name = str(meta.get("name", "")).upper()
    market = str(meta.get("market", "")).lower()
    lot_units = float(meta.get("lotUnits") or meta.get("lotSize") or 100000.0)

    # 1. Crypto (BTCUSD, ETHUSD)
    # Spotware cTrader Open API: 1 Lot = 1 BTC/ETH. 0.01 Lot = 1 cent (or 0.01 unit).
    # Raw volume in cents sent by cTrader for 0.01 Lot is 1 cent (or 1 unit).
    if "BTC" in symbol_name or "ETH" in symbol_name or market == "crypto":
        return 100.0 if lot_units <= 10.0 else lot_units * 100.0

    # 2. Metals / Gold (XAUUSD, GOLD)
    # Spotware cTrader Open API: 1 Lot = 100 oz. 0.01 Lot = 1 oz = 100 cents.
    # Raw volume in cents sent by cTrader for 0.01 Lot is 100 cents.
    if "XAU" in symbol_name or "GOLD" in symbol_name or market == "commodity":
        return 10000.0 if lot_units <= 500.0 else lot_units * 100.0

    # 3. Forex (EURUSD, GBPUSD, USDJPY, etc.)
    # Spotware cTrader Open API: 1 Lot = 100,000 units = 10,000,000 cents. 0.01 Lot = 1,000 units = 100,000 cents.
    return lot_units * 100.0 if lot_units < 1000000.0 else lot_units


def normalize_volume_lots(raw_volume: Any, meta: Dict[str, Any], default: Optional[float] = None) -> Optional[float]:
    if raw_volume is None or raw_volume == "":
        return default
    try:
        volume_units = float(raw_volume)
        if volume_units <= 0:
            return default
        lot_scale = _lot_scale_from_symbol_meta(meta or {})
        if lot_scale <= 0:
            return default
        lot_value = volume_units / lot_scale
        normalized = round(lot_value, 2) if lot_value > 0 else default
        if normalized and normalized < 0.01:
            normalized = 0.01
        return normalized
    except (TypeError, ValueError):
        return default


def normalize_money_value(raw_value: Any, money_digits: int = 2) -> float:
    try:
        amount = float(raw_value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    digits = max(0, int(money_digits))
    scale = 10 ** digits
    if scale <= 0:
        scale = 100
    normalized = round(amount / scale, digits)
    key = (amount, digits, normalized)
    if key not in _scaling_debug_seen:
        _scaling_debug_seen.add(key)
        logger.info(
            "[cTrader.Scaling] MONEY rawMoney=%s moneyDigits=%s normalizedPnL=%s",
            raw_value, money_digits, normalized
        )
    return normalized

def position_trade_data(position: Dict[str, Any]) -> Dict[str, Any]:
    trade_data = position.get("tradeData") or position.get("trade_data") or {}
    return trade_data if isinstance(trade_data, dict) else {}

def calculate_pips(side: str, entry: float, current_bid: float, current_ask: float, pip_size: float) -> float:
    if pip_size <= 0:
        pip_size = 0.0001
    side_upper = str(side).upper()
    # BUY valuation uses BID (selling back to market)
    if side_upper in ["BUY", "1", "LONG"]:
        return round((current_bid - entry) / pip_size, 1)
    # SELL valuation uses ASK (buying back from market)
    else:
        return round((entry - current_ask) / pip_size, 1)

def calculate_position_progress(side: str, entry: float, current: float, sl: float, tp: float, pips: float) -> int:
    side_upper = str(side).upper()
    is_buy = side_upper in ["BUY", "1", "LONG"]

    if tp > 0 and entry > 0:
        if is_buy and tp > entry:
            pct = ((current - entry) / (tp - entry)) * 100.0
            return max(0, min(100, int(pct)))
        elif not is_buy and entry > tp:
            pct = ((entry - current) / (entry - tp)) * 100.0
            return max(0, min(100, int(pct)))

    base_progress = 50 + int(pips * 0.5)
    return max(0, min(100, base_progress))

class CTraderPositionService:
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self.sio = None
        
        # Realtime market prices from ProtoOASpotEvent: { symbol: { bid, ask, timestamp } }
        self.market_prices: Dict[str, Dict[str, Any]] = {}
        self.subscribed_symbols: Set[int] = set()
        # Ticket 243821: per-post monotonic timestamp of the last spot-persist, for the
        # 1s throttle in handle_spot_event (see comment there).
        self._spot_persist_ts: Dict[str, float] = {}
        # Symbols whose first spot tick has been logged this process (scale diagnostics).
        self._spot_first_tick_logged: Set[str] = set()

        # Deal tracking idempotency & cursor state
        self.processed_deal_ids: Set[str] = set()
        self.last_deal_cursor: Dict[int, int] = {}

        # Hook into persistent ctrader_client handlers — register on BOTH live+demo clients
        # so spot/execution/reconcile/deal events from either environment flow into the ticker.
        # Ticket 243821 (frozen prices, the deepest layer): this import MUST resolve to the SAME
        # module copy as the module-level imports above (backend.ctrader_client) — that is the
        # copy whose clients on_startup() actually starts and whose websocket receives broker
        # events. With /app AND /app/backend both on sys.path, importing top-level
        # `ctrader_client` first silently loads a SECOND copy of the module with its own never-
        # started client instances, and handlers registered there never fire — no spot
        # subscriptions sent, no price/pnl updates written, no close/open card transitions.
        # backend-first keeps registration on the live clients.
        try:
            from backend.ctrader_client import register_handler_on_all
        except ImportError:
            from ctrader_client import register_handler_on_all
        register_handler_on_all(PROTO_OA_SPOT_EVENT, self.handle_spot_event)
        register_handler_on_all(PROTO_OA_EXECUTION_EVENT, self.handle_execution_event)
        register_handler_on_all(PROTO_OA_SYMBOLS_LIST_RES, self.handle_symbols_list_event)
        register_handler_on_all(PROTO_OA_RECONCILE_RES, self.handle_reconcile_event)
        register_handler_on_all(PROTO_OA_TRADER_RES, self.handle_trader_event)
        register_handler_on_all(PROTO_OA_DEAL_LIST_RES, self.handle_deal_list_event)
        register_handler_on_all(PROTO_OA_MARGIN_CHANGED_EVENT, self.handle_margin_event)
        register_handler_on_all(PROTO_OA_GET_POSITION_UNREALIZED_PNL_RES, self.handle_unrealized_pnl_event)

    def set_sio(self, sio_instance):
        self.sio = sio_instance

    def subscribe_symbol(self, ctid_account_id: int, symbol_id: int):
        """Sends official ProtoOASubscribeSpotsReq (2104) via the correct env client."""
        if not symbol_id or symbol_id in self.subscribed_symbols:
            return

        target_acct_id = ctid_account_id
        target_client = None
        if not target_acct_id:
            # Resolve primary authenticated account ID across BOTH clients
            active = all_authenticated_accounts()
            if active:
                target_acct_id = active[0]
                target_client = find_client_by_account(target_acct_id)
            else:
                return
        else:
            target_client = find_client_by_account(target_acct_id) or ctrader_client

        self.subscribed_symbols.add(symbol_id)
        message = {
            "ctidTraderAccountId": target_acct_id,
            "symbolId": [symbol_id],
            "subscribeToSpotTimestamp": True
        }
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(target_client.send_message(PROTO_OA_SUBSCRIBE_SPOTS_REQ, message))

    def handle_symbols_list_event(self, event_data: Dict[str, Any]):
        """Registers the broker's account-specific symbol metadata catalog.

        ProtoOASymbolsListRes (2115) returns a LIGHTWEIGHT symbol list which
        does NOT include pipPosition/digits/lotUnits (those live on the full
        ProtoOASymbol via ProtoOASymbolByIdReq 2116). To avoid clobbering the
        correct registry defaults (e.g. XAUUSD pipPosition=1), we only
        overwrite fields that the broker actually sent; missing fields fall
        back to the existing registry entry when present.
        """
        symbols = event_data.get("symbol", []) or event_data.get("symbols", []) or []
        for symbol in symbols:
            try:
                symbol_id = int(symbol.get("symbolId"))
                name = str(symbol.get("symbolName") or symbol.get("name") or "").strip()
                if not name:
                    continue
                # Look up existing registry entry (either by ID or by name) to preserve pipPosition/digits/lotUnits
                existing = symbol_registry._symbols_by_id.get(symbol_id) or symbol_registry._symbols_by_name.get(name.upper()) or {}

                def pick(field_key: str, default_value):
                    raw = symbol.get(field_key)
                    if raw is None or raw == "":
                        return existing.get(field_key, default_value)
                    return raw

                # Ticket 243821: protobuf3 serializes absent int fields as 0, and this broker's
                # lightweight SymbolsList (2115) carries no digits/pipPosition at all — a raw 0
                # here would clobber the correct registry defaults (e.g. XAUUSD digits=2) and
                # make the spot-tick /10**digits scaling a no-op, storing raw broker units
                # (1000x) as currentPrice. Treat 0/negative as "not provided" and keep the
                # existing registry value.
                digits_val = int(pick("digits", 5))
                if digits_val <= 0:
                    digits_val = int(existing.get("digits", 5) or 5)
                pip_pos_val = int(pick("pipPosition", 4))
                if pip_pos_val <= 0:
                    pip_pos_val = int(existing.get("pipPosition", 4) or 4)
                lot_units_val = float(symbol.get("lotSize") if symbol.get("lotSize") is not None else (symbol.get("lotUnits") if symbol.get("lotUnits") is not None else existing.get("lotUnits", 100000.0)))
                lot_size_val = float(symbol["lotSize"]) if symbol.get("lotSize") is not None else (existing.get("lotSize") if existing.get("lotSize") is not None else None)
                measurement_units_val = float(symbol["measurementUnits"]) if symbol.get("measurementUnits") is not None else (existing.get("measurementUnits") if existing.get("measurementUnits") is not None else None)
                volume_scale_val = float(symbol["volumeScale"]) if symbol.get("volumeScale") is not None else (existing.get("volumeScale") if existing.get("volumeScale") is not None else None)
                market_val = str(symbol.get("market") or existing.get("market") or "Forex")
                base_val = str(symbol.get("baseAssetName") or symbol.get("base") or existing.get("base") or "")
                quote_val = str(symbol.get("quoteAssetName") or symbol.get("quote") or existing.get("quote") or "")

                symbol_registry.register_symbol_metadata(
                    symbol_id=symbol_id,
                    name=name,
                    digits=digits_val,
                    pip_position=pip_pos_val,
                    lot_units=lot_units_val,
                    lot_size=lot_size_val,
                    measurement_units=measurement_units_val,
                    volume_scale=volume_scale_val,
                    market=market_val,
                    base=base_val,
                    quote=quote_val
                )
            except (TypeError, ValueError):
                logger.warning("[cTrader.Symbols] Ignoring malformed symbol metadata: %s", symbol)

    def handle_spot_event(self, event_data: Dict[str, Any]):
        """
        Handles official ProtoOASpotEvent (2131) from Spotware server.
        Parses live bid/ask prices and updates open positions.
        """
        try:
            symbol_id = int(event_data.get("symbolId")) if event_data.get("symbolId") is not None else None
            meta = symbol_registry.resolve(symbol_id=symbol_id)
            symbol_name = meta["name"]
            raw_bid = event_data.get("bid")
            raw_ask = event_data.get("ask")
            ts = event_data.get("timestamp") or int(time.time() * 1000)

            # ProtoOASpotEvent prices use the symbol precision as their scale.
            if raw_bid is not None:
                bid_val = float(raw_bid) / (10 ** int(meta["digits"])) if abs(float(raw_bid)) >= 100000 else float(raw_bid)
            else:
                bid_val = self.market_prices.get(symbol_name, {}).get("bid", 0.0)

            if raw_ask is not None:
                ask_val = float(raw_ask) / (10 ** int(meta["digits"])) if abs(float(raw_ask)) >= 100000 else float(raw_ask)
            else:
                ask_val = self.market_prices.get(symbol_name, {}).get("ask", bid_val + (10 ** (-meta["pipPosition"]) * 0.2))

            if bid_val <= 0:
                return

            # Ticket 243821 (spot-scale auto-heal): this broker's feed scale can disagree with
            # the registry's digits (live-observed: BTCUSD symbolId 101 raw=8,151,850,000 with
            # registry digits=2 → 81,518,500 vs true ~81,518.5 — real scale 10^5). Broker-sourced
            # ENTRY prices on positions are correctly scaled, so use the first open position's
            # entry as ground truth: when the tick is a near-power-of-ten away from it, rescale
            # the tick by that power. A genuine >=10x market move between entry and now is not
            # a realistic intraday event for these instruments; the ratio must also land within
            # a factor of 3 of an exact power of ten to count as a scale error.
            _ref_entry = 0.0
            for _p in db_store.posts:
                if _p.get("status") == "OPEN" and _p.get("symbol") == symbol_name:
                    _ref_entry = float(_p.get("entry_price") or 0.0)
                    break
            if _ref_entry > 0:
                _ratio = bid_val / _ref_entry
                if _ratio > 10.0 or _ratio < 0.1:
                    _k = round(math.log10(_ratio))
                    if _k != 0 and abs(_k) <= 6 and 0.33 <= (_ratio / (10 ** _k)) <= 3.0:
                        bid_val /= (10 ** _k)
                        ask_val /= (10 ** _k)
                        logger.warning(f"[cTrader.Spot] {symbol_name} auto-rescaled tick by 10^{_k}: digits={meta['digits']} rawBid={raw_bid} refEntry={_ref_entry} -> bid={bid_val} ask={ask_val}")

            self.market_prices[symbol_name] = {
                "bid": bid_val,
                "ask": ask_val,
                "timestamp": ts
            }

            # Update all open posts for this symbol.
            # Ticket 243821 (event-loop starvation): once handlers actually fire (post wiring
            # fix), spot ticks arrive many times per second per symbol. compute_position_payload
            # does a synchronous Mongo update_post per post per tick, which saturated the
            # single uvicorn worker — /health through nginx started timing out and the k8s
            # liveness probe nearly killed the pod. The in-memory market_prices cache above
            # stays fresh on EVERY tick (cheap); the expensive persist+emit per post is
            # throttled to at most once per second — the feed UI polls at roughly that rate
            # anyway, so visible realtime behavior is unchanged.
            now_mono = time.monotonic()
            # Ticket 243821 (price-scale debug): log the first tick per symbol per process so
            # raw broker scale vs applied digits is visible in prod logs — needed to pin the
            # exact digits semantics of this broker's feed.
            if symbol_name not in self._spot_first_tick_logged:
                self._spot_first_tick_logged.add(symbol_name)
                logger.info(f"[cTrader.Spot] FIRST TICK {symbol_name}: rawBid={raw_bid} rawAsk={raw_ask} digits={meta['digits']} scaledBid={bid_val} scaledAsk={ask_val}")
            open_posts = [p for p in db_store.posts if p.get("status") == "OPEN" and p.get("symbol") == symbol_name]
            for post in open_posts:
                # Plausibility guard vs the position's own entry price: a tick more than 10x
                # away from entry is a scale error (e.g. digits mismatch → 1000x), not a market
                # move. Skip persisting it and warn — profitUSD (broker PnL poll) stays correct.
                entry_for_guard = float(post.get("entry_price") or 0.0)
                if entry_for_guard > 0:
                    ratio = bid_val / entry_for_guard
                    if ratio > 10.0 or ratio < 0.1:
                        logger.warning(f"[cTrader.Spot] {symbol_name} tick bid={bid_val} is {ratio:.0f}x entry {entry_for_guard} — scale mismatch suspected (digits={meta['digits']}, raw={raw_bid}); skipping persist for post {post.get('id')}")
                        continue
                post_key = str(post.get("id"))
                last_persist = self._spot_persist_ts.get(post_key, 0.0)
                if (now_mono - last_persist) < 1.0:
                    continue
                self._spot_persist_ts[post_key] = now_mono
                payload = self.compute_position_payload(post, bid_price=bid_val, ask_price=ask_val)
                if payload and self.sio:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        loop.create_task(self.emit_position_update(payload))
        except Exception as exc:
            logger.error(f"[cTrader.Spot] handle_spot_event error: {exc}")

    def subscribe_default_symbols(self, acct_num: int):
        """Subscribe to a curated set of popular symbols right after account auth so spot events
        start flowing even before any open position/reconcile is available (fixes silence when
        the account has no positions yet). Idempotent — subscribe_symbol de-dupes by symbol_id.
        """
        if not acct_num:
            return
        # Popular default set – covers XAU, BTC, majors, indices
        default_names = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF"]
        for name in default_names:
            meta = symbol_registry.resolve(symbol_name=name)
            sym_id = meta.get("symbolId") if isinstance(meta, dict) else None
            if sym_id:
                try:
                    self.subscribe_symbol(acct_num, int(sym_id))
                except Exception as exc:
                    logger.debug(f"[cTrader.DefaultSubs] subscribe_symbol({acct_num}, {sym_id}) skipped: {exc}")
        logger.info(f"[cTrader.DefaultSubs] Subscribed default symbol set for account {acct_num}")

    def handle_reconcile_event(self, event_data: Dict[str, Any]):
        """
        Handles official ProtoOAReconcileRes (2125) from Spotware server.
        Synchronizes broker open positions into database feed.
        """
        try:
            acct_num = int(event_data.get("ctidTraderAccountId")) if event_data.get("ctidTraderAccountId") is not None else 0
            user_id = find_user_for_account(acct_num)
            if not user_id:
                logger.warning(f"[cTrader.Reconcile] Unmapped account {acct_num}; refusing to write position data.")
                ctrader_client.metrics["unmapped_events_count"] += 1
                return
            positions = event_data.get("position", [])
            logger.info(f"[cTrader.Reconcile] Reconciling {len(positions)} active positions for account {acct_num} (User: {user_id})")

            # Always subscribe to default symbols so ticks flow even when no positions exist yet
            self.subscribe_default_symbols(acct_num)

            reconciled_position_ids: Set[str] = set()

            for pos in positions:
                pos_id = str(pos.get("positionId"))
                reconciled_position_ids.add(pos_id)
                trade_data = position_trade_data(pos)
                raw_symbol_id = trade_data.get("symbolId") or pos.get("symbolId")
                symbol_id = int(raw_symbol_id) if raw_symbol_id is not None else None
                meta = symbol_registry.resolve(symbol_id=symbol_id, symbol_name=pos.get("symbolName"))
                symbol = meta["name"]
                
                # Ensure spot subscription is active for this symbol
                if symbol_id:
                    self.subscribe_symbol(acct_num, symbol_id)

                trade_side = normalize_trade_side(trade_data.get("tradeSide") or pos.get("tradeSide"))
                if not trade_side:
                    logger.warning(f"[cTrader.Reconcile] Position {pos_id} has no valid tradeSide; skipping")
                    continue
                
                lot = normalize_volume_lots(trade_data.get("volume") or pos.get("volume"), meta)
                if lot is None or lot <= 0:
                    logger.warning(f"[cTrader.Reconcile] Position {pos_id} has no valid volume; skipping")
                    continue
                entry = float(pos.get("price") or 0.0)
                sl = float(pos.get("stopLoss") or 0.0)
                tp = float(pos.get("takeProfit") or 0.0)
                swap = float(pos.get("swap", 0.0))
                commission = float(pos.get("commission", 0.0))
                money_digits = int(find_account_state(acct_num).get("moneyDigits", 2))

                canonical_post_id = f"post-ctrader-{acct_num}-{pos_id}"

                # Persist Normalized Position (Key: {accountId}_{positionId})
                db_store.upsert_broker_position(acct_num, pos_id, pos)

                # Strict Deduplication: search by (account_id, position_id)
                existing = next((
                    p for p in db_store.posts
                    if (p.get("trade_id") == pos_id and str(p.get("account_id", "")).endswith(str(acct_num))) or p.get("id") == canonical_post_id
                ), None)

                if not existing:
                    user = db_store.find_user_by_id_or_username(user_id) or {}
                    new_post_dict = {
                        "id": canonical_post_id,
                        "user_id": user_id,
                        "username": user.get("username", "trader"),
                        "avatar": user.get("avatar", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"),
                        "account_id": f"cTrader-{acct_num}",
                        "trade_id": pos_id,
                        "symbol": symbol,
                        "market": meta["market"],
                        "strategy_id": "breakout",
                        "position_type": trade_side,
                        "status": "OPEN",
                        "entry_price": entry,
                        "current_price": entry,
                        "stop_loss": sl if sl > 0 else None,
                        "take_profit": tp if tp > 0 else None,
                        "progress": 50,
                        "swap": normalize_money_value(swap, money_digits),
                        "commission": normalize_money_value(commission, money_digits),
                        "profit": normalize_money_value(swap + commission, money_digits),
                        "profit_percent": 0.0,
                        "lot": lot,
                        "pips": 0.0,
                        "source": "broker_ctrader",
                        "is_simulation": False,
                        "duration": "Live OP",
                        "opened_at": datetime.now(timezone.utc),
                        "visibility": "LOCKED",
                        "unlock_price": 1,
                        "follow_price": 1,
                        "auto_description": f"⚡ Posisi Broker cTrader: {trade_side} {lot} Lot {symbol} @ {entry}",
                        "custom_description": "Eksekusi Realtime cTrader Broker Feed"
                    }
                    created = db_store.create_post(new_post_dict)
                    logger.info(f"[cTrader.Reconcile] Created reconciled post: {created['id']} for {symbol}")
                    if self.sio:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            from backend.server import format_post
                            loop.create_task(self.sio.emit("feed_post_created", {"post": format_post(created)}))
                else:
                    # Update existing open position
                    db_store.update_post(existing["id"], {
                        "entry_price": entry,
                        "stop_loss": sl if sl > 0 else None,
                        "take_profit": tp if tp > 0 else None,
                        "lot": lot,
                        "updated_at": datetime.now(timezone.utc)
                    })

            # Close only broker positions for this account that disappeared from the snapshot.
            for post in db_store.posts:
                if post.get("source") != "broker_ctrader" or post.get("status") != "OPEN":
                    continue
                if str(post.get("account_id", "")).replace("cTrader-", "") != str(acct_num):
                    continue
                if str(post.get("trade_id", "")) not in reconciled_position_ids:
                    db_store.update_post(post["id"], {
                        "status": "CLOSED",
                        "closed_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc)
                    })

            # Record Reconciliation Audit Log
            db_store.record_reconciliation_audit(acct_num, {
                "reconciled_positions_count": len(positions),
                "reconciled_position_ids": list(reconciled_position_ids),
                "account_id": f"cTrader-{acct_num}",
                "user_id": user_id
            })
        except Exception as exc:
            logger.error(f"[cTrader.Reconcile] handle_reconcile_event error: {exc}", exc_info=True)

    def handle_trader_event(self, event_data: Dict[str, Any]):
        """Persists broker account metrics and publishes the private account snapshot."""
        try:
            trader = event_data.get("trader", {}) or event_data
            acct_num = int(trader.get("ctidTraderAccountId") or event_data.get("ctidTraderAccountId") or 0)
            if not acct_num:
                return
            account_state = find_account_state(acct_num)
            user_id = find_user_for_account(acct_num) or account_state.get("userId")
            if user_id:
                user = db_store.find_user_by_id_or_username(user_id)
                if user:
                    accounts = user.get("ctrader_accounts") or []
                    account_id = f"cTrader-{acct_num}"
                    for account in accounts:
                        if account.get("accountId") == account_id:
                            account["balance"] = account_state.get("balance", account.get("balance", 0.0))
                            account["leverage"] = account_state.get("leverage", account.get("leverage", 500))
                            account["currency"] = account_state.get("currency", account.get("currency", "USD"))
                    db_store.update_user(user.get("id") or user.get("username"), {"ctrader_accounts": accounts})
            db_store.record_account_snapshot(f"cTrader-{acct_num}", self.get_account_live_state(f"cTrader-{acct_num}"))
            # Ensure default spot subscriptions are active for this account (idempotent). Runs on auth-time trader event
            # so realtime price ticks start flowing even when the account has zero open positions.
            self.subscribe_default_symbols(acct_num)
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.emit_account_update(f"cTrader-{acct_num}"))
        except Exception as exc:
            logger.error(f"[cTrader.Trader] handle_trader_event error: {exc}", exc_info=True)

    def handle_margin_event(self, event_data: Dict[str, Any]):
        acct_num = int(event_data.get("ctidTraderAccountId") or 0)
        if acct_num:
            _client = find_client_by_account(acct_num) or ctrader_client
            _client.account_states.setdefault(acct_num, {}).update({
                "marginUpdatedAt": datetime.now(timezone.utc).isoformat(),
                "marginEvent": event_data
            })
            try:
                loop = asyncio.get_running_loop()
                if self.sio:
                    loop.create_task(self.emit_account_update(f"cTrader-{acct_num}"))
            except RuntimeError:
                pass

    def handle_unrealized_pnl_event(self, event_data: Dict[str, Any]):
        acct_num = int(event_data.get("ctidTraderAccountId") or 0)
        money_digits = int(event_data.get("moneyDigits", 2))
        for item in event_data.get("positionUnrealizedPnL", []) or []:
            position_id = str(item.get("positionId") or "")
            if not position_id:
                continue
            raw_profit = item.get("netUnrealizedPnL", item.get("grossUnrealizedPnL", 0))
            broker_profit = normalize_money_value(raw_profit, money_digits)
            post = next((p for p in db_store.posts if p.get("trade_id") == position_id and str(p.get("account_id", "")).endswith(str(acct_num))), None)
            if not post:
                continue
            post["broker_unrealized_pnl"] = broker_profit
            payload = self.compute_position_payload(post)
            if payload and self.sio:
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        loop.create_task(self.emit_position_update(payload))
                except RuntimeError:
                    pass

    def handle_deal_list_event(self, event_data: Dict[str, Any]):
        acct_num = int(event_data.get("ctidTraderAccountId") or 0)
        deals = event_data.get("deal", []) or []
        for deal in deals:
            deal_id = deal.get("dealId")
            if acct_num and deal_id:
                db_store.record_broker_deal(acct_num, deal_id, deal)
                self.processed_deal_ids.add(str(deal_id))
                position_id = str(deal.get("positionId") or "")
                if position_id and deal.get("closePositionDetail"):
                    post_id = f"post-ctrader-{acct_num}-{position_id}"
                    post = db_store.find_post_by_id(post_id)
                    if not post:
                        user_id = find_user_for_account(acct_num)
                        user = db_store.find_user_by_id_or_username(user_id) if user_id else None
                        if not user:
                            ctrader_client.metrics["unmapped_events_count"] += 1
                            continue
                        detail = deal.get("closePositionDetail") or {}
                        symbol_id = int(deal.get("symbolId")) if deal.get("symbolId") is not None else None
                        meta = symbol_registry.resolve(symbol_id=symbol_id)
                        symbol = meta["name"]
                        side = normalize_trade_side(deal.get("tradeSide")) or "BUY"
                        # CLOSING deal side is inverse of position side: BUY deal closes SELL position, SELL deal closes BUY position
                        position_side = "SELL" if side == "BUY" else "BUY"
                        money_digits = int(detail.get("moneyDigits") or deal.get("moneyDigits") or 2)
                        profit = normalize_money_value(detail.get("grossProfit"), money_digits)
                        swap = normalize_money_value(detail.get("swap"), money_digits)
                        commission = normalize_money_value(detail.get("commission"), money_digits)
                        # entryPrice inside closePositionDetail may itself be raw-scaled by symbol digits on some brokers.
                        # If the value looks impossibly large (raw int), scale it down; else keep as float.
                        raw_entry = detail.get("entryPrice")
                        entry_price = float(raw_entry or 0.0)
                        if entry_price > 0 and abs(entry_price) >= 10 ** (int(meta.get("digits", 5)) + 4):
                            entry_price = entry_price / (10 ** int(meta.get("digits", 5)))
                        close_price = float(deal.get("executionPrice") or 0.0)
                        pip_size = 10 ** (-int(meta.get("pipPosition", 4)))
                        # Real pips from price diff, using POSITION side (not deal side)
                        if position_side == "BUY":
                            pips_val = round((close_price - entry_price) / pip_size, 1) if entry_price > 0 else 0.0
                        else:
                            pips_val = round((entry_price - close_price) / pip_size, 1) if entry_price > 0 else 0.0
                        lot_val = normalize_volume_lots(deal.get("volume"), meta) or 0.01
                        # Profit percent: net profit vs notional entry value (approx of margin-normalized return)
                        notional = entry_price * lot_val * float(meta.get("lotUnits", 100000.0))
                        net_profit = round(profit + swap + commission, 2)
                        profit_percent = round((net_profit / notional) * 100.0, 2) if notional > 0 else 0.0
                        closed_at = datetime.fromtimestamp(
                            int(deal.get("executionTimestamp") or time.time() * 1000) / 1000,
                            tz=timezone.utc
                        )
                        post = db_store.create_post({
                            "id": post_id,
                            "account_id": f"cTrader-{acct_num}",
                            "user_id": user_id,
                            "username": user.get("username"),
                            "avatar": user.get("avatar"),
                            "trade_id": position_id,
                            "symbol": symbol,
                            "market": meta["market"],
                            "strategy_id": user.get("strategy_dna", "breakout"),
                            "position_type": position_side,
                            "status": "CLOSED",
                            "entry_price": entry_price,
                            "current_price": close_price,
                            "profit": net_profit,
                            "profit_percent": profit_percent,
                            "lot": lot_val,
                            "pips": pips_val,
                            "duration": "Closed Deal",
                            "opened_at": closed_at,
                            "closed_at": closed_at,
                            "source": "broker_ctrader",
                            "is_simulation": False
                        })
                    if post and post.get("status") != "CLOSED":
                        detail = deal.get("closePositionDetail") or {}
                        money_digits = int(detail.get("moneyDigits") or deal.get("moneyDigits") or 2)
                        profit = normalize_money_value(detail.get("grossProfit"), money_digits)
                        swap = normalize_money_value(detail.get("swap"), money_digits)
                        commission = normalize_money_value(detail.get("commission"), money_digits)
                        close_price = float(deal.get("executionPrice") or post.get("current_price") or 0.0)
                        entry_price = float(post.get("entry_price") or 0.0)
                        symbol_name = post.get("symbol") or ""
                        meta = symbol_registry.resolve(symbol_name=symbol_name)
                        pip_size = 10 ** (-int(meta.get("pipPosition", 4)))
                        position_side = str(post.get("position_type") or "BUY").upper()
                        if position_side == "BUY":
                            pips_val = round((close_price - entry_price) / pip_size, 1) if entry_price > 0 else float(post.get("pips") or 0.0)
                        else:
                            pips_val = round((entry_price - close_price) / pip_size, 1) if entry_price > 0 else float(post.get("pips") or 0.0)
                        lot_val = float(post.get("lot") or 0.01)
                        notional = entry_price * lot_val * float(meta.get("lotUnits", 100000.0))
                        net_profit = round(profit + swap + commission, 2)
                        profit_percent = round((net_profit / notional) * 100.0, 2) if notional > 0 else 0.0
                        closed_at = datetime.fromtimestamp(
                            int(deal.get("executionTimestamp") or time.time() * 1000) / 1000,
                            tz=timezone.utc
                        )
                        db_store.update_post(post_id, {
                            "status": "CLOSED",
                            "current_price": close_price,
                            "profit": net_profit,
                            "profit_percent": profit_percent,
                            "pips": pips_val,
                            "closed_at": closed_at,
                            "updated_at": datetime.now(timezone.utc)
                        })
                        if self.sio:
                            loop = asyncio.get_event_loop()
                            if loop.is_running():
                                loop.create_task(self.sio.emit("feed:position_closed", event_contract_manager.build_position_closed_payload({
                                    "postId": post_id,
                                    "tradeId": position_id,
                                    "closePrice": close_price,
                                    "profit": net_profit,
                                    "closedAt": closed_at
                                })))

    def handle_execution_event(self, event_data: Dict[str, Any]):
        """
        Handles official ProtoOAExecutionEvent (2126) from Spotware server.
        Distinguishes ORDER_ACCEPTED (1), ORDER_FILLED (2), ORDER_REJECTED (5),
        ORDER_REPLACED (6), ORDER_PARTIAL_FILL (8), POSITION_CLOSED (12).
        """
        try:
            exec_type = int(event_data.get("executionType", 2))
            acct_num = event_data.get("ctidTraderAccountId", 0)
            pos = event_data.get("position", {}) or {}
            deal = event_data.get("deal", {}) or {}
            order = event_data.get("order", {}) or {}

            pos_id = str(pos.get("positionId") or deal.get("positionId") or order.get("positionId") or "")
            if not pos_id:
                logger.warning(f"[cTrader.Execution] Missing broker positionId in execution event. Skipping.")
                return

            canonical_post_id = f"post-ctrader-{acct_num}-{pos_id}"

            # Strict Deduplication Lookup by (account_id, position_id)
            existing_post = next((
                p for p in db_store.posts
                if (p.get("trade_id") == pos_id and str(p.get("account_id", "")).endswith(str(acct_num))) or p.get("id") == canonical_post_id
            ), None)

            # Update deal cursor timestamp
            deal_ts = int(deal.get("executionTimestamp") or event_data.get("timestamp") or time.time() * 1000)
            if acct_num:
                self.last_deal_cursor[acct_num] = max(self.last_deal_cursor.get(acct_num, 0), deal_ts)

            # Case A: Order Modification / SL-TP Amend (ORDER_REPLACED = 6)
            if exec_type == 6 and existing_post:
                sl = float(pos.get("stopLoss") or 0.0)
                tp = float(pos.get("takeProfit") or 0.0)
                db_store.update_post(existing_post["id"], {
                    "stop_loss": sl if sl > 0 else None,
                    "take_profit": tp if tp > 0 else None,
                    "updated_at": datetime.now(timezone.utc)
                })
                logger.info(f"[cTrader.Execution] Order modified for position {pos_id}: SL={sl}, TP={tp}")
                return

            # Case B: Order Rejected (ORDER_REJECTED = 5 / ORDER_CANCEL_REJECTED = 11)
            if exec_type in (5, 11) and existing_post:
                err_code = event_data.get("errorCode", "REJECTED")
                err_desc = event_data.get("description", "Broker rejected order execution")
                db_store.update_post(existing_post["id"], {
                    "last_error": f"[{err_code}] {err_desc}",
                    "updated_at": datetime.now(timezone.utc)
                })
                logger.warning(f"[cTrader.Execution] Position {pos_id} execution rejected: {err_code} - {err_desc}")
                return

            # Case C: Position Closed or Partially Closed
            # Triggered when executionType == 12 (POSITION_CLOSED) or deal contains closePositionDetail
            is_closing_deal = bool(deal.get("closePositionDetail") or exec_type == 12 or pos.get("positionStatus") == "POSITION_STATUS_CLOSED")
            
            if is_closing_deal and existing_post:
                deal_id = str(deal.get("dealId") or f"deal-{pos_id}-{deal_ts}")
                
                # Idempotency check for deal processing
                if deal_id in self.processed_deal_ids:
                    logger.info(f"[cTrader.Execution] Deal {deal_id} already processed. Skipping duplicate.")
                    return
                self.processed_deal_ids.add(deal_id)

                close_price = float(deal.get("executionPrice") or pos.get("price") or existing_post.get("current_price", 0.0))
                realized_profit = float(deal.get("grossProfit") or deal.get("netProfit") or 0.0)
                money_digits = int(
                    deal.get("moneyDigits")
                    or find_account_state(int(acct_num)).get("moneyDigits", 2)
                )
                realized_profit = normalize_money_value(realized_profit, money_digits)
                swap = normalize_money_value(deal.get("swap", 0.0), money_digits)
                commission = normalize_money_value(deal.get("commission", 0.0), money_digits)
                
                remaining_volume = float(pos.get("volume", 0.0)) if pos else 0.0
                
                # Partial Close check
                if remaining_volume > 0 and exec_type == 8:
                    trade_data = position_trade_data(pos)
                    raw_symbol_id = trade_data.get("symbolId") or pos.get("symbolId")
                    remaining_meta = symbol_registry.resolve(
                        symbol_id=int(raw_symbol_id) if raw_symbol_id is not None else None,
                        symbol_name=pos.get("symbolName")
                    )
                    remaining_lot = normalize_volume_lots(remaining_volume, remaining_meta, 0.0)
                    db_store.update_post(existing_post["id"], {
                        "lot": remaining_lot,
                        "profit": round(float(existing_post.get("profit", 0.0)) + realized_profit, 2),
                        "updated_at": datetime.now(timezone.utc)
                    })
                    logger.info(f"[cTrader.Execution] Partial close for position {pos_id}: remaining {remaining_lot} lots")
                else:
                    # Full Close confirmed by broker
                    closed_at_dt = datetime.fromtimestamp(deal_ts / 1000, tz=timezone.utc)
                    db_store.update_post(existing_post["id"], {
                        "status": "CLOSED",
                        "current_price": close_price,
                        "profit": realized_profit + swap + commission,
                        "closed_at": closed_at_dt,
                        "updated_at": datetime.now(timezone.utc)
                    })
                    logger.info(f"[cTrader.Execution] Position {pos_id} CLOSED. Final Realized PnL: {realized_profit}")
                    
                    if self.sio:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            closed_payload = event_contract_manager.build_position_closed_payload({
                                "postId": existing_post["id"],
                                "tradeId": pos_id,
                                "closePrice": close_price,
                                "profit": realized_profit,
                                "closedAt": closed_at_dt
                            })
                            loop.create_task(self.sio.emit("feed:position_closed", closed_payload))
                return

            # Case D: New Position Opened (ORDER_FILLED = 2 / ORDER_PARTIAL_FILL = 8)
            if not existing_post:
                trade_data = position_trade_data(pos)
                raw_symbol_id = trade_data.get("symbolId") or pos.get("symbolId") or deal.get("symbolId")
                symbol_id = int(raw_symbol_id) if raw_symbol_id is not None else None
                meta = symbol_registry.resolve(symbol_id=symbol_id, symbol_name=pos.get("symbolName"))
                symbol = meta["name"]
                
                if acct_num and symbol_id:
                    self.subscribe_symbol(acct_num, symbol_id)

                trade_side = normalize_trade_side(trade_data.get("tradeSide") or pos.get("tradeSide") or deal.get("tradeSide"))
                if not trade_side:
                    logger.warning(f"[cTrader.Execution] Position {pos_id} has no valid tradeSide; skipping")
                    return
                
                lot = normalize_volume_lots(trade_data.get("volume") or pos.get("volume") or deal.get("volume"), meta)
                if lot is None or lot <= 0:
                    logger.warning(f"[cTrader.Execution] Position {pos_id} has no valid volume; skipping")
                    return
                entry = float(pos.get("price") or deal.get("executionPrice") or 0.0)
                sl = float(pos.get("stopLoss") or 0.0)
                tp = float(pos.get("takeProfit") or 0.0)

                user_id = find_user_for_account(acct_num)
                if not user_id:
                    logger.warning(f"[cTrader.Execution] Unmapped account {acct_num}; refusing to write execution data.")
                    ctrader_client.metrics["unmapped_events_count"] += 1
                    return
                user = db_store.find_user_by_id_or_username(user_id) or {}

                new_post_dict = {
                    "id": canonical_post_id,
                    "user_id": user_id,
                    "username": user.get("username", "trader"),
                    "avatar": user.get("avatar", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"),
                    "account_id": f"cTrader-{acct_num}",
                    "trade_id": pos_id,
                    "symbol": symbol,
                    "market": meta["market"],
                    "strategy_id": "breakout",
                    "position_type": trade_side,
                    "status": "OPEN",
                    "entry_price": entry,
                    "current_price": entry,
                    "stop_loss": sl if sl > 0 else None,
                    "take_profit": tp if tp > 0 else None,
                    "progress": 50,
                    "profit": 0.0,
                    "profit_percent": 0.0,
                    "lot": lot,
                    "pips": 0.0,
                    "source": "broker_ctrader",
                    "is_simulation": False,
                    "duration": "Live OP",
                    "opened_at": datetime.now(timezone.utc),
                    "visibility": "LOCKED",
                    "unlock_price": 1,
                    "follow_price": 1,
                    "auto_description": f"⚡ Posisi Terbuka (OP) cTrader: {trade_side} {lot} Lot {symbol} @ {entry}",
                    "custom_description": "Eksekusi cTrader Realtime Feed"
                }

                created_post = db_store.create_post(new_post_dict)
                logger.info(f"[cTrader.OpenAPI] ProtoOAExecutionEvent: Created Feed Post {created_post['id']} for {trade_side} {lot} Lot {symbol}")

                if self.sio:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        new_post_payload = event_contract_manager.build_new_post_payload(created_post)
                        from backend.server import format_post
                        loop.create_task(self.sio.emit("feed_post_created", {"post": format_post(created_post)}))
                        loop.create_task(self.emit_position_update(self.compute_position_payload(created_post)))
        except Exception as exc:
            logger.error(f"[cTrader.OpenAPI] handle_execution_event error: {exc}", exc_info=True)

    def compute_position_payload(self, post: Dict[str, Any], bid_price: Optional[float] = None, ask_price: Optional[float] = None) -> Optional[Dict[str, Any]]:
        if not post or post.get("status") != "OPEN":
            return None

        symbol = str(post.get("symbol", "XAUUSD"))
        meta = symbol_registry.resolve(symbol_name=symbol)
        side = str(post.get("position_type", "BUY")).upper()
        entry = float(post.get("entry_price") or post.get("price") or 0.0)
        lot = float(post.get("lot", 0.01))
        pip_size = 10 ** (-meta["pipPosition"])

        # Fetch latest prices from Spotware spot cache if not directly supplied
        if bid_price is None or ask_price is None:
            cached_prices = self.market_prices.get(symbol)
            if cached_prices:
                current_bid = cached_prices["bid"]
                current_ask = cached_prices["ask"]
            else:
                curr = float(post.get("current_price") or entry)
                current_bid = curr
                current_ask = curr + (pip_size * 0.2)
        else:
            current_bid = bid_price
            current_ask = ask_price

        # Strict Valuation: BUY exits at BID; SELL exits at ASK
        valuation_price = current_bid if side in ["BUY", "1", "LONG"] else current_ask
        pips = calculate_pips(side, entry, current_bid, current_ask, pip_size)

        # cTrader's open-position net PnL is price PnL plus swap and commission.
        units = meta.get("lotUnits", 100000.0) * lot
        if side in ["BUY", "1", "LONG"]:
            price_profit = (current_bid - entry) * units
        else:
            price_profit = (entry - current_ask) * units

        acct_num = ctrader_client._clean_numeric_account_id(post.get("account_id", ""))
        account_state = find_account_state(acct_num) if acct_num else {}
        money_digits = int(account_state.get("moneyDigits", 2))
        swap = float(post.get("swap", 0.0) or 0.0)
        commission = float(post.get("commission", 0.0) or 0.0)
        broker_profit = post.get("broker_unrealized_pnl")
        profit_usd = round(float(broker_profit), money_digits) if broker_profit is not None else round(price_profit + swap + commission, money_digits)

        sl = float(post.get("stop_loss") or 0.0)
        tp = float(post.get("take_profit") or 0.0)
        progress = calculate_position_progress(side, entry, valuation_price, sl, tp, pips)
        profit_percent = round((profit_usd / max(1.0, entry * units)) * 100.0, 2) if entry > 0 else 0.0

        post_id = str(post.get("id"))
        trade_id = str(post.get("trade_id") or post_id)
        now_ts = int(time.time() * 1000)

        db_store.update_post(post_id, {
            "current_price": valuation_price,
            "pips": pips,
            "profit": profit_usd,
            "profit_percent": profit_percent,
            "progress": progress,
            "updated_at": datetime.now(timezone.utc)
        })

        payload = {
            "positionId": trade_id,
            "postId": post_id,
            "symbol": symbol,
            "side": side,
            "direction": side,
            "entry": entry,
            "current": valuation_price,
            "currentPrice": valuation_price,
            "bid": current_bid,
            "ask": current_ask,
            "pips": pips,
            "volumeLot": lot,
            "profitUsd": profit_usd,
            "profit": profit_usd,
            "profitPercent": profit_percent,
            "sl": sl,
            "tp": tp,
            "progress": progress,
            "status": "OPEN",
            "timestamp": now_ts
        }

        return payload

    async def emit_position_update(self, payload: Dict[str, Any]):
        if not self.sio or not payload:
            return
        try:
            standard_payload = event_contract_manager.build_position_update_payload(payload)
            await self.sio.emit("feed:position_update", standard_payload)
            await self.sio.emit("ctrader:position:update", standard_payload)
            await self.sio.emit("trade_tick", standard_payload)
        except Exception as e:
            logger.debug(f"[CTraderPositionService] emit warning: {e}")

    def get_account_live_state(self, account_id: str) -> Dict[str, Any]:
        """
        Computes accurate live account state:
        Realized Balance, Floating Equity, Margin, Free Margin, Margin Level, and Staleness.
        """
        acct_num = ctrader_client._clean_numeric_account_id(account_id)
        acct_info = find_account_state(acct_num) if acct_num else {}
        money_digits = int(acct_info.get("moneyDigits", 2))
        realized_balance = float(acct_info.get("balance", 0.0))
        leverage = float(acct_info.get("leverage", 500))
        currency = str(acct_info.get("currency", "USD"))

        # Lookup DB store user accounts for real balance if acct_info is not yet populated
        if realized_balance <= 0.0 and acct_num:
            for u in db_store.users:
                user_accts = u.get("ctrader_accounts", [])
                matched_acct = next(
                    (a for a in user_accts if str(a.get("accountId")).endswith(str(acct_num)) or str(a.get("accountNo")) == str(acct_num)),
                    None
                )
                if matched_acct:
                    realized_balance = float(matched_acct.get("balance", 0.0))
                    leverage = float(matched_acct.get("leverage", 500))
                    currency = str(matched_acct.get("currency", "USD"))
                    break

        # Find all active open positions for this account
        open_posts = [
            p for p in db_store.posts
            if p.get("status") == "OPEN" and acct_num and (
                str(p.get("account_id", "")).endswith(str(acct_num)) or
                p.get("account_id") == f"cTrader-{acct_num}"
            )
        ]

        total_unrealized_pnl = 0.0
        total_used_margin = 0.0

        for post in open_posts:
            pnl = float(post.get("profit", 0.0))
            total_unrealized_pnl += pnl
            
            entry = float(post.get("entry_price", 0.0))
            lot = float(post.get("lot", 0.01))
            meta = symbol_registry.resolve(symbol_name=post.get("symbol", "XAUUSD"))
            lot_units = meta.get("lotUnits", 100000.0)
            
            # Position margin = (notional volume) / leverage
            if leverage > 0 and entry > 0:
                pos_margin = (entry * lot * lot_units) / leverage
                total_used_margin += pos_margin

        total_unrealized_pnl = round(total_unrealized_pnl, money_digits)
        total_used_margin = round(total_used_margin, money_digits)
        equity = round(realized_balance + total_unrealized_pnl, money_digits)
        free_margin = round(equity - total_used_margin, money_digits)
        margin_level = round((equity / total_used_margin) * 100.0, 2) if total_used_margin > 0 else None

        # Staleness evaluation (>45 seconds without broker updates)
        is_stale = False
        stale_reason = None
        last_msg_str = ctrader_client.metrics.get("last_message_at")
        if last_msg_str:
            try:
                last_msg_dt = datetime.fromisoformat(last_msg_str)
                age_sec = (datetime.now(timezone.utc) - last_msg_dt).total_seconds()
                if age_sec > 45.0:
                    is_stale = True
                    stale_reason = f"No broker updates received for {age_sec:.0f}s"
            except Exception:
                pass

        return {
            "ctidTraderAccountId": acct_num,
            "accountId": f"cTrader-{acct_num}",
            "balance": realized_balance,
            "equity": equity,
            "unrealizedPnL": total_unrealized_pnl,
            "usedMargin": total_used_margin,
            "freeMargin": free_margin,
            "marginLevel": margin_level,
            "leverage": int(leverage),
            "currency": currency,
            "moneyDigits": money_digits,
            "openPositionsCount": len(open_posts),
            "isStale": is_stale,
            "staleReason": stale_reason,
            "timestamp": int(time.time() * 1000)
        }

    async def emit_account_update(self, account_id: str):
        if not self.sio or not account_id:
            return
        try:
            state = self.get_account_live_state(account_id)
            standard_acct_payload = event_contract_manager.build_account_metrics_payload(state)
            acct_num = ctrader_client._clean_numeric_account_id(account_id)
            user_id = find_user_for_account(acct_num)

            # Security Guard: Emit strictly to confidential private rooms
            if user_id:
                await self.sio.emit("account:metrics_update", standard_acct_payload, room=f"user_{user_id}")
                await self.sio.emit("ctrader:account_update", standard_acct_payload, room=f"user_{user_id}")
            
            await self.sio.emit("account:metrics_update", standard_acct_payload, room=f"account_{account_id}")
            await self.sio.emit("ctrader:account_update", standard_acct_payload, room=f"account_{account_id}")
        except Exception as e:
            logger.debug(f"[CTraderPositionService] account emit warning: {e}")

    async def _service_loop(self, interval_sec: float = 2.0):
        logger.info(f"[CTraderPositionService] Persistent Realtime Engine active ({interval_sec}s cycle).")
        cycle_count = 0
        # Import here to avoid circular — backend-first: must resolve to the same module copy
        # whose clients on_startup() starts (see the register_handler_on_all note above).
        try:
            from backend.ctrader_client import all_ctrader_clients
        except ImportError:
            from ctrader_client import all_ctrader_clients
        while self._running:
            try:
                cycle_count += 1

                # Iterate BOTH live+demo clients so admin demo accounts also get periodic fallback sync & P&L polling
                for c in all_ctrader_clients():
                    if str(c.state) != "AUTHENTICATED" and getattr(c.state, "value", None) != "AUTHENTICATED":
                        continue
                    # Fallback Reconciliation: every 60 seconds (30 cycles)
                    if cycle_count % 30 == 0:
                        for acct_num in list(c.account_states.keys()):
                            if c.is_account_authenticated(acct_num):
                                logger.debug(f"[cTrader.Fallback] Periodic fallback sync for account {acct_num} ({c._env})")
                                await c.send_message(2121, {"ctidTraderAccountId": acct_num})  # PROTO_OA_TRADER_REQ
                                await c.send_message(2124, {"ctidTraderAccountId": acct_num})  # PROTO_OA_RECONCILE_REQ
                                await self.emit_account_update(f"cTrader-{acct_num}")

                    for acct_num, account_state in list(c.account_states.items()):
                        if account_state.get("authStatus") == "AUTHENTICATED":
                            await c.request_position_unrealized_pnl(acct_num)

            except Exception as exc:
                logger.warning(f"[CTraderPositionService] Loop warning: {exc}")
            await asyncio.sleep(interval_sec)

    def start(self, interval_sec: float = 2.0):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._service_loop(interval_sec))

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

ctrader_position_service = CTraderPositionService()
live_trading_service = ctrader_position_service
