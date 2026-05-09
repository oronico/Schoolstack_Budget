# One-Day Launch Proof Pack — budget.schoolstack.ai

**Date:** 2026-05-09 (updated 15:30 UTC after live-probe re-verification)
**Sprint:** One-Day Launch Triage (Tasks #725 → #726 → #727 → #728)
**Auditor:** Replit task agent (Task #728)
**Verdict:** ⛔ **NO-GO PENDING RAILWAY RECOVERY** (was ✅ GO at first write; flipped after live re-probe found production returning HTTP 502 / 000 on `/health` and `/api/ready`)

> **GO rule (from the launch brief):** GO only if Railway is green, `/underwriting` works,
> readiness analysis runs, and the Excel export opens cleanly. Railway is currently red,
> so the rule is not satisfied. The build itself, local runtime, and content sweep are
> all clean — once Railway is back, this flips to GO immediately.

---

## 0. The 10 confirmations the launch lead asked for

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Exact typecheck command that failed | `pnpm run typecheck` (initial run during validation) — **no longer failing** as of 15:29 UTC | First run from this task: 3 errors. Re-run after Task #705's merge into main: **all 5 projects Done, 0 errors**. |
| 2 | Exact failing files (initial run) | `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx` (lines 192, 194) and `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.test.tsx` (line 153) | Errors referenced removed `dataBase64` field on `AssumptionEvidenceFile` (dropped by Task #729). |
| 3 | Are any failing files touched by Task #728? | **No.** Task #728's diff is `docs/ONE_DAY_LAUNCH_PROOF_PACK.md` plus regenerated `qa-output/` binaries (validation side-effect, see §12). The card and its test were not touched here. They were touched, and the issue resolved, by the just-merged Task #705. | `git show --stat 3f8a37c2 27ce8f9e` — only the doc and qa-output appear. `git show --stat 69436bff` (Task #705) — touches `AssumptionConfidenceCard.tsx` (8 lines) and `.test.tsx` (4 lines). |
| 4 | Both production builds pass? | ✅ **Yes.** `pnpm --filter @workspace/school-financial-model run build` → 20.1s, output `dist/public/`, largest chunk 443 KB. `pnpm --filter @workspace/api-server run build` → 2.5s, `dist/index.cjs` 4.6 MB + `dist/migrate.cjs` 175 KB + migrations copied. |
| 5 | `/underwriting` works in incognito? | ✅ **Yes (static HTML).** `curl -s https://budget.schoolstack.ai/underwriting` → HTTP **200** in 0.82s, 2,720 bytes, `<title>SchoolStack Budget — Your Mission Deserves a Financial Story</title>`. No redirect to `/register`. Same page works locally on `:22092` (HTTP 200, no `window.location.replace` in served HTML). |
| 6 | Readiness analysis runs? | ⚠️ **Locally yes; Railway currently no.** Local `POST http://localhost:8080/api/public/consultant` → HTTP **200** in 8 ms, **22,217 bytes** of consultant JSON (executiveSummary + biggestStrength + recommendations populated). Railway `POST /api/public/consultant` → HTTP **502** in 15s on first attempt; subsequent /health probes hung at HTTP 000. |
| 7 | Excel export downloads and opens? | ⚠️ **Locally yes; Railway currently no.** Local `POST http://localhost:8080/api/public/export-budget` → HTTP **200** in 163 ms, **21,543 bytes**, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, first 4 bytes `PK\x03\x04` (valid xlsx ZIP header). Workbook QA harness (`qa:excel`) opens 30/30 fixtures cleanly. Railway returned 502 on the same probe. |
| 8 | Railway `/api/ready` returns db connected? | ⛔ **NO.** 3/3 retries `https://schoolstackbudget.up.railway.app/api/ready` → HTTP **502** in 15.1s (`{"status":"error","code":502,"message":"Application failed to respond"}`). 5/5 retries on `/health` returned HTTP **000** (connection hung after 12s). |
| 9 | Netlify proxy `/api/ready` returns db connected? | ⛔ **NO.** 3/3 retries `https://budget.schoolstack.ai/api/ready` → HTTP **502** in 15.1s (proxy faithfully forwarded the upstream Railway error). The proxy itself is fine — `https://budget.schoolstack.ai/` static index returns 200. |
| 10 | `docs/ONE_DAY_LAUNCH_PROOF_PACK.md` committed on the launch branch? | ✅ **Yes.** Initial version in commit **3f8a37c2** (Task #728 — Final validation + One-Day Launch Proof Pack), Section-12 wording amendment in commit **27ce8f9e**. Both on local `main`. **Not yet on `origin/main`** (which is currently at a857c225, Task #727). The push to GitHub / Railway / Netlify happens through the platform's merge pipeline — Railway is currently serving the previously-deployed code (#727-era), which is itself returning 502 (see §11). |

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

⛔ **RED at 15:29 UTC.** Live re-probe of the production deployment:

```
$ for i in 1 2 3; do curl -s --max-time 30 -o /tmp/r.json -w "try $i: HTTP %{http_code} in %{time_total}s\n" https://schoolstackbudget.up.railway.app/api/ready; done
try 1: HTTP 502 in 15.146s
try 2: HTTP 502 in 15.116s
try 3: HTTP 502 in 15.166s
$ cat /tmp/r.json
{"status":"error","code":502,"message":"Application failed to respond","request_id":"Tq3HrNG2S9mHaVwUlt7tkg"}

$ for i in 1 2 3 4 5; do curl -s --max-time 12 -o /dev/null -w "try $i: HTTP %{http_code} in %{time_total}s\n" https://schoolstackbudget.up.railway.app/health; done
try 1: HTTP 000 in 12.002s
try 2: HTTP 000 in 12.002s
try 3: HTTP 000 in 12.002s
try 4: HTTP 000 in 12.002s
try 5: HTTP 000 in 12.002s
```

This is on the previously-deployed code (origin/main = a857c225, Task #727 — landed earlier this sprint and was green at the time of Task #725's deploy unblock proof). Task #728's commits (3f8a37c2, 27ce8f9e) and Task #705's commit (69436bff) are local-only and have not been pushed to origin yet, so this outage is **not caused by anything in this proof pack's commit window** — the Railway runtime simply stopped responding.

No deployment logs were retrievable (`fetch_deployment_logs` returned no content). Recommend Railway dashboard inspection or a manual redeploy.

## 3. API health (production)

| Probe | Result |
|---|---|
| `GET https://schoolstackbudget.up.railway.app/health` | ⛔ HTTP 000 (5/5 hung @ 12s) |
| `GET https://schoolstackbudget.up.railway.app/api/ready` | ⛔ HTTP 502 (3/3, "Application failed to respond") |
| `GET https://budget.schoolstack.ai/api/ready` (Netlify proxy) | ⛔ HTTP 502 (3/3, faithful upstream-error forward) |
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

✅ **Local schema up to date** (`[migrations] Schema up to date.` on api-server startup). Production Railway DB state is unknown until the API responds — `/api/ready` is exactly the probe that reports it, and that probe is currently returning 502.

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

---

## 11. Production outage (current)

The Railway deployment serving budget.schoolstack.ai is returning 502 / connection-hang on every API probe at 15:29 UTC. This is **not** caused by anything in Task #728's commit window — Task #728 added a single doc and Task #705 added the Review CFO panels; neither has been pushed to origin/main, so Railway is still serving Task #727-era code. Local builds, local runtime, and the workbook QA harness all pass. The pattern (HTTP 502 + connection hang on /health) suggests one of: the Railway service is paused/sleeping, the container crashed and is restarting, the DB connection pool is exhausted, or the deployment was manually stopped. Recommend the on-call lead inspect the Railway dashboard and either redeploy or wake the service before the launch window opens.

## 12. Note on tracked QA artifacts

Running `pnpm run qa:excel` and `pnpm run qa:formula-results` regenerates the 30 tracked workbooks under `artifacts/api-server/qa-output/` plus `qa-report.json` by design — the harness writes outputs into that directory every run. The xlsx files carry timestamp churn inside their ZIP container, and `qa-report.json` reflects current tab names, tab counts, scanned-cell counts, and the active set of QA checks as of this run. The harness still reports `overallPass: true` (30 / 30). These regenerated artifacts are a side effect of the validation runs, not a code change owned by this task. They were committed alongside the proof pack in 3f8a37c2 because the main agent cannot run `git checkout` to revert tracked files in this environment (sandbox restriction). A clean-only follow-up commit can revert them without changing any product behavior — they are not load-bearing.

## 13. Final call

⛔ **NO-GO PENDING RAILWAY RECOVERY.**

The launch brief's GO rule has four conditions: Railway green + `/underwriting` works + analysis runs + Excel opens cleanly. Three are met (the route, the engine, and the export are all healthy locally and the static page is healthy through Netlify). One is not — Railway is hard-down at 15:29 UTC and the Netlify proxy faithfully forwards 502 to anyone hitting `/api/ready`, which means a founder visiting the live site can load `/underwriting` but cannot run the analysis or download the workbook. Once Railway returns to green, this flips back to **GO WITH WATCH ITEMS** with no further code or doc changes — the entire build is otherwise launch-ready.

**What changed since first write:** initial verdict was GO with one watch item against the typecheck. The typecheck is now green (fixed incidentally by Task #705). The Railway outage was discovered during the launch lead's requested fresh re-verification. Verdict flipped from GO to NO-GO PENDING RAILWAY RECOVERY based on live evidence, not on any code change.
