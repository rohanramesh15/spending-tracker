"""Reward-rate refresh for cards outside the curated seed — rewards optimizer v3 (§5).

Multi-user coverage: ``match_profile`` can't place every card users hold. When it can't, this
fetches the card's current reward rates via Tavily (grounded web retrieval) + the LLM
extraction seam and CACHES them in ``reward_profiles``. **Mock-aware:** with no Tavily key,
``fetch_reward_profile`` returns None (the card stays unmatched — behaviour identical to
v1/v2); the seed cards are unaffected. NEVER called per-request — the worker job
``reward_profiles_refresh`` populates the cache; reads go through ``resolve_profile``.

``reward_profiles`` is GLOBAL reference data (universal card rates), written by the refresh
job via ``admin_session`` and world-readable by ``authenticated`` (no RLS — see migration
0010). Rows carry ``source`` + ``fetched_at`` so the UI can mark them "unverified".
"""

from __future__ import annotations

import json
import logging
import re

from sqlalchemy import text
from sqlmodel import Session

from app.core.config import get_settings
from app.services import reward_kb
from app.services.reward_kb import RewardProfile
from app.services.rewards import REWARD_CATEGORIES

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(get_settings().tavily_api_key)


def fetch_reward_profile(card_name: str) -> dict | None:
    """Best-effort current reward rates for a card not in the seed. Returns a profile-shaped
    dict (key/display_name/issuer/base_rate/category_rates/category_caps/points_value_cents/
    source) or None if not configured / not found. Provider details live behind this seam;
    tests monkeypatch this."""
    if not is_configured():
        return None
    return _fetch_via_tavily(card_name)


def _fetch_via_tavily(card_name: str) -> dict | None:
    """Tavily web-retrieval → Gemini structured extraction. Two seams, each guarded on its own
    key and mocked in tests (never a real network call in the suite, CLAUDE.md #5)."""
    content = _tavily_search(f"{card_name} credit card rewards rate bonus categories 2026")
    if not content:
        return None
    return _extract_profile_gemini(card_name, content)


def _tavily_search(query: str) -> str | None:
    """Grounded web search via Tavily; returns the concatenated result text (answer + snippets)
    or None. No-op without a key."""
    api_key = get_settings().tavily_api_key
    if not api_key:
        return None
    import httpx

    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "advanced",  # richer content — worth it for a cached, rare call
                "max_results": 6,
                "include_answer": True,
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:  # noqa: BLE001 - a search failure just means no refresh for this card
        logger.exception("Tavily search failed for %r", query)
        return None

    parts: list[str] = []
    if data.get("answer"):
        parts.append(str(data["answer"]))
    for r in data.get("results", []):
        if r.get("content"):
            parts.append(str(r["content"]))
    text_out = "\n".join(parts).strip()
    return text_out or None


def _extract_profile_gemini(card_name: str, content: str) -> dict | None:
    """Ask Gemini to structure the search snippets into a RewardProfile-shaped dict, constrained
    to our reward-category vocabulary. Returns None without a key, on error, or if the model
    reports it can't identify the card's rewards. Same provider seam as ``extract.py``."""
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.warning("Tavily results for %r but no Gemini key to extract rates", card_name)
        return None
    from google import genai
    from google.genai import types

    cats = ", ".join(c for c in REWARD_CATEGORIES if c != "other")
    prompt = (
        "You extract structured credit-card reward rates from web search snippets.\n"
        f"Card: {card_name!r}\n\n"
        f"Search results:\n{content[:8000]}\n\n"
        "Example — a card earning 4x dining, 4x US supermarkets (capped $25k/yr), 3x flights:\n"
        '{"display_name":"Amex Gold","issuer":"American Express","base_rate":0.01,'
        '"category_rates":{"dining":0.04,"groceries":0.04,"travel":0.03},'
        '"category_caps":{"groceries":2500000},"points_value_cents":1.0}\n\n'
        "Return JSON with EXACTLY this shape:\n"
        '{"display_name": str, "issuer": str, "base_rate": number, '
        '"category_rates": {category: rate}, "category_caps": {category: annual_cap_cents}, '
        '"points_value_cents": number}\n'
        "Rules:\n"
        f"- category keys MUST come from EXACTLY this list: {cats}. Omit any with no bonus.\n"
        "- Include EVERY category the card earns ABOVE its base rate, not just one.\n"
        "- rates are DECIMAL FRACTIONS at 1 cent/point (5x -> 0.05, 3x -> 0.03, 1% -> 0.01).\n"
        "- Use the EVERYDAY earn rate for normal purchases, NOT an elevated rate that requires "
        "booking through the issuer's own travel portal. Real everyday category rates almost "
        "never exceed 6% (0.06); if you see 10x/5x, that's usually portal-only — use the "
        "general rate instead.\n"
        "- base_rate is the catch-all rate (use 0.01 if unclear).\n"
        "- category_caps: annual spend cap in INTEGER CENTS where a bonus is capped "
        "($6,000/yr -> 600000; convert a quarterly cap to annual by x4); omit if uncapped.\n"
        "- points_value_cents: 1.0 for cashback; up to ~2.0 only if transferable value is stated.\n"
        '- Return {"unknown": true} ONLY if the results are not about this card at all.'
    )
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[prompt],
        config=types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json"),
    )
    raw = (getattr(response, "text", "") or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("reward-profile extraction returned non-JSON for %r", card_name)
        return None
    if not isinstance(data, dict) or data.get("unknown"):
        return None
    return _normalize_fetched_profile(card_name, data)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")


def _normalize_fetched_profile(card_name: str, data: dict) -> dict | None:
    """Coerce raw LLM output onto our schema + reward-category whitelist, clamping insane
    values. Returns None if there's not even a usable key."""
    valid = set(REWARD_CATEGORIES) - {"other"}

    def _num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    rates: dict[str, float] = {}
    for k, v in (data.get("category_rates") or {}).items():
        f = _num(v)
        # No everyday category rate legitimately exceeds ~8%; higher = portal rate or garbage.
        if k in valid and f is not None and 0 < f <= 0.08:
            rates[k] = round(f, 4)
    caps: dict[str, int] = {}
    for k, v in (data.get("category_caps") or {}).items():
        try:
            c = int(v)
        except (TypeError, ValueError):
            continue
        if k in valid and c > 0:
            caps[k] = c

    display = str(data.get("display_name") or card_name).strip()
    key = _slug(display) or _slug(card_name)
    if not key:
        return None
    base = _num(data.get("base_rate"))
    base_rate = base if (base is not None and 0 < base <= 0.5) else 0.01
    pv = _num(data.get("points_value_cents"))
    points = pv if (pv is not None and 0.5 <= pv <= 3.0) else 1.0
    issuer = str(data.get("issuer") or "").strip() or None
    return {
        "key": key,
        "display_name": display,
        "issuer": issuer,
        "base_rate": round(base_rate, 4),
        "category_rates": rates,
        "category_caps": caps,
        "points_value_cents": points,
        "source": "tavily",
    }


def get_cached_profile(db: Session, key: str) -> RewardProfile | None:
    row = (
        db.execute(
            text(
                "SELECT key, display_name, issuer, base_rate, category_rates, category_caps, "
                "points_value_cents, source FROM reward_profiles WHERE key = :k"
            ),
            {"k": key},
        )
        .mappings()
        .first()
    )
    return _row_to_profile(row) if row is not None else None


def _row_to_profile(row) -> RewardProfile:
    cats = row["category_rates"] or {}
    caps = row["category_caps"] or {}
    if isinstance(cats, str):
        cats = json.loads(cats)
    if isinstance(caps, str):
        caps = json.loads(caps)
    return RewardProfile(
        key=row["key"],
        display_name=row["display_name"],
        issuer=row["issuer"] or "",
        base_rate=float(row["base_rate"]),
        category_rates={k: float(v) for k, v in cats.items()},
        category_caps={k: int(v) for k, v in caps.items()},
        points_value_cents=float(row["points_value_cents"]),
        source=row["source"] or "tavily",
        verified=False,  # fetched rates are never treated as verified
    )


def upsert_cached_profile(db: Session, data: dict) -> None:
    db.execute(
        text("""
            INSERT INTO reward_profiles (key, display_name, issuer, base_rate, category_rates,
                category_caps, points_value_cents, source, fetched_at)
            VALUES (:key, :display_name, :issuer, :base_rate, :category_rates, :category_caps,
                :points_value_cents, :source, now())
            ON CONFLICT (key) DO UPDATE SET
                display_name = EXCLUDED.display_name, issuer = EXCLUDED.issuer,
                base_rate = EXCLUDED.base_rate, category_rates = EXCLUDED.category_rates,
                category_caps = EXCLUDED.category_caps,
                points_value_cents = EXCLUDED.points_value_cents,
                source = EXCLUDED.source, fetched_at = now()
            """),
        {
            "key": data["key"],
            "display_name": data["display_name"],
            "issuer": data.get("issuer"),
            "base_rate": data.get("base_rate", 0.01),
            "category_rates": json.dumps(data.get("category_rates", {})),
            "category_caps": json.dumps(data.get("category_caps", {})),
            "points_value_cents": data.get("points_value_cents", 1.0),
            "source": data.get("source", "tavily"),
        },
    )


def resolve_profile(db: Session, key: str) -> RewardProfile | None:
    """A card's stored ``reward_profile_key`` → a ``RewardProfile``: seed first (pure,
    synchronous), then the Tavily-fetched ``reward_profiles`` cache for the long tail."""
    seed = reward_kb.get_profile(key)
    return seed if seed is not None else get_cached_profile(db, key)


def refresh_unmatched_cards() -> int:
    """Worker job ``reward_profiles_refresh``: for credit cards with no reward profile, fetch
    rates, cache them globally, and assign the profile to each card. System job — the card
    enumeration and the global ``reward_profiles`` cache write use ``admin_session`` (the cache
    isn't user data and only the service role may write it); per-user card updates run under
    the owner's RLS session (CLAUDE.md #3). Phased so an ``admin_session`` never nests inside an
    ``rls_session``. No-op (returns 0) without a Tavily key. Returns the number newly matched."""
    if not is_configured():
        return 0
    from app.core.db import admin_session, rls_session

    # Phase 1 — enumerate unmatched credit cards (system read).
    with admin_session() as sys_db:
        rows = (
            sys_db.execute(
                text(
                    "SELECT id, user_id, name FROM cards "
                    "WHERE reward_profile_key IS NULL AND subtype ILIKE '%credit%'"
                )
            )
            .mappings()
            .all()
        )

    # Phase 2 — fetch rates (no DB, behind the seam).
    fetched = [
        (r["user_id"], r["id"], data)
        for r in rows
        if (data := fetch_reward_profile(r["name"] or "")) is not None
    ]
    if not fetched:
        return 0

    # Phase 3 — cache the fetched profiles globally (system write, not inside any RLS session).
    with admin_session() as cache_db:
        for _owner, _card_id, data in fetched:
            upsert_cached_profile(cache_db, data)
        cache_db.commit()

    # Phase 4 — assign each profile to its card under the owner's RLS session.
    by_owner: dict = {}
    for owner, card_id, data in fetched:
        by_owner.setdefault(owner, []).append((card_id, data))
    assigned = 0
    for owner, items in by_owner.items():
        claims = {"sub": str(owner), "role": "authenticated"}
        with rls_session(claims) as db:
            for card_id, data in items:
                db.execute(
                    text(
                        "UPDATE cards SET reward_profile_key = :k, reward_profile_source = :s, "
                        "updated_at = now() WHERE id = :id AND user_id = :u"
                    ),
                    {
                        "k": data["key"],
                        "s": data.get("source", "tavily"),
                        "id": card_id,
                        "u": owner,
                    },
                )
                assigned += 1
    return assigned
