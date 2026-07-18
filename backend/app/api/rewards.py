"""Rewards optimizer endpoints (rewards-optimizer-plan §3–§4, v1–v2).

- GET /api/rewards/optimization?window_days=90 → best card per reward category among the
  cards the user holds (cap-aware annual earn) PLUS, for spend attributable to a card
  (``card_id``, v2), the real "you left $X on the table" figure: best held card vs the card
  actually used.
- GET /api/rewards/profiles                     → the seed reward-profile catalog for the
  card-confirm picker.

Spend is aggregated from the user's **confirmed Plaid** transactions in the window
(needs_review excluded, mirroring the chart aggregation rule), category derived from Plaid's
detailed PFC when present, else the vendor string. The missed-rewards figure covers only
spend we can attribute to a card with a known profile (debit/unmatched earns nothing and is
excluded rather than counted as missed) — see ``spend_scope_note``.
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
from app.services import reward_kb, reward_refresh, rotating
from app.services.reward_kb import RewardProfile
from app.services.rewards import (
    CategoryReco,
    missed_rewards_for_category,
    optimize,
    reward_category,
)

router = APIRouter(prefix="/api/rewards", tags=["rewards"])

_POINTS_NOTE = (
    "Rates assume 1¢ per point. Transferable-points cards (Amex MR, Chase UR, miles) can be "
    "worth more via transfers, which may change the best card."
)
_SCOPE_NOTE = (
    "Estimated from your synced bank/card spend in this window. Where we can tell which card a "
    "purchase was made on, the 'left on the table' figure compares it against your best card."
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
            (
                reward_refresh.resolve_profile(db, c.reward_profile_key)
                if c.reward_profile_key
                else None
            ),
        )
        for c in cards
    ]

    # card_id → profile (cards with a resolved profile), and the deduped wallet the optimizer
    # ranks over (holding the same product twice doesn't change "best card").
    card_profiles: dict[str, RewardProfile] = {}
    wallet: dict[str, RewardProfile] = {}
    for c in cards:
        if c.reward_profile_key:
            profile = reward_refresh.resolve_profile(db, c.reward_profile_key)
            if profile is not None:
                card_profiles[str(c.id)] = profile
                wallet[profile.key] = profile

    # v3: overlay this quarter's rotating 5% categories onto rotating cards (Freedom Flex /
    # Discover it) so the optimizer credits them (rewards-optimizer-plan §5).
    year, quarter = rotating.quarter_of(date.today())
    wallet = {k: rotating.with_rotating_bonus(p, year, quarter) for k, p in wallet.items()}
    card_profiles = {
        cid: rotating.with_rotating_bonus(p, year, quarter) for cid, p in card_profiles.items()
    }

    spend, attributed = _gather_spend(db, user_id, window_days, card_profiles)
    # v2: actual-vs-optimal per category, over spend we can attribute to a known card.
    actual_usage = {
        cat: missed_rewards_for_category(
            cat, by_card, card_profiles, list(wallet.values()), window_days
        )
        for cat, by_card in attributed.items()
    }
    recos = optimize(spend, list(wallet.values()), window_days, actual_usage)

    total_missed = sum(r.est_annual_missed_cents or 0 for r in recos) if attributed else None

    return RewardsOptimization(
        window_days=window_days,
        cards=card_outs,
        recommendations=[_reco_out(r) for r in recos],
        total_est_annual_reward_cents=sum(r.est_annual_reward_cents for r in recos),
        total_missed_annual_cents=total_missed,
        unmatched_card_count=sum(1 for c in cards if needs_confirmation(c)),
        top_move=_top_move(recos, total_missed),
        points_assumption_note=_POINTS_NOTE,
        spend_scope_note=_SCOPE_NOTE,
    )


def _gather_spend(
    db: Session, user_id: str, window_days: int, card_profiles: dict[str, RewardProfile]
) -> tuple[dict[str, int], dict[str, dict[str, int]]]:
    """From confirmed Plaid spend in the window, return (spend_by_category, attributed).

    ``spend_by_category`` = all spend per reward category (v1 advice). ``attributed`` =
    ``{category: {card_id: spend}}`` for spend on cards with a known profile (v2 actual-vs-
    optimal). Excludes needs_review (chart aggregation rule) and non-positive amounts. Prefers
    Plaid's detailed PFC over the vendor string for the category (v2 accuracy)."""
    cutoff = date.today() - timedelta(days=window_days)
    rows = db.exec(
        select(
            Transaction.vendor,
            Transaction.total_cents,
            Transaction.card_id,
            Transaction.pfc_detailed,
        ).where(
            Transaction.user_id == user_id,
            Transaction.source == TransactionSource.plaid,
            Transaction.review_status == ReviewStatus.confirmed,
            Transaction.purchased_on >= cutoff,
        )
    ).all()
    spend: dict[str, int] = {}
    attributed: dict[str, dict[str, int]] = {}
    for vendor, total_cents, card_id, pfc_detailed in rows:
        if not total_cents or total_cents <= 0:
            continue
        cat = reward_category(vendor, pfc_detailed)
        spend[cat] = spend.get(cat, 0) + total_cents
        cid = str(card_id) if card_id else None
        if cid and cid in card_profiles:
            attributed.setdefault(cat, {})
            attributed[cat][cid] = attributed[cat].get(cid, 0) + total_cents
    return spend, attributed


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


def _top_move(recos: list[CategoryReco], total_missed: int | None) -> str | None:
    if not recos:
        return None
    # v2: if we can see real missed rewards, lead with the biggest fix.
    if total_missed and total_missed > 0:
        top = max(recos, key=lambda r: r.est_annual_missed_cents or 0)
        if top.est_annual_missed_cents:
            dollars = round(top.est_annual_missed_cents / 100)
            return (
                f"Move {top.reward_category} to {top.best_card_name} — "
                f"you're leaving ~${dollars:,}/yr on the table"
            )
    top = max(recos, key=lambda r: r.est_annual_reward_cents)
    dollars = round(top.est_annual_reward_cents / 100)
    return f"Use {top.best_card_name} for {top.reward_category} (~${dollars:,}/yr in rewards)"
