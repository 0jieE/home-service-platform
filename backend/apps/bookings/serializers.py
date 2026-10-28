from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.serializers import CategorySerializer
from apps.geo.fields import LatLngField

from .models import Booking, BookingDispute, BookingStatusHistory, DisputeDecision, Review


class ReviewSerializer(serializers.ModelSerializer):
    booking_id = serializers.IntegerField(read_only=True)
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "booking_id", "rating", "comment", "customer_name", "created_at"]

    def get_customer_name(self, obj) -> str:
        return obj.booking.customer.short_name


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class PartySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    phone = serializers.CharField()


class HistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingStatusHistory
        fields = ["from_status", "to_status", "event", "actor_role", "actor_name", "reason", "created_at"]

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return "System"
        return obj.actor.full_name


class DisputeBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingDispute
        fields = ["id", "status", "reason", "decision", "admin_notes", "created_at", "resolved_at"]


class BookingSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    technician = serializers.SerializerMethodField()
    category = CategorySerializer(read_only=True)
    location = LatLngField(read_only=True)
    conflicts_with_reserved = serializers.SerializerMethodField()
    dispute = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "status", "customer", "technician", "category", "address", "location", "start", "end",
            "notes", "distance_km", "started_at", "completion_requested_at", "completion_notes", "completed_at",
            "confirmed_by", "cancellation_reason", "cancelled_by_role", "decline_reason",
            "conflicts_with_reserved", "dispute", "review", "allowed_actions", "created_at", "updated_at",
        ]

    @extend_schema_field(PartySerializer)
    def get_customer(self, obj):
        c = obj.customer
        return {"id": c.id, "full_name": c.full_name, "phone": c.phone}

    @extend_schema_field(PartySerializer)
    def get_technician(self, obj):
        t = obj.technician
        return {"id": t.id, "full_name": t.user.full_name, "phone": t.phone or t.user.phone}

    def get_conflicts_with_reserved(self, obj) -> bool:
        annotated = getattr(obj, "has_reserved_conflict", None)
        if annotated is not None:
            return bool(annotated) and obj.status == "pending"
        if obj.status != "pending":
            return False
        from apps.recommendations.eligibility import reserved_overlap

        return reserved_overlap(obj.start, obj.end, technician_ref=obj.technician_id).exists()

    @extend_schema_field(DisputeBriefSerializer(allow_null=True))
    def get_dispute(self, obj):
        dispute = obj.latest_dispute
        return DisputeBriefSerializer(dispute).data if dispute else None

    @extend_schema_field(ReviewSerializer(allow_null=True))
    def get_review(self, obj):
        try:
            review = obj.review
        except Review.DoesNotExist:
            return None
        return ReviewSerializer(review).data

    def get_allowed_actions(self, obj) -> list[str]:
        from .services import allowed_actions

        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return []
        return allowed_actions(obj, request.user)


class BookingDetailSerializer(BookingSerializer):
    status_history = HistorySerializer(many=True, read_only=True)

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["status_history"]


class BookingCreateSerializer(serializers.Serializer):
    technician_id = serializers.IntegerField()
    category_id = serializers.IntegerField()
    location = LatLngField()
    address = serializers.CharField(max_length=255)
    start = serializers.DateTimeField()
    end = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class CompletionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class AdminDisputeSerializer(serializers.ModelSerializer):
    booking = BookingSerializer(read_only=True)
    opened_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingDispute
        fields = [
            "id", "booking", "reason", "status", "decision", "admin_notes", "opened_by_name",
            "resolved_by_name", "created_at", "resolved_at",
        ]

    def get_opened_by_name(self, obj) -> str:
        return obj.opened_by.full_name

    def get_resolved_by_name(self, obj) -> str | None:
        return obj.resolved_by.full_name if obj.resolved_by else None


class ResolveDisputeSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=DisputeDecision.choices)
    admin_notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)
