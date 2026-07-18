"""SQS-triggered worker Lambda (plan §4 background jobs).

Wired from day one (CLAUDE.md phase order). Runs the scheduled Plaid fallback re-sync, and
drains any SQS background jobs the API Lambda enqueues. Poison messages go to the DLQ.
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
            # Background SQS jobs are dispatched here.
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
    if job == "rewards_backfill":
        # Rewards v2 one-off: re-attribute historical transactions to their card + PFC.
        from app.api.plaid import backfill_transaction_cards

        synced = backfill_transaction_cards()
        logger.info("rewards backfill re-synced %d item(s)", synced)
        return {"job": job, "synced": synced}
    if job == "reward_profiles_refresh":
        # Rewards v3: fetch + cache rates for cards outside the curated seed (no-op w/o Tavily).
        from app.services.reward_refresh import refresh_unmatched_cards

        assigned = refresh_unmatched_cards()
        logger.info("reward-profile refresh matched %d card(s)", assigned)
        return {"job": job, "assigned": assigned}
    logger.warning("unknown scheduled job: %s", job)
    return {"job": job, "skipped": True}
