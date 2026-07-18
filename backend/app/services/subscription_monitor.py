"""Subscription-change detection for the daily scan (docs/subscriptions-plan.md §5, v4).

**Pure** — given a before/after snapshot of a user's subscriptions plus ``today`` and the
account's latest successful sync date, it derives the alert deltas. No DB, no network, so the
subtle rules (the likely-cancelled sync gate especially) are fully unit-testable.

Delta kinds:
- ``new`` — an active sub that didn't exist before.
- ``price_increased`` — amount rose beyond tolerance vs the prior stored amount.
- ``upcoming`` — next charge lands within ``UPCOMING_WINDOW_DAYS``.
- ``likely_cancelled`` — an active sub is overdue AND we've actually synced past the deadline
  (so a broken/stale bank link doesn't make every sub look cancelled — the plan §5 gate).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

UPCOMING_WINDOW_DAYS = 3
CANCEL_GRACE_DAYS = 5
PRICE_INCREASE_TOLERANCE_CENTS = 1

_ACTIVE_STATUSES = {"detected", "confirmed"}


@dataclass
class SubSnapshot:
    id: str
    merchant: str
    display_name: str
    amount_cents: int
    cadence: str
    status: str
    last_charged_on: date | None
    next_charge_on: date | None


@dataclass
class SubscriptionDelta:
    kind: str  # new | price_increased | upcoming | likely_cancelled
    subscription_id: str
    merchant: str
    display_name: str
    detail: dict = field(default_factory=dict)


def compute_deltas(
    *,
    before: dict[str, SubSnapshot],
    after: list[SubSnapshot],
    today: date,
    latest_sync: date | None,
) -> list[SubscriptionDelta]:
    """Derive alert deltas from a pre/post-recompute snapshot. ``before`` is keyed by merchant."""
    out: list[SubscriptionDelta] = []
    for s in after:
        if s.status not in _ACTIVE_STATUSES:
            continue
        prev = before.get(s.merchant)

        if prev is None:
            out.append(_delta("new", s, {"amount_cents": s.amount_cents, "cadence": s.cadence}))
        elif s.amount_cents > prev.amount_cents + PRICE_INCREASE_TOLERANCE_CENTS:
            out.append(
                _delta(
                    "price_increased",
                    s,
                    {"old_cents": prev.amount_cents, "new_cents": s.amount_cents},
                )
            )

        if s.next_charge_on is not None:
            days_out = (s.next_charge_on - today).days
            if 0 <= days_out <= UPCOMING_WINDOW_DAYS:
                out.append(
                    _delta(
                        "upcoming",
                        s,
                        {
                            "next_charge_on": s.next_charge_on.isoformat(),
                            "amount_cents": s.amount_cents,
                        },
                    )
                )

        if _is_likely_cancelled(s, today, latest_sync):
            out.append(
                _delta(
                    "likely_cancelled",
                    s,
                    {
                        "last_charged_on": (
                            s.last_charged_on.isoformat() if s.last_charged_on else None
                        )
                    },
                )
            )
    return out


def _delta(kind: str, s: SubSnapshot, detail: dict) -> SubscriptionDelta:
    return SubscriptionDelta(
        kind=kind,
        subscription_id=s.id,
        merchant=s.merchant,
        display_name=s.display_name,
        detail=detail,
    )


def _is_likely_cancelled(s: SubSnapshot, today: date, latest_sync: date | None) -> bool:
    """Overdue past the grace window AND we've synced past that deadline.

    The sync gate is the whole point: without it, a disconnected bank (no charges flowing)
    would make every subscription look cancelled the next morning.
    """
    if s.next_charge_on is None:
        return False
    deadline = s.next_charge_on + timedelta(days=CANCEL_GRACE_DAYS)
    if deadline >= today:
        return False  # not overdue yet
    if latest_sync is None:
        return False  # no sync signal → can't distinguish cancelled from a broken link
    return latest_sync >= deadline


def _fmt_cents(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def notification_for(d: SubscriptionDelta) -> tuple[str, str, str]:
    """Map a delta to ``(dedup_key, title, body)``.

    The dedup key makes the daily scan idempotent: an ``upcoming`` alert fires once per
    billing date, a ``price_increased`` once per new price, ``new``/``likely_cancelled`` once
    per subscription.
    """
    name = d.display_name
    if d.kind == "new":
        return (
            f"new:{d.subscription_id}",
            f"New subscription: {name}",
            f"We spotted a recurring {d.detail.get('cadence', '')} charge.".strip(),
        )
    if d.kind == "price_increased":
        old, new = d.detail["old_cents"], d.detail["new_cents"]
        return (
            f"price:{d.subscription_id}:{new}",
            f"{name} went up in price",
            f"{_fmt_cents(old)} → {_fmt_cents(new)}.",
        )
    if d.kind == "upcoming":
        when = d.detail["next_charge_on"]
        return (
            f"upcoming:{d.subscription_id}:{when}",
            f"{name} renews soon",
            f"Next charge {_fmt_cents(d.detail['amount_cents'])} on {when}.",
        )
    if d.kind == "likely_cancelled":
        return (
            f"cancelled:{d.subscription_id}",
            f"{name} looks cancelled",
            "No recent charge where we expected one — we've marked it cancelled.",
        )
    raise ValueError(f"unknown delta kind: {d.kind}")
