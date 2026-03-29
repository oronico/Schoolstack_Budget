# Overview

SchoolStack Budget is a full-stack web application designed for school founders to create comprehensive, lender-ready 5-year financial models. It guides educators through financial modeling, generating investor-grade Excel workbooks and PDF reports. The platform supports various school types and stages, aiming to provide clear financial planning for microschools, private schools, charter schools, pods, and co-ops.

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# System Architecture

## Brand System
The application adheres to the SchoolStack.ai brand system, using Amber (#D97706) as the parent brand accent, Evergreen (#328555) as the product-specific primary color, Deep Navy (#1E293B) for foregrounds, Teal (#0D9488) for accents, and Cream (#FAF9F7) for backgrounds. Typography includes Quicksand Bold for headings and Nunito Regular for body text.

## Technical Stack
The project is a pnpm workspace monorepo built with TypeScript.
- **Backend**: Node.js, Express 5 API server, PostgreSQL with Drizzle ORM, Zod for validation, and Orval for OpenAPI codegen.
- **Frontend**: React, Vite, Tailwind CSS v4, with route-based code splitting.
- **Authentication**: JWT-based (bcryptjs for passwords, jsonwebtoken for tokens).
- **Export Capabilities**: Utilizes ExcelJS for Excel exports (8-tab Lender Pro Forma, 3-tab public wizard, 21-tab full underwriting model) and PDFKit for PDF exports (lender and board packets). Exports include print-ready formatting, school-specific branding, and pre-computed cached results for formula cells. Financial integrity is ensured through linked balance sheet and cash flow statements. Automated Excel QA suite (`tests/excel-qa.ts`) verifies file integrity, formulas, and financial tie-outs.
- **Monorepo Structure**: Organized into `artifacts/` for deployable applications, `lib/` for shared libraries, and `scripts/` for utilities.

## Core Features
### Universal Financial Model
Supports diverse school configurations and projects 5 years, accommodating partial first years. It includes flexible programs & enrollment with tuition escalation, a comprehensive revenue model across 6 categories, an FTE-based staffing model with configurable benefits and ratio-driven staffing ramp, an expense model with 4 built-in categories and flexible drivers (including `per_new_student` and `per_returning_student`), and a capital & debt model with a loan calculator. Features also include contextual guidance, benchmark comparisons, capacity warnings, and a tuition discount tier editor. The "Grants & Fundraising" category has been merged into "Philanthropy" with backward compatibility.

#### Smart Expense Escalation
CFO-level cost forecasting with automatic escalation by expense type:
- **Rent/Lease** → `annualRentIncrease` (default 3%), labeled "per lease terms"
- **Per-student costs** → flat (enrollment drives growth)
- **Monthly/annual fixed** → `generalCostInflation` (default 3%)
- **% of Revenue** → flat (scales with revenue)
- **Capital & Debt** → flat (contractual)
- Helper functions: `getEscalationRule()` determines rate/label, `computeEscalatedAmounts()` generates Y2-5 from Y1
- Default rows are generated with escalated amounts via `generateDefaultExpenseRows(..., rates)`
- ExpenseLineCard auto-fills Y2-5 when Y1 changes, with teal styling for auto-filled cells and amber for overrides
- Override tracking is derived from data (comparing actual vs computed amounts), surviving page reload
- Category summaries show escalated 5-year totals
- Escalation banner explains the logic with inline rate badges
- COLA (Cost of Living Adjustment) replaces "Annual Salary Increase" across FacilitiesStep, StaffingStep (with Y1→Y5 projection), and ReviewStep

#### Charter Revenue Streams
Charter-specific revenue support includes:
- **State per-pupil pre-fill**: `STATE_FUNDING_MAP` contains `charterBasePerPupil: {min, max}` ranges for all 50 states + DC. The midpoint auto-fills the State/Local Per-Pupil Revenue row.
- **State-driven methodology badge**: Enrollment revenue method (ADA/ADM/Count Days) is shown as a read-only badge driven by the user's state, not a manual dropdown.
- **Federal title funds**: Title I (low-income), Title II (teacher quality), Title III (English learners), and IDEA (special education) are separate line items in the catalog.
- **Weighted funding rows**: SPED, ELL, and At-Risk weighted funding rows available as optional per-student line items.
- **CSP Grant**: Charter School Program (CSP) Grant line item under Philanthropy, pre-filled at $150K/yr for first 3 years.
- **Charter coaching banner**: State-specific coaching text with per-pupil range displayed in a teal banner at the top of the charter configuration section.

#### Ratio-Driven Staffing Ramp
Staffing can be `fixed` or `ratio`-based, where FTE is computed from enrollment ÷ studentRatio, ceiled to nearest 0.5. This logic is consistently applied across workbook helpers, engines, and exports, with frontend support for configuration and preview.

### API Server (`api-server`)
Manages authentication, CRUD operations for financial models, admin analytics, feedback, and a consultant rules engine. It orchestrates all Excel and PDF export formats, including public and consultant endpoints with PostgreSQL-backed rate limiting. CORS is hardened with explicit origin allowlisting. Production-hardened with `helmet` (security headers) and `compression` (gzip). DB performance indexes on `financial_models(user_id)`, `exports(user_id, model_id)`, and `events(user_id, event_name)`.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- An 8-step public underwriting wizard (`/underwriting`) with localStorage persistence and public export, requiring no account.
- Authentication pages (login, register, forgot/reset password).
- A dashboard for model lifecycle management.
- An 8-step authenticated wizard for detailed financial model setup.
- A Scenario Planner (`/model/:id/scenarios`) for creating up to 3 what-if scenarios with adjustment sliders, side-by-side comparisons, and viability nudges. Includes a Deep Comparison mode for detailed metric deltas.
- An admin dashboard with analytics and feedback management.
- A floating feedback widget for user submissions.
    - NPS survey modal: triggered 2s after a user's first export, with 90-day per-user cooldown (localStorage). 0-10 score buttons color-coded red/amber/green, optional comment, posts to `/api/feedback` with `category: "nps"` and integer `score`. Admin dashboard shows NPS entries with violet badge and "9/10 (Promoter)" labels.
- Budgeting Co-Pilot Phase 1: Provides guidance mode preferences, inline explainer cards on wizard steps, and KPI formula transparency on consultant analysis metric cards.
- SchoolStack Space pre-fill integration (`/model/new`): Allows auto-creation of models with pre-filled facility data from URL query parameters.

### Consultant Engine
Provides deterministic financial analysis, including lender readiness scores, school-type-aware heuristics, management fee analysis, five stress test scenarios, a 5x5 sensitivity matrix, cash runway calculation, industry benchmark comparisons, and prior-year variance analysis.

### Packet Architecture
A shared packet-generation layer (`artifacts/api-server/src/lib/packets/`) supports lender-ready and board-ready deliverables. It includes narrative generation, assembly of full `PacketData` using canonical math, and enrichment for lender packets with risk/mitigant pairs from the Decision Engine. PDF output is generated via `lender-packet-pdf.ts`.

### Decision Engine
Identifies and surfaces critical financial issues (e.g., negative cash, weak reserves, high staffing cost) through 8 decision rules. Issues are ranked by severity and include model-specific summaries, explanations, recommended actions, and navigation to relevant steps.

## Deployment Architecture
- **Development**: Replit
- **Source of truth**: GitHub (`oronico/School-Finance-Mod`)
- **Frontend**: Netlify
- **API + DB**: Railway (Express API server + managed PostgreSQL)
- **DNS**: Squarespace for `budget.schoolstack.ai`
- **Proxy**: Netlify rewrites `/api/*` to the Railway API server.
- **Schema management**: `drizzle-kit push`.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval
- **Excel Export**: ExcelJS
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken
- **Email**: Resend (for transactional emails)