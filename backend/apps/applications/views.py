from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.exceptions import BusinessError
from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdminRole
from apps.accounts.serializers import UserSerializer

from . import services
from .models import TechnicianApplication
from .serializers import ApplicationSerializer, RejectSerializer, VerificationSerializer

AccountCreatedResponse = inline_serializer(
    "TechnicianAccountCreated",
    {
        "user": UserSerializer(),
        "technician_profile_id": serializers.IntegerField(),
        "activation_code": serializers.CharField(),
        "expires_at": serializers.DateTimeField(),
    },
)


def _account_payload(result) -> dict:
    return {
        "user": UserSerializer(result["user"]).data,
        "technician_profile_id": result["profile"].id,
        "activation_code": result["activation_code"],
        "expires_at": serializers.DateTimeField().to_representation(result["expires_at"]),
    }


class ApplicationViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = ApplicationSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = TechnicianApplication.objects.select_related("decided_by", "technician_profile").prefetch_related(
            "requested_categories", "verifications__checked_by"
        )
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status__in=params["status"].split(","))
        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search)
                | Q(email__icontains=search) | Q(phone__icontains=search)
            )
        return qs.order_by("-submitted_at", "-id")

    @extend_schema(parameters=[OpenApiParameter("status", str), OpenApiParameter("search", str)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    def _fresh(self, pk):
        return Response(ApplicationSerializer(self.get_queryset().get(pk=pk)).data)

    @extend_schema(request=VerificationSerializer, responses={201: VerificationSerializer})
    @action(detail=True, methods=["post"])
    def verifications(self, request, pk=None):
        application = self.get_object()
        s = VerificationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        record = s.save(application=application, checked_by=request.user)
        return Response(VerificationSerializer(record).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()
        services.approve(application.pk, request.user)
        return self._fresh(application.pk)

    @extend_schema(request=RejectSerializer, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()
        s = RejectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.reject(application.pk, request.user, s.validated_data.get("reason", ""))
        return self._fresh(application.pk)

    @extend_schema(request=None, responses={201: AccountCreatedResponse})
    @action(detail=True, methods=["post"], url_path="create-account")
    def create_account(self, request, pk=None):
        application = self.get_object()
        result = services.create_technician_account(application.pk, request.user)
        return Response(_account_payload(result), status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={201: AccountCreatedResponse})
    @action(detail=True, methods=["post"], url_path="reissue-code")
    def reissue_code(self, request, pk=None):
        """Extra (not in contract v1): new activation code when the old one expired before activation."""
        application = self.get_object()
        result = services.reissue_activation_code(application.pk, request.user)
        return Response(_account_payload(result), status=status.HTTP_201_CREATED)


class AdminUserUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = UserSerializer

    def get_queryset(self):
        qs = User.objects.select_related("technician_profile")
        params = self.request.query_params
        role = params.get("role")
        if role in Role.values:
            qs = qs.filter(role=role)
        is_active = params.get("is_active")
        if is_active is not None and is_active != "":
            qs = qs.filter(is_active=is_active.lower() in ("1", "true", "yes"))
        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search) | Q(first_name__icontains=search)
                | Q(last_name__icontains=search) | Q(phone__icontains=search)
            )
        return qs.order_by("-date_joined", "-id")

    @extend_schema(
        parameters=[
            OpenApiParameter("role", str, enum=Role.values),
            OpenApiParameter("search", str),
            OpenApiParameter("is_active", bool),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=AdminUserUpdateSerializer, responses=UserSerializer)
    def partial_update(self, request, pk=None):
        user = self.get_object()
        s = AdminUserUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if user.pk == request.user.pk and not s.validated_data["is_active"]:
            raise BusinessError("You cannot deactivate your own account.", "cannot_deactivate_self", 400)
        user.is_active = s.validated_data["is_active"]
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data)
