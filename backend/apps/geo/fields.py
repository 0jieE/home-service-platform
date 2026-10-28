"""{"lat", "lng"} <-> GEOS Point (SRID 4326) serializer field."""

from django.contrib.gis.geos import Point
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

POINT_SCHEMA = {
    "type": "object",
    "properties": {"lat": {"type": "number"}, "lng": {"type": "number"}},
    "required": ["lat", "lng"],
}


def make_point(lat: float, lng: float) -> Point:
    return Point(float(lng), float(lat), srid=4326)


def point_to_dict(point):
    if point is None:
        return None
    return {"lat": point.y, "lng": point.x}


@extend_schema_field(POINT_SCHEMA)
class LatLngField(serializers.Field):
    default_error_messages = {
        "invalid": 'Expected an object like {"lat": 7.0083, "lng": 125.0894}.',
        "lat_range": "Latitude must be between -90 and 90.",
        "lng_range": "Longitude must be between -180 and 180.",
    }

    def to_representation(self, value):
        return point_to_dict(value)

    def to_internal_value(self, data):
        if not isinstance(data, dict) or "lat" not in data or "lng" not in data:
            self.fail("invalid")
        try:
            lat, lng = float(data["lat"]), float(data["lng"])
        except (TypeError, ValueError):
            self.fail("invalid")
        if lat != lat or lng != lng:  # NaN
            self.fail("invalid")
        if not -90 <= lat <= 90:
            self.fail("lat_range")
        if not -180 <= lng <= 180:
            self.fail("lng_range")
        return make_point(lat, lng)


class LatLngSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
