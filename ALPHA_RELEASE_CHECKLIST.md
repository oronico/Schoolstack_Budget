# SchoolStack Budget — Alpha Release Checklist

## Pre-Deploy Setup

### Environment Variables

**Netlify (Frontend) — set in Netlify UI > Site Settings > Environment Variables:**
| Variable | Required | Example |
|----------|----------|---------|
| `VITE_API_BASE_URL` | Yes | `https://api.schoolstack.ai` |

**API Server — set in hosting environment (Render, Railway, etc.):**
| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Yes | A random 64-char hex string |
| `CORS_ORIGIN` | Yes | `https://app.schoolstack.ai` |
| `PORT` | No | `8080` (defaults to 8080) |
| `NODE_ENV` | No | `production` |
| `SMTP_HOST` | No | SMTP server for password reset emails |
| `SMTP_PORT` | No | `587` |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | `noreply@schoolstack.ai` |

### Database
- [ ] PostgreSQL 15+ provisioned and accessible from API server
- [ ] `DATABASE_URL` set with connection string
- [ ] Run `pnpm --filter @workspace/db run db:push` to create/sync schema
- [ ] Verify tables created: `users`, `financial_models`, `exports`, `events`

### DNS / Domain
- [ ] Frontend domain (e.g., `app.schoolstack.ai`) pointing to Netlify
- [ ] API domain (e.g., `api.schoolstack.ai`) pointing to API server host
- [ ] HTTPS certificates active on both domains

---

## Deployment Steps

### Frontend (Netlify)
1. Connect GitHub repo to Netlify
2. Set `VITE_API_BASE_URL` environment variable in Netlify UI
3. Deploy triggers automatically on push to main
4. Verify build succeeds (check Netlify deploy log)
5. Confirm SPA routing works (direct-navigate to `/underwriting`, `/login`, `/dashboard`)

### API Server
1. Build: `pnpm --filter @workspace/api-server run build`
2. Start: `node dist/index.cjs`
3. Verify health: `curl https://api.schoolstack.ai/api/healthz` returns `{"status":"ok"}`
4. Verify CORS: `curl -H "Origin: https://app.schoolstack.ai" -I https://api.schoolstack.ai/api/healthz` includes `Access-Control-Allow-Origin`

---

## Smoke Tests

### Public Flow (no account needed)
- [ ] Landing page loads at `/`
- [ ] Click CTA navigates to `/underwriting`
- [ ] Complete all 7 wizard steps (Profile, Enrollment, Revenue, Staffing, Expenses, Review, Export)
- [ ] Download underwriting XLSX export from public wizard
- [ ] Open exported XLSX — verify financial data is visible (not blank formulas)
- [ ] Refresh `/underwriting` — verify data persists from localStorage

### Auth Flow
- [ ] Register a new account at `/register`
- [ ] Log in at `/login`
- [ ] Redirected to `/dashboard` after login
- [ ] Create a new financial model from dashboard
- [ ] Complete wizard steps with sample data
- [ ] Download Excel export from Export step — verify data visible
- [ ] Download Lender Pro Forma export — verify data visible
- [ ] Download PDF exports — verify they render
- [ ] Log out and back in — verify model persists

### Admin Flow
- [ ] Navigate to `/admin` (requires admin-allowlisted email)
- [ ] Verify analytics dashboard loads with metrics

### Edge Cases
- [ ] Direct-navigate to `/model/nonexistent-id` — should show 404 or redirect
- [ ] Direct-navigate to `/dashboard` while logged out — should redirect to `/login`
- [ ] Open app in incognito — public wizard should work independently

---

## Known Fragilities (Alpha Caveats)

1. **No rate limiting persistence** — Rate limiter is in-memory; resets on server restart. Not a concern for alpha traffic levels.
2. **Single JS bundle** — Frontend is a single 1.18MB chunk (332KB gzipped). Acceptable for alpha but code splitting should happen before public launch.
3. **Password reset emails** — Require SMTP configuration. If not configured, password reset will fail silently. Non-blocking for alpha if team uses direct DB access.
4. **No file upload size limits on export payloads** — Large model JSON payloads are accepted without size caps. Low risk at alpha scale.
5. **Admin email allowlist is hardcoded** — Admin access is controlled by a hardcoded email list in the API server. Acceptable for alpha.

---

## Rollback Notes

### Frontend Rollback
- Netlify supports instant rollback via the Deploys tab — click any previous deploy and "Publish deploy"
- No database state affected by frontend changes

### API Server Rollback
- Redeploy previous container/build artifact
- Database schema changes are forward-only via Drizzle `db:push` — no automatic rollback
- If a schema migration needs reversal, manually revert the Drizzle schema file and run `db:push` again
- Keep a database backup before any schema-changing deploy

### Data Recovery
- Replit maintains automatic checkpoints of the database
- For production, set up automated daily PostgreSQL backups (pg_dump) before alpha launch

---

## Verification Summary

Before tagging the release:
- [ ] `pnpm run typecheck` passes (all packages)
- [ ] `pnpm --filter @workspace/school-financial-model run build` succeeds
- [ ] `pnpm --filter @workspace/api-server run build` succeeds
- [ ] API health endpoint returns 200
- [ ] Public underwriting export produces valid XLSX with visible data
- [ ] Authenticated export produces valid XLSX with visible data
- [ ] All SPA routes load correctly on direct navigation
