"""Auth / JWT claim extraction (plan §7). Regression guard for the request-auth gate that
sits in front of every user-data endpoint. No network: the HS256 path is exercised with a
local shared secret; the JWKS path isn't hit.
"""

import jwt
import pytest
from fastapi import HTTPException

import app.core.auth as auth

_SECRET = "test-secret-key-at-least-32-bytes-long-000"


@pytest.fixture
def hs256(monkeypatch):
    """Force the local HS256 verification path — null the JWKS client (built at import from
    the real URL) so verify_jwt falls through to the shared-secret branch; no network."""
    monkeypatch.setattr(auth, "_jwks_client", None)
    monkeypatch.setattr(auth._settings, "auth_dev_bypass", False)
    monkeypatch.setattr(auth._settings, "supabase_jwt_secret", _SECRET)
    monkeypatch.setattr(auth._settings, "supabase_jwt_aud", "authenticated")
    return _SECRET


def test_missing_header_is_401():
    with pytest.raises(HTTPException) as e:
        auth.get_claims(authorization=None)
    assert e.value.status_code == 401


def test_non_bearer_scheme_is_401():
    with pytest.raises(HTTPException) as e:
        auth.get_claims(authorization="Basic abc123")
    assert e.value.status_code == 401


def test_invalid_token_is_401(hs256):
    with pytest.raises(HTTPException) as e:
        auth.get_claims(authorization="Bearer not.a.real.jwt")
    assert e.value.status_code == 401


def test_valid_token_returns_claims(hs256):
    token = jwt.encode(
        {"sub": "user-123", "role": "authenticated", "aud": "authenticated"},
        hs256,
        algorithm="HS256",
    )
    claims = auth.get_claims(authorization=f"Bearer {token}")
    assert claims["sub"] == "user-123"
    assert claims["role"] == "authenticated"


def test_token_without_sub_is_401(hs256):
    token = jwt.encode({"role": "authenticated", "aud": "authenticated"}, hs256, algorithm="HS256")
    with pytest.raises(HTTPException) as e:
        auth.get_claims(authorization=f"Bearer {token}")
    assert e.value.status_code == 401


def test_dev_bypass_returns_fixed_user(monkeypatch):
    """Local-only escape hatch: when enabled, auth is skipped and a fixed user is returned.
    Guards that the bypass stays inert unless explicitly turned on."""
    monkeypatch.setattr(auth._settings, "auth_dev_bypass", True)
    claims = auth.get_claims(authorization=None)
    assert claims["sub"] == "00000000-0000-0000-0000-000000000000"
    assert claims["role"] == "authenticated"
