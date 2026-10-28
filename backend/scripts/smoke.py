"""End-to-end smoke run against a running, seeded API.

    docker compose exec web python scripts/smoke.py            # default base http://localhost:8000
    SMOKE_BASE=http://localhost:8000 python scripts/smoke.py   # from the host (needs `requests`, `websocket-client`)

Creates real rows (bookings, an application, a technician account). Run `seed_demo --reset` to clean up.
"""

import json
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

import requests
import websocket

BASE = os.environ.get("SMOKE_BASE", "http://localhost:8000").rstrip("/")
API = f"{BASE}/api"
MANILA = timezone(timedelta(hours=8))
PASSED = []


def check(label, cond, detail=""):
    if not cond:
        print(f"FAIL  {label} {detail}")
        sys.exit(1)
    PASSED.append(label)
    print(f"ok    {label}")


class Client:
    def __init__(self, email=None, password=None):
        self.s = requests.Session()
        self.token = None
        if email:
            r = self.s.post(f"{API}/auth/token/", json={"email": email, "password": password})
            check(f"login {email}", r.status_code == 200, r.text)
            self.token = r.json()["access"]
            self.user = r.json()["user"]
            self.s.headers["Authorization"] = f"Bearer {self.token}"

    def get(self, path, **params):
        return self.s.get(f"{API}{path}", params=params)

    def post(self, path, body=None):
        return self.s.post(f"{API}{path}", json=body or {})

    def patch(self, path, body):
        return self.s.patch(f"{API}{path}", json=body)


def next_step(minutes_ahead=5):
    now = datetime.now(MANILA) + timedelta(minutes=minutes_ahead)
    rounded = now.replace(second=0, microsecond=0)
    add = (30 - rounded.minute % 30) % 30
    return rounded + timedelta(minutes=add)


class WsListener:
    def __init__(self, token):
        self.messages = []
        url = BASE.replace("http", "ws", 1) + f"/ws/bookings/?token={token}"
        self.ws = websocket.create_connection(url, origin="http://localhost:5173", timeout=5)
        ready = json.loads(self.ws.recv())
        check("websocket connected", ready.get("type") == "connection.ready", str(ready))
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        try:
            while True:
                self.messages.append(json.loads(self.ws.recv()))
        except Exception:
            pass

    def wait_for(self, event, booking_id, timeout=5):
        end = time.time() + timeout
        while time.time() < end:
            if any(m.get("event") == event and m.get("booking_id") == booking_id for m in self.messages):
                return True
            time.sleep(0.1)
        return False


def ensure_slot(tech, start, hours=4):
    r = tech.post("/technicians/me/availability/", {
        "start": (start - timedelta(minutes=30)).isoformat(), "end": (start + timedelta(hours=hours)).isoformat()})
    check("technician adds availability slot", r.status_code in (201, 400), r.text)


def run_booking_to(customer, tech, category, start, until):
    """Book `tech` via recommendations and walk the lifecycle up to `until`."""
    point = customer.get("/customers/me/").json()["default_location"]
    rec = customer.get("/recommendations/", category=category["id"], lat=point["lat"], lng=point["lng"], start=start.isoformat())
    check("recommendations 200", rec.status_code == 200, rec.text)
    body = rec.json()
    ids = [r["technician"]["id"] for r in body["results"]]
    check("technician appears in recommendations", tech.user["technician_profile_id"] in ids, json.dumps(body)[:400])
    scores = [r["score"] for r in body["results"]]
    check("results sorted by score", scores == sorted(scores, reverse=True))
    r = customer.post("/bookings/", {
        "technician_id": tech.user["technician_profile_id"], "category_id": category["id"], "location": point,
        "address": "Smoke test address", "start": start.isoformat(), "notes": "smoke"})
    check("create booking", r.status_code == 201, r.text)
    booking = r.json()
    bid = booking["id"]
    steps = [("accept", tech, {}), ("start", tech, {}), ("request-completion", tech, {"notes": "done"})]
    for name, actor, data in steps:
        r = actor.post(f"/bookings/{bid}/{name}/", data)
        check(f"booking {name}", r.status_code == 200, r.text)
        if name == until:
            break
    return bid


def main():
    s = requests.Session()
    check("health", s.get(f"{API}/health/").json() == {"status": "ok"})
    cfg = s.get(f"{API}/config/").json()
    check("config", cfg["booking_block_minutes"] > 0 and "recommendation_settings" in cfg)
    check("coverage", s.get(f"{API}/coverage/").json()["geometry"]["type"] in ("Polygon", "MultiPolygon"))
    check("coverage check", s.post(f"{API}/coverage/check/", json={"lat": 7.0083, "lng": 125.0894}).json() == {"inside": True})
    categories = {c["name"]: c for c in s.get(f"{API}/categories/").json()}
    check("8 categories", len(categories) >= 8)
    check("api docs page", s.get(f"{BASE}/api/docs/").status_code == 200)
    check("schema", s.get(f"{BASE}/api/schema/").status_code == 200)

    admin = Client("admin@demo.local", "Admin123!")
    ana = Client("customer@demo.local", "Customer123!")
    jose = Client("customer2@demo.local", "Customer123!")
    dennis = Client("tech8@demo.local", "Tech123!")   # Plumbing, Electrical
    teodoro = Client("tech10@demo.local", "Tech123!")  # Plumbing, Carpentry, Welding

    check("technician list", ana.get("/technicians/").json()["count"] == 10)
    tid = dennis.user["technician_profile_id"]
    check("technician detail", ana.get(f"/technicians/{tid}/").json()["verification_summary"] != [])
    check("technician availability", "slots" in ana.get(f"/technicians/{tid}/availability/").json())
    check("technician me", dennis.get("/technicians/me/").json()["missing_fields"] == [])
    check("bookings list (customer)", ana.get("/bookings/").json()["count"] >= 1)

    # --- full happy path with realtime event ---
    start = next_step()
    ensure_slot(dennis, start)
    ws = WsListener(ana.token)
    bid = run_booking_to(ana, dennis, categories["Plumbing"], start, until="request-completion")
    check("ws event: accepted", ws.wait_for("accepted", bid))
    check("ws event: completion_requested", ws.wait_for("completion_requested", bid))
    detail = ana.get(f"/bookings/{bid}/").json()
    check("customer sees confirm + dispute", detail["allowed_actions"] == ["confirm_completion", "dispute"])
    r = ana.post(f"/bookings/{bid}/confirm-completion/")
    check("confirm completion", r.status_code == 200 and r.json()["status"] == "completed", r.text)
    r = ana.post(f"/bookings/{bid}/review/", {"rating": 5, "comment": "Smoke test review"})
    check("review", r.status_code == 201, r.text)
    check("review only once", ana.post(f"/bookings/{bid}/review/", {"rating": 4}).json()["code"] == "already_reviewed")
    history = ana.get(f"/bookings/{bid}/").json()["status_history"]
    check("status history", [h["event"] for h in history] ==
          ["created", "accepted", "started", "completion_requested", "completed"], str(history))
    check("ws event: completed", ws.wait_for("completed", bid))
    ws.ws.close()

    # --- dispute opened by customer, resolved by admin ---
    start2 = next_step()
    ensure_slot(teodoro, start2)
    bid2 = run_booking_to(jose, teodoro, categories["Plumbing"], start2, until="request-completion")
    r = jose.post(f"/bookings/{bid2}/dispute/", {"reason": "Pipe still drips"})
    check("open dispute", r.status_code == 200 and r.json()["dispute"]["status"] == "open", r.text)
    disputes = admin.get("/admin/disputes/", status="open").json()["results"]
    dispute = next(d for d in disputes if d["booking"]["id"] == bid2)
    r = admin.post(f"/admin/disputes/{dispute['id']}/resolve/", {"decision": "completed", "admin_notes": "Photos show it fixed"})
    check("resolve dispute", r.status_code == 200 and r.json()["status"] == "resolved", r.text)
    check("booking completed by admin", jose.get(f"/bookings/{bid2}/").json()["confirmed_by"] == "admin")

    # --- forbidden things ---
    check("customer cannot see other's booking", jose.get(f"/bookings/{bid}/").status_code == 403)
    check("technician cannot accept other's booking", teodoro.post(f"/bookings/{bid}/accept/").status_code == 403)
    check("non-admin blocked from admin", ana.get("/admin/stats/").status_code == 403)
    point = ana.get("/customers/me/").json()["default_location"]
    out = ana.get("/recommendations/", category=categories["Plumbing"]["id"], lat=7.5, lng=124.5, start=next_step(1440).isoformat())
    check("outside coverage error", out.json().get("code") == "outside_coverage")

    # --- application -> account -> activation -> login ---
    email = f"smoke.{int(time.time())}@demo.local"
    r = admin.post("/admin/applications/", {"first_name": "Smoke", "last_name": "Tester", "email": email, "phone": "09170001111",
                                            "address": "Brgy. Poblacion", "requested_category_ids": [categories["Electrical"]["id"]],
                                            "notes": "smoke"})
    check("create application", r.status_code == 201, r.text)
    app_id = r.json()["id"]
    r = admin.post(f"/admin/applications/{app_id}/verifications/", {
        "credential_type": "TESDA EIM NC II", "method": "official_portal", "outcome": "verified",
        "checked_on": datetime.now(MANILA).date().isoformat(), "notes": ""})
    check("add verification", r.status_code == 201, r.text)
    check("approve application", admin.post(f"/admin/applications/{app_id}/approve/").json()["status"] == "approved")
    r = admin.post(f"/admin/applications/{app_id}/create-account/")
    check("create technician account", r.status_code == 201, r.text)
    code = r.json()["activation_code"]
    r = s.post(f"{API}/auth/activate/", json={"email": email, "activation_code": code, "password": "SmokeTech2026!"})
    check("activate", r.status_code == 200, r.text)
    new_tech = Client(email, "SmokeTech2026!")
    check("new technician profile", "location" in new_tech.get("/technicians/me/").json()["missing_fields"])

    # --- admin views ---
    stats = admin.get("/admin/stats/").json()
    check("admin stats", stats["totals"]["completed_bookings"] >= 2 and len(stats["bookings_per_week"]) == 12)
    check("admin users", admin.get("/admin/users/", role="technician").json()["count"] >= 11)
    check("admin settings", admin.get("/admin/recommendation-settings/").json()["version"] >= 1)
    check("admin coverage", "is_placeholder" in admin.get("/admin/coverage/").json())
    check("admin applications", admin.get("/admin/applications/", status="approved").json()["count"] >= 1)
    check("logout", ana.post("/auth/logout/", {"refresh": "invalid"}).status_code == 204)

    print(f"\nSMOKE PASSED: {len(PASSED)} checks")


if __name__ == "__main__":
    main()
