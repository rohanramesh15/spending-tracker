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
    """Entry point for two triggers:

    - **EventBridge Scheduler** (no ``Records``) → run the scheduled job. Today that's the
      Plaid fallback re-sync (a safety net behind the transaction webhooks).
    - **SQS** (has ``Records``) → drain jobs, returning batchItemFailures so only the
      messages that actually failed are redriven (partial-batch responses).
    """
    if "Records" not in event:
        return _run_scheduled(event or {})

    failures: list[dict[str, str]] = []
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            logger.info("worker received job: %s", body.get("type", "unknown"))
            # Phase 5: price-refresh jobs dispatched here.
        except Exception:  # noqa: BLE001 - any failure redrives just this message
            logger.exception("job failed; redriving message")
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}


def _run_scheduled(event: dict) -> dict:
    """Scheduled trigger from EventBridge Scheduler; ``job`` in the payload selects the task."""
    job = event.get("job", "plaid_sync")
    logger.info("scheduled job: %s", job)
    if job == "plaid_sync":
        # Lazy import: keeps SQS-only cold starts from loading the API package.
        from app.api.plaid import sync_all_active_items

        synced = sync_all_active_items()
        logger.info("plaid fallback sync completed for %d item(s)", synced)
        return {"job": job, "synced": synced}
    logger.warning("unknown scheduled job: %s", job)
    return {"job": job, "skipped": True}
