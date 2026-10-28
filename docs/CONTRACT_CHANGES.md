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

## 2026-10-29 02:50 — Error codes beyond the contract list (additive)
- Before: contract §0 error-code list.
- After: these extra `code` values can also appear in `{"detail","code"}` bodies:
  - `account_not_approved` (401) — `/auth/token/` for a technician whose profile is not approved.
  - `permission_denied` (403) — booking action by the wrong role/participant (e.g. customer calling `/accept/`).
  - `settings_frozen` (409) — PATCH `/admin/recommendation-settings/` while frozen (send `is_frozen: false` to unfreeze in the same request).
  - `cannot_deactivate_self` (400) — PATCH `/admin/users/{own id}/` with `is_active: false`.
  - DRF/SimpleJWT defaults: `not_authenticated` (401), `token_not_valid` (401), `authentication_failed`, `not_found` (404), `throttled` (429).
- Reason: every non-field error carries a machine-readable code; the frontend can fall back to `detail`.

## 2026-10-29 02:50 — HTTP status per business error (clarification)
- `POST /bookings/`: `outside_coverage` and `technician_unavailable` are **400** (request-time re-check; a reserved overlap at request time is reported as `technician_unavailable`).
- `POST /bookings/{id}/accept/`: `booking_conflict` and `technician_unavailable` are **409**; `outside_coverage` (boundary changed) is also 409.
- `POST /bookings/{id}/review/`: `not_completed` → 400, `already_reviewed` → 409.
- `POST /bookings/{id}/cancel|dispute/` without a required reason → 400 `reason_required`. `POST /admin/applications/{id}/reject/` with an empty reason → 400 `reason_required`.
- Approve/reject of an application that is already decided → 409 `invalid_transition`.
- Non-participant on `GET /bookings/{id}/` or any booking action → 403 (not 404).

## 2026-10-29 02:50 — Booking object (additive fields)
- After: Booking also has `started_at`, `completion_notes` (from `request-completion {notes}`); each `status_history` item also has `event` (same values as WS `event`). Non-status events (`completion_requested`, `disputed`, `dispute_resolved`) are written to history with `from_status == to_status`.
- `POST /bookings/{id}/dispute/` returns the full Booking (with `dispute`), like the other actions.
- `GET /bookings/` also accepts comma-separated statuses (`?status=pending,accepted`) and `?ordering=start|-start|created_at|-created_at` (default newest first). `upcoming=true` = bookings whose `end` is in the future.
- `allowed_actions` only lists actions that are possible **right now** (e.g. `start` appears from 60 minutes before the start time; `cancel` disappears at the start time). Admins get `[]` (they act via `/admin/disputes/`).

## 2026-10-29 02:50 — Technician profile details (clarification + additive)
- `missing_fields` values: `"location"`, `"phone"`, `"service_categories"`. A profile is complete (and can appear in discovery/recommendations) only when all three are present.
- `GET /technicians/me/` also returns `is_approved`.
- `GET /technicians/{id}/` returns 404 for technicians that are not public (unapproved, inactive, incomplete).
- `GET /technicians/?ordering=` accepts `rating_avg`, `rating_count`, `years_experience`, `full_name`, `id` (prefix `-`), default `-rating_avg` with unrated last.
- `POST /technicians/me/availability/` bulk form returns a **list** of created slots (single form returns one slot). Overlaps → 400 `non_field_errors`.
- `PATCH /customers/me/` and `PATCH /technicians/me/` reject a location outside coverage with 400 `outside_coverage`.

## 2026-10-29 02:50 — Admin additions
- New: `POST /admin/applications/{id}/reissue-code/` → same body as `create-account` (`201 {user, technician_profile_id, activation_code, expires_at}`); only when the account exists and has not been activated yet. Previous unused codes stop working.
- New technician accounts are `is_active: false` until the technician activates with the code.
- `/admin/disputes/` items also include `resolved_by_name`. Resolving requires the booking to still be `in_progress` (else 409 `invalid_transition`).
- `DELETE /categories/{id}/` always returns 204 (hard delete if unused, otherwise sets `is_active: false`).
- `PATCH /admin/recommendation-settings/` bumps `version` only when `w_p`, `w_r`, `d0_km` or `no_rating_q` actually change (toggling `is_frozen` does not).

## 2026-10-29 02:50 — WebSocket details (clarification)
- After a valid token the server first sends `{"type": "connection.ready", "user_id", "role"}`. Client may send `{"type":"ping"}` → `{"type":"pong"}`.
- Invalid/expired token: the socket is accepted and then closed with code **4401** (so browsers see the code). Origins allowed: `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173`).
