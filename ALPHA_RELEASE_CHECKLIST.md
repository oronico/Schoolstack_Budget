# SchoolStack Budget — Alpha Release Checklist

**Version:** 0.1.0-alpha
**Date:** March 15, 2026
**Status:** Pre-release

---

## 1. Pre-Deploy Setup

### Environment Variables

**Netlify (Frontend) — set in Netlify UI > Site Settings > Environment Variables:**

| Variable | Required | Example |
|----------|----------|---------|
| `VITE_API_BASE_URL` | Yes | `https://api.schoolstack.ai` |

All other frontend build settings are file-based in `netlify.toml` — no UI overrides needed.

**API Server — set in hosting environment (Replit Deployments, Render, Railway, etc.):**

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Yes | A random 64-char hex string |
| `CORS_ORIGIN` | Yes | `https://budget.schoolstack.ai` |
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
- [ ] Run `pnpm --filter @workspace/db run push` to create/sync schema
- [ ] Verify tables created: `users`, `financial_models`, `exports`, `events`

### DNS / Domain

- [ ] Frontend domain (e.g., `budget.schoolstack.ai`) pointing to Netlify
- [ ] API domain (e.g., `api.schoolstack.ai`) pointing to API server host
- [ ] HTTPS certificates active on both domains

### Netlify Configuration

- [ ] Connect GitHub repo to Netlify
- [ ] `netlify.toml` auto-detected (no UI build settings needed)
- [ ] Update the API proxy redirect in `netlify.toml`: replace `YOUR_API_SERVER.replit.app` with actual API domain
- [ ] Set `VITE_API_BASE_URL` in Netlify UI
- [ ] Trigger first deploy and verify build log succeeds

The `netlify.toml` handles:
- Build command (installs from monorepo root, typechecks libs, builds frontend)
- Publish directory (`dist/public`)
- Node 20 / pnpm 10 runtime versions
- `BASE_PATH=/` (frontend deploys at domain root on Netlify)
- SPA catch-all rewrite (`/* → /index.html`)
- API proxy redirect (`/api/* → API server`) — **must be updated with real API domain**
- Static asset cache headers (1 year for hashed assets, 1 day for logos)

---

## 2. Deployment Steps

### A. API Server

1. Build: `pnpm --filter @workspace/api-server run build`
2. Start: `node dist/index.cjs`
3. Verify health: `curl https://YOUR_API/api/health` returns 200
4. Verify CORS: response includes `Access-Control-Allow-Origin` for frontend domain

### B. Frontend (Netlify)

1. Push to `main` branch — Netlify auto-deploys
2. Verify build succeeds in Netlify deploy log
3. Confirm SPA routing works (direct-navigate to `/underwriting`, `/login`, `/terms`, `/privacy`)

---

## 3. Smoke Tests

### Public Flow (no account needed)

- [ ] Landing page loads at `/` with "Build a simple 5-year financial model" copy
- [ ] `/terms` loads Terms of Service page with 12 sections
- [ ] `/privacy` loads Privacy Policy page
- [ ] Footer shows Privacy, Terms, and Contact (admin@schoolstack.ai) links
- [ ] `/underwriting` loads the public wizard with 8 steps
- [ ] Profile step shows "Your model will project 5 years" planning horizon
- [ ] Enrollment step shows 5 year inputs (Year 1 through Year 5)
- [ ] Revenue step shows 5 columns for amounts
- [ ] Expense step shows 5 columns for amounts
- [ ] Complete wizard through Review — review shows 5-year summary table
- [ ] Click "Get Analysis" — consultant analysis renders with 5-year cash flow chart
- [ ] Click "Export Excel" — downloads `.xlsx` workbook
- [ ] Open exported XLSX — verify 5 years of financial data across all sheets
- [ ] Refresh `/underwriting` — verify data persists from localStorage

### Auth Flow

- [ ] `/register` shows terms agreement checkbox; "Create Account" disabled until checked
- [ ] Register a new account
- [ ] `/login` — log in with created account
- [ ] Redirected to `/dashboard` after login
- [ ] Create a new financial model from dashboard
- [ ] Complete wizard steps — 5 enrollment years required
- [ ] Auto-save indicator shows "Saved" timestamps in wizard header
- [ ] Navigate away and return — data persists from database
- [ ] Download Excel export from Export step — verify 5-year data
- [ ] Download Lender Pro Forma export — verify data visible
- [ ] Download PDF exports — verify they render
- [ ] Log out and back in — verify model persists

### Admin

- [ ] `/admin` (requires admin-allowlisted email)
- [ ] Analytics dashboard loads with user count, model count, funnel metrics
- [ ] 5-year adoption rate card displays

### Edge Cases

- [ ] Direct-navigate to `/model/nonexistent-id` — should show 404 or redirect
- [ ] Direct-navigate to `/dashboard` while logged out — should redirect to `/login`
- [ ] Open app in incognito — public wizard works independently
- [ ] Load a legacy model (with <5 year data) — auto-normalized to 5 years on load

---

## 4. Known Fragile Areas

| Area | Risk | Mitigation |
|------|------|------------|
| **JWT_SECRET not set** | API fails to issue/verify tokens | Validate on startup; app won't start without it |
| **CORS misconfiguration** | Frontend can't reach API | Set `CORS_ORIGIN` to exact Netlify domain |
| **Netlify API proxy** | `/api/*` redirect must point to real API domain | Update `netlify.toml` before first deploy |
| **Password reset emails** | Require SMTP env vars; fails silently without them | Non-blocking for alpha if team uses direct access |
| **Rate limiter in-memory** | Resets on server restart | Acceptable for alpha traffic |
| **Admin allowlist hardcoded** | Admin access controlled by hardcoded email list | Acceptable for alpha |
| **No payload size limits** | Large model JSON accepted without caps | Low risk at alpha scale |
| **Legacy 3-year models** | Older saved models with <5 year arrays | Auto-normalized on load (backfills to 5 years) |

---

## 5. Rollback Plan

### Frontend Rollback

- Netlify: Deploys tab → select previous deploy → "Publish deploy" (instant)
- No database state affected by frontend changes

### API Server Rollback

- Redeploy previous container/build artifact
- Database schema is additive (no destructive migrations)
- If a schema change needs reversal: revert Drizzle schema file, re-run `push`

### Data Recovery

- Take a manual database backup/snapshot before alpha launch
- For production: set up automated daily PostgreSQL backups (pg_dump)
- Replit maintains automatic checkpoints during development

---

## 6. Post-Deploy Verification Commands

```bash
# 1. Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://YOUR_SITE.netlify.app/
# Expected: 200

# 2. SPA routing works (deep link)
curl -s -o /dev/null -w "%{http_code}" https://YOUR_SITE.netlify.app/terms
# Expected: 200

# 3. API health
curl -s -o /dev/null -w "%{http_code}" https://YOUR_API/api/health
# Expected: 200

# 4. Public consultant analysis
curl -s -o /dev/null -w "%{http_code}" -X POST https://YOUR_API/api/public/consultant \
  -H "Content-Type: application/json" \
  -d '{"schoolProfile":{"schoolName":"Test","schoolType":"microschool","schoolStage":"new_school","fundingProfile":"tuition_based","entityType":"nonprofit_501c3","maxCapacity":50,"state":"TX"},"enrollment":{"year1":20,"year2":30,"year3":40,"year4":50,"year5":60},"revenueRows":[],"staffingRows":[],"expenseRows":[],"capitalAndDebtRows":[]}'
# Expected: 200

# 5. Public underwriting export
curl -s -o /dev/null -w "%{http_code}" -X POST https://YOUR_API/api/public/export-underwriting \
  -H "Content-Type: application/json" \
  -d '{"schoolProfile":{"schoolName":"Test","schoolType":"microschool","schoolStage":"new_school","fundingProfile":"tuition_based","entityType":"nonprofit_501c3","maxCapacity":50,"state":"TX"},"enrollment":{"year1":20,"year2":30,"year3":40,"year4":50,"year5":60},"revenueRows":[],"staffingRows":[],"expenseRows":[],"capitalAndDebtRows":[]}'
# Expected: 200
```

---

## 7. Build Verification (Pre-Tag)

- [ ] `pnpm run typecheck` passes (all packages)
- [ ] `pnpm --filter @workspace/school-financial-model run build` succeeds
- [ ] `pnpm --filter @workspace/api-server run build` succeeds
- [ ] Build output in `artifacts/school-financial-model/dist/public/` contains `index.html`
- [ ] API health endpoint returns 200
- [ ] Public consultant endpoint returns 5-year cash flow data
- [ ] Public underwriting export produces valid XLSX (>10KB)
- [ ] All SPA routes load correctly on direct navigation
