# Public Launch Checklist — budget.schoolstack.ai

**Audit date:** 2026-05-04
**Topology audited:** GitHub (`oronico/SchoolStack_Budget2`) → Netlify (frontend) → Railway (api-server + Postgres)
**Auditor:** Replit task agent (Task #523)
**Recommendation:** ✅ **PUBLISH** — see [§9 Launch Report](docs/LAUNCH_REPORT.md) for caveats and operator follow-ups.

Each gate below is **PASS / FAIL / N/A** with a one-line evidence note. Detailed findings, smoke-test results, and the operator hand-off live in [`docs/LAUNCH_REPORT.md`](docs/LAUNCH_REPORT.md).

---

## 1. Repo & GitHub readiness

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1.1 | GitHub remote configured and points at the public repo | ✅ PASS | `git remote -v` lists `github.com:oronico/SchoolStack_Budget2.git`. |
| 1.2 | `.gitignore` covers `.env`, `.env.*`, `node_modules`, build outputs, logs, temp/screenshot artifacts | ✅ PASS | Hardened in this audit — added `.env` / `.env.*` block (with `!*.env.example` allowlist). `dist`, `tmp`, `node_modules`, `*.tsbuildinfo`, `playwright-report/`, `test-results/`, `*.png`, `*.jpeg`, `nohup.out`, `npm-debug.log` already covered. |
| 1.3 | No real secrets committed | ✅ PASS | `rg` sweep for `JWT_SECRET=`, `DATABASE_URL=`, `RESEND_API_KEY=`, `sk_live`, `sk_test_` returns only the documentation example in `artifacts/api-server/DEPLOYMENT.md` (`-e JWT_SECRET="your-secret"`) and the placeholder in `.env.example`. |
| 1.4 | No committed `.env` files | ✅ PASS | Only `artifacts/api-server/.env.example` exists; it contains placeholders only (`postgresql://user:pass@…`, `your-secure-random-secret-here`, `re_xxxxxxxxxxxxxxxx`). |
| 1.5 | Working tree clean before audit changes | ✅ PASS | `git status -s` returned empty before this audit's edits. |
| 1.6 | README documents purpose, local setup, build/dev commands, deployment target, env vars, known limitations | ✅ PASS | `README.md` already covers all of these (Tech Stack, Project Structure, Getting Started, Environment Variables, Deployment, plus `RELEASE_NOTES.md` for known limits). No further README edits required. |
| 1.7 | `PUBLIC_LAUNCH_CHECKLIST.md` exists at repo root | ✅ PASS | This file. |

## 2. Netlify readiness

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 2.1 | `netlify.toml` build command | ✅ PASS | `pnpm install --frozen-lockfile && pnpm --filter @workspace/school-financial-model run build` |
| 2.2 | `netlify.toml` publish dir | ✅ PASS | `artifacts/school-financial-model/dist/public` |
| 2.3 | SPA fallback redirect present | ✅ PASS | `[[redirects]] from = "/*" to = "/index.html" status = 200` |
| 2.4 | `/api/*` proxy to Railway | ✅ PASS | `from = "/api/*" to = "https://schoolstackbudget.up.railway.app/api/:splat" status = 200 force = true`, with `Host` + `X-Forwarded-Host` rewrite. The legacy `public/_redirects` proxies to the same Railway host (consistent). |
| 2.5 | `[build.environment]` only contains safe values | ✅ PASS | `NODE_VERSION=20`, `PNPM_VERSION=10`, `BASE_PATH=/`, `VITE_API_BASE_URL=https://schoolstackbudget.up.railway.app`. All are public; no secrets. |
| 2.6 | Production bundle does NOT leak secrets | ✅ PASS | `grep` over `dist/public/assets/` for `JWT_SECRET`, `RESEND_API_KEY`, `DATABASE_URL`, `sk_live` returns nothing. |
| 2.7 | Production bundle does NOT contain Replit / localhost URLs | ✅ PASS | `grep` over `dist/public/assets/` for `replit.dev`, `repl.co`, `workspaceapi-server-production`, `localhost:8080`, `http://localhost` returns nothing. |
| 2.8 | Asset cache headers configured | ✅ PASS | `/assets/*` → `public, max-age=31536000, immutable`; `/logos/*` → `public, max-age=86400`. |

## 3. Railway readiness (api-server)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 3.1 | Dockerfile builds the API cleanly from monorepo root | ✅ PASS | `artifacts/api-server/Dockerfile` is a 2-stage build (node:22-slim), uses `pnpm install --frozen-lockfile`, runs `pnpm --filter @workspace/api-server run build`, copies the bundled `dist/index.cjs`, runs as non-root `appuser` (uid 1001). |
| 3.2 | Server respects `PORT` | ✅ PASS | `src/index.ts:101` — `const port = Number(process.env["PORT"] || "8080");` then `app.listen(port, "0.0.0.0", …)`. |
| 3.3 | `/health` returns 200 unconditionally (load-balancer probe) | ✅ PASS | `src/app.ts:122` — `app.get("/health", respondHealth)`; same handler also mounted on `/healthz`. |
| 3.4 | `/api/ready` checks DB | ✅ PASS | `src/app.ts:131` — `pool.query("SELECT 1 AS ok")`, returns 503 with `{db:"disconnected"}` on failure. |
| 3.5 | Required env vars enforced at startup in production | ✅ PASS | `src/index.ts:validateEnv()` exits with `[startup] FATAL` if `DATABASE_URL`, `JWT_SECRET`, or (in prod) `APP_URL` is missing. |
| 3.6 | Env-var contract documented | ✅ PASS | `artifacts/api-server/DEPLOYMENT.md` and `.env.example` agree: required = `DATABASE_URL`, `JWT_SECRET`; required-in-prod = `APP_URL`; recommended = `ALLOWED_ORIGINS`, `PORT`; optional = `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS`. |
| 3.7 | `ALLOWED_ORIGINS` defaults to a tight allowlist in production | ✅ PASS | `src/app.ts:29-73` — base allowlist is `space.schoolstack.ai`, `budget.schoolstack.ai`, `schoolstack.ai`; `ALLOWED_ORIGINS` env appends; localhost origins are only allowed when the request actually comes from `http://localhost*` (so the prod deploy never echoes a localhost `Origin`). Unknown origins return CORS-deny. |
| 3.8 | Production logging does not leak secrets, applicant data, or stack traces in 5xx responses | ✅ PASS | `src/app.ts:187-222` — error handler returns `{ error: "Internal server error" }`, never the message/stack. Stack is persisted server-side in `error_logs` (5000-char cap). `stripSensitive()` redacts `password`, `passwordHash`, `token`, `authorization`, `cookie`, `secret`, `apiKey`, `resetToken`, `creditCard`, `ssn` before persistence. |
| 3.9 | Body-parser errors map to 4xx (not 500-noise) | ✅ PASS | `classifyClientError()` maps `entity.parse.failed` → 400, `entity.too.large` → 413, `encoding.unsupported` / `charset.unsupported` → 415. |
| 3.10 | Trust-proxy is set so `req.ip` reflects the client (rate-limit safety) | ✅ PASS | `src/app.ts:23-24` — `app.set("trust proxy", TRUST_PROXY_HOPS || 1)`; documented inline as defending against credential-stuffing on `/auth/login`. |
| 3.11 | Graceful shutdown on SIGTERM / SIGINT (Railway redeploy hygiene) | ✅ PASS | `src/index.ts:128-161` — closes HTTP server, drains pg pool, 15s force-exit fallback, idempotent on repeat signals. |
| 3.12 | Healthcheck path documented for Railway dashboard | ✅ PASS | `DEPLOYMENT.md:82` — "Set the health check path to `/health` in your Railway service settings." |

## 4. Frontend ↔ backend wiring

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 4.1 | Frontend uses `VITE_API_BASE_URL` or the Netlify `/api/*` proxy | ✅ PASS | `src/lib/fetch-patch.ts` — every `/api/*` fetch is rewritten to `${VITE_API_BASE_URL}${url}` when the env var is set, otherwise stays relative for the Netlify proxy. Only 3 references repo-wide (`fetch-patch.ts`, `SharedModelPage.tsx`). |
| 4.2 | No localhost / Replit hosts in shipped JS | ✅ PASS | See gate 2.7. |
| 4.3 | CORS allowlist on the API matches the production frontend origin | ✅ PASS | `https://budget.schoolstack.ai` is hard-coded in `SCHOOLSTACK_ORIGINS` (`src/app.ts:29-33`); `ALLOWED_ORIGINS` env adds anything else the operator wants. |
| 4.4 | Auth token is added to API requests automatically | ✅ PASS | `fetch-patch.ts:19-26` reads `localStorage.auth_token` and sets `Authorization: Bearer …` for every `/api/*` call. |
| 4.5 | Failed API calls render a user-friendly message | ✅ PASS | Frontend uses the standardized `{ error: "…" }` body that the API returns on every error path; the wizard and screener surface those via toasts. The catch-all 500 returns the safe text "Internal server error" — no stack/SQL. |

## 5. Security & access control

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 5.1 | Admin & analytics routes require `authMiddleware + adminMiddleware` | ✅ PASS | `routes/admin.ts` mounts both middlewares on every handler; `adminMiddleware` checks `ADMIN_EMAILS` allowlist. `routes/feedback.ts` `GET /admin/feedback` and `routes/errors.ts` `GET /admin/errors` likewise. |
| 5.2 | All `/models/*` routes require auth | ✅ PASS | All 31 `/models[/:id]/*` handlers in `routes/models.ts` mount `authMiddleware`. |
| 5.3 | `:id` ownership is enforced server-side (an applicant can't read another applicant's model) | ✅ PASS | Every authoritative DB query in `routes/models.ts` is `WHERE id = :id AND user_id = :req.userId` (28 distinct call sites confirmed). Verified for GET / PUT / DELETE / duplicate / archive / consultant / all 9 export routes / share CRUD / review-request / review-preview. |
| 5.4 | Public form endpoints have server-side validation | ✅ PASS | `/public/export-*`, `/public/consultant`, `/public/request-review`, `/public/track-cta`, `/public/timing` — all use `safeParse` against generated Zod schemas plus an explicit `Content-Length` ceiling of 512KB. |
| 5.5 | Rate limiting on every unauthenticated POST | ✅ PASS | `createRateLimiter()` is mounted on every `/public/*`, `/auth/login`, `/auth/register` (5/min), `/auth/forgot-password`, `/feedback` (10/min), `/errors/report` (30/min), and the `/shared/:token*` surface (30/min). DB-backed (`rate_limits` table) with `trust proxy` set to 1 so it keys on the client IP, not the LB IP. |
| 5.6 | Auth tokens use strict claim validation | ✅ PASS | `verifyTokenStrict()` in `middlewares/auth.ts` rejects (a) string-coerced `userId`, (b) tokens missing `tokenVersion`, (c) tokens whose `tokenVersion` doesn't match the DB row — closing the round-2 ghost-user / leaked-secret bypass on every surface that decodes JWTs (`/feedback`, `/errors/report` use the same helper). |
| 5.7 | Login response time is constant in the email-unknown branch | ✅ PASS | `routes/auth.ts:35` — pre-computed `DUMMY_BCRYPT_HASH` is `bcrypt.compare`'d on the unknown-email path so login response time can't enumerate accounts. `/auth/register` mirrors the cost on the duplicate-email branch (a `bcrypt.hash` + no-op UPDATE) and tightens the per-IP budget to 5/min. |
| 5.8 | Password reset cooldown / token TTL | ✅ PASS | `FORGOT_PASSWORD_COOLDOWN_MS = 60_000`; `RESET_TOKEN_TTL_MS = 3_600_000` (1h). |
| 5.9 | Error responses don't leak DB internals or stack traces | ✅ PASS | See gates 3.8, 3.9. |
| 5.10 | File upload routes enforce size + MIME + private storage | N/A | The repo has **no file-upload routes**. `rg multer\|busboy\|formidable` returns zero matches; the only "upload" terminology in the codebase is for accounting-export *download* CTA tracking. JSON-only API; the 5 MB body limit (`express.json({ limit: "5mb" })`) plus the 512 KB public-route ceiling caps any payload. |

## 6. Data & DB protections

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 6.1 | Production DB is separate from dev | ⚠️ OPERATOR-CONFIRM | Code reads `DATABASE_URL` from env; the Railway dashboard provisions a separate managed PG instance. Confirm in the Railway UI that prod points at the prod PG add-on and not at any dev/staging URL. Listed as an open question in §9. |
| 6.2 | No seed/test/fake user data shipped to prod | ⚠️ OPERATOR-CONFIRM | Migrations only create empty tables (no seeds). However, the historical dev DB may carry early-test users; recommend the operator either (a) reset the prod DB before launch, or (b) audit `users` for non-real emails before publishing. Listed as open question in §9. |
| 6.3 | Sensitive applicant data is not logged in plaintext | ✅ PASS | `stripSensitive()` redacts before persistence; the only `console.log` calls in the api-server's hot path log route + status, never request bodies. Sweep of 60 `console.log` lines confirmed none print passwords, tokens, or applicant PII. |
| 6.4 | Backup/restore story documented | ⚠️ OPERATOR-CONFIRM | Railway provides automatic daily snapshots on the Postgres add-on. Operator should confirm the retention setting in the Railway dashboard and document the manual restore procedure (Railway → Postgres → Backups → Restore). Recorded in §9. |
| 6.5 | Error log table has retention | ✅ PASS | `cleanupOldErrorLogs()` deletes `error_logs` rows older than 30 days every 5 minutes; `cleanupExpiredRateLimits()` runs on the same interval. |

## 7. Application workflow controls

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 7.1 | Auth is required to save / load full models | ✅ PASS | All `/models/*` handlers gated on `authMiddleware`; no anonymous write surface. |
| 7.2 | Public underwriting wizard is self-contained (localStorage) and cannot read other users' data | ✅ PASS | `/underwriting` posts JSON to `/public/export-*` / `/public/consultant`; the API never accepts a model `id` on those routes. |
| 7.3 | Optimistic concurrency / If-Match on PUT prevents lost writes | ✅ PASS | Task #479 — every PUT requires `If-Match: "<version>"`; missing → 428, stale → 409 with latest server state. (`routes/models.ts:88-99`.) |
| 7.4 | Export blocking on unresolved warning/critical assumption flags | ✅ PASS | `checkUnresolvedFlags()` (routes/models.ts:118-141) is enforced identically in all 6 server export routes AND in the wizard step-9 client validation. |
| 7.5 | Share links are revocable, opaque, and rate-limited | ✅ PASS | Tokens are 64-hex-char (cryptographic), `revokedAt` returns 410, `sharedLinkRateLimiter` caps at 30 req/min/IP. The `/shared/:token` payload is scoped to aggregates — it never returns row-level inputs (revenueRows, expenseRows, staffing). |

## 8. Smoke test against production-style deploy

**Executed 2026-05-04 against (a) live Netlify + Railway production and (b) the full local prod-shape validation suite.** Raw evidence is captured in [§6 of the Launch Report](docs/LAUNCH_REPORT.md#6-smoke-test-results-executed-2026-05-04). Headlines:

- **Live `https://schoolstackbudget.up.railway.app/health`** → `HTTP 200` in 0.44s, body `{"status":"ok"}`.
- **Live `https://schoolstackbudget.up.railway.app/api/ready`** → `HTTP 200`, body `{"status":"ok","db":"connected"}` (DB ping live).
- **Live `https://budget.schoolstack.ai/`** → `HTTP/2 200` from Netlify Edge, HSTS header present.
- **Live `POST https://budget.schoolstack.ai/api/auth/login`** with empty body → `HTTP 400 {"error":"Email and password are required."}` — confirms Netlify `/api/*` proxy → Railway end-to-end with the real validator running on the other side (not a 502).
- **Playwright e2e (98 specs):** **98 passed, 1 skipped** in 8m 18s.
- **Vitest (`@workspace/school-financial-model`):** **1082 passed across 66 test files** in 70s.
- **Workspace `typecheck`:** PASS (school-financial-model + scripts both `tsc --noEmit` clean).
- **API-server suite (incl. PDF routes, Excel export routes, error-handler malformed input, model API hardening, auth token validation, model input validation, single-year workbook shape, decision-history PDF, lender-packet PDF, board-packet PDF, pro-forma PDF, loan-readiness PDF, decision-comparison PDF, mailer, collection-rate sensitivity, parity, plus rounds 3/4/5 adversarial = 29 + 38 + 31 passed):** **all PASS**.

| # | Smoke scenario | How verified | Result |
|---|----------------|--------------|--------|
| 8.1 | Landing page loads | Live `curl https://budget.schoolstack.ai/` | ✅ PASS — HTTP/2 200, Netlify Edge |
| 8.2 | Screener — qualified path | Playwright `screener.spec.ts` (in 98-spec suite) | ✅ PASS |
| 8.3 | Screener — ineligible path | Playwright `screener.spec.ts` | ✅ PASS |
| 8.4 | 30-day resubmission rule | Vitest `screener.test.ts` | ✅ PASS |
| 8.5 | Application save / submit | Playwright wizard smoke (charter/private/learning-lab × operating/new) | ✅ PASS — 6/6 wizard smokes |
| 8.6 | Document upload | N/A — no upload routes exist (gate 5.10) | N/A |
| 8.7 | Submission confirmation | Playwright wizard smokes | ✅ PASS |
| 8.8 | Admin login | API-server `test:auth-token-validation` + admin route gate | ✅ PASS |
| 8.9 | Underwriter dashboard | Playwright admin specs + API-server admin tests | ✅ PASS |
| 8.10 | Scoring output | Vitest `consultant-engine` parity + cross-engine tests | ✅ PASS |
| 8.11 | Export download | API-server `test:excel-export-routes` + 6 PDF route tests | ✅ PASS |
| 8.12 | Mobile layout | Playwright share-link / save-as / save-as-QR specs at mobile viewports | ✅ PASS |
| 8.13 | Bad inputs (malformed JSON, oversized body, weird charset) | API-server `error-handler-malformed-input.ts` + `model-input-validation.ts` + rounds 3/4/5 adversarial | ✅ PASS |
| 8.14 | Duplicate submissions | API-server `auth-token-validation.ts` register-dedupe + idempotent share-token tests | ✅ PASS |
| 8.15 | Expired / revoked sessions | `verifyTokenStrict` covered by `auth-token-validation.ts`; `tokenVersion` revocation exercised | ✅ PASS |
| 8.16 | Unauthorized cross-user access | API-server `model-api-hardening.ts` (own vs other-user `:id` mix across all 31 routes) | ✅ PASS |
| 8.17 | Direct URL to protected pages | `model-api-hardening.ts` (server) + Playwright redirect-to-login coverage | ✅ PASS |

## 9. Final launch report

See [`docs/LAUNCH_REPORT.md`](docs/LAUNCH_REPORT.md) for the section-9 hand-off: GitHub repo + branch, Netlify site + URL, Railway services, env-var checklist by name, build command, publish dir, API base URL, smoke-test summary, unresolved issues, open operator questions, and the explicit publish recommendation.

---

## Summary

- **Code, build, security:** all gates pass.
- **Documentation:** README + DEPLOYMENT.md + DEPLOYMENT_GUIDE.md are accurate. (Stale Railway hostname `workspaceapi-server-production-bffd.up.railway.app` corrected in this audit.)
- **Operator-confirm items:** 3 (gates 6.1, 6.2, 6.4) — all are dashboard-side checks the founder can complete in <15 minutes.
- **Recommendation:** ✅ PUBLISH after the founder confirms the three operator-side gates in §9.
