from django.db import connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.geo.services import is_inside_coverage

from .exceptions import BusinessError
from .models import CustomerProfile
from .permissions import IsCustomer
from .serializers import (
    ActivateSerializer,
    ChangePasswordSerializer,
    CustomerProfileSerializer,
    LogoutSerializer,
    MeUpdateSerializer,
    RegisterSerializer,
    TokenSerializer,
    UserSerializer,
)
from .services import activate_technician

OUTSIDE_COVERAGE = "This location is outside Kidapawan City coverage."


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=inline_serializer("Health", {"status": serializers.CharField()}))
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            return Response({"status": "error", "database": "unavailable"}, status=503)
        return Response({"status": "ok"})


class AuthThrottleMixin:
    throttle_scope = "auth"
    throttle_classes = [ScopedRateThrottle]


class RegisterView(AuthThrottleMixin, generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegisterSerializer

    @extend_schema(responses={201: UserSerializer})
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class TokenView(AuthThrottleMixin, TokenObtainPairView):
    serializer_class = TokenSerializer


class TokenRefreshThrottledView(AuthThrottleMixin, TokenRefreshView):
    pass


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            pass  # already invalid or blacklisted: logout stays idempotent
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActivateView(AuthThrottleMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=ActivateSerializer,
        responses=inline_serializer("ActivateResponse", {"detail": serializers.CharField()}),
    )
    def post(self, request):
        serializer = ActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        activate_technician(data["email"], data["activation_code"], data["password"])
        return Response({"detail": "Account activated. You can now log in."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=MeUpdateSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        profile = getattr(user, "technician_profile", None)
        if profile is not None and "phone" in serializer.validated_data:
            profile.phone = user.phone
            profile.save(update_fields=["phone", "updated_at"])
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerMeView(APIView):
    permission_classes = [IsCustomer]

    def get_profile(self, request):
        profile, _ = CustomerProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(responses=CustomerProfileSerializer)
    def get(self, request):
        return Response(CustomerProfileSerializer(self.get_profile(request)).data)

    @extend_schema(request=CustomerProfileSerializer, responses=CustomerProfileSerializer)
    def patch(self, request):
        profile = self.get_profile(request)
        serializer = CustomerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        point = serializer.validated_data.get("default_location")
        if point is not None and not is_inside_coverage(point):
            raise BusinessError(OUTSIDE_COVERAGE, "outside_coverage")
        serializer.save()
        return Response(CustomerProfileSerializer(profile).data)
