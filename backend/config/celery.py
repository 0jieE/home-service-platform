import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Static beat schedule (no django-celery-beat tables needed).
app.conf.beat_schedule = {
    "expire-stale-pending-bookings": {
        "task": "apps.bookings.tasks.expire_stale_pending_bookings",
        "schedule": crontab(minute="*/15"),
    },
}
