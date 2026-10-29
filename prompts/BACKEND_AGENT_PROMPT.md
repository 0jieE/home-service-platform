You are the BACKEND agent for this repo. A FRONTEND agent is working in parallel in `frontend/`. Work autonomously until every milestone is done — do not stop to ask questions, confirm plans, or wait for approval. Make reasonable decisions, log them in `docs/STATUS_BACKEND.md` under "Decisions", and keep going.

## Read first (in this order)
1. `CLAUDE.md` — ownership, coordination, git, secrets rules. Obey them.
2. `docs/SPEC.md` — business rules distilled from the paper.
3. `docs/API_CONTRACT.md` — the exact API you must expose. The frontend is coding against it right now, so match paths, field names, enums, error codes and seed credentials exactly.
4. `docs/paper/paper_fulltext.txt` (Chapter 3, especially 3.1.1–3.1.8) when you need detail. The PDF is beside it.

You own only `backend/`, `docker-compose.yml`, `docs/STATUS_BACKEND.md`, and appends to `docs/CONTRACT_CHANGES.md`. Never touch `frontend/`.

## Stack (fixed by the paper — do not substitute)
Python 3.12, Django 5.2 LTS, Django REST Framework, djangorestframework-simplejwt (with token blacklist), django-cors-headers, PostgreSQL 17 + PostGIS 3.5 via GeoDjango (`django.contrib.gis`), Django Channels + channels-redis + daphne, Celery + Redis (+ django-celery-beat or a static beat schedule), django-filter, drf-spectacular (OpenAPI at `/api/schema/` and Swagger UI at `/api/docs/`), pytest + pytest-django, Locust for the load script. Pin exact versions in `backend/requirements.txt`.

## Runtime on Windows — use Docker
GeoDjango needs GDAL/GEOS, which is painful on Windows, so run everything in Docker:
- Check `docker --version` and `docker info` first.
- The user already runs a **local PostgreSQL 17 on port 5432**. Leave it alone. Publish the container as `"5433:5432"` so they don't clash.
- Root `docker-compose.yml` with services: `db` (`postgis/postgis:17-3.5`, db name `service_platform`, volume, healthcheck, ports `5433:5432`), `redis` (`redis:7-alpine`), `web` (build `backend/`, runs migrations then `daphne -b 0.0.0.0 -p 8000 config.asgi:application`, or `runserver` in dev — runserver works with Channels when `daphne` is first in INSTALLED_APPS), `worker` (`celery -A config worker -l info`), `beat` (`celery -A config beat -l info`). Mount `./backend` into the containers for live reload. Expose 8000, 5433 (db), 6379. Inside compose, Django connects to `db:5432`.
- `backend/Dockerfile`: `python:3.12-slim` + `gdal-bin libgdal-dev libgeos-dev libproj-dev binutils`.
- `backend/.env.example` (committed) and `backend/.env` (gitignored): `DJANGO_SECRET_KEY`, `DEBUG`, `DATABASE_URL` or discrete DB vars, `REDIS_URL`, `CORS_ALLOWED_ORIGINS=http://localhost:5173`, `BOOKING_BLOCK_MINUTES=120`.
- If Docker is truly unavailable, fall back to the user's **local PostgreSQL 17 (localhost:5432)**: create a new database `service_platform` and run `CREATE EXTENSION postgis;` (if PostGIS isn't installed, it comes from the PostgreSQL 17 Stack Builder → Spatial Extensions → PostGIS 3.5). Ask nothing — try `psql -U postgres` and read credentials from `backend/.env`; if the password is unknown, put a clear `DB_PASSWORD=` placeholder in `.env`, note it at the top of STATUS, and continue. GDAL/GEOS for GeoDjango on Windows: OSGeo4W, then set `GDAL_LIBRARY_PATH`/`GEOS_LIBRARY_PATH` in settings from env. Redis: Memurai or Redis in WSL. Celery on Windows needs `--pool=solo`. Document all of it in the README and record any blocker in STATUS. Continue writing code and tests regardless.

## Project layout
```
backend/
  manage.py  requirements.txt  Dockerfile  .env.example  pytest.ini  README.md
  config/            settings.py (or settings/base,dev,test), urls.py, asgi.py, wsgi.py, celery.py
  apps/
    accounts/        custom User (email login, role), CustomerProfile, activation codes, auth views, permissions.py
    catalog/         ServiceCategory
    technicians/     TechnicianProfile, TechnicianService, Availability, discovery + self-service views
    applications/    TechnicianApplication, VerificationRecord, admin views, create-account service
    geo/             CoverageArea, coverage services (point-in-polygon), load_coverage command
    recommendations/ RecommendationSettings, engine.py (pure scoring functions), eligibility.py, views
    bookings/        Booking, BookingStatusHistory, BookingDispute, Review, services.py (state machine), views, consumers.py, routing.py, tasks.py, signals/events
    dashboard/       admin stats view
  loadtest/locustfile.py
  scripts/           backup.sh / restore.sh (pg_dump / pg_restore via docker compose exec)
```
Set `AUTH_USER_MODEL = "accounts.User"` **before the first migration**. Mount the Django admin at `/django-admin/` (not `/admin/`, which belongs to the API). `TIME_ZONE = "Asia/Manila"`, `USE_TZ = True`.

## Implementation requirements
**Accounts & permissions**
- Email is the username. Roles: customer, technician, admin. Admin role also gets `is_staff`.
- Permission classes: `IsCustomer`, `IsTechnician`, `IsAdminRole`, plus object-level ownership checks on bookings, profiles, availability. Never trust client-sent ownership IDs.
- Technician activation: create-account generates a code like `K7P2-9QXM`, stores only its hash + expiry (7 days); `/auth/activate/` sets the password and marks the code used. Inactive or unapproved technicians cannot log in.
- `/auth/token/` returns `{access, refresh, user}` (custom serializer).

**Geo**
- `PointField(geography=True, srid=4326)` for locations. Serializers convert to/from `{"lat","lng"}` and validate ranges.
- Distance in the recommendation query: annotate with `Distance("location", customer_point)` on geography → meters → km (this is PostGIS `ST_Distance` on geography, as the paper states).
- `CoverageArea` with `MultiPolygonField(srid=4326)`; `geo/services.py: is_inside_coverage(point)` uses `ST_Covers`/`covers` against the single active area.
- Migration or seed creates the DEV PLACEHOLDER polygon from SPEC §7 with `verified=False`. Management command `load_coverage <file.geojson> --name --source --version [--verified]` replaces the active area.

**Recommendation engine** (`recommendations/engine.py`, pure functions, no ORM):
- `proximity_score(d_km, d0)`, `rating_score(avg, count, no_rating_q)`, `overall_score(p, q, w_p, w_r)`, `rank(candidates)` → sort by (-score, distance, id). Never round inside calculations.
- `eligibility.py` builds the candidate queryset: approved + active user + complete profile + offers active category + location inside coverage + an `available` slot that fully contains [start, end) + no overlapping accepted/in_progress booking (`DateTimeRangeField`/`tstzrange` overlap or start/end comparisons).
- Customer point outside coverage → 400 `outside_coverage`. Empty result → 200 with `empty_reason`.
- `RecommendationSettings` singleton (seeded with 0.5/0.5/1.0/0.5, version 1). Response includes the settings used.

**Bookings**
- Store `start`, `end`, plus a generated or maintained `period = DateTimeRangeField` and add `ExclusionConstraint` (needs `BtreeGistExtension` migration) on `(technician, =)` and `(period, &&)` with `condition=Q(status__in=["accepted","in_progress"])`.
- `bookings/services.py` is the only place that changes status. Each transition: validate actor + current state per SPEC §5 table → `transaction.atomic()` + `select_for_update()` on the booking (and technician profile for accept) → re-run eligibility on accept → save → write `BookingStatusHistory` → `transaction.on_commit` push WS event. Catch `IntegrityError` from the exclusion constraint → 409 `booking_conflict`.
- `allowed_actions` computed per requesting user from the same rules (single source of truth with the service).
- `conflicts_with_reserved` for pending bookings.
- Reviews: one per booking (OneToOne), only customer of a completed booking; update `rating_avg`/`rating_count` on the technician profile in the same transaction (aggregate, not incremental drift).
- Disputes: customer opens on an in_progress booking with completion requested; admin resolves with decision; record history with `actor_role="admin"`.

**Realtime & tasks**
- Channels consumer at `/ws/bookings/` authenticating via `?token=` (SimpleJWT `AccessToken`), joining group `user_<id>` (admins also join `admins`). Close with 4401 on bad token.
- Celery beat every 15 min: `expire_stale_pending_bookings` → pending with `start <= now` become cancelled, actor system, reason "expired", with WS event.

**Admin stats** per contract §3 (use ORM aggregates; `TruncWeek`).

**Seed**: `python manage.py seed_demo [--reset]` exactly per contract §5, idempotent. Technicians at realistic points inside the placeholder polygon around Kidapawan (e.g. Poblacion ~7.0083,125.0894; Lanao; Sudapin; Magsaysay; Balindog; Manongol; Singao; Amas; Paco; Ilomavis on the higher slopes). Use Filipino names.

**API quality**: DRF exception handler that emits `{"detail","code"}` for business errors; pagination per contract; CORS for `http://localhost:5173`; throttling on auth endpoints; `/api/health/`.

## Tests (pytest, run inside the web container against PostGIS)
Must include and pass:
- Table 3.3 regression: A/B/C produce P, Q, S exactly (to 4 dp) and order A, B, C.
- Eligibility: each of the 5 rules excludes a technician; outside-coverage customer → error; incomplete profile excluded; inactive category excluded.
- Booking: every allowed transition; every forbidden transition → `invalid_transition`; reason required on accepted cancel; accept re-check; **two overlapping accepts → second gets `booking_conflict`** (also test the DB constraint directly); pending doesn't reserve; expire task.
- Reviews: only after completed, only once, only by owner; rating aggregates.
- Permissions: customer can't see another customer's booking; technician can't accept someone else's booking; non-admin blocked from `/admin/*`.
- Auth: register, login, refresh, activation flow, inactive technician cannot log in.

## Milestones (update STATUS + commit after each)
M1 infra → M2 accounts → M3 catalog/profiles/availability/coverage → M4 admin applications/users/stats → M5 recommendations → M6 bookings/disputes/reviews → M7 Channels + Celery → M8 seed, full test pass, `loadtest/locustfile.py`, `scripts/backup.sh` + `restore.sh`, `backend/README.md`.

Bring the stack up early (`docker compose up -d --build`) so the frontend agent can integrate. Once `/api/health/` works and seed data exists, note it at the top of STATUS (`API READY: yes, seeded`).

## Definition of done
- `docker compose up -d --build` from the repo root starts db, redis, web, worker, beat cleanly.
- `docker compose exec web python manage.py migrate && docker compose exec web python manage.py seed_demo` works on a fresh volume.
- `docker compose exec web pytest` is fully green.
- Every endpoint in the contract responds as specified (verify with a quick scripted smoke run using the seed accounts: login as each role, get recommendations, create → accept → start → request completion → confirm → review; open and resolve a dispute; create an application → verify → approve → create account → activate → login as the new technician).
- `/api/docs/` lists every endpoint.
- `docs/STATUS_BACKEND.md` starts with `STATUS: DONE`, lists how to run, decisions, versions, and known gaps. Any deviation from the contract is in `docs/CONTRACT_CHANGES.md`.
- Final commit made.

Start now with M1.
