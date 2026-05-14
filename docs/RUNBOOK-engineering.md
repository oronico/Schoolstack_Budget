# Budget — Engineering Runbook

> Institutional memory for the engineering team behind SchoolStack Budget (the `school-financial-model` artifact and its supporting services). Onboarding new engineers, debugging incidents, planning changes — start here.

Last updated: May 2026.

---

## 1. What Budget actually is

Budget is a full-stack pnpm-monorepo application that turns a non-financial school founder's plain-language inputs into a 5-year, lender-grade financial model and a suite of export artifacts.

The product surface is the `artifacts/school-financial-model` web app. The math, exports, persistence, and integrations live in `artifacts/api-server`. Both are TypeScript.

| Layer | Where it lives | Stack |
| --- | --- | --- |
| Web client (wizard, dashboards, exports) | `artifacts/school-financial-model` | React, Vite, Tailwind v4, Wouter |
| API + math + exports | `artifacts/api-server` | Node, Express 5, Drizzle ORM, ExcelJS, PDFKit |
| Database | Replit-managed Postgres | Drizzle migrations in `lib/db/` |
| Shared finance library | `lib/finance` (`@workspace/finance`) | Canonical constants, loan amortization, finance helpers |
| Shared schema / contracts | `lib/db/`, `lib/openapi/` (when applicable) | Drizzle schema, OpenAPI types |
| E2E tests | `artifacts/school-financial-model/e2e/` | Playwright (chromium today, firefox + webkit in CI matrix) |
| Vitest tests | `artifacts/api-server/tests/`, `artifacts/school-financial-model/src/__tests__/` | Vitest |

### Revenue terminology contract

This is the single most-violated invariant in the codebase. Code, copy, and audits must keep these three layers separate (already in `replit.md`):

1. **Seat price × Students = Gross educational program value.** "Tuition" here = posted seat price. NOT a revenue source.
2. **Revenue Sources** (what actually pays for the seat — mix varies per child): family-paid tuition, ESA / voucher / scholarship, public per-pupil funding, philanthropy / grants, other revenue.
3. **Expected Cash** = Revenue Sources adjusted for collection rate and timing.

Never sum gross tuition and ESA/voucher revenue for the same child without an explicit offset. Never call accrual revenue "cash" or expected cash "revenue."

---

## 2. The end-to-end user flow

```
Sign up  →  Verify email  →  Pick school type / stage
       →  12-step wizard  →  Real-time review  →  Consultant analysis
       →  Lender narrative  →  Export (PDF / Excel)
```

Wizard step files live in `artifacts/school-financial-model/src/pages/model-wizard/`. The wizard is **dynamic** — step visibility and copy adapt to school type (charter, private, microschool, learning lab) and stage (startup vs. operating).

The 12 canonical steps:

1. Story
2. School Details
3. Enrollment
4. Revenue
5. Staffing
6. Expenses
7. Capital & Financing
8. Assumptions & Evidence
9. Real-Time Review
10. Consultant Analysis
11. Lender Narrative
12. Export

When you change a step, also update:

- The wizard smoke specs (`e2e/wizard-smoke-six-paths.spec.ts`, `e2e/wizard-smoke-matrix-grouping.spec.ts`) — they walk all 12 steps.
- The consultant engine inputs if the step writes new fields.
- The export builders if the step produces new outputs.

---

## 3. The five export artifacts

| Artifact | Builder | Format | Notes |
| --- | --- | --- | --- |
| Lender Packet | `artifacts/api-server/src/lib/packets/build-lender-packet.ts` | PDF (PDFKit) | 20+ sections. Evidence-anchored. Deterministic commentary from `consultant-engine`. |
| Underwriting Workbook | `artifacts/api-server/src/lib/underwriting-workbook.ts` | Excel (ExcelJS) | 26 tabs. **Every cell formula-linked, zero hardcoded.** |
| Board Packet | `artifacts/api-server/src/lib/packets/build-board-packet.ts` | PDF | Governance framing. Action items for non-financial trustees. |
| Loan Readiness Scorecard | `artifacts/api-server/src/lib/loan-readiness-*.ts` | PDF | 7 dimensions, Strong / Adequate / Needs Work. |
| Decision Comparison | `artifacts/api-server/src/lib/packets/build-decision-comparison-pdf.ts` | PDF | Side-by-side scenarios against the 5-year trough. |

### Cross-engine parity

The PDF, the Excel, and the on-screen review must reconcile to the same numbers. The `test:export-reconciliation` and `test:cross-engine` test suites enforce this. **If you're tempted to compute a number two different ways in two different places, stop and route both call sites through the shared finance helper instead.**

### Founder Planning Workbook + Single-Year shape

Smaller exports for the lean / quick-start path:

- 3-tab public wizard workbook
- 8-tab Lender Pro Forma
- Single-year operating budget (`test:single-year-workbook-shape`)

### Canonical filenames

All exports use a `SchoolName_<artifact>.<ext>` convention. Enforced by `e2e/export-canonical-filenames.spec.ts` — do not bypass.

---

## 4. The "smart" features

Where the magic-feeling things actually live:

| Feature | Path | Why it matters |
| --- | --- | --- |
| Just-in-time micro-lessons | `artifacts/school-financial-model/src/lib/coaching/micro-lessons.ts` | Coaching cards fire on data triggers, not page loads. Add new lessons by adding a trigger predicate + body. |
| Founder persona system | `artifacts/school-financial-model/src/lib/coaching/founder-persona.ts` | Tone shifts between "New to budgeting" and "Comfortable." Don't fork copy elsewhere — extend the persona table. |
| Consultant engine | `artifacts/api-server/src/lib/consultant-engine.ts` | Deterministic narrative generation. NOT an LLM. Rules + thresholds. Auditable. |
| Scenario engine | search `scenario-engine` in `artifacts/api-server/src/lib/` | Lever flips (enrollment, wage inflation, collection rate) feed DSCR / DCOH live. |
| Assumption confidence | `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx` | Estimate / Quote / Signed Contract tagging. Surfaces in the lender packet. |
| Demo / seed flows | `artifacts/api-server/src/lib/demo*` and `tests/charter-demo-end-to-end.ts`, `non-charter-demos-end-to-end.ts` | Applicants explore fully populated demo schools before touching their own numbers. |

---

## 5. Sensitive data, audit, encryption

This system handles EIN, SSN, banking tokens, etc. Three layers protect them:

1. **Sensitive encryption** — `artifacts/api-server/src/lib/sensitive-encryption.ts`. Wraps a per-row DEK in a KEK; KEK rotation is supported (`scripts/rotate-sensitive-encryption-key.ts`). Keys come from `SENSITIVE_ENCRYPTION_KEY` (active) and a previous-keys list.
2. **Audited decryption wrapper** — `decryptSensitiveAndAudit`. Every decrypt writes a redacted audit row. There is a static guard that fails CI if any code calls raw `decryptSensitive` outside the wrapper. **Known exception:** `scripts/rotate-sensitive-encryption-key.ts` is the rotator and intentionally calls the raw primitive; the static guard currently flags it (`api-tests` red), and the carve-out has not yet been added. Address in a future task.
3. **Audit-log redaction** — `artifacts/api-server/src/lib/audit-log.ts` strips `storageRef`, `passwordHash`, `*Token`, `ein`, `ssn`, etc. before persisting. Static guard prevents anyone from inserting into `auditLogTable` outside this module.

`tests/no-tls-reject-unauthorized.ts` scans the entire repo on every CI run for `NODE_TLS_REJECT_UNAUTHORIZED=0` bypasses. Do not add one.

---

## 6. Local development

```bash
# bootstrap
pnpm install

# run everything (workflows are configured in .replit)
# These are managed via Replit Workflows; restart from the workspace UI.
#  - artifacts/api-server: API Server     (port 8080)
#  - artifacts/school-financial-model: web (vite, $PORT)
#  - artifacts/mockup-sandbox: Component Preview Server
#  - typecheck, test, e2e, api-tests as needed

# point the web app at a local API (default already)
VITE_API_PROXY_TARGET=http://127.0.0.1:8080 pnpm --filter @workspace/school-financial-model dev
```

The api-server **must** be on `127.0.0.1:8080` for the vite dev proxy to work. Vite logs `ECONNREFUSED 127.0.0.1:8080` if it isn't.

### Useful filtered commands

```bash
pnpm --filter @workspace/api-server run test            # full api-server test grid
pnpm --filter @workspace/school-financial-model run test # vitest, ~1500 tests
pnpm run typecheck                                       # repo-wide tsc --build
pnpm --filter @workspace/school-financial-model run test:e2e:smoke   # 13 chromium smoke specs
```

The `e2e` workflow wraps `test:e2e:smoke` with `scripts/e2e-with-crash-detection.sh`, which tees logs and greps for `[FATAL]` lines + queries the `error_logs` table for `process_crash` rows since the run started. A green run from that wrapper means the api-server stayed healthy end-to-end.

---

## 7. Cross-browser Playwright matrix (CI)

`playwright.config.ts` defines three projects: `chromium`, `firefox`, `webkit`. The `snapshotPathTemplate` is `{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}` so a single Linux baseline serves all three browsers — no per-browser snapshot duplication.

GitHub Actions (`.github/workflows/playwright-cross-browser.yml`) runs the smoke suite as a matrix across all three browsers on `ubuntu-latest`, `fail-fast: false`. Reports + traces upload on failure.

**Local limitation:** Firefox and WebKit cannot launch on the Replit Nix container (`libgtk`, `libatk` missing). Locally only chromium runs. Cross-browser signal comes from the CI run.

If the e2e workflow starts trying all three browsers and dying locally, gate `test:e2e:smoke` to `--project=chromium` by default and let CI override.

---

## 8. Workflows / CI status (current)

| Workflow | Status | Notes |
| --- | --- | --- |
| `typecheck` | green | Runs `tsc --build` across all artifacts. |
| `test` | green | Vitest, ~1559 tests. |
| `e2e` | green | 13 chromium smoke specs, ~3 min. |
| `api-tests` | **red** | Pre-existing failure: decrypt-sensitive-audit-wrapper static guard flags `scripts/rotate-sensitive-encryption-key.ts`. Tracked separately. |
| `playwright-cross-browser` (GH Actions) | new | Will fire on first push; cross-browser breakages surface here. |

---

## 9. Common pitfalls — where the bodies are buried

- **Revenue terminology.** See section 1. If a number is "wrong by a factor of two," look for double-counted ESA + tuition before anything else.
- **Cross-engine parity.** Don't recompute. Route through the shared helper. There's a parity test that will catch you.
- **Audit logs leaking PII.** Use `recordAuditLog` from `lib/audit-log.ts`. The static guard blocks raw `db.insert(auditLogTable)` calls.
- **TLS.** Never `NODE_TLS_REJECT_UNAUTHORIZED=0`. The scanner runs in CI.
- **Snapshot file naming.** With the new template, baselines look like `<arg>-linux.png` (no `chromium` segment). When you add a new screenshot test, generate the baseline once on Linux and commit it; it covers all three browsers.
- **Wizard step changes.** Update both smoke specs and the consultant engine. Don't add a step without thinking through how it propagates to exports.
- **Email sending in tests.** Resend rejects `@e2e.schoolstack.test` addresses; that's expected and is logged as `validation_error`. Not a real failure.

---

## 10. Where to learn more

- `replit.md` — product overview, brand system, terminology contract.
- `artifacts/school-financial-model/src/pages/` — every page the user sees.
- `artifacts/api-server/src/lib/packets/` — every export builder.
- `artifacts/api-server/src/lib/consultant-engine.ts` — the deterministic narrative engine.
- `lib/finance/` — canonical financial constants and amortization.
- `docs/RUNBOOK-lending-lab.md` — operational runbook for the Lending Lab program.

When in doubt: read the test for the thing you're changing first. The test names describe the contract.
