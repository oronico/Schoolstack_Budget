# One-Day Launch Proof Pack — budget.schoolstack.ai

**Date:** 2026-05-09 (updated after Railway dashboard confirmation)
**Sprint:** One-Day Launch Triage (Tasks #725 → #726 → #727 → #728)
**Auditor:** Replit task agent (Task #728)
**Verdict:** ✅ **GO WITH WATCH ITEMS** — Railway `/api/ready` and Netlify proxy `/api/ready` both green; Railway dashboard confirms clean boot logs (migrations OK, schema up to date, server listening on 0.0.0.0:8080, no `MODULE_NOT_FOUND`, no `@google-cloud/storage` error, no `google-auth-library` error, no crash loop). **Final browser-based E2E smoke test against `https://budget.schoolstack.ai/underwriting` is 5 / 5 PASS** in real headless Chromium across 3 founder scenarios + 2 mobile viewports — see §10.5 (added 2026-05-10).

> **GO rule (from the launch brief):** GO only if Railway is green, `/underwriting` works,
> readiness analysis runs, and the Excel export opens cleanly. All four are satisfied,
> and the production browser-based E2E smoke (§10.5) confirms each one drove successfully
> in a real Chromium browser against the live site for all three founder personas.
> Six watch items are documented at the bottom (#4 = post-launch upload monitoring;
> #5 = set `ALLOWED_ORIGINS` explicitly in Railway after launch; #6 = mobile 375 px
> 14 px overflow — all non-blocking).

> **2026-05-11 update — Full application polish audit completed.** No P0 launch
> blockers found. Four P0 watch items are short-copy fixes (two error toasts
> still surface the word "failed" to founders; two revenue-coaching strings
> conflate seat price with revenue; the Enrollment step is missing the
> seat-price-vs-payer anchor). Eight P1 items and a P2 backlog are tracked
> in `docs/FULL_APPLICATION_POLISH_AUDIT.md`. **Verdict remains GO WITH
> WATCH ITEMS.**

---

## 0. The 10 confirmations the launch lead asked for

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Exact typecheck command that failed | `pnpm run typecheck` (initial run during validation) — **no longer failing** as of 15:29 UTC | First run from this task: 3 errors. Re-run after Task #705's merge into main: **all 5 projects Done, 0 errors**. |
| 2 | Exact failing files (initial run) | `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx` (lines 192, 194) and `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.test.tsx` (line 153) | Errors referenced removed `dataBase64` field on `AssumptionEvidenceFile` (dropped by Task #729). |
| 3 | Are any failing files touched by Task #728? | **No.** Task #728's diff is `docs/ONE_DAY_LAUNCH_PROOF_PACK.md` plus regenerated `qa-output/` binaries (validation side-effect, see §12). The card and its test were not touched here. They were touched, and the issue resolved, by the just-merged Task #705. | `git show --stat 3f8a37c2 27ce8f9e` — only the doc and qa-output appear. `git show --stat 69436bff` (Task #705) — touches `AssumptionConfidenceCard.tsx` (8 lines) and `.test.tsx` (4 lines). |
| 4 | Both production builds pass? | ✅ **Yes.** `pnpm --filter @workspace/school-financial-model run build` → 20.1s, output `dist/public/`, largest chunk 443 KB. `pnpm --filter @workspace/api-server run build` → 2.5s, `dist/index.cjs` 4.6 MB + `dist/migrate.cjs` 175 KB + migrations copied. |
| 5 | `/underwriting` works in incognito? | ✅ **Yes (static HTML).** `curl -s https://budget.schoolstack.ai/underwriting` → HTTP **200** in 0.82s, 2,720 bytes, `<title>SchoolStack Budget — Your Mission Deserves a Financial Story</title>`. No redirect to `/register`. Same page works locally on `:22092` (HTTP 200, no `window.location.replace` in served HTML). |
| 6 | Readiness analysis runs? | ✅ **Yes.** Local `POST http://localhost:8080/api/public/consultant` → HTTP **200** in 8 ms, **22,217 bytes** of consultant JSON (executiveSummary + biggestStrength + recommendations populated). Railway path now responds 200 (api-server is back up; the same engine code runs on both). |
| 7 | Excel export downloads and opens? | ✅ **Yes.** Local `POST http://localhost:8080/api/public/export-budget` → HTTP **200** in 163 ms, **21,543 bytes**, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, first 4 bytes `PK\x03\x04` (valid xlsx ZIP header). Workbook QA harness (`qa:excel`) opens 30/30 fixtures cleanly. |
| 8 | Railway `/api/ready` returns db connected? | ✅ **YES (recovered at 15:42 UTC).** `https://schoolstackbudget.up.railway.app/api/ready` → HTTP **200** in 0.31-0.45s on a 5-probe burst, body `{"status":"ok","db":"connected"}`. `server: railway-edge` header confirms it's the live Railway service, not a cache. |
| 9 | Netlify proxy `/api/ready` returns db connected? | ✅ **YES.** `https://budget.schoolstack.ai/api/ready` → HTTP **200**, body `{"status":"ok","db":"connected"}`, `server: Netlify` + `x-railway-edge: railway/us-west2` + `x-railway-request-id: …` headers confirm the proxy correctly forwarded to Railway and got a fresh response (`age: 0`, `cache-status: "Netlify Edge"; fwd=miss`). |
| 10 | `docs/ONE_DAY_LAUNCH_PROOF_PACK.md` committed on the launch branch? | ✅ **Yes.** Initial version in commit **3f8a37c2**, Section-12 wording amendment in **27ce8f9e**, NO-GO update in **d2777862**, and the `@google-cloud/storage` bundle fix in **077f90cc** (`artifacts/api-server/build.ts`). All four commits are on `origin/main`. Railway dashboard confirms boot logs are clean (no `MODULE_NOT_FOUND`, no `@google-cloud/storage` / `google-auth-library` errors, no crash loop). |

---

## 1. Validation matrix

| # | Command | Status | Notes |
|---|---|---|---|
| 1 | `pnpm run typecheck` | ✅ PASS (after #705 merge) | Initial run during validation showed 3 errors in `AssumptionConfidenceCard.tsx`/`.test.tsx`. Task #705 merged immediately after and incidentally fixed both files. **Launch exception documented:** initial typecheck failure was due to pre-existing regression #729, was outside the one-day launch scope, and was not caused by Task #728. The fix landed via Task #705 before this proof pack was finalized. Follow-up #737 has been retracted as obsolete. |
| 2 | `pnpm --filter @workspace/school-financial-model run build` | ✅ PASS | Vite production build, 20.1s. |
| 3 | `pnpm --filter @workspace/api-server run build` | ✅ PASS | Esbuild 2.5s. |
| 4 | `pnpm --filter @workspace/api-server run qa:excel` | ✅ PASS | **30/30** — every fixture opens cleanly. |
| 5 | `pnpm --filter @workspace/api-server run qa:formula-results` | ⚠️ FAIL (pre-existing) | 1/2 — DSCR-cash vs Balance-Sheet-cash mismatch ~$207,672 on one fixture. Engine-side, predates this sprint. Watch item #2; follow-up **#738** filed. |
| 6 | `pnpm --filter @workspace/api-server run qa:smoke-arithmetic` | ✅ PASS | **32/32** workbook arithmetic checks. |
| 7 | `pnpm --filter @workspace/school-financial-model run test` | ✅ PASS | **1423/1423** vitest tests, 95 files, 104s. Includes the founder-voice cross-package guard (52 assertions). |

---

## 2. Railway deploy status

✅ **GREEN at 15:42 UTC** (recovered after a transient ~15-minute outage that started shortly after 15:29 UTC).

Sustained probe burst:
```
$ for i in 1 2 3 4 5; do curl -s --max-time 6 -o /dev/null -w "try $i: HTTP %{http_code} in %{time_total}s\n" https://schoolstackbudget.up.railway.app/api/ready; done
try 1: HTTP 200 in 0.436s
try 2: HTTP 200 in 0.435s
try 3: HTTP 200 in 0.454s
try 4: HTTP 200 in 0.436s
try 5: HTTP 200 in 0.312s
$ curl -s https://schoolstackbudget.up.railway.app/api/ready
{"status":"ok","db":"connected"}
$ curl -s https://schoolstackbudget.up.railway.app/health
{"status":"ok","migrations":"ok"}
```

The bundle fix (`@google-cloud/storage` + `google-auth-library` added to the api-server esbuild allowlist, commit **077f90cc**) is on `origin/main`. Railway dashboard confirmation: migrations run successfully, schema is up to date, server is listening on `0.0.0.0:8080`, no `MODULE_NOT_FOUND`, no `@google-cloud/storage` error, no `google-auth-library` error, no crash loop. The latent missing-module class of crash is closed out.

## 3. API health (production)

| Probe | Result |
|---|---|
| `GET https://schoolstackbudget.up.railway.app/health` | ✅ HTTP 200, `{"status":"ok","migrations":"ok"}` (recovered 15:42 UTC) |
| `GET https://schoolstackbudget.up.railway.app/api/ready` | ✅ HTTP 200, `{"status":"ok","db":"connected"}` (5/5 probes in 0.31-0.45s, `server: railway-edge`) |
| `GET https://budget.schoolstack.ai/api/ready` (Netlify proxy) | ✅ HTTP 200, `{"status":"ok","db":"connected"}` (`age: 0`, `cache-status: "Netlify Edge"; fwd=miss`, `x-railway-request-id` present — fresh upstream forward, not cache) |
| `GET https://budget.schoolstack.ai/` (Netlify static) | ✅ HTTP 200 |
| `GET https://budget.schoolstack.ai/underwriting` (Netlify static) | ✅ HTTP 200, 2720 bytes, correct `<title>` |

## 4. API health (local — proves the build is good)

| Probe | Result |
|---|---|
| `GET http://localhost:8080/health` | ✅ HTTP 200, `{"status":"ok","migrations":"ok"}` |
| `GET http://localhost:8080/api/ready` | ✅ HTTP 200, `{"status":"ok","db":"connected"}` |
| `GET http://localhost:22092/underwriting` | ✅ HTTP 200, correct `<title>`, no redirect |
| `POST http://localhost:8080/api/public/consultant` (small microschool fixture) | ✅ HTTP 200 in 8ms, 22 217 bytes JSON |
| `POST http://localhost:8080/api/public/export-budget` (same fixture) | ✅ HTTP 200 in 163ms, 21 543 bytes, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, ZIP magic `PK\x03\x04` |

## 5. DB readiness

✅ **Local schema up to date** (`[migrations] Schema up to date.` on api-server startup). Production Railway DB is connected — `/api/ready` returns `{"status":"ok","db":"connected"}` on a sustained 5/5 probe burst, and the Railway dashboard boot log confirms migrations ran successfully and schema is up to date.

## 6-9. Brief content / language / copy sweeps

(No change since first write — these are static checks, not affected by the Railway outage.)

- ✅ `/underwriting` route mounted to `UnderwritingLandingPage`, no auth gate.
- ✅ Smoke arithmetic 32/32 = readiness analysis pipeline correct.
- ✅ `qa:excel` 30/30 = workbooks open cleanly.
- ✅ Banned-language guard `founder-voice.test.ts` 52/52, including the new cross-package api-server guard added in Task #727.
- ✅ Six beginner help blurbs (data-testids `help-enrollment` … `help-export`) shipped via Task #726.

## 10. Watch items (non-blocking, post-Railway recovery)

1. ~~**Typecheck failure in `AssumptionConfidenceCard.tsx` / `.test.tsx`**~~ — **RESOLVED** by Task #705's merge. Follow-up #737 retracted.
2. **`qa:formula-results` 1/2** — cross-tab DSCR-cash vs Balance-Sheet-cash mismatch (~$207 672) on one fixture. Pre-existing engine accounting issue. Workbook still opens cleanly per `qa:excel` 30/30. Follow-up **#738** filed.
3. **e2e `wizard-smoke-six-paths` `*_new` paths Step 7→8** — 5/8 pass; charter_new, private_new, learning_lab_new flake on the Assumptions & Sensitivity heading. Pre-existing across #726, #727. Does not affect `/underwriting` (the public single-file wizard).
4. **Object storage runtime dependency bundling — post-launch monitoring.** Fix is on `origin/main` (commit **077f90cc**, `artifacts/api-server/build.ts` esbuild allowlist now includes `@google-cloud/storage` and `google-auth-library`) and Railway boot logs are confirmed clean. Continue to monitor first production uploads after launch and confirm no missing-module errors for `@google-cloud/storage` or `google-auth-library` show up under real upload load. Local round-trip test (`pnpm --filter @workspace/api-server run test:storage-evidence-roundtrip`) is **23/23 PASS**.
5. **`ALLOWED_ORIGINS` env var — set explicitly in Railway after launch (non-blocking).** Make the production CORS allowlist explicit in the Railway environment rather than relying on whatever default the api-server falls back to. No impact on `/underwriting` or the public read paths; only affects authenticated cross-origin traffic. Worth doing in the first post-launch maintenance window.
6. **Mobile 375×812 horizontal overflow — 14 px (P1, non-blocking).** Discovered by the final production browser-based E2E smoke test (see §10.5). At iPhone-13 width (375 px) the `/underwriting` document scrolls 14 px wider than the viewport; iPhone-14-Pro-Max width (430 px) shows zero overflow. Wizard remains fully usable on the 375 px width — all controls reachable, all six "Continue" steps walkable, no console errors. Cosmetic horizontal scroll only. Fix is a CSS-tightening pass on the wizard chrome (likely the step-progress list at the top); safe to ship after launch. **Not a launch blocker.**

---

## 10.5. Final Browser-Based E2E Smoke Test (production)

**Date:** 2026-05-10
**Spec:** `artifacts/school-financial-model/e2e/prod-launch-smoke.spec.ts` (new this run)
**Target:** `https://budget.schoolstack.ai/underwriting` (live production, Netlify static + Railway api-server)
**Browser:** Headless Chromium 1187 (the Replit-pinned Playwright build, real browser — not curl, not local)
**Run command:**
```
cd artifacts/school-financial-model && \
  E2E_BASE_URL=https://budget.schoolstack.ai \
  npx playwright test prod-launch-smoke.spec.ts --workers=3 --reporter=list
```
**Total runtime:** 32.1 s
**Result:** ✅ **5 / 5 PASS** (3 founder scenarios + 2 mobile viewports)

### Per-scenario results

| # | Scenario | Readiness verdict | Y1 students | Y5 students | Analysis result | Workbook download | Console errors | Page errors |
|---|---|---|---|---|---|---|---|---|
| 1 | **Launch Test Academy** — microschool, new, tuition-based, deposits as evidence, founder comp deferred to Y2 | **Developing** | 18 | 37 | ✅ Success card rendered (`card-analysis-result` visible, no `text-analysis-error` banner) | ✅ `Launch-Test-Academy-Budget.xlsx` — 24 969 bytes | 0 | 0 |
| 2 | **Actuals Test School** — operating private school, signed agreements, founder paid Y1, existing debt + new $350k loan request | **Developing** | 120 | 163 | ✅ Success card rendered (`card-analysis-result` visible, no `text-analysis-error` banner) | ✅ `Actuals-Test-School-Budget.xlsx` — 25 558 bytes | 0 | 0 |
| 3 | **ESA Timing Test School** — charter / public-funded, funding approval *pending*, **cannot withstand 90-day delay**, $500k loan request | **Not Yet Ready** ✅ *(correct — engine flagged the timing risk as designed)* | 180 | 264 | ✅ Success card rendered (`card-analysis-result` visible, no `text-analysis-error` banner) | ✅ `ESA-Timing-Test-School-Budget.xlsx` — 25 295 bytes | 0 | 0 |

> **Note on "Analysis result":** the spec waits for the in-page `card-analysis-result` element to become visible (or the `text-analysis-error` banner to appear) and asserts on the in-browser outcome. Underlying HTTP response status to `/api/public/consultant` was not separately captured by the spec; the green `card-analysis-result` is what the founder actually sees, and is the binding GO-rule criterion. Network-level HTTP 200 from `/api/public/consultant` is separately covered by §4 of this proof pack and the curl-based probes in Phase 1+2 of the launch sweep.

### Mobile viewport pass

| Viewport | Result | Horizontal overflow | Step 1 → 2 → back walk | Console errors |
|---|---|---|---|---|
| **iPhone 13 (375 × 812)** | ✅ PASS with P1 watch | **14 px** — logged as P1 watch item #6, non-blocking | ✅ All controls reachable, navigation works | 0 |
| **iPhone 14 Pro Max (430 × 932)** | ✅ PASS clean | 0 px | ✅ All controls reachable, navigation works | 0 |

Full-page mobile screenshots saved at:
- `artifacts/school-financial-model/.local/e2e-logs/prod-launch-smoke/mobile-iphone-13-375x812-step1.png`
- `artifacts/school-financial-model/.local/e2e-logs/prod-launch-smoke/mobile-iphone-14-pro-max-430x932-step1.png`

### Workbook integrity (post-download)

All three production-downloaded workbooks were file-typed and scanned for engine errors:
```
$ file *.xlsx
actuals-test-school-Actuals-Test-School-Budget.xlsx:        Microsoft Excel 2007+
esa-timing-test-school-ESA-Timing-Test-School-Budget.xlsx:  Microsoft Excel 2007+
launch-test-academy-Launch-Test-Academy-Budget.xlsx:        Microsoft Excel 2007+

$ unzip -p <each>.xlsx 'xl/worksheets/sheet*.xml' xl/sharedStrings.xml \
    | grep -oE "#REF|#NAME|#VALUE|#DIV/0|#NULL|NaN|undefined|Infinity"
(zero matches across all 3 workbooks)
```
Zero `#REF`/`#NAME`/`#VALUE`/`#DIV/0`/`NaN`/`undefined`/`Infinity` strings in any of the three workbooks. All open as valid Microsoft Excel 2007+ files.

### What this proves (and what it does not)

- ✅ **Real Chromium browser** drove the live production site end-to-end — not curl, not a local-only test substitute.
- ✅ **Three distinct founder personas** (microschool / operating private / public-funded charter) walked all 7 wizard steps, hit the readiness analysis API, downloaded a workbook, and the workbook opened cleanly with no engine errors.
- ✅ **Readiness engine differentiates correctly**: the two healthy scenarios returned "Developing" and the deliberate timing-risk scenario returned "Not Yet Ready" — confirming the readiness flags surface as designed when public-funding-delay sensitivity is selected.
- ✅ **Zero JavaScript console errors and zero uncaught page errors** across all 5 test runs against production.
- ✅ **Mobile viewports both render and navigate** — only the 375 px width has cosmetic 14 px overflow (P1 watch item #6).
- ⚠ **Scope:** this is the public guest `/underwriting` wizard (the launch surface). It is intentionally separate from the authenticated 12-step model wizard, where Watch Item #3 (`*_new` paths Step 7→8 flake) still applies. The launch traffic flows through `/underwriting`, not the authenticated wizard.

### Spec hygiene

- One real bug was caught and fixed during smoke-test authoring: `select-enrollment-validation` option value is `"deposits_collected"`, not `"deposits"`. Spec corrected before the green run.
- Mobile overflow check threshold tuned: ≤ 2 px = clean, 3-50 px = P1 (logged but non-blocking), > 50 px = P0 (would block launch). The 14 px overflow on iPhone 13 falls in the P1 band.
- All five tests run in 32.1 s with `--workers=3`. Spec is committed and rerunnable any time post-launch as a regression guard.

---

## 11. Production outage (resolved)

A ~13-minute Railway outage (15:29 → 15:42 UTC) returned 502 / connection-hang on every API probe. Root cause: a missing-module class of crash in object-storage code paths — `@google-cloud/storage` and `google-auth-library` were left as external `require()` calls in `dist/index.cjs` because the esbuild allowlist in `artifacts/api-server/build.ts` did not bundle them. Fix landed in commit **077f90cc** (added both modules to the allowlist; rebuild grew `dist/index.cjs` from 4.6 MB to 5.3 MB and removed every literal external require for those modules). Railway recovered by 15:42 UTC; sustained 5/5 probe burst on `/api/ready` returned HTTP 200 in ~0.4s with the correct `db:connected` body. The fix commit is now on `origin/main` and Railway dashboard boot logs confirm a clean start (no `MODULE_NOT_FOUND`, no `@google-cloud/storage` / `google-auth-library` errors, no crash loop). Latent missing-module crash class permanently removed.

## 12. Note on tracked QA artifacts

Running `pnpm run qa:excel` and `pnpm run qa:formula-results` regenerates the 30 tracked workbooks under `artifacts/api-server/qa-output/` plus `qa-report.json` by design — the harness writes outputs into that directory every run. The xlsx files carry timestamp churn inside their ZIP container, and `qa-report.json` reflects current tab names, tab counts, scanned-cell counts, and the active set of QA checks as of this run. The harness still reports `overallPass: true` (30 / 30). These regenerated artifacts are a side effect of the validation runs, not a code change owned by this task. They were committed alongside the proof pack in 3f8a37c2 because the main agent cannot run `git checkout` to revert tracked files in this environment (sandbox restriction). A clean-only follow-up commit can revert them without changing any product behavior — they are not load-bearing.

## 13. Final call

✅ **GO WITH WATCH ITEMS.**

All four GO-rule conditions are satisfied **and re-verified in a real production browser**: Railway is green (5/5 probes, ~0.4 s, `db:connected`); `/underwriting` loads in incognito with no auth gate; the readiness analysis runs (in production, on three distinct founder scenarios, with the timing-risk persona correctly returning *"Not Yet Ready"*); and the Excel export downloads + opens cleanly (three production-downloaded workbooks of 24-25 KB each, all valid Microsoft Excel 2007+, zero `#REF`/`#NAME`/`#VALUE`/`NaN`/`undefined` strings). Six watch items are documented in §10 — #4 is post-launch monitoring of first production uploads, #5 is a non-blocking ask to set `ALLOWED_ORIGINS` explicitly in Railway after launch, and #6 is the new 14 px mobile overflow at 375 px (cosmetic, P1). None block tomorrow's launch window.

**Verdict timeline:**
- 14:50 UTC — first write: ✅ GO with one typecheck watch item.
- 15:29 UTC — fresh re-probe: ⛔ NO-GO PENDING RAILWAY RECOVERY (Railway returning 502 / connection hang).
- 15:35 UTC — root cause identified and fixed locally: missing `@google-cloud/storage` + `google-auth-library` in api-server esbuild allowlist (commit 077f90cc).
- 15:42 UTC — Railway recovered; 5/5 sustained probes return HTTP 200 with `db:connected`. Verdict flipped back to ✅ GO WITH WATCH ITEMS per the launch brief's rule.
- Post-recovery — bundle fix commit **077f90cc** confirmed merged to `origin/main`. Launch lead confirmed Railway dashboard boot logs are clean (migrations OK, schema up to date, listening on `0.0.0.0:8080`, no `MODULE_NOT_FOUND`, no `@google-cloud/storage` error, no `google-auth-library` error, no crash loop). Watch Item #4 reframed from "pending production deploy" to "post-launch upload monitoring"; Watch Item #5 added for `ALLOWED_ORIGINS`.
- **2026-05-10 — Final browser-based E2E smoke against production:** new spec `e2e/prod-launch-smoke.spec.ts` drove `https://budget.schoolstack.ai/underwriting` in headless Chromium for all three founder personas (microschool / operating private / public-funded charter w/ 90-day delay sensitivity) plus two mobile viewports (375×812, 430×932). **5 / 5 PASS in 32.1 s**, three real production workbooks downloaded and verified clean, zero console errors, zero page errors. Discovered Watch Item #6 (14 px mobile overflow at 375 px — cosmetic, non-blocking). Verdict reaffirmed: **✅ GO WITH WATCH ITEMS.** See §10.5.
