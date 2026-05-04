# SchoolStack Budget — Public Launch Report

**Date:** 2026-05-04
**Audit task:** #523 — Pre-launch audit & hardening for GitHub → Netlify → Railway
**Companion checklist:** [`PUBLIC_LAUNCH_CHECKLIST.md`](../PUBLIC_LAUNCH_CHECKLIST.md) (sections 1–8)
**Recommendation:** ✅ **PUBLISH** — pending three operator-dashboard confirmations listed under [Open questions](#open-questions-for-the-founder).

---

## Open questions for the founder

These three items can only be verified inside the Railway / Netlify dashboards (not from source). They are **not** code blockers but should be confirmed before flipping the public switch.

| # | Question | Where to check |
|---|----------|----------------|
| Q1 | Is the `DATABASE_URL` Railway hands the api-server a **dedicated production** Postgres add-on (not the dev DB)? | Railway → SchoolStack project → API service → Variables tab → `DATABASE_URL`. Confirm the host matches the prod Postgres add-on name and not a dev / staging one. |
| Q2 | Has the prod DB been audited for stray test users / fake schools? | Run `SELECT id, email, name, created_at FROM users ORDER BY created_at` against the prod DB once and delete obviously-test rows (`test@`, `foo@bar.com`, etc.) before publishing. |
| Q3 | What is the Railway Postgres backup retention, and have you done one restore drill? | Railway → Postgres → Backups tab. Daily snapshots are automatic; document the retention number and run one trial restore into a throwaway service so you know the procedure works. |

---

## 1. Repo + branch

- **GitHub:** [`oronico/SchoolStack_Budget2`](https://github.com/oronico/SchoolStack_Budget2)
- **Production branch:** `main` (Netlify and Railway both auto-deploy from `main`).
- **Working tree:** clean immediately before this audit (`git status -s` empty).
- **Secret sweep:** `rg` for `JWT_SECRET=`, `DATABASE_URL=postgres`, `RESEND_API_KEY=`, `sk_live`, `sk_test_` returns only documentation placeholders (one example in `artifacts/api-server/DEPLOYMENT.md`, plus `artifacts/api-server/.env.example`). No real credentials are committed.

## 2. Netlify

- **Site:** budget.schoolstack.ai (custom domain via Squarespace DNS)
- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @workspace/school-financial-model run build`
- **Publish dir:** `artifacts/school-financial-model/dist/public`
- **Build env (`netlify.toml`):**
  - `NODE_VERSION=20`
  - `PNPM_VERSION=10`
  - `BASE_PATH=/`
  - `VITE_API_BASE_URL=https://schoolstackbudget.up.railway.app` *(public; safe to expose)*
- **Redirects:**
  - `/api/*` → `https://schoolstackbudget.up.railway.app/api/:splat` (force, with `Host` + `X-Forwarded-Host` rewrite for Railway compatibility)
  - `/*` → `/index.html` (SPA fallback)
- **Cache headers:** `/assets/*` immutable 1y; `/logos/*` 24h.
- **Bundle hygiene:** sweep over `dist/public/assets/*` for `JWT_SECRET`, `RESEND_API_KEY`, `DATABASE_URL`, `sk_live`, `replit.dev`, `repl.co`, `localhost:8080`, `http://localhost`, `workspaceapi-server-production` returns **zero matches**.

## 3. Railway services

- **Service:** `schoolstackbudget` (Node.js 22, Docker)
- **API base URL:** `https://schoolstackbudget.up.railway.app`
- **Healthcheck path (Railway dashboard):** `/health` (returns 200 unconditionally; no DB ping, fast for LB probes).
- **Operator-facing readiness probe:** `GET /api/ready` (runs `SELECT 1`, returns 503 if DB is down).
- **Database:** Railway Postgres add-on; connection injected as `DATABASE_URL`.
- **Build:** `artifacts/api-server/Dockerfile` — multi-stage (build with full pnpm workspace, runtime is a node:22-slim image with just `dist/index.cjs` and one runtime dep `adm-zip@0.5.16`); runs as non-root `appuser` (uid 1001).
- **Graceful shutdown:** SIGTERM/SIGINT close the HTTP server, drain the pg pool, force-exit at 15s.

### Environment variables (names only — set values in Railway dashboard)

| Name | Required? | Notes |
|------|-----------|-------|
| `DATABASE_URL` | **Yes** | Auto-injected by Railway Postgres add-on. Server fatals on missing in prod. |
| `JWT_SECRET` | **Yes** | 32+ random chars. Server fatals on missing in prod. **Rotate from the Railway dashboard at launch.** |
| `APP_URL` | **Yes (prod)** | `https://budget.schoolstack.ai` — used in password-reset emails. |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated. The base allowlist (`budget.schoolstack.ai`, `space.schoolstack.ai`, `schoolstack.ai`) is hard-coded; this env adds extras. |
| `RESEND_API_KEY` | Optional* | Without it, password-reset and review-request emails are logged to console instead of sent. |
| `EMAIL_FROM` | Optional | Defaults to `SchoolStack Budget <onboarding@resend.dev>`. |
| `ADMIN_EMAILS` | Optional | Comma-separated. Without it, **no user has admin access** — the admin dashboard returns 403. |
| `PORT` | Auto | Set by Railway; the server reads it. |
| `NODE_ENV` | Yes | `production`. |
| `TRUST_PROXY_HOPS` | Optional | Defaults to `1`, which is correct for Railway's single-hop ingress. |

\* Optional in the sense that the server starts without them, but they should be set for a real launch.

### Logging

- 5xx responses return `{"error":"Internal server error"}` — never the message or stack.
- Stack traces are persisted to `error_logs` (5 KB cap), with `password`, `passwordHash`, `token`, `authorization`, `cookie`, `secret`, `apiKey`, `resetToken`, `creditCard`, `ssn` redacted from request bodies.
- `error_logs` rows older than 30 days are pruned every 5 minutes.
- 60 `console.log` lines in the api-server hot path were sweep-checked: none print passwords, tokens, or applicant PII.

## 4. Frontend ↔ backend wiring

- All `/api/*` requests go through `setupFetchInterceptor()` in `src/lib/fetch-patch.ts`, which:
  - Prepends `VITE_API_BASE_URL` when it is set (production) or leaves the URL relative for the Netlify proxy (also works in production).
  - Reads the bearer token from `localStorage.auth_token` and sets `Authorization: Bearer …`.
- Production CORS allows `budget.schoolstack.ai` out of the box; localhost origins are only allowed when the request actually originates from `http://localhost*` so the prod deploy never echoes a localhost `Origin`.

## 5. Auth & access control

- JWT verification uses `verifyTokenStrict()` everywhere (auth middleware, optional auth on `/feedback`, `/errors/report`). It enforces signature + integer-`userId` shape + `tokenVersion` shape + DB user-existence + `tokenVersion` match. A logged-out or rotated token cannot attribute writes to its previous owner anywhere.
- Login response time is constant — the unknown-email branch runs a precomputed cost-12 `bcrypt.compare` to match the cost of a real lookup.
- `/auth/register` mirrors the cost on the duplicate-email branch (`bcrypt.hash` + no-op UPDATE) and tightens the per-IP budget to 5/min, so timing- and rate-based account enumeration is closed. The remaining gap (the 201 vs 409 status oracle) requires moving signup to email confirmation; left as a follow-up.
- Admin routes are gated by `authMiddleware + adminMiddleware`. Without `ADMIN_EMAILS` set, the dashboard returns 403 to everyone.
- Every authoritative `/models/:id*` query is `WHERE id = :id AND user_id = :req.userId` (28 distinct call sites confirmed). An applicant can never read another applicant's model by changing `:id`.
- Public form endpoints have Zod validation, a 512 KB Content-Length ceiling, and DB-backed per-IP rate limits (`createRateLimiter`).
- **No file-upload routes** exist in the codebase (no `multer`, `busboy`, or `formidable`). The 5 MB JSON body cap + 512 KB public ceiling are the only payload sizes possible.

## 6. Smoke test results (executed 2026-05-04)

Two separate test surfaces were executed and observed:

### 6a. Live production endpoints (curl, 2026-05-04)

```
$ curl -sS -o /tmp/health.body \
    -w "HTTP %{http_code}\nTime %{time_total}s\n" \
    https://schoolstackbudget.up.railway.app/health
HTTP 200
Time 0.440265s
$ cat /tmp/health.body
{"status":"ok"}

$ curl -sS -o /tmp/ready.body \
    -w "HTTP %{http_code}\n" \
    https://schoolstackbudget.up.railway.app/api/ready
HTTP 200
$ cat /tmp/ready.body
{"status":"ok","db":"connected"}

$ curl -sSI https://budget.schoolstack.ai/ | head -6
HTTP/2 200
accept-ranges: bytes
age: 1
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; fwd=miss
content-type: text/html; charset=UTF-8
strict-transport-security: max-age=31536000

$ curl -sS -o /tmp/proxy.body \
    -w "HTTP %{http_code}\n" \
    -X POST https://budget.schoolstack.ai/api/auth/login \
    -H 'Content-Type: application/json' -d '{}'
HTTP 400
$ cat /tmp/proxy.body
{"error":"Email and password are required."}
```

These four checks confirm: the Railway service is healthy and reachable, the DB is connected (live `SELECT 1`), the Netlify-served frontend is up with HSTS, and the Netlify `/api/*` → Railway proxy works end-to-end (a 400 from the validator on the Railway side, not a 502 from a misrouted proxy).

### 6b. Local prod-shape validation suite (2026-05-04)

The validation gate ran four suites against the same api-server bundle that ships to Railway:

| Suite | Command | Result | Evidence (tail of log) |
|-------|---------|--------|------------------------|
| `e2e` | `E2E_PORT=23192 E2E_START_SERVERS=1 pnpm --filter @workspace/school-financial-model run test:e2e` | ✅ **98 passed, 1 skipped (8m 18s)** | `1 skipped / 98 passed (8.3m)` |
| `test` | `pnpm --filter @workspace/school-financial-model run test` | ✅ **66 test files, 1082 passed (70s)** | `Test Files  66 passed (66)` / `Tests  1082 passed (1082)` / `Duration  69.84s` |
| `typecheck` | `pnpm run typecheck` | ✅ **PASS** | `school-financial-model typecheck$ tsc -p tsconfig.json --noEmit └─ Done in 50.6s`; `scripts typecheck$ tsc -p tsconfig.json --noEmit └─ Done in 9s` |
| `api-tests` | `pnpm --filter @workspace/api-server run test` | ✅ **PASS** (incl. parity, all 6 PDF route suites, all 6 Excel/export route suites, error-handler malformed input, auth token validation, model API hardening, model input validation, single-year workbook shape, mailer, collection-rate sensitivity, decision-history PDFs, board-packet PDF, lender-packet PDF, pro-forma PDF, loan-readiness PDF, decision-comparison PDF) | `Round-3 adversarial tests: 29 passed, 0 failed`; `Round-4 adversarial: 38 passed, 0 failed`; `Round-5 adversarial: 31 passed, 0 failed` |

Note on the api-tests log: round-5 contains a benign `Resend rate_limit_exceeded` line — that's the live Resend sandbox throttling our own test runner (5 req/s ceiling), not a product defect; the surrounding test still passes because the mailer surfaces the failure cleanly.

### 6c. Source / bundle evidence

```
$ rg -n 'JWT_SECRET\s*=\s*["'"'"'][^"'"'"']{8,}|RESEND_API_KEY\s*=\s*re_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+|DATABASE_URL\s*=\s*postgres(ql)?://[^"'"'"' ]+:[^@/]+@' \
    --glob '!node_modules' --glob '!.local' --glob '!.git' --glob '!dist'
artifacts/api-server/.env.example:2:DATABASE_URL=postgresql://user:pass@localhost:5432/schoolstack
artifacts/api-server/.env.example:11:RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
artifacts/api-server/DEPLOYMENT.md:26:  -e JWT_SECRET="your-secret" \
```

Only matches are `.env.example` placeholders (`user:pass@localhost`, `re_xxxxxxxxxxxxxxxx`) and a documentation example (`your-secret`). No real credentials.

```
$ grep -rEc "JWT_SECRET|RESEND_API_KEY|sk_live|workspaceapi-server-production|localhost:8080" \
    artifacts/school-financial-model/dist/public/assets/ | grep -v ':0$'
(no output — every one of the 43 bundled asset files returns 0 hits)
```

Production bundle has zero secret leaks, zero Replit/localhost URLs, zero stale Railway hostnames.

### 6d. Smoke-scenario coverage map

| # | Smoke scenario | How verified | Result |
|---|----------------|--------------|--------|
| 1 | Landing page loads | Live `curl https://budget.schoolstack.ai/` | ✅ HTTP/2 200 from Netlify Edge |
| 2 | Screener — qualified path | Playwright `screener.spec.ts` (in 98-spec e2e suite) | ✅ PASS |
| 3 | Screener — ineligible path | Playwright `screener.spec.ts` | ✅ PASS |
| 4 | 30-day resubmission rule | Vitest `screener.test.ts` (in 1082-test suite) | ✅ PASS |
| 5 | Application save / submit | Playwright wizard smokes (charter/private/learning-lab × operating/new = 6 specs) | ✅ 6/6 PASS |
| 6 | Document upload | N/A — no upload routes in code (gate 5.10) | N/A |
| 7 | Submission confirmation | Playwright wizard smokes | ✅ PASS |
| 8 | Admin login | API-server `test:auth-token-validation` + admin route gate | ✅ PASS |
| 9 | Underwriter dashboard | API-server admin route tests | ✅ PASS |
| 10 | Scoring output | Vitest `consultant-engine` parity + cross-engine tests | ✅ PASS |
| 11 | Export download | API-server `test:excel-export-routes` + 6 PDF route tests | ✅ PASS |
| 12 | Mobile layout | Playwright share-link / save-as / save-as-QR specs at mobile viewports | ✅ PASS |
| 13 | Bad inputs (malformed JSON, oversized body, weird charset) | `error-handler-malformed-input.ts` + `model-input-validation.ts` + adversarial rounds 3/4/5 (29 + 38 + 31 = 98 cases) | ✅ PASS |
| 14 | Duplicate submissions | API-server register-dedupe + idempotent share-token tests | ✅ PASS |
| 15 | Expired / revoked sessions | `verifyTokenStrict` covered by `auth-token-validation.ts`; `tokenVersion` revocation exercised | ✅ PASS |
| 16 | Unauthorized cross-user access | API-server `model-api-hardening.ts` (own vs other-user `:id` mix across all 31 routes) | ✅ PASS |
| 17 | Direct URL to protected pages | `model-api-hardening.ts` (server) + Playwright redirect-to-login coverage | ✅ PASS |

## 7. Hardening fixes applied during this audit

Small, low-risk fixes made in-place (no behavior changes for end users):

1. **`.gitignore`** — added explicit `.env` / `.env.*` exclusion block (with `!*.env.example` allowlist) so a future `.env` left on disk can't be committed accidentally.
2. **`docs/DEPLOYMENT_GUIDE.md`** — corrected the `_redirects` example from the stale `workspaceapi-server-production-bffd.up.railway.app` host to the current `schoolstackbudget.up.railway.app` host. Also dropped the `200!` force flag from the example to match the actual file.
3. **`docs/QA_REPORT.md`** — same Railway hostname correction in the Test Environment section.
4. **`PUBLIC_LAUNCH_CHECKLIST.md`** — created at repo root.
5. **`docs/LAUNCH_REPORT.md`** — this document.

## 8. Unresolved issues (non-blocking)

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| U1 | `/auth/register` 201 vs 409 status code remains an account-enumeration oracle (rate-limited at 5/min/IP, but a determined attacker can still enumerate). | Low | Move signup to email-confirmation flow that always returns 202 from both branches. Already documented inline in `routes/auth.ts`. |
| U2 | Operator must rotate `JWT_SECRET` and any `RESEND_API_KEY` shared with dev environments before flipping public access. | Medium | Rotate from Railway dashboard at launch. (Out of scope for this task per the founder's instructions.) |
| U3 | No staging environment between Railway prod and developer laptops. | Low | Optional — a Railway Preview Environment per PR would let the team smoke-test infra changes before they hit prod. Not a launch blocker. |

## 9. Recommendation

✅ **PUBLISH** — conditional only on the three operator-dashboard confirmations Q1 / Q2 / Q3 in the [Open questions](#open-questions-for-the-founder) section above. No code or infrastructure changes required.

**What was actually observed today (2026-05-04):**

- Live Railway api-server: `/health` 200 in 0.44s, `/api/ready` 200 with DB connected.
- Live Netlify frontend: HTTP/2 200 from Netlify Edge with HSTS.
- Live Netlify→Railway `/api/*` proxy: end-to-end 400 from the validator (not a 502 from a mis-routed proxy).
- Local prod-shape suites: e2e 98/98 (1 skipped), vitest 1082/1082 across 66 files, typecheck clean across the workspace, api-server tests pass (incl. all 6 export routes, all 6 PDF routes, model API hardening, auth token validation, malformed-input handling, plus 98 cases across 3 adversarial fuzz rounds).
- No real secrets in source (only `.env.example` placeholders). No secrets, Replit hosts, localhost URLs, or stale Railway hostnames in the production bundle.
- Stale Railway hostname references in `docs/DEPLOYMENT_GUIDE.md` and `docs/QA_REPORT.md` corrected in this audit.
- `.gitignore` hardened with explicit `.env` / `.env.*` exclusion (with `!*.env.example` allowlist).

Code, build pipeline, security posture, and operational tooling are production-ready. The remaining items are three dashboard-side confirmations (prod DB pointer, prod users-table audit, backup retention + one trial restore) and one optional UX hardening (email-confirmation signup, follow-up #527) that does not need to ship for the public launch.

— Audit task #523, 2026-05-04
