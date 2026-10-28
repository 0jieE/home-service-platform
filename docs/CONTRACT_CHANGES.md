# Contract changes

Backend appends here whenever the implementation differs from `docs/API_CONTRACT.md`. Frontend re-reads this file before each milestone.

Format:
```
## YYYY-MM-DD HH:MM — <endpoint or object>
- Before:
- After:
- Reason:
```


## 2026-10-29 02:30 — TechnicianSummary.rating_avg / admin stats avg_rating (clarification)
- Before: contract example shows a number only.
- After: `rating_avg` is `null` when `rating_count` is 0 (use `rating_display` = "No ratings yet"). `totals.avg_rating` in `/admin/stats/` is `null` when there are no reviews. Values are unrounded floats.
- Reason: a 0.0 average would be misleading on a 1–5 scale (SPEC §4 "No ratings yet").

## 2026-10-29 02:30 — POST /technicians/me/availability/generate/ `weekdays` (clarification)
- Before: `"weekdays": [0..6]` without a convention.
- After: Python/ISO convention — **0 = Monday … 5 = Saturday, 6 = Sunday**. `start_time`/`end_time` are local Asia/Manila times. Response `{"created": n, "skipped": m}` (`skipped` = days that overlapped an existing slot or already ended).
- Reason: contract was ambiguous; JS `Date.getDay()` uses 0 = Sunday, so convert with `(getDay() + 6) % 7`.

## 2026-10-29 02:30 — Postgres host port (infra only)
- Before: Docker DB published on host port 5433.
- After: published on host port **5436** by default (`DB_HOST_PORT` in a root `.env` overrides). Does not affect the API (still `http://localhost:8000`).
- Reason: ports 5432 and 5433 are both taken by local PostgreSQL installs on this machine.
