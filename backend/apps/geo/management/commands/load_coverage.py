"""Replace the active coverage boundary with a polygon from a GeoJSON file.

    python manage.py load_coverage kidapawan.geojson --name "Kidapawan City" \
        --source "PSA/NAMRIA admin level 3 (HDX)" --version 2023 --verified
"""

import json
from pathlib import Path

from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Polygon
from django.core.management.base import BaseCommand, CommandError

from apps.geo.services import activate_area


def _geometries(doc: dict):
    kind = doc.get("type")
    if kind == "FeatureCollection":
        for feature in doc.get("features", []):
            yield from _geometries(feature)
    elif kind == "Feature":
        if doc.get("geometry"):
            yield doc["geometry"]
    elif kind in ("Polygon", "MultiPolygon", "GeometryCollection"):
        yield doc
    else:
        raise CommandError(f"Unsupported GeoJSON type: {kind!r}")


def to_multipolygon(doc: dict) -> MultiPolygon:
    polygons: list[Polygon] = []
    for raw in _geometries(doc):
        geom = GEOSGeometry(json.dumps(raw), srid=4326)
        if isinstance(geom, Polygon):
            polygons.append(geom)
        elif isinstance(geom, MultiPolygon):
            polygons.extend(geom)
        else:
            for part in geom:  # GeometryCollection
                if isinstance(part, Polygon):
                    polygons.append(part)
                elif isinstance(part, MultiPolygon):
                    polygons.extend(part)
    if not polygons:
        raise CommandError("No Polygon/MultiPolygon geometry found in the file.")
    multi = MultiPolygon(polygons, srid=4326)
    if not multi.valid:
        multi = multi.buffer(0)
        if isinstance(multi, Polygon):
            multi = MultiPolygon(multi, srid=4326)
    return multi


class Command(BaseCommand):
    help = "Load a GeoJSON boundary and make it the single active coverage area."

    def create_parser(self, prog_name, subcommand, **kwargs):
        # Our --version (boundary version) replaces Django's built-in --version flag.
        kwargs.setdefault("conflict_handler", "resolve")
        return super().create_parser(prog_name, subcommand, **kwargs)

    def add_arguments(self, parser):
        parser.add_argument("file", help="Path to a .geojson file (Feature, FeatureCollection or geometry)")
        parser.add_argument("--name", required=True)
        parser.add_argument("--source", required=True, help="Where the boundary came from (e.g. PSA/NAMRIA via HDX)")
        parser.add_argument("--version", required=True, dest="boundary_version")
        parser.add_argument("--verified", action="store_true", help="Mark the boundary as officially verified")

    def handle(self, *args, **opts):
        path = Path(opts["file"])
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON: {exc}") from exc
        geometry = to_multipolygon(doc)
        area = activate_area(
            name=opts["name"],
            geometry=geometry,
            source=opts["source"],
            version=opts["boundary_version"],
            verified=opts["verified"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Active coverage is now '{area.name}' v{area.version} "
                f"({'verified' if area.verified else 'NOT verified'}), {len(geometry)} polygon(s)."
            )
        )
