# Budget — Engineering Runbook

> Institutional memory for the engineering team behind SchoolStack Budget. Onboarding new engineers, debugging incidents, planning changes — start here. Every fact below was verified against the codebase as of the last update.

Last verified: May 2026.

---

## 1. What Budget actually is

Budget is a TypeScript pnpm monorepo. The product surface is the `school-financial-model` web app. The math, exports, persistence, and integrations live in `api-server`. The deck and sandbox artifacts are dev/internal-only.

| Layer | Where it lives | Stack |
| --- | --- | --- |
| Web client (wizard, dashboards, exports) | `artifacts/school-financial-model` | React 19, Vite 7, Tailwind v4, Wouter |
| API + math + exports | `artifacts/api-server` | Node, Express 5, Drizzle ORM, ExcelJS, PDFKit |
| Component preview / mockup playground | `artifacts/mockup-sandbox` | Vite — dev-only, not deployed |
| Executive deck (this product's pitch) | `artifacts/budget-exec-deck` | Vite slides — dev-only, not deployed |
| Database | Replit-managed Postgres | Drizzle migrations in `lib/db/drizzle/` |
| Shared finance library | `lib/finance` (`@workspace/finance`) | Canonical constants, amortization, scenario engine |
| Shared schema / contracts | `lib/db/`, `lib/api-zod/` (generated OpenAPI types) | Drizzle schema; Zod-typed API client |
| React-side API client | `lib/api-client-react/` | TanStack Query + `lib/api-zod` types |
| Tenant scoping | `lib/tenant/` | Per-account isolation helpers |
| E2E tests | `artifacts/school-financial-model/e2e/` | Playwright (chromium locally; firefox + webkit in CI) |
| Vitest tests | `artifacts/api-server/tests/`, `artifacts/school-financial-model/src/__tests__/` | Vitest |

### Revenue terminology contract

This is the single most-violated invariant. Code, copy, and audits must keep these three layers separate (also documented in `replit.md`):

1. **Seat price × Students = Gross educational program value.** "Tuition" here = posted seat price. NOT a revenue source.
2. **Revenue Sources** (what actually pays for the seat — mix varies per child): family-paid tuition, ESA / voucher / scholarship, public per-pupil funding, philanthropy / grants, other revenue.
3. **Expected Cash** = Revenue Sources adjusted for collection rate and timing.

Enforced in code in `lib/finance/src/revenue-source-mix.ts` and `lib/finance/src/monthly-cash-flow.ts`. Never sum gross tuition and ESA/voucher revenue for the same child without an explicit offset. Never call accrual revenue "cash" or expected cash "revenue."

---

## 2. The wizard

Step order lives in the `STEPS` array under `artifacts/school-financial-model/src/pages/model-wizard/`. The standard pathway is 12 steps. The names below are the actual strings in the code — use these in copy, not paraphrases.

1. Story
2. School Details
3. Enrollment
4. Revenue
5. Staffing
6. Expenses
7. Capital & Financing
8. **Assumptions & Sensitivity** (not "Assumptions & Evidence")
9. **Review** (not "Real-Time Review")
10. **Consultant** (not "Consultant Analysis")
11. Lender Narrative
12. Export

### Variants

The wizard is dynamic. Two variants in production:

- **Actuals pathway** — when `wizardPathway === 'actuals'`, an extra **Actuals Intake** step is inserted between Story and School Details (so 13 steps total). Used by operating schools loading historicals.
- **Chesterton variant** — 14 steps total: inserts **Fundraising Goals**, **Gift Chart**, and **Recruiting**, replacing standard Enrollment and Staffing. Triggered by school-config flags; see `artifacts/api-server/src/lib/packets/chesterton-operating-manual.ts` for the matching export.

When you change a step or add a variant:

- Update the wizard smoke specs (`e2e/wizard-smoke-six-paths.spec.ts`, `e2e/wizard-smoke-matrix-grouping.spec.ts`).
- Update the consultant engine inputs if the step writes new fields.
- Update the export builders if the step produces new outputs.
- Update the canonical step list above and in `docs/RUNBOOK-lending-lab.md`.

---

## 3. The export builders

Five lender-grade exports plus a few targeted variants. **Verified file paths:**

| Artifact | File | Format | Notes |
| --- | --- | --- | --- |
| Lender Packet | `artifacts/api-server/src/lib/packets/build-lender-packet.ts` | PDF | 20+ sections. Evidence-anchored. Deterministic commentary from `consultant-engine`. |
| Underwriting Workbook | `artifacts/api-server/src/lib/underwriting-workbook.ts` | Excel | **26 tabs.** Every cell formula-linked, zero hardcoded. |
| Board Packet | `artifacts/api-server/src/lib/packets/build-board-packet.ts` | PDF | Governance framing. Action items for non-financial trustees. |
| Loan Readiness Scorecard | `artifacts/api-server/src/lib/pdf-loan-readiness.ts` | PDF | 7-dimension verdict, Strong / Adequate / Needs Work. |
| Decision Comparison | `artifacts/api-server/src/lib/packets/decision-comparison-pdf.ts` | PDF | Side-by-side scenarios against the 5-year trough. |

### Other exports worth knowing about

- **Lender Pro Forma** — `artifacts/api-server/src/lib/lender-proforma-export.ts` (10-tab Excel for the Quick-Start path).
- **Formula Export** — `artifacts/api-server/src/lib/formula-export.ts` (auditor-style raw formula dump).
- **Chesterton Operating Manual** — `artifacts/api-server/src/lib/packets/chesterton-operating-manual.ts` (variant-specific PDF).

### Underwriting Workbook tab count — how the 26 breaks down

23 direct `addWorksheet` calls in `underwriting-workbook.ts` plus 3 sheets contributed by imported builders:

- `addInstructionsSheet`
- `addDashboardSheet`
- `addDecisionHistorySheet` (from `packets/build-decision-history.ts`)

Plus a couple of conditional sheets (Plain-English Summary when founder-summary is enabled; Debt Schedule when debt is present — see Task #780). Total **= 26** in the standard build.

### Cross-engine parity

The PDF, the Excel, and the on-screen review must reconcile. Enforced by:

- `test:export-reconciliation`
- `test:cross-engine`
- `test:single-year-workbook-shape`

(All defined as scripts in `artifacts/api-server/package.json`.)

If you're tempted to compute a number two different ways in two different places, stop and route both call sites through `lib/finance` instead.

### Canonical filenames

All exports use a `<SchoolName>_<artifact>.<ext>` convention. Enforced by `artifacts/school-financial-model/e2e/export-canonical-filenames.spec.ts` — do not bypass.

---

## 4. The "smart" features — verified paths

| Feature | Path | Why it matters |
| --- | --- | --- |
| Just-in-time micro-lessons | `artifacts/school-financial-model/src/lib/coaching/micro-lessons.ts` | Coaching cards fire on data triggers, not page loads. Add new lessons via a trigger predicate + body. |
| Founder persona system | `artifacts/school-financial-model/src/lib/coaching/founder-persona.ts` | Tone shifts between "New to budgeting" and "Comfortable." Don't fork copy elsewhere — extend the persona table. |
| Consultant engine | `artifacts/api-server/src/lib/consultant-engine.ts` | Deterministic narrative generation. NOT an LLM. Rules + thresholds. Fully auditable. |
| Scenario engine | `lib/finance/src/decision-engine/scenario-engine.ts` | Lever flips (enrollment, wage inflation, collection rate) feed DSCR / DCOH live. |
| Assumption confidence | `artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx` | Estimate / Quote / Signed Contract tagging. Surfaces in the lender packet. |
| Demo / seed flows | `artifacts/api-server/tests/charter-demo-end-to-end.ts`, `non-charter-demos-end-to-end.ts`, `src/lib/demo*` | Applicants explore fully populated demo schools before touching their own numbers. |

---

## 5. Sensitive data, audit, encryption

This system handles EIN, SSN, banking tokens. Three layers protect them:

1. **Sensitive encryption** — `artifacts/api-server/src/lib/sensitive-encryption.ts`. Per-row DEK wrapped in a KEK; rotation is supported via `artifacts/api-server/src/scripts/rotate-sensitive-encryption-key.ts`. Active key from `SENSITIVE_ENCRYPTION_KEY`; previous keys via the previous-keys list.
2. **Audited decryption wrapper** — `decryptSensitiveAndAudit` in `artifacts/api-server/src/lib/decrypt-sensitive-and-audit.ts`. Every decrypt writes a redacted audit row. A static guard fails CI if any code calls raw `decryptSensitive` outside the wrapper. **Known carve-out:** the rotator script intentionally calls the raw primitive; the static guard does not yet exempt it, so `api-tests` is currently red on that one check. Tracked separately — do not "fix" by relaxing the guard.
3. **Audit-log redaction** — `artifacts/api-server/src/lib/audit-log.ts` strips `storageRef`, `passwordHash`, `*Token`, `ein`, `ssn`, etc. before persisting. A static guard prevents anyone from inserting into `auditLogTable` outside this module.

`artifacts/api-server/tests/no-tls-reject-unauthorized.ts` scans the entire repo on every CI run for `NODE_TLS_REJECT_UNAUTHORIZED=0` bypasses. Do not add one.

### Cyber incident response — who to call

If you suspect a breach, ransomware, data exfiltration, or any incident that could trigger a cyber-liability claim, **notify the carrier before doing any cleanup that destroys forensic state** (don't wipe disks, rotate keys-in-place without snapshots, or delete logs until Coalition's IR team has triaged).

| What | Who / How |
| --- | --- |
| Insurance broker | Howard Insurance |
| Cyber liability carrier | Coalition |
| 24/7 incident hotline | **1-833-866-1337** |
| Claims email | claims@coalitioninc.com |
| Policy number | **C-4LPX-254165-CYBER-2025A** |

Order of operations in a suspected incident:

1. Page the on-call engineer; do not discuss publicly.
2. Call the Coalition hotline (above) and quote the policy number. They will assign an incident response lead.
3. Preserve evidence: snapshot the affected database, copy `error_logs` and audit-log rows, save container logs. Coalition's IR team decides what to wipe and when.
4. Only after IR triage: rotate `SENSITIVE_ENCRYPTION_KEY`, `JWT_SECRET`, and any leaked third-party tokens. Use the rotator script in `artifacts/api-server/src/scripts/rotate-sensitive-encryption-key.ts`; key-rotation failures auto-page via Task #871/#883/#884 (see admin dashboard banner).
5. Loop in the broker (Howard Insurance) once the claim is open so they can coordinate coverage.

---

## 6. Local development

```bash
# bootstrap
pnpm install

# Workflows are managed via Replit Workflows (.replit). Restart from the workspace UI.
#  - artifacts/api-server: API Server     (port 8080)
#  - artifacts/school-financial-model: web (vite, $PORT)
#  - artifacts/mockup-sandbox: Component Preview Server
#  - artifacts/budget-exec-deck: web      (the slides app)
#  - typecheck, test, e2e, api-tests as needed
```

The api-server **must** be on `127.0.0.1:8080` for the vite dev proxy to work. Vite logs `ECONNREFUSED 127.0.0.1:8080` if it isn't.

### Useful filtered commands

```bash
pnpm --filter @workspace/api-server run test                          # full api-server test grid
pnpm --filter @workspace/school-financial-model run test               # vitest, ~1500 tests
pnpm run typecheck                                                     # repo-wide tsc --build
pnpm --filter @workspace/school-financial-model run test:e2e:smoke     # 13 chromium smoke specs
```

The `e2e` workflow wraps `test:e2e:smoke` with `scripts/e2e-with-crash-detection.sh`, which tees logs and greps for `[FATAL]` lines plus queries the `error_logs` table for `process_crash` rows since the run started. A green run from that wrapper means the api-server stayed healthy end-to-end.

---

## 7. Cross-browser Playwright matrix (CI)

`artifacts/school-financial-model/playwright.config.ts` defines three projects: `chromium`, `firefox`, `webkit`. The `snapshotPathTemplate` is:

```
{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}
```

So a single Linux baseline serves all three browsers — no per-browser snapshot duplication.

GitHub Actions: `.github/workflows/playwright-cross-browser.yml` runs the smoke suite as a matrix across all three browsers on `ubuntu-latest`, `fail-fast: false`. Reports + traces upload on failure.

**Local limitation:** Firefox and WebKit cannot launch on the Replit Nix container (`libgtk`, `libatk` missing). Locally only chromium runs. Cross-browser signal comes from the GH Actions run.

**Heads-up — pushing this workflow file requires the `workflow` OAuth scope on the Replit ↔ GitHub connection.** If a push fails with `refusing to allow an OAuth App to create or update workflow ... without 'workflow' scope`, reconnect GitHub from Replit's Git pane and grant the workflow permission.

---

## 8. Workflows / CI status (current)

| Workflow | Status | Notes |
| --- | --- | --- |
| `typecheck` | green | Runs `tsc --build` across all artifacts. |
| `test` | green | Vitest, ~1559 tests. |
| `e2e` | red | Recently failing. Investigate via `scripts/e2e-with-crash-detection.sh` output. May relate to merged TLS rule changes. |
| `api-tests` | red | Pre-existing — decrypt-audit-wrapper static guard flags `src/scripts/rotate-sensitive-encryption-key.ts`. Carve-out not yet implemented. |
| `playwright-cross-browser` (GH Actions) | new | Cross-browser breakages surface here. |

---

## 9. Common pitfalls — where the bodies are buried

- **Revenue terminology.** See section 1. If a number is "wrong by a factor of two," look for double-counted ESA + tuition before anything else.
- **Cross-engine parity.** Don't recompute. Route through `lib/finance`. There's a parity test that will catch you.
- **Wizard step names drift.** Code names are `Assumptions & Sensitivity`, `Review`, and `Consultant` — not the longer marketing variants. Marketing copy can paraphrase; code, tests, and the underwriting checklist must use the actual names.
- **Variant-aware testing.** Adding a step? Run all wizard variants — actuals + Chesterton — through the smoke specs, not just the standard pathway.
- **Audit logs leaking PII.** Use `recordAuditLog` from `lib/audit-log.ts`. The static guard blocks raw `db.insert(auditLogTable)` calls.
- **TLS.** Never `NODE_TLS_REJECT_UNAUTHORIZED=0`. The scanner runs in CI.
- **Snapshot file naming.** With the new template, baselines look like `<arg>-linux.png` (no `chromium` segment). When you add a new screenshot test, generate the baseline once on Linux and commit it; it covers all three browsers.
- **Email sending in tests.** Resend rejects `@e2e.schoolstack.test` addresses; that's expected and is logged as `validation_error`. Not a real failure.
- **Big binaries in `attached_assets/`.** `attached_assets/**/*.{zip,pdf,docx,pptx,mp4,mov}` is gitignored. Don't commit large binaries — Railway and other deploys OOM.

---

## 10. Where to learn more

- `replit.md` — product overview, brand system, terminology contract.
- `artifacts/school-financial-model/src/pages/` — every page the user sees.
- `artifacts/school-financial-model/src/pages/model-wizard/` — the canonical wizard step list.
- `artifacts/api-server/src/lib/packets/` — every PDF export builder.
- `artifacts/api-server/src/lib/underwriting-workbook.ts` — the 26-tab Excel builder.
- `artifacts/api-server/src/lib/consultant-engine.ts` — the deterministic narrative engine.
- `lib/finance/src/decision-engine/scenario-engine.ts` — scenario lever math.
- `lib/finance/` — canonical financial constants, amortization, revenue-source mix.
- `docs/RUNBOOK-lending-lab.md` — operational runbook for the Lending Lab program.

When in doubt: read the test for the thing you're changing first. The test names describe the contract.
