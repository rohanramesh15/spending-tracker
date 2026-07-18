"""Shared pytest fixtures.

The suite must NEVER hit real external services (CLAUDE.md #5) — Gemini/Plaid/etc. are
mocked or run in their mock-aware fallback. Because ``backend/.env`` may carry a real
``GEMINI_API_KEY`` for local dev, we force it empty for the whole test session so every LLM
seam (``extract``, ``subscription_enrich``) stays in its offline passthrough branch. Tests
that want to exercise the with-key path stub the seam directly.
"""

from __future__ import annotations

import os

import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True, scope="session")
def _force_llm_offline() -> None:
    """Guarantee no test makes a real Gemini call, regardless of the local .env."""
    os.environ["GEMINI_API_KEY"] = ""
    get_settings.cache_clear()  # drop any settings cached (with a real key) at import time
    yield
    get_settings.cache_clear()
