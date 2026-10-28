"""Date/time helpers: Asia/Manila local days, slot alignment, query-param parsing."""

from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers


def local_tz():
    return timezone.get_default_timezone()


def make_aware_local(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return timezone.make_aware(value, local_tz())
    return value


def day_start(d: date) -> datetime:
    return timezone.make_aware(datetime.combine(d, time.min), local_tz())


def parse_date_or_datetime(raw: str | None, *, end_of_day: bool = False) -> datetime | None:
    """'2026-11-03' -> local midnight (or next midnight if end_of_day); ISO datetimes pass through."""
    if not raw:
        return None
    dt = parse_datetime(raw)
    if dt is not None:
        return make_aware_local(dt)
    d = parse_date(raw)
    if d is None:
        raise serializers.ValidationError({"date": [f"Invalid date: {raw!r}. Use YYYY-MM-DD."]})
    return day_start(d + timedelta(days=1)) if end_of_day else day_start(d)


def date_window(params, default_days: int = 14) -> tuple[datetime, datetime]:
    start = parse_date_or_datetime(params.get("from")) or day_start(timezone.localdate())
    end = parse_date_or_datetime(params.get("to"), end_of_day=True) or start + timedelta(days=default_days)
    if end <= start:
        raise serializers.ValidationError({"to": ["'to' must be after 'from'."]})
    if end - start > timedelta(days=92):
        raise serializers.ValidationError({"to": ["The date range can be at most 92 days."]})
    return start, end


def is_aligned(value: datetime, step_minutes: int | None = None) -> bool:
    step = step_minutes or settings.SLOT_STEP_MINUTES
    local = timezone.localtime(value)
    return local.second == 0 and local.microsecond == 0 and (local.hour * 60 + local.minute) % step == 0


def booking_block() -> timedelta:
    return timedelta(minutes=settings.BOOKING_BLOCK_MINUTES)


def validate_appointment(start: datetime, end: datetime | None) -> tuple[datetime, datetime]:
    """Start in the future, on a 30-minute step; end defaults to start + block (SPEC §5)."""
    start = make_aware_local(start)
    errors = {}
    if start <= timezone.now():
        errors["start"] = ["Start time must be in the future."]
    elif not is_aligned(start):
        errors["start"] = [f"Start time must be on a {settings.SLOT_STEP_MINUTES}-minute step (e.g. 9:00, 9:30)."]
    if end is None:
        end = start + booking_block()
    else:
        end = make_aware_local(end)
        if end <= start:
            errors["end"] = ["End time must be after start time."]
        elif not is_aligned(end):
            errors["end"] = [f"End time must be on a {settings.SLOT_STEP_MINUTES}-minute step."]
        elif end - start > timedelta(hours=12):
            errors["end"] = ["An appointment can be at most 12 hours long."]
    if errors:
        raise serializers.ValidationError(errors)
    return start, end


def human_window(start: datetime, end: datetime) -> str:
    """'Nov 3, 9:00–11:00 AM' in local time."""
    s, e = timezone.localtime(start), timezone.localtime(end)

    def clock(dt, with_ampm=True):
        hour = dt.hour % 12 or 12
        text = f"{hour}:{dt.minute:02d}"
        return f"{text} {'AM' if dt.hour < 12 else 'PM'}" if with_ampm else text

    same_half = (s.hour < 12) == (e.hour < 12) and s.date() == e.date()
    first = clock(s, with_ampm=not same_half)
    day = f"{s:%b} {s.day}"
    if s.date() != e.date():
        return f"{day}, {clock(s)} – {e:%b} {e.day}, {clock(e)}"
    return f"{day}, {first}–{clock(e)}"
