from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.exceptions import BusinessError
from apps.accounts.permissions import IsAdminRole, IsCustomer
from apps.catalog.models import ServiceCategory
from apps.catalog.serializers import CategorySerializer
from apps.core.timeutils import human_window, validate_appointment
from apps.geo.fields import make_point, point_to_dict
from apps.geo.services import is_inside_coverage
from apps.technicians.models import TechnicianProfile
from apps.technicians.serializers import TechnicianSummarySerializer

from . import engine
from .eligibility import eligible_technicians
from .models import RecommendationSettings


class RecommendationQuerySerializer(serializers.Serializer):
    category = serializers.IntegerField()
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    start = serializers.DateTimeField()
    end = serializers.DateTimeField(required=False)

    def validate_category(self, value):
        category = ServiceCategory.objects.filter(pk=value, is_active=True).first()
        if category is None:
            raise serializers.ValidationError("Unknown or inactive service category.")
        return category


class RecSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecommendationSettings
        fields = ["w_p", "w_r", "d0_km", "no_rating_q", "version", "is_frozen", "updated_at"]
        read_only_fields = ["version", "updated_at"]
        extra_kwargs = {
            "w_p": {"min_value": 0.0, "max_value": 1.0},
            "w_r": {"min_value": 0.0, "max_value": 1.0},
            "no_rating_q": {"min_value": 0.0, "max_value": 1.0},
            "d0_km": {"min_value": 0.01, "max_value": 100.0},
        }

    def validate(self, attrs):
        w_p = attrs.get("w_p", self.instance.w_p if self.instance else 0.5)
        w_r = attrs.get("w_r", self.instance.w_r if self.instance else 0.5)
        if abs((w_p + w_r) - 1.0) > 1e-9:
            raise serializers.ValidationError({"non_field_errors": ["w_p + w_r must equal 1."]})
        return attrs


def _empty_reason(category, start, end) -> dict:
    window = human_window(start, end)
    offers = TechnicianProfile.objects.public().filter(services__category=category).exists()
    if not offers:
        message = f"No approved technician currently offers {category.name}. Try another service."
    else:
        message = f"No technician offering {category.name} is free on {window}. Try another time."
    return {"code": "no_eligible_technicians", "message": message}


class RecommendationView(APIView):
    permission_classes = [IsCustomer]

    @extend_schema(
        parameters=[
            OpenApiParameter("category", int, required=True),
            OpenApiParameter("lat", float, required=True),
            OpenApiParameter("lng", float, required=True),
            OpenApiParameter("start", str, required=True, description="ISO 8601, future, on a 30-minute step"),
            OpenApiParameter("end", str, description="Defaults to start + booking_block_minutes"),
        ],
        responses=inline_serializer(
            "RecommendationResponse",
            {
                "query": serializers.DictField(),
                "settings": serializers.DictField(),
                "results": serializers.ListField(child=serializers.DictField()),
                "empty_reason": serializers.DictField(allow_null=True),
            },
        ),
    )
    def get(self, request):
        params = request.query_params.dict()
        for key in ("start", "end"):
            # An unencoded "+08:00" offset arrives as " 08:00".
            if params.get(key):
                params[key] = params[key].replace(" ", "+")
        q = RecommendationQuerySerializer(data=params)
        q.is_valid(raise_exception=True)
        data = q.validated_data
        category = data["category"]
        start, end = validate_appointment(data["start"], data.get("end"))
        point = make_point(data["lat"], data["lng"])
        if not is_inside_coverage(point):
            raise BusinessError("This location is outside Kidapawan City coverage.", "outside_coverage")

        rec_settings = RecommendationSettings.load()
        scoring = engine.ScoringSettings(
            w_p=rec_settings.w_p, w_r=rec_settings.w_r, d0_km=rec_settings.d0_km, no_rating_q=rec_settings.no_rating_q
        )
        candidates = [
            engine.Candidate(
                id=t.id,
                distance_km=t.distance.m / 1000.0,
                rating_avg=t.rating_avg,
                rating_count=t.rating_count,
                payload=t,
            )
            for t in eligible_technicians(category, point, start, end)
        ]
        ranked = engine.recommend(candidates, scoring)
        results = []
        for sc in ranked:
            t = sc.candidate.payload
            results.append(
                {
                    "rank": sc.rank,
                    "technician": TechnicianSummarySerializer(t).data,
                    "distance_km": sc.distance_km,
                    "proximity_score": sc.proximity_score,
                    "rating_score": sc.rating_score,
                    "score": sc.score,
                    "has_ratings": sc.has_ratings,
                    "availability": {
                        "slot_id": t.slot_id,
                        "start": serializers.DateTimeField().to_representation(t.slot_start),
                        "end": serializers.DateTimeField().to_representation(t.slot_end),
                    },
                }
            )
        dt = serializers.DateTimeField()
        return Response(
            {
                "query": {
                    "category": CategorySerializer(category).data,
                    "location": point_to_dict(point),
                    "start": dt.to_representation(start),
                    "end": dt.to_representation(end),
                },
                "settings": rec_settings.as_dict(),
                "results": results,
                "empty_reason": None if results else _empty_reason(category, start, end),
            }
        )


PARAM_FIELDS = ("w_p", "w_r", "d0_km", "no_rating_q")


class AdminRecommendationSettingsView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses=RecSettingsSerializer)
    def get(self, request):
        return Response(RecSettingsSerializer(RecommendationSettings.load()).data)

    @extend_schema(request=RecSettingsSerializer, responses=RecSettingsSerializer)
    def patch(self, request):
        obj = RecommendationSettings.load()
        s = RecSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        unfreezing = data.get("is_frozen") is False
        if obj.is_frozen and not unfreezing:
            raise BusinessError(
                "Recommendation settings are frozen. Unfreeze them first (is_frozen: false).", "settings_frozen", 409
            )
        changed = any(f in data and getattr(obj, f) != data[f] for f in PARAM_FIELDS)
        for key, value in data.items():
            setattr(obj, key, value)
        if changed:
            obj.version += 1
        obj.updated_by = request.user
        obj.save()
        return Response(RecSettingsSerializer(obj).data)
