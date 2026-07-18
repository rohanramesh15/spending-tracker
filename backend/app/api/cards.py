"""Card management for the rewards optimizer (rewards-optimizer-plan §3, v1).

- GET  /api/cards                    → the user's cards + their matched reward profile.
- POST /api/cards/{card_id}/profile  → user sets/overrides a card's reward profile, for the
                                        cards ``match_profile`` couldn't resolve (the common
                                        path — Plaid names rarely pin the exact product, §8).

Cards are created from Plaid ``/accounts/get`` on link/sync (see ``api/plaid.py``). RLS is
the net; every query still filters on ``user_id`` (CLAUDE.md #3).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.schemas import CardOut, SetCardProfileRequest
from app.core.auth import current_user_id, get_db
from app.models.tables import Card, LinkedAccount
from app.services import reward_kb, reward_refresh
from app.services.reward_kb import RewardProfile

router = APIRouter(prefix="/api", tags=["cards"])


def needs_confirmation(card: Card) -> bool:
    """A credit card with no resolved reward profile → the UI should ask the user to pick.
    We don't nag on checking/savings (they earn no card rewards)."""
    if card.reward_profile_key:
        return False
    return "credit" in (card.subtype or "").lower()


def build_card_out(card: Card, institution: str, profile: RewardProfile | None) -> CardOut:
    return CardOut(
        id=str(card.id),
        institution=institution,
        name=card.name,
        mask=card.mask,
        subtype=card.subtype,
        reward_profile_key=card.reward_profile_key,
        reward_profile_source=card.reward_profile_source,
        reward_profile_name=profile.display_name if profile else None,
        needs_confirmation=needs_confirmation(card),
    )


def institution_map(db: Session, user_id: str, cards: list[Card]) -> dict:
    """{linked_account_id: institution} for a set of cards, in one query."""
    ids = {c.linked_account_id for c in cards}
    if not ids:
        return {}
    rows = db.exec(
        select(LinkedAccount).where(LinkedAccount.user_id == user_id, LinkedAccount.id.in_(ids))
    ).all()
    return {a.id: a.institution for a in rows}


@router.get("/cards", response_model=list[CardOut])
def list_cards(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[CardOut]:
    cards = db.exec(select(Card).where(Card.user_id == user_id).order_by(Card.created_at)).all()
    institutions = institution_map(db, user_id, cards)
    return [
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


@router.post("/cards/{card_id}/profile", response_model=CardOut)
def set_card_profile(
    card_id: str,
    body: SetCardProfileRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> CardOut:
    profile = reward_kb.get_profile(body.reward_profile_key)
    if profile is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unknown reward profile: {body.reward_profile_key}"
        )
    card = db.exec(select(Card).where(Card.id == card_id, Card.user_id == user_id)).first()
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    card.reward_profile_key = profile.key
    card.reward_profile_source = "user"
    card.updated_at = datetime.now(UTC)
    db.add(card)
    db.flush()

    account = db.exec(
        select(LinkedAccount).where(
            LinkedAccount.id == card.linked_account_id, LinkedAccount.user_id == user_id
        )
    ).first()
    return build_card_out(card, account.institution if account else "", profile)
