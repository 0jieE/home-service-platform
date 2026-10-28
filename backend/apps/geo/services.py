"""Coverage checks (point-in-polygon with PostGIS ST_Covers) and placeholder boundary."""

from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.db import transaction

from .models import PLACEHOLDER_SOURCE, CoverageArea

# SPEC §7 development placeholder: bounding box lat 6.93–7.12, lng 125.00–125.25.
PLACEHOLDER_BBOX = {"min_lat": 6.93, "max_lat": 7.12, "min_lng": 125.00, "max_lng": 125.25}


def get_active_area() -> CoverageArea | None:
    return CoverageArea.objects.filter(is_active=True).first()


def is_inside_coverage(point: Point) -> bool:
    """True when the active boundary covers the point (boundary edges count as inside)."""
    if point is None:
        return False
    return CoverageArea.objects.filter(is_active=True, geometry__covers=point).exists()


def placeholder_geometry() -> MultiPolygon:
    b = PLACEHOLDER_BBOX
    ring = (
        (b["min_lng"], b["min_lat"]),
        (b["max_lng"], b["min_lat"]),
        (b["max_lng"], b["max_lat"]),
        (b["min_lng"], b["max_lat"]),
        (b["min_lng"], b["min_lat"]),
    )
    return MultiPolygon(Polygon(ring, srid=4326), srid=4326)


@transaction.atomic
def activate_area(*, name: str, geometry: MultiPolygon, source: str, version: str, verified: bool) -> CoverageArea:
    """Deactivate the current boundary and make a new one the single active area."""
    CoverageArea.objects.filter(is_active=True).update(is_active=False)
    return CoverageArea.objects.create(
        name=name, geometry=geometry, source=source, version=version, verified=verified, is_active=True
    )


def ensure_placeholder_area() -> CoverageArea:
    area = get_active_area()
    if area is not None:
        return area
    return activate_area(
        name="Kidapawan City (placeholder)",
        geometry=placeholder_geometry(),
        source=PLACEHOLDER_SOURCE,
        version="dev-0",
        verified=False,
    )
