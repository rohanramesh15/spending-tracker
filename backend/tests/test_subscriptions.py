"""Pure unit tests for subscription detection (docs/subscriptions-plan.md §1, §2).

No DB, no network — synthetic ``TxnInput`` lists exercise the detector directly. The
endpoint's DB wiring is covered separately in ``test_subscriptions_api.py``.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.services.subscriptions import (
    TxnInput,
    detect_subscriptions,
    next_charge_on,
    normalize_merchant,
    summarize_by_type,
)


def _every(vendor: str, start: date, count: int, step_days: int, amount: int) -> list[TxnInput]:
    """`count` charges `step_days` apart, same amount — a clean fixed-interval history."""
    return [
        TxnInput(
            vendor=vendor, purchased_on=start + timedelta(days=step_days * i), amount_cents=amount
        )
        for i in range(count)
    ]


def _monthly(vendor: str, count: int, amount: int, day: int = 15) -> list[TxnInput]:
    """`count` charges on the same calendar day-of-month (real month lengths)."""
    out = []
    y, m = 2026, 1
    for _ in range(count):
        out.append(TxnInput(vendor=vendor, purchased_on=date(y, m, day), amount_cents=amount))
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def _find(subs, merchant: str):
    return next((s for s in subs if s.merchant == merchant), None)


# --- normalize_merchant (§1.2) ------------------------------------------------------


def test_normalize_strips_noise_and_tlds_and_ref_numbers():
    assert normalize_merchant("NETFLIX.COM 8667") == "netflix"
    assert normalize_merchant("SPOTIFY P0A1B2") == "spotify"
    assert normalize_merchant("Amazon Prime*2X4Y1") == "amazon prime"
    assert normalize_merchant("KROGER #456") == "kroger"


def test_normalize_paypal_gateway_keeps_the_merchant_suffix():
    # The sub is Spotify, not "PayPal" — strip only the gateway prefix.
    assert normalize_merchant("PAYPAL *SPOTIFY") == "spotify"
    assert normalize_merchant("SQ *BLUE BOTTLE") == "blue bottle"


def test_normalize_does_not_clip_a_real_name_that_starts_like_a_gateway():
    # "spotify" starts with "sp" but has no "*" separator, so nothing is stripped.
    assert normalize_merchant("Spotify") == "spotify"


def test_normalize_apple_billing_collapses_to_the_aggregator_sentinel():
    assert normalize_merchant("APPLE.COM/BILL") == "apple.com/bill"
    assert normalize_merchant("Apple.com/Bill 866-712-7753") == "apple.com/bill"


# --- happy paths, one per cadence (§2 tests) ----------------------------------------


def test_monthly_netflix_detected_high_confidence():
    subs = detect_subscriptions(_monthly("NETFLIX.COM", count=12, amount=1599))
    netflix = _find(subs, "netflix")
    assert netflix is not None
    assert netflix.cadence == "monthly"
    assert netflix.amount_cents == 1599
    assert netflix.monthly_cost_cents == 1599
    assert netflix.occurrences == 12
    assert netflix.confidence > 0.85
    # Billed on the 15th → next charge is the next 15th, not last + 30 days.
    assert netflix.next_charge_on == date(2027, 1, 15)


def test_weekly_quarterly_semiannual_bimonthly_annual_happy_paths():
    txns = (
        _every("The Coffee Club", date(2026, 1, 1), count=8, step_days=7, amount=500)  # unknown, 8x
        + _every(
            "Some Membership", date(2026, 1, 1), count=4, step_days=61, amount=2500
        )  # bimonthly
        + _every("Quarterly Box", date(2026, 1, 1), count=4, step_days=91, amount=4000)  # quarterly
        + _every(
            "Car Insurance Co", date(2026, 1, 1), count=3, step_days=182, amount=60000
        )  # semiannual
        + _every("adobe", date(2020, 1, 1), count=3, step_days=365, amount=5999)  # annual, known
    )
    subs = detect_subscriptions(txns)
    cadences = {s.merchant: s.cadence for s in subs}
    assert cadences.get("the coffee club") == "weekly"
    assert cadences.get("some membership") == "bimonthly"
    assert cadences.get("quarterly box") == "quarterly"
    assert cadences.get("car insurance co") == "semiannual"
    assert cadences.get("adobe") == "annual"


def test_monthly_cost_normalization_per_cadence():
    weekly = _find(
        detect_subscriptions(_every("Weekly Thing Co", date(2026, 1, 1), 8, 7, 1000)),
        "weekly thing co",
    )
    assert weekly.monthly_cost_cents == round(1000 * 4.345)  # 4345

    annual = _find(detect_subscriptions(_every("adobe", date(2020, 1, 1), 3, 365, 12000)), "adobe")
    assert annual.monthly_cost_cents == round(12000 / 12)  # 1000


# --- rejection cases ----------------------------------------------------------------


def test_irregular_history_not_detected():
    # Gaps [10, 50] → median 30 (monthly window) but regularity 1 - 20/30 ≈ 0.33 < 0.5.
    txns = [
        TxnInput("Random Store", date(2026, 1, 1), 2000),
        TxnInput("Random Store", date(2026, 1, 11), 2000),
        TxnInput("Random Store", date(2026, 3, 2), 2000),
    ]
    assert detect_subscriptions(txns) == []


def test_two_charge_trap_unknown_merchant_not_detected():
    # Two identical charges 30 days apart at an UNKNOWN merchant must NOT surface (needs 3+).
    txns = _every("Joe's Diner", date(2026, 1, 1), count=2, step_days=30, amount=4200)
    assert detect_subscriptions(txns) == []


def test_two_charges_at_a_known_merchant_are_detected():
    # The same 2-charge shape at a KNOWN merchant surfaces (floor is 2 for known).
    txns = _every("netflix", date(2026, 1, 1), count=2, step_days=30, amount=1599)
    netflix = _find(detect_subscriptions(txns), "netflix")
    assert netflix is not None
    assert netflix.cadence == "monthly"


def test_single_charge_even_known_annual_not_detected():
    # A cadence can't be inferred from one point — hard floor of 2, no exceptions.
    txns = [TxnInput("adobe", date(2026, 3, 1), 5999)]
    assert detect_subscriptions(txns) == []


# --- aggregators (§1.2) -------------------------------------------------------------


def test_apple_billing_blob_is_not_a_confident_subscription():
    # Many unrelated subs bill as APPLE.COM/BILL with different amounts — must not collapse
    # into one high-confidence sub.
    txns = [
        TxnInput("APPLE.COM/BILL", date(2026, 1, 15), 99),
        TxnInput("APPLE.COM/BILL", date(2026, 2, 15), 1499),
        TxnInput("APPLE.COM/BILL", date(2026, 3, 15), 299),
        TxnInput("APPLE.COM/BILL", date(2026, 4, 15), 999),
    ]
    subs = detect_subscriptions(txns)
    assert all("apple" not in s.merchant for s in subs)


def test_paypal_intermediated_spotify_is_grouped_as_spotify():
    txns = _every("PAYPAL *SPOTIFY", date(2026, 1, 1), count=4, step_days=30, amount=1099)
    subs = detect_subscriptions(txns)
    assert _find(subs, "spotify") is not None


# --- amount drift vs variance -------------------------------------------------------


def test_amount_drift_within_tolerance_still_detected_but_variance_lowers_confidence():
    steady = _every("netflix", date(2026, 1, 1), 6, 30, 1599)
    drift = [
        TxnInput("hulu", date(2026, 1, 1), 1299),
        TxnInput("hulu", date(2026, 1, 31), 1299),
        TxnInput("hulu", date(2026, 3, 2), 5000),  # a big outlier charge
        TxnInput("hulu", date(2026, 4, 1), 1299),
        TxnInput("hulu", date(2026, 5, 1), 1299),
        TxnInput("hulu", date(2026, 5, 31), 1299),
    ]
    steady_conf = _find(detect_subscriptions(steady), "netflix").confidence
    drift_conf = _find(detect_subscriptions(drift), "hulu").confidence
    assert drift_conf < steady_conf


# --- next_charge_on stepping --------------------------------------------------------


def test_next_charge_on_steps_by_calendar_period():
    assert next_charge_on(date(2026, 1, 31), "monthly") == date(2026, 2, 28)  # clamps to Feb
    assert next_charge_on(date(2026, 1, 15), "monthly") == date(2026, 2, 15)
    assert next_charge_on(date(2026, 1, 15), "annual") == date(2027, 1, 15)
    assert next_charge_on(date(2026, 1, 1), "weekly") == date(2026, 1, 8)
    assert next_charge_on(date(2026, 1, 1), "quarterly") == date(2026, 4, 1)


def test_results_sorted_by_monthly_cost_desc():
    txns = _every("netflix", date(2026, 1, 1), 6, 30, 500) + _every(
        "spotify", date(2026, 1, 1), 6, 30, 9999
    )
    subs = detect_subscriptions(txns)
    assert [s.merchant for s in subs] == ["spotify", "netflix"]


# --- v5 summary math (§6) -----------------------------------------------------------


def test_summarize_by_type_groups_and_sorts():
    out = summarize_by_type(
        [("streaming", 1599), ("streaming", 1099), ("software", 5000), (None, 200)]
    )
    # Sorted by monthly spend desc; None folds into "other".
    assert out == [
        {"type": "software", "monthly_cents": 5000, "count": 1},
        {"type": "streaming", "monthly_cents": 2698, "count": 2},
        {"type": "other", "monthly_cents": 200, "count": 1},
    ]


def test_summarize_by_type_empty():
    assert summarize_by_type([]) == []
