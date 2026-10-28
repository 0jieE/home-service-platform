from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminRole

from .models import ServiceCategory
from .serializers import CategorySerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """GET is open to everyone (unpaginated, active only); writes are admin-only."""

    serializer_class = CategorySerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return []
        return [IsAuthenticated(), IsAdminRole()]

    def _is_admin(self):
        user = self.request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)

    def get_queryset(self):
        qs = ServiceCategory.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "").lower() in ("1", "true", "yes")
        if not (self._is_admin() and (include_inactive or self.action != "list")):
            qs = qs.filter(is_active=True)
        return qs

    @extend_schema(parameters=[OpenApiParameter("include_inactive", bool, description="Admin only")])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Hard delete when unused; otherwise soft-deactivate so history stays intact."""
        category = self.get_object()
        in_use = (
            category.technician_services.exists()
            or category.bookings.exists()
            or category.applications.exists()
        )
        if in_use:
            category.is_active = False
            category.save(update_fields=["is_active", "updated_at"])
        else:
            category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
