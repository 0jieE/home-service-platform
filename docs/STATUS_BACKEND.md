STATUS: DONE — API READY: yes, seeded (http://localhost:8000/api · Swagger http://localhost:8000/api/docs/)

# Backend status

## Milestones
- [x] M1 Infra: docker-compose (PostGIS, Redis), Django project, settings, health endpoint
- [x] M2 Accounts: custom User, JWT, register/login/activate/me, permissions
- [x] M3 Catalog & profiles: categories, customer + technician profiles, availability, coverage polygon
- [x] M4 Admin: applications, verifications, approve/reject, create-account, users, stats
- [x] M5 Recommendations: eligibility + scoring module + Table 3.3 test
- [x] M6 Bookings: lifecycle, transitions, exclusion constraint, history, disputes, reviews
- [x] M7 Realtime + tasks: Channels WS, Celery worker/beat (expire pending)
- [x] M8 Seed, tests green, load script, backup/restore docs, README

## How to run
From the repo root (Docker Desktop running):
```powershell
docker compose up -d --build                                  # db, redis, web, worker, beat
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_demo            # --reset wipes all *@demo.local data and re-seeds
docker compose exec web pytest                                # 134 tests, all green
docker compose exec web python scripts/smoke.py               # 62-check end-to-end run against the live API
```
- API `http://localhost:8000/api/`, WS `ws://localhost:8000/ws/bookings/?token=<access>`, Django admin `/django-admin/`.
- Postgres container on host port **5436** (5432 and 5433 are taken by local PostgreSQL installs here); `DB_HOST_PORT` in a root `.env` overrides.
- Celery does not hot-reload: `docker compose restart worker beat` after editing tasks.
- Real boundary (local dev, once per fresh volume — `seed_demo` keeps whatever area is active):
  `docker compose exec web python manage.py load_coverage data/kidapawan_boundary.geojson --name "City of Kidapawan" --source "PSA PSGC boundaries via faeldon/philippines-json-maps (hires)" --version "PSGC-2026-3q"`
- Details (coverage loading, backup/restore, load test, non-Docker fallback): `backend/README.md`.

## Verified (2026-10-29, fresh volume)
- `docker compose down -v && docker compose up -d --build` → all 5 services up; `migrate` + `seed_demo` succeed.
- `pytest`: 133 passed (Table 3.3 to 4 dp + order A,B,C; each eligibility rule; outside coverage; incomplete profile;
  inactive category; every allowed transition + full forbidden-transition matrix; reason_required; accept re-check;
  two overlapping accepts → `booking_conflict`; DB exclusion constraint directly and with checks bypassed; pending
  doesn't reserve; expiry task; reviews (completed only, once, owner only, aggregates); permissions; auth/activation;
  WebSocket 4401 + event delivery after commit).
- `scripts/smoke.py`: login as every role, recommendations → book → accept → start → request completion → confirm → review
  (with WS events), dispute → admin resolve, application → verification → approve → create account → activate → login.
- Celery beat schedules `expire-stale-pending-bookings` every 15 min; worker executes it.
- Backup → restore round trip with `backend/scripts/backup.sh` / `restore.sh`.
- Locust 25 s / 20 users: 253 requests, 0 failures, recommendations median 63 ms, p95 220 ms.
- `/api/docs/` lists all 48 paths (every contract endpoint + `reissue-code`); CORS preflight from `http://localhost:5173` OK.

## Verified (2026-10-29, real boundary)
- `load_coverage data/kidapawan_boundary.geojson` → active area "City of Kidapawan" vPSGC-2026-3q (406 vertices,
  extent lng 124.9326–125.2250, lat 6.9723–7.1121), `verified=false`; placeholder kept as an inactive row.
- Old seed points for Manongol (6.9850, 125.0600) and Ilomavis (7.0600, 125.1900) fell **outside** the real boundary;
  the seed now uses 7.0218, 125.1238 and 7.0315, 125.2065, and the existing tech6/tech10 profiles were updated in place.
- All 10 seeded approved technicians and both demo customers are inside the boundary. The six `e2e.tech.*@demo.local`
  accounts (frontend Playwright runs) have no location, so they are never recommended — left as is.
- `pytest`: 134 passed (the test DB always uses the placeholder fixture polygon). `GET /api/recommendations/` Plumbing at
  7.0117, 125.0901, 2026-10-30 09:00 → 200 with 3 results (Maricel Santos, Dennis Aquino, Teodoro Lumanog).

## Versions (pinned in backend/requirements.txt)
Python 3.12 (python:3.12-slim) · Django 5.2.18 · djangorestframework 3.18.3 · djangorestframework_simplejwt 5.5.1 ·
django-cors-headers 4.9.0 · django-filter 26.2 · drf-spectacular 0.30.0 · psycopg[binary] 3.3.6 · channels 4.3.2 ·
channels_redis 4.3.0 · daphne 4.2.3 · celery 5.6.3 · redis (py) 8.1.0 · pytest 9.2.0 · pytest-django 4.14.0 · locust 2.47.0 ·
images `postgis/postgis:17-3.5`, `redis:7-alpine`.

## Decisions
- **DB host port 5436** instead of 5433 (port in use). API ports unchanged.
- **Static Celery beat schedule** in `config/celery.py` (no django-celery-beat tables) — leaner on the 2 vCPU / 4 GB target.
- **runserver in compose** (ASGI/Daphne with autoreload, `daphne` first in INSTALLED_APPS); image default CMD is plain `daphne`.
- **Booking.period** is a PostgreSQL generated column `tstzrange(start, end, '[)')`; exclusion constraint
  `booking_no_overlap_reserved` on `(technician =, period &&)` where status in accepted/in_progress (btree_gist).
  Availability slots get a similar exclusion constraint (no overlapping slots of one technician, any state).
- **Single source of truth** for transitions: `apps/bookings/services.action_error()`; `allowed_actions` = actions with no error now.
- **Phone** canonical on `User.phone`; `CustomerProfile` holds default address/location; `TechnicianProfile.phone` is kept in sync.
- **Complete technician profile** = location + phone + ≥1 active category (`missing_fields`: location, phone, service_categories).
- **rating_avg** stored unrounded, `null` when there are no reviews; recomputed with an aggregate on each review in the same transaction.
- **No-rating Q / weights** read from `RecommendationSettings` (singleton pk=1, seeded v1 by migration). Version bumps only on parameter changes; frozen → 409 `settings_frozen`.
- **Technician accounts** are created `is_active=false` with an unusable password; activation sets the password and activates.
  Codes: 8 chars from an unambiguous alphabet (`XXXX-XXXX`), stored with Django's password hasher, 7-day expiry, single use,
  case/hyphen-insensitive. Added `reissue-code` for expired unused codes.
- **Unapproved technicians** get 401 `account_not_approved` at login; inactive users get the standard 401.
- **Cancellation**: customer may cancel pending/accepted before start; technician may cancel accepted (reason required) but
  declines pending. Accept is refused once the start time has passed. Start allowed from 60 min before start.
- **Dispute decisions**: `completed` (confirmed_by admin), `cancelled` (cancelled_by_role admin), `return_in_progress`
  (clears `completion_requested_at` so the technician re-requests). Non-status events are also written to history.
- **Booking create** re-checks eligibility rules 1–5; a reserved overlap at request time is reported as `technician_unavailable`.
- **Custom `end`** accepted on recommendations/bookings if > start, on a 30-minute step and ≤ 12 h; default start + 120 min.
- **Weekdays** for availability generation use 0 = Monday … 6 = Sunday (Python).
- **Throttling**: scope `auth` 30/min per client on register/token/refresh/activate (`AUTH_THROTTLE_RATE`).
- **Coverage tests** for technicians use the planar boundary (`location::geometry` covered by the polygon) — same semantics
  as the customer `ST_Covers` check; distance is `ST_Distance` on geography (meters → km).
- **Seed**: technicians at approximate barangay coordinates (Poblacion, Lanao, Sudapin, Magsaysay, Balindog, Manongol,
  Singao, Amas, Paco, Ilomavis); each has an approved application + TESDA verification record; tech4 and tech7–tech10
  have no reviews; completed bookings span the last ~9 weeks for the weekly chart.
- **Boundary file** `backend/data/kidapawan_boundary.geojson`: PSGC 1204704000, the 40 barangay polygons from
  faeldon/philippines-json-maps (hires, PSGC 2026-3q) dissolved into one polygon. Loaded **without** `--verified` until it is
  checked against an official PSA/NAMRIA source. `ensure_placeholder_area()` (migration/seed) never replaces an active area;
  the test `coverage` fixture always activates its own placeholder box, independent of any data file.
- **Seed coordinates** for Manongol and Ilomavis moved inside the real boundary (see Verified above).
- All deviations/clarifications for the frontend are in `docs/CONTRACT_CHANGES.md`.

## Known gaps
- Local dev coverage is the real PSGC-derived Kidapawan polygon but still `verified=false`, so the API still reports
  `is_placeholder: true`. Re-load with `--verified` once it has been checked against the official boundary. A fresh volume
  starts on the DEV PLACEHOLDER box until `load_coverage` is run.
- Seed coordinates are approximate barangay centres, not surveyed addresses.
- `scripts/smoke.py` leaves rows behind (a booking pair, a technician account, slots); `seed_demo --reset` cleans them.
- No email/SMS delivery: the activation code is shown once to the admin, who hands it to the technician in person.
- Realtime is best-effort (WS push failures are logged, not retried); clients refetch on events and should poll as fallback.
- Throttle counters use the local-memory cache (per process) — fine for one web process; use Redis cache if scaled out.
- Recommendation settings are not frozen yet — freeze in Admin → Settings before the evaluation.
