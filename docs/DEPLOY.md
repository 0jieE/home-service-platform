STATUS: DONE

# Deploying to Render

## Live (2026-10-29)
- Web: https://home-service-web.onrender.com · API: https://home-service-api-32a1.onrender.com (Render added the
  `-32a1` suffix because `home-service-api` was taken; that name belongs to another Render customer).
- The real Kidapawan boundary (`load_coverage`, unverified) and the moved Manongol/Ilomavis seed points were applied to
  the Render DB as well; all 10 located technicians and both demo customers are inside coverage.

## Summary (2026-10-29)
- **Backend production settings**: `DATABASE_URL` support (dj-database-url, PostGIS engine forced, `conn_max_age=600`,
  SSL required when `DEBUG=False`), WhiteNoise for `/static/` (hashed + compressed manifest in production),
  `SECRET_KEY` required when `DEBUG=False`, `SECURE_PROXY_SSL_HEADER`, secure cookies, HSTS, `CSRF_TRUSTED_ORIGINS`,
  `ALLOWED_HOSTS` from env (+ Render's own hostname and the container IP for health checks). Local `DB_*` variables still work.
- **Image**: production image installs `requirements.txt` only (pytest / locust moved to `requirements-dev.txt`, which
  docker compose uses), drops the GDAL/GEOS `-dev` headers (1.6 GB → ~950 MB), runs `collectstatic` at build time.
- **`backend/scripts/start.sh`**: `migrate`, then Daphne on `0.0.0.0:$PORT` + `celery worker -B --pool=solo` in one
  container, supervised: if either process exits the other is stopped and the container exits 1 (Render restarts it).
  Verified locally (killing Celery stopped the container with exit 1).
- **Frontend**: build-time `VITE_*` env vars; `wss://` enforced when the page is served over https; SPA rewrite in
  `render.yaml`; `frontend/.node-version` = 22.17.1. `npm run build`, 43 unit tests and lint pass.
- **`render.yaml`** (repo root) validated with 0 errors against Render's JSON schema (`https://render.com/schema/render.yaml.json`).
- **Render database** (`db_service_platform`, Singapore): extensions `postgis` 3.6.2 + `btree_gist` 1.8 enabled, all 39
  migrations applied, **local data copied** (data-only `pg_dump` → `pg_restore --single-transaction`, sequences reset).
  Row counts of all 16 checked tables are identical to local; `postgis_full_version()` works; exclusion constraints
  `booking_no_overlap_reserved` and `availability_no_overlap` exist. The production image, run on this PC against the
  Render DB, answered `/api/health/`, `/api/config/`, JWT login and `/api/admin/stats/` correctly.
- Local `docker compose up` still works; backend suite **133 passed**.
- Pushed to `https://github.com/0jieE/home-service-platform` (`main`). Secret scan of tracked files and history clean.

**You still need to do:** the Render dashboard steps below (Blueprint → paste 2 values → Apply), and add the Render
frontend domain to the Google Maps key restrictions.

## Click-by-click: Render dashboard
1. Get the **internal** database URL: Render dashboard → your PostgreSQL `db_service_platform` → **Info** (or
   **Connect**) → **Internal Database URL** → copy. (The external URL in `backend/.env.render` is only for this PC.)
2. Dashboard → **New +** → **Blueprint**.
3. Connect / pick the GitHub repo **0jieE/home-service-platform**, branch `main`. Render finds `render.yaml`.
4. Blueprint name: e.g. `home-service-platform`. Render lists 3 resources: `home-service-api` (web, Docker),
   `home-service-redis` (Key Value), `home-service-web` (static site).
5. Fill the prompted values:
   - `home-service-api` → **DATABASE_URL** = the internal URL from step 1.
   - `home-service-web` → **VITE_GOOGLE_MAPS_API_KEY** = contents of `map_platform_api_key.txt`.
6. **Apply**. First build of the API takes ~5–10 min (GDAL image); the static site ~1–2 min.
7. Check: open `https://home-service-api-32a1.onrender.com/api/health/` → `{"status":"ok"}`, then
   `https://home-service-web.onrender.com`.
8. Google Cloud Console → APIs & Services → **Credentials** → the Maps key → Application restrictions → **Websites** →
   add `https://home-service-web.onrender.com/*` (keep `http://localhost:5173/*`) → Save. Changes can take a few minutes.
9. Log in with the seed accounts (data copied from local):
   `admin@demo.local / Admin123!`, `customer@demo.local` or `customer2@demo.local / Customer123!`,
   `tech1@demo.local … tech10@demo.local / Tech123!`. Django admin: `https://home-service-api-32a1.onrender.com/django-admin/`,
   Swagger: `https://home-service-api-32a1.onrender.com/api/docs/`.

### If Render assigns different hostnames
Render may append a suffix (e.g. `home-service-api-x1y2.onrender.com`) if a name is taken. Then:
- `home-service-api` → Environment: set `CORS_ALLOWED_ORIGINS=https://<web host>` and
  `CSRF_TRUSTED_ORIGINS=https://<api host>,https://<web host>` → Save (redeploys). `ALLOWED_HOSTS` already accepts
  `.onrender.com` and Render's own hostname.
- `home-service-web` → Environment: `VITE_API_BASE_URL=https://<api host>/api`, `VITE_WS_BASE_URL=wss://<api host>/ws` →
  Save → **Manual Deploy → Clear build cache & deploy** (Vite bakes these in at build time).
- Update the Google Maps website restriction to the real web host.
- Optionally update the values in `render.yaml` and push, so future Blueprint syncs keep them.

## Things to know
- **Free web services sleep** after ~15 min without traffic. The first request afterwards takes ~30–60 s (cold start runs
  `migrate` too); WebSockets drop while asleep and the frontend reconnects automatically. Celery beat (the 15-minute
  pending-booking expiry) only runs while the service is awake; on wake-up the next run catches up all stale bookings.
- **Free Key Value** has no persistence: a restart loses queued Celery messages and channel-layer state, which is fine here
  (beat re-schedules; clients reconnect).
- Render's DB is **PostgreSQL 18.6 / PostGIS 3.6.2** (not 17 as assumed). Local is 17 / 3.5; Django 5.2 and the dump/restore
  path work with both. For dumps *from* Render use a client ≥ 18, e.g. `docker run --rm postgres:18 pg_dump ...`.
- Static site has no region (global CDN); the API and Key Value are in **Singapore**, same region as the DB, so the API
  uses the internal URL with no egress cost.

## Re-run migrations / seed later
- **Migrations** run automatically at every API start (`scripts/start.sh`). After pushing a new migration, Render
  redeploys and applies it.
- **Render Shell** (API service → Shell; paid instances only) or from this PC with Docker, in Git Bash at the repo root:
  ```sh
  export DATABASE_URL="$(sed -n 's/^RENDER_DATABASE_URL=//p' backend/.env.render | tr -d '\r')"
  docker compose run --rm --no-deps -e DATABASE_URL -e DEBUG=False -e DJANGO_SECRET_KEY=tmp web python manage.py migrate --noinput
  docker compose run --rm --no-deps -e DATABASE_URL -e DEBUG=False -e DJANGO_SECRET_KEY=tmp web python manage.py seed_demo
  #   seed_demo --reset wipes and recreates the demo data
  unset DATABASE_URL
  ```
  `-e DATABASE_URL` (name only) passes the value from the environment, so it never appears in the command line.

### How the data copy was done (repeatable)
```sh
export RENDER_DATABASE_URL="$(sed -n 's/^RENDER_DATABASE_URL=//p' backend/.env.render | tr -d '\r')"
# 1. extensions
docker compose exec -T -e RENDER_DATABASE_URL db sh -c 'psql "$RENDER_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS btree_gist;"'
# 2. migrate (see above)
# 3. data-only dump of the app tables in the local db container
docker compose exec -T db sh -c "pg_dump -U postgres -d service_platform --data-only -Fc --no-owner --no-privileges \
  -t 'public.accounts_*' -t 'public.applications_*' -t 'public.auth_group*' -t 'public.bookings_*' -t 'public.catalog_*' \
  -t 'public.django_admin_log' -t 'public.geo_*' -t 'public.recommendations_*' -t 'public.technicians_*' -f /tmp/app_data.dump"
# 4. empty the same tables on Render (migrations seed a coverage row + settings row), then restore
docker compose exec -T -e RENDER_DATABASE_URL db sh -c '
  T=$(pg_restore -l /tmp/app_data.dump | grep "TABLE DATA" | awk "{print \"public.\" \$(NF-1)}" | paste -sd, -)
  psql "$RENDER_DATABASE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE $T RESTART IDENTITY CASCADE" &&
  pg_restore --data-only --no-owner --no-privileges --single-transaction --exit-on-error -d "$RENDER_DATABASE_URL" /tmp/app_data.dump'
# 5. reset sequences
docker compose run --rm --no-deps -T -e DATABASE_URL="$RENDER_DATABASE_URL" -e DEBUG=False -e DJANGO_SECRET_KEY=tmp web \
  python manage.py sqlsequencereset accounts applications bookings catalog geo recommendations technicians auth admin token_blacklist \
  | docker compose exec -T -e RENDER_DATABASE_URL db sh -c 'psql "$RENDER_DATABASE_URL" -q'
```
Excluded: `spatial_ref_sys` (owned by PostGIS), `django_migrations`, `django_content_type`, `auth_permission` (created by
migrate; content-type and permission ids were checked identical on both sides), `django_session`, token-blacklist tables.
Not needed: `--disable-triggers` (pg_dump orders the data by foreign keys; the Render user is not a superuser anyway).

## Splitting the Celery worker into its own service later
On a paid plan, add to `render.yaml` and change the web service's `dockerCommand`:
```yaml
  - type: worker
    name: home-service-worker
    runtime: docker
    region: singapore
    plan: starter
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    dockerCommand: celery -A config worker -B --concurrency=2 -l info --schedule /tmp/celerybeat-schedule
    envVars:   # same DATABASE_URL, DJANGO_SECRET_KEY (use the api's value via fromService), DEBUG, REDIS_URL
```
and set the web service to
`dockerCommand: sh -c "python manage.py migrate --noinput && daphne -b 0.0.0.0 -p $PORT --proxy-headers config.asgi:application"`.
Keep exactly one process running `-B` (beat).

## Decisions
- `dockerCommand` (not `startCommand`) is the Blueprint field for Docker services; value `sh scripts/start.sh`.
- `SECURE_SSL_REDIRECT` defaults off: Render already redirects http→https at the edge, and Render health checks hit the
  container over plain http. Turn on with `SECURE_SSL_REDIRECT=True` if wanted (`/api/health/` is exempt).
  `SECURE_HSTS_SECONDS` defaults to 3600 (env-overridable), no `includeSubDomains` (onrender.com is shared).
- `DB_SSL_REQUIRE` env var (default: `not DEBUG`) lets SSL be switched off for a local `DEBUG=False` test against the
  docker db.
- Key Value `maxmemoryPolicy: noeviction` (Celery broker data must not be evicted).
- The production static manifest is only used when `DEBUG=False`; dev and tests use plain `StaticFilesStorage`, so
  nobody needs `collectstatic` locally.
- Data path used: **copy of local data** (not the `seed_demo` fallback).
- `prompts/DEPLOY_AGENT_PROMPT.md`: a 4-character fragment of the real DB password in its grep example was replaced by
  `<db-password-fragment>` before committing.
- The boundary file and seed coordinate change (commit 088fc6c) were committed separately by their owner;
  Render was updated to match afterwards.
