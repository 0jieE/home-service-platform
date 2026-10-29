You are the DEPLOY agent. The backend and frontend are finished (see `docs/STATUS_BACKEND.md`, `docs/STATUS_FRONTEND.md`). Your job: make the project production-ready for **Render**, put the schema and data into the Render PostgreSQL database from this PC, and push everything to GitHub. Work autonomously to the end — do not stop to ask for confirmation. Log decisions in `docs/DEPLOY.md`.

Read first: `CLAUDE.md`, `backend/README.md`, `backend/config/settings.py`, `docker-compose.yml`, `frontend/README.md`, `frontend/vite.config.ts`, `frontend/src/lib/env.ts` (or equivalent).

## Facts
- GitHub repo: `https://github.com/0jieE/home-service-platform.git` (use the user's existing git credentials; if push asks for login, Git Credential Manager will open a browser — that's fine).
- Render PostgreSQL 17, region **Singapore**, database `db_service_platform`. The **external** URL is in `backend/.env.render` as `RENDER_DATABASE_URL` (gitignored). Never print it, never commit it, never write it into any tracked file.
- Render supports the `postgis` and `btree_gist` extensions (`CREATE EXTENSION ...`).
- Local stack runs in Docker; local DB container is `db` (postgis/postgis:17-3.5, published on host port 5436).
- `map_platform_api_key.txt`, `.env`, `.env.*` are gitignored — keep it that way.

## 1. Production settings (backend)
- Support `DATABASE_URL` (add `dj-database-url`, engine forced to `django.contrib.gis.db.backends.postgis`, `conn_max_age=600`, `ssl_require` when not DEBUG). Keep the existing `DB_*` vars working as the fallback so local Docker is unchanged.
- Add `whitenoise` (CompressedManifestStaticFilesStorage) so `/django-admin/` and `/api/docs/` static files work; `collectstatic` in the build.
- Production env handling: `DEBUG=False`, `ALLOWED_HOSTS` (include `.onrender.com`), `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` (frontend URL), `SECURE_PROXY_SSL_HEADER`, secure cookies, `SECRET_KEY` required when not DEBUG. `REDIS_URL` from env (Render Key Value gives `redis://` internal URL).
- Pin new packages in `requirements.txt`. Remove `locust` and test-only packages from the production image if that keeps it smaller (e.g. `requirements-dev.txt`), but keep `docker compose` dev working.
- A start script `backend/scripts/start.sh` used on Render: `python manage.py migrate --noinput`, then run **daphne on `0.0.0.0:$PORT`** plus a Celery worker with embedded beat (`celery -A config worker -B --concurrency=1 --pool=solo -l info`) in the same container (supervised so either crashing exits the container). This keeps everything on a single free web service. Document in DEPLOY.md how to split the worker into a separate Render Background Worker later.
- Run the full test suite in Docker afterwards — it must stay green.

## 2. Frontend production build
- `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` (must be `wss://` in production), `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` come from build-time env.
- SPA rewrite: all routes → `/index.html`.
- `npm run build` must pass.

## 3. `render.yaml` Blueprint (repo root)
- `region: singapore` for everything.
- Web service `home-service-api`: `runtime: docker`, `dockerfilePath: ./backend/Dockerfile`, `dockerContext: ./backend`, start command `sh scripts/start.sh`, health check `/api/health/`, plan free. Env vars: `DATABASE_URL` **sync: false** (user pastes the INTERNAL URL of the existing database — do not create a new database in the blueprint), `DJANGO_SECRET_KEY` generateValue, `DEBUG=False`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `REDIS_URL` from the Key Value service (`fromService` → `connectionString`), `BOOKING_BLOCK_MINUTES=120`.
- Key Value (Redis-compatible) service `home-service-redis`, plan free, `ipAllowList: []`.
- Static site `home-service-web`: `runtime: static`, `rootDir: frontend`, `buildCommand: npm ci && npm run build`, `staticPublishPath: dist`, rewrite `/*` → `/index.html`, env `VITE_API_BASE_URL=https://home-service-api.onrender.com/api`, `VITE_WS_BASE_URL=wss://home-service-api.onrender.com/ws`, `VITE_GOOGLE_MAPS_API_KEY` sync: false, `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`.
- Assume the public URLs `https://home-service-api.onrender.com` and `https://home-service-web.onrender.com`; note in DEPLOY.md which env vars to update if Render assigns different hostnames.
- Validate the YAML against Render's Blueprint spec (fetch https://render.com/docs/blueprint-spec if unsure of a field).

## 4. Put schema + data into the Render database (from this PC)
Step 0 — real city boundary (do this LOCALLY first, so the copied data already has it):
- Load `backend/data/kidapawan_boundary.geojson` (City of Kidapawan, PSGC 1204704000, 40 barangays dissolved, from faeldon/philippines-json-maps geojson-hires, PSGC 2026-3q):
  `docker compose exec web python manage.py load_coverage data/kidapawan_boundary.geojson --name "City of Kidapawan" --source "PSA PSGC boundaries via faeldon/philippines-json-maps (hires)" --version "PSGC-2026-3q"` (do NOT pass `--verified` — the user marks it verified after checking it against an official source).
- `seed_demo.py` was corrected: technicians in Manongol and Ilomavis now sit inside the real boundary. Update those two existing technician profiles in the local DB to the new coordinates (or re-run `seed_demo --reset` if the local data is only demo data). Then confirm every approved technician and both demo customers are inside the active coverage area, and that `/api/recommendations/` still returns results.
- Commit `backend/data/kidapawan_boundary.geojson` and the seed fix.

Use the local Docker images so versions match (the `db` container has `pg_dump`/`pg_restore`/`psql` 17; the backend image's client may be older — don't use it for dumps).
1. Load `RENDER_DATABASE_URL` from `backend/.env.render` into the shell without echoing it.
2. Enable extensions on Render: `psql "$RENDER_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS btree_gist;"` (run via `docker compose exec -T db psql ...` or `docker run --rm postgis/postgis:17-3.5 psql ...`).
3. Run migrations against Render with a one-off backend container: `docker compose run --rm -e DATABASE_URL="$RENDER_DATABASE_URL" -e DEBUG=False -e DJANGO_SECRET_KEY=tmp web python manage.py migrate --noinput`.
4. Copy the local data: data-only dump of the app tables from the local `db` container (exclude `spatial_ref_sys`, `django_migrations`, `django_content_type`, `auth_permission`, `django_session`, token-blacklist tables), restore into Render with `--disable-triggers` if needed, then reset sequences (`python manage.py sqlsequencereset <apps> | psql`). If the data copy fails for any reason, fall back to `python manage.py seed_demo` against Render so the deployed app still has demo data. Record which path was used.
5. Verify against Render: row counts per main table match local (or match seed expectations), `SELECT postgis_full_version();` works, and the exclusion constraint exists on the bookings table.
6. Never leave the URL in shell history files or logs you write.

## 5. Git + GitHub
- Add to `.gitignore`: `install.cmd`, `docs/paper/` (the thesis manuscript should not be published in the code repo), `backend/.env.render`, `frontend/dist/`, `frontend/playwright-report/`, `frontend/test-results/`, `backups/` (check what's already there).
- Commit the root files that are still untracked (`CLAUDE.md`, `README.md`, `docs/SPEC.md`, `docs/API_CONTRACT.md`, `prompts/`, `render.yaml`, `docs/DEPLOY.md`) plus all your changes.
- Before pushing, scan tracked files for secrets: `git grep -nE "AIza|render\.com/.*:.*@|postgresql://[^ ]*:[^ ]*@|DJANGO_SECRET_KEY=.{20,}"` must return nothing (except obvious placeholders). Also check history: `git log -p | grep -E "AIza|<db-password-fragment>"` must be empty. If a secret is found in history, rewrite it out before pushing.
- `git branch -M main`, `git remote add origin https://github.com/0jieE/home-service-platform.git` (or `set-url` if it exists), `git push -u origin main`. If the remote already has commits (e.g. a README), `git pull --rebase origin main --allow-unrelated-histories` first, resolve, then push.

## 6. `docs/DEPLOY.md`
Write the exact click-by-click steps the user does in the Render dashboard after your push: New → Blueprint → pick the repo → fill `DATABASE_URL` (INTERNAL URL from the database's Info page) and `VITE_GOOGLE_MAPS_API_KEY` → Apply; then: add the Render frontend domain to the Google Maps key's website restrictions (keep `http://localhost:5173/*`), log in with the seed accounts, and what to do if hostnames differ. Also: free web services sleep after inactivity (first request is slow and WebSockets reconnect), and how to re-run migrations/seed later (Render Shell or the step-4 commands).

## Definition of done
Local `docker compose up` still works and tests pass; `npm run build` passes; data is in the Render DB and verified; `render.yaml` and `docs/DEPLOY.md` exist; everything pushed to `origin/main` with no secrets in the repo or history. Put `STATUS: DONE` at the top of `docs/DEPLOY.md` with a summary of what you did and anything the user must do.

Start now.
