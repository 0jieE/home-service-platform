import json

from django.conf import settings
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminRole
from apps.recommendations.models import RecommendationSettings

from .fields import LatLngSerializer, make_point
from .services import get_active_area, is_inside_coverage


def coverage_payload(area) -> dict:
    return {
        "name": area.name,
        "source": area.source,
        "version": area.version,
        "verified": area.verified,
        "geometry": json.loads(area.geometry.geojson),
    }


CoverageResponse = inline_serializer(
    "Coverage",
    {
        "name": serializers.CharField(),
        "source": serializers.CharField(),
        "version": serializers.CharField(),
        "verified": serializers.BooleanField(),
        "geometry": serializers.JSONField(),
    },
)


class ConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=inline_serializer("Config", {"booking_block_minutes": serializers.IntegerField()}))
    def get(self, request):
        area = get_active_area()
        return Response(
            {
                "booking_block_minutes": settings.BOOKING_BLOCK_MINUTES,
                "slot_step_minutes": settings.SLOT_STEP_MINUTES,
                "timezone": settings.TIME_ZONE,
                "city_center": settings.CITY_CENTER,
                "recommendation_settings": RecommendationSettings.load().as_dict(),
                "coverage": (
                    {"name": area.name, "verified": area.verified, "version": area.version} if area else None
                ),
            }
        )


class CoverageView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=CoverageResponse)
    def get(self, request):
        area = get_active_area()
        if area is None:
            raise NotFound("No active coverage boundary is configured.")
        return Response(coverage_payload(area))


class CoverageCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LatLngSerializer, responses=inline_serializer("CoverageCheck", {"inside": serializers.BooleanField()}))
    def post(self, request):
        s = LatLngSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        point = make_point(s.validated_data["lat"], s.validated_data["lng"])
        return Response({"inside": is_inside_coverage(point)})


class AdminCoverageView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses=CoverageResponse)
    def get(self, request):
        area = get_active_area()
        if area is None:
            raise NotFound("No active coverage boundary is configured.")
        return Response({**coverage_payload(area), "is_placeholder": area.is_placeholder})
