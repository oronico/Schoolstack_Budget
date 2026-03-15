# SchoolStack Budget

A full-stack financial modeling platform for school founders to create lender-ready 5-year projections. Built for microschools, private schools, and charter schools.

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933)

---

## Overview

SchoolStack Budget helps school founders build comprehensive financial models through an intuitive step-by-step wizard. The platform generates investor-grade Excel workbooks and PDF reports that are ready for lender review.

### Key Features

- **8-Step Financial Model Wizard** — Profile, Enrollment, Revenue, Staffing, Expenses, Review, Consultant Analysis, and Export
- **Public Underwriting Wizard** — Try the full tool without creating an account (localStorage-backed)
- **Consultant Engine** — Automated lender-readiness scoring, stress testing, and sensitivity analysis with industry benchmarks
- **Excel Export** — 14-tab workbook with live formulas, formatted for lender presentations
- **PDF Reports** — Printable financial summaries
- **Admin Dashboard** — Usage analytics and model tracking
- **Authentication** — JWT-based registration and login with persistent data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Radix UI, Recharts |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Auth | JWT (bcrypt + jsonwebtoken) |
| Export | ExcelJS, PDFKit |
| API Layer | OpenAPI spec → Orval → Zod schemas + React Query hooks |
| Monorepo | pnpm workspaces |

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
└── attached_assets/              # Brand assets & templates
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Push database schema
pnpm --filter @workspace/db run db:push

# Start development servers
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/school-financial-model run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT token signing |
| `PORT` | API server port (default: 3000) |

---

## Financial Model Wizard

The wizard walks school founders through eight steps:

1. **School Profile** — Type (charter, private, microschool), state, stage, funding profile
2. **Enrollment** — 5-year student count projections with growth modeling
3. **Revenue** — Row-based scheduling with per-student, fixed, and custom drivers
4. **Staffing** — FTE-based roster with function categories, benefits, and payroll taxes
5. **Operating Expenses** — Category-based expense tracking across 5 years
6. **Review** — Input validation and summary before analysis
7. **Consultant Analysis** — Lender-readiness score, cash runway, stress tests, benchmarks
8. **Export** — 14-tab Excel workbook and PDF report generation

### Excel Workbook Tabs

| Tab | Contents |
|-----|----------|
| Assumptions | School profile and model parameters |
| Enrollment & Rev Drivers | Student growth and revenue driver details |
| Tuition & Funding Detail | Revenue line items by year |
| Staffing Plan | Full compensation schedule with benefits |
| Operating Expenses | Expense categories across 5 years |
| Facilities & Occupancy | Facility-related costs |
| Sources & Uses | Startup capital structure |
| Debt Schedule | Loan amortization tables |
| Cash Flow Monthly Y1 | Month-by-month Year 1 cash flow |
| 5-Year P&L | Income statement with margins |
| 5-Year Balance Sheet | Assets, liabilities, and equity |
| DSCR & Covenants | Debt service coverage ratios |
| Underwriting Snapshot | Key metrics summary |
| Summary | Executive overview |

---

## API Endpoints

### Public (No Auth)

- `POST /api/public/export-underwriting` — Generate Excel workbook from wizard data
- `POST /api/public/consultant` — Run consultant analysis engine

### Authenticated

- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `GET /api/models` — List saved models
- `POST /api/models` — Save a financial model
- `GET /api/admin/analytics` — Admin usage dashboard

---

## Deployment

- **Frontend**: Netlify (static build from `artifacts/school-financial-model`)
- **API Server**: Railway or any Docker-compatible host
- **Database**: Railway PostgreSQL or any managed Postgres

See `DEPLOYMENT_GUIDE.md` for detailed deployment instructions.

---

## Brand

| Element | Value |
|---------|-------|
| Primary | Amber `#D97706` |
| Secondary | Evergreen `#328555` |
| Dark | Deep Navy `#1E293B` |
| Background | Cream `#FAF9F7` |
| Accent | Teal `#0D9488` |
| Headings | Quicksand Bold |
| Body | Nunito |

---

## License

MIT
