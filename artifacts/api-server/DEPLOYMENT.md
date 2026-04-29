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

## Build Details

The production build uses esbuild to bundle the TypeScript source and most dependencies into a single `dist/index.cjs` file (~3.4MB). Only `adm-zip` remains as a runtime external dependency (installed separately in the Docker image).

The build is triggered by `pnpm --filter @workspace/api-server run build` which runs `tsx ./build.ts`.

## Railway Deployment

1. Connect your GitHub repository to Railway.
2. Set the root directory to the monorepo root (not `artifacts/api-server`).
3. Railway will detect the Dockerfile at `artifacts/api-server/Dockerfile`.
4. Configure environment variables in the Railway dashboard.
5. Set the health check path to `/health`.
