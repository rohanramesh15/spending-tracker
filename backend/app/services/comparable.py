"""Comparable-spec builder for the cheaper-store finder (plan §6.9 step 1).

Turns a recurring item ("milk, 2%") into a spec that drives the price search: a Kroger
search term, the measurement **dimension** (volume/weight/count) for per-unit comparison,
a typical size, display attributes, and **exclude_terms** — words that would cross a hard
line (dairy↔plant, organic↔non-organic). The strict tightness drops any product whose
title hits an exclude term, so we never silently substitute across dietary/quality lines.

LLM behind the same one-provider boundary as extraction (Gemini; a deterministic mock when
no key). No Gemini/SDK type leaks past this module.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_DIMENSIONS = {"volume", "weight", "count"}


class ComparableSpec(BaseModel):
    """The equivalence class for a recurring item, ready to price."""

    canonical_name: str
    search_term: str
    dimension: str  # volume | weight | count
    size_value: Decimal | None = None
    size_unit: str | None = None
    attributes: list[str] = Field(default_factory=list)
    exclude_terms: list[str] = Field(default_factory=list)


# --- Gemini wire schema (primitives only; see extract.py for why) -------------------


class _WireSpec(BaseModel):
    search_term: str
    dimension: str = "count"
    typical_size_value: float | None = None
    typical_size_unit: str | None = None
    attributes: list[str] = Field(default_factory=list)
    exclude_terms: list[str] = Field(default_factory=list)

    @field_validator("dimension")
    @classmethod
    def _valid_dimension(cls, v: str) -> str:
        return v if v in _DIMENSIONS else "count"


def build_comparable_spec(canonical_name: str, category: str | None = None) -> ComparableSpec:
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.info("GEMINI_API_KEY unset — using mock comparable spec")
        return _build_mock(canonical_name)
    try:
        wire = _build_gemini(
            canonical_name, category, settings.gemini_api_key, settings.gemini_model
        )
    except Exception:  # noqa: BLE001 - fall back to a usable spec rather than fail the finder
        logger.exception("Comparable-spec LLM call failed; using mock")
        return _build_mock(canonical_name)
    return _to_spec(canonical_name, wire)


def _prompt(canonical_name: str, category: str | None) -> str:
    return (
        "You build a 'comparable spec' to price-compare a grocery item across stores.\n"
        f"Item (canonical name): {canonical_name}\n"
        f"Category: {category or 'unknown'}\n"
        "Return JSON with:\n"
        "- search_term: a short query for a grocery product search (e.g. '2% milk').\n"
        "- dimension: how it's measured for per-unit comparison — exactly one of "
        "'volume', 'weight', or 'count'.\n"
        "- typical_size_value / typical_size_unit: a common package size (e.g. 1 'gal', "
        "16 'oz', 12 'ct'); null if it truly varies.\n"
        "- attributes: a few short human facets (e.g. '2% fat', 'dairy').\n"
        "- exclude_terms: every variant that makes it a DIFFERENT product for a strict "
        "shopper — OTHER fat levels or types, flavors, plant alternatives, and organic vs "
        "not. For '2% milk' that means: 'whole','skim','fat free','nonfat','1%',"
        "'chocolate','strawberry','flavored','almond','soy','oat','coconut','organic',"
        "'lactose free'. Never cross dairy↔plant, organic↔non-organic, or one fat level "
        "into another."
    )


def _build_gemini(canonical_name: str, category: str | None, api_key: str, model: str) -> _WireSpec:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=[_prompt(canonical_name, category)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_WireSpec,
            temperature=0.0,
        ),
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, _WireSpec):
        return parsed
    text = getattr(response, "text", None)
    if not text:
        raise ValueError("Gemini returned no usable content")
    return _WireSpec.model_validate_json(text)


def _to_spec(canonical_name: str, w: _WireSpec) -> ComparableSpec:
    return ComparableSpec(
        canonical_name=canonical_name,
        search_term=w.search_term.strip() or canonical_name,
        dimension=w.dimension,
        size_value=Decimal(str(w.typical_size_value)) if w.typical_size_value else None,
        size_unit=(w.typical_size_unit or "").strip().lower() or None,
        attributes=[a.strip() for a in w.attributes if a.strip()],
        exclude_terms=[t.strip().lower() for t in w.exclude_terms if t.strip()],
    )


def _build_mock(canonical_name: str) -> ComparableSpec:
    """Deterministic spec so the finder pipeline is testable without a key. Special-cases
    2% milk (the running example); everything else gets a plausible generic spec."""
    name = canonical_name.lower()
    if "milk" in name and "2%" in name:
        return ComparableSpec(
            canonical_name=canonical_name,
            search_term="2% milk",
            dimension="volume",
            size_value=Decimal(1),
            size_unit="gal",
            attributes=["2% fat", "dairy"],
            exclude_terms=[
                "almond", "soy", "oat", "coconut", "organic", "lactose free",
                "whole", "skim", "fat free", "nonfat", "1%", "chocolate",
                "strawberry", "flavored",
            ],
        )
    return ComparableSpec(
        canonical_name=canonical_name,
        search_term=canonical_name,
        dimension="count",
        attributes=[],
        exclude_terms=[],
    )
