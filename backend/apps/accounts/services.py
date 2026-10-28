"""Technician activation codes: generated once, stored hashed, valid for 7 days."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .exceptions import BusinessError
from .models import ActivationCode, Role, User

# No 0/O, 1/I/L so codes are easy to read aloud and type.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
INVALID_ACTIVATION = "The email or activation code is invalid, already used, or expired."


def generate_activation_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def issue_activation_code(user: User, created_by: User | None = None) -> tuple[str, ActivationCode]:
    now = timezone.now()
    # Any earlier unused code stops working once a new one is issued.
    user.activation_codes.filter(used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
    plain = generate_activation_code()
    record = ActivationCode(
        user=user,
        expires_at=now + timedelta(days=settings.ACTIVATION_CODE_TTL_DAYS),
        created_by=created_by,
    )
    record.set_code(plain)
    record.save()
    return plain, record


@transaction.atomic
def activate_technician(email: str, code: str, password: str) -> User:
    user = (
        User.objects.select_for_update()
        .filter(email__iexact=(email or "").strip(), role=Role.TECHNICIAN)
        .first()
    )
    if user is None:
        raise BusinessError(INVALID_ACTIVATION, "invalid_activation")
    usable = user.activation_codes.filter(used_at__isnull=True, expires_at__gt=timezone.now())
    record = next((r for r in usable if r.matches(code)), None)
    if record is None:
        raise BusinessError(INVALID_ACTIVATION, "invalid_activation")
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"password": list(exc.messages)})
    user.set_password(password)
    user.is_active = True
    user.save()
    record.used_at = timezone.now()
    record.save(update_fields=["used_at"])
    return user
