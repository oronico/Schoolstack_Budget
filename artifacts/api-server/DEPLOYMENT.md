# API Server Deployment Guide

## Overview

The SchoolStack Budget API server is a Node.js/Express application that serves the REST API for the frontend. It is designed to be deployed independently on Railway, Render, Fly.io, or any Docker-compatible hosting platform.

## Quick Start

```bash
# Build the production bundle
pnpm --filter @workspace/api-server run build

# Start the server
NODE_ENV=production node artifacts/api-server/dist/index.cjs
```

## Docker

```bash
# Build from the monorepo root
docker build -f artifacts/api-server/Dockerfile -t schoolstack-api .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  -e ALLOWED_ORIGINS="https://budget.schoolstack.ai" \
  schoolstack-api
```

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/dbname`). The server will **exit immediately** in production if this is missing. |
| `JWT_SECRET` | Secret key used to sign and verify JWT authentication tokens. Must be a strong, random string (32+ characters recommended). The server will **exit immediately** in production if this is missing. |

### Recommended

| Variable | Description | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (e.g. `https://budget.schoolstack.ai,https://staging.schoolstack.ai`). In production, if unset, all cross-origin requests are rejected. Legacy `CORS_ORIGIN` is accepted as a fallback but deprecated. | In dev: all origins allowed |
| `PORT` | Port the server listens on. | `3000` |
| `APP_URL` | Public URL of the frontend application. Used in emails for password reset links, etc. | `https://localhost:3000` |

### Optional

| Variable | Description | Behavior if missing |
|---|---|---|
| `RESEND_API_KEY` | API key for [Resend](https://resend.com) (transactional email service). This replaces traditional SMTP — Resend handles delivery via its API. | Password reset emails are logged to console instead of sent. The server starts normally without it. |
| `EMAIL_FROM` | Sender address for outgoing emails (e.g. `SchoolStack Budget <noreply@schoolstack.ai>`). | `SchoolStack Budget <onboarding@resend.dev>` |
| `ADMIN_EMAILS` | Comma-separated list of email addresses with admin privileges. | No users have admin access. |
| `ACCOUNTING_SCHEDULER_ENABLED` | `true` / `false` override for the nightly accounting sync (see [Accounting Sync Scheduler](#accounting-sync-scheduler) below). | Auto-enabled in production, off elsewhere. |
| `ACCOUNTING_SCHEDULER_INTERVAL_MS` | How often the sweep runs, in milliseconds. | `86400000` (24h) |
| `ACCOUNTING_SCHEDULER_INITIAL_DELAY_MS` | Delay before the first sweep after boot, to avoid stampeding providers during a deploy. | `60000` (1 min) |
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | OAuth credentials for QuickBooks Online connections. | "Connect QuickBooks" button is disabled in the UI. |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | OAuth credentials for Xero connections. | "Connect Xero" button is disabled in the UI. |
| `ACCOUNTING_OAUTH_REDIRECT_URI` | Override for the OAuth callback URL (e.g. `https://api.schoolstack.ai/api/accounting`). The provider name + `/callback` is appended. | Inferred from the inbound request. |

### Deprecated / Unused

| Variable | Status |
|---|---|
| `SMTP_HOST` | **Not used.** Email is handled by Resend, not SMTP. |
| `SMTP_PORT` | **Not used.** See above. |
| `SMTP_USER` | **Not used.** See above. |
| `SMTP_PASS` | **Not used.** See above. |

> **Note on SMTP:** This application uses [Resend](https://resend.com) as its email provider rather than raw SMTP. The `SMTP_*` variables listed above are **not needed** and are ignored. If you need to switch to a different email provider, replace the Resend client in `src/lib/mailer.ts`.

## Health Check

The server exposes liveness and readiness endpoints:

### Liveness (for load balancer probes)

- `GET /health` — Always returns `200 { status: "ok" }`. Use this for load balancer health checks.
- `GET /api/health` — Same response, available under the `/api` prefix.

### Readiness (for deployment checks)

- `GET /api/ready` — Returns `200 { status: "ok", db: "connected" }` when the database is reachable, or `503 { status: "error", db: "disconnected" }` when it is not.

### Railway Configuration

Set the health check path to `/health` in your Railway service settings.

## Startup Behavior

On startup the server:

1. **Validates required environment variables** — In production (`NODE_ENV=production`), missing `DATABASE_URL` or `JWT_SECRET` causes an immediate exit with a clear error message.
2. **Warns about optional variables** — Missing optional variables (RESEND_API_KEY, ADMIN_EMAILS, etc.) are logged as warnings but do not prevent startup.
3. **Logs CORS configuration** — In production, logs which origins are allowed.

## Accounting Sync Scheduler

The api-server runs a background job that keeps founder-connected QuickBooks Online and Xero connections fresh, so the cached snapshot in the actuals editor doesn't go stale and OAuth refresh tokens don't quietly expire (QuickBooks: 100 days of disuse, Xero: 60 days).

- **What it does:** Iterates every row in `accounting_connections` once per cycle. For each row, it checks whether the access token is within 24h of expiry **or** the cached snapshot is older than 7 days (or has never been synced). When either condition is true it refreshes the access token, pulls a fresh Profit & Loss snapshot, and writes the result back to the row. Connections that are already fresh are skipped, so volume to the providers stays low.
- **Cadence:** First sweep runs ~1 minute after boot, then every 24 hours. Both intervals are configurable via `ACCOUNTING_SCHEDULER_INITIAL_DELAY_MS` and `ACCOUNTING_SCHEDULER_INTERVAL_MS`.
- **Where it lives:** `artifacts/api-server/src/lib/accounting/scheduler.ts`, registered from `src/index.ts` via `startAccountingSyncScheduler()`. The shared per-connection logic in `src/lib/accounting/sync.ts` is the same one the on-demand "Sync now" button in the UI calls, so manual and automatic refreshes stay byte-for-byte equivalent.
- **Default activation:** On in production (`NODE_ENV=production`), off elsewhere. Force-enable in dev/staging by setting `ACCOUNTING_SCHEDULER_ENABLED=true`; force-disable with `ACCOUNTING_SCHEDULER_ENABLED=false`.
- **Failure surfacing:** When a refresh fails (revoked grant, provider 5xx, etc.) the row's `status` is set to `error` and `last_sync_error` is populated with the underlying message (truncated to 500 chars). `last_synced_at` is intentionally **not** touched on failure, so the founder UI keeps showing the last good snapshot timestamp. The connection card on the scenarios page will show the error message and prompt the founder to reconnect.
- **Operator playbook:**
  - To verify the scheduler is alive, look for `[accounting:scheduler] Starting daily sync` at boot and `[accounting:scheduler] Sweep complete — attempted=… ok=… failed=… skipped=…` after each tick.
  - If a single connection is logged as failing on every sweep, ask the founder to reconnect QuickBooks/Xero from the model's scenarios page — the refresh token has likely been revoked.
  - To temporarily disable in production (e.g. during a provider outage), set `ACCOUNTING_SCHEDULER_ENABLED=false` and restart the server.
  - Only one process should run the scheduler. If horizontally scaling the api-server, set `ACCOUNTING_SCHEDULER_ENABLED=false` on all replicas except one (or run a dedicated worker process).

## Build Details

The production build uses esbuild to bundle the TypeScript source and most dependencies into a single `dist/index.cjs` file (~3.4MB). Only `adm-zip` remains as a runtime external dependency (installed separately in the Docker image).

The build is triggered by `pnpm --filter @workspace/api-server run build` which runs `tsx ./build.ts`.

## Railway Deployment

1. Connect your GitHub repository to Railway.
2. Set the root directory to the monorepo root (not `artifacts/api-server`).
3. Railway will detect the Dockerfile at `artifacts/api-server/Dockerfile`.
4. Configure environment variables in the Railway dashboard.
5. Set the health check path to `/health`.
