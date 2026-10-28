from django.conf import settings
from django.contrib.gis.db import models
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.db.models import Exists, F, Func, OuterRef, Q


class TsTzRange(Func):
    """tstzrange(start, end, '[)') — used by exclusion constraints and generated columns."""

    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class TechnicianQuerySet(models.QuerySet):
    def with_active_service(self):
        return self.annotate(
            has_active_service=Exists(
                TechnicianService.objects.filter(technician=OuterRef("pk"), category__is_active=True)
            )
        )

    def public(self):
        """Approved + active account + complete profile (location, phone, at least one active service)."""
        return (
            self.with_active_service()
            .filter(
                is_approved=True,
                user__is_active=True,
                user__role="technician",
                location__isnull=False,
                has_active_service=True,
            )
            .exclude(phone="")
        )


class TechnicianProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="technician_profile")
    application = models.OneToOneField(
        "applications.TechnicianApplication",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="technician_profile",
    )
    bio = models.TextField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    years_experience = models.PositiveSmallIntegerField(default=0)
    address = models.CharField(max_length=255, blank=True)
    location = models.PointField(geography=True, srid=4326, null=True, blank=True)
    # Unrounded average of 1–5 ratings; null when there are no reviews yet.
    rating_avg = models.FloatField(null=True, blank=True)
    rating_count = models.PositiveIntegerField(default=0)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TechnicianQuerySet.as_manager()

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"Technician<{self.user.full_name}>"

    @property
    def full_name(self) -> str:
        return self.user.full_name

    @property
    def missing_fields(self) -> list[str]:
        missing = []
        if self.location is None:
            missing.append("location")
        if not self.phone:
            missing.append("phone")
        if not self.services.filter(category__is_active=True).exists():
            missing.append("service_categories")
        return missing

    @property
    def is_profile_complete(self) -> bool:
        return not self.missing_fields

    @property
    def rating_display(self) -> str:
        if not self.rating_count:
            return "No ratings yet"
        noun = "review" if self.rating_count == 1 else "reviews"
        return f"{self.rating_avg:.1f} ({self.rating_count} {noun})"


class TechnicianService(models.Model):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.CASCADE, related_name="services")
    category = models.ForeignKey("catalog.ServiceCategory", on_delete=models.PROTECT, related_name="technician_services")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "category"], name="unique_technician_category")]

    def __str__(self):
        return f"{self.technician_id}:{self.category_id}"


class AvailabilityState(models.TextChoices):
    AVAILABLE = "available", "Available"
    UNAVAILABLE = "unavailable", "Unavailable"


class Availability(models.Model):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.CASCADE, related_name="availability")
    start = models.DateTimeField()
    end = models.DateTimeField()
    state = models.CharField(max_length=16, choices=AvailabilityState.choices, default=AvailabilityState.AVAILABLE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start"]
        verbose_name_plural = "availability"
        indexes = [models.Index(fields=["technician", "start", "end"])]
        constraints = [
            models.CheckConstraint(condition=Q(end__gt=F("start")), name="availability_end_after_start"),
            # Slots of one technician never overlap (any state).
            ExclusionConstraint(
                name="availability_no_overlap",
                expressions=[
                    (TsTzRange("start", "end", RangeBoundary()), RangeOperators.OVERLAPS),
                    ("technician", RangeOperators.EQUAL),
                ],
            ),
        ]

    def __str__(self):
        return f"{self.technician_id} {self.start:%Y-%m-%d %H:%M}–{self.end:%H:%M} {self.state}"
