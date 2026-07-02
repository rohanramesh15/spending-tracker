"""SQS-triggered worker Lambda (plan §4 background jobs).

Idle in Phase 1 but wired from day one (CLAUDE.md phase order). Later consumes
one-message-per-store price jobs, Plaid re-syncs, and recurring recomputes. The API
Lambda enqueues to SQS; this handler drains it. Poison messages go to the DLQ.
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict, _context: object = None) -> dict:
    """Entry point for the SQS event source. Returns batchItemFailures so SQS only
    redrives the messages that actually failed (partial-batch responses)."""
    failures: list[dict[str, str]] = []
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            logger.info("worker received job: %s", body.get("type", "unknown"))
            # Phase 1: no job types yet. Dispatch table added with price/sync jobs.
        except Exception:  # noqa: BLE001 - any failure redrives just this message
            logger.exception("job failed; redriving message")
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
