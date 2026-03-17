# Overview

SchoolStack Budget is a full-stack web application designed for school founders to create comprehensive, lender-ready 5-year financial models. It offers a universal model adaptable to various school types (microschool, private, charter) and stages (new or operating), incorporating FTE-based staffing, accounting-category expenses, and sophisticated revenue scheduling. The platform's key capability is its assumption-driven Excel export functionality, complete with cross-tab formulas, providing robust financial projections and analysis for strategic planning and securing funding. The project's vision is to empower school leaders with powerful financial tools to ensure sustainability and growth.

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
  - `underwriting-export.ts` - Legacy 14-tab underwriting (to be deprecated)
  - `workbook-helpers.ts` - Shared types, constants, formatting, label, and computation functions used by all workbook exports
  - Schema extensions: `openingBalances`, `sourcesAndUses`, `scenarios`, `covenantThresholds` schemas; `purpose` field on capitalDebtRow; `debtIncluded` on schoolProfile
  - **Financial integrity**: Balance Sheet Y1 cash is linked to Monthly Cash Flow ending cash to ensure exact tie-out. Years 2-5 project from that base plus cumulative net income.
  - **Excel QA Suite** (`tests/excel-qa.ts`): Automated quality assurance testing 5 export types × 3 sample payloads (15 tests). Checks file integrity, tab presence, formula/value error scanning, and financial tie-outs (Balance Sheet A=L+E, Cash Flow→BS cash, Debt Schedule→BS debt, DSCR, Sources=Uses).
- **Monorepo Structure**: Organized into `artifacts/` for deployable applications (`api-server`, `school-financial-model`), `lib/` for shared libraries, and `scripts/` for utilities.

## Core Features
### Universal Financial Model
Supports various school configurations (type, stage, funding profiles) and projects 5 years, accommodating partial first years. Includes flexible programs & enrollment with tuition escalation, a comprehensive revenue model with 6 categories (Tuition & Fees, Tuition Offsets, Public Funding, School Choice, Philanthropy, Other Revenue) and various driver types, an FTE-based staffing model with configurable benefits, an expense model across 4 built-in accounting categories (plus user-created custom categories) with flexible drivers, and a capital & debt model with a loan calculator. Features include contextual guidance, benchmark comparisons, capacity warnings, and a tuition discount tier editor for private/tuition-based schools allowing custom discount tiers with per-year student counts. Note: The former "Grants & Fundraising" category has been merged into "Philanthropy" - backend code handles both `philanthropy` and legacy `grants_contributions` category values for backward compatibility.

### API Server (`api-server`)
Manages authentication, CRUD operations for financial models, admin analytics, and a consultant rules engine. It orchestrates advanced Excel and PDF export functionalities, including a branded Lender Pro Forma and a 14-tab Underwriting Pro Forma workbook. Includes a public export endpoint. Deployment uses a multi-stage Dockerfile and includes PostgreSQL-backed rate limiting for public endpoints.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- A public 8-step underwriting wizard (`/underwriting`) with localStorage persistence, consultant analysis, and public export, requiring no account. Profile step includes a Lending Lab intent branching question (plan_to_apply / want_to_understand / budget_only).
- Authentication pages (login, register, forgot/reset password).
- A dashboard for model lifecycle management (with Scenarios link for step-8 models).
- An 8-step authenticated wizard for detailed financial model setup.
- A Scenario Planner (`/model/:id/scenarios`) - gated at step 8, allows up to 3 named what-if scenarios with 5 adjustment sliders (enrollment, tuition/revenue, staffing, facility, expenses). Shows side-by-side comparison table (Year 1, Year 5, Key Indicators) with color-coded viability nudges. Scenarios auto-persist and flow into the underwriting Excel export.
- A dedicated admin dashboard with analytics and feedback management tabs.
- A floating feedback widget (bottom-right) visible on all pages via Layout, supporting category selection (like, dislike, bug, feature), free-text message, optional email for anonymous users, and auto-captured page URL. Submissions stored in `feedback` table.
- Auth context with JWT stored in localStorage, `refetchUser` helper for re-fetching user data.
- Budgeting Co-Pilot Phase 1: guidance mode preference (advanced/basics/extra stored in `guidance_level` on users table, PATCH `/api/auth/guidance-level`), inline explainer cards on wizard steps (13 explainers across enrollment/revenue/staffing/expenses/review sections), KPI formula transparency on consultant analysis metric cards (8 KPI formulas with "How is this calculated?" drawers). Components: `InlineHelpCard`, `ExplainerDrawer`/`KpiFormulaDrawer`, `GuidanceModePrompt`, `GuidanceModeSelector`, `SectionExplainers`. Content registries: `src/lib/coaching/explainers.ts`, `src/lib/coaching/kpi-formulas.ts`.

### Consultant Engine
Provides deterministic financial analysis including lender readiness scores, school-type-aware heuristics, management fee analysis, five stress test scenarios, a 5x5 sensitivity matrix, cash runway calculation, industry benchmark comparisons, and prior-year variance analysis.

### Decision Engine (Epic 2)
Top 3 Issues Panel ("What should I fix first?") surfaces the most critical financial issues from 8 decision rules: negative cash, weak reserves, high staffing cost, high occupancy cost, aggressive enrollment, grant dependency, weak DSCR, short cash runway. Issues are ranked by severity (critical/high/medium) and include model-specific summaries, "Why this matters" explanations, recommended actions, supporting metrics, and jump-to-step navigation. Rules engine: `artifacts/api-server/src/lib/decision-rules.ts`. Panel component: `artifacts/school-financial-model/src/components/consultant/TopIssuesPanel.tsx`. OpenAPI schema: `DecisionIssue` in `lib/api-spec/openapi.yaml`.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub
- **Production build/deploy**: Netlify (builds from GitHub)
- **Public domain**: Squarespace DNS pointing to Netlify.
- Netlify is configured via `netlify.toml` for build commands, publish directory (`artifacts/school-financial-model/dist/public`), cache headers, and API proxy redirects (`/api/*` to Railway API server).

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken