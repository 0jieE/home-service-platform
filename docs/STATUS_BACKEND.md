STATUS: IN PROGRESS — API READY: partial (health/auth/categories up at http://localhost:8000/api)

# Backend status

## Milestones
- [x] M1 Infra: docker-compose (PostGIS, Redis), Django project, settings, health endpoint
- [ ] M2 Accounts: custom User, JWT, register/login/activate/me, permissions
- [ ] M3 Catalog & profiles: categories, customer + technician profiles, availability, coverage polygon
- [ ] M4 Admin: applications, verifications, approve/reject, create-account, users, stats
- [ ] M5 Recommendations: eligibility + scoring module + Table 3.3 test
- [ ] M6 Bookings: lifecycle, transitions, exclusion constraint, history, disputes, reviews
- [ ] M7 Realtime + tasks: Channels WS, Celery worker/beat (expire pending)
- [ ] M8 Seed, tests green, load script, backup/restore docs, README

## How to run
`docker compose up -d --build` from the repo root. DB host port is 5436 (see CONTRACT_CHANGES).
