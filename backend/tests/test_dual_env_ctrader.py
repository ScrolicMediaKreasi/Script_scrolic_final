"""Iteration 4: Dual-environment cTrader client verification + @ptsmiea regression tests."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")

SESSION_USER = "user-ptsmiea"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "x-session-user-id": SESSION_USER,
    })
    return s


# ---------------- Health (regression) ----------------
class TestHealth:
    def test_health(self, client):
        r = client.get(f"{BASE_URL}/api/health", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert str(d.get("database", "")).startswith("connected"), d
        assert d.get("mayar_configured") is True, d


# ---------------- Dual-env connection status ----------------
class TestDualEnvStatus:
    def test_connection_status_both_environments_authenticated(self, client):
        r = client.get(f"{BASE_URL}/api/ctrader/connection/status", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        envs = d.get("environments")
        assert isinstance(envs, dict), f"missing environments key: {list(d.keys())}"
        assert "live" in envs and "demo" in envs, envs
        assert envs["live"].get("state") == "AUTHENTICATED", envs["live"]
        assert envs["demo"].get("state") == "AUTHENTICATED", envs["demo"]

    def test_diagnostics_exposes_both_hosts(self, client):
        r = client.get(f"{BASE_URL}/api/ctrader/diagnostics", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        diag = d.get("diagnostics") or {}
        alt = d.get("diagnosticsAlt") or {}
        assert diag.get("host") == "live.ctraderapi.com", diag
        assert alt.get("host") == "demo.ctraderapi.com", alt

    def test_diagnostics_both_streams_connected(self, client):
        r = client.get(f"{BASE_URL}/api/ctrader/diagnostics", timeout=60)
        assert r.status_code == 200
        d = r.json()
        for key in ("diagnostics", "diagnosticsAlt"):
            blk = d.get(key) or {}
            state = blk.get("state") or blk.get("lifecycleState")
            assert state == "AUTHENTICATED", f"{key} state={state} full={blk}"


# ---------------- @ptsmiea closed trades regression ----------------
class TestPtsmieaClosedTrades:
    def test_closed_trades_pagination_and_aggregate(self, client):
        r = client.get(
            f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=20", timeout=90
        )
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        pg = d.get("pagination") or {}
        assert pg.get("total") == 191, pg
        agg = d.get("aggregate") or {}
        assert abs(float(agg.get("winRate")) - 49.2) < 0.15, agg
        assert abs(float(agg.get("totalProfitUSD")) - (-1117.30)) < 1.0, agg
        assert len(d.get("trades") or d.get("items") or []) == 20, list(d.keys())

    def test_closed_trades_no_mongo_object_id(self, client):
        r = client.get(f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=5", timeout=90)
        assert r.status_code == 200
        assert "_id" not in r.text

    def test_performance_all_period(self, client):
        r = client.get(f"{BASE_URL}/api/users/ptsmiea/performance?period=all", timeout=90)
        assert r.status_code == 200, r.text[:500]
        summary = ((r.json().get("performance") or {}).get("summary")) or {}
        assert summary.get("totalTrades") == 191, summary
        assert abs(float(summary.get("realizedPnL")) - (-1117.30)) < 1.0, summary


# ---------------- Feed ----------------
class TestFeed:
    def test_feed_returns_posts_with_symbol(self, client):
        r = client.get(f"{BASE_URL}/api/feed", timeout=90)
        assert r.status_code == 200, r.text[:500]
        posts = r.json().get("posts") or []
        assert len(posts) > 0, "feed returned no posts"
        for p in posts:
            trade = p.get("trade") or {}
            assert trade.get("symbol"), p.get("id")
            assert trade.get("direction") in ("BUY", "SELL"), trade
            assert float(trade.get("entryPrice") or 0) > 0, trade

    def test_feed_trade_posts_have_nonzero_pips_or_profit(self, client):
        r = client.get(f"{BASE_URL}/api/feed", timeout=90)
        assert r.status_code == 200
        posts = r.json().get("posts") or []
        zero = []
        for p in posts:
            t = p.get("trade") or {}
            if abs(float(t.get("pips") or 0)) == 0 and abs(float(t.get("profitUSD") or 0)) == 0:
                zero.append(p.get("id"))
        assert not zero, f"{len(zero)}/{len(posts)} feed posts have zero pips AND zero profitUSD: {zero}"

    def test_feed_current_price_present(self, client):
        r = client.get(f"{BASE_URL}/api/feed", timeout=90)
        assert r.status_code == 200
        posts = r.json().get("posts") or []
        bad = [
            p.get("id") for p in posts
            if float((p.get("trade") or {}).get("currentPrice") or 0) <= 0
        ]
        assert not bad, f"posts missing currentPrice: {bad}"

    def test_feed_no_mongo_object_id(self, client):
        r = client.get(f"{BASE_URL}/api/feed", timeout=90)
        assert r.status_code == 200
        assert '"_id"' not in r.text
