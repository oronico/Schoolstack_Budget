# Overview

SchoolStack Budget is a full-stack web application designed for school founders to create comprehensive, lender-ready 5-year financial models. It guides educators through financial modeling, generating investor-grade Excel workbooks and PDF reports. The platform supports various school types and stages, aiming to provide clear financial planning for microschools, private schools, charter schools, pods, and co-ops. The project's vision is to empower school leaders with robust financial tools to ensure sustainability and attract investment.

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# System Architecture

## Brand System
The application adheres to the SchoolStack.ai brand system, using Amber (#D97706) as the parent brand accent, Evergreen (#328555) as the product-specific primary color, Deep Navy (#1E293B) for foregrounds, Teal (#0D9488) for accents, and Cream (#FAF9F7) for backgrounds. Typography includes Quicksand Bold for headings and Nunito Regular for body text.

## Technical Stack
The project is a pnpm workspace monorepo built with TypeScript.
- **Backend**: Node.js, Express 5 API server, PostgreSQL with Drizzle ORM.
- **Frontend**: React, Vite, Tailwind CSS v4.
- **Authentication**: JWT-based (7-day expiry, `auth_token` in localStorage).
- **Model Status Enum**: `draft`, `active`, `complete`, `archived` (defined in `ModelStatus` in OpenAPI spec).
- **Export Capabilities**: Utilizes ExcelJS for Excel exports (8-tab Lender Pro Forma, 3-tab public wizard, 21-tab full underwriting model) and PDFKit for PDF exports (lender packet, board packet, decision-comparison side-by-side), ensuring print-ready formatting and school-specific branding.
- **Monorepo Structure**: Organized into `artifacts/` for deployable applications, `lib/` for shared libraries, and `scripts/` for utilities.
- **Shared Finance Library** (`@workspace/finance`): Provides canonical financial constants and loan amortization functions for both frontend and backend.

## Core Features
### Universal Financial Model
Supports diverse school configurations with a 5-year projection, flexible programs & enrollment, comprehensive revenue models, FTE-based staffing, an expense model with flexible drivers, and capital & debt modeling. Includes contextual guidance, benchmark comparisons, and capacity warnings. Integrates smart expense escalation logic based on expense type (e.g., rent, per-student costs, fixed, % of revenue).

### Charter Revenue Streams
Offers specific support for charter schools including state per-pupil pre-fills, state-driven methodology badges, federal title funds, weighted funding rows, and CSP Grant line items.

### School Identity & Fundraising Intelligence
Includes logic for Catholic and faith-affiliated schools (diocese/parish subsidies, assessments) and fundraising intelligence for both non-profit and for-profit school types, with conditional schema fields and catalog items.

### Underwriter-Ready Evidence & Financial Intelligence
Operating schools can include prior-year actuals and an opening balance sheet. Features coaching banners (`lendingLabIntent`), facility phase tracking, and a ReviewStep showing Key Financial Indicators (breakeven enrollment, cash flow, prior-year variance). Balance sheet intelligence includes straight-line depreciation of fixed assets, dynamic accounts receivable projected from tuition revenue and collection delay, and current ratio covenant checks (BENCHMARK_CURRENT_RATIO = 1.1x).

### Coaching System (Kind Coaching Tone)
All in-app guidance uses a warm, school-leader-friendly coaching voice. Key principles: "Coach don't preach — be kind — give grace." Never uses lender jargon (no "red flag," "deal-breaker," "underwriters will flag") in coaching contexts. Uses "worth thinking about" or "worth watching" instead.
- **FinancingInsight** (Landmark icon): 10 curated instances across wizard steps providing practical financing context for school leaders.
- **InlineHelpCard**: Tabbed help cards with "Financing Insight" tab (renamed from lender perspective). All cards start collapsed by default (no auto-expand).
- **SectionExplainers**: Removed from main wizard step headers; coaching content is placed inline near relevant fields.
- **Diagnostics engine**: Kind coaching language with no team signatures.
- **Faith affirmation**: Conditional coaching card for faith-affiliated schools (Heart icon, teal).
- **Founder salary detection**: Triggers when leader has no salary in staffing.
- **Staffing guardrail**: Note when staffing exceeds 60% of revenue.
- **Insurance/payroll tax reminder**: Amber card in ExpenseStep.
- **GlossaryTerm tooltips**: `GlossaryTerm` component (`src/components/coaching/GlossaryTerm.tsx`) provides dotted-underline hover/tap tooltips for financial jargon. Terms defined in `src/lib/coaching/glossary.ts` (~20 entries: FTE, DSCR, COLA, FF&E, ADM, ADA, NNN, etc.). Applied across AssumptionsStep, StaffingStep, ReviewStep, FacilitiesStep, SchoolProfileStep, EnrollmentStep, RevenueStep, and ExpenseStep.
- **WizardPrepChecklist**: Pre-wizard modal with a 5-step "Here's what to expect" overview (no longer a checkable list); single "Let's get started" CTA and "living document" footer tagline. Mid-wizard encouragement banners at Steps 6/7 (post Story-step reorder).
- **Story-first wizard (11 steps)**: Story → School Details → Assumptions → Enrollment → Revenue → Staffing → Expenses → Review → Consultant → Lender Narrative → Export. Story step (StoryStep.tsx) collects school name, school type, opening story, and founding-question chips, with `WhyThisMatters` callouts on every data step and `IDontKnowYet` affordances where founders commonly stall (Enrollment programs). The Lender Narrative pre-fills mission from the Story's opening narrative.
- **Wizard step migration**: Models created before the Story step shipped get a one-time `currentStep + 1` bump on first load; the bump is gated by a per-model `wizard:storyMigration:<id>` localStorage marker that is also pre-set at `dashboard.handleCreate` and carried forward by `handleDuplicate`, so brand-new models are never bumped.
- Lender-specific language is preserved ONLY in: ExportStep, LenderPacketPreview, Lender Packet API output, ConsultantAnalysisView `lenderReadiness`, landing/dashboard product descriptions, and Footer.

### Ratio-Driven Staffing Ramp
Staffing can be `fixed` or `ratio`-based, where FTE is computed from enrollment ÷ studentRatio, ceiled to nearest 0.5.

### Expert Review Service
Prominent "Get a Free Expert Review" cards on both authenticated and public Export steps invite users to request personalized model feedback. The consultant analysis view includes a contextual nudge linking to the review request. Review requests generate structured Advisor Briefs (HTML email with priority tagging) sent to `REVIEW_NOTIFY_EMAIL` via Resend. The brief includes:
- **School Profile**: Name, location (city + state), type, entity, stage, opening year, max capacity, enrollment trajectory, faith affiliation.
- **Facility & Financing**: Ownership type, monthly rent, existing loans, financing interest level, staff count, staffing % of revenue (flagged red if >65%).
- **Financial Snapshot**: Y1–Y5 revenue/expenses/net income/DSCR table, break-even year, margins.
- **Risk Assessment**: Top 5 critical findings from consultant engine.
- **Lending Readiness**: Reserve months, cash runway, days cash on hand.
Authenticated review requests auto-create a shared link for the advisor. Public wizard users can also request reviews via `POST /api/public/request-review` (rate-limited, validated). Both flows send the same enriched data.

### Shareable Read-Only Links
Founders can generate unguessable share links (`/shared/:token`) for interactive viewing of their financial model by third parties without requiring a login. These links are revocable and display key financial summaries and metrics.

### API Server (`api-server`)
Manages authentication, CRUD for financial models, analytics, feedback, and orchestrates all export formats. Includes PostgreSQL-backed rate limiting and hardened CORS.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- Authentication required before entering the wizard. All entry points ("Start My Financial Plan", "Get Started", footer links) redirect to `/register`. The old `/underwriting` public wizard route redirects to `/register`.
- Authentication pages and a dashboard for model lifecycle management.
- A 10-step authenticated wizard covering Profile, Assumptions, Enrollment, Revenue, Staffing, Expenses, Review, Consultant, Narrative, and Export.
- **Non-linear wizard navigation**: Users can skip to any step (1–6) freely. Steps 7+ (Review, Consultant, Narrative, Export) require core fields (school name, state, type, enrollment, revenue source, staff role) to be filled first. Users are told exactly which fields are missing.
- **Assumptions step**: A formula dashboard showing all rates and drivers, with centralized defaults and per-row override inheritance.
- A Scenario Planner (`/model/:id/scenarios`) for what-if analysis with side-by-side comparisons.
- Admin dashboard for analytics and feedback.
- NPS survey modal for user feedback.
- Budgeting Co-Pilot Phase 1 for guidance and KPI transparency.
- Onboarding prep screen for new users.
- Integration with SchoolStack Space for pre-filling facility data.

### Budget Narrative & Assumption Flagging
Step 9 in the wizard allows founders to write lender-facing narratives for 9 sections (3 priority: Enrollment Strategy, Retention Plan, Risk Mitigation; 6 supplementary). The assumption flagging engine (`assumption-flags.ts`) uses the same math helpers as the projection engines to detect unusual inputs (low retention, high growth, 0% escalation, etc.) with severity levels (critical/warning/info). Flag responses and narratives are included in Lender Packet PDF, Board Summary PDF, and a dedicated "Budget Narrative" tab in the Excel underwriting workbook.

### Consultant Engine
Provides deterministic financial analysis, including lender readiness scores, stress tests, sensitivity analysis, cash runway, industry benchmarks, and prior-year variance analysis. Also outputs assumption flags for the Narrative step. Uses the same escalation source resolution as the workbook: `facilities.annualSalaryIncrease` for salary, `facilities.generalCostInflation` for cost inflation (both read from `data.facilities`). `computeYearFinancialsFromData` skips the facility overlay to match workbook parity. Y1 proration applies uniformly to revenue, personnel, and OpEx.

### Scenario Engine of Record
The single source of truth for Y1–Y5 scenario math is `lib/finance/src/decision-engine/scenario-engine.ts` (re-exported from `@workspace/finance`). Both the front-end planner and api-server features that need scenario projections call this engine. There is no parallel "shadow" scenario engine — the previous `lib/finance/src/backend-compute.ts` was removed because it kept drifting from the real engine and hid bugs (e.g. the `per_fte` regression). Parity is now enforced by frozen golden-value snapshots in `artifacts/school-financial-model/src/lib/__tests__/scenario-engine-golden.json`, asserted per fixture/year/metric by `scenario-engine-parity.test.ts`. To intentionally update the snapshot after an engine change, run `pnpm --filter @workspace/school-financial-model exec tsx scripts/gen-golden-snapshots.ts` and review the JSON diff before committing.

### Api-Server Calculation Helpers (cross-engine consistency)
Independent of the canonical scenario engine, the api-server still has two parallel calculator paths used by Excel exports and the consultant analysis: `artifacts/api-server/src/lib/workbook-helpers.ts` (Excel underwriting workbook) and `artifacts/api-server/src/lib/consultant-engine.ts` (consultant analysis, lender packets, advisor briefs). These compute their own Y1–Y5 totals and are kept within 1% tolerance of the canonical engine via hand-written parity checks in `tests/cross-engine-test.ts` and `tests/parity-frontend-backend.ts`. Consolidating these onto the engine of record is tracked as follow-up tech debt. Until then, anyone touching driver behavior, escalation, pro-ration, or FTE math should verify all three paths:
- **`per_fte` driver type**: Supported in all three paths; computes `base_amount × total_FTE`. `computeTotalFTE` helper in `workbook-helpers.ts` provides shared FTE computation.
- **Salary escalation**: All paths read from `data.facilities.annualSalaryIncrease` (stored as percentage, divided by 100 for rate).
- **Tuition offsets**: All paths use `Math.abs(val)` for tuition_offsets category to handle negative amounts consistently.
- **Breakeven enrollment**: Includes facility costs alongside staffing and loan debt service in fixed costs.
- **Cross-engine test**: `tests/cross-engine-test.ts` validates all three paths against each other for all fixtures.

### Packet Architecture
A shared packet-generation layer supports lender-ready and board-ready deliverables, including narrative generation and enrichment with risk/mitigant pairs from the Decision Engine.

### Decision Engine
Identifies and surfaces critical financial issues with severity ranking, model-specific summaries, explanations, recommended actions, and navigation to relevant steps.

## Quality Gates
Three validation steps run together as the project's CI gate (Replit invokes the same set when verifying a task): `typecheck` (`pnpm run typecheck` — builds shared `lib/*` project references via `tsc --build`, then runs `tsc --noEmit` for every artifact and the `scripts` package), `test` (`pnpm --filter @workspace/school-financial-model run test`, vitest), and `e2e` (`E2E_PORT=23192 E2E_START_SERVERS=1 pnpm --filter @workspace/school-financial-model run test:e2e`). The `e2e` step boots its own Vite dev server on the dedicated port `23192` (so it never collides with the regular `school-financial-model: web` dev workflow on 22092) and reuses the running api-server on port 8080 via Playwright's `webServer` block (gated on `E2E_START_SERVERS=1`). A failure in any step blocks validation, so type regressions, failed unit tests, and deep-link regressions (e.g. the saved-scenario "Replace export" handoff) all cannot land silently. Video capture is disabled in `playwright.config.ts` because the Replit-pinned Playwright Chromium build does not bundle the matching ffmpeg; trace + screenshot remain enabled for failure diagnosis. The Vite dev server's `server.watch.ignored` excludes `playwright-report/`, `test-results/`, and `.playwright/` so the e2e step's artifacts don't trigger HMR reloads in the regular dev workflow.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub
- **Frontend**: Netlify
- **API + DB**: Railway (Express API server + managed PostgreSQL)
- **DNS**: Squarespace
- **Proxy**: Netlify rewrites `/api/*` to Railway.
- **Schema management**: Drizzle migrations live in `lib/db/drizzle/`. The api-server runs `runMigrations()` from `@workspace/db` on boot, which calls drizzle-orm's migrator against the SQL files in that folder. To change the schema, edit `lib/db/src/schema/*.ts` then run `pnpm --filter @workspace/db generate -- --name <change>` (and `pnpm --filter @workspace/db migrate` to apply locally). The baseline migration is intentionally idempotent (`IF NOT EXISTS`, DO blocks for FK constraints) so it is safe to run against existing production databases that were originally provisioned via `drizzle-kit push`.
- **Auto-save**: Wizard auto-saves on debounced form changes with up to 3 retries (exponential backoff). Classifies errors as auth/network/validation/unknown with targeted UI messages. The API server stores raw `req.body.data` (not Zod-stripped output) to preserve frontend-only fields like `programs`, `tuitionEscalation`, and `revenueSources`.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken
- **Email**: Resend
- **SEO**: react-helmet-async (per-route meta tags, JSON-LD structured data)