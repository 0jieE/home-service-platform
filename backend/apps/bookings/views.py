from django.db.models import Exists, OuterRef, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminRole, IsBookingParticipant, IsCustomer
from apps.catalog.models import ServiceCategory
from apps.core.timeutils import validate_appointment
from apps.technicians.models import TechnicianProfile

from . import services
from .models import RESERVING_STATUSES, Booking, BookingDispute, BookingStatus, BookingStatusHistory
from .serializers import (
    AdminDisputeSerializer,
    BookingCreateSerializer,
    BookingDetailSerializer,
    BookingSerializer,
    CompletionSerializer,
    ReasonSerializer,
    ResolveDisputeSerializer,
    ReviewCreateSerializer,
    ReviewSerializer,
)


def booking_queryset():
    reserved = Booking.objects.filter(
        technician=OuterRef("technician"),
        status__in=RESERVING_STATUSES,
        start__lt=OuterRef("end"),
        end__gt=OuterRef("start"),
    ).exclude(pk=OuterRef("pk"))
    return (
        Booking.objects.select_related("customer", "technician__user", "category", "review__booking__customer")
        .prefetch_related(
            "disputes",
            Prefetch("status_history", queryset=BookingStatusHistory.objects.select_related("actor")),
        )
        .annotate(has_reserved_conflict=Exists(reserved))
    )


class BookingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsBookingParticipant]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return BookingDetailSerializer
        if self.action == "create":
            return BookingCreateSerializer
        return BookingSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Booking.objects.none()
        qs = booking_queryset()
        user = self.request.user
        if self.action == "list":
            if user.role == Role.CUSTOMER:
                qs = qs.filter(customer=user)
            elif user.role == Role.TECHNICIAN:
                qs = qs.filter(technician__user=user)
            elif user.role != Role.ADMIN:
                qs = qs.none()
            statuses = [part for raw in self.request.query_params.getlist("status") for part in raw.split(",") if part]
            valid = {c for c, _ in BookingStatus.choices}
            statuses = [s for s in statuses if s in valid]
            if statuses:
                qs = qs.filter(status__in=statuses)
            if self.request.query_params.get("upcoming", "").lower() in ("1", "true", "yes"):
                qs = qs.filter(end__gte=timezone.now())
            ordering = self.request.query_params.get("ordering")
            if ordering in ("start", "-start", "created_at", "-created_at"):
                qs = qs.order_by(ordering, "-id")
            else:
                qs = qs.order_by("-created_at", "-id")
        # retrieve/actions: object-level permission returns 403 for non-participants.
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, many=True, description="Repeatable: ?status=pending&status=accepted"),
            OpenApiParameter("upcoming", bool, description="Only bookings that have not ended yet"),
            OpenApiParameter("ordering", str, enum=["start", "-start", "created_at", "-created_at"]),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def _detail(self, booking, http_status=status.HTTP_200_OK):
        fresh = booking_queryset().get(pk=booking.pk)
        return Response(BookingDetailSerializer(fresh, context={"request": self.request}).data, status=http_status)

    @extend_schema(request=BookingCreateSerializer, responses={201: BookingDetailSerializer})
    def create(self, request, *args, **kwargs):
        if not IsCustomer().has_permission(request, self):
            raise PermissionDenied("Only customers can book a technician.")
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        start, end = validate_appointment(data["start"], data.get("end"))
        technician = TechnicianProfile.objects.filter(pk=data["technician_id"]).first()
        category = ServiceCategory.objects.filter(pk=data["category_id"]).first()
        errors = {}
        if technician is None:
            errors["technician_id"] = ["Technician not found."]
        if category is None or not category.is_active:
            errors["category_id"] = ["Unknown or inactive service category."]
        if errors:
            raise ValidationError(errors)
        booking = services.create_booking(
            customer=request.user,
            technician=technician,
            category=category,
            point=data["location"],
            address=data["address"],
            start=start,
            end=end,
            notes=data.get("notes", ""),
        )
        return self._detail(booking, status.HTTP_201_CREATED)

    def _act(self, request, fn, *args, **kwargs):
        booking = self.get_object()  # 404 if missing, 403 if not a participant
        updated = fn(booking.pk, request.user, *args, **kwargs)
        return self._detail(updated)

    @extend_schema(request=None, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        return self._act(request, services.accept)

    @extend_schema(request=ReasonSerializer, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._act(request, services.decline, s.validated_data.get("reason", ""))

    @extend_schema(request=ReasonSerializer, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._act(request, services.cancel, s.validated_data.get("reason", ""))

    @extend_schema(request=None, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        return self._act(request, services.start)

    @extend_schema(request=CompletionSerializer, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"], url_path="request-completion")
    def request_completion(self, request, pk=None):
        s = CompletionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._act(request, services.request_completion, s.validated_data.get("notes", ""))

    @extend_schema(request=None, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"], url_path="confirm-completion")
    def confirm_completion(self, request, pk=None):
        return self._act(request, services.confirm_completion)

    @extend_schema(request=ReasonSerializer, responses=BookingDetailSerializer)
    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        s = ReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        booking = self.get_object()
        services.open_dispute(booking.pk, request.user, s.validated_data.get("reason", ""))
        return self._detail(booking)

    @extend_schema(request=ReviewCreateSerializer, responses={201: ReviewSerializer})
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        s = ReviewCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        booking = self.get_object()
        review = services.add_review(booking.pk, request.user, s.validated_data["rating"], s.validated_data.get("comment", ""))
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class AdminDisputeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminDisputeSerializer

    def get_queryset(self):
        qs = BookingDispute.objects.select_related(
            "opened_by", "resolved_by", "booking__customer", "booking__technician__user", "booking__category",
            "booking__review",
        ).prefetch_related("booking__disputes")
        status_param = self.request.query_params.get("status")
        if status_param in ("open", "resolved"):
            qs = qs.filter(status=status_param)
        return qs.order_by("-created_at", "-id")

    @extend_schema(parameters=[OpenApiParameter("status", str, enum=["open", "resolved"])])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=ResolveDisputeSerializer, responses=AdminDisputeSerializer)
    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        dispute = get_object_or_404(BookingDispute, pk=pk)
        s = ResolveDisputeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.resolve_dispute(dispute.pk, request.user, s.validated_data["decision"], s.validated_data.get("admin_notes", ""))
        fresh = self.get_queryset().get(pk=dispute.pk)
        return Response(AdminDisputeSerializer(fresh, context={"request": request}).data)
