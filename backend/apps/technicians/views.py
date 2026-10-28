from datetime import datetime, timedelta

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.exceptions import BusinessError
from apps.accounts.permissions import IsTechnician
from apps.bookings.models import RESERVING_STATUSES, Booking, Review
from apps.bookings.serializers import ReviewSerializer
from apps.core.timeutils import date_window, local_tz
from apps.geo.services import is_inside_coverage

from .models import Availability, AvailabilityState, TechnicianProfile, TechnicianService
from .serializers import (
    AvailabilitySlotSerializer,
    BulkAvailabilitySerializer,
    GenerateAvailabilitySerializer,
    PublicAvailabilitySerializer,
    ReservedIntervalSerializer,
    TechnicianDetailSerializer,
    TechnicianMeSerializer,
    TechnicianMeUpdateSerializer,
    TechnicianSummarySerializer,
)

ORDERING_FIELDS = {"rating_avg", "rating_count", "years_experience", "id", "full_name"}
WINDOW_PARAMS = [
    OpenApiParameter("from", str, description="YYYY-MM-DD (default today)"),
    OpenApiParameter("to", str, description="YYYY-MM-DD inclusive (default from + 14 days)"),
]


def _profile_queryset():
    return TechnicianProfile.objects.select_related("user", "application").prefetch_related(
        "services__category", "application__verifications"
    )


def reserved_intervals(technician, start, end):
    return list(
        Booking.objects.filter(technician=technician, status__in=RESERVING_STATUSES, start__lt=end, end__gt=start)
        .order_by("start")
        .values("start", "end")
    )


class TechnicianViewSet(viewsets.ReadOnlyModelViewSet):
    """Discovery: approved, active technicians with complete profiles only."""

    permission_classes = [IsAuthenticated]
    lookup_value_regex = r"\d+"

    def get_serializer_class(self):
        return TechnicianDetailSerializer if self.action == "retrieve" else TechnicianSummarySerializer

    def get_queryset(self):
        qs = _profile_queryset().filter(pk__in=TechnicianProfile.objects.public().values("pk"))
        params = self.request.query_params
        if self.action == "list":
            category = params.get("category")
            if category:
                if not category.isdigit():
                    raise ValidationError({"category": ["Must be a category id."]})
                qs = qs.filter(services__category_id=int(category), services__category__is_active=True)
            search = (params.get("search") or "").strip()
            if search:
                qs = qs.filter(
                    Q(user__first_name__icontains=search)
                    | Q(user__last_name__icontains=search)
                    | Q(bio__icontains=search)
                    | Q(address__icontains=search)
                    | Q(services__category__name__icontains=search)
                ).distinct()
            ordering = params.get("ordering") or "-rating_avg"
            field = ordering.lstrip("-")
            if field not in ORDERING_FIELDS:
                raise ValidationError({"ordering": [f"Use one of: {sorted(ORDERING_FIELDS)} (prefix - for descending)."]})
            if field == "full_name":
                keys = [F("user__first_name"), F("user__last_name")]
            else:
                keys = [F(field)]
            desc = ordering.startswith("-")
            qs = qs.order_by(*[k.desc(nulls_last=True) if desc else k.asc(nulls_last=True) for k in keys], "id")
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("category", int),
            OpenApiParameter("search", str),
            OpenApiParameter("ordering", str, description="rating_avg, rating_count, years_experience, full_name, id; prefix - for desc (default -rating_avg)"),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(parameters=WINDOW_PARAMS, responses=PublicAvailabilitySerializer)
    @action(detail=True, methods=["get"])
    def availability(self, request, pk=None):
        technician = self.get_object()
        start, end = date_window(request.query_params)
        slots = technician.availability.filter(start__lt=end, end__gt=start).order_by("start")
        return Response(
            {
                "slots": AvailabilitySlotSerializer(slots, many=True).data,
                "reserved": ReservedIntervalSerializer(reserved_intervals(technician, start, end), many=True).data,
            }
        )

    @extend_schema(responses=ReviewSerializer(many=True))
    @action(detail=True, methods=["get"])
    def reviews(self, request, pk=None):
        technician = self.get_object()
        qs = Review.objects.filter(booking__technician=technician).select_related("booking__customer").order_by("-created_at", "-id")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(ReviewSerializer(page, many=True).data)


# --- technician self-service ---------------------------------------------

def _my_profile(request) -> TechnicianProfile:
    return get_object_or_404(_profile_queryset(), user=request.user)


class TechnicianMeView(APIView):
    permission_classes = [IsTechnician]

    @extend_schema(responses=TechnicianMeSerializer)
    def get(self, request):
        return Response(TechnicianMeSerializer(_my_profile(request)).data)

    @extend_schema(request=TechnicianMeUpdateSerializer, responses=TechnicianMeSerializer)
    def patch(self, request):
        profile = _my_profile(request)
        serializer = TechnicianMeUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        point = data.get("location")
        if point is not None and not is_inside_coverage(point):
            raise BusinessError("This location is outside Kidapawan City coverage.", "outside_coverage")
        category_ids = data.pop("service_category_ids", None)
        with transaction.atomic():
            for key, value in data.items():
                setattr(profile, key, value)
            profile.save()
            if "phone" in data:
                profile.user.phone = profile.phone
                profile.user.save(update_fields=["phone"])
            if category_ids is not None:
                TechnicianService.objects.filter(technician=profile).exclude(category_id__in=category_ids).delete()
                existing = set(TechnicianService.objects.filter(technician=profile).values_list("category_id", flat=True))
                TechnicianService.objects.bulk_create(
                    [TechnicianService(technician=profile, category_id=cid) for cid in category_ids if cid not in existing]
                )
        return Response(TechnicianMeSerializer(_my_profile(request)).data)


def _overlapping_slots(profile, start, end, exclude_id=None):
    qs = Availability.objects.filter(technician=profile, start__lt=end, end__gt=start)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs


def _guard_reserved(profile, slot, new_start=None, new_end=None, new_state=None, deleting=False):
    """Accepted / in-progress bookings inside the slot must stay covered by an available slot."""
    reserved = Booking.objects.filter(
        technician=profile, status__in=RESERVING_STATUSES, start__lt=slot.end, end__gt=slot.start
    )
    for booking in reserved:
        still_covered = (
            not deleting
            and (new_state or slot.state) == AvailabilityState.AVAILABLE
            and (new_start or slot.start) <= booking.start
            and (new_end or slot.end) >= booking.end
        )
        if not still_covered:
            raise BusinessError(
                "This slot contains an accepted or in-progress booking and cannot be removed or shortened.",
                "booking_conflict",
                status.HTTP_409_CONFLICT,
            )


class MyAvailabilityViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin):
    permission_classes = [IsTechnician]
    serializer_class = AvailabilitySlotSerializer
    pagination_class = None
    lookup_value_regex = r"\d+"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Availability.objects.none()
        return Availability.objects.filter(technician__user=self.request.user).order_by("start")

    @extend_schema(parameters=WINDOW_PARAMS, responses=AvailabilitySlotSerializer(many=True))
    def list(self, request, *args, **kwargs):
        start, end = date_window(request.query_params)
        qs = self.get_queryset().filter(start__lt=end, end__gt=start)
        return Response(AvailabilitySlotSerializer(qs, many=True).data)

    @extend_schema(
        request=AvailabilitySlotSerializer,
        responses={201: AvailabilitySlotSerializer},
        description='Single slot `{start, end, state}` or bulk `{"slots": [...]}` (bulk returns a list).',
    )
    def create(self, request, *args, **kwargs):
        bulk = isinstance(request.data, dict) and "slots" in request.data
        if bulk:
            s = BulkAvailabilitySerializer(data=request.data)
            s.is_valid(raise_exception=True)
            items = s.validated_data["slots"]
        else:
            s = AvailabilitySlotSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            items = [s.validated_data]
        items = sorted(items, key=lambda i: i["start"])
        for a, b in zip(items, items[1:]):
            if b["start"] < a["end"]:
                raise ValidationError({"slots": ["Slots in the request overlap each other."]})
        with transaction.atomic():
            profile = TechnicianProfile.objects.select_for_update().get(user=request.user)
            for item in items:
                if _overlapping_slots(profile, item["start"], item["end"]).exists():
                    raise ValidationError(
                        {"non_field_errors": ["This time overlaps one of your existing slots. Edit that slot instead."]}
                    )
            try:
                created = [Availability.objects.create(technician=profile, **item) for item in items]
            except IntegrityError:
                raise ValidationError({"non_field_errors": ["This time overlaps one of your existing slots."]})
        data = AvailabilitySlotSerializer(created, many=True).data
        return Response(data if bulk else data[0], status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        slot = self.get_object()
        s = AvailabilitySlotSerializer(slot, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        new = s.validated_data
        with transaction.atomic():
            profile = TechnicianProfile.objects.select_for_update().get(pk=slot.technician_id)
            new_start, new_end = new.get("start", slot.start), new.get("end", slot.end)
            if _overlapping_slots(profile, new_start, new_end, exclude_id=slot.pk).exists():
                raise ValidationError({"non_field_errors": ["This time overlaps one of your other slots."]})
            _guard_reserved(profile, slot, new_start, new_end, new.get("state"))
            s.save()
        return Response(AvailabilitySlotSerializer(slot).data)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        slot = self.get_object()
        with transaction.atomic():
            profile = TechnicianProfile.objects.select_for_update().get(pk=slot.technician_id)
            _guard_reserved(profile, slot, deleting=True)
            slot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        request=GenerateAvailabilitySerializer,
        responses=inline_serializer("GenerateResult", {"created": serializers.IntegerField(), "skipped": serializers.IntegerField()}),
    )
    @action(detail=False, methods=["post"])
    def generate(self, request):
        s = GenerateAvailabilitySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        profile = TechnicianProfile.objects.get(user=request.user)
        created, skipped = generate_weekly_slots(profile, **s.validated_data)
        return Response({"created": created, "skipped": skipped}, status=status.HTTP_201_CREATED)


def generate_weekly_slots(profile, *, weekdays, start_time, end_time, to, **kwargs) -> tuple[int, int]:
    """Create one slot per matching day (0 = Monday); skip days that overlap or have already ended."""
    day = kwargs["from"]
    tz = local_tz()
    now = timezone.now()
    created = skipped = 0
    with transaction.atomic():
        TechnicianProfile.objects.select_for_update().filter(pk=profile.pk).first()
        while day <= to:
            if day.weekday() in weekdays:
                start = timezone.make_aware(datetime.combine(day, start_time), tz)
                end = timezone.make_aware(datetime.combine(day, end_time), tz)
                if end <= now or _overlapping_slots(profile, start, end).exists():
                    skipped += 1
                else:
                    Availability.objects.create(technician=profile, start=start, end=end, state=AvailabilityState.AVAILABLE)
                    created += 1
            day += timedelta(days=1)
    return created, skipped
