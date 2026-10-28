from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.bookings import services
from apps.bookings.consumers import BookingConsumer
from apps.bookings.models import BookingStatus
from apps.bookings.tasks import expire_stale_pending_bookings
from conftest import auth_client

S = BookingStatus


def review(user, booking, rating=5, comment="Great"):
    return auth_client(user).post(f"/api/bookings/{booking.id}/review/", {"rating": rating, "comment": comment}, format="json")


# --- reviews -------------------------------------------------------------------

@pytest.mark.django_db
def test_review_only_after_completed(customer, technician, make_booking):
    for status in [S.PENDING, S.ACCEPTED, S.IN_PROGRESS, S.CANCELLED, S.DECLINED]:
        b = make_booking(technician, status, start=timezone.now() + timedelta(days=3 + len(status)))
        r = review(customer, b)
        assert r.status_code == 400 and r.json()["code"] == "not_completed", status


@pytest.mark.django_db
def test_review_once_owner_only_and_aggregates(customer, other_customer, technician, make_booking):
    b1 = make_booking(technician, S.COMPLETED)
    b2 = make_booking(technician, S.COMPLETED, cust=other_customer)
    assert review(other_customer, b1).status_code == 403
    assert review(technician.user, b1).status_code == 403
    r = review(customer, b1, 4, "Good")
    assert r.status_code == 201
    assert r.json()["customer_name"] == "Ana C." and r.json()["booking_id"] == b1.id
    r = review(customer, b1, 5)
    assert r.status_code == 409 and r.json()["code"] == "already_reviewed"
    assert review(other_customer, b2, 5).status_code == 201
    technician.refresh_from_db()
    assert technician.rating_count == 2 and technician.rating_avg == 4.5
    detail = auth_client(customer).get(f"/api/technicians/{technician.id}/").json()
    assert detail["rating_display"] == "4.5 (2 reviews)"
    assert len(detail["recent_reviews"]) == 2
    assert auth_client(customer).get(f"/api/technicians/{technician.id}/reviews/").json()["count"] == 2


@pytest.mark.django_db
def test_review_rating_range(customer, technician, make_booking):
    b = make_booking(technician, S.COMPLETED)
    assert review(customer, b, 0).status_code == 400
    assert review(customer, b, 6).status_code == 400


# --- expiry task ----------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
def test_expire_stale_pending(customer, technician, make_booking):
    stale = make_booking(technician, start=timezone.now() - timedelta(minutes=5))
    fresh = make_booking(technician, start=timezone.now() + timedelta(hours=3))
    accepted_past = make_booking(technician, S.ACCEPTED, start=timezone.now() - timedelta(hours=5))
    assert expire_stale_pending_bookings() == 1
    stale.refresh_from_db(), fresh.refresh_from_db(), accepted_past.refresh_from_db()
    assert stale.status == "cancelled" and stale.cancelled_by_role == "system" and stale.cancellation_reason == "expired"
    last = stale.status_history.last()
    assert last.actor is None and last.actor_role == "system" and last.reason == "expired"
    assert fresh.status == "pending" and accepted_past.status == "accepted"
    assert expire_stale_pending_bookings() == 0


# --- websocket --------------------------------------------------------------------

def _connect(token):
    return WebsocketCommunicator(BookingConsumer.as_asgi(), f"/ws/bookings/?token={token}")


@pytest.mark.django_db(transaction=True)
def test_ws_rejects_bad_token():
    async def run():
        comm = _connect("not-a-token")
        connected, _ = await comm.connect()
        assert connected
        out = await comm.receive_output()
        assert out["type"] == "websocket.close" and out["code"] == 4401
    async_to_sync(run)()


@pytest.mark.django_db(transaction=True)
def test_ws_pushes_event_to_participants_after_commit(customer, technician, admin_user, make_booking):
    booking = make_booking(technician, start=timezone.now() + timedelta(days=1))
    tokens = [str(AccessToken.for_user(u)) for u in (customer, admin_user)]

    async def run():
        sockets = [_connect(t) for t in tokens]
        for ws in sockets:
            assert (await ws.connect())[0]
            assert (await ws.receive_json_from())["type"] == "connection.ready"
        await database_sync_to_async(services.decline)(booking.id, technician.user, "Busy")
        for ws in sockets:
            msg = await ws.receive_json_from(timeout=3)
            assert msg["type"] == "booking.updated"
            assert msg["booking_id"] == booking.id
            assert msg["event"] == "declined" and msg["status"] == "declined"
            assert msg["previous_status"] == "pending" and msg["actor_role"] == "technician"
            await ws.disconnect()

    async_to_sync(run)()
