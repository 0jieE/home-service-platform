from django.conf import settings
from django.contrib.gis.db import models
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db.models import F, Q

from apps.technicians.models import TsTzRange


class BookingStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    CANCELLED = "cancelled", "Cancelled"
    IN_PROGRESS = "in_progress", "In progress"
    COMPLETED = "completed", "Completed"


RESERVING_STATUSES = [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS]
ACTIVE_STATUSES = [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS]


class ActorRole(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    TECHNICIAN = "technician", "Technician"
    ADMIN = "admin", "Administrator"
    SYSTEM = "system", "System"


class Booking(models.Model):
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bookings")
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT, related_name="bookings")
    category = models.ForeignKey("catalog.ServiceCategory", on_delete=models.PROTECT, related_name="bookings")
    address = models.CharField(max_length=255)
    location = models.PointField(geography=True, srid=4326)
    start = models.DateTimeField()
    end = models.DateTimeField()
    # Generated tstzrange [start, end) — backs the no-overlap exclusion constraint.
    period = models.GeneratedField(
        expression=TsTzRange("start", "end", RangeBoundary()),
        output_field=DateTimeRangeField(),
        db_persist=True,
    )
    status = models.CharField(
        max_length=16, choices=BookingStatus.choices, default=BookingStatus.PENDING, db_index=True
    )
    notes = models.TextField(blank=True)
    distance_km = models.FloatField(null=True, blank=True)  # straight-line, at booking time
    started_at = models.DateTimeField(null=True, blank=True)
    completion_requested_at = models.DateTimeField(null=True, blank=True)
    completion_notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.CharField(max_length=16, blank=True, null=True)  # "customer" | "admin"
    cancellation_reason = models.TextField(blank=True, null=True)
    cancelled_by_role = models.CharField(max_length=16, choices=ActorRole.choices, blank=True, null=True)
    decline_reason = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["technician", "status", "start"])]
        constraints = [
            models.CheckConstraint(condition=Q(end__gt=F("start")), name="booking_end_after_start"),
            ExclusionConstraint(
                name="booking_no_overlap_reserved",
                expressions=[("technician", RangeOperators.EQUAL), ("period", RangeOperators.OVERLAPS)],
                condition=Q(status__in=["accepted", "in_progress"]),
            ),
        ]

    def __str__(self):
        return f"Booking#{self.pk} {self.status}"

    @property
    def open_dispute(self):
        return next((d for d in self.disputes.all() if d.status == DisputeStatus.OPEN), None)

    @property
    def latest_dispute(self):
        disputes = sorted(self.disputes.all(), key=lambda d: (d.created_at, d.id), reverse=True)
        return disputes[0] if disputes else None


class BookingStatusHistory(models.Model):
    """Append-only audit trail; never deleted (PROTECT)."""

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="status_history")
    from_status = models.CharField(max_length=16, choices=BookingStatus.choices, null=True, blank=True)
    to_status = models.CharField(max_length=16, choices=BookingStatus.choices)
    event = models.CharField(max_length=32)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actor_role = models.CharField(max_length=16, choices=ActorRole.choices)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "booking status history"


class DisputeStatus(models.TextChoices):
    OPEN = "open", "Open"
    RESOLVED = "resolved", "Resolved"


class DisputeDecision(models.TextChoices):
    COMPLETED = "completed", "Mark completed"
    CANCELLED = "cancelled", "Cancel booking"
    RETURN_IN_PROGRESS = "return_in_progress", "Return to in progress"


class BookingDispute(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="disputes")
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    reason = models.TextField()
    status = models.CharField(max_length=16, choices=DisputeStatus.choices, default=DisputeStatus.OPEN, db_index=True)
    decision = models.CharField(max_length=32, choices=DisputeDecision.choices, null=True, blank=True)
    admin_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["booking"], condition=Q(status="open"), name="one_open_dispute_per_booking"),
        ]


class Review(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="review")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(condition=Q(rating__gte=1) & Q(rating__lte=5), name="review_rating_1_5"),
        ]
