"""Candidate set for a request (paper §3.1.3). All five rules must hold:

1. technician approved and account active (plus a complete profile)
2. offers the requested category, and the category is active
3. customer point and technician location are inside the active coverage boundary
4. an `available` slot fully contains [start, end)
5. no accepted / in_progress booking of that technician overlaps [start, end)
"""

from django.contrib.gis.db.models import PointField
from django.contrib.gis.db.models.functions import Distance
from django.db.models import Exists, OuterRef, Subquery
from django.db.models.functions import Cast

from apps.bookings.models import RESERVING_STATUSES, Booking
from apps.geo.services import get_active_area, is_inside_coverage
from apps.technicians.models import Availability, AvailabilityState, TechnicianProfile

OUTSIDE_COVERAGE = "outside_coverage"
TECHNICIAN_UNAVAILABLE = "technician_unavailable"
BOOKING_CONFLICT = "booking_conflict"


def reserved_overlap(start, end, technician_ref=None, exclude_booking_id=None):
    qs = Booking.objects.filter(
        technician=technician_ref if technician_ref is not None else OuterRef("pk"),
        status__in=RESERVING_STATUSES,
        start__lt=end,
        end__gt=start,
    )
    if exclude_booking_id is not None:
        qs = qs.exclude(pk=exclude_booking_id)
    return qs


def eligible_technicians(category, point, start, end, *, check_conflicts: bool = True):
    """Queryset of eligible TechnicianProfiles annotated with `distance` and the containing slot."""
    area = get_active_area()
    if area is None or category is None or not category.is_active:
        return TechnicianProfile.objects.none()

    slot = Availability.objects.filter(
        technician=OuterRef("pk"),
        state=AvailabilityState.AVAILABLE,
        start__lte=start,
        end__gte=end,
    ).order_by("start")

    qs = (
        TechnicianProfile.objects.public()                                  # rule 1 + complete profile
        .filter(services__category=category)                                 # rule 2
        .annotate(location_geom=Cast("location", PointField(srid=4326)))
        .filter(location_geom__coveredby=area.geometry)                      # rule 3 (technician side)
        .annotate(
            slot_id=Subquery(slot.values("id")[:1]),
            slot_start=Subquery(slot.values("start")[:1]),
            slot_end=Subquery(slot.values("end")[:1]),
        )
        .filter(slot_id__isnull=False)                                       # rule 4
    )
    if check_conflicts:
        qs = qs.exclude(Exists(reserved_overlap(start, end)))                # rule 5
    return (
        qs.annotate(distance=Distance("location", point))                    # ST_Distance on geography (m)
        .select_related("user")
        .prefetch_related("services__category")
    )


def check_technician(technician, category, point, start, end) -> str | None:
    """Single-technician re-check (booking creation and acceptance). Returns an error code or None."""
    if not is_inside_coverage(point):
        return OUTSIDE_COVERAGE
    base = eligible_technicians(category, point, start, end, check_conflicts=False).filter(pk=technician.pk)
    if not base.exists():
        return TECHNICIAN_UNAVAILABLE
    if reserved_overlap(start, end, technician_ref=technician.pk).exists():
        return BOOKING_CONFLICT
    return None


def distance_km(technician, point) -> float | None:
    row = (
        TechnicianProfile.objects.filter(pk=technician.pk, location__isnull=False)
        .annotate(distance=Distance("location", point))
        .values_list("distance", flat=True)
        .first()
    )
    return row.m / 1000.0 if row is not None else None
