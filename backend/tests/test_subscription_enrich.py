"""Unit tests for LLM subscription enrichment (docs/subscriptions-plan.md §3, v2).

No network — the Gemini call is monkeypatched. Covers: false positives dropped, names/types
applied and coerced to the whitelist, missing merchants kept, and the no-key passthrough.
"""

from __future__ import annotations

from datetime import date

import app.services.subscription_enrich as enrich_mod
from app.services.subscription_enrich import enrich_subscriptions
from app.services.subscriptions import DetectedSubscription


def _cand(merchant: str, display_name: str | None = None) -> DetectedSubscription:
    return DetectedSubscription(
        merchant=merchant,
        display_name=display_name or merchant.title(),
        amount_cents=1599,
        cadence="monthly",
        monthly_cost_cents=1599,
        occurrences=6,
        first_charged_on=date(2026, 1, 1),
        last_charged_on=date(2026, 6, 1),
        next_charge_on=date(2026, 7, 1),
        confidence=0.9,
    )


def _stub_llm(monkeypatch, verdicts: dict[str, dict]) -> None:
    """Force the 'has a key' branch and stub the batched Gemini call with a verdict map."""

    class _S:
        gemini_api_key = "test-key"
        gemini_model = "gemini-x"

    monkeypatch.setattr(enrich_mod, "get_settings", lambda: _S())
    monkeypatch.setattr(enrich_mod, "_enrich_gemini", lambda cands, key, model: verdicts)


def test_no_key_passes_through_unchanged(monkeypatch):
    class _S:
        gemini_api_key = None
        gemini_model = "gemini-x"

    monkeypatch.setattr(enrich_mod, "get_settings", lambda: _S())
    cands = [_cand("netflix"), _cand("kroger")]
    out = enrich_subscriptions(cands)
    assert [c.merchant for c in out] == ["netflix", "kroger"]
    assert all(c.type is None for c in out)  # heuristic passthrough leaves type unset


def test_false_positives_are_dropped(monkeypatch):
    _stub_llm(
        monkeypatch,
        {
            "netflix": {"is_subscription": True, "display_name": "Netflix", "type": "streaming"},
            "kroger": {"is_subscription": False, "display_name": "Kroger", "type": "other"},
        },
    )
    out = enrich_subscriptions([_cand("netflix"), _cand("kroger")])
    assert [c.merchant for c in out] == ["netflix"]
    assert out[0].display_name == "Netflix"
    assert out[0].type == "streaming"


def test_unknown_type_is_coerced_to_other(monkeypatch):
    _stub_llm(
        monkeypatch,
        {"spotify": {"is_subscription": True, "display_name": "Spotify", "type": "banana"}},
    )
    out = enrich_subscriptions([_cand("spotify")])
    assert out[0].type == "other"


def test_merchant_missing_from_verdicts_is_kept_unchanged(monkeypatch):
    # An incomplete model response must never silently hide a real candidate.
    _stub_llm(monkeypatch, {})
    out = enrich_subscriptions([_cand("hbo", display_name="Hbo")])
    assert [c.merchant for c in out] == ["hbo"]
    assert out[0].display_name == "Hbo"  # untouched


def test_llm_failure_degrades_to_passthrough(monkeypatch):
    class _S:
        gemini_api_key = "test-key"
        gemini_model = "gemini-x"

    def _boom(cands, key, model):
        raise RuntimeError("gemini down")

    monkeypatch.setattr(enrich_mod, "get_settings", lambda: _S())
    monkeypatch.setattr(enrich_mod, "_enrich_gemini", _boom)
    out = enrich_subscriptions([_cand("netflix")])
    assert [c.merchant for c in out] == ["netflix"]  # kept, not lost


def test_empty_input_returns_empty(monkeypatch):
    assert enrich_subscriptions([]) == []
