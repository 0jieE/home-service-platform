# Service Platform — shared rules for every agent

Project: **Location-Aware Decision Support Platform for Home Service Technician Matching and Booking** (Kidapawan City).
Source paper: `docs/paper/` (Chapters 1–3). Distilled requirements: `docs/SPEC.md`. API contract: `docs/API_CONTRACT.md`.

Two agents work **in parallel** in this repo:

| Agent    | Owns (may write)                                   | Must not touch                  |
|----------|----------------------------------------------------|---------------------------------|
| Backend  | `backend/`, `docker-compose.yml`, `docs/STATUS_BACKEND.md`, appends to `docs/CONTRACT_CHANGES.md` | `frontend/`                      |
| Frontend | `frontend/`, `docs/STATUS_FRONTEND.md`              | `backend/`, `docker-compose.yml` |

Neither agent edits `CLAUDE.md`, `docs/SPEC.md`, `docs/API_CONTRACT.md`, `docs/paper/`, or `map_platform_api_key.txt`.

## Coordination
- `docs/API_CONTRACT.md` is the single source of truth for endpoints, payloads, enums and ports. Build to it exactly.
- If the backend must deviate, it appends an entry to `docs/CONTRACT_CHANGES.md` (date, endpoint, old → new, reason). The frontend re-reads that file before each milestone and adapts.
- Each agent keeps its `docs/STATUS_*.md` current: milestone checklist, what works, how to run, known gaps. Write `STATUS: DONE` at the top when finished.

## Work mode
- Work autonomously from start to finish. Do not stop to ask for confirmation, approval, or plan review. Do not use plan mode.
- When something is ambiguous, pick the option most faithful to `docs/SPEC.md`, record it under "Decisions" in your STATUS file, and continue.
- Only stop early for a true blocker (e.g. a required program cannot be installed). Even then, finish everything else first and document the blocker.

## Environment
- Host OS is **Windows** (path `C:\Users\ASUS\Desktop\MIT\CAPSTONE\service_platform`). Use commands that work in the shell you are given (Git Bash / PowerShell). Python launcher may be `py`.
- Ports: backend `http://localhost:8000`, frontend `http://localhost:5173`, Postgres `5432`, Redis `6379`.
- Time zone: `Asia/Manila`. All datetimes are timezone-aware ISO 8601.

## Git
- Repo root is this folder. If `.git` is missing, the **backend** agent runs `git init` (frontend just skips commits until it exists).
- Commit only your own paths (`git add backend docker-compose.yml docs/STATUS_BACKEND.md docs/CONTRACT_CHANGES.md` or `git add frontend docs/STATUS_FRONTEND.md`). Never `git add -A`.
- If you hit `.git/index.lock`, wait a few seconds and retry — the other agent is committing.
- Commit at each milestone with a clear message.

## Secrets
- The Google Maps key is in `map_platform_api_key.txt`. Never commit it, never print it in logs or docs. The frontend copies it into `frontend/.env.local` (gitignored).
- No secrets in committed files; use `.env` files plus committed `.env.example`.
