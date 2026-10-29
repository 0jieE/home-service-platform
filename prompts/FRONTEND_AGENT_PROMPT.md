You are the FRONTEND agent for this repo. A BACKEND agent is building the Django API in parallel in `backend/`. Work autonomously until every milestone is done — do not stop to ask questions, confirm plans, or wait for approval. Make reasonable decisions, log them in `docs/STATUS_FRONTEND.md` under "Decisions", and keep going.

## Read first (in this order)
1. `CLAUDE.md` — ownership, coordination, git, secrets rules. Obey them.
2. `docs/SPEC.md` — business rules distilled from the paper.
3. `docs/API_CONTRACT.md` — the exact API. Code against it now; don't wait for the backend.
4. `docs/CONTRACT_CHANGES.md` — re-read before every milestone and adapt to any change.
5. `docs/paper/paper_fulltext.txt` (Chapters 1 & 3) when you need detail. The PDF is beside it.

You own only `frontend/` and `docs/STATUS_FRONTEND.md`. Never touch `backend/` or `docker-compose.yml`.

## Stack (fixed by the paper — do not substitute)
React + **TypeScript** on Vite, React Router, Tailwind CSS (v4 with `@tailwindcss/vite`), Axios, TanStack Query (+ devtools in dev), React Hook Form + Zod (`@hookform/resolvers`), Recharts, Google Maps via `@vis.gl/react-google-maps`. Small helpers allowed: `lucide-react`, `date-fns` + `date-fns-tz`, `clsx`, `sonner` (toasts). No other UI framework (no MUI/Ant/Chakra). Vitest + Testing Library for tests. ESLint + Prettier. Record exact versions in STATUS.

## Setup
- `frontend/` has only a placeholder `README.md`. Delete it, then scaffold non-interactively (e.g. `npm create vite@latest frontend -- --template react-ts` from the repo root, or scaffold in a temp folder and move the files in). Never leave a prompt waiting for input.
- Env: create `frontend/.env.local` (gitignored) by reading the key from `../map_platform_api_key.txt` — never print the key, never commit it. Also commit `frontend/.env.example`:
  ```
  VITE_API_BASE_URL=http://localhost:8000/api
  VITE_WS_BASE_URL=ws://localhost:8000/ws
  VITE_GOOGLE_MAPS_API_KEY=
  VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
  ```
- Dev server on port 5173 (`strictPort: true`).

## Google Maps — important details
- The key has **Maps JavaScript API, Places API (New), Geocoding API** enabled. Legacy Places is NOT enabled, so do **not** use `google.maps.places.Autocomplete` / `AutocompleteService` / `PlacesService`. Use the new APIs: `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions()` with an `AutocompleteSessionToken` for a custom Tailwind dropdown (preferred), then `placePrediction.toPlace().fetchFields({fields: ["location","formattedAddress","displayName"]})`. Restrict with `includedRegionCodes: ["ph"]` and `locationRestriction`/`locationBias` around Kidapawan (center from `/config/`).
- Reverse geocoding after a pin drag/click: `google.maps.Geocoder` (Geocoding API).
- Markers: `AdvancedMarker` needs a Map ID — use `VITE_GOOGLE_MAPS_MAP_ID` (`DEMO_MAP_ID` works for dev).
- No Routes/Directions API. Distances shown are straight-line from the backend; label them "≈ X.X km away (straight-line)".
- Wrap the app once in `<APIProvider apiKey=... libraries={["places","geocoding","marker"]}>`. If the key is missing, show a clear inline message instead of crashing.

## Reusable `LocationPicker` component
Map + search box (Places New) + "Use my location" button (Browser Geolocation API, with permission-denied and timeout handling) + draggable pin + click-to-place + reverse-geocoded address field the user can edit. Draw the coverage polygon from `GET /coverage/` as an outline. Validate with `POST /coverage/check/`; if outside, show "This location is outside Kidapawan City coverage" and block submit. Output `{lat, lng, address}`. Used by customer search, customer profile, and technician profile.

## Architecture
```
frontend/src/
  main.tsx  App.tsx  router.tsx  index.css
  lib/        api.ts (axios instance + JWT interceptors + single-flight refresh), queryClient.ts, ws.ts, format.ts (dates in Asia/Manila, km, scores), env.ts
  types/      api.ts (TS types mirroring the contract), schemas.ts (zod for forms)
  api/        auth.ts, categories.ts, technicians.ts, recommendations.ts, bookings.ts, admin.ts, coverage.ts, config.ts   (one function + one hook per endpoint; query keys centralized)
  auth/       AuthProvider, useAuth, RequireRole, token storage (access in memory, refresh in localStorage)
  components/ ui/ (Button, Input, Select, Textarea, Card, Badge, Modal, Tabs, Table, EmptyState, Spinner, ConfirmDialog, Pagination, RatingStars), map/ (LocationPicker, CoverageOverlay, TechnicianMap), booking/ (StatusBadge, StatusTimeline, ActionBar driven by allowed_actions), layout/ (AppShell with role-specific nav, mobile bottom nav)
  features/   customer/, technician/, admin/, auth/, public/
```
- Booking action buttons are rendered **only** from `booking.allowed_actions`. Each action opens a ConfirmDialog; cancel/decline/dispute collect a reason (required where the contract says so).
- Map backend errors: show `detail` for business errors (`code` → friendly copy), map field errors onto RHF fields.
- Use the contract's enums as TS union types; zod schemas for every form.

## Routes & screens
Public: `/` (landing: what the platform does, how recommendations work in plain words, login/register CTAs), `/login`, `/register` (customer only), `/activate` (technician sets password with activation code from admin).
After login, redirect by role.

**Customer** (`/c/...`)
- `find` — main flow: pick category → pick location (LocationPicker, prefilled from profile default) → pick date + start time (30-min steps, from `/config/`; end shown as start + block) → results. Results = ranked list + map with markers (numbered by rank) and the customer pin. Each card: name, specializations, "≈ 1.0 km (straight-line)", rating ("4.5 ★ · 12 reviews" or "No ratings yet"), available window, score with an expandable breakdown "Proximity 0.500 × 0.50 + Rating 0.750 × 0.50 = 0.625", and a separate "Credentials verified" badge (explicitly not part of the score). Compare mode: select 2–3 cards to view side by side. Empty state shows `empty_reason.message` and quick buttons to change time/category.
- `technicians` — discovery: search + category filter, paginated list.
- `technicians/:id` — detail, verification summary (separate section), reviews, 14-day availability view, "Book" button.
- Booking confirm modal/page → POST `/bookings/` → go to booking detail.
- `bookings` — tabs: Active (pending/accepted/in_progress), Past (completed/declined/cancelled).
- `bookings/:id` — status, StatusTimeline from `status_history`, map of the location, ActionBar (cancel, confirm completion, dispute, review). Review form: 1–5 stars + comment.
- `profile` — name/phone + default address/location.

**Technician** (`/t/...`)
- `dashboard` — profile-completeness banner listing `missing_fields` (technicians don't appear in recommendations until complete), today's jobs, pending requests count, rating summary.
- `requests` — pending requests with accept/decline; highlight `conflicts_with_reserved`.
- `jobs` + `jobs/:id` — accepted/in-progress/past; start, request completion, cancel (reason).
- `availability` — week view of slots (simple grid, no heavy calendar lib), add/edit/delete slot, "Generate weekly schedule" form (weekdays + hours + date range), reserved bookings shown read-only.
- `profile` — bio, phone, years of experience, specializations (multi-select of active categories), operating location via LocationPicker.

**Admin** (`/a/...`)
- `dashboard` — KPI tiles + Recharts: bookings by status (bar), bookings per week (line), bookings by category (bar), top technicians table. Warning badge when the active coverage boundary is unverified placeholder.
- `applications` (+ `:id`) — create application (applicant came in person), status filter; detail shows contact info, requested categories, verification records + "Add verification record" form (credential type, method, outcome, checked date, notes), approve / reject (reason), and "Create technician account" when approved → modal shows the activation code once with copy button and instructions.
- `users` — filter by role, search, activate/deactivate.
- `categories` — CRUD table.
- `disputes` — open/resolved, resolve modal with decision + notes, link to booking.
- `settings` — recommendation weights (w_p, w_r with live sum = 1 validation), d0, no-rating Q, version, frozen toggle with a warning that settings must be frozen before formal evaluation.
- `coverage` — map of the active polygon with source/version/verified info.

## Realtime
`useBookingSocket()` mounted in the authenticated shell: connect to `${VITE_WS_BASE_URL}/bookings/?token=<access>`, reconnect with exponential backoff, reconnect with a fresh token after refresh, on `booking.updated` invalidate `["bookings"]` and `["booking", id]` (and dashboard queries) and show a sonner toast in plain language ("Ben Santos accepted your Plumbing request for Nov 3, 9:00 AM"). If the socket is down, booking queries fall back to `refetchInterval: 30000`.

## Design
Clean, trustworthy, mobile-first service-app look. One accent color, neutral grays, generous spacing, large tap targets, readable labels, visible focus states, form validation messages under fields, skeleton/loading states, empty states with a next action, and role-appropriate instructions at the top of key screens (the paper evaluates "interaction capability"). Light theme is enough. Test at 375 px and 1280 px widths.

## Working in parallel with the backend
- Build every screen against the contract types first. Don't block on the backend.
- Periodically check `curl -s http://localhost:8000/api/health/` and read `docs/STATUS_BACKEND.md` (look for `API READY: yes, seeded`). Once ready, run the app against it with the seed accounts from contract §5 and fix every mismatch on your side. If the backend differs from the contract and it's not in CONTRACT_CHANGES, adapt defensively and note it in your STATUS under "Mismatches found" (do not edit backend files).
- If the backend never becomes ready during your session, still finish all screens, make `npm run build` pass, and state that integration testing is pending.

## Tests
Vitest: `format.ts` (km, score rounding display only, Manila time), the score breakdown component reproduces Table 3.3 values (A 0.625, B 0.625, C 0.583), `ActionBar` renders only `allowed_actions`, zod schemas (password rules, weights sum to 1, required reasons), auth refresh interceptor single-flight.

## Milestones (update STATUS + commit after each)
F1 scaffold → F2 auth → F3 maps/LocationPicker → F4 customer → F5 technician → F6 admin → F7 realtime → F8 polish + verification.

## Definition of done
- `npm install && npm run dev` serves on 5173; `npm run build`, `npm run lint`, `npm run test -- --run` all pass with zero errors.
- With the backend up and seeded: full manual/scripted walk-through works — customer login → find (Plumbing, a Kidapawan location, tomorrow 9:00) → book → technician accepts (customer sees a live toast) → start → request completion → customer confirms → review → technician rating updates; admin creates application → adds verification → approves → creates account → technician activates at `/activate` and logs in; admin resolves the seeded dispute; admin dashboard charts render.
- Optional but encouraged: a Playwright smoke script in `frontend/e2e/` for the customer booking flow.
- No API key in git (`git grep` for "AIza" returns nothing in tracked files).
- `docs/STATUS_FRONTEND.md` starts with `STATUS: DONE`, lists how to run, decisions, versions, mismatches found, and known gaps.
- Final commit made.

Start now with F1.
