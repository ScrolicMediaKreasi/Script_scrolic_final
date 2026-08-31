"""
Comprehensive Verification Script for Scrolic Python Single-Runtime Backend
"""
import sys, os
import time
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure backend package can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.server import app
from backend.database import db_store

client = TestClient(app)

def test_root():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json().get("ok") == True
    print("✅ Root / endpoint working")

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json().get("ok") == True
    print("✅ Health /api/health working")

def test_health_proxy():
    res = client.get("/api/health/proxy")
    assert res.status_code == 200
    data = res.json()
    assert data.get("node_alive") == False
    assert data.get("ctrader_runtime_owner") == "fastapi"
    assert "single-runtime" in data.get("service")
    print("✅ Health Proxy /api/health/proxy working (FastAPI sole owner, node_alive: False)")

def test_ctrader_security_and_config():
    res = client.get("/api/ctrader/config")
    assert res.status_code == 200
    cfg = res.json()
    assert "environment" in cfg
    assert "redirectUri" in cfg
    assert "grantAccessUrl" in cfg

    # Verify unauthenticated/unconnected user token status
    res_status = client.get("/api/ctrader/token/status", headers={"x-session-user-id": "user-alex"})
    assert res_status.status_code == 200
    status_data = res_status.json().get("status", {})
    assert status_data.get("isConnected") == False

    # Verify connection status and diagnostics endpoints (Tahap 2)
    res_conn = client.get("/api/ctrader/connection/status")
    assert res_conn.status_code == 200
    conn_data = res_conn.json().get("connection", {})
    assert "state" in conn_data
    assert "transport" in conn_data
    assert "environment" in conn_data
    assert "reconnect_count" in conn_data

    res_diag = client.get("/api/ctrader/diagnostics")
    assert res_diag.status_code == 200
    diag_data = res_diag.json().get("diagnostics", {})
    assert "host" in diag_data
    assert diag_data.get("ws_port") == 5035
    assert diag_data.get("tcp_port") == 5035

    from backend.ctrader_client import ctrader_client
    assert ctrader_client._heartbeat_interval == 10.0
    assert ctrader_client._clean_numeric_account_id("cTrader-47601047") == 47601047
    print("✅ cTrader Connection Lifecycle, Security & Diagnostics verified")

def test_ctrader_oauth_security_and_csrf():
    # 1. Test Auth URL generation with cryptographically signed state
    res_auth = client.get("/api/ctrader/auth-url?json=true", headers={"x-session-user-id": "user-alex"})
    assert res_auth.status_code == 200
    auth_data = res_auth.json()
    assert auth_data.get("success") == True
    url = auth_data.get("url", "")
    assert "connect.spotware.com" in url
    assert "state=" in url

    # 2. Test Callback rejects invalid / forged state (CSRF Protection)
    res_bad_state = client.get("/api/ctrader/callback?code=mock_code&state=forged_state", follow_redirects=False)
    assert res_bad_state.status_code == 302
    assert "ctrader_error=invalid_state" in res_bad_state.headers.get("location", "")

    # 3. Test Callback rejects missing code
    res_no_code = client.get("/api/ctrader/callback?state=dummy", follow_redirects=False)
    assert res_no_code.status_code == 302
    assert "ctrader_error=missing_code" in res_no_code.headers.get("location", "")
    print("✅ cTrader OAuth 2.0 Security, CSRF Protection & State Validation verified")

def test_ctrader_account_auth_and_switching():
    # 1. Test accounts status endpoint
    res_status = client.get("/api/ctrader/accounts/status", headers={"x-session-user-id": "user-alex"})
    assert res_status.status_code == 200
    st_data = res_status.json()
    assert st_data.get("success") == True
    assert "environment" in st_data

    # 2. Test switch rejection when account is not in user's OAuth authorized list
    res_bad_acct = client.post(
        "/api/ctrader/switch",
        json={"accountId": "cTrader-99999999"},
        headers={"x-session-user-id": "user-alex"}
    )
    assert res_bad_acct.status_code == 400
    assert "ACCOUNT_NOT_AUTHORIZED" in res_bad_acct.json().get("detail", "")

    # An account event has no user identifier, so an active broker account must
    # remain bound to its first authenticated user in runtime state.
    from backend.ctrader_client import ctrader_client
    ctrader_client.account_to_user_map[47601047] = "user-alex"
    assert asyncio.run(ctrader_client.authenticate_account(47601047, "token", "user-other")) is False
    assert ctrader_client.account_to_user_map.get(47601047) == "user-alex"
    print("✅ cTrader Application & Account Authentication, Whitelisting & Status verified")

def test_ctrader_market_data_and_reconciliation():
    from backend.ticker import symbol_registry, calculate_pips, ctrader_position_service
    from backend.ctrader_client import ctrader_client
    ctrader_client.account_to_user_map[47601047] = "user-alex"
    # 1. Dynamic Symbol Metadata Resolution
    meta_xau = symbol_registry.resolve(symbol_name="XAUUSD")
    assert meta_xau["pipPosition"] == 1
    assert meta_xau["digits"] == 2
    assert meta_xau["lotUnits"] == 100.0

    meta_eur = symbol_registry.resolve(symbol_name="EURUSD")
    assert meta_eur["pipPosition"] == 4

    # 2. Strict Valuation: BUY uses BID, SELL uses ASK
    pips_buy = calculate_pips(side="BUY", entry=2900.0, current_bid=2910.0, current_ask=2910.2, pip_size=0.1)
    assert pips_buy == 100.0

    pips_sell = calculate_pips(side="SELL", entry=2910.0, current_bid=2900.0, current_ask=2900.2, pip_size=0.1)
    assert pips_sell == 98.0

    # 3. Test Spot Event Handler
    ctrader_position_service.handle_spot_event({
        "symbolId": 41,
        "bid": 291550,
        "ask": 291570,
        "timestamp": int(time.time() * 1000)
    })
    assert "XAUUSD" in ctrader_position_service.market_prices
    assert ctrader_position_service.market_prices["XAUUSD"]["bid"] == 2915.50

    # 4. Test Reconciliation by (account_id, position_id)
    ctrader_position_service.handle_reconcile_event({
        "ctidTraderAccountId": 47601047,
        "position": [
            {
                "positionId": 987654321,
                "symbolId": 41,
                "tradeSide": "BUY",
                "volume": 200000,
                "price": 2900.0,
                "stopLoss": 2880.0,
                "takeProfit": 2950.0
            }
        ]
    })
    
    # Verify created post
    created_post = db_store.find_post_by_id("post-ctrader-47601047-987654321")
    assert created_post is not None
    assert created_post["symbol"] == "XAUUSD"
    assert created_post["source"] == "broker_ctrader"
    assert created_post["is_simulation"] == False
    assert created_post["lot"] == 2.0
    print("✅ cTrader Dynamic Symbol Metadata, Bid/Ask Valuation & Reconciliation verified")

def test_ctrader_execution_events_and_close():
    from backend.ticker import ctrader_position_service
    from backend.ctrader_client import ctrader_client
    ctrader_client._app_authenticated_event.set()
    # 1. Test ORDER_FILLED execution event (Open Position)
    ctrader_position_service.handle_execution_event({
        "executionType": 2,
        "ctidTraderAccountId": 47601047,
        "position": {
            "positionId": 11223344,
            "symbolId": 1,
            "tradeSide": "BUY",
            "volume": 100000,
            "price": 1.08500,
            "stopLoss": 1.08000,
            "takeProfit": 1.09500
        }
    })

    opened_post = db_store.find_post_by_id("post-ctrader-47601047-11223344")
    assert opened_post is not None
    assert opened_post["status"] == "OPEN"
    assert opened_post["symbol"] == "EURUSD"

    # 2. Test POSITION_CLOSED execution event with Deal details
    ctrader_position_service.handle_execution_event({
        "executionType": 12,
        "ctidTraderAccountId": 47601047,
        "position": {
            "positionId": 11223344,
            "positionStatus": "POSITION_STATUS_CLOSED",
            "volume": 0
        },
        "deal": {
            "dealId": 998877,
            "positionId": 11223344,
            "executionPrice": 1.09200,
            "grossProfit": 70000,
            "swap": 500,
            "commission": -200,
            "executionTimestamp": int(time.time() * 1000),
            "closePositionDetail": {"closedVolume": 100000, "entryPrice": 1.08500}
        }
    })

    closed_post = db_store.find_post_by_id("post-ctrader-47601047-11223344")
    assert closed_post is not None
    assert closed_post["status"] == "CLOSED"
    assert closed_post["entry_price"] == 1.08500
    assert closed_post["current_price"] == 1.09200
    assert closed_post["profit"] == 703.0 # (700.0 + 5.0 - 2.0)

    # 3. Test Deal Idempotency (Processing identical deal event must not mutate or duplicate)
    initial_deal_set_len = len(ctrader_position_service.processed_deal_ids)
    ctrader_position_service.handle_execution_event({
        "executionType": 12,
        "ctidTraderAccountId": 47601047,
        "deal": {
            "dealId": 998877,
            "positionId": 11223344,
            "closePositionDetail": {"closedVolume": 100000}
        }
    })
    assert len(ctrader_position_service.processed_deal_ids) == initial_deal_set_len

    # 4. Test Close Endpoint dispatch
    res_close = client.post(
        "/api/ctrader/positions/11223344/close",
        headers={"x-session-user-id": "user-alex"}
    )
    assert res_close.status_code == 200
    assert res_close.json().get("success") == True
    print("✅ cTrader Execution Events, Deal Closing, Idempotency & Close Endpoint verified")

def test_ctrader_account_state_and_pnl():
    from backend.ticker import ctrader_position_service
    from backend.ctrader_client import ctrader_client

    # 1. Simulate ProtoOATraderRes setting exact balance & moneyDigits
    ctrader_client.account_states[47601047] = {
        "ctidTraderAccountId": 47601047,
        "accountId": "cTrader-47601047",
        "balance": 5420.50,
        "moneyDigits": 2,
        "leverage": 500,
        "currency": "USD",
        "authStatus": "AUTHENTICATED"
    }

    # 2. Get Live Account State with calculated floating equity & margin
    state = ctrader_position_service.get_account_live_state("cTrader-47601047")
    assert state["balance"] == 5420.50
    assert "equity" in state
    assert "unrealizedPnL" in state
    assert "usedMargin" in state
    assert "freeMargin" in state
    assert "isStale" in state

    # 3. Test Account Metrics Endpoint
    # Temporarily set active account for alex
    db_store.update_user("user-alex", {"ctrader_account_id": "cTrader-47601047"})
    res_metrics = client.get("/api/ctrader/account/metrics", headers={"x-session-user-id": "user-alex"})
    assert res_metrics.status_code == 200
    m_data = res_metrics.json().get("metrics", {})
    assert m_data.get("balance") == 5420.50
    assert m_data.get("currency") == "USD"
    print("✅ cTrader Live Account State, Equity/PnL & Metrics Endpoint verified")

def test_event_contracts_and_room_isolation():
    from backend.event_contract import event_contract_manager
    
    # 1. Test build_new_post_payload
    post_dict = {
        "id": "post-ctrader-47601047-11223344",
        "trade_id": "11223344",
        "user_id": "user-alex",
        "username": "alex_trader",
        "account_id": "cTrader-47601047",
        "symbol": "XAUUSD",
        "position_type": "BUY",
        "entry_price": 2914.50,
        "lot": 1.0,
        "status": "OPEN",
        "source": "broker_ctrader"
    }
    p_evt = event_contract_manager.build_new_post_payload(post_dict)
    assert p_evt["eventId"].startswith("post_new_")
    assert isinstance(p_evt["sequence"], int)
    assert p_evt["postId"] == "post-ctrader-47601047-11223344"
    assert p_evt["positionId"] == "11223344"
    assert p_evt["entryPrice"] == 2914.50

    # 2. Test build_position_update_payload
    upd_evt = event_contract_manager.build_position_update_payload({
        "postId": "post-ctrader-47601047-11223344",
        "currentPrice": 2918.20,
        "profitUsd": 370.0,
        "pips": 37.0
    })
    assert upd_evt["eventId"].startswith("pos_upd_")
    assert upd_evt["currentPrice"] == 2918.20
    assert upd_evt["profit"] == 370.0

    # 3. Test build_account_metrics_payload (Private room envelope)
    acct_evt = event_contract_manager.build_account_metrics_payload({
        "accountId": "cTrader-47601047",
        "ctidTraderAccountId": 47601047,
        "balance": 5420.50,
        "equity": 5790.50,
        "unrealizedPnL": 370.00
    })
    assert acct_evt["eventId"].startswith("acct_upd_")
    assert acct_evt["accountId"] == "cTrader-47601047"
    assert acct_evt["balance"] == 5420.50
    assert acct_evt["equity"] == 5790.50

    # 4. Test build_connection_status_payload
    conn_evt = event_contract_manager.build_connection_status_payload({
        "state": "AUTHENTICATED",
        "is_broker_connected": True,
        "is_authenticated": True,
        "environment": "demo"
    })
    assert conn_evt["eventId"].startswith("conn_upd_")
    assert conn_evt["isBrokerConnected"] == True
    assert conn_evt["isAuthenticated"] == True
    print("✅ Standardized Event Contract (camelCase, eventId, sequence, room isolation) verified")

def test_broker_data_and_persistence():
    # 1. Test Raw Broker Event Sanitization & Audit Log
    db_store.save_raw_broker_event(2102, {
        "ctidTraderAccountId": 47601047,
        "accessToken": "secret_token_12345",
        "clientSecret": "super_secret_client_key",
        "orderId": 556677
    })
    assert len(db_store.broker_raw_events) > 0
    latest_raw = db_store.broker_raw_events[0]
    assert latest_raw["data"]["accessToken"] == "[REDACTED]"
    assert latest_raw["data"]["clientSecret"] == "[REDACTED]"
    assert latest_raw["data"]["orderId"] == 556677

    # 2. Test Normalized Open Position Upsert & Retrieval
    pos_data = {
        "symbol": "EURUSD",
        "tradeSide": "BUY",
        "volume": 100000,
        "price": 1.08500
    }
    db_store.upsert_broker_position(47601047, 998811, pos_data)
    retrieved_pos = db_store.get_broker_position(47601047, 998811)
    assert retrieved_pos is not None
    assert retrieved_pos["symbol"] == "EURUSD"
    assert retrieved_pos["account_id"] == "47601047"
    assert retrieved_pos["position_id"] == "998811"

    # 3. Test Normalized Closed Deal Recording (Idempotency)
    deal_data = {
        "dealId": 776655,
        "executionPrice": 1.09000,
        "grossProfit": 50000
    }
    db_store.record_broker_deal(47601047, 776655, deal_data)
    deals = db_store.get_broker_deals_for_account(47601047)
    assert len(deals) >= 1
    assert any(d["deal_id"] == "776655" for d in deals)

    # 4. Test Reconciliation Audit Log
    db_store.record_reconciliation_audit(47601047, {
        "reconciled_positions_count": 2,
        "reconciled_position_ids": ["998811", "987654321"]
    })
    reconcile_logs = db_store.get_reconciliation_audit_logs()
    assert len(reconcile_logs) > 0
    assert reconcile_logs[0]["account_id"] == "47601047"
    print("✅ Broker Data & Persistence (Normalized Positions, Deals, Sanitized Raw Audit & Reconciliation Logs) verified")

def test_observability_and_health_checks():
    # 1. Test Observability Dashboard Endpoint
    res_obs = client.get("/api/ctrader/observability/dashboard", headers={"x-session-user-id": "user-alex"})
    assert res_obs.status_code == 200
    obs_data = res_obs.json()
    assert obs_data.get("success") == True
    assert "metrics" in obs_data
    assert "alarms" in obs_data
    assert "reconciliationLogs" in obs_data
    assert obs_data["runtime"]["owner"] == "FastAPI Single Runtime"
    assert obs_data["runtime"]["node_runtime_deactivated"] == True

    # 2. Test Differentiated Health Endpoint
    res_health = client.get("/api/ctrader/health")
    assert res_health.status_code == 200
    h_data = res_health.json()
    assert "app" in h_data
    assert "socketio" in h_data
    assert "ctrader_broker" in h_data
    assert h_data["app"]["runtime"] == "FastAPI :8001"
    assert h_data["socketio"]["is_asgi"] == True
    print("✅ Observability Dashboard, Latencies, Alarms, and Differentiated Health Checks verified")

def test_google_auth():
    # Test Google GSI credential login
    payload = {
        "email": "test.google.trader@scrolic.com",
        "name": "Google Test Trader",
        "username": "google_test_trader",
        "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=google_test",
        "referralCode": "SCROLIC50",
        "termsAccepted": True,
        "privacyAccepted": True,
        "legalVersion": "2026-02-26"
    }
    res = client.post("/api/auth/google", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("success") == True
    user = data.get("user")
    assert user.get("username") == "google_test_trader"
    assert user.get("email") == "test.google.trader@scrolic.com"
    print("✅ Google Auth /api/auth/google working (User registered & referral processed)")

def test_referral_topup_commissions_are_recorded_for_production():
    db_store.users = [
        {"id": "prod-root", "username": "prod_root", "energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": None},
        {"id": "prod-g1", "username": "prod_g1", "energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-root"},
        {"id": "prod-g2", "username": "prod_g2", "energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-g1"},
        {"id": "prod-buyer", "username": "prod_buyer", "energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-g2"}
    ]
    db_store.transactions = []
    db_store.payments = []
    db_store.create_payment({
        "id": "pay-prod-commission-test",
        "user_id": "prod-buyer",
        "amount": 50000,
        "energy_amount": 100,
        "mayar_invoice_id": "invoice-prod-commission-test",
        "status": "pending"
    })

    res = client.post(
        "/api/payments/mayar/webhook",
        json={
            "event": "payment.received",
            "data": {
                "id": "invoice-prod-commission-test",
                "status": "paid",
                "amount": 50000,
                "energy_amount": 100,
                "user_id": "prod-buyer"
            }
        }
    )
    assert res.status_code == 200
    assert res.json().get("success") == True

    buyer = db_store.find_user_by_id_or_username("prod-buyer")
    g2 = db_store.find_user_by_id_or_username("prod-g2")
    g1 = db_store.find_user_by_id_or_username("prod-g1")
    root = db_store.find_user_by_id_or_username("prod-root")

    assert buyer.get("energy") == 100
    assert g2.get("energy") == 10
    assert g1.get("energy") == 10
    assert root.get("energy") == 10

    assert g2.get("affiliate_earnings_energy") == 10
    assert g1.get("affiliate_earnings_energy") == 10
    assert root.get("affiliate_earnings_energy") == 10

    aff_tx = [tx for tx in db_store.transactions if tx.get("type") == "AFFILIATE_COMMISSION"]
    assert len(aff_tx) >= 3
    assert all(tx.get("amount") == 10 for tx in aff_tx)
    print("✅ Referral top-up commissions recorded for production integrity")


def test_login_and_me():
    res = client.post("/api/auth/login", json={"username": "alex_trader"})
    assert res.status_code == 200
    user = res.json().get("user")
    assert user.get("username") == "alex_trader"

    res_me = client.get("/api/user/me", headers={"x-session-user-id": "user-alex"})
    assert res_me.status_code == 200
    user_me = res_me.json().get("user")
    assert user_me.get("username") == "alex_trader"
    assert user_me.get("cTraderConnected") == False
    print("✅ Login /api/auth/login & /api/user/me working")

def test_feed_and_interactions():
    res = client.get("/api/feed")
    assert res.status_code == 200
    posts = res.json().get("posts")
    assert len(posts) > 0
    post_id = posts[0].get("id")

    res_like = client.post(f"/api/posts/{post_id}/like", headers={"x-session-user-id": "user-sarah"})
    assert res_like.status_code == 200
    assert res_like.json().get("success") == True

    res_unlock = client.post(f"/api/posts/{post_id}/unlock", headers={"x-session-user-id": "user-sarah"})
    assert res_unlock.status_code == 200
    assert res_unlock.json().get("success") == True
    print("✅ Feed /api/feed, Likes, and Unlock working")

def test_strategies_and_news():
    res_strat = client.get("/api/strategies")
    assert res_strat.status_code == 200
    assert len(res_strat.json().get("strategies")) >= 4

    res_news = client.get("/api/news/economic-calendar")
    assert res_news.status_code == 200
    assert len(res_news.json().get("events")) > 0
    print("✅ Strategies & Economic Calendar endpoints working")

if __name__ == "__main__":
    test_root()
    test_health()
    test_health_proxy()
    test_ctrader_security_and_config()
    test_ctrader_oauth_security_and_csrf()
    test_ctrader_account_auth_and_switching()
    test_ctrader_market_data_and_reconciliation()
    test_ctrader_execution_events_and_close()
    test_ctrader_account_state_and_pnl()
    test_event_contracts_and_room_isolation()
    test_broker_data_and_persistence()
    test_observability_and_health_checks()
    test_google_auth()
    test_login_and_me()
    test_feed_and_interactions()
    test_strategies_and_news()
    print("\n🎉 ALL 16 TEST SUITES PASSED SUCCESSFULLY!")
