"""booking.updated WebSocket events, sent only after the DB transaction commits."""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from .consumers import ADMINS_GROUP, user_group

logger = logging.getLogger(__name__)

EVENTS = {
    "created", "accepted", "declined", "cancelled", "started", "completion_requested",
    "completed", "disputed", "dispute_resolved", "reviewed",
}


def build_payload(booking, event: str, previous_status, actor_role: str) -> dict:
    return {
        "type": "booking.updated",
        "booking_id": booking.id,
        "status": booking.status,
        "previous_status": previous_status,
        "event": event,
        "actor_role": actor_role,
        "at": timezone.localtime().isoformat(timespec="seconds"),
    }


def _send(groups: list[str], payload: dict) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    for group in groups:
        try:
            async_to_sync(layer.group_send)(group, {"type": "booking.updated", "payload": payload})
        except Exception:  # realtime is best-effort; clients also poll/refetch
            logger.warning("Could not push %s to %s", payload.get("event"), group, exc_info=True)


def push_booking_event(booking, event: str, previous_status, actor_role: str) -> None:
    assert event in EVENTS, event
    payload = build_payload(booking, event, previous_status, actor_role)
    groups = [user_group(booking.customer_id), user_group(booking.technician.user_id), ADMINS_GROUP]
    transaction.on_commit(lambda: _send(groups, payload))
