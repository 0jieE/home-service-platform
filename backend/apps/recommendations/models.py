from django.conf import settings
from django.db import models


class RecommendationSettings(models.Model):
    """Singleton (pk=1). Adjustable during pilot testing, then frozen; every change bumps version."""

    w_p = models.FloatField(default=0.5)
    w_r = models.FloatField(default=0.5)
    d0_km = models.FloatField(default=1.0)
    no_rating_q = models.FloatField(default=0.5)
    version = models.PositiveIntegerField(default=1)
    is_frozen = models.BooleanField(default=False)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = verbose_name_plural = "recommendation settings"

    @classmethod
    def load(cls) -> "RecommendationSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def as_dict(self) -> dict:
        return {
            "w_p": self.w_p,
            "w_r": self.w_r,
            "d0_km": self.d0_km,
            "no_rating_q": self.no_rating_q,
            "version": self.version,
        }

    def __str__(self):
        return f"RecommendationSettings v{self.version}"
