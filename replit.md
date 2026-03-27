# Overview

SchoolStack Budget — "Every school deserves a clear financial plan." A full-stack web application for school founders to create comprehensive, lender-ready 5-year financial models. Built for microschools, private schools, charter schools, pods, and co-ops at any stage (new or operating). The platform walks educators through financial modeling step by step, in plain English, and generates investor-grade Excel workbooks and PDF reports. Production domain: budget.schoolstack.ai (Netlify frontend + Railway API/DB).

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# System Architecture

## Brand System
The application adheres to the SchoolStack.ai brand system, utilizing Amber (#D97706) as the parent brand accent and Evergreen (#328555) as the product-specific primary color. Deep Navy (#1E293B) is used for foregrounds, Teal (#0D9488) for accents, and Cream (#FAF9F7) for backgrounds. Typography uses Quicksand Bold for headings and Nunito Regular for body text.

## Technical Stack
The project is a pnpm workspace monorepo built with TypeScript.
- **Backend**: Node.js (v24), Express 5 API server, PostgreSQL with Drizzle ORM, Zod for validation, and Orval for OpenAPI codegen.
- **Frontend**: React, Vite, Tailwind CSS v4, with route-based code splitting.
- **Authentication**: JWT-based (bcryptjs for passwords, jsonwebtoken for tokens).
- **Export Capabilities**: ExcelJS for all Excel exports (standard, underwriting, lender pro forma, formula), PDFKit for PDF exports. All exports include print-ready formatting, school-specific branding, and detailed financial breakdowns. All formula cells include pre-computed cached results for compatibility with Google Sheets and non-recalculating viewers.
  - `lender-proforma-export.ts` - **8-tab Lender Pro Forma** (Cover, Assumptions, Drivers, 5-Year P&L, Cash Flow & DSCR, Staffing, Loan Snapshot, Summary). Pure ExcelJS build with cross-tab formulas referencing Assumptions tab. `mapModelToTemplateInput()` maps model data → flat assumptions; `computeLenderResults()` pre-computes all downstream values for cached formula results. Route: `/models/:id/export/lender-proforma`
  - `formula-export.ts` - 3-tab public wizard export (Assumptions, 5-Year Model, Year 1 Pro Forma)
  - `underwriting-workbook.ts` - **21-tab full underwriting model** (Cover, Instructions, Assumptions, Program Profile, Enrollment Drivers, Tuition & Funding, Staffing Drivers, OpEx Drivers, Capital Stack, Enrollment Tuition Fcst, Staffing Costs Fcst, Budget Detail, Budget Summary, Monthly Cash Flow Y1, 5-Year Operating Stmt, Debt Schedule, Balance Sheet, DSCR & Covenants, Sources & Uses, Scenarios, Underwriting Snapshot). Route: `/models/:id/export/underwriting-v2`
  - `underwriting-export.ts` - Legacy 14-tab underwriting (deprecated, target removal Q3 2026; still imported by public.ts and models.ts shim route)
  - `workbook-helpers.ts` - Shared types, constants, formatting, label, and computation functions used by all workbook exports
  - Schema extensions: `openingBalances`, `sourcesAndUses`, `scenarios`, `covenantThresholds` schemas; `purpose` field on capitalDebtRow; `debtIncluded` on schoolProfile
  - **Financial integrity**: Balance Sheet Y1 cash is linked to Monthly Cash Flow ending cash to ensure exact tie-out. Years 2-5 project from that base plus cumulative net income.
  - **Excel QA Suite** (`tests/excel-qa.ts`): Automated quality assurance testing 5 export types × 3 sample payloads (15 tests). Checks file integrity, tab presence, formula/value error scanning, and financial tie-outs (Balance Sheet A=L+E, Cash Flow→BS cash, Debt Schedule→BS debt, DSCR, Sources=Uses).
- **Monorepo Structure**: Organized into `artifacts/` for deployable applications (`api-server`, `school-financial-model`), `lib/` for shared libraries, and `scripts/` for utilities.

## Core Features
### Universal Financial Model
Supports various school configurations (type, stage, funding profiles) and projects 5 years, accommodating partial first years. Includes flexible programs & enrollment with tuition escalation, a comprehensive revenue model with 6 categories (Tuition & Fees, Tuition Offsets, Public Funding, School Choice, Philanthropy, Other Revenue) and various driver types, an FTE-based staffing model with configurable benefits and **ratio-driven staffing ramp**, an expense model across 4 built-in accounting categories (plus user-created custom categories) with flexible drivers (including `per_new_student` and `per_returning_student` types that split enrollment using `retentionRate` — Year 1 treats all students as new; subsequent years compute returning=min(enrollment[y], round(enrollment[y-1]*retentionRate/100)), new=enrollment[y]-returning), and a capital & debt model with a loan calculator. Features include contextual guidance, benchmark comparisons, capacity warnings, and a tuition discount tier editor for private/tuition-based schools allowing custom discount tiers with per-year student counts. Note: The former "Grants & Fundraising" category has been merged into "Philanthropy" - backend code handles both `philanthropy` and legacy `grants_contributions` category values for backward compatibility.

#### Ratio-Driven Staffing Ramp
StaffingRow supports two modes: `fixed` (static FTE across all years) and `ratio` (FTE computed from enrollment ÷ studentRatio, ceiled to nearest 0.5). Ratio-mode fields: `staffingMode`, `studentRatio`, `minFte`, `maxFte`, `startYear`, `endYear`. Core function `computeEffectiveFte(row, yearIdx, enrollment)` is implemented identically in `workbook-helpers.ts` (canonical), `consultant-engine.ts`, `underwriting-export.ts`, and `staffing-defaults.ts` (frontend). All export callers (`underwriting-workbook.ts`, `formula-export.ts`, `build-packet-data.ts`, `build-board-packet.ts`, `consultant-engine.ts`, `underwriting-export.ts`) pass enrollment to staffing computation. Export row labels show `[1:N]` tag for ratio-mode rows. Frontend StaffingStep has a Fixed/Ratio toggle, ratio inputs (students-per-staff, min/max FTE, start/end year), and a 5-year FTE preview grid. Summary metrics are ratio-aware via Y1 enrollment.

### API Server (`api-server`)
Manages authentication (with profile fields: schoolName, profileRole, planningStage, mailingListOptIn, termsAcceptedAt), CRUD operations for financial models, admin analytics, feedback management, and a consultant rules engine. It orchestrates 4 Excel export formats (Formula 3-tab, Lender Pro Forma 8-tab, Underwriting V2 21-tab, Legacy 14-tab deprecated) plus PDF exports (lender packet, board packet). Includes public export and consultant endpoints with PostgreSQL-backed rate limiting. CORS hardened with explicit URL-parsed origin allowlist (budget.schoolstack.ai, space.schoolstack.ai, schoolstack.ai) plus ALLOWED_ORIGINS env var and localhost support. Deployment uses a multi-stage Dockerfile on Railway.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- A public 8-step underwriting wizard (`/underwriting`) with localStorage persistence, consultant analysis, and public export, requiring no account. Profile step includes a Lending Lab intent branching question (plan_to_apply / want_to_understand / budget_only).
- Authentication pages (login, register, forgot/reset password).
- A dashboard for model lifecycle management (with Scenarios link for step-8 models).
- An 8-step authenticated wizard for detailed financial model setup.
- A Scenario Planner (`/model/:id/scenarios`) - gated at step 8, allows up to 3 named what-if scenarios with 5 adjustment sliders (enrollment, tuition/revenue, staffing, facility, expenses). Shows side-by-side comparison table (Year 1, Year 5, Key Indicators) with color-coded viability nudges. Scenarios auto-persist and flow into the underwriting Excel export. Includes a Deep Comparison mode (via `scenario-compare.ts`) that produces per-metric delta cards with plain-English explanations, verdict banners (stronger/weaker/mixed), biggest improvement/risk callouts, and assumption change tables.
- A dedicated admin dashboard with analytics and feedback management tabs.
- A floating feedback widget (bottom-right) visible on all pages via Layout, supporting category selection (like, dislike, bug, feature), free-text message, optional email for anonymous users, and auto-captured page URL. Submissions stored in `feedback` table.
- Auth context with JWT stored in localStorage, `refetchUser` helper for re-fetching user data.
- Budgeting Co-Pilot Phase 1: guidance mode preference (advanced/basics/extra stored in `guidance_level` on users table, PATCH `/api/auth/guidance-level`), inline explainer cards on wizard steps (13 explainers across enrollment/revenue/staffing/expenses/review sections), KPI formula transparency on consultant analysis metric cards (8 KPI formulas with "How is this calculated?" drawers). Components: `InlineHelpCard`, `ExplainerDrawer`/`KpiFormulaDrawer`, `GuidanceModePrompt`, `GuidanceModeSelector`, `SectionExplainers`. Content registries: `src/lib/coaching/explainers.ts`, `src/lib/coaching/kpi-formulas.ts`.
- SchoolStack Space pre-fill integration (`/model/new`): accepts URL query params (`sqft`, `students`, `monthlyRent`, `nnnAnnual`, `schoolName`) to auto-create a model with pre-filled facility data. Maps: schoolName → schoolProfile.schoolName + model name, students → enrollment programs + year1-5 with 15%/yr growth ramp, monthlyRent → schoolProfile.monthlyRent + facilities.monthlyRent + locationSecured+ownershipType=rent, sqft → facilities.annualUtilities (sqft×$2.50) + facilities.annualInsurance (sqft×$1.50), nnnAnnual → schoolProfile.nnnCamCharges (÷12 to monthly). Shows dismissible teal banner "Facility data imported from SchoolStack Space". Auth flow preserves query params via sessionStorage `auth_return_to` through login/register. Files: `model-new.tsx`, `App.tsx` (ProtectedRoute), `login.tsx`, `register.tsx`, `model-wizard/index.tsx`.

### Consultant Engine
Provides deterministic financial analysis including lender readiness scores, school-type-aware heuristics, management fee analysis, five stress test scenarios, a 5x5 sensitivity matrix, cash runway calculation, industry benchmark comparisons, and prior-year variance analysis.

### Packet Architecture (Epic 3)
Shared packet-generation layer in `artifacts/api-server/src/lib/packets/` supporting lender-ready and board-ready deliverables. Core files: `packet-types.ts` (PacketData, PacketSection, NarrativeSummary, LinkedAssumption/LinkedMetric, 18 section IDs, lender/board templates, FormatRules), `build-narrative.ts` (generates headline, summary, keyRisks, keyStrengths, recommendedFocus from ConsultantOutput), `build-packet-data.ts` (assembles full PacketData using canonical workbook-helpers for all math — no duplicated business logic). Each section references source assumptions and source metrics for traceability. `build-lender-packet.ts` enriches base packet with risk/mitigant pairs from DecisionIssue engine, DSCR summary, operating reserve analysis. `lender-packet-pdf.ts` generates branded PDFKit output. API endpoints: `GET /models/:id/export/lender-packet` (JSON), `GET /models/:id/export/lender-packet-pdf` (PDF). Frontend: `LenderPacketPreview.tsx` modal accessible from ExportStep's "Lender-Ready Packet" card.

### Decision Engine (Epic 2)
Top 3 Issues Panel ("What should I fix first?") surfaces the most critical financial issues from 8 decision rules: negative cash, weak reserves, high staffing cost, high occupancy cost, aggressive enrollment, grant dependency, weak DSCR, short cash runway. Issues are ranked by severity (critical/high/medium) and include model-specific summaries, "Why this matters" explanations, recommended actions, supporting metrics, and jump-to-step navigation. Rules engine: `artifacts/api-server/src/lib/decision-rules.ts`. Panel component: `artifacts/school-financial-model/src/components/consultant/TopIssuesPanel.tsx`. OpenAPI schema: `DecisionIssue` in `lib/api-spec/openapi.yaml`.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub (`oronico/School-Finance-Mod`)
- **Frontend**: Netlify (builds from GitHub, publishes `artifacts/school-financial-model/dist/public`)
- **API + DB**: Railway (Express API server + managed PostgreSQL)
- **DNS**: Squarespace → `budget.schoolstack.ai` → Netlify
- **Proxy**: Netlify `netlify.toml` rewrites `/api/*` → Railway API server (`https://schoolstackbudget.up.railway.app`)
- **Schema management**: `drizzle-kit push` (no migration files)

## Release Documentation (`docs/`)
- `ALPHA_RELEASE_CHECKLIST.md` — Launch gates and pre-launch verification checklist
- `DEPLOYMENT_GUIDE.md` — Railway + Netlify deployment procedures, env vars, rollback
- `QA_REPORT.md` — Full test results from alpha QA pass (29 tests, 100% pass)
- `EXPORT_QA_CHECKLIST.md` — Workbook validation criteria and sample payloads
- `UNDERWRITING_REVIEW_SOP.md` — How to review submitted financial models
- `RELEASE_NOTES.md` — Alpha feature list, known limitations, roadmap

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken
- **Email**: Resend (transactional emails via RESEND_API_KEY)

# Landing Page
The landing page (`landing.tsx`) uses educator-first messaging: hero headline "Every school deserves a clear financial plan.", 3 feature cards, 7-step "How It Works" section, "Who It's For" empathetic copy, cross-sell to SchoolStack Space (space.schoolstack.ai), and bottom CTA with "Get Started Free" + "Talk to Sales". Badge: "FREE DURING BETA".