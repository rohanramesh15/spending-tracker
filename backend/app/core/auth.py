"""Supabase JWT verification and the request-scoped DB session dependency.

The FastAPI dependency ``get_db`` verifies the Bearer token, then hands the caller a
Session whose transaction already carries the JWT claims (so RLS applies). Handlers
STILL filter on ``user_id`` explicitly — RLS is the safety net, not the filter
(CLAUDE.md convention #3).
"""

from __future__ import annotations

from collections.abc import Iterator

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from sqlmodel import Session

from app.core.config import get_settings
from app.core.db import rls_session

_settings = get_settings()
_jwks_client: PyJWKClient | None = (
    PyJWKClient(_settings.supabase_jwks_url) if _settings.supabase_jwks_url else None
)


def verify_jwt(token: str) -> dict:
    """Verify a Supabase access token and return its claims.

    Supports both the legacy HS256 shared secret and asymmetric keys via JWKS.
    Raises 401 on any failure — never trusts an unverified token.
    """
    try:
        if _jwks_client is not None:
            signing_key = _jwks_client.get_signing_key_from_jwt(token).key
            return jwt.decode(
                token,
                signing_key,
                algorithms=["ES256", "RS256"],
                audience=_settings.supabase_jwt_aud,
            )
        if _settings.supabase_jwt_secret:
            return jwt.decode(
                token,
                _settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=_settings.supabase_jwt_aud,
            )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc
    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Auth not configured (no JWT secret or JWKS URL)",
    )


def get_claims(authorization: str | None = Header(default=None)) -> dict:
    """Extract and verify claims from the Authorization: Bearer header."""
    if _settings.auth_dev_bypass:
        # Local-only escape hatch; never enabled in prod (see config).
        return {"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    claims = verify_jwt(token)
    if "sub" not in claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")
    return claims


def get_db(claims: dict = Depends(get_claims)) -> Iterator[Session]:
    """Request-scoped DB session with RLS claims applied for the transaction."""
    with rls_session(claims) as session:
        yield session


def current_user_id(claims: dict = Depends(get_claims)) -> str:
    return claims["sub"]
