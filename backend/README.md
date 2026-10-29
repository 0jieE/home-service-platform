# Backend — Django REST + PostGIS

API for the Location-Aware Decision Support Platform for Home Service Technician Matching and Booking (Kidapawan City).
Contract: `../docs/API_CONTRACT.md` (+ `../docs/CONTRACT_CHANGES.md`). Requirements: `../docs/SPEC.md`.

## Stack (exact versions in `requirements.txt`)
Python 3.12 · Django 5.2.18 LTS · DRF 3.18.3 · SimpleJWT 5.5.1 (blacklist) · django-cors-headers 4.9.0 · django-filter 26.2 ·
drf-spectacular 0.30.0 · PostgreSQL 17 + PostGIS 3.5 (GeoDjango) · Channels 4.3.2 + channels-redis 4.3.0 + Daphne 4.2.3 ·
Celery 5.6.3 + Redis 7 · pytest 9.2.0 + pytest-django 4.14.0 · Locust 2.47.0.

## Run (Docker — recommended on Windows)
From the **repo root**:
```powershell
copy backend\.env.example backend\.env      # first time only; edit DJANGO_SECRET_KEY
docker compose up -d --build                # db, redis, web (runs migrations), worker, beat
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_demo          # add --reset to wipe & recreate demo data
docker compose exec web pytest                              # full test suite against PostGIS
docker compose exec web python scripts/smoke.py             # end-to-end smoke run (creates rows)
```
- API `http://localhost:8000/api/` · Swagger `http://localhost:8000/api/docs/` · OpenAPI `http://localhost:8000/api/schema/` ·
  Django admin `http://localhost:8000/django-admin/` (login `admin@demo.local` / `Admin123!`).
- WebSocket `ws://localhost:8000/ws/bookings/?token=<access>`.
- The DB container is published on host port **5436** (5432/5433 are used by local PostgreSQL installs). Override with
  `DB_HOST_PORT=5433` in a root `.env`. pgAdmin: `localhost:5436`, db `service_platform`, user/password `postgres`.
- `web` uses `runserver` (ASGI via Daphne, auto-reload). Production-style: `daphne -b 0.0.0.0 -p 8000 config.asgi:application`
  (also the image's default `CMD`). Celery does **not** hot-reload: `docker compose restart worker beat` after task changes.

Demo accounts (contract §5): `admin@demo.local / Admin123!`, `customer@demo.local`, `customer2@demo.local / Customer123!`,
`tech1@demo.local … tech10@demo.local / Tech123!`.

## Production (Render)
- `requirements.txt` = runtime only (adds `dj-database-url`, `whitenoise`); `requirements-dev.txt` adds pytest + locust.
  docker compose builds with `REQUIREMENTS=requirements-dev.txt`; the plain `docker build` (Render) uses runtime deps.
- `DATABASE_URL` overrides the `DB_*` variables (PostGIS engine, SSL required when `DEBUG=False`).
  `DEBUG=False` requires `DJANGO_SECRET_KEY` and enables secure cookies / proxy SSL header / HSTS; static files via WhiteNoise
  (collected at image build).
- `scripts/start.sh` (Render start command): migrate, then Daphne on `$PORT` + Celery worker with embedded beat, supervised.
- Steps and decisions: `../docs/DEPLOY.md`; Blueprint: `../render.yaml`.

## Layout
```
config/            settings.py (env-driven), settings_test.py, urls.py, api_urls.py, asgi.py, celery.py
apps/accounts/     User (email login, role), CustomerProfile, ActivationCode, auth views, permissions, error handler, seed_demo
apps/catalog/      ServiceCategory
apps/technicians/  TechnicianProfile, TechnicianService, Availability (+ no-overlap exclusion constraint), discovery & self-service
apps/applications/ TechnicianApplication, VerificationRecord, approve/reject/create-account, admin users
apps/geo/          CoverageArea, is_inside_coverage (ST_Covers), load_coverage command, /config /coverage
apps/recommendations/ engine.py (pure scoring), eligibility.py (5 rules, ST_Distance on geography), settings singleton
apps/bookings/     Booking (+ generated tstzrange period, exclusion constraint), history, disputes, reviews,
                   services.py (the only place that changes status), consumers.py / routing.py (Channels), tasks.py (Celery)
apps/dashboard/    /admin/stats
apps/core/         time helpers (Asia/Manila, 30-minute steps)
loadtest/          locustfile.py
scripts/           backup.sh, restore.sh, smoke.py
```

## Key rules (where they live)
- **Scores**: `apps/recommendations/engine.py` — `P = 1/(1+d/d0)`, `Q = (r̄−1)/4` (0.5 when unrated), `S = w_p·P + w_r·Q`,
  order `(-S, distance, id)`; no rounding. Table 3.3 regression: `apps/recommendations/tests/test_engine.py`.
- **Eligibility**: `apps/recommendations/eligibility.py` — approved + active + complete profile, active category,
  both points inside the active boundary, one `available` slot fully containing `[start, end)`, no overlapping
  accepted/in-progress booking. Re-run on booking creation and inside the accept transaction.
- **Bookings**: `apps/bookings/services.py` — `action_error()` is the single source of truth for both the transition
  checks and `allowed_actions`. Accept locks the booking and the technician row (`select_for_update`), re-checks
  eligibility, and the PostgreSQL exclusion constraint `booking_no_overlap_reserved`
  (`technician WITH =, period WITH &&` where status in accepted/in_progress, via `btree_gist`) turns any race into
  409 `booking_conflict`. Every change writes `BookingStatusHistory` and pushes `booking.updated` after commit.
- **Expiry**: Celery beat every 15 min runs `expire_stale_pending_bookings` (pending with start ≤ now → cancelled,
  actor system, reason `expired`).
- Appointment block = `BOOKING_BLOCK_MINUTES` (120), start on 30-minute steps, start ≤ 60 min early.

## Coverage boundary
A DEV PLACEHOLDER box (lat 6.93–7.12, lng 125.00–125.25, `verified=false`) is created by migration `geo.0002`.
For local dev, load the bundled PSGC-derived city polygon (not yet verified, so no `--verified`):
```powershell
docker compose exec web python manage.py load_coverage data/kidapawan_boundary.geojson `
    --name "City of Kidapawan" --source "PSA PSGC boundaries via faeldon/philippines-json-maps (hires)" --version "PSGC-2026-3q"
```
Add `--verified` only after checking it against an official PSA/NAMRIA boundary. Tests never read this file: the
`coverage` fixture in `conftest.py` always activates the placeholder box.
Other boundary files must live under `backend/` to be visible in the container (`/app/...`). The previous boundary is kept but inactive.

## Backup / restore (pg_dump / pg_restore)
From the repo root in Git Bash / WSL:
```sh
sh backend/scripts/backup.sh                 # -> backups/service_platform_YYYYmmdd_HHMMSS.dump (custom format)
sh backend/scripts/restore.sh backups/<file>.dump   # stops web/worker/beat, recreates the DB, restores, restarts
```
PowerShell equivalent of the backup: `docker compose exec -T db pg_dump -U postgres -d service_platform -Fc --no-owner > backups\x.dump`
(use `cmd /c` redirection or Git Bash for binary-safe output). `backups/` and `*.dump` are gitignored.

## Load test
```powershell
docker compose exec web locust -f loadtest/locustfile.py --host http://localhost:8000 --headless -u 20 -r 5 -t 2m --only-summary
```
Exercises login, recommendations, booking lists (customer and technician) and technician discovery with seed accounts.

## Running without Docker (fallback, not used for the build)
1. PostgreSQL 17 + PostGIS 3.5 (Stack Builder → Spatial Extensions). `createdb service_platform`, then
   `psql -d service_platform -c "CREATE EXTENSION postgis; CREATE EXTENSION btree_gist;"`.
2. GDAL/GEOS via OSGeo4W; set `GDAL_LIBRARY_PATH` / `GEOS_LIBRARY_PATH` in `backend/.env` (e.g. `C:\OSGeo4W\bin\gdal309.dll`, `geos_c.dll`).
3. Redis: Memurai, or Redis in WSL.
4. `py -3.12 -m venv .venv && .venv\Scripts\pip install -r requirements.txt`, set `DB_HOST=localhost DB_PORT=5432 REDIS_URL=redis://localhost:6379/0`
   in `backend/.env`, then `python manage.py migrate`, `python manage.py runserver`, `celery -A config worker -l info --pool=solo`,
   `celery -A config beat -l info`.
