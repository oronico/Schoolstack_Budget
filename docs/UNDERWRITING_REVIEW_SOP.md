# SchoolStack Budget — Underwriting Review SOP

**Purpose:** Standard operating procedure for reviewing financial models submitted through the SchoolStack Budget underwriting flow.
**Audience:** Internal reviewers, lending partners, and consultants.

---

## Overview

When a school founder completes the 8-step wizard at `/underwriting`, their financial model data is available for review. This SOP describes how to access, evaluate, and respond to submitted models.

---

## 1. Model Submission Flow

### How Models Arrive

1. Founder visits `budget.schoolstack.ai/underwriting` (no account required)
2. Completes 8 steps: Profile → Enrollment → Revenue → Staffing → Expenses → Review → Analysis → Export
3. At Step 8 (Export), the founder can:
   - Download their budget workbook (XLSX)
   - Download their underwriting package (XLSX)
   - View lending guidance based on their stated intent
4. The consultant endpoint (`POST /api/public/consultant`) generates an automated analysis available at Step 7

### Data Available for Review

| Data Point | Source Step | Description |
|-----------|------------|-------------|
| School name, type, state | Step 1 (Profile) | Basic school identity |
| Entity type, stage | Step 1 (Profile) | Nonprofit/for-profit, pre-opening or operating |
| Enrollment projections | Step 2 (Enrollment) | 5-year student count by year |
| Max capacity | Step 2 (Enrollment) | Facility capacity ceiling |
| Revenue sources | Step 3 (Revenue) | Tuition, per-pupil, grants, philanthropy |
| Staffing plan | Step 4 (Staffing) | Positions, salaries, benefits |
| Operating expenses | Step 5 (Expenses) | By category (occupancy, supplies, etc.) |
| Debt service | Step 5 (Expenses) | Annual payment, loan balance (if applicable) |
| Lending intent | Step 8 (Export) | "Budget only", "Maybe", or "Yes, apply" |

---

## 2. Review Workflow

### Step 1: Retrieve the Model

**Option A — Automated Analysis (JSON)**
The consultant endpoint returns a structured analysis:
```
POST /api/public/consultant
Content-Type: application/json
Body: { full model payload }
```

Response includes:
- `executiveSummary`: Plain-language financial overview
- `biggestStrength`: Top positive indicator
- `biggestRisk`: Top risk factor
- `keyMetrics`: Array of key financial metrics with status (healthy/warning/critical)
- `recommendations`: Actionable improvement suggestions

**Option B — Workbook Review (XLSX)**
Generate the underwriting workbook:
```
POST /api/public/export-underwriting
Content-Type: application/json
Body: { full model payload }
```

The workbook contains:
- **Assumptions tab**: All input assumptions in one view
- **5-Year Model tab**: Full P&L projection with formulas
- **Year 1 Pro Forma tab**: Detailed first-year breakdown

---

### Step 2: Evaluate Key Metrics

Review these 7 metrics (the consultant engine calculates them automatically):

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Revenue per Student | > $8,000 | $5,000–$8,000 | < $5,000 |
| Enrollment vs. Capacity | 60–90% | 40–60% or >90% | < 40% |
| Payroll as % of Revenue | < 65% | 65–80% | > 80% |
| Operating Surplus Margin | > 5% | 0–5% | Negative |
| Revenue Diversification | 3+ sources | 2 sources | 1 source |
| Year-over-Year Growth | Positive trend | Flat | Declining |
| DSCR (if debt) | > 1.25x | 1.0–1.25x | < 1.0x |

---

### Step 3: Assess School Type Context

Different school types have different financial profiles. Apply context:

**Microschools (15-50 students)**
- Expect lower absolute revenue
- Payroll concentration is normal (1-3 staff)
- Facility costs should be modest (home-based or small lease)
- Sustainability depends on tuition pricing and retention

**Private / Independent Schools (50-300 students)**
- Tuition is primary revenue driver
- ESA/voucher revenue may supplement
- Staff-to-student ratios matter for quality claims
- Financial aid budget impacts net tuition

**Charter Schools (100-500 students)**
- Per-pupil funding is primary and relatively predictable
- Federal grants (Title I, IDEA) supplement
- Facility costs are often the largest variable
- Authorizer requirements may set financial benchmarks

---

### Step 4: Flag Risk Factors

Document any of the following:

- [ ] Negative operating margin in any of the 5 years
- [ ] DSCR below 1.0x (cannot cover debt payments)
- [ ] Payroll exceeds 80% of revenue
- [ ] Revenue depends on a single source
- [ ] Enrollment projections exceed stated max capacity
- [ ] No enrollment growth assumed but expenses grow
- [ ] Start-up grant cliff (large grant ends with no replacement revenue)
- [ ] Unrealistic tuition escalation rates (>5% annually)

---

### Step 5: Prepare Response

**For lending review requests** (`lendingLabIntent: "plan_to_apply"`):
1. Generate the underwriting XLSX
2. Complete the metric evaluation above
3. Write a brief underwriting memo (2-3 paragraphs)
4. Recommend: Approve / Approve with conditions / Decline / Request more information

**For "want to understand" intent** (`lendingLabIntent: "want_to_understand"`):
1. Generate the consultant analysis
2. Share the executive summary and top recommendations
3. Offer a follow-up consultation

**For "budget only"** (`lendingLabIntent: "budget_only"`):
1. No lending review needed
2. Model is for the founder's planning purposes only

---

## 3. Response Templates

### Positive Review
> Thank you for submitting your financial model for [School Name]. Your 5-year projection shows [key strength], with a projected Year 5 revenue of $[amount] and an operating margin of [X]%. We'd like to discuss next steps for your lending application.

### Conditional Review
> Thank you for your submission. Your model for [School Name] shows promise in [area], but we've identified [concern] that we'd like to discuss. Specifically, [detail]. We recommend [action] before proceeding with a formal application.

### Request for More Information
> We've reviewed the initial model for [School Name]. To complete our assessment, we need additional information about [specific items]. Please update your model with [details] and resubmit, or schedule a consultation to walk through these items together.

---

## 4. Data Handling

- Model data submitted through the public wizard is **not stored server-side** unless the user creates an account and saves
- Public export endpoints are stateless — they generate workbooks from the submitted payload and return them immediately
- For lending reviews, save the underwriting workbook to the deal file
- All model data should be treated as confidential business information

---

## 5. Comprehensiveness Confirmation (K-12 Universal Coverage)

Before final lender-facing use, reviewers must confirm the model package is comprehensive across program type, scale, and funding method:

- **Program Types:** microschool, private independent/religious, charter, homeschool co-op, hybrid models
- **Scale Bands:** startup (<50 students), growth (50-250), scaled programs (250+)
- **Funding Types:** tuition, ADA/per-pupil public funding, ESA/vouchers, grants, philanthropy, mixed funding
- **Cost Structures:** staffing-heavy models, facility-heavy models, and debt-backed expansion models

### Required Trust Signals

- Workbook formulas are visible and traceable by underwriters in Excel
- Assumptions are editable without touching code (including escalation/inflation overrides)
- Static-contract expenses can remain non-escalating while other expenses escalate
- Output formatting is institutional-quality and ready for board/audit/lender review

If any of the signals above fail, classify the model as **"needs remediation before underwriting"** and return to export QA.

---
