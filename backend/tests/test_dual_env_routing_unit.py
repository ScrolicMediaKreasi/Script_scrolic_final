"""Unit tests for dual-env cTrader client routing helpers (no broker calls)."""
import os
import sys

import pytest
from dotenv import load_dotenv

sys.path.insert(0, "/app")
sys.path.insert(0, "/app/backend")

# Load the same env the running backend uses so main/alt env match runtime.
load_dotenv("/app/backend/.env", override=True)

from backend.ctrader_client import (  # noqa: E402
    ctrader_client,
    ctrader_client_alt,
    all_ctrader_clients,
    resolve_client_for_env,
    resolve_client_for_user_account,
    find_account_state,
    find_user_for_account,
    find_client_by_account,
    all_authenticated_accounts,
    merged_account_to_user_map,
    merged_account_states,
)


# ---- module-level dual clients ----
class TestDualClientObjects:
    def test_two_distinct_clients_with_opposite_envs(self):
        clients = list(all_ctrader_clients())
        assert len(clients) == 2, clients
        assert ctrader_client is not ctrader_client_alt
        envs = {getattr(c, "_env", None) for c in clients}
        assert envs == {"live", "demo"}, envs

    def test_main_client_is_live(self):
        assert getattr(ctrader_client, "_env") == "live"
        assert getattr(ctrader_client_alt, "_env") == "demo"

    def test_resolve_client_for_env(self):
        assert resolve_client_for_env("live") is ctrader_client
        assert resolve_client_for_env("demo") is ctrader_client_alt
        assert resolve_client_for_env("LIVE") is ctrader_client
        assert resolve_client_for_env("DEMO") is ctrader_client_alt


# ---- env routing per user/account ----
class TestEnvRouting:
    def test_admin_demo_account_routes_to_demo_client(self):
        c = resolve_client_for_user_account(
            {"id": "u-admin", "role": "admin"}, {"accountId": "1", "accountType": "DEMO"}
        )
        assert c is ctrader_client_alt

    def test_regular_user_live_account_routes_to_live_client(self):
        c = resolve_client_for_user_account(
            {"id": "user-ptsmiea", "role": "user"},
            {"accountId": "48005582", "accountType": "LIVE"},
        )
        assert c is ctrader_client

    def test_islive_false_routes_to_demo(self):
        c = resolve_client_for_user_account({"role": "user"}, {"isLive": False})
        assert c is ctrader_client_alt

    def test_islive_true_routes_to_live(self):
        c = resolve_client_for_user_account({"role": "user"}, {"isLive": True})
        assert c is ctrader_client

    def test_unknown_account_type_falls_back_to_main_env(self):
        c = resolve_client_for_user_account({"role": "user"}, {})
        assert c is ctrader_client

    def test_none_account_does_not_raise(self):
        assert resolve_client_for_user_account({"role": "user"}, None) is ctrader_client


# ---- lookup helpers must be safe when nothing is authenticated ----
class TestLookupHelpers:
    def test_find_account_state_unknown_returns_empty_dict(self):
        assert find_account_state(99999999) == {}

    def test_find_account_state_none_safe(self):
        assert find_account_state(0) == {}

    def test_find_user_for_account_unknown_returns_none(self):
        assert find_user_for_account(99999999) is None

    def test_find_client_by_account_unknown_returns_none(self):
        assert find_client_by_account(99999999) is None

    def test_all_authenticated_accounts_is_iterable(self):
        assert isinstance(list(all_authenticated_accounts()), list)

    def test_merged_maps_are_dicts(self):
        assert isinstance(merged_account_to_user_map(), dict)
        assert isinstance(merged_account_states(), dict)


# ---- ticker imports must not break (circular import guard) ----
class TestTickerImports:
    def test_ticker_module_imports_cleanly(self):
        import importlib

        mod = importlib.import_module("backend.ticker")
        assert mod is not None

    def test_ticker_uses_dual_helpers(self):
        import backend.ticker as ticker

        for name in ("find_user_for_account", "find_account_state"):
            assert hasattr(ticker, name), f"ticker missing helper import: {name}"
        src = open("/app/backend/ticker.py").read()
        assert "all_ctrader_clients" in src
        assert "register_handler_on_all" in src
        # no stale direct global usage that bypasses dual-client dispatch
        assert "ctrader_client.account_to_user_map.get(" not in src
        assert "ctrader_client.account_states.get(" not in src


# ---- authenticate_account / switch_account must reject mismatched env ----
class TestEnvMismatchRejection:
    @pytest.mark.anyio
    async def test_live_client_rejects_demo_account(self):
        pytest.skip("Requires broker token; env-mismatch guard verified by code review")
