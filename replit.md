# Overview

SchoolStack Budget is a full-stack web application designed for school founders. It enables them to create comprehensive, lender-ready 5-year financial models. The platform offers a universal model adaptable to various school types (microschool, private, charter), stages (new or operating), and incorporates FTE-based staffing, accounting-category expenses, and sophisticated revenue scheduling. A key feature is the assumption-driven Excel export functionality, complete with cross-tab formulas, providing robust financial projections and analysis for strategic planning and securing funding. The project aims to empower school leaders with powerful financial tools to ensure sustainability and growth.

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# Deployment Architecture

- **Development**: Replit
- **Source of truth**: GitHub (push from Replit)
- **Production build/deploy**: Netlify (builds from GitHub on push)
- **Public domain**: Squarespace DNS pointing to Netlify
- **Replit Publish/Deploy is NOT the production path**

## Netlify Configuration

`netlify.toml` at repo root configures (no `base` — builds run from repo root):
- Build command: `pnpm install --frozen-lockfile && pnpm run typecheck:libs && pnpm --filter @workspace/school-financial-model run build`
- Publish directory: `artifacts/school-financial-model/dist/public`
- Cache headers: `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` (Vite hashed filenames)
- Logo cache headers: `Cache-Control: public, max-age=86400` for `/logos/*`
- API proxy redirect: `/api/*` → API server (update `YOUR-API-HOST` with real domain before deploy)
- SPA catch-all redirect for client-side routing (`/* → /index.html`, status 200)
- `BASE_PATH=/` set in build environment (frontend deploys at domain root on Netlify)

### Netlify UI Settings
- **Package directory**: Set to `artifacts/school-financial-model` in Netlify UI (Build & deploy → Build settings). This tells Netlify which package in the monorepo is the site.
- **Environment variable**: `VITE_API_BASE_URL` — full URL of the API server (e.g., `https://api.schoolstack.ai`). Baked into the frontend at build time.

# System Architecture

## Brand System

The application adheres to the SchoolStack.ai brand system. SchoolStack Budget uses Amber (#D97706) as the parent brand accent and Evergreen (#328555) as the product-specific primary color. Deep Navy (#1E293B) is used for foreground elements, Teal (#0D9488) for accents, and Cream (#FAF9F7) for backgrounds. Typography uses Quicksand Bold for headings and Nunito Regular for body text and UI labels. The three-bar stacked mark is the official logo icon (SVG assets in `public/logos/`). Favicon uses the Budget three-bar mark variant.

## Technical Stack

The project is built as a pnpm workspace monorepo using TypeScript (v5.9).
- **Backend**: Node.js (v24), Express 5 API server, PostgreSQL database with Drizzle ORM, Zod for validation, Orval for OpenAPI-based API codegen.
- **Frontend**: React, Vite, Tailwind CSS v4. Route-based code splitting via React.lazy + Suspense; vendor chunks (recharts, framer-motion, react-hook-form) split via manualChunks. No single JS chunk exceeds 500KB.
- **Authentication**: JWT-based (bcryptjs for passwords, jsonwebtoken for tokens).
- **Build Tooling**: esbuild for CJS bundling.
- **Export Capabilities**: ExcelJS for standard Excel exports (with pre-computed formula results for viewer compatibility), xlsx-populate for template-based Lender Pro Forma Excel exports with preserved formulas, and PDFKit for PDF exports.

## Monorepo Structure

The monorepo is organized into `artifacts/` for deployable applications (`api-server`, `school-financial-model`), `lib/` for shared libraries (`api-spec`, `api-client-react`, `api-zod`, `db`), and `scripts/` for utility scripts. TypeScript composite projects are used, ensuring type-checking from the root and efficient build processes.

## Routing

### Public Routes (no auth required)
- `/` — Landing page
- `/underwriting` — Public 8-step underwriting wizard (localStorage-backed, no DB persistence)
- `/terms` — Terms of Service
- `/privacy` — Privacy Policy
- `/login` — Login page
- `/register` — Registration page (includes terms agreement checkbox)
- `/forgot-password` — Password reset request
- `/reset-password` — Password reset completion

### Protected Routes (auth required, redirects to /login if not authenticated)
- `/dashboard` — Model management dashboard
- `/model/:id` — Full 8-step wizard (DB-backed, autosave)
- `/admin` — Admin analytics dashboard

### API Routes
- `POST /api/public/export-underwriting` — Public endpoint, accepts full model JSON payload, returns 14-tab XLSX
- `POST /api/public/consultant` — Public endpoint, accepts full model JSON payload, returns consultant analysis JSON
- `GET /api/models/:id/export/underwriting` — Authenticated 14-tab underwriting workbook export
- `GET /api/models/:id/export` — Authenticated Excel workbook export
- `GET /api/models/:id/export/lender-proforma` — Authenticated Lender Pro Forma XLSX
- `GET /api/models/:id/export/pro-forma-pdf` — Authenticated Pro Forma PDF
- `GET /api/models/:id/export/loan-readiness-pdf` — Authenticated Loan Readiness PDF

## Feature Specifications

### Universal Financial Model
- **School Configuration**: Supports `microschool`, `private_school`, `charter_school`, `other` school types; `new_school` or `operating_school` stages; and `tuition_based`, `charter_public_funded`, `hybrid_mixed` funding profiles. All models project 5 years. Legacy models with fewer years are auto-normalized on load. Includes support for partial first years.
- **Programs & Enrollment**: Flexible program-based enrollment model. Users define custom programs (Full Day, Half Day, Four-Day, Drop-In, After School, etc.) each with its own tuition rate. Enrollment matrix shows programs as rows × year columns (prior/current year conditionally shown based on school stage). Tuition escalation (default 3%) applied to Years 2-5. Programs auto-sync totals to legacy `enrollment.year1-year5` fields for backward compatibility with export pipeline. Revenue = enrollment × escalated tuition per program per year.
- **Revenue Model**: Features 6 categories (e.g., `tuition_and_fees`, `public_funding`) with row-based line items. Each line item supports various driver types (`annual_fixed`, `monthly`, `per_student`, `percent_of_base`), optional per-line escalation rates, and payment timing configurations, with funding-profile-aware defaults. Includes a revenue source picker gateway (users check which revenue streams apply), funding-profile-aware guidance tips, per-student revenue context, and building capacity warnings.
- **Staffing Model**: FTE-based roster across function categories (e.g., `school_leadership`, `instructional`) and employment types (`full_time`, `part_time`, `contract`), including configurable benefits and payroll tax rates. Includes growth planning guidance (Year 1–5 staffing ratio projections), school-type benchmarks, and building capacity warnings.
- **Expense Model**: Row-based entries across 4 accounting categories (e.g., `instructional_program`, `occupancy_facility`) with flexible driver types. Features a category picker gateway (users check which expense categories apply before seeing detail fields) with contextual guidance, per-student cost context, and building capacity warnings. Includes a Business Operations section with yes/no toggle cards for bookkeeper, lawyer, general liability insurance, savings account, business account, credit card, and loan — answers auto-populate corresponding expense line items. Management fee question is housed in the Expenses step (not School Profile).
- **Capital & Debt Model**: Incorporates a loan calculator for PMT-based amortization. Business operations loan toggle auto-populates the Loan / Debt Service row.

### API Server (`api-server`)
Manages authentication (register, login, reset password), CRUD operations for financial models, and specialized endpoints for admin analytics and a consultant rules engine. It also orchestrates advanced Excel and PDF export functionalities, including a branded Lender Pro Forma and a 14-tab Underwriting Pro Forma workbook (DSCR, covenant checks, balance sheet, monthly cash flow, sources & uses). Includes a public export endpoint at `POST /api/public/export-underwriting` that requires no authentication.

#### Deployment
- **Dockerfile** at repo root (multi-stage: builds in Node 22 Alpine, copies `dist/` to minimal production image)
- **Build output**: `artifacts/api-server/dist/index.cjs` (single esbuild CJS bundle, ~3.5MB) + `dist/templates/` (Excel template)
- **Start**: `node dist/index.cjs` (or `pnpm --filter @workspace/api-server start`)
- **Health check**: `GET /api/healthz` returns `{"status":"ok","db":"connected"}` or `503` if DB unreachable
- **CORS**: Set `CORS_ORIGIN` env var to restrict origins (comma-separated). Omit for open CORS (dev only).
- **Rate limiting**: Public endpoints use PostgreSQL-backed rate limiter (`rate_limits` table). 5 requests per 60s window per IP. Survives server restarts. Stale entries cleaned every 5 minutes.
- **Required env vars**: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (production), `ADMIN_EMAILS`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, `APP_URL`

### Frontend (`school-financial-model`)
A React-based single-page application providing a user-friendly interface for model creation and management. It includes:
- Landing page with primary CTA routing to `/underwriting` (public wizard).
- Public underwriting wizard at `/underwriting` — 8-step flow (Profile, Enrollment, Revenue, Staffing, Expenses, Review, Analysis, Export) with localStorage persistence, consultant analysis, and public export. No account required.
- Authentication pages (login, register, forgot/reset password).
- A dashboard for model lifecycle management (create, duplicate, archive, delete).
- An 8-step authenticated wizard guiding users through financial model setup: Profile, Enrollment, Revenue, Staffing, Expenses, Review, Consultant, and Export. New users are auto-routed from registration directly into the wizard (model is auto-created).
- Dedicated admin analytics page (email allowlist protected) displaying key metrics like school stage distribution, export rates, and conversion funnels.
- Auth context with JWT stored in localStorage.
- API base URL configurable via `VITE_API_BASE_URL` env var (defaults to same-origin for local dev).

### Consultant Engine
A deterministic rules engine providing:
- Lender readiness scores (green/yellow/red).
- School-type-aware heuristics and advisory notes.
- Management fee analysis and warnings.
- Tuition tier-aware revenue calculations.
- Accounting-category diagnostics (e.g., occupancy ratio, software fragmentation).
- Five stress test scenarios: Enrollment -20%, Loss of Philanthropy, Cost Escalation, Revenue Delayed 3 Months, Interest Rate +2%.
- 5×5 sensitivity matrix (enrollment % × tuition % variations) showing final-year net income.
- Cash runway calculation (months until cash depletion).
- Industry benchmark comparisons on all key metrics (school-type-aware for charter vs private).
- Per-line-item escalation rates on revenue and expense rows (optional, falls back to year-by-year amounts).
- Prior-year variance analysis for operating schools.
- Fiscal-year-aligned monthly cash flow (respects `fiscalYearStartMonth`).

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval (generates client hooks and Zod schemas from OpenAPI spec)
- **Excel Export**: ExcelJS, xlsx-populate
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs (for password hashing), jsonwebtoken (for JWTs)
