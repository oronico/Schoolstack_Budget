# SchoolStack Budget — Export QA Checklist

**Purpose:** Validate workbook exports meet quality standards before release.
**Applies to:** `/api/public/export-budget`, `/api/public/export-underwriting`, `/api/public/export-single-year`

---

## Pre-Test Setup

### Sample Payloads

Maintain 3 canonical test payloads covering different school types:

1. **Microschool** (Willow Tree Academy)
   - Type: microschool, State: TX, Pre-opening
   - 15→45 students over 5 years, max capacity 50
   - Revenue: Tuition ($8K/student) + Donations ($25K fixed)
   - Staff: Lead Teacher ($55K) + Assistant ($35K)

2. **Private with ESA** (Heritage Christian Academy)
   - Type: private_religious, State: AZ, 1-3 years operating
   - 80→220 students over 5 years, max capacity 250
   - Revenue: Tuition ($8K/student) + ESA Vouchers ($3.5K/student) + Fundraising
   - Staff: Principal + 6 Teachers + Office Manager

3. **Charter with Debt** (Harmony Charter School)
   - Type: charter, State: CO, Pre-opening
   - 150→400 students over 5 years, max capacity 450
   - Revenue: Per-Pupil ($9K/student) + Title I ($500/student) + Startup Grant
   - Staff: Executive Director + 10 Teachers + Ops Manager
   - Debt: $50K annual payment, $400K loan balance

---

## Structural Checks

For each exported workbook, verify:

### Tab Structure (Budget/Underwriting Public Export)
- [ ] Workbook contains 3 tabs (or 4 for operating schools)
- [ ] Tab 1: "Assumptions"
- [ ] Tab 2: "5-Year Model"
- [ ] Tab 3: "Year 1 Pro Forma"
- [ ] Tab 4 (operating schools only): "Actuals vs. Projections"

### Tab Structure (Single-Year Public Export)
- [ ] Workbook contains 5 tabs
- [ ] Tab 1: "Assumptions"
- [ ] Tab 2: "Revenue"
- [ ] Tab 3: "Personnel"
- [ ] Tab 4: "Operating Expenses"
- [ ] Tab 5: "P&L Summary"

### Data Integrity
- [ ] No cells contain `#REF!`
- [ ] No cells contain `#DIV/0!`
- [ ] No cells contain `#VALUE!`
- [ ] No cells contain `NaN`
- [ ] No cells contain the literal string `undefined`
- [ ] No cells contain the literal string `null`

### Formula Validation
- [ ] Formulas are present (not just static values)
- [ ] Formula count is reasonable (typically 86-107 per workbook)
- [ ] All formula results are numeric or valid strings

---

## Financial Content Checks

### Required Row Labels
- [ ] "Total Revenue" row exists
- [ ] "Total Operating Expenses" or "Total Expenses" row exists
- [ ] "Net Income", "Net Operating Income", or "Surplus/(Deficit)" row exists

### Revenue Section
- [ ] Each revenue source from the input appears as a row
- [ ] Year 1 amounts match or closely align with input values
- [ ] 5-year growth reflects escalation rates

### Staffing Section
- [ ] Each staff position from the input appears
- [ ] Salary × count matches expected payroll
- [ ] Benefits calculated at specified rates

### Expense Section
- [ ] Each expense category from the input appears
- [ ] Amounts match input values

### DSCR (Debt Service Coverage Ratio)
- [ ] Present when model includes debt service data
- [ ] Calculated as Net Operating Income / Annual Debt Payment
- [ ] Value is a reasonable number (typically 0.5x - 5.0x)

---

## Export-Specific Checks

### Budget Export (`/api/public/export-budget`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] File size is reasonable (10-20KB typical)
- [ ] File opens in Excel/Google Sheets without errors

### Underwriting Export (`/api/public/export-underwriting`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Same structural quality as budget export (both public endpoints produce the same formula-based workbook; the full 21-tab underwriting workbook is available through the authenticated export route)

### Single-Year Export (`/api/public/export-single-year`)
- [ ] Returns HTTP 200
- [ ] Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Contains 5 tabs (Assumptions, Revenue, Personnel, Operating Expenses, P&L Summary)
- [ ] Focuses on Year 1 data

---

## Automated Validation Script

Run the QA golden test suite:

```bash
pnpm --filter @workspace/api-server run qa:golden
```

Expected: 115 tests, 0 failures.

---

## Manual Spot Check

For at least one workbook per release:

1. Download the XLSX file
2. Open in Excel or Google Sheets
3. Verify formatting (headers, number formats, column widths)
4. Check that formulas recalculate when inputs are changed
5. Verify print layout is reasonable (no cut-off columns)
6. Confirm school name appears in header/title area
