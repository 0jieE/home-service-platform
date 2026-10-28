from django.conf import settings
from django.db import models


class ApplicationStatus(models.TextChoices):
    SUBMITTED = "submitted", "Submitted"
    UNDER_REVIEW = "under_review", "Under review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class TechnicianApplication(models.Model):
    """Recorded by an administrator after the applicant submits documents in person."""

    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    requested_categories = models.ManyToManyField("catalog.ServiceCategory", related_name="applications", blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=16, choices=ApplicationStatus.choices, default=ApplicationStatus.SUBMITTED, db_index=True
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    submitted_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return f"Application<{self.full_name}, {self.status}>"


class VerificationMethod(models.TextChoices):
    OFFICIAL_PORTAL = "official_portal", "Official verification portal"
    ISSUING_INSTITUTION = "issuing_institution", "Issuing institution"
    IN_PERSON_INSPECTION = "in_person_inspection", "In-person inspection"


class VerificationOutcome(models.TextChoices):
    VERIFIED = "verified", "Verified"
    NOT_VERIFIED = "not_verified", "Not verified"
    INCONCLUSIVE = "inconclusive", "Inconclusive"


class VerificationRecord(models.Model):
    application = models.ForeignKey(TechnicianApplication, on_delete=models.CASCADE, related_name="verifications")
    credential_type = models.CharField(max_length=150)
    method = models.CharField(max_length=32, choices=VerificationMethod.choices)
    outcome = models.CharField(max_length=16, choices=VerificationOutcome.choices)
    checked_on = models.DateField()
    checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-checked_on", "-id"]

    def __str__(self):
        return f"{self.credential_type}: {self.outcome}"
