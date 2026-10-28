"""Booking state machine (SPEC §5): every allowed transition, every forbidden one, history, conflicts."""

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.bookings import services
from apps.bookings.models import Booking, BookingDispute, BookingStatus, BookingStatusHistory
from apps.recommendations import eligibility
from apps.technicians.models import Availability
from conftest import auth_client, tomorrow_at

pytestmark = pytest.mark.django_db
S = BookingStatus


def soon(minutes=30):
    return (timezone.now() + timedelta(minutes=minutes)).replace(second=0, microsecond=0)


@pytest.fixture
def tech(make_technician):
    """Technician with a slot around 'now' so near-term bookings are acceptable and startable."""
    profile = make_technician(slot=False)
    Availability.objects.create(technician=profile, start=timezone.now() - timedelta(hours=1),
                                end=timezone.now() + timedelta(hours=6))
    return profile


def post(user, booking, action, data=None):
    return auth_client(user).post(f"/api/bookings/{booking.id}/{action}/", data or {}, format="json")


# --- create -------------------------------------------------------------------

def test_customer_creates_pending_booking(customer, category, technician):
    payload = {
        "technician_id": technician.id, "category_id": category.id, "location": {"lat": 7.0100, "lng": 125.0900},
        "address": "Purok 3, Brgy. Lanao", "start": tomorrow_at(9).isoformat(), "notes": "Leaking pipe",
    }
    r = auth_client(customer).post("/api/bookings/", payload, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["status"] == "pending"
    assert body["end"].startswith(tomorrow_at(11).isoformat()[:16])
    assert body["allowed_actions"] == ["cancel"]
    assert body["distance_km"] == pytest.approx(0.19, abs=0.05)
    assert body["status_history"][0]["to_status"] == "pending"
    assert body["status_history"][0]["actor_role"] == "customer"
    assert body["status_history"][0]["actor_name"] == "Ana Cruz"


def test_create_rechecks_eligibility(customer, category, technician):
    client = auth_client(customer)
    base = {"technician_id": technician.id, "category_id": category.id, "address": "x"}
    r = client.post("/api/bookings/", {**base, "location": {"lat": 7.5, "lng": 125.0}, "start": tomorrow_at(9).isoformat()}, format="json")
    assert r.json()["code"] == "outside_coverage"
    r = client.post("/api/bookings/", {**base, "location": {"lat": 7.01, "lng": 125.09}, "start": tomorrow_at(16).isoformat()}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "technician_unavailable"  # 16:00–18:00 exceeds slot
    r = client.post("/api/bookings/", {**base, "location": {"lat": 7.01, "lng": 125.09}, "start": tomorrow_at(9, 10).isoformat()}, format="json")
    assert r.status_code == 400 and "start" in r.json()


def test_only_customers_create(technician, category, admin_user):
    payload = {"technician_id": technician.id, "category_id": category.id, "location": {"lat": 7.01, "lng": 125.09},
               "address": "x", "start": tomorrow_at(9).isoformat()}
    assert auth_client(technician.user).post("/api/bookings/", payload, format="json").status_code == 403
    assert auth_client(admin_user).post("/api/bookings/", payload, format="json").status_code == 403


# --- allowed transitions --------------------------------------------------------

def test_full_happy_path_with_history(customer, tech, make_booking):
    b = make_booking(tech, start=soon(30), end=soon(150))
    assert post(tech.user, b, "accept").json()["status"] == "accepted"
    assert post(tech.user, b, "start").json()["status"] == "in_progress"
    r = post(tech.user, b, "request-completion", {"notes": "Replaced the valve"})
    assert r.json()["status"] == "in_progress" and r.json()["completion_requested_at"]
    assert r.json()["allowed_actions"] == []  # technician waits for the customer
    r = auth_client(customer).get(f"/api/bookings/{b.id}/")
    assert r.json()["allowed_actions"] == ["confirm_completion", "dispute"]
    r = post(customer, b, "confirm-completion")
    assert r.json()["status"] == "completed" and r.json()["confirmed_by"] == "customer"
    assert r.json()["allowed_actions"] == ["review"]
    events = list(BookingStatusHistory.objects.filter(booking=b).values_list("event", "from_status", "to_status", "actor_role"))
    assert events == [
        ("accepted", "pending", "accepted", "technician"),
        ("started", "accepted", "in_progress", "technician"),
        ("completion_requested", "in_progress", "in_progress", "technician"),
        ("completed", "in_progress", "completed", "customer"),
    ]


def test_decline_with_optional_reason(tech, make_booking):
    b = make_booking(tech)
    r = post(tech.user, b, "decline", {"reason": "Fully booked"})
    assert r.json()["status"] == "declined" and r.json()["decline_reason"] == "Fully booked"
    b2 = make_booking(tech, start=tomorrow_at(13))
    assert post(tech.user, b2, "decline").json()["status"] == "declined"


def test_customer_cancels_pending_without_reason(customer, tech, make_booking):
    b = make_booking(tech)
    r = post(customer, b, "cancel")
    assert r.json()["status"] == "cancelled" and r.json()["cancelled_by_role"] == "customer"


@pytest.mark.parametrize("who", ["customer", "technician"])
def test_cancel_accepted_requires_reason(who, customer, tech, make_booking):
    b = make_booking(tech, S.ACCEPTED)
    user = customer if who == "customer" else tech.user
    r = post(user, b, "cancel", {"reason": "  "})
    assert r.status_code == 400 and r.json()["code"] == "reason_required"
    r = post(user, b, "cancel", {"reason": "Family emergency"})
    assert r.status_code == 200
    assert r.json()["cancelled_by_role"] == who and r.json()["cancellation_reason"] == "Family emergency"
    assert r.json()["status_history"][-1]["reason"] == "Family emergency"


def test_start_not_earlier_than_60_minutes(tech, make_booking):
    b = make_booking(tech, S.ACCEPTED, start=soon(90), end=soon(210))
    r = post(tech.user, b, "start")
    assert r.status_code == 409 and r.json()["code"] == "invalid_transition"
    b2 = make_booking(tech, S.ACCEPTED, start=soon(-30 + 300), end=soon(330))
    assert "start" not in auth_client(tech.user).get(f"/api/bookings/{b2.id}/").json()["allowed_actions"]


def test_dispute_flow_and_admin_resolutions(customer, tech, admin_user, make_booking):
    for decision, final in [("completed", "completed"), ("cancelled", "cancelled"), ("return_in_progress", "in_progress")]:
        b = make_booking(tech, S.IN_PROGRESS, start=soon(-60), end=soon(60), completion_requested_at=timezone.now())
        r = post(customer, b, "dispute", {"reason": ""})
        assert r.status_code == 400 and r.json()["code"] == "reason_required"
        r = post(customer, b, "dispute", {"reason": "Still leaking"})
        assert r.status_code == 200 and r.json()["dispute"]["status"] == "open"
        assert r.json()["allowed_actions"] == []
        assert post(customer, b, "dispute", {"reason": "again"}).json()["code"] == "invalid_transition"
        dispute = BookingDispute.objects.get(booking=b)
        r = auth_client(admin_user).post(f"/api/admin/disputes/{dispute.id}/resolve/",
                                         {"decision": decision, "admin_notes": "Checked photos"}, format="json")
        assert r.status_code == 200, r.content
        assert r.json()["status"] == "resolved" and r.json()["decision"] == decision
        b.refresh_from_db()
        assert b.status == final
        last = b.status_history.last()
        assert last.actor_role == "admin" and last.event == "dispute_resolved" and "Checked photos" in last.reason
        if decision == "completed":
            assert b.confirmed_by == "admin"
        if decision == "return_in_progress":
            assert b.completion_requested_at is None
            assert "request_completion" in services.allowed_actions(b, tech.user)
        r = auth_client(admin_user).post(f"/api/admin/disputes/{dispute.id}/resolve/", {"decision": "completed"}, format="json")
        assert r.status_code == 409


# --- forbidden transitions ----------------------------------------------------------

TECH_ACTIONS = ["accept", "decline", "start", "request-completion"]
CUSTOMER_ACTIONS = ["cancel", "confirm-completion", "dispute"]
ALLOWED = {
    # (status, completion_requested): actions allowed for the right actor
    ("pending", False): {"accept", "decline", "cancel"},
    ("accepted", False): {"start", "cancel"},
    ("in_progress", False): {"request-completion"},
    ("in_progress", True): {"confirm-completion", "dispute"},
    ("declined", False): set(),
    ("cancelled", False): set(),
    ("completed", False): set(),
}


@pytest.mark.parametrize("state", list(ALLOWED))
@pytest.mark.parametrize("act", TECH_ACTIONS + CUSTOMER_ACTIONS)
def test_transition_matrix(state, act, customer, tech, make_booking):
    status, requested = state
    b = make_booking(tech, status, start=soon(30), end=soon(150),
                     completion_requested_at=timezone.now() if requested else None)
    user = tech.user if act in TECH_ACTIONS else customer
    r = post(user, b, act, {"reason": "because"})
    if act in ALLOWED[state]:
        assert r.status_code == 200, (state, act, r.content)
    else:
        assert r.status_code == 409, (state, act, r.content)
        assert r.json()["code"] == "invalid_transition"
        b.refresh_from_db()
        assert b.status == status


def test_technician_cannot_cancel_pending(tech, make_booking):
    b = make_booking(tech)
    r = post(tech.user, b, "cancel", {"reason": "x"})
    assert r.status_code == 409 and r.json()["code"] == "invalid_transition"


def test_cannot_cancel_after_start(customer, tech, make_booking):
    b = make_booking(tech, S.ACCEPTED, start=soon(-10), end=soon(110))
    r = post(customer, b, "cancel", {"reason": "late"})
    assert r.status_code == 409


def test_wrong_role_gets_403(customer, tech, make_booking):
    b = make_booking(tech)
    assert post(customer, b, "accept").status_code == 403
    assert post(tech.user, b, "confirm-completion").status_code == 403


# --- accept re-check and conflicts ---------------------------------------------------

def test_accept_rechecks_eligibility(tech, make_booking):
    b = make_booking(tech, start=soon(30), end=soon(150))
    tech.availability.all().delete()
    r = post(tech.user, b, "accept")
    assert r.status_code == 409 and r.json()["code"] == "technician_unavailable"
    b.refresh_from_db()
    assert b.status == "pending"


def test_two_overlapping_accepts_second_gets_conflict(customer, other_customer, tech, make_booking):
    first = make_booking(tech, start=soon(30), end=soon(150))
    second = make_booking(tech, start=soon(90), end=soon(210), cust=other_customer)
    # Pending does not reserve: both are pending and the second shows the overlap only after accept.
    assert auth_client(tech.user).get(f"/api/bookings/{second.id}/").json()["conflicts_with_reserved"] is False
    assert post(tech.user, first, "accept").status_code == 200
    assert auth_client(tech.user).get(f"/api/bookings/{second.id}/").json()["conflicts_with_reserved"] is True
    r = post(tech.user, second, "accept")
    assert r.status_code == 409 and r.json()["code"] == "booking_conflict"
    second.refresh_from_db()
    assert second.status == "pending"


def test_db_exclusion_constraint_blocks_overlap_when_checks_are_bypassed(tech, make_booking, monkeypatch):
    first = make_booking(tech, start=soon(30), end=soon(150))
    second = make_booking(tech, start=soon(60), end=soon(180))
    assert post(tech.user, first, "accept").status_code == 200
    monkeypatch.setattr(eligibility, "check_technician", lambda *a, **k: None)  # simulate a race
    r = post(tech.user, second, "accept")
    assert r.status_code == 409 and r.json()["code"] == "booking_conflict"


def test_db_exclusion_constraint_directly(tech, make_booking):
    make_booking(tech, S.ACCEPTED, start=tomorrow_at(9))
    make_booking(tech, S.PENDING, start=tomorrow_at(10))  # pending may overlap
    make_booking(tech, S.CANCELLED, start=tomorrow_at(10))
    make_booking(tech, S.ACCEPTED, start=tomorrow_at(11))  # [9,11) and [11,13) touch only
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_booking(tech, S.IN_PROGRESS, start=tomorrow_at(10))
    b = Booking.objects.filter(status=S.PENDING).first()
    b.status = S.ACCEPTED
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            b.save()


def test_pending_does_not_reserve_interval(customer, other_customer, category, tech, make_booking):
    make_booking(tech, start=tomorrow_at(9))
    payload = {"technician_id": tech.id, "category_id": category.id, "location": {"lat": 7.01, "lng": 125.09},
               "address": "x", "start": tomorrow_at(9).isoformat()}
    Availability.objects.create(technician=tech, start=tomorrow_at(8), end=tomorrow_at(17))
    r = auth_client(other_customer).post("/api/bookings/", payload, format="json")
    assert r.status_code == 201


def test_status_history_is_protected(tech, make_booking):
    b = make_booking(tech)
    services.decline(b.id, tech.user)
    from django.db.models import ProtectedError

    with pytest.raises(ProtectedError):
        Booking.objects.filter(pk=b.pk).delete()
