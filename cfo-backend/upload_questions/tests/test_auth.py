"""Smoke test for dev login (no real Supabase calls)."""

import os
from unittest.mock import patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-service-role-key")
os.environ.setdefault("JWT_SECRET", "pytest-secret")


@pytest.fixture
def client():
    from app.core.config import get_settings

    get_settings.cache_clear()
    with patch("app.main._log_schema_hints", lambda: None):
        from app.main import app
        from fastapi.testclient import TestClient

        with TestClient(app) as c:
            yield c


def test_login_success(client):
    r = client.post("/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("token_type") == "bearer"
    assert "access_token" in data


def test_login_rejects_bad_password(client):
    r = client.post("/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401
