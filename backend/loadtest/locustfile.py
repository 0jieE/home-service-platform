"""Load test for the two hot read paths (SPEC §8 performance): recommendations and booking lists.

Run against a seeded stack (headless, 20 users, 2 min):
    docker compose exec web locust -f loadtest/locustfile.py --host http://localhost:8000 \
        --headless -u 20 -r 5 -t 2m --csv /tmp/loadtest
Or with the web UI on http://localhost:8089 (publish the port first):
    docker compose run --rm -p 8089:8089 web locust -f loadtest/locustfile.py --host http://web:8000
"""

import random
from datetime import datetime, time, timedelta, timezone

from locust import HttpUser, between, task

MANILA = timezone(timedelta(hours=8))
CUSTOMERS = [("customer@demo.local", "Customer123!"), ("customer2@demo.local", "Customer123!")]
TECHNICIANS = [(f"tech{i}@demo.local", "Tech123!") for i in range(1, 11)]
# Points inside the Kidapawan placeholder boundary (barangays used by the seed).
POINTS = [(7.0083, 125.0894), (7.0005, 125.0763), (7.0175, 125.0955), (7.0230, 125.0800), (7.0420, 125.0830),
          (7.0050, 125.1150), (7.0200, 125.1000), (7.0300, 125.1150)]


def future_start() -> str:
    day = datetime.now(MANILA).date() + timedelta(days=random.randint(1, 14))
    if day.weekday() == 6:
        day += timedelta(days=1)
    slot = time(random.choice([8, 9, 10, 11, 13, 14]), random.choice([0, 30]))
    return datetime.combine(day, slot, tzinfo=MANILA).isoformat()


class _Authed(HttpUser):
    abstract = True
    accounts: list = []

    def on_start(self):
        email, password = random.choice(self.accounts)
        r = self.client.post("/api/auth/token/", json={"email": email, "password": password}, name="auth/token")
        r.raise_for_status()
        self.client.headers["Authorization"] = f"Bearer {r.json()['access']}"


class CustomerUser(_Authed):
    weight = 3
    wait_time = between(1, 3)
    accounts = CUSTOMERS

    def on_start(self):
        super().on_start()
        self.categories = [c["id"] for c in self.client.get("/api/categories/", name="categories").json()]

    @task(5)
    def recommendations(self):
        lat, lng = random.choice(POINTS)
        self.client.get(
            "/api/recommendations/",
            params={"category": random.choice(self.categories), "lat": lat, "lng": lng, "start": future_start()},
            name="recommendations",
        )

    @task(3)
    def my_bookings(self):
        self.client.get("/api/bookings/", params={"status": ["pending", "accepted", "in_progress"]}, name="bookings (active)")

    @task(1)
    def browse_technicians(self):
        self.client.get("/api/technicians/", params={"category": random.choice(self.categories)}, name="technicians")


class TechnicianUser(_Authed):
    weight = 1
    wait_time = between(2, 5)
    accounts = TECHNICIANS

    @task(3)
    def requests_inbox(self):
        self.client.get("/api/bookings/", params={"status": "pending"}, name="bookings (pending)")

    @task(1)
    def upcoming_jobs(self):
        self.client.get("/api/bookings/", params={"upcoming": "true"}, name="bookings (upcoming)")
