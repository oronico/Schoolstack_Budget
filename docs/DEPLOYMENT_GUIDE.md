# SchoolStack Budget — Deployment Guide

**Version:** Alpha 1.0
**Architecture:** Netlify (frontend) + Railway (API + PostgreSQL)

> **Latest preflight:** `RAILWAY_ALIGNMENT_REPORT_2026-05-12.md` (Task #849)
> covers env vars, SSL, schema drift, migration plumbing, the Dockerfile
> dedupe, and **completed** live-deploy verification (HTTP 200 with
> `migrations:"ok"` + `db:"connected"` against `schoolstackbudget.up.railway.app`).
> The only remaining operator follow-on is an optional deploy-log tail
> screenshot for the paper trail.

---

## Preview Environments

Two preview surfaces sit alongside production:

- **Per-PR previews** — every open pull request gets its own Netlify Deploy Preview + Railway PR Environment with auto-seeded demo data. See the README's [Preview environments](../README.md#preview-environments-per-pr-staging) section for the contract and reviewer workflow.
- **Chesterton preview (`chesterton-preview` branch)** — a long-lived prospect-facing demo URL with a dedicated Railway environment and a rotated `PREVIEW_DEMO_PASSWORD`. See [`CHESTERTON_PREVIEW.md`](./CHESTERTON_PREVIEW.md) for the operator one-time setup and the reviewer one-pager.

---

## Architecture Overview

```
┌─────────────────────────────┐
│  budget.schoolstack.ai      │
│  (Netlify CDN)              │
│                             │
│  Static React SPA           │
│  _redirects:                │
│    /api/* → Railway proxy   │
│    /*    → index.html       │
└────────────┬────────────────┘
             │ /api/*
             ▼
┌─────────────────────────────┐
│  Railway                    │
│  Node.js API Server         │
│  Express + TypeScript       │
│                             │
│  Endpoints:                 │
│    /health (legacy)         │
│    /api/auth/*              │
│    /api/models/*            │
│    /api/public/*            │
│                             │
│  PostgreSQL (managed)       │
└─────────────────────────────┘
```

---

## Environment Variables

### Railway API Server

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway) |
| `JWT_SECRET` | Yes | Secret key for JWT token signing |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins (e.g., `https://budget.schoolstack.ai`) |
| `RESEND_API_KEY` | Yes | API key for Resend transactional email service |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Auto | Set by Railway automatically |

### Netlify Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | No | Leave empty — Netlify `_redirects` handles API proxying |

---

## Deploying the API Server (Railway)

### Initial Setup

1. Connect the GitHub repository to Railway
2. Set the Dockerfile path to `artifacts/api-server/Dockerfile` (the Dockerfile copies monorepo-level files)
3. Set all required environment variables listed above
4. Provision a PostgreSQL database (Railway add-on)
5. Deploy

### Dockerfile Details

The API server uses a multi-stage Dockerfile:
- **Stage 1 (builder):** Copies monorepo root, installs dependencies, compiles TypeScript
- **Stage 2 (runner):** Copies compiled output, runs with `node index.cjs`
- Startup validation: exits fatally if `DATABASE_URL` or `JWT_SECRET` are missing in production

### Redeploying

1. Push to the connected GitHub branch
2. Railway auto-deploys on push
3. Verify: `curl https://<railway-url>/health` should return `{"status":"ok","db":"connected"}`

### Health Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/health` | GET | Legacy liveness check (always 200 if server runs) | None |
| `/api/health` | GET | Liveness (always 200) | None |
| `/api/ready` | GET | Readiness (checks DB connection) | None |

**Note:** `/api/health` and `/api/ready` require a Railway redeploy to activate (currently only `/health` works in production).

---

## Deploying the Frontend (Netlify)

### Initial Setup

1. Connect the GitHub repository to Netlify
2. Set build settings:
   - **Base directory:** `artifacts/school-financial-model`
   - **Build command:** `pnpm run build`
   - **Publish directory:** `artifacts/school-financial-model/dist/public`
3. Custom domain: `budget.schoolstack.ai`
4. HTTPS is automatic via Netlify

### Proxy Configuration

The file `artifacts/school-financial-model/public/_redirects` handles routing:

```
/api/*  https://schoolstackbudget.up.railway.app/api/:splat  200
/*      /index.html   200
```

- Line 1: Proxies all `/api/*` requests to the Railway API server
- Line 2: SPA fallback — all non-API routes serve `index.html`

### Redeploying

1. Push to the connected GitHub branch
2. Netlify auto-builds and deploys
3. Verify: Visit `https://budget.schoolstack.ai` — landing page should load

---

## Database

### Provider
PostgreSQL managed by Railway (auto-provisioned)

### Schema Management
- Schema defined in Drizzle ORM files under `lib/db/src/schema/` (shared `@workspace/db` package)
- Push schema changes: `pnpm --filter @workspace/db run db:push`

### Backup
Railway provides automatic daily backups for PostgreSQL databases.

### Restore
See [`RUNBOOK_DB_RESTORE.md`](./RUNBOOK_DB_RESTORE.md) for the step-by-step
procedure to restore a Railway snapshot, verify it, and cut the app over.
**Read the "Important — read before clicking Restore" callout at the top of
the runbook first** — Railway's Restore button stages an in-place volume
swap on the existing Postgres service rather than creating a parallel
throwaway service, and the runbook documents the safer side-by-side path
(Option A: pg_dump + pg_restore into a fresh service). The runbook
includes who to notify, the rough RTO (~40–65 min, estimate) and RPO
(up to 24h), and a log of trial restores.

---

## Monitoring

### Current Monitoring
- Railway dashboard: CPU, memory, network metrics
- Netlify analytics: Page views, bandwidth
- `/health` endpoint for uptime checks

### Recommended Additions (Post-Alpha)
- External uptime monitor (e.g., UptimeRobot) hitting `/health`
- Error tracking (e.g., Sentry) for both frontend and API
- Structured logging with log aggregation

---

## Rollback Procedure

### API Server
1. In Railway dashboard, go to Deployments
2. Click on the previous successful deployment
3. Click "Rollback to this deployment"

### Frontend
1. In Netlify dashboard, go to Deploys
2. Click on the previous successful deploy
3. Click "Publish deploy"

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Frontend loads but API calls fail | CORS misconfiguration | Check `ALLOWED_ORIGINS` includes the frontend domain |
| Login returns 500 | Missing `JWT_SECRET` | Set `JWT_SECRET` in Railway env vars |
| Health check returns connection error | Database down | Check Railway PostgreSQL status |
| Forgot password email not sent | Missing `RESEND_API_KEY` | Set the API key in Railway env vars |
| Blank page on frontend | Build failed | Check Netlify build logs |
| `/api/*` returns 404 on Netlify | `_redirects` missing | Ensure file exists in `public/_redirects` |
