"""Pure unit tests for the subscription monitor deltas (docs/subscriptions-plan.md §5, v4).

No DB — snapshots go straight into ``compute_deltas``. The star is the likely-cancelled sync
gate: overdue alone is NOT enough; we must have synced past the deadline.
"""

from __future__ import annotations

from datetime import date

from app.services.subscription_monitor import (
    SubscriptionDelta,
    SubSnapshot,
    compute_deltas,
    notification_for,
)

TODAY = date(2026, 7, 18)


def _snap(
    merchant: str,
    amount: int,
    *,
    status: str = "detected",
    last: date | None = None,
    next_: date | None = None,
    cadence: str = "monthly",
) -> SubSnapshot:
    return SubSnapshot(
        id=merchant,
        merchant=merchant,
        display_name=merchant.title(),
        amount_cents=amount,
        cadence=cadence,
        status=status,
        last_charged_on=last,
        next_charge_on=next_,
    )


def _kinds(deltas: list[SubscriptionDelta]) -> set[str]:
    return {d.kind for d in deltas}


def test_new_subscription_is_flagged():
    after = [_snap("netflix", 1599, next_=date(2026, 8, 1))]
    deltas = compute_deltas(before={}, after=after, today=TODAY, latest_sync=None)
    assert _kinds(deltas) == {"new"}


def test_price_increase_is_flagged_but_not_new():
    before = {"netflix": _snap("netflix", 1599)}
    after = [_snap("netflix", 1799, next_=date(2026, 8, 1))]
    deltas = compute_deltas(before=before, after=after, today=TODAY, latest_sync=None)
    assert _kinds(deltas) == {"price_increased"}
    d = next(x for x in deltas if x.kind == "price_increased")
    assert d.detail == {"old_cents": 1599, "new_cents": 1799}


def test_upcoming_within_window_only():
    before = {"netflix": _snap("netflix", 1599)}
    within = compute_deltas(
        before=before,
        after=[_snap("netflix", 1599, next_=date(2026, 7, 20))],  # 2 days out
        today=TODAY,
        latest_sync=None,
    )
    assert "upcoming" in _kinds(within)

    outside = compute_deltas(
        before=before,
        after=[_snap("netflix", 1599, next_=date(2026, 7, 25))],  # 7 days out
        today=TODAY,
        latest_sync=None,
    )
    assert "upcoming" not in _kinds(outside)


def test_inactive_status_yields_no_deltas():
    for status in ("dismissed", "cancelled"):
        after = [_snap("netflix", 1599, status=status, next_=date(2026, 7, 20))]
        assert compute_deltas(before={}, after=after, today=TODAY, latest_sync=None) == []


def test_likely_cancelled_requires_syncing_past_the_deadline():
    # Overdue: next charge was 2026-06-01, grace 5 → deadline 2026-06-06, well before today.
    before = {"gym": _snap("gym", 5000)}
    overdue = _snap("gym", 5000, status="confirmed", last=date(2026, 5, 1), next_=date(2026, 6, 1))

    # No sync signal → cannot conclude cancelled (could be a broken link).
    assert "likely_cancelled" not in _kinds(
        compute_deltas(before=before, after=[overdue], today=TODAY, latest_sync=None)
    )
    # Stale link: last sync BEFORE the deadline → still cannot conclude.
    assert "likely_cancelled" not in _kinds(
        compute_deltas(before=before, after=[overdue], today=TODAY, latest_sync=date(2026, 6, 3))
    )
    # Synced PAST the deadline and no charge appeared → genuinely cancelled.
    assert "likely_cancelled" in _kinds(
        compute_deltas(before=before, after=[overdue], today=TODAY, latest_sync=date(2026, 7, 10))
    )


def test_not_overdue_is_not_cancelled_even_when_synced():
    before = {"gym": _snap("gym", 5000)}
    future = _snap("gym", 5000, status="confirmed", next_=date(2026, 7, 25))  # not yet due
    assert "likely_cancelled" not in _kinds(
        compute_deltas(before=before, after=[future], today=TODAY, latest_sync=date(2026, 7, 18))
    )


def test_notification_dedup_keys_and_formatting():
    new = notification_for(
        SubscriptionDelta("new", "id1", "netflix", "Netflix", {"cadence": "monthly"})
    )
    assert new[0] == "new:id1" and "Netflix" in new[1]

    price = notification_for(
        SubscriptionDelta(
            "price_increased", "id1", "netflix", "Netflix", {"old_cents": 1599, "new_cents": 1799}
        )
    )
    assert price[0] == "price:id1:1799"
    assert "$15.99" in price[2] and "$17.99" in price[2]

    upcoming = notification_for(
        SubscriptionDelta(
            "upcoming",
            "id1",
            "netflix",
            "Netflix",
            {"next_charge_on": "2026-08-01", "amount_cents": 1599},
        )
    )
    assert upcoming[0] == "upcoming:id1:2026-08-01"

    cancelled = notification_for(
        SubscriptionDelta("likely_cancelled", "id1", "netflix", "Netflix", {})
    )
    assert cancelled[0] == "cancelled:id1"
