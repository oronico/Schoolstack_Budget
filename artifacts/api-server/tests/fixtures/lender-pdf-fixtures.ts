/**
 * Task #895 — Real-founder-shaped lender-PDF fixtures.
 *
 * The seeded demos (microschool / private / charter) cover the
 * "happy paths" the wizard ships with. Founders who upload their own
 * data routinely produce shapes the demos don't:
 *   - multiple concurrent loans on the cap table (mortgage + reno
 *     line + equipment financing),
 *   - philanthropy-heavy years where confirmed restricted gifts
 *     dominate Y1-Y2 revenue,
 *   - capital campaigns whose pledged inflows land mid-cycle (Y2-Y3)
 *     instead of all at opening, paired with a Y2 facility step-up,
 *   - voucher + scholarship-discount stacks on the same seat (e.g.
 *     FL FES-EO families who also receive in-house need-based aid).
 *
 * Each fixture is a small derivative of the microschool baseline
 * with only the fields needed to exercise its scenario rewritten,
 * keeping diffs tight when the formatter changes. They are exported
 * here as `data`-shaped payloads (no name / schoolStage wrapper) so
 * the snapshot test can pass them straight to `runConsultantEngine`
 * and `buildLenderPacket` the same way it does the seeded demos.
 *
 * The labels (`multi_debt_stack`, `restricted_gifts_heavy`,
 * `capital_campaign_mid_cycle`, `voucher_scholarship_combo`) are the
 * filename suffixes used under `tests/__snapshots__/lender-pdf-*.txt`.
 */
import { MICROSCHOOL_DEMO } from "../../src/lib/demo-models/microschool.js";

type ModelDataShape = typeof MICROSCHOOL_DEMO.data;

export interface LenderPdfFixture {
  label: string;
  data: ModelDataShape;
}

// Deep-clone the baseline so per-fixture mutations stay isolated.
function cloneBaseline(): ModelDataShape {
  return JSON.parse(JSON.stringify(MICROSCHOOL_DEMO.data)) as ModelDataShape;
}

// ── Fixture 1: multi-debt stack ────────────────────────────────────────
// A founder carrying a real-estate mortgage, a renovation line of
// credit, and equipment financing all at once. The lender packet's
// debt-service / DSCR / cap-table sections must aggregate three
// loans, not one, and render each with the right label.
function multiDebtStack(): ModelDataShape {
  const data = cloneBaseline();
  data.schoolProfile = {
    ...data.schoolProfile,
    schoolName: "Three-Loan Stack Microschool",
    ownershipType: "own",
    hasMortgage: true,
    mortgageMonthlyPayment: 6500,
  } as ModelDataShape["schoolProfile"];
  data.capitalAndDebtRows = [
    {
      id: "cd1",
      lineItem: "FF&E (Furniture, Fixtures & Equipment)",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [12000, 3000, 2000, 1500, 1000],
      isLoan: false,
    },
    {
      id: "cd2",
      lineItem: "Building Mortgage",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [78000, 78000, 78000, 78000, 78000],
      isLoan: true,
      loanPrincipal: 850000,
      loanRate: 6.25,
      loanTermYears: 25,
      purpose: "facility",
    },
    {
      id: "cd3",
      lineItem: "Renovation Line of Credit",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      isLoan: true,
      loanPrincipal: 175000,
      loanRate: 8.5,
      loanTermYears: 10,
      purpose: "renovation",
    },
    {
      id: "cd4",
      lineItem: "Equipment Financing (kitchen + AV)",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      isLoan: true,
      loanPrincipal: 60000,
      loanRate: 7.0,
      loanTermYears: 5,
      purpose: "startup",
    },
    {
      id: "cd5",
      lineItem: "SchoolStack Lending Lab Microloan",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      isLoan: true,
      loanPrincipal: 25000,
      loanRate: 6.5,
      loanTermYears: 5,
      purpose: "startup",
    },
  ] as ModelDataShape["capitalAndDebtRows"];
  data.openingBalances = {
    cash: 95000,
    accountsReceivable: 0,
    fixedAssets: 880000,
    longTermDebt: 1110000,
  } as ModelDataShape["openingBalances"];
  return data;
}

// ── Fixture 2: restricted-gift-heavy revenue ───────────────────────────
// Founder whose Y1-Y2 plan leans heavily on confirmed restricted
// philanthropy (named program gifts, family foundation grants,
// church partnership). Stress-tests the philanthropy formatter,
// `grantStatus` rendering, and the consultant's grant-concentration
// commentary.
function restrictedGiftsHeavy(): ModelDataShape {
  const data = cloneBaseline();
  data.schoolProfile = {
    ...data.schoolProfile,
    schoolName: "Gift-Anchored Founding Microschool",
  } as ModelDataShape["schoolProfile"];
  data.revenueRows = [
    { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10300, 10609, 10927, 11255], escalationRate: 3, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
    { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
    { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", enabled: true, driverType: "percent_of_base", amounts: [8, 8, 8, 8, 8], percentBase: "gross_tuition", billingMonths: 10 },
    { id: "named_program_gift", category: "philanthropy", lineItem: "Named Program Gift (Restricted)", enabled: true, driverType: "annual_fixed", amounts: [120000, 90000, 60000, 30000, 0], grantStatus: "confirmed", receiptQuarter: 1 },
    { id: "family_foundation", category: "philanthropy", lineItem: "Family Foundation Grant (Restricted)", enabled: true, driverType: "annual_fixed", amounts: [85000, 60000, 40000, 20000, 0], grantStatus: "confirmed", receiptQuarter: 2 },
    { id: "church_partnership", category: "philanthropy", lineItem: "Sponsoring Church Partnership", enabled: true, driverType: "annual_fixed", amounts: [50000, 50000, 35000, 25000, 15000], grantStatus: "confirmed", receiptQuarter: 1 },
    { id: "annual_fund", category: "philanthropy", lineItem: "Annual Fund (Unrestricted)", enabled: true, driverType: "annual_fixed", amounts: [25000, 35000, 50000, 65000, 80000], grantStatus: "projected", receiptQuarter: 4 },
    { id: "diocesan_grant_pending", category: "philanthropy", lineItem: "Diocesan Operating Grant (Pending)", enabled: true, driverType: "annual_fixed", amounts: [40000, 40000, 25000, 0, 0], grantStatus: "projected", receiptQuarter: 3 },
  ] as unknown as ModelDataShape["revenueRows"];
  return data;
}

// ── Fixture 3: capital campaign mid-cycle + Y2 facility step-up ────────
// Founder running a multi-year capital campaign whose biggest
// pledges land in Y2 and Y3, paired with a facility step-up in Y2
// (the campus moves from a 2,200/mo storefront to a 9,500/mo permanent
// site). Exercises non-monotonic facility costs, capital inflows that
// aren't all at opening, and the consultant engine's handling of
// step-changes between forecast years.
function capitalCampaignMidCycle(): ModelDataShape {
  const data = cloneBaseline();
  data.schoolProfile = {
    ...data.schoolProfile,
    schoolName: "Campaign-Cycle Microschool",
    monthlyRent: 2200,
  } as ModelDataShape["schoolProfile"];
  data.revenueRows = [
    ...data.revenueRows,
    { id: "campaign_lead_gift", category: "philanthropy", lineItem: "Capital Campaign — Lead Gift", enabled: true, driverType: "annual_fixed", amounts: [0, 250000, 0, 0, 0], grantStatus: "confirmed", receiptQuarter: 2 },
    { id: "campaign_major_gifts", category: "philanthropy", lineItem: "Capital Campaign — Major Gifts (Pledged)", enabled: true, driverType: "annual_fixed", amounts: [0, 175000, 200000, 75000, 0], grantStatus: "projected", receiptQuarter: 3 },
    { id: "campaign_community_phase", category: "philanthropy", lineItem: "Capital Campaign — Community Phase", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 90000, 60000, 25000], grantStatus: "projected", receiptQuarter: 4 },
  ] as unknown as ModelDataShape["revenueRows"];
  data.expenseRows = [
    { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [2200, 9500, 9785, 10079, 10381], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [4200, 18500, 19055, 19627, 20216] },
    { id: "e3", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [2800, 8400, 8652, 8912, 9180] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [450, 450, 450, 450, 450] },
    { id: "e5", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [2400, 4800, 4944, 5092, 5245] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [3500, 6000, 4500, 3500, 3000] },
    { id: "e7", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [4500, 7500, 7725, 7957, 8196] },
  ] as unknown as ModelDataShape["expenseRows"];
  data.capitalAndDebtRows = [
    { id: "cd1", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [8000, 65000, 5000, 2500, 1500], isLoan: false },
    { id: "cd2", lineItem: "Permanent-Site Build-Out (Phase 1)", enabled: true, driverType: "annual_fixed", amounts: [0, 280000, 0, 0, 0], isLoan: false },
    { id: "cd3", lineItem: "Bridge Loan Pending Campaign Receipts", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 200000, loanRate: 7.5, loanTermYears: 7, purpose: "facility" },
  ] as unknown as ModelDataShape["capitalAndDebtRows"];
  return data;
}

// ── Fixture 4: voucher + scholarship combo on the same seat ────────────
// Florida-style FES-EO voucher families that also receive in-house
// need-based aid. The engine has to net the voucher against gross
// tuition AND apply the percent-of-tuition scholarship row, so this
// fixture pins the formatted output of both adjustments together.
function voucherScholarshipCombo(): ModelDataShape {
  const data = cloneBaseline();
  data.schoolProfile = {
    ...data.schoolProfile,
    schoolName: "Voucher + Aid Stacked Microschool",
    state: "FL",
  } as ModelDataShape["schoolProfile"];
  data.revenueRows = [
    { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [11500, 11845, 12200, 12566, 12943], escalationRate: 3, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
    { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [350, 350, 350, 350, 350], billingMonths: 12 },
    { id: "voucher_revenue", category: "school_choice", lineItem: "FL FES-EO Voucher", enabled: true, driverType: "per_student", amounts: [8200, 8400, 8600, 8800, 9000] },
    { id: "tax_credit_scholarship", category: "school_choice", lineItem: "Step Up Tax-Credit Scholarship", enabled: true, driverType: "per_student", amounts: [7800, 7800, 8000, 8000, 8200] },
    { id: "scholarships_aid", category: "tuition_offsets", lineItem: "In-House Need-Based Aid (% of Gross Tuition)", enabled: true, driverType: "percent_of_base", amounts: [18, 18, 16, 15, 14], percentBase: "gross_tuition", billingMonths: 10 },
    { id: "sibling_discount_row", category: "tuition_offsets", lineItem: "Sibling Discount (% of Gross Tuition)", enabled: true, driverType: "percent_of_base", amounts: [6, 6, 6, 6, 6], percentBase: "gross_tuition", billingMonths: 10 },
    { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", enabled: true, driverType: "annual_fixed", amounts: [8000, 7000, 5000, 4000, 3000], grantStatus: "projected", receiptQuarter: 1 },
  ] as unknown as ModelDataShape["revenueRows"];
  data.tuitionTiers = [
    { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [6, 8, 10, 12, 13] },
    { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [3, 4, 5, 6, 7] },
    { id: "t3", tierType: "voucher_recipient", label: "FES-EO Voucher", discountPercent: 0, studentCounts: [8, 10, 12, 14, 15] },
    { id: "t4", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 40, studentCounts: [3, 4, 5, 5, 5] },
  ] as unknown as ModelDataShape["tuitionTiers"];
  return data;
}

export const LENDER_PDF_FIXTURES: LenderPdfFixture[] = [
  { label: "multi_debt_stack",            data: multiDebtStack() },
  { label: "restricted_gifts_heavy",      data: restrictedGiftsHeavy() },
  { label: "capital_campaign_mid_cycle",  data: capitalCampaignMidCycle() },
  { label: "voucher_scholarship_combo",   data: voucherScholarshipCombo() },
];
