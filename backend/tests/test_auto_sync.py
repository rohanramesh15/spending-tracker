"""Automatic-sync building blocks: the scheduled worker branch and the ITEM-webhook →
account-status mapping. Pure unit tests — the DB and Plaid seam are mocked — so they run
in CI without Postgres or network.
"""

from unittest.mock import patch

from app.models.enums import AccountStatus


def test_worker_scheduled_event_runs_plaid_sync():
    """EventBridge Scheduler (no SQS Records) → runs the Plaid fallback sync."""
    import app.worker as worker

    with patch("app.api.plaid.sync_all_active_items", return_value=3) as m:
        out = worker.handler({"job": "plaid_sync"})
    m.assert_called_once()
    assert out == {"job": "plaid_sync", "synced": 3}


def test_worker_sqs_event_does_not_run_sync():
    """SQS invocation (has Records) drains jobs; it must not trigger the scheduled sync."""
    import app.worker as worker

    with patch("app.api.plaid.sync_all_active_items") as m:
        out = worker.handler({"Records": [{"messageId": "1", "body": '{"type":"noop"}'}]})
    m.assert_not_called()
    assert out == {"batchItemFailures": []}


@patch("app.api.plaid._set_item_status")
def test_item_login_required_sets_needs_reauth(mock_set):
    from app.api.plaid import _handle_item_webhook

    _handle_item_webhook(
        "item-1",
        {"webhook_type": "ITEM", "webhook_code": "ERROR", "error": {"error_code": "ITEM_LOGIN_REQUIRED"}},
    )
    mock_set.assert_called_once_with("item-1", AccountStatus.needs_reauth)


@patch("app.api.plaid._set_item_status")
def test_pending_expiration_sets_needs_reauth(mock_set):
    from app.api.plaid import _handle_item_webhook

    _handle_item_webhook("item-1", {"webhook_type": "ITEM", "webhook_code": "PENDING_EXPIRATION"})
    mock_set.assert_called_once_with("item-1", AccountStatus.needs_reauth)


@patch("app.api.plaid._set_item_status")
def test_permission_revoked_sets_disconnected(mock_set):
    from app.api.plaid import _handle_item_webhook

    _handle_item_webhook("item-1", {"webhook_type": "ITEM", "webhook_code": "USER_PERMISSION_REVOKED"})
    mock_set.assert_called_once_with("item-1", AccountStatus.disconnected)


@patch("app.api.plaid._set_item_status")
def test_informational_item_webhook_is_noop(mock_set):
    """A benign ITEM webhook (e.g. acknowledgement) must not change account status."""
    from app.api.plaid import _handle_item_webhook

    _handle_item_webhook("item-1", {"webhook_type": "ITEM", "webhook_code": "WEBHOOK_UPDATE_ACKNOWLEDGED"})
    mock_set.assert_not_called()
