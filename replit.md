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
- **Export Capabilities**: ExcelJS for standard exports, xlsx-populate for template-based Lender Pro Forma Excel exports with preserved formulas, and PDFKit for PDF exports. All exports include print-ready formatting, school-specific branding, and detailed financial breakdowns. All formula cells include pre-computed cached results for compatibility with Google Sheets and non-recalculating viewers.
  - `formula-export.ts` — 3-tab public wizard export (Assumptions, 5-Year Model, Year 1 Pro Forma)
  - `underwriting-workbook.ts` — **21-tab full underwriting model** (Cover, Instructions, Assumptions, Program Profile, Enrollment Drivers, Tuition & Funding, Staffing Drivers, OpEx Drivers, Capital Stack, Enrollment Tuition Fcst, Staffing Costs Fcst, Budget Detail, Budget Summary, Monthly Cash Flow Y1, 5-Year Operating Stmt, Debt Schedule, Balance Sheet, DSCR & Covenants, Sources & Uses, Scenarios, Underwriting Snapshot). Route: `/models/:id/export/underwriting-v2`
  - `underwriting-export.ts` — Legacy 14-tab underwriting (to be deprecated)
  - `workbook-helpers.ts` — Shared types, constants, formatting, label, and computation functions used by all workbook exports
  - Schema extensions: `openingBalances`, `sourcesAndUses`, `scenarios`, `covenantThresholds` schemas; `purpose` field on capitalDebtRow; `debtIncluded` on schoolProfile
  - **Financial integrity**: Balance Sheet Y1 cash is linked to Monthly Cash Flow ending cash to ensure exact tie-out. Years 2-5 project from that base plus cumulative net income.
  - **Excel QA Suite** (`tests/excel-qa.ts`): Automated quality assurance testing 5 export types × 3 sample payloads (15 tests). Checks file integrity, tab presence, formula/value error scanning, and financial tie-outs (Balance Sheet A=L+E, Cash Flow→BS cash, Debt Schedule→BS debt, DSCR, Sources=Uses).
- **Monorepo Structure**: Organized into `artifacts/` for deployable applications (`api-server`, `school-financial-model`), `lib/` for shared libraries, and `scripts/` for utilities.

## Core Features
### Universal Financial Model
Supports various school configurations (type, stage, funding profiles) and projects 5 years, accommodating partial first years. Includes flexible programs & enrollment with tuition escalation, a comprehensive revenue model with 6 categories and various driver types, an FTE-based staffing model with configurable benefits, an expense model across 4 accounting categories with flexible drivers, and a capital & debt model with a loan calculator. Features include contextual guidance, benchmark comparisons, and capacity warnings.

### API Server (`api-server`)
Manages authentication, CRUD operations for financial models, admin analytics, and a consultant rules engine. It orchestrates advanced Excel and PDF export functionalities, including a branded Lender Pro Forma and a 14-tab Underwriting Pro Forma workbook. Includes a public export endpoint. Deployment uses a multi-stage Dockerfile and includes PostgreSQL-backed rate limiting for public endpoints.

### Frontend (`school-financial-model`)
A React-based SPA featuring:
- A public 8-step underwriting wizard (`/underwriting`) with localStorage persistence, consultant analysis, and public export, requiring no account. Profile step includes a Lending Lab intent branching question (plan_to_apply / want_to_understand / budget_only).
- Authentication pages (login, register, forgot/reset password).
- A dashboard for model lifecycle management.
- An 8-step authenticated wizard for detailed financial model setup.
- A dedicated admin analytics page for key metrics.
- Auth context with JWT stored in localStorage.

### Consultant Engine
Provides deterministic financial analysis including lender readiness scores, school-type-aware heuristics, management fee analysis, five stress test scenarios, a 5x5 sensitivity matrix, cash runway calculation, industry benchmark comparisons, and prior-year variance analysis.

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
- **Excel Export**: ExcelJS, xlsx-populate
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs, jsonwebtoken