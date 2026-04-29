# Overview

SchoolStack Budget is a full-stack web application designed to help school founders create comprehensive, lender-ready 5-year financial models. It provides a guided experience for financial planning, culminating in investor-grade Excel workbooks and PDF reports. The platform supports various school types and stages (microschools, private schools, charter schools, pods, co-ops), aiming to equip school leaders with robust financial tools to ensure sustainability and attract investment.

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# System Architecture

## Brand System
The application adheres to the SchoolStack.ai brand system, utilizing specific color palettes (Amber, Evergreen, Deep Navy, Teal, Cream) and typography (Quicksand Bold for headings, Nunito Regular for body text).

## Technical Stack
The project is a pnpm workspace monorepo built with TypeScript.
- **Backend**: Node.js, Express 5 API server, PostgreSQL with Drizzle ORM.
- **Frontend**: React, Vite, Tailwind CSS v4.
- **Authentication**: JWT-based.
- **Export Capabilities**: ExcelJS for Excel exports (8-tab Lender Pro Forma, 3-tab public wizard, 21-tab full underwriting model) and PDFKit for PDF exports (lender packet, board packet, decision-comparison side-by-side).
- **Monorepo Structure**: `artifacts/` for deployable applications, `lib/` for shared libraries, `scripts/` for utilities.
- **Shared Finance Library**: `@workspace/finance` provides canonical financial constants and loan amortization.

## Core Features
### Universal Financial Model
Supports diverse school configurations with 5-year projections, flexible programs & enrollment, comprehensive revenue models, FTE-based staffing, flexible expense models, and capital & debt modeling. Includes contextual guidance, benchmark comparisons, and smart expense escalation logic.

### Charter Revenue Streams
Specific support for charter schools, including state per-pupil pre-fills, federal title funds, weighted funding rows, and CSP Grant line items.

### School Identity & Fundraising Intelligence
Includes logic for Catholic and faith-affiliated schools and fundraising intelligence for non-profit and for-profit school types.

### Underwriter-Ready Evidence & Financial Intelligence
Supports prior-year actuals and opening balance sheets for operating schools. Features coaching banners, facility phase tracking, and Key Financial Indicators. Balance sheet intelligence includes depreciation, dynamic accounts receivable, and current ratio covenant checks.

### Coaching System
In-app guidance uses a warm, school-leader-friendly coaching voice. Key elements include:
- **FinancingInsight**: 10 curated instances providing practical financing context.
- **InlineHelpCard**: Tabbed help cards with "Financing Insight" tab.
- **Diagnostics engine**: Provides kind coaching language for financial issues.
- **GlossaryTerm tooltips**: Provides definitions for financial jargon.
- **Story-first wizard (11 steps)**: Guides users through Story, School Details, Assumptions, Enrollment, Revenue, Staffing, Expenses, Review, Consultant, Lender Narrative, and Export.

### Founder personas (Task #302)
Every authenticated user is asked for a `personaStage` (`yet_to_launch` | `existing`) and `personaComfort` (`new_to_budgeting` | `comfortable`) at sign-in via `FounderPersonaPrompt`. The prompt is required for all users without a persona — including legacy users who only have a `guidanceLevel` — and can be re-opened from the navbar's settings dropdown ("Founder profile"). The wizard also guards entry: opening a model without a persona surfaces the prompt as an overlay.

`yet_to_launch` founders never see actuals / prior-year / QuickBooks / variance / forecast-accuracy surfaces anywhere in the app (dashboard, wizard, scenarios, review). Tone copy adjusts by `personaComfort`: `new_to_budgeting` gets plain-English greetings + helper text, `comfortable` gets terser, more technical copy. Test coverage in `persona-yet-to-launch.test.tsx` mounts the wizard with each yet_to_launch step and asserts the forbidden terms never appear.

The Story step's "Your program" sequence asks for the founder's program design first: which age/grade bands they serve (toddlers / pre-K / K-5 / 6-8 / 9-12 / Other with a custom label), year-1 enrollment + tuition + students-per-teacher per band, with a "same tuition for every band" shortcut and per-band 5-year goals (defaulted proportionally from a single total). Bands are defined once in `src/lib/revenue-defaults.ts` (`GRADE_BAND_KEYS`, `GRADE_BAND_DEFAULT_RATIO`) and consumed by Story / Revenue / Enrollment steps.

### Ratio-Driven Staffing Ramp
Staffing can be fixed or ratio-based, where FTE is computed from enrollment ÷ studentRatio.

### Expert Review Service
Prominent "Get a Free Expert Review" cards enable users to request personalized model feedback. This generates structured Advisor Briefs with school profile, financial snapshot, risk assessment, and lending readiness information.

### Shareable Read-Only Links
Founders can generate unguessable share links for interactive viewing of their financial model by third parties.

### API Server (`api-server`)
Manages authentication, CRUD for financial models, analytics, feedback, and orchestrates all export formats.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- Authentication pages and a dashboard for model lifecycle management.
- A 10-step authenticated wizard with non-linear navigation.
- **Assumptions step**: A formula dashboard with centralized defaults and per-row override inheritance.
- Scenario Planner for what-if analysis with side-by-side comparisons.
- Admin dashboard, NPS survey, and Onboarding prep screen.

### Budget Narrative & Assumption Flagging
Wizard step 9 allows founders to write lender-facing narratives for 9 sections. The assumption flagging engine detects unusual inputs with severity levels.

### Consultant Engine
Provides deterministic financial analysis, including lender readiness scores, stress tests, sensitivity analysis, cash runway, industry benchmarks, and prior-year variance analysis.

### Scenario Engine of Record
`lib/finance/src/decision-engine/scenario-engine.ts` is the single source of truth for Y1–Y5 scenario math, used by both frontend and API server. Parity is enforced by frozen golden-value snapshots.

### Api-Server Calculation Helpers
`artifacts/api-server/src/lib/workbook-helpers.ts` (Excel underwriting workbook) and `artifacts/api-server/src/lib/consultant-engine.ts` (consultant analysis, lender packets, advisor briefs) provide parallel calculation paths, maintained within 1% tolerance of the canonical engine via parity checks.

### Packet Architecture
A shared layer supports lender-ready and board-ready deliverables, including narrative generation and enrichment.

### Decision Engine
Identifies and surfaces critical financial issues with severity ranking, summaries, explanations, and recommended actions.

### Lender Language Toggle
Dashboard's Year-1 Financial Snapshot exposes a "Lender language" switch that swaps four KPI labels to lender/accounting equivalents (Operating Surplus→NOI, Net Income→EBITDA, Coverage Ratio→DSCR, Cash Reserve→Working Capital). Persisted server-side via `PATCH /auth/lender-language` for authed users; falls back to localStorage (`schoolstack:lenderLanguageEnabled`) for guests. Hook: `src/lib/coaching/use-lender-language.tsx`. Label registry: `src/lib/coaching/lender-labels.ts`. Analytics: `lender_language_toggled` (allow-listed in `/auth/track`). Companion primer at `/resources/financial-statements-101` (P&L, Balance Sheet, Cash Flow Statement) is linked from the wizard's "From budget to books" lesson.

## Quality Gates
CI gates include `typecheck`, `test` (vitest), and `e2e` (Playwright) to ensure code quality and prevent regressions.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub
- **Frontend**: Netlify
- **API + DB**: Railway (Express API server + managed PostgreSQL)
- **DNS**: Squarespace
- **Proxy**: Netlify rewrites `/api/*` to Railway.
- **Schema management**: Drizzle migrations in `lib/db/drizzle/`.
- **Auto-save**: Wizard auto-saves on debounced form changes with retries and targeted UI messages.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken
- **Email**: Resend
- **SEO**: react-helmet-async