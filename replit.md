# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Product: SchoolStack Budget** (by SchoolStack.ai)
A full-stack web app for school founders to create lender-ready 3-to-5-year financial models. Universal model supports any school type (microschool, private, charter, other), any school stage (new or operating), FTE-based staffing, accounting-category expenses, row-based revenue schedules, and assumption-driven Excel exports with cross-tab formulas.

## Brand System

SchoolStack.ai is the parent brand (amber-forward). Each product gets its own primary color.

- **Parent brand (SchoolStack.ai)**: Amber #D97706 — used for the navbar logo icon and "by SchoolStack.ai" subtitle (`--brand` token)
- **Product primary (SchoolStack Budget)**: Green #16A34A — CTAs, buttons, progress bar, active states, focus rings (`--primary` token)
- **Foreground/Trust**: Deep Navy #1E293B — headings, body text
- **Accent**: Teal #0D9488 — secondary actions, accent highlights
- **Alert**: Rose #E11D48
- **Background**: Cream #FAF9F7
- **Display font**: Quicksand Bold (headings)
- **Body font**: Nunito Regular (body text, UI labels)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Auth**: JWT (bcryptjs for passwords, jsonwebtoken for tokens)
- **Excel export**: ExcelJS

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── school-financial-model/  # React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Auth: `src/routes/auth.ts` — register, login, logout, /me, forgot-password, reset-password (JWT-based)
- Models: `src/routes/models.ts` — CRUD + duplicate + archive + export endpoints
- Admin: `src/routes/admin.ts` — `GET /api/admin/analytics` returns aggregate analytics including school stage/funding profile distributions, top revenue lines, top expense categories, export rates by school type, Year 5 adoption metrics, and conversion funnel. Requires auth + admin. Admin check via `src/middlewares/admin.ts` verifies user email is in `ADMIN_EMAILS` env var (comma-separated list).
- Consultant: `GET /api/models/:id/consultant` — deterministic CFO rules engine with row-based data analysis, school-type-aware heuristics (charter/private/microschool/hybrid), accounting-category diagnostics (occupancy, contracted personnel, curriculum, software fragmentation, travel, founder comp, debt pressure), lender readiness assessment, stress tests, and prior-year context for operating schools
- Excel export: `src/lib/excel-export.ts` — generates multi-tab workbook with assumption-driven formulas:
  - **Assumptions**: School info, enrollment by year, salary escalation, cost inflation, proration factor
  - **Revenue Schedule**: Students row references Assumptions; per_student/monthly/percent_of_base line items use formulas
  - **Staffing & Personnel**: Roster + projection section with formulas referencing Assumptions for escalation & proration
  - **Operating Expenses**: Students references Assumptions; driver-based formulas for per_student/monthly/percent_of_revenue
  - **Capital & Debt**: Driver-based formulas + loan amortization
  - **Financial Model (P&L)**: Cross-tab SUM formulas referencing schedule tabs
  - **Summary**: Enrollment trend, financial summary, key ratios (revenue per student, personnel %, OpEx %, net margin %), revenue mix trend, lender readiness assessment
  - **Consultant Notes** (optional): Executive summary, strengths, risks, recommendations
  - **Prior-Year Snapshot** (optional, operating schools only)
  - Legacy fallback for old flat-field models
- Event tracking: `src/lib/track-event.ts` — best-effort event tracking helper
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `artifacts/school-financial-model` (`@workspace/school-financial-model`)

React + Vite frontend (Tailwind CSS v4). Amber-forward brand with Quicksand/Nunito typography.

- Landing page, auth screens (register/login/forgot-password/reset-password)
- Dashboard with model management (create, duplicate, archive, delete)
- 8-step model wizard: Profile → Enrollment → Revenue → Staffing → Expenses → Review → Consultant → Export
- **School Profile step**: School stage (`new_school` = 3-year default, `operating_school` = 4-year default with optional Year 5 extension), funding profile (`tuition_based`, `charter_public_funded`, `hybrid_mixed`), school type, fiscal year start month, partial first year toggle, optional prior-year snapshot for operating schools
- **Enrollment step**: Per-year student counts with school-type-specific benchmarks and growth guidance
- **Revenue step**: Row-based schedule with 6 categories (tuition_and_fees, tuition_offsets, public_funding, school_choice, grants_contributions, other_revenue), driver types (annual_fixed, monthly, per_student, percent_of_base), per-year amounts, funding-profile-aware defaults, optional payment timing fields per line item (billing months, collection method/rate for tuition; payment frequency/timing for public funding; disbursement type/lag for ESA; grant status/receipt quarter for grants), Year 1 monthly cash inflow summary chart
- **Staffing step**: FTE-based roster with function categories (school_leadership, instructional, student_support, operations, administrative, other), employment types (full_time, part_time, contract), benefits/payroll tax rates, payrollLike toggle for contractors, real-time cost summary
- **Expenses step**: Row-based schedule with 4 accounting categories (instructional_program, technology, occupancy_facility, administrative_general), driver types (annual_fixed, monthly, per_student, percent_of_revenue), plus capital & debt rows with loan calculator
- **Review step**: Grouped summaries by category with computed Year 1 totals; falls back to legacy display for old models
- **Consultant step**: Executive summary, key metrics, recommendations, revenue/cost composition charts, stress test scenarios, enrollment guidance; uses CFO consultant tone
- **Export step**: Downloads assumption-driven Excel workbook with cross-tab formulas
- Admin analytics page at /admin (protected by email allowlist) with school stage/type/funding distributions, top revenue lines, top expense categories, export rates, Year 5 adoption, conversion funnel
- Auth context with JWT stored in localStorage, fetch interceptor for Bearer token injection

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Tables: `users` (role, lastSeenAt), `schools`, `financial_models` (status, lastExportedAt, consultantSummaryJson), `exports`, `events`
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by `api-server` for request and response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Universal Model Architecture

### School Configuration
- **schoolType**: `microschool | private_school | charter_school | other`
- **schoolStage**: `new_school` (3-year default) | `operating_school` (4-year default, extendable to 5)
- **fundingProfile**: `tuition_based | charter_public_funded | hybrid_mixed`
- Partial first year support with configurable operating months and proration factor

### Revenue Model
6 categories with row-based line items, each with driver type, per-year amounts, and optional payment timing:
- `tuition_and_fees`, `tuition_offsets`, `public_funding`, `school_choice`, `grants_contributions`, `other_revenue`
- Driver types: `annual_fixed`, `monthly`, `per_student`, `percent_of_base`
- Timing fields: `billingMonths` (9/10/12), `collectionMethod` (autopay/invoiced/mixed), `collectionRate`, `paymentFrequency` (monthly/quarterly/semi_annual/annual), `paymentTiming` (upfront/arrears), `disbursementType` (direct/reimbursement), `reimbursementLagMonths`, `grantStatus` (confirmed/projected), `receiptQuarter` (1-4)
- Funding-profile-aware timing defaults applied on row creation

### Staffing Model
FTE-based roster with function categories and employment types:
- Functions: `school_leadership`, `instructional`, `student_support`, `operations`, `administrative`, `other`
- Employment: `full_time`, `part_time`, `contract` (with `payrollLike` toggle)
- Benefits and payroll tax rates per role

### Expense Model
4 accounting categories with row-based line items:
- `instructional_program`, `technology`, `occupancy_facility`, `administrative_general`
- Driver types: `annual_fixed`, `monthly`, `per_student`, `percent_of_revenue`

### Capital & Debt Model
Row-based with loan calculator (PMT-based amortization for loans with principal/rate/term)

### Consultant Engine
Deterministic rules engine with CFO tone producing:
- Lender readiness score (green/yellow/red)
- School-type-aware heuristics (charter concentration/timing, tuition collection/discount risk, hybrid diversification)
- Accounting-category diagnostics (occupancy ratio, software fragmentation, curriculum outliers, etc.)
- 3 stress test scenarios with projected impacts
- Prior-year variance analysis for operating schools
