"""Application settings.

Locally these come from a `.env` file (never committed); in Lambda they come from
environment variables the SAM template populates from SSM Parameter Store
(SecureString). Nothing secret is ever hard-coded — see CLAUDE.md convention #11.
"""

import json
import re
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.secrets import hydrate_env_from_ssm


def _parse_origins(raw: str) -> list[str]:
    """Parse the CORS allow-list from a plain string.

    Accepts a comma/whitespace-separated list ("https://a,http://b") OR a JSON array
    ('["https://a","http://b"]', kept for local .env back-compat). Stored as a raw str
    rather than a pydantic ``list[str]`` on purpose: pydantic-settings JSON-decodes
    complex env fields, but SAM's parameter_overrides shlex-parsing strips the
    double-quotes a JSON array needs — the Lambda received a bare "[" and 502'd at init.
    Parsing here means the deployed value carries no quotes at all (infra/samconfig.toml).
    """
    raw = (raw or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(o).strip() for o in parsed if str(o).strip()]
        except json.JSONDecodeError:
            pass
    return [o.strip() for o in re.split(r"[,\s]+", raw) if o.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Database (Supabase Postgres via the Supavisor transaction pooler, port 6543) ---
    # ALWAYS the pooler URL from Lambda, never direct Postgres. SQLAlchemy uses NullPool.
    # Example: postgresql+psycopg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
    supabase_db_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/postgres"

    # --- Supabase Auth (JWT verification) ---
    # HS256 legacy shared secret OR the project's JWKS URL for asymmetric (ES256/RS256) keys.
    supabase_jwt_secret: str | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_aud: str = "authenticated"

    # --- CORS: the frontend origin(s) allowed to call the Function URL ---
    # Raw string (comma/space list or JSON array); parsed by ``cors_allow_origins``.
    cors_allow_origins_raw: str = Field(
        default="http://localhost:5173",
        validation_alias="CORS_ALLOW_ORIGINS",
    )

    @property
    def cors_allow_origins(self) -> list[str]:
        return _parse_origins(self.cors_allow_origins_raw)

    # --- Background jobs ---
    jobs_queue_url: str | None = None  # SQS queue URL, injected by SAM in Lambda

    # --- Receipt extraction (Phase 2) ---
    # Gemini API key (free tier for now). If unset, extract_receipt() falls back to a
    # deterministic mock so the scan/confirm flow is fully testable without a key.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    # --- Bank sync (Phase 3, Plaid) ---
    # Names mirror the Plaid dashboard (Developers → Keys): one client_id shared across
    # environments, plus a separate secret per environment. plaid_env selects which secret
    # is used. Sandbox while developing (real accounts linked once, at the end). If the
    # active client_id/secret are unset, bank-sync reports "not configured", never fails.
    plaid_client_id: str | None = None
    plaid_sandbox_secret: str | None = None
    plaid_production_secret: str | None = None
    plaid_env: str = "sandbox"
    # Public HTTPS URL Plaid POSTs webhooks to (the deployed /api/plaid/webhook). Unset
    # locally → no webhook registered, so you sync manually / via the initial exchange.
    plaid_webhook_url: str | None = None
    # Public HTTPS URL Plaid returns to after an OAuth bank login (major US banks in
    # production). Must be registered in the Plaid dashboard (Team Settings → API →
    # Allowed redirect URIs) and match exactly. Unset → OAuth banks can't be linked.
    plaid_redirect_uri: str | None = None

    @property
    def plaid_secret(self) -> str | None:
        """The Plaid secret for the active environment (``plaid_env`` picks it)."""
        if self.plaid_env == "production":
            return self.plaid_production_secret
        return self.plaid_sandbox_secret

    # Set true only in local/dev to relax auth for manual testing. Never in prod.
    auth_dev_bypass: bool = False


@lru_cache
def get_settings() -> Settings:
    # In Lambda, pull SecureString secrets from SSM into env before reading settings.
    hydrate_env_from_ssm()
    return Settings()
