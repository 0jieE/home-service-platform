import pytest

from apps.accounts.models import Role, User
from conftest import auth_client

pytestmark = pytest.mark.django_db


def login(api, email, password):
    return api.post("/api/auth/token/", {"email": email, "password": password}, format="json")


def test_health_is_public(api):
    assert api.get("/api/health/").json() == {"status": "ok"}


def test_register_creates_customer(api):
    r = api.post("/api/auth/register/", {"email": "New@Mail.com", "password": "Kidapawan2026!", "first_name": "Ana",
                                         "last_name": "Cruz", "phone": "09171234567"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["role"] == "customer" and body["email"] == "new@mail.com" and body["full_name"] == "Ana Cruz"
    assert body["technician_profile_id"] is None
    user = User.objects.get(email="new@mail.com")
    assert user.customer_profile is not None and user.check_password("Kidapawan2026!")
    dup = api.post("/api/auth/register/", {"email": "new@mail.com", "password": "Kidapawan2026!", "first_name": "A",
                                           "last_name": "B"}, format="json")
    assert dup.status_code == 400 and "email" in dup.json()


def test_register_rejects_weak_password(api):
    r = api.post("/api/auth/register/", {"email": "x@y.z", "password": "12345678", "first_name": "A", "last_name": "B"},
                 format="json")
    assert r.status_code == 400


def test_login_refresh_logout(api, customer):
    r = login(api, "CUST@test.local", "Secret123!")
    assert r.status_code == 200, r.content
    body = r.json()
    assert {"access", "refresh", "user"} <= body.keys()
    assert body["user"]["email"] == "cust@test.local" and body["user"]["role"] == "customer"
    me = api.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert me.status_code == 200 and me.json()["id"] == customer.id
    r2 = api.post("/api/auth/token/refresh/", {"refresh": body["refresh"]}, format="json")
    assert r2.status_code == 200 and {"access", "refresh"} <= r2.json().keys()
    # rotation + blacklist: the old refresh token no longer works
    assert api.post("/api/auth/token/refresh/", {"refresh": body["refresh"]}, format="json").status_code == 401
    new_refresh = r2.json()["refresh"]
    assert api.post("/api/auth/logout/", {"refresh": new_refresh}, format="json").status_code == 204
    assert api.post("/api/auth/token/refresh/", {"refresh": new_refresh}, format="json").status_code == 401


def test_wrong_password_401_with_code(api, customer):
    r = login(api, "cust@test.local", "nope")
    assert r.status_code == 401 and "code" in r.json()


def test_unauthenticated_is_401(api):
    r = api.get("/api/auth/me/")
    assert r.status_code == 401 and r.json()["code"] == "not_authenticated"


def test_me_patch_and_change_password(customer):
    client = auth_client(customer)
    r = client.patch("/api/auth/me/", {"first_name": "Anna", "phone": "0999", "role": "admin"}, format="json")
    assert r.status_code == 200 and r.json()["first_name"] == "Anna" and r.json()["role"] == "customer"
    r = client.post("/api/auth/change-password/", {"old_password": "bad", "new_password": "NewPass2026!"}, format="json")
    assert r.status_code == 400
    r = client.post("/api/auth/change-password/", {"old_password": "Secret123!", "new_password": "NewPass2026!"}, format="json")
    assert r.status_code == 204
    customer.refresh_from_db()
    assert customer.check_password("NewPass2026!")


def test_customer_profile(customer):
    client = auth_client(customer)
    r = client.patch("/api/customers/me/", {"phone": "0917", "default_address": "Brgy. Lanao",
                                            "default_location": {"lat": 7.0, "lng": 125.08}}, format="json")
    assert r.status_code == 200, r.content
    assert r.json() == {"phone": "0917", "default_address": "Brgy. Lanao", "default_location": {"lat": 7.0, "lng": 125.08}}
    r = client.patch("/api/customers/me/", {"default_location": {"lat": 8.0, "lng": 125.08}}, format="json")
    assert r.status_code == 400 and r.json()["code"] == "outside_coverage"
    r = client.patch("/api/customers/me/", {"default_location": {"lat": 95, "lng": 125.08}}, format="json")
    assert r.status_code == 400 and "default_location" in r.json()


def test_customer_profile_requires_customer_role(technician):
    assert auth_client(technician.user).get("/api/customers/me/").status_code == 403


def test_inactive_and_unapproved_technicians_cannot_log_in(api, make_technician):
    inactive = make_technician(active=False)
    unapproved = make_technician(approved=False)
    ok = make_technician()
    assert login(api, inactive.user.email, "Secret123!").status_code == 401
    r = login(api, unapproved.user.email, "Secret123!")
    assert r.status_code == 401 and r.json()["code"] == "account_not_approved"
    r = login(api, ok.user.email, "Secret123!")
    assert r.status_code == 200 and r.json()["user"]["technician_profile_id"] == ok.id


def test_deactivated_user_token_stops_working(api, customer):
    access = login(api, "cust@test.local", "Secret123!").json()["access"]
    User.objects.filter(pk=customer.pk).update(is_active=False)
    assert api.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}").status_code == 401


def test_admin_role_is_staff(make_user):
    admin = make_user(Role.ADMIN)
    assert admin.is_staff
    assert not make_user(Role.CUSTOMER).is_staff
