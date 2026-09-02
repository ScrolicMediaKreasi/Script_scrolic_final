"""Iteration 2 tests: closed-trades pagination endpoint + performance endpoint for @ptsmiea"""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def _get(client, url, **kw):
    r = client.get(url, timeout=60, **kw)
    return r


# --- closed-trades endpoint ---
class TestClosedTrades:
    def test_page1_structure_and_aggregate(self, client):
        r = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=20")
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["success"] is True
        pg = d["pagination"]
        assert pg["total"] == 191, f"expected 191 got {pg['total']}"
        assert pg["totalPages"] == 10
        assert pg["page"] == 1 and pg["size"] == 20 and pg["hasMore"] is True
        ag = d["aggregate"]
        assert ag["totalTrades"] == 191
        assert ag["winningTrades"] == 94, ag
        assert ag["losingTrades"] == 97, ag
        assert abs(ag["winRate"] - 49.2) < 0.2, ag
        assert abs(ag["totalProfitUSD"] - (-1117.30)) < 1.0, ag
        assert abs(ag["totalPips"] - (-3818.1)) < 5.0, ag
        trades = d["trades"]
        assert len(trades) == 20, len(trades)
        for t in trades:
            assert "trade" not in t, "trades must be flat, not wrapped"
            for f in ["symbol", "direction", "entryPrice", "currentPrice",
                      "profitUSD", "pips", "volumeLot", "status"]:
                assert f in t, f"missing field {f} in {list(t.keys())}"
            assert t["status"] == "CLOSED"
            assert "postId" in t

    def test_no_mongo_id_leak(self, client):
        r = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=5")
        assert r.status_code == 200
        assert "_id" not in r.text

    def test_page2_no_overlap_with_page1(self, client):
        p1 = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=20").json()["trades"]
        p2 = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=2&size=20").json()["trades"]
        ids1 = {t["postId"] for t in p1}
        ids2 = {t["postId"] for t in p2}
        assert len(ids1) == 20 and len(ids2) == 20
        assert not (ids1 & ids2), f"overlap: {ids1 & ids2}"

    def test_last_page_has_11_items(self, client):
        r = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=10&size=20")
        assert r.status_code == 200
        d = r.json()
        assert d["pagination"]["page"] == 10
        assert d["pagination"]["hasMore"] is False
        assert len(d["trades"]) == 11, len(d["trades"])

    def test_page_beyond_range_clamped(self, client):
        d = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=99&size=20").json()
        assert d["pagination"]["page"] == 10
        assert len(d["trades"]) == 11

    def test_invalid_size_rejected(self, client):
        r = _get(client, f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=0")
        assert r.status_code == 422

    def test_unknown_user_404(self, client):
        r = _get(client, f"{BASE_URL}/api/users/nope_does_not_exist_xyz/closed-trades")
        assert r.status_code == 404


# --- performance endpoint regression ---
class TestPerformance:
    def test_performance_all(self, client):
        r = _get(client, f"{BASE_URL}/api/users/ptsmiea/performance?period=all")
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        perf = d["performance"]["summary"]
        assert abs(float(perf["realizedPnL"]) - (-1117.30)) < 1.0, perf
        assert int(perf["totalTrades"]) == 191, perf
        assert abs(float(perf["winRate"]) - 49.2) < 0.2, perf


# --- feed sanity (used by frontend landing) ---
class TestFeed:
    def test_feed_ok(self, client):
        r = _get(client, f"{BASE_URL}/api/feed")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("success") is True
        assert isinstance(d.get("posts"), list)
