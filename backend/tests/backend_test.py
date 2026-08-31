"""Backend regression tests for Scrolic (duitscroll).

Covers: health/feed, config endpoints (energy packages, cTrader, Mayar),
email+password auth (register/login/wrong-password/validation),
password reset request, and the Tanya AI LLM endpoint (OpenAI gpt-5.4).
"""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from env and /app/frontend/.env")
BASE_URL = base_url.rstrip("/")

TS = int(time.time())
TEST_EMAIL = f"test_qa_{TS}@scrolic.com"
TEST_PASSWORD = "Passw0rd!Scrolic"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Health & feed ----------------
class TestHealthAndConfig:
    def test_feed(self, api):
        r = api.get(f"{BASE_URL}/api/feed?limit=1", timeout=30)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert isinstance(data, (list, dict))
        if isinstance(data, dict):
            assert "posts" in data or "items" in data or "data" in data

    def test_energy_packages(self, api):
        r = api.get(f"{BASE_URL}/api/config/energy-packages", timeout=30)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data, "energy packages empty"

    def test_ctrader_config(self, api):
        r = api.get(f"{BASE_URL}/api/ctrader/config", timeout=30)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data.get("isConfigured") is True, data

    def test_mayar_config(self, api):
        r = api.get(f"{BASE_URL}/api/payments/mayar/config", timeout=30)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data.get("isConfigured") is True, data


# ---------------- Email + Password auth (AuthModal flow) ----------------
class TestPasswordAuth:
    def test_register_new_account(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "termsAccepted": True,
            "privacyAccepted": True,
            "legalVersion": "2026-02-26",
        }, timeout=60)
        assert r.status_code == 200, r.text[:600]
        data = r.json()
        assert data.get("success") is True, data
        user = data.get("user")
        assert user, "no user in response"
        assert user.get("email") == TEST_EMAIL
        assert user.get("id")
        assert "_id" not in user, "MongoDB _id leaked in response"
        assert "password_hash" not in user, "password_hash leaked in response"

    def test_login_existing_account(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "termsAccepted": True,
            "privacyAccepted": True,
        }, timeout=60)
        assert r.status_code == 200, r.text[:600]
        data = r.json()
        assert data["user"]["email"] == TEST_EMAIL

    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": TEST_EMAIL,
            "password": "WrongPassword123",
            "termsAccepted": True,
            "privacyAccepted": True,
        }, timeout=60)
        assert r.status_code == 400, r.text[:400]
        assert r.json().get("success") is False

    def test_short_password_rejected(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": f"short_{TS}@scrolic.com",
            "password": "short",
            "termsAccepted": True,
            "privacyAccepted": True,
        }, timeout=30)
        assert r.status_code == 400, r.text[:400]
        assert "8" in r.json().get("error", {}).get("message", "")

    def test_invalid_email_rejected(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": "not-an-email",
            "password": TEST_PASSWORD,
            "termsAccepted": True,
            "privacyAccepted": True,
        }, timeout=30)
        assert r.status_code == 400, r.text[:400]

    def test_register_without_consent_rejected(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password", json={
            "email": f"noconsent_{TS}@scrolic.com",
            "password": TEST_PASSWORD,
            "termsAccepted": False,
            "privacyAccepted": False,
        }, timeout=30)
        assert r.status_code == 400, r.text[:400]

    def test_password_reset_request(self, api):
        r = api.post(f"{BASE_URL}/api/auth/password-reset/request",
                     json={"email": TEST_EMAIL}, timeout=60)
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("success") is True

    def test_user_persisted_via_login_endpoint(self, api):
        username = TEST_EMAIL.split("@")[0]
        r = api.post(f"{BASE_URL}/api/auth/login", json={"username": username}, timeout=30)
        assert r.status_code == 200, r.text[:400]
        assert r.json()["user"]["email"] == TEST_EMAIL


# ---------------- Tanya AI (LLM) ----------------
class TestLLM:
    def test_economic_event_answer(self, api):
        r = api.post(f"{BASE_URL}/api/_llm/economic-event", json={
            "session_id": f"qa-{TS}",
            "eventTitle": "US Non-Farm Payrolls",
            "currency": "USD",
            "impact": "high",
            "question": "Apa dampaknya ke EURUSD?",
        }, timeout=180)
        assert r.status_code == 200, r.text[:600]
        data = r.json()
        answer = data.get("answer")
        assert isinstance(answer, str) and len(answer) > 30, data
        assert "*" not in answer
