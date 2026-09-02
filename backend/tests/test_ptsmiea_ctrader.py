"""
Verification tests for the @ptsmiea cTrader data-accuracy fixes:
  - performance aggregates (191 trades, 94W/97L, -1117.30 realized, etc.)
  - feed CLOSED posts pip/profit magnitude sanity (pipPosition overwrite bug)
  - health & ctrader config endpoints
"""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
HEADERS = {"x-session-user-id": "user-ptsmiea", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


@pytest.fixture(scope="session")
def feed_posts(client):
    posts, cursor = [], None
    for _ in range(15):
        url = f"{BASE_URL}/api/feed?limit=50" + (f"&cursor={cursor}" if cursor else "")
        r = client.get(url, timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        posts.extend(data.get("posts") or [])
        cursor = data.get("next_cursor")
        if not data.get("has_more"):
            break
    return posts


# --- Infra endpoints ---
class TestInfra:
    def test_health(self, client):
        r = client.get(f"{BASE_URL}/api/health", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "connected" in d["database"]
        assert d["mayar_configured"] is True

    def test_ctrader_config(self, client):
        r = client.get(f"{BASE_URL}/api/ctrader/config", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["isConfigured"] is True
        assert d["redirectUri"].startswith(BASE_URL)


# --- Performance aggregates ---
class TestPerformance:
    @pytest.fixture(scope="class")
    def perf(self, client):
        r = client.get(f"{BASE_URL}/api/users/ptsmiea/performance?period=all", timeout=60)
        assert r.status_code == 200, r.text[:300]
        return r.json()["performance"]

    def test_summary_matches_broker(self, perf):
        s = perf["summary"]
        assert s["totalTrades"] == 191
        assert s["winningTrades"] == 94
        assert s["losingTrades"] == 97
        assert s["winRate"] == pytest.approx(49.2, abs=0.1)
        assert s["realizedPnL"] == pytest.approx(-1117.30, abs=1.0)
        assert s["largestLoss"] == pytest.approx(-789.46, abs=1.0)
        assert s["largestWin"] == pytest.approx(496.68, abs=1.0)

    def test_risk_and_availability(self, perf):
        assert perf["risk"]["maxDrawdown"] == pytest.approx(1844.34, abs=1.0)
        da = perf["dataAvailability"]
        assert da["hasRealData"] is True
        assert da["closedTrades"] == 191


# --- Feed CLOSED trade numbers ---
class TestFeedNumbers:
    def test_all_posts_returned(self, feed_posts):
        assert len(feed_posts) == 191

    def test_prices_and_symbols_valid(self, feed_posts):
        for p in feed_posts:
            t = p["trade"]
            assert t["symbol"] in {"XAUUSD", "BTCUSD"}
            assert t["entryPrice"] > 0 and t["currentPrice"] > 0
            if t["symbol"] == "XAUUSD":
                assert 3000 < t["entryPrice"] < 6000, t
                assert 3000 < t["currentPrice"] < 6000, t

    def test_pips_derived_from_price_diff(self, feed_posts):
        """pips must equal price-diff / pip-size (pipPosition=1 for gold, 0 for BTC)."""
        bad = []
        for p in feed_posts:
            t = p["trade"]
            diff = (t["currentPrice"] - t["entryPrice"]) if t["direction"] == "BUY" else (t["entryPrice"] - t["currentPrice"])
            pip_size = 0.1 if t["symbol"] == "XAUUSD" else 1.0
            expected = round(diff / pip_size, 1)
            if abs(expected - t["pips"]) > 1.0:
                bad.append((t["symbol"], t["entryPrice"], t["currentPrice"], t["pips"], expected))
        assert not bad, f"pips mismatch (pipPosition regression?): {bad[:5]}"

    def test_no_1000x_pip_inflation(self, feed_posts):
        """Regression guard: pips must not be ~1000x the actual price move."""
        inflated = []
        for p in feed_posts:
            t = p["trade"]
            move = abs(t["currentPrice"] - t["entryPrice"])
            if move > 0 and abs(t["pips"]) > move * 100:
                inflated.append((t["symbol"], move, t["pips"]))
        assert not inflated, f"pips inflated vs price move: {inflated[:5]}"

    def test_profit_sum_matches_performance(self, feed_posts, client):
        total = round(sum(p["trade"]["profitUSD"] for p in feed_posts), 2)
        assert total == pytest.approx(-1117.30, abs=1.0)
        total_pips = round(sum(p["trade"]["pips"] for p in feed_posts), 1)
        assert total_pips == pytest.approx(-3818.1, abs=1.0)

    def test_profit_nonzero_from_close_detail(self, feed_posts):
        """deal.grossProfit bug: profit would be 0 for every post if read from wrong field."""
        nonzero = [p for p in feed_posts if abs(p["trade"]["profitUSD"]) > 0]
        assert len(nonzero) > 180

    def test_profit_percent_bounded(self, feed_posts):
        outliers = [
            (p["trade"]["symbol"], p["trade"]["profitPercent"], p["trade"]["volumeLot"])
            for p in feed_posts if abs(p["trade"]["profitPercent"]) > 25
        ]
        assert not outliers, f"profitPercent outliers: {outliers[:5]}"

    def test_profit_consistent_with_lot_and_pips(self, feed_posts):
        """XAUUSD: 0.01 lot = 1 oz -> |profit| ~= |price move| * 100 * lot (±25% for fees/swap)."""
        bad = []
        for p in feed_posts:
            t = p["trade"]
            if t["symbol"] != "XAUUSD":
                continue
            move = (t["currentPrice"] - t["entryPrice"]) if t["direction"] == "BUY" else (t["entryPrice"] - t["currentPrice"])
            expected = move * 100 * t["volumeLot"]
            if abs(expected) > 1 and abs(abs(t["profitUSD"]) - abs(expected)) > max(2.0, abs(expected) * 0.3):
                bad.append((t["volumeLot"], round(move, 2), t["profitUSD"], round(expected, 2)))
        assert not bad, f"profit vs (lot x move) inconsistent: {bad[:5]}"

    def test_ptsmiea_ownership_and_status(self, feed_posts):
        assert all(p["userId"] == "user-ptsmiea" for p in feed_posts)
        assert all(p["trade"]["status"] == "CLOSED" for p in feed_posts)


# --- Session / broker connection state ---
class TestSessionState:
    def test_user_me_reports_ctrader_connection(self, client):
        r = client.get(f"{BASE_URL}/api/user/me", timeout=30)
        assert r.status_code == 200
        u = r.json().get("user", r.json())
        assert u["id"] == "user-ptsmiea"
        assert u["totalTrades"] == 191
        # Expected per /app/memory/test_credentials.md: connected with 2 LIVE accounts
        assert u["cTraderConnected"] is True, "broker session not persisted (token/accounts empty)"
        assert len(u["cTraderAccounts"]) >= 1
