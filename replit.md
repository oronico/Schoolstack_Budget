# Overview

SchoolStack Budget is a full-stack web application designed for school founders. It enables them to create comprehensive, lender-ready 3-to-5-year financial models. The platform offers a universal model adaptable to various school types (microschool, private, charter), stages (new or operating), and incorporates FTE-based staffing, accounting-category expenses, and sophisticated revenue scheduling. A key feature is the assumption-driven Excel export functionality, complete with cross-tab formulas, providing robust financial projections and analysis for strategic planning and securing funding. The project aims to empower school leaders with powerful financial tools to ensure sustainability and growth.

# User Preferences

I prefer iterative development with clear communication on significant changes. Please ask before making major architectural decisions or implementing new features that might diverge from the current design patterns. I appreciate concise explanations and a focus on functional programming principles where applicable.

# Deployment Architecture

- **Development**: Replit
- **Source of truth**: GitHub (push from Replit)
- **Production build/deploy**: Netlify (builds from GitHub on push)
- **Public domain**: Squarespace DNS pointing to Netlify
- **Replit Publish/Deploy is NOT the production path**

## Netlify Configuration

`netlify.toml` at repo root configures:
- Base directory: `artifacts/school-financial-model`
- Build command: full monorepo install + typecheck + Vite build
- Publish directory: `dist/public`
- Cache headers: `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` (Vite hashed filenames)
- SPA catch-all redirect for client-side routing (`/* → /index.html`, status 200)
- No API proxy — the frontend calls the API server directly via `VITE_API_BASE_URL`

### Required Netlify Environment Variables (set in Netlify UI → Site Settings → Environment Variables)
- `VITE_API_BASE_URL`: Full URL of the API server (e.g., `https://api.schoolstack.ai`). Baked into the frontend at build time.

# System Architecture

## Brand System

The application adheres to the SchoolStack.ai brand system, utilizing an amber-forward palette for the parent brand (#D97706) and a distinct green for product-specific elements (#16A34A). Deep navy (#1E293B) is used for foreground elements, teal (#0D9488) for accents, and cream (#FAF9F7) for backgrounds. Typography uses Quicksand Bold for headings and Nunito Regular for body text and UI labels.

## Technical Stack

The project is built as a pnpm workspace monorepo using TypeScript (v5.9).
- **Backend**: Node.js (v24), Express 5 API server, PostgreSQL database with Drizzle ORM, Zod for validation, Orval for OpenAPI-based API codegen.
- **Frontend**: React, Vite, Tailwind CSS v4.
- **Authentication**: JWT-based (bcryptjs for passwords, jsonwebtoken for tokens).
- **Build Tooling**: esbuild for CJS bundling.
- **Export Capabilities**: ExcelJS for standard Excel exports (with pre-computed formula results for viewer compatibility), xlsx-populate for template-based Lender Pro Forma Excel exports with preserved formulas, and PDFKit for PDF exports.

## Monorepo Structure

The monorepo is organized into `artifacts/` for deployable applications (`api-server`, `school-financial-model`), `lib/` for shared libraries (`api-spec`, `api-client-react`, `api-zod`, `db`), and `scripts/` for utility scripts. TypeScript composite projects are used, ensuring type-checking from the root and efficient build processes.

## Routing

### Public Routes (no auth required)
- `/` — Landing page
- `/underwriting` — Public 8-step underwriting wizard (localStorage-backed, no DB persistence)
- `/login` — Login page
- `/register` — Registration page
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
- **School Configuration**: Supports `microschool`, `private_school`, `charter_school`, `other` school types; `new_school` (3-year default) or `operating_school` (4-year default, extendable to 5) stages; and `tuition_based`, `charter_public_funded`, `hybrid_mixed` funding profiles. Includes support for partial first years.
- **Revenue Model**: Features 6 categories (e.g., `tuition_and_fees`, `public_funding`) with row-based line items. Each line item supports various driver types (`annual_fixed`, `monthly`, `per_student`, `percent_of_base`) and optional payment timing configurations, with funding-profile-aware defaults.
- **Staffing Model**: FTE-based roster across function categories (e.g., `school_leadership`, `instructional`) and employment types (`full_time`, `part_time`, `contract`), including configurable benefits and payroll tax rates.
- **Expense Model**: Row-based entries across 4 accounting categories (e.g., `instructional_program`, `occupancy_facility`) with flexible driver types.
- **Capital & Debt Model**: Incorporates a loan calculator for PMT-based amortization.

### API Server (`api-server`)
Manages authentication (register, login, reset password), CRUD operations for financial models, and specialized endpoints for admin analytics and a consultant rules engine. It also orchestrates advanced Excel and PDF export functionalities, including a branded Lender Pro Forma and a 14-tab Underwriting Pro Forma workbook (DSCR, covenant checks, balance sheet, monthly cash flow, sources & uses). Includes a public export endpoint at `POST /api/public/export-underwriting` that requires no authentication.

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
- Three stress test scenarios with projected impacts.
- Prior-year variance analysis for operating schools.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **API Codegen**: Orval (generates client hooks and Zod schemas from OpenAPI spec)
- **Excel Export**: ExcelJS, xlsx-populate
- **PDF Export**: PDFKit
- **Authentication**: bcryptjs (for password hashing), jsonwebtoken (for JWTs)
