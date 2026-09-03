"""Iteration 5 regression tests: production socket.io path fix + baseline no-regression checks."""
import os
import re
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    return s


# ---------------- Module: socket.io engine.io handshake over ingress ----------------
class TestSocketIOPath:
    def test_api_socketio_handshake_200(self, client):
        r = client.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling&t={int(time.time())}", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.text.startswith("0{"), f"unexpected handshake body: {r.text[:200]}"
        assert '"sid"' in r.text
        sid = re.search(r'"sid":"([^"]+)"', r.text)
        assert sid and len(sid.group(1)) > 5

    def test_root_socketio_path_404(self, client):
        r = client.get(f"{BASE_URL}/socket.io/?EIO=4&transport=polling&t={int(time.time())}", timeout=20)
        assert r.status_code == 404, f"root /socket.io should not be routed, got {r.status_code}"

    def test_polling_session_full_cycle(self, client):
        """Handshake -> namespace connect POST -> GET receives connect ack (40) over polling only."""
        hs = client.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling&t={int(time.time())}", timeout=20)
        assert hs.status_code == 200
        sid = re.search(r'"sid":"([^"]+)"', hs.text).group(1)

        post = client.post(
            f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling&sid={sid}",
            data='40{"userId":"user-ptsmiea"}',
            headers={"Content-Type": "text/plain;charset=UTF-8"},
            timeout=20,
        )
        assert post.status_code == 200, post.text[:300]

        got = client.get(f"{BASE_URL}/api/socket.io/?EIO=4&transport=polling&sid={sid}", timeout=30)
        assert got.status_code == 200
        assert got.text.startswith("40"), f"expected namespace connect ack, got {got.text[:200]}"
        assert '"sid"' in got.text


# ---------------- Module: baseline regressions ----------------
class TestBaselineRegressions:
    def test_health(self, client):
        r = client.get(f"{BASE_URL}/api/health", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert "connected" in str(d.get("database", "")).lower()
        assert d.get("mayar_configured") is True

    def test_closed_trades_aggregate(self, client):
        r = client.get(f"{BASE_URL}/api/users/ptsmiea/closed-trades?page=1&size=20", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["pagination"]["total"] == 191, d["pagination"]
        assert abs(d["aggregate"]["winRate"] - 49.2) < 0.6, d["aggregate"]
        assert abs(d["aggregate"]["totalProfitUSD"] - (-1117.30)) < 5.0, d["aggregate"]
        assert len(d["trades"]) == 20
        assert all("_id" not in t for t in d["trades"])

    def test_dual_env_authenticated(self, client):
        r = client.get(f"{BASE_URL}/api/ctrader/connection/status", timeout=30)
        assert r.status_code == 200
        envs = r.json()["environments"]
        assert envs["live"]["state"] == "AUTHENTICATED", envs
        assert envs["demo"]["state"] == "AUTHENTICATED", envs

    def test_feed_returns_posts(self, client):
        r = client.get(f"{BASE_URL}/api/feed", timeout=30)
        assert r.status_code == 200
        d = r.json()
        posts = d.get("posts") if isinstance(d, dict) else d
        assert isinstance(posts, list) and len(posts) > 0
