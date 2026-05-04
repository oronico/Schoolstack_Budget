import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable } from "@workspace/db";

// Task #531 — Seed preview environments with realistic demo data.
//
// Per-PR Railway environments (see README "Preview environments" + the
// netlify.toml deploy-preview block) come up with a fresh, empty Postgres.
// Without seed data, a reviewer landing on the deploy-preview URL has to
// register a brand-new account and rebuild a model from scratch just to
// smoke-test a UI change — which kills the whole point of per-PR previews.
//
// This module inserts:
//   1. A single known demo user (`demo@schoolstack.ai` / `demo1234`) that
//      reviewers can log in with directly. It is a verified `users` row
//      (NOT a pending_signups row), so the standard /auth/login flow works
//      with no email round-trip.
//   2. Two complete `financial_models` rows owned by that user — one
//      microschool and one private school — both at currentStep 7 (the
//      Review/Export step) so reviewers see populated charts, exports,
//      and the consultant engine immediately on opening the model.
//
// The seed is idempotent and self-gating: it runs only when the `users`
// table is empty. That single check is the safety net that prevents this
// from ever clobbering production (which always has users) — see the
// SKIP_PREVIEW_SEED escape hatch below for belt-and-suspenders.

export const DEMO_USER_EMAIL = "demo@schoolstack.ai";
export const DEMO_USER_PASSWORD = "demo1234";
const DEMO_USER_NAME = "Demo Reviewer";

const MICROSCHOOL_MODEL = {
  name: "Oakwood Learning Studio (Demo Microschool)",
  schoolStage: "new_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName: "Oakwood Learning Studio",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 45,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      facilityCity: "Scottsdale",
      facilityState: "AZ",
      ownershipType: "rent",
      monthlyRent: 2200,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
    },
    enrollment: {
      year1: 20, year2: 26, year3: 32, year4: 37, year5: 40,
      retentionRate: 88, applicationsReceived: 35, waitlistCount: 8,
    },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [14, 18, 22, 26, 28] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [4, 5, 7, 8, 9] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 40, studentCounts: [2, 3, 3, 3, 3] },
    ],
    tuitionEscalation: { rate: 3 },
    revenue: {
      tuitionPerStudent: 10000, annualTuitionIncrease: 3,
      annualDonations: 12000, foundationGrants: 18000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10300, 10609, 10927, 11255], escalationRate: 3, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", enabled: true, driverType: "percent_of_base", amounts: [8, 8, 8, 8, 8], percentBase: "gross_tuition", billingMonths: 10 },
      { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", enabled: true, driverType: "annual_fixed", amounts: [8000, 7000, 5000, 4000, 3000], grantStatus: "projected", receiptQuarter: 1 },
      { id: "grants", category: "philanthropy", lineItem: "Startup Grant (Foundation)", enabled: true, driverType: "annual_fixed", amounts: [15000, 10000, 5000, 0, 0], grantStatus: "confirmed", receiptQuarter: 2 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Founder / Lead Teacher", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 58000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Owner-operator", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 38000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Part-Time Aide", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 24000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Y2", staffingMode: "ratio", studentRatio: 15, minFte: 0, maxFte: 2, startYear: 2 },
    ],
    facilities: {
      monthlyRent: 2200, annualRentIncrease: 3, annualUtilities: 4200,
      annualInsurance: 2800, curriculumCostPerStudent: 450,
      techCostPerStudent: 350, annualMarketing: 3500,
      annualSalaryIncrease: 3, generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [2200, 2266, 2334, 2404, 2476], escalationRate: 3 },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [4200, 4326, 4456, 4590, 4728] },
      { id: "e3", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [2800, 2884, 2971, 3060, 3152] },
      { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [450, 450, 450, 450, 450] },
      { id: "e5", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [2400, 2472, 2546, 2622, 2701] },
      { id: "e6", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [3500, 3000, 2500, 2000, 1800] },
      { id: "e7", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [4500, 4635, 4774, 4917, 5065] },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [8000, 2000, 1500, 1000, 500], isLoan: false },
      { id: "cd2", lineItem: "SchoolStack Lending Lab Microloan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 20000, loanRate: 6.5, loanTermYears: 5, purpose: "startup" },
    ],
    openingBalances: { cash: 12000, accountsReceivable: 0, fixedAssets: 3000 },
    scenarios: [
      { name: "Conservative (20% fewer students)", enrollmentAdjustment: -20, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Aggressive (15% more students)", enrollmentAdjustment: 15, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.25, minDaysCashOnHand: 30, minMonthsRunway: 2, minCapacityUtil: 0.5 },
  },
};

const PRIVATE_SCHOOL_MODEL = {
  name: "Riverside Christian Academy (Demo Private School)",
  schoolStage: "operating_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName: "Riverside Christian Academy",
      state: "FL",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      schoolStage: "operating_school",
      fundingProfile: "tuition_based",
      openingYear: 2023,
      currentStudents: 185,
      maxCapacity: 400,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      locationSecured: true,
      ownershipType: "own",
      hasMortgage: true,
      mortgageMonthlyPayment: 8500,
      lendingLabIntent: "want_to_understand",
      debtIncluded: true,
    },
    enrollment: { year1: 200, year2: 250, year3: 300, year4: 350, year5: 400, retentionRate: 92 },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [130, 160, 200, 230, 260] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 10, studentCounts: [40, 50, 60, 70, 80] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 50, studentCounts: [30, 40, 40, 50, 60] },
    ],
    tuitionEscalation: { rate: 4 },
    revenue: {
      tuitionPerStudent: 12500, annualTuitionIncrease: 4,
      annualDonations: 75000, foundationGrants: 50000, capitalGifts: 25000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Annual Tuition (K-8)", enabled: true, driverType: "per_student", amounts: [12500, 13000, 13520, 14061, 14623], escalationRate: 4, billingMonths: 10 },
      { id: "r2", category: "tuition_and_fees", lineItem: "Registration & Activity Fees", enabled: true, driverType: "per_student", amounts: [750, 750, 750, 750, 750] },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid", enabled: true, driverType: "percent_of_base", amounts: [12, 12, 12, 12, 12], percentBase: "gross_tuition" },
      { id: "r3", category: "philanthropy", lineItem: "Annual Fund Donations", enabled: true, driverType: "annual_fixed", amounts: [75000, 85000, 95000, 100000, 110000] },
      { id: "r4", category: "philanthropy", lineItem: "Foundation Grants", enabled: true, driverType: "annual_fixed", amounts: [50000, 40000, 30000, 25000, 20000] },
      { id: "r5", category: "other_revenue", lineItem: "After-School Programs", enabled: true, driverType: "per_student", amounts: [500, 500, 500, 500, 500] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 72000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Lead Teachers (K-8)", functionCategory: "instructional", employmentType: "full_time", fte: 12, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio-driven 1:18", staffingMode: "ratio", studentRatio: 18, minFte: 8, maxFte: 22 },
      { id: "s4", roleName: "Teaching Assistants", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s5", roleName: "Office Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s6", roleName: "Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
    ],
    facilities: {
      annualUtilities: 24000, annualInsurance: 18000,
      facilityMaintenance: 18000, curriculumCostPerStudent: 600,
      techCostPerStudent: 350, annualMarketing: 15000,
      annualSalaryIncrease: 3, generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "instructional_program", lineItem: "Curriculum & Textbooks", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600] },
      { id: "e2", category: "technology", lineItem: "Technology (Devices + Software)", enabled: true, driverType: "per_student", amounts: [350, 350, 350, 350, 350] },
      { id: "e3", category: "occupancy_facility", lineItem: "Utilities & Maintenance", enabled: true, driverType: "annual_fixed", amounts: [36000, 38000, 40000, 42000, 44000] },
      { id: "e4", category: "administrative_general", lineItem: "Insurance (General + D&O)", enabled: true, driverType: "annual_fixed", amounts: [18000, 19000, 20000, 21000, 22000] },
      { id: "e5", category: "administrative_general", lineItem: "Marketing & Enrollment", enabled: true, driverType: "annual_fixed", amounts: [15000, 12000, 10000, 8000, 8000] },
      { id: "e6", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [8000, 10000, 12000, 14000, 15000] },
      { id: "e7", category: "administrative_general", lineItem: "Accounting & Legal", enabled: true, driverType: "annual_fixed", amounts: [12000, 12500, 13000, 13500, 14000] },
    ],
    capitalAndDebtRows: [
      { id: "d1", lineItem: "Building Mortgage", enabled: true, driverType: "annual_fixed", amounts: [102000, 102000, 102000, 102000, 102000], isLoan: true, loanPrincipal: 1200000, loanRate: 5.5, loanTermYears: 25 },
      { id: "d2", lineItem: "Renovation Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 150000, loanRate: 7, loanTermYears: 10 },
    ],
    openingBalances: { cash: 120000, fixedAssets: 850000, longTermDebt: 1200000 },
    priorYearSnapshot: { endingEnrollment: 185, totalRevenue: 2400000, totalExpenses: 2200000, endingCash: 120000 },
    scenarios: [
      { name: "Slow Growth (flat enrollment Y2-3)", enrollmentAdjustment: -15, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Strong Growth (+10% enrollment)", enrollmentAdjustment: 10, tuitionAdjustment: 0, expenseAdjustment: 5, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.2, minDaysCashOnHand: 45, minMonthsRunway: 3, minCapacityUtil: 0.6 },
  },
};

export interface SeedPreviewDataDeps {
  database?: typeof db;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
}

/**
 * Seed the demo user + sample financial models, but only when the
 * `users` table is empty. Safe to call on every startup; a no-op once
 * the database has any user (real or seeded).
 *
 * Behavior:
 *   - SKIP_PREVIEW_SEED=true        → skip unconditionally (prod safety)
 *   - DATABASE_URL not configured   → skip with warning (no DB to seed)
 *   - any users already exist       → skip silently
 *   - users table empty             → insert demo user + 2 models
 *
 * Errors are logged but never thrown — a failed seed must not prevent
 * the API from starting up. The DB-emptiness check is the single
 * source of truth for "should we seed?", which keeps prod safe even
 * if SKIP_PREVIEW_SEED is forgotten.
 */
export async function seedPreviewDataIfEmpty(deps: SeedPreviewDataDeps = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;
  const database = deps.database ?? db;

  if (process.env.SKIP_PREVIEW_SEED === "true") {
    log("[seed] SKIP_PREVIEW_SEED=true — skipping preview-data seed.");
    return;
  }

  if (!database) {
    log("[seed] DATABASE_URL not configured — skipping preview-data seed.");
    return;
  }

  try {
    const existingUsers = await database
      .select({ id: usersTable.id })
      .from(usersTable)
      .limit(1);

    if (existingUsers.length > 0) {
      // Database has at least one user — assume this is either
      // production or an already-seeded preview. Either way, nothing
      // to do.
      return;
    }

    log("[seed] Empty users table — seeding demo user and sample models...");

    const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 12);
    const [demoUser] = await database
      .insert(usersTable)
      .values({
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_NAME,
        passwordHash,
        schoolName: "Demo School",
        profileRole: "founder",
        planningStage: "planning",
        termsAcceptedAt: new Date(),
      })
      .returning();

    log(`[seed] Created demo user: ${demoUser.email} (id=${demoUser.id})`);

    for (const sample of [MICROSCHOOL_MODEL, PRIVATE_SCHOOL_MODEL]) {
      const [model] = await database
        .insert(financialModelsTable)
        .values({
          userId: demoUser.id,
          name: sample.name,
          status: "complete",
          currentStep: 7,
          data: sample.data,
          schoolStage: sample.schoolStage,
          fundingProfile: sample.fundingProfile,
        })
        .returning({ id: financialModelsTable.id, name: financialModelsTable.name });
      log(`[seed]   + model: ${model.name} (id=${model.id})`);
    }

    log(
      `[seed] Done. Reviewers can log in with ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}.`,
    );
  } catch (err) {
    // A failed seed must not prevent the server from starting. The
    // worst-case outcome is reviewers see an empty preview and have
    // to register manually — same as before this script existed.
    logError("[seed] Failed to seed preview data:", err);
  }
}
