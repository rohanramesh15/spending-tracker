"""Apple Card CSV import parser (plan §6.7, §11; user-flow §9).

The permanent manual fallback for Apple Card (until/unless the iOS agent of §11 is built).
Apple Card's statement export (Wallet → Card → Statements → Export Transactions) has:

    Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)

We import PURCHASES only — payments to the card and credits/refunds are skipped. Header
matching is tolerant (case/space-insensitive, common variants) because exports vary a bit.
This module is pure/DB-free and unit-tested; the endpoint wires the rows through the one
ingest door.
"""

from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

_DATE_FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y")


@dataclass(frozen=True)
class ImportedRow:
    external_id: str  # stable dedupe key (re-importing the same CSV is idempotent)
    vendor: str
    purchased_on: date
    total_cents: int


def parse_apple_card_csv(raw: bytes) -> tuple[list[ImportedRow], int]:
    """Return (purchase rows, skipped count). Raises ValueError if it isn't a usable CSV."""
    try:
        text = raw.decode("utf-8-sig")  # utf-8-sig tolerates a leading BOM
    except UnicodeDecodeError as exc:
        raise ValueError("Couldn't read this file as text (expected a CSV)") from exc

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames
    if not headers:
        raise ValueError("Empty or unrecognized CSV")

    date_col = _find(headers, "transaction", "date") or _find(headers, "date")
    merchant_col = _find(headers, "merchant") or _find(headers, "description")
    amount_col = _find(headers, "amount")
    type_col = _find(headers, "type")
    desc_col = _find(headers, "description")
    if not (date_col and merchant_col and amount_col):
        raise ValueError(
            "This doesn't look like an Apple Card export (missing date/merchant/amount)"
        )

    rows: list[ImportedRow] = []
    skipped = 0
    for r in reader:
        row_type = _norm(r.get(type_col, "")) if type_col else ""
        purchased_on = _parse_date(r.get(date_col, ""))
        cents = _parse_cents(r.get(amount_col, ""))
        description = (r.get(desc_col) or "").strip() if desc_col else ""
        vendor = (r.get(merchant_col) or "").strip() or description

        # Purchases only: trust an explicit Type column; otherwise treat a positive charge
        # as a purchase (payments/credits are negative on the Apple Card export).
        is_purchase = row_type == "purchase" if row_type else (cents is not None and cents > 0)
        if not is_purchase or purchased_on is None or cents is None or cents <= 0 or not vendor:
            skipped += 1
            continue

        key = f"{purchased_on.isoformat()}|{vendor}|{cents}|{description}"
        external_id = "applecsv:" + hashlib.sha256(key.encode()).hexdigest()[:32]
        rows.append(
            ImportedRow(
                external_id=external_id,
                vendor=vendor,
                purchased_on=purchased_on,
                total_cents=cents,
            )
        )
    return rows, skipped


def _norm(header: str) -> str:
    return header.strip().lower()


def _find(headers: list[str], *needles: str) -> str | None:
    """Return the first header whose normalized form contains all needles."""
    for h in headers:
        n = _norm(h)
        if all(x in n for x in needles):
            return h
    return None


def _parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_cents(value: str) -> int | None:
    value = value.strip().replace("$", "").replace(",", "")
    if not value:
        return None
    try:
        return int((Decimal(value) * 100).to_integral_value())
    except (InvalidOperation, ValueError):
        return None
