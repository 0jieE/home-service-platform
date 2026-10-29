# Location-Aware Decision Support Platform for Home Service Technician Matching and Booking

Capstone build. React + Vite frontend, Django REST + PostGIS backend, Google Maps, Channels + Celery on Redis.

```
service_platform/
├─ CLAUDE.md                     shared rules for both agents (auto-loaded by Claude Code)
├─ map_platform_api_key.txt      Google Maps key — never commit
├─ docker-compose.yml            (created by backend agent)
├─ render.yaml                   Render Blueprint (see docs/DEPLOY.md)
├─ backend/                      Django project (backend agent)
├─ frontend/                     React app (frontend agent)
├─ docs/
│  ├─ paper/                     Chapters 1–3 PDF + full-text extract (local only, not in the repo)
│  ├─ SPEC.md                    requirements distilled from the paper
│  ├─ API_CONTRACT.md            the API both sides build to
│  ├─ CONTRACT_CHANGES.md        backend logs deviations here
│  ├─ STATUS_BACKEND.md          backend progress
│  ├─ STATUS_FRONTEND.md         frontend progress
│  └─ DEPLOY.md                  Render deployment (render.yaml) — steps + decisions
└─ prompts/
   ├─ BACKEND_AGENT_PROMPT.md
   ├─ FRONTEND_AGENT_PROMPT.md
   └─ DEPLOY_AGENT_PROMPT.md
```

## Start the two agents
Open two terminals, **both in this folder** (not inside backend/ or frontend/):

```powershell
cd C:\Users\ASUS\Desktop\MIT\CAPSTONE\service_platform
claude
```
Terminal 1 message: `Read prompts/BACKEND_AGENT_PROMPT.md and carry it out completely.`
Terminal 2 message: `Read prompts/FRONTEND_AGENT_PROMPT.md and carry it out completely.`

Prerequisites: Docker Desktop (running), Node.js 20+ LTS, Git for Windows.
The Docker database is PostGIS 17 on host port **5436**, so it doesn't clash with local PostgreSQL installs on 5432/5433 (pgAdmin: localhost:5436, db `service_platform`, user/password `postgres`).

## Run after the build
```powershell
docker compose up -d --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_demo
cd frontend; npm install; npm run dev
```
App: http://localhost:5173 · API docs: http://localhost:8000/api/docs/ · Django admin: http://localhost:8000/django-admin/
Demo logins are listed in `docs/API_CONTRACT.md` §5.

## To do before formal evaluation
- Restrict the Google Maps key (Cloud Console → Credentials → Application restrictions → Websites: `http://localhost:5173/*` plus the deployed domain).
- Replace the placeholder city polygon with an official Kidapawan City boundary (`python manage.py load_coverage ... --verified`).
- Freeze recommendation settings in Admin → Settings.

## Deploy (Render)
`render.yaml` is a Render Blueprint (API on Docker + Key Value + static site, Singapore). Click-by-click steps,
environment variables and how the database was loaded: [`docs/DEPLOY.md`](docs/DEPLOY.md).
