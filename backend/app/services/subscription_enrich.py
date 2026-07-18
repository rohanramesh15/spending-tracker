"""LLM enrichment for detected subscriptions (docs/subscriptions-plan.md §3, v2).

Cleans display names, assigns a ``type``, and DROPS false positives (grocery runs, gas,
rent-via-Zelle, one-off duplicates the heuristic flagged). One batched Gemini call.

Same provider seam as ``services/extract.py``: **mock-aware** (works with no API key — falls
back to the heuristic pass-through) and **no Gemini/SDK types leak past this module** — the
whitelist discipline mirrors ``extract.classify_category``. Keeping the LLM call here leaves
``services/subscriptions.py`` pure.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.subscriptions import DetectedSubscription

logger = logging.getLogger(__name__)

# Constrained type vocabulary (plan §3). Anything the model returns outside this set is
# coerced to "other", the same way category classification coerces to "Other".
SUBSCRIPTION_TYPES = {
    "streaming",
    "music",
    "software",
    "gaming",
    "news",
    "fitness",
    "cloud",
    "insurance",
    "utility",
    "telecom",
    "membership",
    "other",
}


def enrich_subscriptions(cands: list[DetectedSubscription]) -> list[DetectedSubscription]:
    """Clean names + type and drop false positives.

    With no API key: pass through the heuristic (title-cased ``display_name`` already set by
    detection, keep every candidate, ``type`` stays None). With a key: one Gemini call whose
    per-merchant verdict drops non-subscriptions and applies a cleaned name + a whitelisted
    type. Never raises — any LLM failure degrades to the heuristic pass-through so the list
    still renders.
    """
    if not cands:
        return []
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.info("GEMINI_API_KEY unset — subscription enrichment passthrough")
        return list(cands)
    try:
        verdicts = _enrich_gemini(cands, settings.gemini_api_key, settings.gemini_model)
    except Exception:  # noqa: BLE001 - never let enrichment break the endpoint
        logger.exception("subscription enrichment failed; passing through heuristic result")
        return list(cands)
    return _apply(cands, verdicts)


def _apply(
    cands: list[DetectedSubscription], verdicts: dict[str, dict]
) -> list[DetectedSubscription]:
    """Merge per-merchant LLM verdicts onto candidates; drop those judged non-subscriptions.

    A merchant missing from the verdicts (model omission) is kept unchanged — we only drop on
    an explicit ``is_subscription == false`` so an incomplete response never silently hides
    real subs.
    """
    out: list[DetectedSubscription] = []
    for c in cands:
        v = verdicts.get(c.merchant)
        if v is None:
            out.append(c)
            continue
        if v.get("is_subscription") is False:
            continue
        name = (v.get("display_name") or "").strip() or c.display_name
        sub_type = (v.get("type") or "").strip().lower()
        c.display_name = name
        c.type = sub_type if sub_type in SUBSCRIPTION_TYPES else "other"
        out.append(c)
    return out


# --- Gemini wire schema (primitives only; no domain types leak in) ------------------


class _WireVerdictItem(BaseModel):
    merchant: str
    is_subscription: bool = True
    display_name: str = ""
    type: str = "other"


class _WireVerdicts(BaseModel):
    items: list[_WireVerdictItem] = Field(default_factory=list)


def _enrich_gemini(cands: list[DetectedSubscription], api_key: str, model: str) -> dict[str, dict]:
    """One batched call: given the candidate merchants, return a per-merchant verdict map."""
    from google import genai
    from google.genai import types

    payload = [
        {
            "merchant": c.merchant,
            "amount_cents": c.amount_cents,
            "cadence": c.cadence,
            "occurrences": c.occurrences,
        }
        for c in cands
    ]
    prompt = (
        "You are auditing candidate recurring charges detected from a user's bank/card "
        "transactions. For EACH merchant below decide whether it is a genuine paid "
        "subscription or membership (streaming, software, gym, insurance, telecom, news, "
        "cloud, etc.).\n"
        "Return JSON: an object with 'items', a list with one entry per input merchant, each "
        "with:\n"
        "  - merchant: echo the input merchant string EXACTLY\n"
        "  - is_subscription: true only if it's a real recurring subscription/membership; "
        "false for groceries, restaurants, gas, rideshare, rent/Zelle transfers, one-off "
        "duplicate purchases, or general retail\n"
        "  - display_name: a clean human name (e.g. 'netflix' -> 'Netflix', "
        "'amazon prime' -> 'Amazon Prime')\n"
        f"  - type: EXACTLY one of {sorted(SUBSCRIPTION_TYPES)}; use 'other' if unsure\n"
        "Do not invent merchants. Judge only what is listed.\n\n"
        f"Merchants:\n{json.dumps(payload)}"
    )
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_WireVerdicts,
            temperature=0.0,
        ),
    )
    return _parse_verdicts(response)


def _parse_verdicts(response: object) -> dict[str, dict]:
    """Pull the per-merchant verdict map out of the SDK response (parsed object or raw JSON)."""
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, _WireVerdicts):
        return {i.merchant: i.model_dump() for i in parsed.items}
    text = getattr(response, "text", None)
    if not text:
        raise ValueError("Gemini returned no usable content")
    data = json.loads(text)
    return {i["merchant"]: i for i in data.get("items", []) if "merchant" in i}
