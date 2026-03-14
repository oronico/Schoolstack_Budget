# SchoolStack Prelaunch Pro Forma Builder. Build Pack

## What I reviewed

I reviewed two things before drafting this pack:

1. The uploaded **Wildflower financial model**. It is useful, but much too complex for a teaser tool that needs to ship quickly.
2. The current **SchoolStack demo codebase**. It already includes React, an Express server, a FiveYearModel component, and xlsx export utilities, so this should be built as a **small add-on**, not a separate platform rebuild.

## Recommendation in one sentence

Ship a **5-step founder wizard** that writes inputs into a locked-in template workbook and exports a lender-friendly `.xlsx` with live formulas.

---

# 1. Workbook structure

Use this exact workbook structure.

## Sheet 1. Read Me
Purpose:
- explain how to use the file
- explain color key
- make clear this is a planning tool, not a final underwritten package

## Sheet 2. Assumptions
Purpose:
- the only sheet founders need to edit in Excel
- every yellow cell is a user input
- everything else in the workbook flows from here

Input blocks:
- Profile
- Enrollment & Pricing
- Staffing
- Facilities & Operating
- Capital & Debt

## Sheet 3. Drivers
Purpose:
- convert Year 1 inputs and growth assumptions into Year 1 to Year 5 drivers
- keep helper math out of the final underwriting view

This is where you calculate:
- tuition per student by year
- ESA per student by year
- grants by year
- salary escalation
- rent escalation
- debt service helpers
- contribution margin per student

## Sheet 4. Staffing
Purpose:
- compute teacher FTE automatically from enrollment
- compute admin/support staffing from manual assumptions
- roll payroll into total people cost

## Sheet 5. 5-Year P&L
Purpose:
- show the lender-facing operating view
- keep revenue, operating expense, CFADS, debt service, net income, and break-even enrollment together

## Sheet 6. Cash Flow & DSCR
Purpose:
- show liquidity and debt coverage
- calculate starting cash, ending cash, DSCR, days cash, runway, and enrollment above break-even

## Sheet 7. Loan Snapshot
Purpose:
- the quick-read export view for a loan officer or founder
- pull the most important lines into one page

---

# 2. Field map from form to workbook

Write form values to these exact cells on **Assumptions**.

| Field | Cell |
|---|---|
| schoolName | D5 |
| state | D6 |
| schoolType | D7 |
| firstOperatingYear | D8 |
| enrollmentY1 | D11 |
| enrollmentY2 | D12 |
| enrollmentY3 | D13 |
| enrollmentY4 | D14 |
| enrollmentY5 | D15 |
| tuitionPerStudentY1 | D18 |
| tuitionGrowthPct | D19 |
| esaPerStudentY1 | D20 |
| esaGrowthPct | D21 |
| otherEarnedPerStudentY1 | D22 |
| otherEarnedGrowthPct | D23 |
| collectionRatePct | D24 |
| grantsY1 | D25 |
| grantsGrowthPct | D26 |
| studentsPerTeacher | D29 |
| teacherSalaryY1 | D30 |
| teacherSalaryGrowthPct | D31 |
| adminFteY1 | D32 |
| adminFteY2 | D33 |
| adminFteY3 | D34 |
| adminFteY4 | D35 |
| adminFteY5 | D36 |
| adminSalaryY1 | D37 |
| adminSalaryGrowthPct | D38 |
| benefitsBurdenPct | D39 |
| annualRentY1 | D42 |
| rentGrowthPct | D43 |
| otherFacilityCostY1 | D44 |
| otherFacilityCostGrowthPct | D45 |
| programCostPerStudentY1 | D46 |
| programCostGrowthPct | D47 |
| fixedOperatingCostY1 | D48 |
| fixedOperatingCostGrowthPct | D49 |
| startingCash | D52 |
| existingAnnualDebtService | D53 |
| proposedLoanAmount | D54 |
| interestRatePct | D55 |
| termYears | D56 |

---

# 3. Exact lender-grade formulas

Below are the workbook formulas that matter most.

## Revenue build

### Net tuition revenue
On `Drivers`, Year 1 is `C12`:

```excel
=C7*C8*C11
```

Meaning:
- `C7` = enrollment
- `C8` = tuition per student
- `C11` = collection rate

### ESA/public funding revenue
On `Drivers`, Year 1 is `C13`:

```excel
=C7*C9
```

### Other earned revenue
On `Drivers`, Year 1 is `C14`:

```excel
=C7*C10*C11
```

### Total revenue
On `Drivers`, Year 1 is `C16`:

```excel
=SUM(C12:C15)
```

---

## Teacher staffing

### Teacher FTE
On `Staffing`, Year 1 is `C9`:

```excel
=IF(C8=0,0,ROUNDUP(C7/C8,0))
```

Meaning:
- `C7` = enrollment
- `C8` = students per teacher

This is intentionally simple and founder-friendly.

---

## People cost

### Teacher payroll
On `Staffing`, Year 1 is `C16`:

```excel
=C9*C14
```

### Admin payroll
On `Staffing`, Year 1 is `C17`:

```excel
=C10*C15
```

### Total cash payroll
On `Staffing`, Year 1 is `C18`:

```excel
=SUM(C16:C17)
```

### Benefits and payroll burden
On `Staffing`, Year 1 is `C20`:

```excel
=C18*C19
```

### Total people cost
On `Staffing`, Year 1 is `C21`:

```excel
=C18+C20
```

---

## Operating performance

### Total operating expenses
On `5-Year P&L`, Year 1 is `C19`:

```excel
=SUM(C14:C18)
```

### CFADS. Cash Flow Available for Debt Service
On `5-Year P&L`, Year 1 is `C21`:

```excel
=C11-C19
```

This is the correct numerator for a simplified loan-readiness model.

### Net income or loss
On `5-Year P&L`, Year 1 is `C23`:

```excel
=C21-C22
```

Where `C22` is total debt service.

---

## Debt service

Because PMT support can be inconsistent across tools, the template uses helper math instead of the Excel `PMT()` function.

### Monthly rate
On `Drivers`, Year 1 helper `C30`:

```excel
=Assumptions!$D$55/12
```

### Total payment months
On `Drivers`, Year 1 helper `C31`:

```excel
=Assumptions!$D$56*12
```

### Proposed monthly payment
On `Drivers`, Year 1 helper `C32`:

```excel
=IF(C31=0,0,IF(C30=0,Assumptions!$D$54/C31,(Assumptions!$D$54*C30)/(1-(1+C30)^(-C31))))
```

### Proposed annual debt service
On `Drivers`, Year 1 is `C26`:

```excel
=IF(C$2<=Assumptions!$D$56,C32*12,0)
```

### Total annual debt service
On `Drivers`, Year 1 is `C27`:

```excel
=C25+C26
```

Where `C25` is existing annual debt service.

---

## Coverage and liquidity

### DSCR
On `Cash Flow & DSCR`, Year 1 is `C14`:

```excel
=IF(C9=0,"",C8/C9)
```

Meaning:
- `C8` = CFADS
- `C9` = debt service

### Days cash on hand
On `Cash Flow & DSCR`, Year 1 is `C15`:

```excel
=IF('5-Year P&L'!C19=0,"",C11/'5-Year P&L'!C19*365)
```

### Months of runway
On `Cash Flow & DSCR`, Year 1 is `C16`:

```excel
=IF('5-Year P&L'!C19=0,"",C11/('5-Year P&L'!C19/12))
```

---

## Break-even enrollment

This is the most useful founder coaching metric in the model.

### Net recurring revenue per student
On `Drivers`, Year 1 is `C33`:

```excel
=IF(C7=0,0,(C12+C13+C14)/C7)
```

### Contribution margin per student
On `Drivers`, Year 1 is `C34`:

```excel
=C33-C23
```

Where `C23` is variable program cost per student.

### Fixed cash cost before grants
On `5-Year P&L`, Year 1 is `C31`:

```excel
=C14+C15+C16+C18+C22
```

### Net fixed cost after grants
On `5-Year P&L`, Year 1 is `C32`:

```excel
=C31-C10
```

### Break-even enrollment
On `5-Year P&L`, Year 1 is `C33`:

```excel
=IF(C30<=0,"",IF(C32<=0,0,ROUNDUP(C32/C30,0)))
```

This is the right simplified formula for your prelaunch tool.

---

# 4. UX wireframe for the founder form

Use a five-step wizard. Do not show spreadsheets in the UI.

## Step 1. School basics

```text
--------------------------------------------------
School Financial Model Builder
For founders applying to or preparing for Lending Lab
--------------------------------------------------
School name: [________________________]
State:       [__________]
Type:        [Microschool v]
Start year:  [2026 v]

                         [Save and continue]
```

## Step 2. Enrollment and revenue

```text
--------------------------------------------------
Step 2 of 5. Enrollment and revenue
--------------------------------------------------
Students Y1 [ 24 ]   Students Y2 [ 36 ]
Students Y3 [ 48 ]   Students Y4 [ 60 ]   Students Y5 [ 72 ]

Tuition / student Y1            [ 12000 ]
Tuition growth %                [ 3.0 ]
ESA / public funding / student  [ 0 ]
Other earned rev / student      [ 500 ]
Collection rate %               [ 95.0 ]
Grants / donations Y1           [ 25000 ]

[Back]                              [Continue]
```

## Step 3. Staffing

```text
--------------------------------------------------
Step 3 of 5. Staffing
--------------------------------------------------
Students per teacher           [ 12 ]
Teacher salary Y1              [ 55000 ]
Teacher salary growth %        [ 3.0 ]

Admin FTE Y1 [1.0] Y2 [1.0] Y3 [1.5] Y4 [2.0] Y5 [2.0]
Admin salary Y1                [ 65000 ]
Admin salary growth %          [ 3.0 ]
Benefits burden %              [ 10.0 ]

[Back]                              [Continue]
```

## Step 4. Facilities and debt

```text
--------------------------------------------------
Step 4 of 5. Facilities and debt
--------------------------------------------------
Annual rent Y1                 [ 48000 ]
Rent growth %                  [ 3.0 ]
Other facility cost Y1         [ 12000 ]
Program cost / student Y1      [ 1800 ]
Fixed operating cost Y1        [ 30000 ]
Starting cash                  [ 50000 ]
Existing annual debt service   [ 0 ]
Proposed loan amount           [ 75000 ]
Interest rate %                [ 8.0 ]
Term in years                  [ 5 ]

[Back]                              [Continue]
```

## Step 5. Review and export

```text
--------------------------------------------------
Step 5 of 5. Review
--------------------------------------------------
Year 1 revenue              $310,000
Year 1 CFADS               ($15,700)
Year 1 DSCR                 (0.9)x
Year 3 DSCR                  3.9x
Year 3 ending cash          $96,257
Break-even enrollment Y1        28

[ Download Excel ]   [ Email me a copy ]   [ Start loan inquiry ]
```

## UX rules

- Keep every step on one screen.
- Use plain English, not finance jargon, until the review page.
- Show a small help note under grants: “If it is not committed, put zero.”
- Show a small help note under collection rate: “Use the share of billed family revenue you expect to actually collect.”
- On the review page, surface only 5 to 6 metrics.
- Do not ask for monthly assumptions in v1.

---

# 5. Replit implementation plan

This should be built as a **small feature inside your existing app**, not a separate codebase.

## Why this fits your current stack

Your repo already runs an Express server and React client in Replit. The deployment model and environment setup are already a fit for a small add-on feature.

Your current repo also already includes xlsx export utilities, so the clean move is:

- add one server-side workbook generator
- add one API route
- add one client wizard page
- keep the template workbook in the repo under `/templates`

## Recommended package

Use **xlsx-populate** for the exporter, because it is designed for editing existing Excel workbooks while preserving workbook features and styles.

Install:

```bash
npm install xlsx-populate
```

## File placement

```text
server/
  services/
    proFormaExportService.js
  routes/
    proForma.js
client/
  src/
    components/
      Financial/
        ProFormaWizard.jsx
templates/
  SchoolStack_Prelaunch_ProForma_Template_v1.xlsx
```

## API contract

### POST `/api/pro-forma/export`
Body:

```json
{
  "schoolName": "Wildflower Learning House",
  "state": "SC",
  "schoolType": "Microschool",
  "firstOperatingYear": 2026,
  "enrollmentY1": 24,
  "enrollmentY2": 36,
  "enrollmentY3": 48,
  "enrollmentY4": 60,
  "enrollmentY5": 72,
  "tuitionPerStudentY1": 12000,
  "tuitionGrowthPct": 0.03,
  "esaPerStudentY1": 0,
  "esaGrowthPct": 0,
  "otherEarnedPerStudentY1": 500,
  "otherEarnedGrowthPct": 0.02,
  "collectionRatePct": 0.95,
  "grantsY1": 25000,
  "grantsGrowthPct": 0,
  "studentsPerTeacher": 12,
  "teacherSalaryY1": 55000,
  "teacherSalaryGrowthPct": 0.03,
  "adminFteY1": 1,
  "adminFteY2": 1,
  "adminFteY3": 1.5,
  "adminFteY4": 2,
  "adminFteY5": 2,
  "adminSalaryY1": 65000,
  "adminSalaryGrowthPct": 0.03,
  "benefitsBurdenPct": 0.10,
  "annualRentY1": 48000,
  "rentGrowthPct": 0.03,
  "otherFacilityCostY1": 12000,
  "otherFacilityCostGrowthPct": 0.03,
  "programCostPerStudentY1": 1800,
  "programCostGrowthPct": 0.03,
  "fixedOperatingCostY1": 30000,
  "fixedOperatingCostGrowthPct": 0.03,
  "startingCash": 50000,
  "existingAnnualDebtService": 0,
  "proposedLoanAmount": 75000,
  "interestRatePct": 0.08,
  "termYears": 5
}
```

Response:
- content type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- attachment filename: `school-name-5-year-pro-forma.xlsx`

## Validation rules

Before export:
- enrollment must be non-negative integers
- collection rate must be between 0 and 1
- growth rates should be between -0.25 and 0.50
- interest rate must be between 0 and 0.30
- term years must be between 1 and 15
- if proposedLoanAmount is 0, ignore interest and term for status checks

## Build order in Replit

### Day 1
- commit the template workbook to `/templates`
- install `xlsx-populate`
- create `proFormaExportService.js`

### Day 2
- add `POST /api/pro-forma/export`
- hardcode one sample payload and confirm the download works

### Day 3
- build `ProFormaWizard.jsx`
- connect form submit to the export route

### Day 4
- add validation + helpful copy
- add review page with Year 1 and Year 3 metrics

### Day 5
- QA with 3 scenarios
  - conservative case
  - healthy case
  - unrealistic case

### Day 6 to 7
- polish copy
- add optional email capture
- add a CTA to start a Lending Lab conversation

---

# 6. What not to build in v1

Do not build these yet:
- monthly cash flow
- scenario toggles
- accounting integrations
- Plaid pulls
- QuickBooks sync
- user accounts
- collaborative editing
- AI coaching inside the wizard

For the teaser, speed matters more than completeness.

---

# 7. Success metrics for this teaser

Track these from day one:
- number of completed exports
- number of partially completed forms
- median tuition assumption
- median Year 1 enrollment
- percentage of founders with negative Year 1 CFADS
- percentage of founders below 1.0x Year 1 DSCR
- percentage who click “Start loan inquiry” after export

That turns this from a calculator into a real underwriting funnel.

