# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Product: SchoolStack Budget** (by SchoolStack.ai)
A lightweight SaaS web app for school founders to create 5-year financial models with user accounts, saved drafts, CFO consultant feedback, and professional Excel exports.

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
- Admin: `src/routes/admin.ts` — `GET /api/admin/analytics` returns aggregate analytics (requires auth + admin). Admin check via `src/middlewares/admin.ts` verifies user email is in `ADMIN_EMAILS` env var (comma-separated list).
- Consultant: `GET /api/models/:id/consultant` — deterministic CFO rules engine analysis
- Excel export: `src/lib/excel-export.ts` — generates 7-tab workbook with real formulas (Assumptions, Enrollment, Revenue, Staffing, Operating Expenses, Five-Year Model, Summary). Revenue tab breaks out tuition, public/aid, and philanthropy. OpEx tab uses cost centers (facility, instructional, student services, admin, debt service). Summary includes DSCR metric.
- Event tracking: `src/lib/track-event.ts` — best-effort event tracking helper
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `artifacts/school-financial-model` (`@workspace/school-financial-model`)

React + Vite frontend (Tailwind CSS v4). Amber-forward brand with Quicksand/Nunito typography.

- Landing page, auth screens (register/login/forgot-password/reset-password)
- Dashboard with model management (create, duplicate, archive, delete)
- 8-step model wizard: Profile → Enrollment → Revenue → Staffing → Operations → Review → Consultant → Export
- Revenue step: Tuition & Fees, Public & Aid Revenue (ESA/voucher, per-pupil public funding), Philanthropy (donations, foundation grants, capital gifts)
- Operations step: Facility Costs (rent, utilities, insurance, maintenance), Instructional (curriculum, tech per student), Student Services (food, transport, counseling), Administrative (marketing, prof dev, other), Debt Service (loan amount, interest rate, term → PMT-calculated annual payment)
- Admin analytics page at /admin (protected by email allowlist)
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
