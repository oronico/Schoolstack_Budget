# SchoolStack Budget — Alpha Release Checklist

## Prerequisites

- [ ] Node.js 20.x
- [ ] pnpm 10.x
- [ ] PostgreSQL 15+ database provisioned
- [ ] SMTP credentials (optional — password reset emails fall back to console logging)

---

## Environment Variables

### Frontend (Netlify Build-Time)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | **Yes** | Full URL of the API server (e.g., `https://api.schoolstack.ai`). If blank, the frontend assumes the API is co-located at `/api` on the same domain. |
| `BASE_PATH` | No | Base path prefix for the SPA (default: `/`). Only needed if hosting under a subpath. |
| `NODE_VERSION` | No | Set in `netlify.toml` as `20`. Override in Netlify UI if needed. |

### API Server (Runtime)

| Variable | Required | Description |
|---|---|---|
| `PORT` | **Yes** | Port the API server listens on (e.g., `8080`). |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname`). |
| `JWT_SECRET` | **Yes** (prod) | Secret for signing auth tokens. In development, falls back to a hardcoded dev secret. **Must be set in production.** |
| `ADMIN_EMAILS` | Recommended | Comma-separated emails that have admin dashboard access (e.g., `alice@school.org,bob@school.org`). |
| `APP_URL` | Recommended | Frontend URL used in password reset email links (e.g., `https://app.schoolstack.ai`). Falls back to Replit dev domain or `localhost:3000`. |
| `SMTP_HOST` | No | SMTP server hostname. If not set, password reset emails are logged to console instead of sent. |
| `SMTP_PORT` | No | SMTP port (default: `587`). |
| `SMTP_USER` | No | SMTP username. |
| `SMTP_PASS` | No | SMTP password. |
| `SMTP_FROM` | No | "From" address for outgoing emails. Falls back to `SMTP_USER` or `noreply@schoolstack.ai`. |

---

## Deployment: Frontend (Netlify)

### File-Based Configuration (already in repo)

The `netlify.toml` at the repo root configures:

- **Base directory**: `artifacts/school-financial-model`
- **Build command**: Navigates to monorepo root, installs deps with frozen lockfile, type-checks shared libs, then builds the frontend.
- **Publish directory**: `dist/public` (relative to base)
- **SPA rewrite**: All routes (`/*`) rewrite to `/index.html` with status `200` for client-side routing.
- **Node 20** and **pnpm 10** pinned via `[build.environment]`.

A `_redirects` file in `artifacts/school-financial-model/public/` provides a fallback SPA rewrite.

### Netlify UI Settings

1. **Connect your GitHub repo** to Netlify.
2. Netlify auto-detects `netlify.toml` — no manual build settings needed.
3. **Set environment variable** in Netlify UI → Site settings → Environment variables:
   - `VITE_API_BASE_URL` = your API server URL (e.g., `https://api.schoolstack.ai`)
4. **Deploy**. The first build takes ~2 minutes (installs full monorepo, builds shared libs, then Vite).
5. **Verify** the deploy preview loads the landing page and client-side routes (`/underwriting`, `/login`, etc.) work on direct navigation.

### Common Netlify Issues

- If the build fails with "frozen lockfile" errors, ensure `pnpm-lock.yaml` is committed to the repo.
- If routes return 404 on refresh, verify the `[[redirects]]` block is present in `netlify.toml`.

---

## Deployment: API Server

The API server is a standalone Express app. It can be deployed on Railway, Render, Fly.io, or any Node.js hosting.

### Build and Run

```bash
# From the monorepo root:
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build

# Start:
node artifacts/api-server/dist/index.cjs
```

### What Gets Deployed

- `artifacts/api-server/dist/index.cjs` — Bundled server (esbuild, ~1.6MB)
- `artifacts/api-server/dist/templates/` — Excel template file used by lender pro forma export
- `node_modules/` — Only external deps not bundled (bcryptjs, exceljs)

### Database Setup

The app uses Drizzle ORM. To push the schema to a fresh database:

```bash
pnpm --filter @workspace/db run push
```

### CORS

Currently uses permissive `cors()`. For production, restrict origins via code or reverse proxy. The API server does not yet support an `ALLOWED_ORIGINS` env var (planned for Task #25).

---

## Smoke Test Checklist

After deployment, verify each of these manually:

### Frontend (Netlify)

- [ ] Landing page loads at root URL
- [ ] "Build My Model" CTA navigates to `/underwriting`
- [ ] `/underwriting` loads the public wizard (no login required)
- [ ] Direct navigation to `/login` renders the login form
- [ ] Direct navigation to `/register` renders the registration form
- [ ] `/dashboard` redirects to `/login` when not authenticated
- [ ] Page refresh on `/underwriting` does not 404 (SPA rewrite working)
- [ ] Browser console shows no critical errors

### API Server

- [ ] `GET /api/healthz` returns `{"status":"ok"}`
- [ ] `POST /api/auth/register` creates a user and returns a token
- [ ] `POST /api/auth/login` authenticates and returns a token
- [ ] Authenticated: `GET /api/models` returns an empty array for a new user
- [ ] Authenticated: `POST /api/models` creates a model
- [ ] Authenticated: model wizard can step through all tabs and save
- [ ] Export: XLSX download works for both lender pro forma and underwriting workbook

### Public Export (No Auth)

- [ ] `POST /api/public/export-underwriting` with valid JSON payload returns a valid `.xlsx` file
- [ ] Rate limiting: 6th request within 1 minute returns `429`
- [ ] Oversized payload (>512KB) returns `413`

---

## Known Limitations & Fragilities (Alpha)

| Issue | Severity | Notes |
|---|---|---|
| JS bundle is ~1.2MB (single chunk) | Medium | No code splitting yet. Slow on 3G. Planned: Task #24. |
| CORS is wide open (`cors()`) | Medium | Any origin can call the API. Lock down before beta. Planned: Task #25. |
| Rate limiting is in-memory | Medium | Resets on server restart. Planned: Task #26. |
| Health endpoint exists but undocumented | Low | `GET /api/healthz` returns `{"status":"ok"}`. Works for load balancer probes. |
| No API server Dockerfile | Low | Must deploy via `node dist/index.cjs` manually. Planned: Task #25. |
| JWT dev-secret fallback | Low | Non-production environments use a hardcoded secret. Safe for alpha but must set `JWT_SECRET` in production. |
| Password reset emails require SMTP | Low | Without SMTP config, reset links are only logged to server console. Functional but not user-facing. |
| Admin dashboard requires `ADMIN_EMAILS` | Low | If not set, admin routes return 403. Not a bug — just needs configuration. |

---

## Rollback Plan

### Frontend (Netlify)

Netlify provides instant rollback via the Deploys dashboard:
1. Go to **Deploys** in the Netlify dashboard.
2. Click on the previous successful deploy.
3. Click **"Publish deploy"** to roll back instantly.

### API Server

1. Re-deploy the previous working build artifact (`dist/index.cjs` from the last known-good commit).
2. Database schema changes are additive (new columns/tables only) — rolling back the server code does not require a database rollback for this alpha.
3. If a schema migration breaks data, restore from the most recent database backup.

### Emergency: Full Rollback

If both frontend and API need rollback:
1. Roll back the Netlify deploy (instant).
2. Re-deploy the API server from the previous Git commit.
3. Verify the frontend's `VITE_API_BASE_URL` still points to the correct API.

---

## PR Summary (Changes in This Release)

### Files Changed

| File | Change |
|---|---|
| `netlify.toml` | Fixed `PNPM_VERSION` pinning (was `NPM_FLAGS` which doesn't apply to pnpm) |
| `ALPHA_RELEASE.md` | New — this checklist |

### What Was Already in Place (Prior Tasks)

- `netlify.toml` with correct base/build/publish and SPA rewrite (Task T001–T002)
- `_redirects` fallback in `public/` directory (Task T002)
- `VITE_API_BASE_URL` env var support in `fetch-patch.ts` (Task T003)
- Replit-only plugins gated behind `REPL_ID` in `vite.config.ts` (Task T001)
- Public `/underwriting` wizard route with localStorage persistence (Task T004)
- Public export API at `POST /api/public/export-underwriting` with rate limiting, payload cap, Zod validation (Task T005–T006)
- Full typecheck, build, and e2e test pass (Task T007)

---

## Verification Results (March 14, 2026)

All checks performed against the development environment after final code changes.

### TypeScript Typecheck

```
pnpm run typecheck
  typecheck:libs (tsc --build) .................. PASS
  artifacts/api-server .......................... PASS
  artifacts/mockup-sandbox ...................... PASS
  artifacts/school-financial-model .............. PASS
  scripts ....................................... PASS
```

### Production Builds

```
Frontend (Vite):
  dist/public/index.html .............. 2.01 kB (gzip: 0.70 kB)
  dist/public/assets/index.css ....... 123.62 kB (gzip: 19.39 kB)
  dist/public/assets/index.js ...... 1,184.86 kB (gzip: 332.51 kB)
  Build time: 14s ..................... PASS

API Server (esbuild):
  dist/index.cjs ...................... 1.6 MB
  dist/templates/ ..................... copied
  Build time: <1s ..................... PASS
```

### Frontend Route Checks (curl)

```
GET /               .......... HTTP 200  PASS
GET /underwriting   .......... HTTP 200  PASS
GET /login          .......... HTTP 200  PASS
GET /register       .......... HTTP 200  PASS
GET /dashboard      .......... HTTP 200  PASS (redirects to /login client-side)
```

### API Endpoint Checks

```
GET  /api/healthz ........................... HTTP 200  {"status":"ok"}  PASS
POST /api/public/export-underwriting ........ HTTP 200  22,162 bytes XLSX  PASS
Rate limit (6th request in 1 min) ........... HTTP 429  PASS
```

### E2E Tests (Playwright)

```
1) Landing page loads with hero heading ........... PASS
2) /underwriting wizard loads without auth ........ PASS
3) /login form renders with email/password ........ PASS
4) /dashboard redirects to /login (unauthed) ...... PASS
All 4/4 tests passed.
```

### Visual Verification

- Landing page: Hero, CTAs ("Build My Model", "Log into existing"), navbar all render correctly
- Public wizard: 7-step indicator (PROFILE through EXPORT), "Tell Us About Your School" step 1 renders correctly
