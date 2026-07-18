"""In-app notifications (docs/subscriptions-plan.md §5, v4).

Read + mark-read for the subscription alerts the daily scan emits. Alerts themselves are
created by the worker (``api.subscriptions.scan_all_subscriptions``), not here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlmodel import Session, select

from app.api.schemas import NotificationOut
from app.core.auth import current_user_id, get_db
from app.models.tables import Notification

router = APIRouter(prefix="/api", tags=["notifications"])


def _out(r: Notification) -> NotificationOut:
    return NotificationOut(
        id=str(r.id),
        kind=str(r.kind),
        subscription_id=str(r.subscription_id) if r.subscription_id else None,
        title=r.title,
        body=r.body,
        read=r.read_at is not None,
        created_at=r.created_at,
    )


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    unread_only: bool = Query(False),
) -> list[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.exec(stmt.order_by(Notification.created_at.desc())).all()
    return [_out(r) for r in rows]


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> NotificationOut:
    row = db.exec(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    ).first()
    if row is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        db.add(row)
        db.flush()
    return _out(row)


@router.post("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> dict:
    rows = db.exec(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    ).all()
    now = datetime.now(UTC)
    for r in rows:
        r.read_at = now
        db.add(r)
    db.flush()
    return {"marked": len(rows)}
