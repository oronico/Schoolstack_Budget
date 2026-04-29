# SchoolStack Budget

**Every school deserves a clear financial plan.**

A full-stack financial modeling platform for school founders to create lender-ready 5-year projections. Built for microschools, private schools, charter schools, pods, and co-ops.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-24-339933)
![License](https://img.shields.io/badge/license-MIT-blue)

**Production:** [budget.schoolstack.ai](https://budget.schoolstack.ai)

---

## Overview

SchoolStack Budget walks school founders through a comprehensive 5-year financial model, step by step, in plain English. The platform generates investor-grade Excel workbooks and PDF reports ready for lender review, board presentations, and strategic planning.

### Key Features

- **8-Step Financial Model Wizard** — Profile, Enrollment, Revenue, Staffing, Expenses, Review, Consultant Analysis, Export
- **Public Underwriting Wizard** — Try the full tool at `/underwriting` without creating an account (localStorage-backed)
- **Scenario Planner** — Up to 3 named what-if scenarios with adjustment sliders and deep comparison mode
- **Decision Engine** — "What should I fix first?" panel surfacing the top 3 financial issues with severity ranking and fix-it navigation
- **Budgeting Co-Pilot** — Three guidance levels (basics/advanced/extra), inline explainer cards, and KPI formula transparency drawers
- **Consultant Engine** — Lender-readiness scoring, 5 stress tests, 5×5 sensitivity matrix, cash runway, industry benchmarks, Lending Lab readiness assessment
- **4 Excel Export Formats** — Formula (3-tab), Lender Pro Forma (8-tab), Underwriting V2 (21-tab), Legacy (14-tab, deprecated)
- **Lender Packet** — Branded PDF + JSON deliverable with risk/mitigant pairs, DSCR summary, and operating reserve analysis
- **PDF Reports** — Printable pro forma summaries and board-ready packets
- **Admin Dashboard** — Usage analytics, model tracking, feedback management
- **Authentication** — JWT-based registration/login with persistent data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Radix UI, Recharts |
| Backend | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Auth | JWT (bcrypt + jsonwebtoken) |
| Export | ExcelJS, PDFKit |
| Email | Resend (transactional) |
| API Layer | OpenAPI spec → Orval → Zod schemas + React Query hooks |
| Monorepo | pnpm workspaces with catalog version management |

---

## Project Structure

```
├── artifacts/
│   ├── school-financial-model/   # React frontend SPA
│   ├── api-server/               # Express API server
│   └── mockup-sandbox/           # UI component development
├── lib/
│   ├── db/                       # Drizzle schema & database client
│   ├── api-spec/                 # OpenAPI YAML specifications
│   ├── api-zod/                  # Auto-generated Zod schemas
│   └── api-client-react/         # Auto-generated React Query hooks
├── scripts/                      # Build & deploy utilities
├── docs/                         # Release docs, QA reports, SOPs
└── attached_assets/              # Brand assets & reference materials
```

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL database

### Installation

```bash
pnpm install

# Push database schema (no migration files — uses drizzle-kit push)
pnpm --filter @workspace/db run push

# Start development servers
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/school-financial-model run dev
```

### Automated Checks

Two validation steps run together as the project's CI gate (the same checks
Replit invokes when verifying a task):

| Step | Command |
|------|---------|
| `test` | `pnpm --filter @workspace/school-financial-model run test` |
| `e2e` | `E2E_PORT=23192 E2E_START_SERVERS=1 pnpm --filter @workspace/school-financial-model run test:e2e` |

The `e2e` step boots its own Vite dev server (on the dedicated port `23192`
to avoid colliding with the regular `school-financial-model` dev workflow on
22092) and reuses the running api-server on port 8080 via Playwright's
`webServer` config (gated on `E2E_START_SERVERS=1`). It runs the Playwright
suite under `artifacts/school-financial-model/e2e/`, and a failure blocks
validation just like a failing unit test, so deep-link regressions (e.g. the
saved-scenario "Replace export" handoff) cannot land silently.

> Note: `pnpm run typecheck` is intentionally *not* part of the validation
> gate yet — the existing TypeScript baseline has pre-existing errors in
> `school-financial-model`, `api-server`, and `budget-allhands` that need
> dedicated cleanup before it can be re-enabled.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for JWT token signing |
| `PORT` | No | API server port (default: 8080) |
| `RESEND_API_KEY` | No | Resend API key for transactional emails |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowed origins |
| `EMAIL_FROM` | No | Sender address for outgoing emails |
| `APP_URL` | No | Public URL of the frontend application |
| `VITE_API_BASE_URL` | No | API base URL for the frontend (production only) |

---

## Financial Model Wizard

The wizard walks school founders through eight steps:

1. **School Profile** — Type (charter, private, microschool, pod, co-op), state, stage, funding profile, Lending Lab intent
2. **Enrollment** — 5-year student count projections with growth modeling
3. **Revenue** — Row-based scheduling across 6 categories with per-student, fixed, and custom drivers
4. **Staffing** — FTE-based roster with function categories, benefits, and payroll taxes
5. **Operating Expenses** — Category-based expense tracking with flexible drivers across 5 years
6. **Review** — Input validation and summary before analysis
7. **Consultant Analysis** — Lender-readiness score, cash runway, stress tests, sensitivity matrix, benchmarks, Decision Engine
8. **Export** — Excel workbooks and PDF reports

**Post-wizard:** Scenario Planner (accessible from dashboard for completed models) with side-by-side comparison and deep comparison mode.

### Export Formats

| Format | Tabs | Description |
|--------|------|-------------|
| Formula Export | 3 | Assumptions, 5-Year Model, Year 1 Pro Forma (public, no auth required) |
| Lender Pro Forma | 8 | Cover, Assumptions, Drivers, 5-Year P&L, Cash Flow & DSCR, Staffing, Loan Snapshot, Summary |
| Underwriting V2 | 21 | Full underwriting model with monthly cash flow, balance sheet, debt schedule, scenarios |
| Lender Packet | PDF/JSON | Branded deliverable with risk/mitigant analysis, DSCR summary, reserve analysis |
| Legacy Underwriting | 14 | Deprecated — scheduled for removal Q3 2026 |

---

## API Endpoints

### Public (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/public/export-underwriting` | Generate Formula Export workbook |
| `POST` | `/api/public/consultant` | Run consultant analysis engine |

### Authenticated

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| `PATCH` | `/api/auth/guidance-level` | Update guidance mode preference |
| `GET` | `/api/models` | List saved models |
| `POST` | `/api/models` | Save a financial model |
| `GET` | `/api/models/:id/export/excel` | Standard Excel export |
| `GET` | `/api/models/:id/export/lender-proforma` | 8-tab Lender Pro Forma |
| `GET` | `/api/models/:id/export/underwriting-v2` | 21-tab Underwriting workbook |
| `GET` | `/api/models/:id/export/lender-packet` | Lender Packet (JSON) |
| `GET` | `/api/models/:id/export/lender-packet-pdf` | Lender Packet (PDF) |
| `GET/PUT` | `/api/models/:id/scenarios` | Scenario Planner CRUD |
| `POST` | `/api/feedback` | Submit user feedback |
| `GET` | `/api/admin/analytics` | Admin usage dashboard |
| `GET` | `/api/admin/feedback` | Admin feedback management |

---

## Deployment

| Component | Platform | Details |
|-----------|----------|---------|
| Frontend | Netlify | Static build from GitHub, proxies `/api/*` to Railway |
| API Server | Railway | Docker-based deployment |
| Database | Railway | Managed PostgreSQL |
| DNS | Squarespace | Points `budget.schoolstack.ai` to Netlify |

Build configuration is in `netlify.toml`. See `docs/DEPLOYMENT_GUIDE.md` for detailed procedures.

---

## Brand

| Element | Value | Hex |
|---------|-------|-----|
| Evergreen (product primary) | ![#328555](https://via.placeholder.com/12/328555/328555.png) | `#328555` |
| Amber (parent brand accent) | ![#D97706](https://via.placeholder.com/12/D97706/D97706.png) | `#D97706` |
| Deep Navy (foreground) | ![#1E293B](https://via.placeholder.com/12/1E293B/1E293B.png) | `#1E293B` |
| Cream (background) | ![#FAF9F7](https://via.placeholder.com/12/FAF9F7/FAF9F7.png) | `#FAF9F7` |
| Teal (accent) | ![#0D9488](https://via.placeholder.com/12/0D9488/0D9488.png) | `#0D9488` |
| Space Blue (cross-sell) | ![#4A7CB8](https://via.placeholder.com/12/4A7CB8/4A7CB8.png) | `#4A7CB8` |
| Headings | Quicksand Bold | — |
| Body | Nunito | — |

---

## Documentation

| File | Contents |
|------|----------|
| `docs/DEPLOYMENT_GUIDE.md` | Railway + Netlify deployment procedures |
| `docs/ALPHA_RELEASE_CHECKLIST.md` | Launch gates and verification checklist |
| `docs/QA_REPORT.md` | Full test results from alpha QA pass |
| `docs/EXPORT_QA_CHECKLIST.md` | Workbook validation criteria |
| `docs/UNDERWRITING_REVIEW_SOP.md` | How to review submitted financial models |
| `docs/RELEASE_NOTES.md` | Feature list, known limitations, roadmap |

---

## License

MIT
