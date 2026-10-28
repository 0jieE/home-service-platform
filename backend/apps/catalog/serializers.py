from rest_framework import serializers

from .models import ServiceCategory


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ["id", "name", "slug", "description", "icon", "is_active"]
        read_only_fields = ["id", "slug"]

    def validate_name(self, value):
        value = value.strip()
        qs = ServiceCategory.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value
