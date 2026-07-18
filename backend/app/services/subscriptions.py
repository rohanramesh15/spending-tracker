"""Subscription detection from transaction history (docs/subscriptions-plan.md §1, v1).

**Pure, deterministic, no I/O** — mirrors ``services/categorize.py`` so the whole thing is
unit-testable without a DB or network. The API layer (``api/subscriptions.py``) is the only
place that touches the database; it maps rows into ``TxnInput`` and calls in here.

Subscriptions are **transaction-level** (vendor + date + total), NOT line items. We detect
recurring *merchants* — a different feature from the removed recurring-*items* work.

Key correctness notes carried over from the plan review:
- **Aggregators** (``APPLE.COM/BILL``, ``PAYPAL *…``, ``GOOGLE *…``) are payment
  intermediaries: many unrelated subs bill through them. We strip the gateway prefix and
  keep the real merchant suffix when present; a suffix-less Apple-billing blob is segregated
  and kept OUT of confident detection (you can't tell which sub it is from bank data).
- **The 2-charge trap:** with exactly 2 charges there is one gap, so ``pstdev == 0`` and
  ``regularity == 1.0`` always — the regularity filter is a no-op. So an *unknown* merchant
  needs 3+ charges; a *known* merchant may surface at 2.
- **``next_charge_on`` steps by calendar period** (a monthly sub billed on the 15th predicts
  the next 15th), not ``last + ideal_days`` which drifts a day+ per cycle.

All thresholds are tunable constants — expect to calibrate against real data (plan §7).
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median, pstdev

from app.services.reconcile import normalize_vendor

# --- public types -------------------------------------------------------------------


@dataclass
class TxnInput:
    """What the caller passes in (a transaction row, mapped)."""

    vendor: str
    purchased_on: date
    amount_cents: int


@dataclass
class DetectedSubscription:
    merchant: str  # normalized key (e.g. "netflix")
    display_name: str  # v1: title-cased merchant; v2 LLM-cleans it
    amount_cents: int  # representative (median) charge
    cadence: str  # weekly|biweekly|monthly|bimonthly|quarterly|semiannual|annual
    monthly_cost_cents: int
    occurrences: int
    first_charged_on: date
    last_charged_on: date
    next_charge_on: date
    confidence: float  # 0.0–1.0
    type: str | None = None  # v2 LLM enrichment (streaming|music|software|…); None until enriched


# --- merchant normalization (§1.2) --------------------------------------------------

# Payment intermediary with NO distinguishing suffix. Apple bills almost everything as a
# bare "APPLE.COM/BILL", so its charges can't be split into individual subs from bank data.
APPLE_BILLING = "apple.com/bill"
# Merchants that are really aggregators — segregated and kept out of confident detection.
AGGREGATOR_MERCHANTS = {APPLE_BILLING}

# Gateway prefixes: "PAYPAL *SPOTIFY" -> the sub is "spotify", so strip only the prefix and
# keep the tail. Requires the "*" separator so a bare "paypal" (rare, ambiguous) is left as-is;
# the "*" is also why this can't clip a real name like "spotify" (no separator follows).
_GATEWAY_PREFIX = re.compile(r"^\s*(?:paypal|google|sq|tst)\s*\*+\s*", re.IGNORECASE)
# ACH descriptor noise, e.g. "DES:PAYMENT ID:1234".
_DES_NOISE = re.compile(r"\b(?:des|id|indn|co)\s*:\S*", re.IGNORECASE)
# Common TLDs so "netflix.com" -> "netflix".
_TLD = re.compile(r"\.(?:com|net|org|co|io|tv|app)\b", re.IGNORECASE)
# Any token containing a digit: store numbers, card-auth ids, dates ("SPOTIFY P0A1B2", "#456").
_TOKEN_WITH_DIGIT = re.compile(r"\b\w*\d\w*\b")


def normalize_merchant(vendor: str) -> str:
    """Collapse a raw transaction vendor to a stable merchant key.

    Extends the reconcile vendor normalizer with subscription-specific noise removal:
    gateway prefixes, TLDs, and any ref/auth token that carries a digit. Aggregators with no
    distinguishing suffix collapse to a sentinel (see ``AGGREGATOR_MERCHANTS``).
    """
    v = (vendor or "").casefold()
    if "apple.com/bill" in v or "apple.com bill" in v:
        return APPLE_BILLING
    v = _GATEWAY_PREFIX.sub("", v)  # keep the merchant suffix, drop "paypal *"
    v = _DES_NOISE.sub(" ", v)
    v = _TLD.sub(" ", v)
    v = _TOKEN_WITH_DIGIT.sub(" ", v)  # drop store #s / auth ids / dates
    # Reuse the reconcile base: lowercase, punctuation -> space, drop pure-digit tokens,
    # collapse whitespace. Falling back to the gateway/base string if we stripped everything.
    normalized = normalize_vendor(v)
    return normalized or normalize_vendor(vendor or "")


# --- cadence classification (§1.3) --------------------------------------------------

# (label, ideal_days, min_days, max_days, per_month_factor). Windows are INTENTIONALLY
# non-contiguous: a median gap between windows is ambiguous and returns None rather than
# being forced into the nearest bucket (precision over recall; calibrate in §7).
PERIODS: tuple[tuple[str, float, float, float, float], ...] = (
    ("weekly", 7, 5, 10, 4.345),
    ("biweekly", 14, 11, 18, 2.173),
    ("monthly", 30.4, 25, 38, 1.0),
    ("bimonthly", 61, 50, 74, 0.5),
    ("quarterly", 91.3, 75, 105, 1 / 3),
    ("semiannual", 182, 150, 205, 1 / 6),
    ("annual", 365, 300, 430, 1 / 12),
)

# How to step to the next charge, per cadence. Sub-monthly cadences add fixed days; monthly+
# add calendar months so a "billed on the 15th" sub lands on the next 15th, not last+30d.
_CADENCE_MONTHS = {"monthly": 1, "bimonthly": 2, "quarterly": 3, "semiannual": 6, "annual": 12}
_CADENCE_DAYS = {"weekly": 7, "biweekly": 14}


def classify_cadence(median_gap_days: float) -> tuple[str, float, float, float, float] | None:
    """Return the matching ``PERIODS`` row if the median gap falls in a known window, else None."""
    for period in PERIODS:
        _label, _ideal, lo, hi, _factor = period
        if lo <= median_gap_days <= hi:
            return period
    return None


_PER_MONTH_FACTOR = {label: factor for (label, _i, _lo, _hi, factor) in PERIODS}


def monthly_cost_cents(amount_cents: int, cadence: str) -> int:
    """Normalize a per-charge amount to a monthly-equivalent cost (shared by detection and the
    stored-row read path in v3, so both compute it the same way)."""
    return round(amount_cents * _PER_MONTH_FACTOR.get(cadence, 1.0))


def summarize_by_type(items: list[tuple[str | None, int]]) -> list[dict]:
    """Group ``(type, monthly_cost_cents)`` pairs into per-type totals (v5 insights).

    ``None``/blank types fold into ``"other"``. Returns ``{type, monthly_cents, count}``
    dicts sorted by monthly spend descending. Pure, so the math is unit-testable."""
    agg: dict[str, list[int]] = {}
    for sub_type, cost in items:
        key = (sub_type or "other").strip().lower() or "other"
        bucket = agg.setdefault(key, [0, 0])
        bucket[0] += cost
        bucket[1] += 1
    return sorted(
        ({"type": k, "monthly_cents": v[0], "count": v[1]} for k, v in agg.items()),
        key=lambda x: x["monthly_cents"],
        reverse=True,
    )


def _add_months(d: date, n: int) -> date:
    """Add ``n`` calendar months, clamping to the target month's last day (Jan 31 + 1 -> Feb 28)."""
    total = d.month - 1 + n
    year = d.year + total // 12
    month = total % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def next_charge_on(last: date, cadence: str) -> date:
    """Predict the next charge date by stepping one calendar period from the last charge."""
    if cadence in _CADENCE_DAYS:
        return last + timedelta(days=_CADENCE_DAYS[cadence])
    return _add_months(last, _CADENCE_MONTHS[cadence])


# --- detection (§1.4) ---------------------------------------------------------------

MIN_OCCURRENCES = 2  # absolute floor: a cadence can't be inferred from a single point
MIN_OCCURRENCES_UNKNOWN = 3  # unknown merchants need 3+ (the 2-charge trap)
MIN_REGULARITY = 0.5  # 1 - (pstdev(gaps)/median_gap) must exceed this
SURFACE_CONFIDENCE = 0.55  # default cutoff the endpoint applies

KNOWN_SUBSCRIPTION_MERCHANTS = {
    "netflix",
    "spotify",
    "hulu",
    "disney",
    "hbo",
    "max",
    "youtube premium",
    "amazon prime",
    "prime video",
    "adobe",
    "microsoft",
    "dropbox",
    "github",
    "openai",
    "chatgpt",
    "notion",
    "icloud",
    "audible",
    "patreon",
    "peloton",
    "nytimes",
    # DELIBERATELY EXCLUDED: bare "apple"/"apple.com/bill"/"google"/"amazon"/"paypal" — they
    # are payment aggregators (see AGGREGATOR_MERCHANTS / normalize_merchant), not merchants.
    # Hand-maintained, US-centric, WILL rot — a confidence nudge, never a gate (plan §7).
}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def detect_subscriptions(txns: list[TxnInput]) -> list[DetectedSubscription]:
    """Detect recurring-merchant subscriptions, sorted by monthly cost descending.

    Confidence is a weighted blend of gap regularity, amount consistency, occurrence count,
    and whether the merchant is on the known list. The caller filters on confidence.
    """
    groups: dict[str, list[TxnInput]] = {}
    for t in txns:
        groups.setdefault(normalize_merchant(t.vendor), []).append(t)

    out: list[DetectedSubscription] = []
    for merchant, items in groups.items():
        if merchant in AGGREGATOR_MERCHANTS:
            continue  # un-itemizable aggregator blob — keep out of confident detection (§1.2)

        known = merchant in KNOWN_SUBSCRIPTION_MERCHANTS
        floor = MIN_OCCURRENCES if known else MIN_OCCURRENCES_UNKNOWN
        if len(items) < floor:
            continue

        items.sort(key=lambda t: t.purchased_on)
        dates = [t.purchased_on for t in items]
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        median_gap = median(gaps)
        if median_gap <= 0:  # same-day duplicates aren't a cadence
            continue

        period = classify_cadence(median_gap)
        if period is None:
            continue
        label = period[0]

        regularity = _clamp(1 - (pstdev(gaps) / median_gap))
        if regularity < MIN_REGULARITY:
            continue

        amounts = [t.amount_cents for t in items]
        amount = int(round(median(amounts)))
        amount_consistency = _clamp(1 - min(1, pstdev(amounts) / amount)) if amount else 0.0
        occurrences = len(items)

        confidence = _clamp(
            0.35 * regularity
            + 0.25 * amount_consistency
            + 0.20 * min(1, (occurrences - 1) / 3)
            + 0.20 * (1.0 if known else 0.0)
        )

        out.append(
            DetectedSubscription(
                merchant=merchant,
                display_name=merchant.title(),
                amount_cents=amount,
                cadence=label,
                monthly_cost_cents=monthly_cost_cents(amount, label),
                occurrences=occurrences,
                first_charged_on=dates[0],
                last_charged_on=dates[-1],
                next_charge_on=next_charge_on(dates[-1], label),
                confidence=round(confidence, 3),
            )
        )

    out.sort(key=lambda s: s.monthly_cost_cents, reverse=True)
    return out
