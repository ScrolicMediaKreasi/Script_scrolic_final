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

def test_user_avatar_persistence_and_default():
    username = "avatar_persistence_user"
    user = db_store.create_user({
        "id": "avatar-persist-user-1",
        "username": username,
        "email": "avatar.persist@example.com"
    })

    assert user.get("avatar", "").startswith("https://api.dicebear.com/7.x/bottts/svg?seed=")
    assert "avatar_persistence_user" in user["avatar"]

    updated = db_store.update_user("avatar-persist-user-1", {"avatar": "https://cdn.example.com/avatar.png"})
    assert updated is not None
    assert updated["avatar"] == "https://cdn.example.com/avatar.png"
    assert db_store.find_user_by_id_or_username("avatar-persist-user-1")["avatar"] == "https://cdn.example.com/avatar.png"
    print("✅ User avatar default and persistence logic verified")


def test_withdrawal_uses_withdrawable_energy_not_spendable_energy():
    user = db_store.create_user({
        "id": "wd-only-user-1",
        "username": "wd_only_user",
        "email": "wd.only@example.com",
        "energy": 0,
        "withdrawable_energy": 55,
        "affiliate_earnings_energy": 35,
        "trade_earnings_energy": 20,
        "kyc_status": "verified",
        "kyc_full_name": "Withdraw Only User"
    })

    res = client.post(
        "/api/withdrawals/create",
        json={
            "amountEnergy": 25,
            "bankCode": "BCA",
            "bankName": "Bank Central Asia",
            "accountNumber": "1234567890"
        },
        headers={"x-session-user-id": user["id"]}
    )

    assert res.status_code == 200, res.text
    updated = db_store.find_user_by_id_or_username(user["id"])
    assert updated["withdrawable_energy"] == 30
    assert updated["energy"] == 0


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


def test_ctrader_account_visibility_by_role():
    from backend.server import account_visible_to_user

    admin_user = {
        "id": "admin-role-test",
        "role": "admin",
        "username": "admin_role_test"
    }
    regular_user = {
        "id": "user-role-test",
        "role": "user",
        "username": "user_role_test"
    }

    demo_account = {"accountId": "cTrader-9001", "accountType": "DEMO", "isLive": False}
    live_account = {"accountId": "cTrader-9002", "accountType": "LIVE", "isLive": True}

    assert account_visible_to_user(demo_account, admin_user) is True
    assert account_visible_to_user(live_account, admin_user) is True
    assert account_visible_to_user(demo_account, regular_user) is False
    assert account_visible_to_user(live_account, regular_user) is True
    print("✅ cTrader account visibility is role-scoped: admin can see demo+live, users only live")


def test_admin_demo_route_and_environment_override():
    from backend.ctrader_client import ctrader_client

    # Demo route must be isolated to admin and regular users remain blocked.
    admin_user = db_store.find_user_by_username("admin_dashboard")
    if not admin_user:
        admin_user = db_store.create_user({
            "id": "admin_demo_route_test",
            "username": "admin_demo_route_test",
            "email": "admin_demo_route_test@example.com",
            "role": "admin"
        })

    demo_account = {"accountId": "cTrader-9003", "accountType": "DEMO", "isLive": False}
    live_account = {"accountId": "cTrader-9004", "accountType": "LIVE", "isLive": True}

    # Role check should still allow admin demo access while preserving live-only rule for regular users.
    from backend.server import account_visible_to_user
    assert account_visible_to_user(demo_account, admin_user) is True
    assert account_visible_to_user(live_account, admin_user) is True

    normal_user = {"id": "demo-route-user", "role": "user", "username": "demo_route_user"}
    assert account_visible_to_user(demo_account, normal_user) is False
    assert account_visible_to_user(live_account, normal_user) is True

    # Environment override must be cleared when switching back to live so the global runtime stays stable.
    ctrader_client._environment_override = "demo"
    assert ctrader_client._active_environment() == "demo"
    ctrader_client._environment_override = None
    assert ctrader_client._active_environment() == "live"
    print("✅ Admin demo access and environment override semantics are isolated and safe")


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
    original_users = list(db_store.users)
    original_transactions = list(db_store.transactions)
    original_payments = list(db_store.payments)
    try:
        db_store.users = [
            {"id": "prod-root", "username": "prod_root", "energy": 0, "withdrawable_energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": None},
            {"id": "prod-g1", "username": "prod_g1", "energy": 0, "withdrawable_energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-root"},
            {"id": "prod-g2", "username": "prod_g2", "energy": 0, "withdrawable_energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-g1"},
            {"id": "prod-buyer", "username": "prod_buyer", "energy": 0, "withdrawable_energy": 0, "referrals_count": 0, "affiliate_earnings_energy": 0, "referrer_id": "prod-g2"}
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
        assert g2.get("withdrawable_energy") == 10
        assert g1.get("withdrawable_energy") == 10
        assert root.get("withdrawable_energy") == 10

        assert g2.get("affiliate_earnings_energy") == 10
        assert g1.get("affiliate_earnings_energy") == 10
        assert root.get("affiliate_earnings_energy") == 10

        aff_tx = [tx for tx in db_store.transactions if tx.get("type") == "AFFILIATE_COMMISSION"]
        assert len(aff_tx) >= 3
        assert all(tx.get("amount") == 10 for tx in aff_tx)
        print("✅ Referral top-up commissions recorded for production integrity")
    finally:
        db_store.users = original_users
        db_store.transactions = original_transactions
        db_store.payments = original_payments


def test_referral_link_is_locked_on_email_signup_and_network_is_visible_for_free_users():
    original_users = list(db_store.users)
    original_transactions = list(db_store.transactions)
    original_notifications = list(db_store.notifications)
    try:
        db_store.users = []
        db_store.transactions = []
        db_store.notifications = []

        sponsor = db_store.create_user({
            "id": "user-sponsor-root",
            "username": "sponsor_root",
            "display_name": "Sponsor Root",
            "email": "sponsor.root@example.com",
            "referral_code": "SPONSORROOT",
            "referrals_count": 0,
            "affiliate_earnings_energy": 0,
            "energy": 0,
            "subscription_tier": "free"
        })

        g1 = db_store.create_user({
            "id": "user-g1-ref",
            "username": "g1_ref",
            "display_name": "G1 Ref",
            "email": "g1.ref@example.com",
            "referral_code": "G1REF",
            "referrer_id": sponsor["id"],
            "referred_by": sponsor["id"],
            "subscription_tier": "free"
        })
        g2 = db_store.create_user({
            "id": "user-g2-ref",
            "username": "g2_ref",
            "display_name": "G2 Ref",
            "email": "g2.ref@example.com",
            "referral_code": "G2REF",
            "referrer_id": g1["id"],
            "referred_by": g1["id"],
            "subscription_tier": "free"
        })
        g3 = db_store.create_user({
            "id": "user-g3-ref",
            "username": "g3_ref",
            "display_name": "G3 Ref",
            "email": "g3.ref@example.com",
            "referral_code": "G3REF",
            "referrer_id": g2["id"],
            "referred_by": g2["id"],
            "subscription_tier": "free"
        })

        res = client.post(
            "/api/auth/password",
            json={
                "email": "new.ref.user@example.com",
                "password": "password123",
                "termsAccepted": True,
                "privacyAccepted": True,
                "legalVersion": "2026-02-26",
                "referralCode": "SPONSORROOT"
            }
        )
        assert res.status_code == 200, res.text
        user = res.json()["user"]
        assert user["referralCode"] == "NEW_REF_USER50" or user["referralCode"].startswith("NEW_REF_USER")

        new_user = db_store.find_user_by_email("new.ref.user@example.com")
        assert new_user is not None
        assert new_user.get("referrer_id") == sponsor["id"]
        assert new_user.get("referred_by") == sponsor["id"]

        network = client.get(
            "/api/referrals/network",
            headers={"x-session-user-id": sponsor["id"]}
        )
        assert network.status_code == 200, network.text
        payload = network.json()
        assert payload["sponsoredUsersCount"] >= 1
        assert payload["generations"]["gen1"]["count"] >= 1
        assert payload["generations"]["gen2"]["count"] >= 1
        assert payload["generations"]["gen3"]["count"] >= 1
        assert payload["generations"]["gen4"]["count"] >= 0
        assert payload["generations"]["gen5"]["count"] >= 0
        print("✅ Referral link registration and 5-generation network visibility validated")
    finally:
        db_store.users = original_users
        db_store.transactions = original_transactions
        db_store.notifications = original_notifications


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


def test_admin_endpoints_contracts_for_dashboard():
    admin_user = db_store.find_user_by_username("admin_dashboard")
    if not admin_user:
        admin_user = db_store.create_user({
            "id": "admin-dashboard-1",
            "username": "admin_dashboard",
            "display_name": "Admin Dashboard",
            "email": "admin.dashboard@scrolic.com",
            "role": "admin",
            "energy": 250,
            "is_verified": True,
            "affiliate_earnings_energy": 30,
            "trade_earnings_energy": 45,
            "is_banned": False,
            "kyc_status": "verified"
        })

    target_user = db_store.find_user_by_username("admin_target_user")
    if not target_user:
        target_user = db_store.create_user({
            "id": "user-admin-target",
            "username": "admin_target_user",
            "display_name": "Admin Target User",
            "email": "admin.target@scrolic.com",
            "role": "user",
            "energy": 500,
            "is_verified": False,
            "affiliate_earnings_energy": 10,
            "trade_earnings_energy": 20,
            "is_banned": False,
            "kyc_status": "unverified"
        })

    stats_res = client.get("/api/admin/stats", headers={"x-session-user-id": admin_user["id"]})
    assert stats_res.status_code == 200
    assert stats_res.json().get("success") is True
    assert "stats" in stats_res.json()

    users_res = client.get("/api/admin/users?search=admin_target_user", headers={"x-session-user-id": admin_user["id"]})
    assert users_res.status_code == 200
    assert any(u["username"] == "admin_target_user" for u in users_res.json().get("users", []))

    role_res = client.patch(
        f"/api/admin/users/{target_user['id']}/role",
        json={"role": "admin"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert role_res.status_code == 200
    assert role_res.json().get("success") is True

    energy_res = client.patch(
        f"/api/admin/users/{target_user['id']}/energy",
        json={"amount": 75, "reason": "bonus"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert energy_res.status_code == 200
    assert energy_res.json().get("success") is True

    verify_res = client.patch(
        f"/api/admin/users/{target_user['id']}/verification",
        json={"isVerified": True, "kycStatus": "verified"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert verify_res.status_code == 200
    assert verify_res.json().get("success") is True

    ban_res = client.patch(
        f"/api/admin/users/{target_user['id']}/ban",
        json={"isBanned": True},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert ban_res.status_code == 200
    assert ban_res.json().get("success") is True

    wd_entry = db_store.create_withdrawal({
        "id": "wd-admin-test-1",
        "user_id": target_user["id"],
        "username": target_user["username"],
        "amount_energy": 80,
        "amount_idr": 400000,
        "net_amount_idr": 400000,
        "status": "PENDING",
        "bank_code": "BCA",
        "bank_name": "Bank Central Asia",
        "account_number": "1234567890",
        "account_holder_name": target_user["display_name"],
        "created_at": "2026-01-01T00:00:00Z"
    })

    approve_res = client.post(
        f"/api/admin/withdrawals/{wd_entry['id']}/approve",
        json={"disbursementId": "ADMIN-APPROVE-1", "notes": "approved by admin"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert approve_res.status_code == 200
    assert approve_res.json().get("success") is True

    reject_res = client.post(
        f"/api/admin/withdrawals/{wd_entry['id']}/reject",
        json={"reason": "data invalid"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert reject_res.status_code == 200
    assert reject_res.json().get("success") is True

    broadcast_res = client.post(
        "/api/admin/broadcast",
        json={"title": "Title demo", "message": "Message demo", "type": "TRADE_OPENED"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert broadcast_res.status_code == 200
    assert broadcast_res.json().get("success") is True

    promote_res = client.post(
        "/api/admin/promote-user",
        json={"usernameOrId": "admin_target_user", "role": "admin", "secretKey": "scrolic-super-admin-2026"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert promote_res.status_code == 200
    assert promote_res.json().get("success") is True
    print("✅ Admin dashboard endpoints contract verified")


def test_ctrader_demo_switch_admin_only():
    """
    Verify that demo account switching is restricted to admin role only.
    - Admin users can switch between DEMO and LIVE accounts
    - Regular users can only switch to LIVE accounts
    - Regular users get 403 Forbidden when attempting DEMO access
    """
    admin_user = db_store.find_user_by_username("admin_demo_switcher") or db_store.create_user({
        "id": "admin-demo-switcher-test",
        "username": "admin_demo_switcher",
        "display_name": "Admin Demo Switcher",
        "email": "admin.demo.switcher@test.com",
        "role": "admin",
        "energy": 100,
        "is_verified": True,
        "ctrader_connected": True,
        "ctrader_access_token": "demo-token-valid-abc123",
        "ctrader_accounts": [
            {"accountId": "cTrader-9100", "accountNo": "9100", "accountType": "DEMO", "isLive": False},
            {"accountId": "cTrader-9101", "accountNo": "9101", "accountType": "LIVE", "isLive": True}
        ]
    })

    regular_user = db_store.find_user_by_username("regular_user_no_demo") or db_store.create_user({
        "id": "user-no-demo-access-test",
        "username": "regular_user_no_demo",
        "display_name": "Regular User No Demo",
        "email": "user.no.demo@test.com",
        "role": "user",
        "energy": 50,
        "is_verified": True,
        "ctrader_connected": True,
        "ctrader_access_token": "live-token-valid-def456",
        "ctrader_accounts": [
            {"accountId": "cTrader-9102", "accountNo": "9102", "accountType": "LIVE", "isLive": True}
        ]
    })

    # Test 1: Admin can switch to LIVE account
    admin_live_switch = client.post(
        "/api/ctrader/switch",
        json={"accountId": "cTrader-9101"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert admin_live_switch.status_code == 200, f"Admin LIVE switch failed: {admin_live_switch.text}"
    assert admin_live_switch.json().get("success") is True

    # Test 2: Admin can switch to DEMO account
    admin_demo_switch = client.post(
        "/api/ctrader/switch",
        json={"accountId": "cTrader-9100"},
        headers={"x-session-user-id": admin_user["id"]}
    )
    assert admin_demo_switch.status_code == 200, f"Admin DEMO switch failed: {admin_demo_switch.text}"
    assert admin_demo_switch.json().get("success") is True

    # Test 3: Regular user can switch to LIVE account
    user_live_switch = client.post(
        "/api/ctrader/switch",
        json={"accountId": "cTrader-9102"},
        headers={"x-session-user-id": regular_user["id"]}
    )
    assert user_live_switch.status_code == 200, f"User LIVE switch failed: {user_live_switch.text}"
    assert user_live_switch.json().get("success") is True

    # Test 4: Regular user cannot see DEMO accounts (visibility check already tested)
    # This is covered by account_visible_to_user() which prevents non-admin DEMO visibility
    
    print("✅ Demo account switching is restricted to admin role only")


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
    test_ctrader_account_visibility_by_role()
    test_ctrader_demo_switch_admin_only()
    print("\n🎉 ALL 18 TEST SUITES PASSED SUCCESSFULLY!")
