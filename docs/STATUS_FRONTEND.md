STATUS: DONE

# Frontend status

## Milestones
- [x] F1 Scaffold: Vite React TS, Tailwind, Router, Query, Axios client, env, layout shell
- [x] F2 Auth: login, register, activate, token refresh (single-flight), role-based routing
- [x] F3 Maps: Google Maps loader, LocationPicker (Places API (New) autocomplete, geolocation, draggable pin, click-to-place, reverse geocode), coverage overlay + `/coverage/check/`
- [x] F4 Customer: discovery, find & recommendations (ranked list + numbered map + score breakdown + compare), technician detail, booking, my bookings, booking detail/timeline, review
- [x] F5 Technician: dashboard (profile-completeness banner), requests inbox (conflict highlight), job actions, availability week grid + generator, profile & specializations
- [x] F6 Admin: dashboard KPIs + Recharts, applications + verification + approve/reject + create account (one-time code), users, categories, disputes, recommendation settings (sum = 1, freeze), coverage view
- [x] F7 Realtime: `useBookingSocket` (backoff, 4401 → refresh → reconnect, reconnect on token rotation), query invalidation + plain-language toasts, 30 s polling fallback when offline
- [x] F8 Polish & verify: responsive pass at 375 px / 1280 px (no horizontal overflow on any screen), loading/empty/error states, build + lint + unit tests + e2e green against the live backend
- [x] PWA (2026-10-29): installable (manifest, icons, Workbox service worker), Install app button, update toast, offline banner; verified on `vite preview` with Playwright
- [x] Visual refresh (2026-10-29): new colour/type system, pine sidebar, landing hero, restyled shared components — API calls and routes unchanged; rechecked at 375 / 1280 px, booking e2e green

## How to run
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run build          # tsc -b + vite build
npm run lint
npm run test -- --run  # 49 Vitest tests
npm run e2e            # Playwright (backend up + seeded); first time: npx playwright install chromium
```
`frontend/.env.local` (gitignored) holds `VITE_GOOGLE_MAPS_API_KEY` copied from `map_platform_api_key.txt`; `frontend/.env.example` is the committed template.

## Verification (2026-10-29, against the backend at http://localhost:8000, seeded)
- `npm run build`, `npm run lint`, `npm run test -- --run` (49 tests in 7 files): all pass, zero errors.
- Unit tests cover: `format.ts` (km, display rounding, Asia/Manila), ScoreBreakdown reproduces Table 3.3 (A 0.625, B 0.625, C 0.583), ActionBar renders only `allowed_actions`, zod schemas (password rules, weights sum to 1, required reasons), single-flight refresh interceptor, socket backoff/4401 reconnect.
- Playwright `e2e/` (4 tests, run against the live API):
  1. Customer finds Plumbing for tomorrow 9:00 → score breakdown → Book → technician accepts in a second session → **customer receives the live toast** “… accepted your Plumbing request for …” → customer cancels (reason enforced).
  2. Full lifecycle: book → accept → start → request completion (notes) → customer confirms → review (rating required) → technician `rating_count` +1.
  3. Admin records application → adds verification → approves → creates account (code shown once) → technician activates at `/activate` → logs in → sees the incomplete-profile banner.
  4. Admin dashboard renders 3 charts + top technicians; admin resolves the seeded open dispute (skips with a message once no open dispute is left — re-run `seed_demo`).
- Every screen for every role was loaded at 1280 px and 375 px with zero console errors, zero failed API calls and no horizontal overflow.
- A search of tracked files for the Google API key prefix finds nothing.

## PWA — how to test install on a phone
1. Deploy (or serve over HTTPS / a LAN tunnel); a service worker needs HTTPS or `localhost`/`127.0.0.1`.
2. **Android (Chrome/Edge):** open the site, wait a few seconds — an **Install app** button appears in the landing hero (and as a download icon in the signed-in top bar). Tap it → browser install dialog → the app opens standalone with the pine status bar; long-press the icon for the *Find a technician* / *My bookings* shortcuts.
3. **iPhone/iPad (Safari):** **Install app** opens the steps (Share → Add to Home Screen → Add). The home-screen icon is `apple-touch-icon.png`; the app runs full screen.
4. **Updates:** after a new deploy, an open app shows “A new version is available” → **Reload**.
5. **Offline:** turn on airplane mode and open the app — the shell loads, the user stays signed in, and a banner says “You’re offline. Bookings and recommendations need internet.” No data is shown from a cache; reconnect and it loads.
6. Local check: `npm run build && npx vite preview --host 127.0.0.1 --port 5173` (the backend's CORS allows `127.0.0.1:5173`), then DevTools → Application → Manifest / Service workers.

## Versions (exact, pinned in package.json)
Runtime: react 19.3.1, react-dom 19.3.1, react-router 7.18.5, @tanstack/react-query 5.105.0 (+ devtools 5.105.0, dev only), axios 1.21.0, react-hook-form 7.91.0, zod 4.6.7, @hookform/resolvers 6.0.2, recharts 3.10.1, @vis.gl/react-google-maps 1.10.1, lucide-react 1.63.0, date-fns 4.4.0, date-fns-tz 3.2.0, clsx 2.1.1, sonner 2.0.8.
Tooling: vite 8.3.5, @vitejs/plugin-react 6.1.2, typescript 6.0.3, tailwindcss 4.3.3 + @tailwindcss/vite 4.3.3, vitest 5.0.5, jsdom 29.1.1, @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1, @testing-library/user-event 14.6.8, eslint 10.13.0, typescript-eslint 8.72.1, eslint-plugin-react-hooks 7.1.1, prettier 3.9.10, @playwright/test 1.64.1, @types/google.maps 3.66.8, vite-plugin-pwa 2.0.0, workbox-window 7.4.1. Node 22.17.1 / npm 11.12.1.

## Decisions
- **Scaffold** written by hand (no interactive `npm create vite`), same layout as the Vite react-ts template; `@` alias → `src/`.
- **Tokens**: access token in memory, refresh token in `localStorage` (`sp.refresh`); session restored on load via `/auth/token/refresh/` + `/auth/me/`. Refresh is single-flight; a failed refresh clears the session.
- **Visual system “Mt. Apo field kit”** (replaces the plain teal-on-white look): pine `#143426` for structural dark surfaces (desktop sidebar, mobile top bar, public header, landing hero, footer); Apo green (`brand-700 #1a6646`) remains the single interactive accent for buttons, links and focus; marigold `#f0b429` is a highlight used only on pine (active-nav marker, hero CTA, rank badges and map markers); the page background is a sage canvas `#eaf0e8`. Tailwind's `slate` ramp is re-tinted toward green in `@theme`, so every existing gray shares the palette without touching each screen. Type: Bricolage Grotesque for headings and large figures, Atkinson Hyperlegible Next for body (chosen for legibility for a broad local audience), both from Google Fonts with system fallbacks. Hierarchy shows in radius: cards and panels 16 px, controls 10 px, badges fully rounded. Table headers use sentence case. Landing hero has a generated topographic contour backdrop (`public/contours.svg`, twin summits for Mt. Apo). Light theme only; 44 px minimum tap targets; visible focus outlines.
- **Maps**: one `<APIProvider libraries={["places","geocoding","marker"]}>`; no key → inline message + manual lat/lng fallback in the LocationPicker, so the app never crashes. Address search uses `AutocompleteSuggestion.fetchAutocompleteSuggestions` with a session token, `includedRegionCodes: ["ph"]` and `locationRestriction` = the coverage polygon's bounding box (bias around the city center if the polygon is missing). Legacy Places is not used.
- **Coverage**: the picker checks `POST /coverage/check/` on every pin change (debounced). `outside` blocks submit with “This location is outside Kidapawan City coverage”. A failed check does not block — the server re-validates on submit.
- **Distances** always shown as “≈ X.X km away (straight-line)”. Scores shown with 3 decimals, weights with 2 — display only.
- **“Credentials verified” badge** on result cards: `TechnicianSummary` has no verification data, so the Find page fetches `/technicians/{id}/` for each result (cached 5 min) and shows the badge separately from the score with the note “does not affect the score”.
- **Start-time picker** offers every 30-minute step of the day (step from `/config/`); past times are disabled for today. Eligibility is left to the technicians' availability on the server.
- **Booking from a technician profile** uses its own page `/c/book/:technicianId` (service limited to their specializations, availability for the chosen day shown); the ranked flow uses a confirm modal.
- **Booking actions** come only from `allowed_actions`; each opens a ConfirmDialog. Reason is required for `dispute` and for `cancel` on an accepted booking (≥ 5 chars client-side); optional for `decline`; `request_completion` sends optional `notes`. `review` opens a star + comment dialog.
- **Booking detail** is one shared page for all roles (`/c/bookings/:id`, `/t/jobs/:id`, `/a/bookings/:id`) with role-specific guidance banners.
- **Realtime toasts** are skipped for the user's own actions (the UI already confirms them); each toast is built after refetching the booking (the payload is never trusted as state).
- **Weekdays** for “Generate weekly schedule”: 0 = Monday … 6 = Sunday (confirmed in CONTRACT_CHANGES).
- **Admin charts**: single-series, one accent hue, recessive grid, hover tooltips, and a “View as table” toggle for accessibility. Bookings by category uses horizontal bars so long names stay readable; bookings per week uses straight segments (no smoothing).
- **Admin bookings list** (`/a/bookings`, added after v1): every booking via `GET /bookings/` (admin sees all), tabs All / Active / Completed / Declined & cancelled with counts, sort by newest request or appointment time (`ordering`, CONTRACT_CHANGES). Cards show both customer and technician; the dashboard “Bookings” and “Completed bookings” tiles link here, and the admin booking detail's back link returns here.
- **Settings page**: shows a live `w_p + w_r` check and a Table 3.3 preview. Unfreezing sends only `{is_frozen: false}`; values are edited after that.
- **PWA** (vite-plugin-pwa, `generateSW`, `registerType: "prompt"`, registered from React via `useRegisterSW` so no `registerSW.js` is emitted). Manifest: name/short_name/description as requested, `display: standalone`, portrait, `theme_color` pine `#143426` (the brand green of every header and the status bar) and `background_color` canvas `#eaf0e8`; shortcuts to `/c/find` and `/c/bookings`. Icons are rendered from the map-pin mark (pine square, marigold pin): 192, 512, maskable 512 (full bleed, pin inside the safe zone), apple-touch-icon 180, `favicon.ico` + `favicon.svg`.
- **Caching**: precache = built shell only (JS, CSS, HTML, SVG/PNG/ICO icons) + the manifest; Google Fonts CSS/files are runtime-cached (StaleWhileRevalidate) since the shell's type comes from there. API/auth is **NetworkOnly** — any `/api/` URL plus the configured `VITE_API_BASE_URL` origin (baked into a RegExp at build time: Workbox serializes matchers without their closure). Non-GET requests and WebSockets are never intercepted. Google Maps has no route at all, so the browser fetches it directly. `navigateFallback: /index.html` with denylist `/api`, `/ws`, `/django-admin`, `/static`. Verified: after login + reload, Cache Storage holds only `workbox-precache` and `google-fonts` entries.
- **Offline**: banner above the bottom bar when `navigator.onLine` is false **or** the last API request got no response (onLine stays true on dead Wi-Fi). A refresh that fails for lack of a connection no longer signs the user out — only a server rejection clears the session; session restore waits for the `online` event and retries.
- **Install button** (`usePwaInstall`): `beforeinstallprompt` is captured at module load (before React mounts) and deferred; hidden when standalone (`display-mode: standalone` / `navigator.standalone`) or after `appinstalled`; iPhone/iPad (incl. iPadOS reporting as Mac) show Share → Add to Home Screen steps; other browsers show nothing. Placed in the landing hero, the desktop sidebar's user area and the mobile top bar (icon).
- **Render** (`render.yaml`, home-service-web): `Cache-Control: no-cache` for `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, `/index.html`; `public, max-age=31536000, immutable` for `/assets/*`. Render never applies rewrite rules where a file exists, so the SPA rewrite doesn't swallow `/sw.js` or the manifest.
- **ESLint**: `react-hooks/incompatible-library` is off — the React Compiler is not used, and RHF's `watch()` is its documented API.

## Mismatches found
None blocking. Backend extras beyond contract v1 that the UI uses or tolerates:
- Booking: `started_at`, `completion_notes` (shown on the detail page); `status_history[].event` (labels same-status rows like “Completion requested”).
- Admin dispute: `resolved_by_name`. Technician me: `is_approved`. Generate: `{created, skipped}` (toast reports skipped days).
- Application `rejection_reason` is `""`, not `null`, when there is none (handled).
- `rating_avg` is `null` with no reviews (CONTRACT_CHANGES, handled as “No ratings yet”).
- The backend re-seeded during the session (IDs changed); nothing in the UI hard-codes IDs.
- Adapted to CONTRACT_CHANGES 2026-10-29 02:50: extra error codes (`account_not_approved`, `permission_denied`, `settings_frozen`, `cannot_deactivate_self`) have friendly copy; `missing_fields: "service_categories"` is labelled; new `POST /admin/applications/{id}/reissue-code/` is exposed as “Reissue activation code” on accounts not yet activated (code shown once, like create-account).

## Known gaps
- The DoD walkthrough's “start” step can't happen for a booking tomorrow at 9:00: the backend allows start only within `START_EARLY_MINUTES` (60) of the start time. The e2e covers the full lifecycle with a booking starting within the next 30 minutes on a slot it creates through the API.
- The e2e dispute test consumes the single seeded open dispute; re-run `seed_demo` to exercise it again (it skips cleanly otherwise). The e2e also confirms or cancels leftover tech1 bookings of earlier runs.
- Once during e2e development, a full page reload immediately after login redirected to `/login`; it did not reproduce in 6 scripted retries or 3 later full runs. The likely cause is refresh-token rotation: if a refresh is in flight when the page unloads, the rotated token is lost and the old one is blacklisted. Normal use (no reload mid-refresh) is unaffected.
- The TanStack Query devtools button (dev builds only) overlaps the first mobile bottom-nav item at 375 px and the user block in the desktop sidebar; it is absent from production builds.
- Fonts load from Google Fonts; offline or blocked, the UI falls back to system sans-serif.
- The coverage polygon is the backend's development placeholder; the admin dashboard and coverage page show the warning badge until an official boundary is loaded.
- Google Maps key restrictions (HTTP referrers) must be set in Cloud Console before deployment.
