"""Shared pytest fixtures: users of each role, categories, technicians with slots, bookings."""

from datetime import datetime, time, timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CustomerProfile, Role, User
from apps.bookings.models import Booking, BookingStatus
from apps.catalog.models import ServiceCategory
from apps.geo.fields import make_point
from apps.geo.services import ensure_placeholder_area
from apps.technicians.models import Availability, TechnicianProfile, TechnicianService

POBLACION = (7.0083, 125.0894)


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def coverage(db):
    return ensure_placeholder_area()


def tomorrow_at(hour: int, minute: int = 0, days: int = 1) -> datetime:
    day = timezone.localdate() + timedelta(days=days)
    return timezone.make_aware(datetime.combine(day, time(hour, minute)), timezone.get_default_timezone())


@pytest.fixture
def api():
    return APIClient()


def auth_client(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def make_user(db):
    counter = {"n": 0}

    def _make(role=Role.CUSTOMER, password="Secret123!", **extra):
        counter["n"] += 1
        email = extra.pop("email", f"{role}{counter['n']}@test.local")
        user = User.objects.create_user(
            email=email, password=password, role=role,
            first_name=extra.pop("first_name", role.title()), last_name=extra.pop("last_name", f"User{counter['n']}"),
            **extra,
        )
        if role == Role.CUSTOMER:
            CustomerProfile.objects.create(user=user)
        return user

    return _make


@pytest.fixture
def customer(make_user):
    return make_user(Role.CUSTOMER, email="cust@test.local", first_name="Ana", last_name="Cruz")


@pytest.fixture
def other_customer(make_user):
    return make_user(Role.CUSTOMER, email="cust2@test.local")


@pytest.fixture
def admin_user(make_user):
    return make_user(Role.ADMIN, email="admin@test.local")


@pytest.fixture
def category(db):
    return ServiceCategory.objects.create(name="Plumbing", icon="wrench")


@pytest.fixture
def other_category(db):
    return ServiceCategory.objects.create(name="Electrical", icon="zap")


@pytest.fixture
def make_technician(make_user, category):
    def _make(lat=POBLACION[0], lng=POBLACION[1], categories=None, slot=True, rating_avg=None, rating_count=0,
              approved=True, active=True, phone="09170000000", **extra):
        user = make_user(Role.TECHNICIAN, is_active=active, **extra)
        profile = TechnicianProfile.objects.create(
            user=user, phone=phone, address="Kidapawan City", is_approved=approved,
            location=make_point(lat, lng) if lat is not None else None,
            rating_avg=rating_avg, rating_count=rating_count, years_experience=3,
        )
        for c in categories if categories is not None else [category]:
            TechnicianService.objects.create(technician=profile, category=c)
        if slot:
            Availability.objects.create(technician=profile, start=tomorrow_at(8), end=tomorrow_at(17))
        return profile

    return _make


@pytest.fixture
def technician(make_technician):
    return make_technician(first_name="Ben", last_name="Santos")


@pytest.fixture
def make_booking(customer, category):
    def _make(technician, status=BookingStatus.PENDING, start=None, end=None, cust=None, **extra):
        start = start or tomorrow_at(9)
        end = end or start + timedelta(hours=2)
        return Booking.objects.create(
            customer=cust or customer, technician=technician, category=category, address="Purok 1",
            location=make_point(7.01, 125.09), start=start, end=end, status=status, **extra,
        )

    return _make
