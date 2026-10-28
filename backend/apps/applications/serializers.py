from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import ServiceCategory
from apps.catalog.serializers import CategorySerializer

from .models import ApplicationStatus, TechnicianApplication, VerificationRecord


class VerificationSerializer(serializers.ModelSerializer):
    checked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VerificationRecord
        fields = ["id", "credential_type", "method", "outcome", "checked_on", "notes", "checked_by_name", "created_at"]
        read_only_fields = ["id", "checked_by_name", "created_at"]

    def get_checked_by_name(self, obj) -> str | None:
        return obj.checked_by.full_name if obj.checked_by else None


class ApplicationSerializer(serializers.ModelSerializer):
    requested_categories = CategorySerializer(many=True, read_only=True)
    requested_category_ids = serializers.PrimaryKeyRelatedField(
        source="requested_categories",
        queryset=ServiceCategory.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )
    verifications = VerificationSerializer(many=True, read_only=True)
    decided_by_name = serializers.SerializerMethodField()
    technician_profile_id = serializers.SerializerMethodField()
    account_created = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=ApplicationStatus.choices, required=False)

    class Meta:
        model = TechnicianApplication
        fields = [
            "id", "first_name", "last_name", "email", "phone", "address", "requested_categories",
            "requested_category_ids", "notes", "status", "submitted_at", "decided_at", "decided_by_name",
            "rejection_reason", "verifications", "technician_profile_id", "account_created",
        ]
        read_only_fields = ["id", "submitted_at", "decided_at", "rejection_reason"]

    def _profile(self, obj):
        return getattr(obj, "technician_profile", None)

    def get_decided_by_name(self, obj) -> str | None:
        return obj.decided_by.full_name if obj.decided_by else None

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_technician_profile_id(self, obj):
        profile = self._profile(obj)
        return profile.id if profile else None

    def get_account_created(self, obj) -> bool:
        return self._profile(obj) is not None

    def validate_email(self, value):
        return value.strip().lower()

    def validate_status(self, value):
        # Only the review step is set by PATCH; approve/reject have their own endpoints.
        current = self.instance.status if self.instance else None
        if self.instance is None:
            if value != ApplicationStatus.SUBMITTED:
                raise serializers.ValidationError("New applications start as 'submitted'.")
            return value
        if value == current:
            return value
        if value == ApplicationStatus.UNDER_REVIEW and current == ApplicationStatus.SUBMITTED:
            return value
        raise serializers.ValidationError(
            "Status can only be changed to 'under_review' here; use approve / reject for decisions."
        )


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)
