"""Category taxonomy read endpoint (plan §9). The list is seeded per user by the
signup trigger; the frontend uses it for the category picker."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.schemas import CategoryOut
from app.core.auth import current_user_id, get_db
from app.models.tables import Category

router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[CategoryOut]:
    # Explicit user_id filter; RLS is the net, not the filter (CLAUDE.md #3).
    rows = db.exec(
        select(Category)
        .where(Category.user_id == user_id)
        .order_by(Category.is_system, Category.name)
    ).all()
    return [CategoryOut(id=str(c.id), name=c.name, is_system=c.is_system) for c in rows]
