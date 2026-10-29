# Frontend — Kidapawan Home Service (React + TypeScript + Vite)

## Run

```powershell
cd frontend
npm install
# one-time: create .env.local with the Maps key (never commit it)
#   VITE_API_BASE_URL=http://localhost:8000/api
#   VITE_WS_BASE_URL=ws://localhost:8000/ws
#   VITE_GOOGLE_MAPS_API_KEY=<contents of ../map_platform_api_key.txt>
#   VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
npm run dev          # http://localhost:5173 (strictPort)
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | type-check (`tsc -b`) + production build to `dist/` |
| `npm run lint` | ESLint (typescript-eslint, react-hooks, prettier-compatible) |
| `npm run test -- --run` | Vitest unit/component tests |
| `npm run e2e` | Playwright smoke tests (needs backend up + `seed_demo`; starts the dev server if needed; first time: `npx playwright install chromium`) |
| `npm run format` | Prettier |

Production build (Render static site, see `../render.yaml` / `../docs/DEPLOY.md`): the `VITE_*` values above are read at
**build time** from the environment — `VITE_API_BASE_URL=https://<api host>/api`, `VITE_WS_BASE_URL=wss://<api host>/ws`
(a `ws://` URL is upgraded to `wss://` automatically on https pages). All routes rewrite to `/index.html`.
Node version: `.node-version` (22.17.1).

Without a Maps key the app still works: map areas show an inline message and the location picker falls back to manual latitude/longitude entry.

## Layout

```
src/
  lib/        api.ts (axios + JWT + single-flight refresh), queryClient, ws.ts, format.ts, errors.ts, env.ts
  types/      api.ts (contract types), schemas.ts (zod)
  api/        one function + one hook per endpoint; keys.ts = query keys
  auth/       AuthProvider, useAuth, RequireRole, tokenStorage
  components/ ui/, map/ (LocationPicker, CoverageOverlay, TechnicianMap), booking/ (ActionBar, StatusTimeline…), layout/
  features/   public/, auth/, customer/, technician/, admin/, shared/
e2e/          Playwright smoke tests
```

See `docs/STATUS_FRONTEND.md` for decisions, versions and known gaps.
