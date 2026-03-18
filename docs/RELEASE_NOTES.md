# SchoolStack Budget — Alpha Release Notes

**Version:** Alpha 1.0
**Release Date:** March 2026
**URL:** https://budget.schoolstack.ai

---

## What is SchoolStack Budget?

SchoolStack Budget is a financial modeling tool built for school founders. It helps users create lender-ready 5-year financial projections through a guided wizard — no finance degree required.

---

## What Ships in Alpha

### Guided Financial Wizard (8 Steps)

1. **School Profile** — Name, type, state, entity structure, and stage
2. **Enrollment** — Year-by-year student projections with capacity planning
3. **Revenue** — Multiple revenue sources (tuition, per-pupil funding, grants, philanthropy) with per-student or fixed drivers and escalation rates
4. **Staffing** — Position-by-position payroll planning with benefits rates and start/end year control
5. **Expenses** — Category-based operating expense entry (occupancy, supplies, technology, etc.)
6. **Review** — Real-time financial summary with 5-year P&L overview
7. **Analysis** — AI-powered consultant analysis with key metrics, risk flags, and recommendations
8. **Export** — Download professional Excel workbooks and submit for lending review

### School Types Supported

- Microschools
- Private / Independent Schools
- Faith-Based / Parochial Schools
- Charter Schools
- Hybrid Schools
- Learning Pods / Co-ops

### Export Workbooks

Export formats available:

**Public Exports (no account required):**

| Export | Contents |
|--------|----------|
| **Budget Workbook** | Assumptions + 5-Year Model + Year 1 Pro Forma (3 tabs; 4 for operating schools) |
| **Underwriting Package** | Same formula-based structure as budget export |
| **Single-Year Extract** | 5-tab breakdown: Assumptions, Revenue, Personnel, Operating Expenses, P&L Summary |

**Authenticated Exports (account required):**

| Export | Contents |
|--------|----------|
| **Lender Pro Forma (XLSX)** | 8-tab workbook: Cover, Assumptions, Drivers, 5-Year P&L, Cash Flow & DSCR, Staffing, Loan Snapshot, Summary |
| **Underwriting Model (XLSX)** | 21-tab full underwriting workbook |
| **Lender Packet (PDF)** | Branded PDF with executive summary, DSCR analysis, risk/mitigant assessment |
| **Board Summary (PDF)** | Board-ready PDF summary |
| **Pro Forma (PDF)** | Single-page financial summary |

All Excel workbooks include:
- Live Excel formulas (not static values)
- Revenue, expense, and net income totals
- DSCR calculation for models with debt service
- School-specific assumptions page

### Consultant Analysis

Automated financial analysis covering:
- Executive summary of the school's financial position
- 7 key financial metrics with health indicators
- Biggest strength and biggest concern
- Actionable recommendations for improvement

### User Accounts

- Email/password registration and login
- Password reset via email
- Dashboard with saved models
- Multiple models per account

### Public Underwriting Flow

The `/underwriting` route allows users to build a complete financial model and generate exports without creating an account. Designed for quick evaluation and lending submissions.

### Inline Coaching

Context-sensitive help cards throughout the wizard:
- Adapts to user's guidance level (Basics, Standard, Advanced)
- Explains financial concepts in plain language
- Provides benchmarks and best practices

---

## Technical Details

### Architecture
- **Frontend:** React + Vite SPA, hosted on Netlify CDN
- **API:** Node.js + Express, hosted on Railway
- **Database:** PostgreSQL (Railway managed)
- **Auth:** JWT-based with bcrypt password hashing

### Performance
- Code-split wizard steps (React.lazy)
- Main bundle: 226KB
- Largest chunk: 421KB (chart vendor)
- All chunks under 500KB

### Security
- CORS locked to allowed origins
- JWT tokens with expiration
- Passwords hashed with bcrypt
- No model data stored for unauthenticated users

---

## Known Limitations

1. PDF exports available only through authenticated flow (public wizard is Excel-only)
2. Single-user accounts (no team collaboration)
3. No scenario comparison tool (planned)
4. 38 non-blocking TypeScript warnings in codebase
5. Railway health endpoints need redeploy to activate new `/api/health` and `/api/ready`

---

## What's Next

Planned for future releases:
- Scenario planner (side-by-side "what if" comparisons)
- PDF export with branded formatting
- School model type system (type-specific defaults, guidance, and vocabulary)
- Team/organization accounts
- Improved mobile wizard experience
