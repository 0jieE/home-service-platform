"""Seed the SPEC §7 development placeholder boundary (verified=False) when no area is active."""

from django.contrib.gis.geos import MultiPolygon, Polygon
from django.db import migrations

SOURCE = "DEV PLACEHOLDER — not for formal testing"


def create_placeholder(apps, schema_editor):
    CoverageArea = apps.get_model("geo", "CoverageArea")
    if CoverageArea.objects.filter(is_active=True).exists():
        return
    ring = ((125.00, 6.93), (125.25, 6.93), (125.25, 7.12), (125.00, 7.12), (125.00, 6.93))
    CoverageArea.objects.create(
        name="Kidapawan City (placeholder)",
        geometry=MultiPolygon(Polygon(ring, srid=4326), srid=4326),
        source=SOURCE,
        version="dev-0",
        verified=False,
        is_active=True,
    )


def remove_placeholder(apps, schema_editor):
    apps.get_model("geo", "CoverageArea").objects.filter(source=SOURCE).delete()


class Migration(migrations.Migration):
    dependencies = [("geo", "0001_initial")]
    operations = [migrations.RunPython(create_placeholder, remove_placeholder)]
