# SPEC — distilled from the paper (Chapter 3 is authoritative)

If this file and the paper disagree, the paper wins. If the paper is silent, this file's "Implementation decisions" apply.

## 1. Scope
- Web platform (responsive: desktop + mobile browsers) for **household customers**, **approved technicians**, and **administrators** inside **Kidapawan City**.
- The system **recommends**; it never auto-assigns a technician or auto-confirms a booking.
- Out of scope: Google Routes API (no road distance / ETA / live tracking), payments, native mobile apps.

## 2. Software stack (Table 3.7 — fixed)
| Layer | Technology |
|---|---|
| Frontend & navigation | React, Vite, React Router |
| Styling | Tailwind CSS |
| Data fetching | Axios, TanStack Query |
| Forms | React Hook Form, Zod |
| Charts | Recharts |
| Backend & API | Django, Django REST Framework |
| Authentication | SimpleJWT |
| Authorization | Django + DRF permissions |
| CORS | django-cors-headers |
| Database | PostgreSQL |
| Geo | PostGIS via GeoDjango |
| Maps & address search | Google Maps JavaScript API, **Places API (New)** |
| Geocoding | Google Geocoding API |
| User location | Browser Geolocation API |
| Recommendations | Custom Python module |
| Booking updates (realtime) | Django Channels + Redis |
| Background tasks | Celery + Redis |

Hardware target: deployment server 2 vCPU / 4 GB RAM / 40 GB SSD — keep services lean.
Record exact versions used (the evaluation build must have fixed versions).

## 3. Roles & use cases (Table 3.9)
- **Customer**: self-register; maintain profile; search/filter technicians by category; get recommendations; compare; book; track; confirm completion; review (once per completed booking).
- **Technician**: activate the account the admin created; maintain permitted profile (bio, phone, specializations, operating location); manage availability; accept/decline requests; start work; request completion confirmation.
- **Administrator**: record technician applications (applicant submits documents **in person**); record credential verification results; approve/reject; create technician account **only for approved** applicants; manage users, service categories, disputes, recommendation settings.

## 4. Technician recommendation (Section 3.1.3)
### Eligibility — all must hold
1. Technician account approved and active.
2. Technician offers the requested service category (category active).
3. Customer service location **and** technician recorded location are inside the Kidapawan City boundary polygon.
4. Technician is available for the whole requested interval (interval fully inside one `available` availability slot).
5. Interval does not overlap an **Accepted** or **In Progress** booking of that technician.
- Technicians with incomplete profiles (no location, invalid coordinates, no active service) never appear.
- No eligible technician → return an explanation; customer may change service or schedule.
- Eligibility is checked **again** when the technician accepts.

### Distance
- Store points as lat/lng (SRID 4326). Distance = PostGIS `ST_Distance` on **geography** (meters) → km.
- It is straight-line distance — label it that way in the UI. Not road distance, not travel time, not live location.

### Scores (use unrounded values)
- Proximity: `P_i = 1 / (1 + d_i / d0)`, `d0 = 1 km` initially.
- Rating: `Q_i = (r̄_i − 1) / 4`, r̄_i = average rating on 1–5. **No reviews → Q_i = 0.50** and profile shows "No ratings yet".
- Overall: `S_i = w_p·P_i + w_r·Q_i`, initial `w_p = 0.50`, `w_r = 0.50`.
- Order: S desc → distance asc → technician record id asc.
- Display per result: specialization(s), distance, availability, average rating, review count. Credential verification is shown **separately** and never affects the score.
- Settings (w_p, w_r, d0, no-rating Q) are adjustable during pilot testing and then frozen; store them with a version.

### Required regression test (Table 3.3, d0 = 1, equal weights)
| Tech | d (km) | rating | P | Q | S | rank |
|---|---|---|---|---|---|---|
| A | 1.00 | 4.0 | 0.5000 | 0.7500 | 0.6250 | 1 (tie with B, nearer) |
| B | 3.00 | 5.0 | 0.2500 | 1.0000 | 0.6250 | 2 |
| C | 0.50 | none | 0.6667 | 0.5000 | 0.5833 | 3 |

## 5. Booking rules (Section 3.1.4, Table 3.4)
Statuses: `pending`, `accepted`, `declined`, `cancelled`, `in_progress`, `completed`.
- **Pending** does not reserve the interval. **Accepted** reserves it.
- Acceptance re-runs eligibility + conflict check inside a DB transaction with row locking; a PostgreSQL **exclusion constraint** prevents overlapping accepted/in-progress bookings per technician.
- Technician submits a completion request; **customer confirms** → `completed`. Disputes go to the admin, whose decision is recorded.
- Reviews only after completion is confirmed; one review per booking; reviewer = booking's customer; integer 1–5 + optional comment. Rating average and count update on each review.
- Every status change writes a **status history** row (previous, new, actor or system, time, reason). History is never deleted.

### Implementation decisions (the paper says these "will be documented before implementation")
- **Appointment block**: default **120 minutes**, configurable (`BOOKING_BLOCK_MINUTES`). Customer picks a start time; end = start + block. Start must be in the future and aligned to 30-minute steps.
- **Allowed transitions**
  | From | To | Who | Notes |
  |---|---|---|---|
  | pending | accepted | technician | re-check eligibility & conflicts |
  | pending | declined | technician | optional reason |
  | pending | cancelled | customer | any time before start |
  | pending | cancelled | system | Celery: start time passed while still pending (reason "expired") |
  | accepted | in_progress | technician | not earlier than 60 min before start |
  | accepted | cancelled | customer or technician | before start; **reason required** |
  | in_progress | (completion requested) | technician | sets `completion_requested_at`; status stays `in_progress` |
  | in_progress | completed | customer | only after completion requested |
  | in_progress | (dispute opened) | customer | instead of confirming; reason required |
  | dispute | completed / cancelled / back to in_progress | admin | decision + notes recorded |
- **Appointment changes**: not supported as edits — cancel and re-book (keeps history clean).
- Customers cannot cancel `in_progress`; only admin via dispute resolution.

## 6. Data records (Table 3.8)
- **User**: unique email (login), password hash, role (`customer` | `technician` | `admin`), active flag. One profile per user.
- **CustomerProfile**: user (1:1), phone, default address, default location (point, optional).
- **TechnicianApplication**: applicant name, contact details, address, requested categories, notes, status (`submitted` | `under_review` | `approved` | `rejected`), submitted_at, decided_by, decided_at, rejection reason.
- **VerificationRecord**: application FK, credential type, method (`official_portal` | `issuing_institution` | `in_person_inspection`), outcome (`verified` | `not_verified` | `inconclusive`), checked_on date, responsible admin, notes.
- **TechnicianProfile**: user (1:1, unique), application (1:1, unique), bio, phone, years_experience, address, location (point), rating_avg, rating_count, is_approved.
- **TechnicianService**: technician + category, unique pair. Inactive categories excluded from new searches.
- **ServiceCategory**: name, slug, description, icon, is_active.
- **Availability**: technician FK, tz-aware start/end, state (`available` | `unavailable`), end > start.
- **Booking**: customer, technician, category FKs; confirmed point + address; start, end; status; notes; completion_requested_at; completed_at; confirmed_by; cancellation reason/actor; decline reason. No overlapping accepted/in_progress per technician (exclusion constraint).
- **BookingStatusHistory**: booking FK, from_status, to_status, actor (nullable = system), actor_role, reason, created_at.
- **BookingDispute**: booking FK, opened_by, reason, status (`open` | `resolved`), decision, admin notes, resolved_by, resolved_at.
- **Review**: booking (unique 1:1), rating 1–5, comment, created_at.
- **CoverageArea**: name, polygon (SRID 4326), source, version, verified flag, active flag. Only one active.
- **RecommendationSettings**: w_p, w_r, d0_km, no_rating_q, version, is_frozen, updated_by, updated_at.

## 7. Coverage boundary
- A real Kidapawan City polygon must come from an official source (e.g. PSA/NAMRIA admin level-3 boundaries, available on HDX as GeoJSON). Load with a management command that records source + version.
- Until then, seed a **development placeholder** polygon (bounding box lat 6.93–7.12, lng 125.00–125.25) with `verified = false`, `source = "DEV PLACEHOLDER — not for formal testing"`. The UI should show a small warning badge to admins when the active boundary is unverified.

## 8. Non-functional (Table 3.2, ISO/IEC 25010 subset)
- Functional suitability: automated tests for account, eligibility, ranking, booking, review rules.
- Performance: include a simple load script (e.g. Locust) for recommendations + booking list endpoints.
- Interaction: readable labels, clear navigation, validation messages, role-specific instructions, mobile-friendly.
- Reliability: reject conflicting bookings, transactional writes, documented backup + restore (pg_dump / pg_restore).
- Security: JWT auth, role permissions, record ownership checks, hashed passwords, server-side validation of everything.
- Flexibility: works on current Chrome/Edge/Firefox desktop + mobile; documented install steps.
