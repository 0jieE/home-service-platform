import logging

from celery import shared_task

from .services import expire_stale_pending

logger = logging.getLogger(__name__)


@shared_task(name="apps.bookings.tasks.expire_stale_pending_bookings")
def expire_stale_pending_bookings() -> int:
    """Beat: every 15 minutes. Pending bookings whose start has passed -> cancelled ("expired")."""
    count = expire_stale_pending()
    if count:
        logger.info("Expired %d stale pending booking(s)", count)
    return count
