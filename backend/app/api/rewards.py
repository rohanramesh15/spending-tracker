"""Rewards optimizer endpoints (rewards-optimizer-plan §3, v1).

- GET /api/rewards/optimization?window_days=90 → best card per reward category among the
  cards the user holds, with the cap-aware annual earn each would produce.
- GET /api/rewards/profiles                     → the seed reward-profile catalog for the
  card-confirm picker.

v1 gives *advice* (best card + what it would earn). The "you lost $X vs the card you actually
used" figure needs per-transaction card attribution and lands in v2. Spend is aggregated from
the user's **confirmed Plaid** transactions in the window (needs_review excluded, mirroring
the chart aggregation rule); v1 can't yet tell credit from debit spend (no card_id on
transactions), so it scopes to all synced bank/card spend — see ``spend_scope_note``.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.api.cards import build_card_out, institution_map, needs_confirmation
from app.api.schemas import (
    RewardProfileOut,
    RewardRecommendation,
    RewardsOptimization,
)
from app.core.auth import current_user_id, get_db
from app.models.enums import ReviewStatus, TransactionSource
from app.models.tables import Card, Transaction
from app.services import reward_kb
from app.services.reward_kb import RewardProfile
from app.services.rewards import CategoryReco, optimize, reward_category

router = APIRouter(prefix="/api/rewards", tags=["rewards"])

_POINTS_NOTE = (
    "Rates assume 1¢ per point. Transferable-points cards (Amex MR, Chase UR, miles) can be "
    "worth more via transfers, which may change the best card."
)
_SCOPE_NOTE = (
    "Estimated from all synced bank/card spend in this window. v2 will attribute each purchase "
    "to the exact card it was made on for a real 'rewards you missed' figure."
)


def _profile_out(p: RewardProfile) -> RewardProfileOut:
    return RewardProfileOut(
        key=p.key,
        display_name=p.display_name,
        issuer=p.issuer,
        base_rate=p.base_rate,
        category_rates=p.category_rates,
        points_value_cents=p.points_value_cents,
        verified=p.verified,
        notes=p.notes,
    )


@router.get("/profiles", response_model=list[RewardProfileOut])
def list_reward_profiles() -> list[RewardProfileOut]:
    """The reward-profile catalog for the card-confirm picker. Static seed data (no auth
    needed for the list itself, but the router sits behind the app's normal CORS/allowlist)."""
    return [_profile_out(p) for p in reward_kb.SEED_PROFILES]


@router.get("/optimization", response_model=RewardsOptimization)
def optimization(
    window_days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> RewardsOptimization:
    cards = db.exec(
        select(Card)
        .where(Card.user_id == user_id, Card.is_active.is_(True))
        .order_by(Card.created_at)
    ).all()
    institutions = institution_map(db, user_id, cards)
    card_outs = [
        build_card_out(
            c,
            institutions.get(c.linked_account_id, ""),
            reward_kb.get_profile(c.reward_profile_key) if c.reward_profile_key else None,
        )
        for c in cards
    ]

    # The wallet the optimizer ranks over: cards with a resolved profile, deduped by product
    # (holding the same card twice doesn't change "best card").
    wallet: dict[str, RewardProfile] = {}
    for c in cards:
        if c.reward_profile_key:
            profile = reward_kb.get_profile(c.reward_profile_key)
            if profile is not None:
                wallet[profile.key] = profile

    spend = _spend_by_reward_category(db, user_id, window_days)
    recos = optimize(spend, list(wallet.values()), window_days)

    return RewardsOptimization(
        window_days=window_days,
        cards=card_outs,
        recommendations=[_reco_out(r) for r in recos],
        total_est_annual_reward_cents=sum(r.est_annual_reward_cents for r in recos),
        unmatched_card_count=sum(1 for c in cards if needs_confirmation(c)),
        top_move=_top_move(recos),
        points_assumption_note=_POINTS_NOTE,
        spend_scope_note=_SCOPE_NOTE,
    )


def _spend_by_reward_category(db: Session, user_id: str, window_days: int) -> dict[str, int]:
    """Sum confirmed Plaid spend in the window, bucketed by reward category (vendor-derived
    in v1). Excludes needs_review (chart aggregation rule) and non-positive amounts."""
    cutoff = date.today() - timedelta(days=window_days)
    rows = db.exec(
        select(Transaction.vendor, Transaction.total_cents).where(
            Transaction.user_id == user_id,
            Transaction.source == TransactionSource.plaid,
            Transaction.review_status == ReviewStatus.confirmed,
            Transaction.purchased_on >= cutoff,
        )
    ).all()
    spend: dict[str, int] = {}
    for vendor, total_cents in rows:
        if not total_cents or total_cents <= 0:
            continue
        cat = reward_category(vendor)
        spend[cat] = spend.get(cat, 0) + total_cents
    return spend


def _reco_out(r: CategoryReco) -> RewardRecommendation:
    return RewardRecommendation(
        reward_category=r.reward_category,
        spend_cents=r.spend_cents,
        annualized_spend_cents=r.annualized_spend_cents,
        best_card_key=r.best_card_key,
        best_card_name=r.best_card_name,
        best_rate=r.best_rate,
        est_annual_reward_cents=r.est_annual_reward_cents,
        current_card_name=r.current_card_name,
        current_rate=r.current_rate,
        est_annual_missed_cents=r.est_annual_missed_cents,
    )


def _top_move(recos: list[CategoryReco]) -> str | None:
    if not recos:
        return None
    top = max(recos, key=lambda r: r.est_annual_reward_cents)
    dollars = round(top.est_annual_reward_cents / 100)
    return f"Use {top.best_card_name} for {top.reward_category} (~${dollars:,}/yr in rewards)"
