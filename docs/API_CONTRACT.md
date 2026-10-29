# API CONTRACT v1 — backend and frontend both build to this

Base URL: `http://localhost:8000/api` · WebSocket: `ws://localhost:8000/ws` · Frontend origin: `http://localhost:5173`
Changes after the start go in `docs/CONTRACT_CHANGES.md` (backend appends; frontend adapts).

## 0. Conventions
- JSON only. snake_case keys. IDs are integers.
- Auth header: `Authorization: Bearer <access>`. Access token 30 min, refresh token 7 days, refresh rotation on.
- Datetimes: ISO 8601 with offset, e.g. `2026-11-03T09:00:00+08:00`. Server TZ `Asia/Manila`.
- Points: `{"lat": 7.0083, "lng": 125.0894}` (never GeoJSON, except `/coverage/` geometry).
- Lists are paginated: `{"count": 42, "next": "...", "previous": null, "results": [...]}`, `?page=` and `?page_size=` (default 20, max 100).
- Errors:
  - Validation: `400 {"field_name": ["message"], "non_field_errors": ["message"]}`
  - Business rule: `400/409 {"detail": "Human readable message", "code": "<error_code>"}`
  - `401` unauthenticated, `403` wrong role / not owner, `404` not found.
- Error codes: `outside_coverage`, `no_eligible_technicians`, `technician_unavailable`, `booking_conflict`, `invalid_transition`, `reason_required`, `already_reviewed`, `not_completed`, `profile_incomplete`, `application_not_approved`, `account_exists`, `invalid_activation`.

## 1. Enums
```
role:                  customer | technician | admin
booking_status:        pending | accepted | declined | cancelled | in_progress | completed
application_status:    submitted | under_review | approved | rejected
verification_method:   official_portal | issuing_institution | in_person_inspection
verification_outcome:  verified | not_verified | inconclusive
availability_state:    available | unavailable
dispute_status:        open | resolved
dispute_decision:      completed | cancelled | return_in_progress
booking_action:        accept | decline | cancel | start | request_completion | confirm_completion | dispute | review
```

## 2. Shared objects
```jsonc
// User
{ "id": 1, "email": "a@b.c", "first_name": "Ana", "last_name": "Cruz", "full_name": "Ana Cruz",
  "phone": "09171234567", "role": "customer", "is_active": true, "date_joined": "...",
  "technician_profile_id": null }          // set when role = technician

// CategoryRef / Category
{ "id": 3, "name": "Aircon Repair", "slug": "aircon-repair", "description": "", "icon": "snowflake", "is_active": true }

// TechnicianSummary
{ "id": 7, "user_id": 12, "full_name": "Ben Santos", "phone": "0917...",
  "specializations": [CategoryRef], "years_experience": 5, "bio": "...",
  "address": "Brgy. Poblacion, Kidapawan City", "location": {"lat": 7.01, "lng": 125.09},
  "rating_avg": 4.5, "rating_count": 12, "rating_display": "4.5 (12 reviews)",   // "No ratings yet" when 0
  "is_profile_complete": true }

// TechnicianDetail = TechnicianSummary + 
{ "verification_summary": [ { "credential_type": "TESDA NC II", "outcome": "verified", "checked_on": "2026-10-01" } ],
  "recent_reviews": [Review] }

// AvailabilitySlot
{ "id": 5, "start": "...", "end": "...", "state": "available" }

// Booking
{ "id": 20, "status": "pending",
  "customer":   { "id": 3, "full_name": "Ana Cruz", "phone": "..." },
  "technician": { "id": 7, "full_name": "Ben Santos", "phone": "..." },
  "category": CategoryRef,
  "address": "Purok 3, Brgy. Lanao", "location": {"lat": 7.0, "lng": 125.1},
  "start": "...", "end": "...", "notes": "Leaking pipe under sink",
  "distance_km": 2.41,                       // straight-line customer→technician at booking time
  "completion_requested_at": null, "completed_at": null, "confirmed_by": null,  // "customer" | "admin"
  "cancellation_reason": null, "cancelled_by_role": null,  // "customer" | "technician" | "system" | "admin"
  "decline_reason": null,
  "conflicts_with_reserved": false,          // pending only: true if it now overlaps an accepted job
  "dispute": null,                           // or { "id", "status", "reason", "decision", "admin_notes", "created_at", "resolved_at" }
  "review": null,                            // or Review
  "allowed_actions": ["cancel"],             // computed for the requesting user — frontend shows only these buttons
  "status_history": [ { "from_status": null, "to_status": "pending", "actor_role": "customer",
                        "actor_name": "Ana Cruz", "reason": "", "created_at": "..." } ],
  "created_at": "...", "updated_at": "..." }

// Review
{ "id": 9, "booking_id": 20, "rating": 5, "comment": "Fast and clean", "customer_name": "Ana C.", "created_at": "..." }
```
`status_history` is included in detail responses; list responses may omit it.

## 3. Endpoints

### Health & config (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/health/` | `{"status": "ok"}` |
| GET | `/config/` | `{"booking_block_minutes": 120, "slot_step_minutes": 30, "timezone": "Asia/Manila", "city_center": {"lat": 7.0083, "lng": 125.0894}, "recommendation_settings": RecSettings, "coverage": {"name", "verified", "version"}}` |
| GET | `/coverage/` | `{"name", "source", "version", "verified", "geometry": <GeoJSON Polygon/MultiPolygon>}` |
| POST | `/coverage/check/` | body `{"lat","lng"}` → `{"inside": true}` |

### Auth
| Method | Path | Body → Response |
|---|---|---|
| POST | `/auth/register/` | `{email, password, first_name, last_name, phone}` → `201 User` (role customer). Password ≥ 8, Django validators |
| POST | `/auth/token/` | `{email, password}` → `{access, refresh, user: User}` |
| POST | `/auth/token/refresh/` | `{refresh}` → `{access, refresh}` |
| POST | `/auth/logout/` | `{refresh}` → `204` (blacklist) |
| POST | `/auth/activate/` | `{email, activation_code, password}` → `200 {detail}`; technician sets own password. Errors `invalid_activation` |
| GET / PATCH | `/auth/me/` | `User`; PATCH `{first_name, last_name, phone}` |
| POST | `/auth/change-password/` | `{old_password, new_password}` → `204` |

### Customer profile (role customer)
| GET / PATCH | `/customers/me/` | `{phone, default_address, default_location: Point|null}` |

### Categories
| Method | Path | Who |
|---|---|---|
| GET | `/categories/` | any (unpaginated array of active categories). Admin may pass `?include_inactive=true` |
| POST | `/categories/` | admin `{name, description, icon, is_active}` |
| PATCH / DELETE | `/categories/{id}/` | admin (DELETE = soft deactivate if in use) |

### Technicians — discovery (authenticated)
| GET | `/technicians/?category=<id>&search=<text>&ordering=-rating_avg` | `Paginated<TechnicianSummary>`; only approved, active, complete profiles |
| GET | `/technicians/{id}/` | `TechnicianDetail` |
| GET | `/technicians/{id}/availability/?from=<date>&to=<date>` | `[AvailabilitySlot]` plus `"reserved": [{start,end}]` → response `{"slots": [...], "reserved": [...]}` (default next 14 days) |
| GET | `/technicians/{id}/reviews/` | `Paginated<Review>` |

### Technician self-service (role technician)
| GET / PATCH | `/technicians/me/` | `TechnicianDetail` + `"missing_fields": ["location"]`; PATCH `{bio, phone, years_experience, address, location: Point, service_category_ids: [int]}`. Location must be inside coverage (`outside_coverage`) |
| GET | `/technicians/me/availability/?from=&to=` | `[AvailabilitySlot]` |
| POST | `/technicians/me/availability/` | `{start, end, state}` or bulk `{"slots": [{start,end,state}, ...]}`; end > start; no overlapping slots of same technician |
| PATCH / DELETE | `/technicians/me/availability/{id}/` | cannot delete/shrink a slot that contains an accepted/in_progress booking (`booking_conflict`) |
| POST | `/technicians/me/availability/generate/` | `{"weekdays": [0..6], "start_time": "08:00", "end_time": "17:00", "from": "2026-11-01", "to": "2026-11-30"}` → creates slots, skips overlaps, returns `{created: n}` |

### Recommendations (role customer)
`GET /recommendations/?category=<id>&lat=<f>&lng=<f>&start=<iso>[&end=<iso>]`
- `end` defaults to `start + booking_block_minutes`.
- Errors: `outside_coverage` (400), validation for past/misaligned start (400).
- Response 200 (empty results is still 200):
```jsonc
{ "query": { "category": CategoryRef, "location": Point, "start": "...", "end": "..." },
  "settings": { "w_p": 0.5, "w_r": 0.5, "d0_km": 1.0, "no_rating_q": 0.5, "version": 1 },
  "results": [
    { "rank": 1, "technician": TechnicianSummary,
      "distance_km": 1.0, "proximity_score": 0.5, "rating_score": 0.75, "score": 0.625,
      "has_ratings": true,
      "availability": { "slot_id": 5, "start": "...", "end": "..." } } ],
  "empty_reason": null }   // when results = []: { "code": "no_eligible_technicians", "message": "No technician offering Plumbing is free on Nov 3, 9:00–11:00 AM. Try another time." }
```
Scores are unrounded floats; frontend rounds for display only.

### Bookings
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/bookings/` | customer | `{technician_id, category_id, location: Point, address, start, end?, notes}` → `201 Booking` (pending). Re-checks eligibility → `outside_coverage` / `technician_unavailable` |
| GET | `/bookings/?status=<s>&status=<s2>&upcoming=true&page=` | any | customer: own; technician: assigned; admin: all. Newest first |
| GET | `/bookings/{id}/` | owner / admin | full Booking with `status_history` |
| POST | `/bookings/{id}/accept/` | technician | `{}` → Booking. `booking_conflict` (409) / `technician_unavailable` (409) |
| POST | `/bookings/{id}/decline/` | technician | `{reason?}` |
| POST | `/bookings/{id}/cancel/` | customer / technician | `{reason}` (required when accepted → `reason_required`) |
| POST | `/bookings/{id}/start/` | technician | accepted → in_progress |
| POST | `/bookings/{id}/request-completion/` | technician | `{notes?}` sets `completion_requested_at` |
| POST | `/bookings/{id}/confirm-completion/` | customer | → completed |
| POST | `/bookings/{id}/dispute/` | customer | `{reason}` → opens dispute |
| POST | `/bookings/{id}/review/` | customer | `{rating: 1..5, comment?}` → `201 Review`; `not_completed`, `already_reviewed` |
Invalid state change → `409 {"code": "invalid_transition"}`.

### Admin (role admin) — prefix `/admin/`
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats/` | `{"totals": {"customers", "technicians", "active_technicians", "pending_applications", "bookings", "completed_bookings", "open_disputes", "avg_rating"}, "bookings_by_status": [{"status","count"}], "bookings_by_category": [{"category","count"}], "bookings_per_week": [{"week_start","count"}] (last 12 weeks), "top_technicians": [{"id","full_name","rating_avg","rating_count","completed"}]}` |
| GET / POST | `/admin/applications/?status=&search=` | Application: `{id, first_name, last_name, email, phone, address, requested_categories: [CategoryRef], notes, status, submitted_at, decided_at, decided_by_name, rejection_reason, verifications: [Verification], technician_profile_id, account_created: bool}`; POST `{first_name, last_name, email, phone, address, requested_category_ids, notes}` |
| GET / PATCH | `/admin/applications/{id}/` | PATCH contact fields / notes / `status: "under_review"` |
| POST | `/admin/applications/{id}/verifications/` | `{credential_type, method, outcome, checked_on, notes}` → Verification `{id, credential_type, method, outcome, checked_on, notes, checked_by_name, created_at}` |
| POST | `/admin/applications/{id}/approve/` | `{}` |
| POST | `/admin/applications/{id}/reject/` | `{reason}` |
| POST | `/admin/applications/{id}/create-account/` | only when approved and no account yet → `201 {"user": User, "technician_profile_id": 7, "activation_code": "K7P2-9QXM", "expires_at": "..."}` (code shown once; stored hashed; 7-day expiry). Errors `application_not_approved`, `account_exists` |
| GET | `/admin/users/?role=&search=&is_active=` | `Paginated<User>` |
| PATCH | `/admin/users/{id}/` | `{is_active}` (cannot deactivate self) |
| GET | `/admin/disputes/?status=open` | `Paginated<{id, booking: Booking, reason, status, decision, admin_notes, opened_by_name, created_at, resolved_at}>` |
| POST | `/admin/disputes/{id}/resolve/` | `{decision: dispute_decision, admin_notes}` |
| GET / PATCH | `/admin/recommendation-settings/` | RecSettings `{w_p, w_r, d0_km, no_rating_q, version, is_frozen, updated_at}`; PATCH bumps version; 409 if frozen (unless body sets `is_frozen: false`). w_p + w_r must equal 1 |
| GET | `/admin/coverage/` | same as `/coverage/` plus `"is_placeholder": bool` |

## 4. WebSocket
- URL: `ws://localhost:8000/ws/bookings/?token=<access>` (rejected with close code 4401 if token invalid/expired).
- Server sends to every participant of a booking (customer, technician, admins) after the DB commit:
```json
{ "type": "booking.updated", "booking_id": 20, "status": "accepted", "previous_status": "pending",
  "event": "accepted", "actor_role": "technician", "at": "2026-11-03T08:12:00+08:00" }
```
- `event` ∈ `created | accepted | declined | cancelled | started | completion_requested | completed | disputed | dispute_resolved | reviewed`.
- Client never trusts the payload as state; it refetches the booking.

## 5. Seed data (`python manage.py seed_demo`) — fixed credentials
| Role | Email | Password |
|---|---|---|
| admin | `admin@demo.local` | `Admin123!` |
| customer | `customer@demo.local` | `Customer123!` |
| customer | `customer2@demo.local` | `Customer123!` |
| technician | `tech1@demo.local` … `tech10@demo.local` | `Tech123!` |
Seed: 8 categories (Aircon Repair, Electrical, Plumbing, Appliance Repair, Carpentry, Computer & Phone Repair, Roofing, Welding), 10 technicians spread around Kidapawan City barangays with 1–3 specializations, availability 08:00–17:00 Mon–Sat for the next 21 days, a few completed bookings with reviews (some technicians left with no reviews), 1 pending, 1 accepted, 1 in-progress with completion requested, 1 open dispute, 3 applications in different states (one approved without account).
