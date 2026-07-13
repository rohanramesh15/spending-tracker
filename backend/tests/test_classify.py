"""The Gemini category fallback (services/extract.classify_category) — the LLM side of the
hybrid classifier. Pure wrapper behavior only; the network call itself is never made in a
test (mocked/monkeypatched). Guards graceful degradation so a categorization call can never
break ingest.
"""

from __future__ import annotations

from app.services import extract


class _Settings:
    def __init__(self, key):
        self.gemini_api_key = key
        self.gemini_model = "gemini-2.5-flash"


def test_blank_name_returns_other():
    assert extract.classify_category("   ") == "Other"


def test_no_api_key_returns_other(monkeypatch):
    monkeypatch.setattr(extract, "get_settings", lambda: _Settings(None))
    # Deterministic classifier already ran upstream; with no key there's nothing to add.
    assert extract.classify_category("NY Pay as you go") == "Other"


def test_uses_gemini_result_when_configured(monkeypatch):
    monkeypatch.setattr(extract, "get_settings", lambda: _Settings("key"))
    monkeypatch.setattr(extract, "_classify_gemini", lambda name, k, m: "Health")
    assert extract.classify_category("Bright Smiles Dental") == "Health"


def test_gemini_failure_degrades_to_other(monkeypatch):
    monkeypatch.setattr(extract, "get_settings", lambda: _Settings("key"))

    def _boom(name, k, m):
        raise RuntimeError("gemini unavailable")

    monkeypatch.setattr(extract, "_classify_gemini", _boom)
    assert extract.classify_category("anything") == "Other"
