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

from sqlalchemy import text
from sqlmodel import Session

from app.core.config import get_settings
from app.services import reward_kb
from app.services.reward_kb import RewardProfile

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
    # The real Tavily + LLM lookup slots in here once TAVILY_API_KEY is set (the user's step,
    # CLAUDE.md). Lazy/guarded so the app and tests never need the dependency or a key. Returns
    # None until wired — honest (no fabricated rates) rather than a stub with fake numbers.
    logger.warning(
        "reward-rate refresh requested for %r but Tavily fetch is not wired yet", card_name
    )
    return None


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
