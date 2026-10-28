from datetime import timedelta

import pytest

from apps.bookings.models import BookingStatus
from apps.recommendations.models import RecommendationSettings
from apps.technicians.models import Availability, AvailabilityState
from conftest import POBLACION, auth_client, tomorrow_at

pytestmark = pytest.mark.django_db


def _query(client, category, start=None, lat=POBLACION[0], lng=POBLACION[1], **extra):
    start = start or tomorrow_at(9)
    params = {"category": category.id, "lat": lat, "lng": lng, "start": start.isoformat(), **extra}
    return client.get("/api/recommendations/", params)


def _ids(response):
    assert response.status_code == 200, response.content
    return [r["technician"]["id"] for r in response.json()["results"]]


def test_eligible_technician_is_returned_with_scores(customer, category, technician):
    r = _query(auth_client(customer), category)
    body = r.json()
    assert _ids(r) == [technician.id]
    result = body["results"][0]
    assert result["rank"] == 1
    assert result["distance_km"] == pytest.approx(0.0, abs=1e-6)
    assert result["proximity_score"] == pytest.approx(1.0)
    assert result["rating_score"] == 0.5 and result["has_ratings"] is False
    assert result["technician"]["rating_display"] == "No ratings yet"
    assert result["availability"]["slot_id"] is not None
    assert body["settings"] == {"w_p": 0.5, "w_r": 0.5, "d0_km": 1.0, "no_rating_q": 0.5, "version": 1}
    assert body["empty_reason"] is None
    assert body["query"]["end"].startswith(tomorrow_at(11).isoformat()[:16])


def test_rule1_unapproved_or_inactive_excluded(customer, category, make_technician):
    ok = make_technician()
    make_technician(approved=False)
    make_technician(active=False)
    assert _ids(_query(auth_client(customer), category)) == [ok.id]


def test_rule2_other_category_or_inactive_category_excluded(customer, category, other_category, make_technician):
    ok = make_technician()
    make_technician(categories=[other_category])
    assert _ids(_query(auth_client(customer), category)) == [ok.id]
    category.is_active = False
    category.save()
    r = _query(auth_client(customer), category)
    assert r.status_code == 400 and "category" in r.json()


def test_rule3_technician_outside_coverage_excluded(customer, category, make_technician):
    ok = make_technician()
    make_technician(lat=7.30, lng=125.10)  # north of the boundary
    assert _ids(_query(auth_client(customer), category)) == [ok.id]


def test_rule3_customer_outside_coverage_is_error(customer, category, technician):
    r = _query(auth_client(customer), category, lat=7.5, lng=124.5)
    assert r.status_code == 400
    assert r.json()["code"] == "outside_coverage"


def test_rule4_slot_must_fully_contain_interval(customer, category, make_technician):
    ok = make_technician()
    partial = make_technician(slot=False)
    Availability.objects.create(technician=partial, start=tomorrow_at(10), end=tomorrow_at(17))  # starts too late
    blocked = make_technician(slot=False)
    Availability.objects.create(
        technician=blocked, start=tomorrow_at(8), end=tomorrow_at(17), state=AvailabilityState.UNAVAILABLE
    )
    assert _ids(_query(auth_client(customer), category)) == [ok.id]


def test_rule5_reserved_overlap_excluded_but_pending_does_not_reserve(customer, category, make_technician, make_booking):
    accepted = make_technician()
    in_progress = make_technician()
    pending_only = make_technician()
    make_booking(accepted, BookingStatus.ACCEPTED, start=tomorrow_at(10))
    make_booking(in_progress, BookingStatus.IN_PROGRESS, start=tomorrow_at(8), end=tomorrow_at(9, 30))
    make_booking(pending_only, BookingStatus.PENDING, start=tomorrow_at(9))
    assert _ids(_query(auth_client(customer), category)) == [pending_only.id]
    # Back-to-back is fine: 11:00–13:00 does not overlap 9:00–11:00.
    make_booking(pending_only, BookingStatus.ACCEPTED, start=tomorrow_at(11))
    assert pending_only.id in _ids(_query(auth_client(customer), category))


def test_incomplete_profile_excluded(customer, category, make_technician):
    ok = make_technician()
    make_technician(lat=None)  # no location
    make_technician(phone="")
    make_technician(categories=[])
    assert _ids(_query(auth_client(customer), category)) == [ok.id]


def test_empty_result_has_reason(customer, category):
    r = _query(auth_client(customer), category)
    assert r.status_code == 200
    body = r.json()
    assert body["results"] == []
    assert body["empty_reason"]["code"] == "no_eligible_technicians"
    assert "Plumbing" in body["empty_reason"]["message"]


def test_ranking_uses_distance_and_ratings_and_settings(customer, category, make_technician):
    near = make_technician(lat=7.0083, lng=125.0984)  # ~1 km east
    far_rated = make_technician(lat=7.0083, lng=125.1164, rating_avg=5.0, rating_count=4)  # ~3 km
    ids = _ids(_query(auth_client(customer), category))
    assert set(ids) == {near.id, far_rated.id}
    s = RecommendationSettings.load()
    s.w_p, s.w_r, s.version = 1.0, 0.0, 2
    s.save()
    r = _query(auth_client(customer), category)
    assert _ids(r) == [near.id, far_rated.id]
    assert r.json()["settings"]["version"] == 2
    km = r.json()["results"][0]["distance_km"]
    assert 0.9 < km < 1.1


def test_past_or_misaligned_start_rejected(customer, category, technician):
    client = auth_client(customer)
    assert _query(client, category, start=tomorrow_at(9, 15)).status_code == 400
    assert _query(client, category, start=tomorrow_at(9, days=-2)).status_code == 400


def test_only_customers_can_query(technician, admin_user, category):
    assert _query(auth_client(admin_user), category).status_code == 403
    assert _query(auth_client(technician.user), category).status_code == 403


def test_custom_end_must_fit_slot(customer, category, technician):
    client = auth_client(customer)
    assert _ids(_query(client, category, end=tomorrow_at(16).isoformat())) == [technician.id]
    assert _ids(_query(client, category, end=tomorrow_at(17, 30).isoformat())) == []
    late = tomorrow_at(9) + timedelta(minutes=10)
    assert _query(client, category, end=late.isoformat()).status_code == 400
