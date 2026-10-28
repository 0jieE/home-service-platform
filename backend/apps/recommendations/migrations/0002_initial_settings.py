"""Seed RecommendationSettings v1: w_p=0.5, w_r=0.5, d0=1 km, no-rating Q=0.5 (paper §3.1.3)."""

from django.db import migrations


def create_settings(apps, schema_editor):
    RecommendationSettings = apps.get_model("recommendations", "RecommendationSettings")
    RecommendationSettings.objects.get_or_create(
        pk=1, defaults={"w_p": 0.5, "w_r": 0.5, "d0_km": 1.0, "no_rating_q": 0.5, "version": 1}
    )


class Migration(migrations.Migration):
    dependencies = [("recommendations", "0001_initial")]
    operations = [migrations.RunPython(create_settings, migrations.RunPython.noop)]
