"""Admin: applications -> verification -> approve -> create account -> activate -> login; users; stats; settings."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import ActivationCode, Role, User
from apps.applications.models import TechnicianApplication
from apps.bookings.models import BookingStatus
from conftest import auth_client

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(admin_user):
    return auth_client(admin_user)


def _create_application(admin_client, category, email="juan@example.com"):
    r = admin_client.post("/api/admin/applications/", {
        "first_name": "Juan", "last_name": "Dela Cruz", "email": email, "phone": "09181112222",
        "address": "Brgy. Sudapin", "requested_category_ids": [category.id], "notes": "Walk-in",
    }, format="json")
    assert r.status_code == 201, r.content
    return r.json()


def test_full_application_to_login_flow(api, admin_client, category):
    app = _create_application(admin_client, category)
    assert app["status"] == "submitted" and app["account_created"] is False
    assert app["requested_categories"][0]["name"] == "Plumbing"

    r = admin_client.post(f"/api/admin/applications/{app['id']}/create-account/")
    assert r.status_code == 409 and r.json()["code"] == "application_not_approved"

    r = admin_client.patch(f"/api/admin/applications/{app['id']}/", {"status": "under_review"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "under_review"
    r = admin_client.patch(f"/api/admin/applications/{app['id']}/", {"status": "approved"}, format="json")
    assert r.status_code == 400

    r = admin_client.post(f"/api/admin/applications/{app['id']}/verifications/", {
        "credential_type": "TESDA NC II", "method": "official_portal", "outcome": "verified",
        "checked_on": "2026-10-01", "notes": "Checked on TESDA portal",
    }, format="json")
    assert r.status_code == 201 and r.json()["checked_by_name"]

    r = admin_client.post(f"/api/admin/applications/{app['id']}/approve/")
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["decided_by_name"]
    assert admin_client.post(f"/api/admin/applications/{app['id']}/reject/", {"reason": "x"}).status_code == 409

    r = admin_client.post(f"/api/admin/applications/{app['id']}/create-account/")
    assert r.status_code == 201, r.content
    body = r.json()
    code = body["activation_code"]
    assert len(code) == 9 and code[4] == "-"
    assert body["user"]["role"] == "technician" and body["user"]["is_active"] is False
    assert body["technician_profile_id"]
    record = ActivationCode.objects.get(user__email="juan@example.com")
    assert code.replace("-", "") not in record.code_hash  # stored hashed
    assert record.expires_at - timezone.now() > timedelta(days=6, hours=23)

    r = admin_client.post(f"/api/admin/applications/{app['id']}/create-account/")
    assert r.status_code == 409 and r.json()["code"] == "account_exists"
    assert admin_client.get(f"/api/admin/applications/{app['id']}/").json()["account_created"] is True

    # cannot log in before activation
    assert api.post("/api/auth/token/", {"email": "juan@example.com", "password": "Whatever123!"}).status_code == 401
    r = api.post("/api/auth/activate/", {"email": "juan@example.com", "activation_code": "AAAA-BBBB", "password": "Technician2026!"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_activation"
    r = api.post("/api/auth/activate/", {"email": "juan@example.com", "activation_code": code.lower(), "password": "Technician2026!"})
    assert r.status_code == 200, r.content
    r = api.post("/api/auth/activate/", {"email": "juan@example.com", "activation_code": code, "password": "Technician2026!"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_activation"  # single use

    r = api.post("/api/auth/token/", {"email": "juan@example.com", "password": "Technician2026!"})
    assert r.status_code == 200
    access = r.json()["access"]
    me = api.get("/api/technicians/me/", HTTP_AUTHORIZATION=f"Bearer {access}").json()
    assert me["verification_summary"][0]["credential_type"] == "TESDA NC II"
    assert set(me["missing_fields"]) == {"location"}
    assert [c["name"] for c in me["specializations"]] == ["Plumbing"]


def test_expired_activation_code(api, admin_client, category):
    app = _create_application(admin_client, category)
    admin_client.post(f"/api/admin/applications/{app['id']}/approve/")
    code = admin_client.post(f"/api/admin/applications/{app['id']}/create-account/").json()["activation_code"]
    ActivationCode.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    r = api.post("/api/auth/activate/", {"email": "juan@example.com", "activation_code": code, "password": "Technician2026!"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_activation"
    new_code = admin_client.post(f"/api/admin/applications/{app['id']}/reissue-code/").json()["activation_code"]
    r = api.post("/api/auth/activate/", {"email": "juan@example.com", "activation_code": new_code, "password": "Technician2026!"})
    assert r.status_code == 200


def test_reject_requires_reason(admin_client, category):
    app = _create_application(admin_client, category)
    r = admin_client.post(f"/api/admin/applications/{app['id']}/reject/", {"reason": ""}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "reason_required"
    r = admin_client.post(f"/api/admin/applications/{app['id']}/reject/", {"reason": "Expired certificate"}, format="json")
    assert r.json()["status"] == "rejected" and r.json()["rejection_reason"] == "Expired certificate"
    assert admin_client.post(f"/api/admin/applications/{app['id']}/create-account/").json()["code"] == "application_not_approved"


def test_create_account_email_taken(admin_client, category, customer):
    app = _create_application(admin_client, category, email=customer.email)
    admin_client.post(f"/api/admin/applications/{app['id']}/approve/")
    r = admin_client.post(f"/api/admin/applications/{app['id']}/create-account/")
    assert r.status_code == 409 and r.json()["code"] == "account_exists"


def test_application_filters(admin_client, category):
    _create_application(admin_client, category, "a@x.com")
    b = _create_application(admin_client, category, "b@x.com")
    admin_client.post(f"/api/admin/applications/{b['id']}/approve/")
    assert admin_client.get("/api/admin/applications/?status=approved").json()["count"] == 1
    assert admin_client.get("/api/admin/applications/?search=a@x").json()["count"] == 1


# --- permissions --------------------------------------------------------------------

ADMIN_GETS = ["/api/admin/stats/", "/api/admin/applications/", "/api/admin/users/", "/api/admin/disputes/",
              "/api/admin/recommendation-settings/", "/api/admin/coverage/"]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_non_admin_blocked_from_admin_endpoints(path, api, customer, technician, admin_client):
    assert api.get(path).status_code == 401
    assert auth_client(customer).get(path).status_code == 403
    assert auth_client(technician.user).get(path).status_code == 403
    assert admin_client.get(path).status_code == 200


def test_customer_cannot_see_other_customers_booking(customer, other_customer, technician, make_booking):
    b = make_booking(technician)
    assert auth_client(other_customer).get(f"/api/bookings/{b.id}/").status_code == 403
    assert auth_client(other_customer).get("/api/bookings/").json()["count"] == 0
    assert auth_client(customer).get("/api/bookings/").json()["count"] == 1
    assert auth_client(other_customer).post(f"/api/bookings/{b.id}/cancel/").status_code == 403


def test_technician_cannot_accept_someone_elses_booking(technician, make_technician, make_booking, admin_user):
    other = make_technician()
    b = make_booking(technician)
    r = auth_client(other.user).post(f"/api/bookings/{b.id}/accept/")
    assert r.status_code == 403
    assert auth_client(other.user).get("/api/bookings/").json()["count"] == 0
    assert auth_client(admin_user).get("/api/bookings/").json()["count"] == 1
    assert auth_client(admin_user).post(f"/api/bookings/{b.id}/accept/").status_code == 403


def test_booking_list_filters(customer, technician, make_booking):
    make_booking(technician, BookingStatus.PENDING)
    make_booking(technician, BookingStatus.COMPLETED, start=timezone.now() - timedelta(days=3))
    client = auth_client(customer)
    assert client.get("/api/bookings/?status=pending&status=completed").json()["count"] == 2
    assert client.get("/api/bookings/?status=completed").json()["count"] == 1
    assert client.get("/api/bookings/?upcoming=true").json()["count"] == 1


# --- users ------------------------------------------------------------------------

def test_admin_users_list_and_deactivate(admin_client, admin_user, customer, technician):
    r = admin_client.get("/api/admin/users/?role=technician")
    assert r.json()["count"] == 1 and r.json()["results"][0]["technician_profile_id"] == technician.id
    assert admin_client.get("/api/admin/users/?search=cust@").json()["count"] == 1
    r = admin_client.patch(f"/api/admin/users/{customer.id}/", {"is_active": False}, format="json")
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert admin_client.get("/api/admin/users/?is_active=false").json()["count"] == 1
    r = admin_client.patch(f"/api/admin/users/{admin_user.id}/", {"is_active": False}, format="json")
    assert r.status_code == 400


# --- stats / settings / coverage / categories -------------------------------------------

def test_admin_stats_shape(admin_client, customer, technician, make_booking):
    make_booking(technician, BookingStatus.COMPLETED, start=timezone.now() - timedelta(days=2))
    body = admin_client.get("/api/admin/stats/").json()
    t = body["totals"]
    assert t["customers"] == 1 and t["technicians"] == 1 and t["active_technicians"] == 1
    assert t["bookings"] == 1 and t["completed_bookings"] == 1 and t["avg_rating"] is None
    assert {row["status"] for row in body["bookings_by_status"]} == {s for s, _ in BookingStatus.choices}
    assert body["bookings_by_category"] == [{"category": "Plumbing", "count": 1}]
    assert len(body["bookings_per_week"]) == 12 and body["bookings_per_week"][-1]["count"] == 1
    assert body["top_technicians"][0]["completed"] == 1


def test_recommendation_settings_versioning_and_freeze(admin_client):
    r = admin_client.get("/api/admin/recommendation-settings/")
    assert r.json()["version"] == 1 and r.json()["is_frozen"] is False
    assert admin_client.patch("/api/admin/recommendation-settings/", {"w_p": 0.6}, format="json").status_code == 400
    r = admin_client.patch("/api/admin/recommendation-settings/", {"w_p": 0.7, "w_r": 0.3}, format="json")
    assert r.status_code == 200 and r.json()["version"] == 2
    r = admin_client.patch("/api/admin/recommendation-settings/", {"is_frozen": True}, format="json")
    assert r.json()["is_frozen"] is True and r.json()["version"] == 2
    r = admin_client.patch("/api/admin/recommendation-settings/", {"d0_km": 2}, format="json")
    assert r.status_code == 409
    r = admin_client.patch("/api/admin/recommendation-settings/", {"is_frozen": False, "d0_km": 2}, format="json")
    assert r.status_code == 200 and r.json()["version"] == 3 and r.json()["d0_km"] == 2.0


def test_coverage_endpoints(api, admin_client):
    r = api.get("/api/coverage/")
    assert r.status_code == 200 and r.json()["geometry"]["type"] == "MultiPolygon" and r.json()["verified"] is False
    assert admin_client.get("/api/admin/coverage/").json()["is_placeholder"] is True
    assert api.post("/api/coverage/check/", {"lat": 7.0083, "lng": 125.0894}, format="json").json() == {"inside": True}
    assert api.post("/api/coverage/check/", {"lat": 7.2, "lng": 125.0894}, format="json").json() == {"inside": False}
    assert api.post("/api/coverage/check/", {"lat": 700, "lng": 1}, format="json").status_code == 400
    cfg = api.get("/api/config/").json()
    assert cfg["booking_block_minutes"] == 120 and cfg["slot_step_minutes"] == 30
    assert cfg["timezone"] == "Asia/Manila" and cfg["coverage"]["verified"] is False


def test_categories_crud(api, admin_client, customer, category, technician):
    assert [c["name"] for c in api.get("/api/categories/").json()] == ["Plumbing"]
    r = admin_client.post("/api/categories/", {"name": "Aircon Repair", "icon": "snowflake"}, format="json")
    assert r.status_code == 201 and r.json()["slug"] == "aircon-repair"
    assert auth_client(customer).post("/api/categories/", {"name": "X"}, format="json").status_code == 403
    new_id = r.json()["id"]
    assert admin_client.patch(f"/api/categories/{new_id}/", {"is_active": False}, format="json").json()["is_active"] is False
    assert len(api.get("/api/categories/").json()) == 1
    assert len(admin_client.get("/api/categories/?include_inactive=true").json()) == 2
    assert admin_client.delete(f"/api/categories/{new_id}/").status_code == 204  # unused -> hard delete
    assert admin_client.delete(f"/api/categories/{category.id}/").status_code == 204  # in use -> deactivated
    category.refresh_from_db()
    assert category.is_active is False


def test_load_coverage_command(tmp_path):
    import json

    from django.core.management import call_command

    from apps.geo.models import CoverageArea

    path = tmp_path / "city.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {
        "type": "Polygon", "coordinates": [[[125.0, 6.95], [125.2, 6.95], [125.2, 7.1], [125.0, 7.1], [125.0, 6.95]]]}}]}))
    call_command("load_coverage", str(path), "--name", "Kidapawan City", "--source", "PSA (HDX)", "--version", "2023", "--verified")
    active = CoverageArea.objects.get(is_active=True)
    assert active.verified and active.source == "PSA (HDX)" and not active.is_placeholder
    assert CoverageArea.objects.count() == 2


def test_ensure_placeholder_area_never_replaces_active_area(tmp_path):
    import json

    from django.core.management import call_command

    from apps.geo.models import CoverageArea
    from apps.geo.services import ensure_placeholder_area

    path = tmp_path / "city.geojson"
    path.write_text(json.dumps({"type": "Feature", "properties": {}, "geometry": {
        "type": "Polygon", "coordinates": [[[124.95, 6.98], [125.2, 6.98], [125.2, 7.1], [124.95, 7.1], [124.95, 6.98]]]}}))
    call_command("load_coverage", str(path), "--name", "City of Kidapawan", "--source", "PSA PSGC", "--version", "PSGC-2026-3q")
    real = CoverageArea.objects.get(is_active=True)
    assert ensure_placeholder_area() == real
    assert CoverageArea.objects.get(is_active=True) == real and CoverageArea.objects.count() == 2
