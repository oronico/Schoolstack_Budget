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
- **Authentication**: JWT-based.
- **Export Capabilities**: Utilizes ExcelJS for Excel exports (8-tab Lender Pro Forma, 3-tab public wizard, 21-tab full underwriting model) and PDFKit for PDF exports (lender and board packets), ensuring print-ready formatting and school-specific branding.
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

### Ratio-Driven Staffing Ramp
Staffing can be `fixed` or `ratio`-based, where FTE is computed from enrollment ÷ studentRatio, ceiled to nearest 0.5.

### Expert Review Service
Prominent "Get a Free Expert Review" cards on both authenticated and public Export steps invite users to request personalized model feedback. The consultant analysis view includes a contextual nudge linking to the review request. Review requests generate structured Advisor Briefs (HTML email with priority tagging, financial snapshot, risk assessment, and lending readiness) sent to the team. Authenticated review requests auto-create a shared link for the advisor. Public wizard users can also request reviews via `POST /api/public/request-review` (rate-limited, validated).

### Shareable Read-Only Links
Founders can generate unguessable share links (`/shared/:token`) for interactive viewing of their financial model by third parties without requiring a login. These links are revocable and display key financial summaries and metrics.

### API Server (`api-server`)
Manages authentication, CRUD for financial models, analytics, feedback, and orchestrates all export formats. Includes PostgreSQL-backed rate limiting and hardened CORS.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- An 8-step public underwriting wizard (`/underwriting`).
- Authentication pages and a dashboard for model lifecycle management.
- A 10-step authenticated wizard covering Profile, Assumptions, Enrollment, Revenue, Staffing, Expenses, Review, Consultant, Narrative, and Export.
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
Provides deterministic financial analysis, including lender readiness scores, stress tests, sensitivity analysis, cash runway, industry benchmarks, and prior-year variance analysis. Also outputs assumption flags for the Narrative step. Uses the same escalation source resolution as the workbook: `salaryEscalationRate ?? tuitionEscalation.rate ?? 3` for salary, `costInflationRate ?? tuitionEscalation.rate ?? 3` for cost inflation. `computeYearFinancialsFromData` skips the facility overlay to match workbook parity. Y1 proration applies uniformly to revenue, personnel, and OpEx.

### Packet Architecture
A shared packet-generation layer supports lender-ready and board-ready deliverables, including narrative generation and enrichment with risk/mitigant pairs from the Decision Engine.

### Decision Engine
Identifies and surfaces critical financial issues with severity ranking, model-specific summaries, explanations, recommended actions, and navigation to relevant steps.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub
- **Frontend**: Netlify
- **API + DB**: Railway (Express API server + managed PostgreSQL)
- **DNS**: Squarespace
- **Proxy**: Netlify rewrites `/api/*` to Railway.
- **Schema management**: Runtime DDL migrations in api-server startup.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken
- **Email**: Resend