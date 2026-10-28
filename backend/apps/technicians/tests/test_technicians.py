from datetime import timedelta

import pytest
from django.utils import timezone

from apps.bookings.models import BookingStatus
from apps.technicians.models import Availability
from conftest import auth_client, tomorrow_at

pytestmark = pytest.mark.django_db


def test_discovery_lists_only_public_profiles(customer, category, other_category, make_technician):
    ok = make_technician(first_name="Ben", rating_avg=4.0, rating_count=2)
    unrated = make_technician(first_name="Carlo")
    make_technician(approved=False)
    make_technician(lat=None)
    elec = make_technician(categories=[other_category], first_name="Dodong")
    client = auth_client(customer)
    body = client.get("/api/technicians/").json()
    assert body["count"] == 3
    assert [r["id"] for r in body["results"]][:1] == [ok.id]  # -rating_avg, nulls last
    assert client.get(f"/api/technicians/?category={other_category.id}").json()["results"][0]["id"] == elec.id
    assert client.get("/api/technicians/?search=carlo").json()["results"][0]["id"] == unrated.id
    assert client.get("/api/technicians/?search=electrical").json()["count"] == 1
    assert client.get("/api/technicians/?ordering=bogus").status_code == 400
    assert client.get("/api/technicians/?page_size=1").json()["next"] is not None


def test_technician_detail_and_public_availability(customer, technician, make_booking):
    make_booking(technician, BookingStatus.ACCEPTED, start=tomorrow_at(9))
    make_booking(technician, BookingStatus.PENDING, start=tomorrow_at(13))
    client = auth_client(customer)
    detail = client.get(f"/api/technicians/{technician.id}/").json()
    assert detail["full_name"] == "Ben Santos" and detail["verification_summary"] == [] and detail["recent_reviews"] == []
    assert detail["rating_avg"] is None and detail["rating_display"] == "No ratings yet"
    av = client.get(f"/api/technicians/{technician.id}/availability/").json()
    assert len(av["slots"]) == 1 and av["slots"][0]["state"] == "available"
    assert len(av["reserved"]) == 1  # only accepted/in_progress


def test_me_patch_location_and_services(technician, category, other_category):
    client = auth_client(technician.user)
    r = client.patch("/api/technicians/me/", {"location": {"lat": 7.3, "lng": 125.1}}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "outside_coverage"
    r = client.patch("/api/technicians/me/", {"bio": "Licensed plumber", "years_experience": 7,
                                              "location": {"lat": 7.02, "lng": 125.08},
                                              "service_category_ids": [other_category.id]}, format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["bio"] == "Licensed plumber" and body["location"] == {"lat": 7.02, "lng": 125.08}
    assert [c["id"] for c in body["specializations"]] == [other_category.id]
    assert body["missing_fields"] == []
    r = client.patch("/api/technicians/me/", {"service_category_ids": [], "phone": ""}, format="json")
    assert set(r.json()["missing_fields"]) == {"phone", "service_categories"}
    assert client.patch("/api/technicians/me/", {"service_category_ids": [9999]}, format="json").status_code == 400


def test_availability_crud_and_overlap(technician):
    client = auth_client(technician.user)
    day2 = tomorrow_at(8, days=2)
    r = client.post("/api/technicians/me/availability/", {"start": day2.isoformat(), "end": (day2 + timedelta(hours=4)).isoformat()}, format="json")
    assert r.status_code == 201 and r.json()["state"] == "available"
    slot_id = r.json()["id"]
    r = client.post("/api/technicians/me/availability/", {"start": (day2 + timedelta(hours=3)).isoformat(),
                                                          "end": (day2 + timedelta(hours=6)).isoformat()}, format="json")
    assert r.status_code == 400
    r = client.post("/api/technicians/me/availability/", {"start": day2.isoformat(), "end": day2.isoformat()}, format="json")
    assert r.status_code == 400
    day3 = tomorrow_at(8, days=3)
    r = client.post("/api/technicians/me/availability/", {"slots": [
        {"start": day3.isoformat(), "end": (day3 + timedelta(hours=2)).isoformat()},
        {"start": (day3 + timedelta(hours=2)).isoformat(), "end": (day3 + timedelta(hours=4)).isoformat(), "state": "unavailable"},
    ]}, format="json")
    assert r.status_code == 201 and len(r.json()) == 2
    r = client.patch(f"/api/technicians/me/availability/{slot_id}/", {"state": "unavailable"}, format="json")
    assert r.status_code == 200 and r.json()["state"] == "unavailable"
    assert client.delete(f"/api/technicians/me/availability/{slot_id}/").status_code == 204
    listed = client.get("/api/technicians/me/availability/", {"from": tomorrow_at(0).date().isoformat()}).json()
    assert len(listed) == 3


def test_cannot_shrink_or_delete_slot_with_reserved_booking(technician, make_booking, make_technician):
    slot = technician.availability.get()
    make_booking(technician, BookingStatus.ACCEPTED, start=tomorrow_at(9))
    client = auth_client(technician.user)
    r = client.patch(f"/api/technicians/me/availability/{slot.id}/", {"end": tomorrow_at(10).isoformat()}, format="json")
    assert r.status_code == 409 and r.json()["code"] == "booking_conflict"
    r = client.patch(f"/api/technicians/me/availability/{slot.id}/", {"state": "unavailable"}, format="json")
    assert r.status_code == 409
    assert client.delete(f"/api/technicians/me/availability/{slot.id}/").status_code == 409
    r = client.patch(f"/api/technicians/me/availability/{slot.id}/", {"end": tomorrow_at(12).isoformat()}, format="json")
    assert r.status_code == 200  # still covers 9–11
    other = make_technician()
    assert auth_client(other.user).delete(f"/api/technicians/me/availability/{slot.id}/").status_code == 404


def test_generate_weekly_schedule(technician):
    client = auth_client(technician.user)
    start = tomorrow_at(0, days=7).date()
    end = start + timedelta(days=13)
    r = client.post("/api/technicians/me/availability/generate/", {
        "weekdays": [0, 1, 2, 3, 4, 5], "start_time": "08:00", "end_time": "17:00",
        "from": start.isoformat(), "to": end.isoformat()}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["created"] == 12  # 14 days, Mon–Sat
    again = client.post("/api/technicians/me/availability/generate/", {
        "weekdays": [0, 1, 2, 3, 4, 5], "start_time": "08:00", "end_time": "17:00",
        "from": start.isoformat(), "to": end.isoformat()}, format="json").json()
    assert again == {"created": 0, "skipped": 12}
    slots = Availability.objects.filter(technician=technician, start__date__gte=start)
    assert all(timezone.localtime(s.start).weekday() < 6 and timezone.localtime(s.start).hour == 8 for s in slots)


def test_self_service_requires_technician(customer):
    assert auth_client(customer).get("/api/technicians/me/").status_code == 403
    assert auth_client(customer).get("/api/technicians/me/availability/").status_code == 403
