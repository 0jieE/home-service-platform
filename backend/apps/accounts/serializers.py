from django.contrib.auth import password_validation
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.geo.fields import LatLngField

from .models import CustomerProfile, Role, User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    technician_profile_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name", "phone", "role",
            "is_active", "date_joined", "technician_profile_id",
        ]
        read_only_fields = ["id", "email", "role", "is_active", "date_joined"]

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_technician_profile_id(self, obj):
        if obj.role != Role.TECHNICIAN:
            return None
        profile = getattr(obj, "technician_profile", None)
        return profile.id if profile else None


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name", "phone"]

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        candidate = User(email=attrs["email"], first_name=attrs["first_name"], last_name=attrs["last_name"])
        password_validation.validate_password(attrs["password"], candidate)
        return attrs

    def create(self, validated):
        user = User.objects.create_user(role=Role.CUSTOMER, **validated)
        CustomerProfile.objects.create(user=user)
        return user


class TokenSerializer(TokenObtainPairSerializer):
    """{email, password} -> {access, refresh, user}. Unapproved technicians cannot log in."""

    default_error_messages = {"no_active_account": _("Invalid email or password, or the account is not active.")}

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        return token

    def validate(self, attrs):
        attrs[self.username_field] = (attrs.get(self.username_field) or "").strip().lower()
        data = super().validate(attrs)
        user = self.user
        if user.role == Role.TECHNICIAN:
            profile = getattr(user, "technician_profile", None)
            if profile is None or not profile.is_approved:
                raise AuthenticationFailed("This technician account is not approved.", code="account_not_approved")
        data["user"] = UserSerializer(user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ActivateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    activation_code = serializers.CharField(max_length=32)
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class CustomerProfileSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(source="user.phone", max_length=32, required=False, allow_blank=True)
    default_location = LatLngField(required=False, allow_null=True)

    class Meta:
        model = CustomerProfile
        fields = ["phone", "default_address", "default_location"]

    def update(self, instance, validated):
        user_data = validated.pop("user", {})
        if "phone" in user_data:
            instance.user.phone = user_data["phone"]
            instance.user.save(update_fields=["phone"])
        return super().update(instance, validated)
