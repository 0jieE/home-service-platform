from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.bookings.serializers import ReviewSerializer
from apps.catalog.models import ServiceCategory
from apps.catalog.serializers import CategorySerializer
from apps.geo.fields import LatLngField

from .models import Availability, AvailabilityState, TechnicianProfile


class TechnicianSummarySerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    specializations = serializers.SerializerMethodField()
    location = LatLngField(read_only=True)
    rating_display = serializers.CharField(read_only=True)
    is_profile_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = TechnicianProfile
        fields = [
            "id", "user_id", "full_name", "phone", "specializations", "years_experience", "bio",
            "address", "location", "rating_avg", "rating_count", "rating_display", "is_profile_complete",
        ]

    @extend_schema_field(CategorySerializer(many=True))
    def get_specializations(self, obj):
        return CategorySerializer(obj.active_categories(), many=True).data


class VerificationSummarySerializer(serializers.Serializer):
    credential_type = serializers.CharField()
    outcome = serializers.CharField()
    checked_on = serializers.DateField()


class TechnicianDetailSerializer(TechnicianSummarySerializer):
    verification_summary = serializers.SerializerMethodField()
    recent_reviews = serializers.SerializerMethodField()

    class Meta(TechnicianSummarySerializer.Meta):
        fields = TechnicianSummarySerializer.Meta.fields + ["verification_summary", "recent_reviews"]

    @extend_schema_field(VerificationSummarySerializer(many=True))
    def get_verification_summary(self, obj):
        if obj.application_id is None:
            return []
        records = obj.application.verifications.all().order_by("-checked_on", "-id")
        return VerificationSummarySerializer(records, many=True).data

    @extend_schema_field(ReviewSerializer(many=True))
    def get_recent_reviews(self, obj):
        from apps.bookings.models import Review

        reviews = (
            Review.objects.filter(booking__technician=obj)
            .select_related("booking__customer")
            .order_by("-created_at", "-id")[:5]
        )
        return ReviewSerializer(reviews, many=True).data


class TechnicianMeSerializer(TechnicianDetailSerializer):
    missing_fields = serializers.ListField(child=serializers.CharField(), read_only=True)
    is_approved = serializers.BooleanField(read_only=True)

    class Meta(TechnicianDetailSerializer.Meta):
        fields = TechnicianDetailSerializer.Meta.fields + ["missing_fields", "is_approved"]


class TechnicianMeUpdateSerializer(serializers.ModelSerializer):
    location = LatLngField(required=False, allow_null=True)
    service_category_ids = serializers.ListField(child=serializers.IntegerField(), required=False)

    class Meta:
        model = TechnicianProfile
        fields = ["bio", "phone", "years_experience", "address", "location", "service_category_ids"]
        extra_kwargs = {"years_experience": {"min_value": 0, "max_value": 80}}

    def validate_service_category_ids(self, ids):
        ids = list(dict.fromkeys(ids))
        found = set(ServiceCategory.objects.filter(pk__in=ids, is_active=True).values_list("id", flat=True))
        missing = [i for i in ids if i not in found]
        if missing:
            raise serializers.ValidationError(f"Unknown or inactive categories: {missing}")
        return ids


class AvailabilitySlotSerializer(serializers.ModelSerializer):
    state = serializers.ChoiceField(choices=AvailabilityState.choices, default=AvailabilityState.AVAILABLE)

    class Meta:
        model = Availability
        fields = ["id", "start", "end", "state"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        start = attrs.get("start", getattr(self.instance, "start", None))
        end = attrs.get("end", getattr(self.instance, "end", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end": ["End must be after start."]})
        return attrs


class BulkAvailabilitySerializer(serializers.Serializer):
    slots = AvailabilitySlotSerializer(many=True, allow_empty=False)


class ReservedIntervalSerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()


class PublicAvailabilitySerializer(serializers.Serializer):
    slots = AvailabilitySlotSerializer(many=True)
    reserved = ReservedIntervalSerializer(many=True)


class GenerateAvailabilitySerializer(serializers.Serializer):
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), allow_empty=False,
        help_text="0 = Monday … 6 = Sunday",
    )
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    # 'from' is a Python keyword, so the field is declared below.
    to = serializers.DateField()

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.DateField()
        return fields

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError({"end_time": ["End time must be after start time."]})
        if attrs["to"] < attrs["from"]:
            raise serializers.ValidationError({"to": ["'to' must be on or after 'from'."]})
        if (attrs["to"] - attrs["from"]).days > 92:
            raise serializers.ValidationError({"to": ["At most 92 days at a time."]})
        return attrs
