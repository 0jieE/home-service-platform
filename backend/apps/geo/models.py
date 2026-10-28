from django.contrib.gis.db import models
from django.db.models import Q

PLACEHOLDER_SOURCE = "DEV PLACEHOLDER — not for formal testing"


class CoverageArea(models.Model):
    """Service boundary (Kidapawan City). Exactly one row is active at a time."""

    name = models.CharField(max_length=150)
    geometry = models.MultiPolygonField(srid=4326)
    source = models.CharField(max_length=255)
    version = models.CharField(max_length=50)
    verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["is_active"], condition=Q(is_active=True), name="single_active_coverage"),
        ]

    @property
    def is_placeholder(self) -> bool:
        return (not self.verified) or self.source.startswith("DEV PLACEHOLDER")

    def __str__(self):
        return f"{self.name} v{self.version}{' (active)' if self.is_active else ''}"
