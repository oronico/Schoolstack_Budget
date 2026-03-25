import { db } from "@workspace/db";
import { financialModelsTable, exportsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runConsultantEngine } from "../lib/consultant-engine.js";
import { generateWorkbook } from "../lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../lib/underwriting-workbook.js";
import { buildLenderPacket } from "../lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../lib/packets/board-packet-pdf.js";
import type { ModelData } from "../lib/workbook-helpers.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface SampleModel {
  name: string;
  slug: string;
  schoolStage: "new_school" | "operating_school";
  fundingProfile: "tuition_based" | "charter_public_funded" | "hybrid_mixed";
  data: Record<string, unknown>;
}

const MICROSCHOOL: SampleModel = {
  name: "Bright Horizons Microschool (Legislator Sample)",
  slug: "Bright_Horizons_Microschool",
  schoolStage: "new_school",
  fundingProfile: "hybrid_mixed",
  data: {
    schoolProfile: {
      schoolName: "Bright Horizons Microschool",
      state: "TX",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      maxCapacity: 40,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      ownershipType: "rent",
      monthlyRent: 2500,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
    },
    enrollment: { year1: 15, year2: 22, year3: 30, year4: 35, year5: 40, retentionRate: 90 },
    revenue: { tuitionPerStudent: 8500, annualTuitionIncrease: 3, annualDonations: 25000, foundationGrants: 15000 },
    revenueRows: [
      { id: "r1", category: "tuition_and_fees", lineItem: "Annual Tuition", enabled: true, driverType: "per_student", amounts: [8500, 8500, 8500, 8500, 8500], escalationRate: 3 },
      { id: "r2", category: "philanthropy", lineItem: "Community Donations", enabled: true, driverType: "annual_fixed", amounts: [25000, 20000, 15000, 12000, 10000], escalationRate: 0 },
      { id: "r3", category: "grants_contributions", lineItem: "Startup Grant", enabled: true, driverType: "annual_fixed", amounts: [15000, 10000, 5000, 0, 0], escalationRate: 0 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Lead Teacher / Founder", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 52000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s2", roleName: "Assistant Teacher", functionCategory: "instructional", employmentType: "part_time", fte: 0.75, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s3", roleName: "Part-Time Aide", functionCategory: "student_support", employmentType: "part_time", fte: 0.5, annualizedRate: 18000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
    ],
    expenseRows: [
      { id: "e1", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [400, 400, 400, 400, 400], escalationRate: 2, note: "" },
      { id: "e2", category: "technology", lineItem: "Technology & Software", enabled: true, driverType: "annual_fixed", amounts: [3000, 3200, 3400, 3600, 3800], escalationRate: 0, note: "" },
      { id: "e3", category: "administrative_general", lineItem: "General Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [2400, 2500, 2600, 2700, 2800], escalationRate: 0, note: "" },
      { id: "e4", category: "administrative_general", lineItem: "Marketing & Outreach", enabled: true, driverType: "annual_fixed", amounts: [2000, 1500, 1200, 1000, 800], escalationRate: 0, note: "" },
      { id: "e5", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [350, 370, 390, 410, 430], escalationRate: 0, note: "" },
    ],
    capitalAndDebtRows: [
      { id: "d1", lineItem: "Startup Equipment & Furnishing", enabled: true, driverType: "annual_fixed", amounts: [12000, 0, 0, 0, 0], note: "Desks, shelving, supplies", isLoan: false, loanPrincipal: 0, loanRate: 0, loanTermYears: 0 },
      { id: "d2", lineItem: "Microschool Microloan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "SchoolStack Lending Lab", isLoan: true, loanPrincipal: 25000, loanRate: 6, loanTermYears: 5 },
    ],
    openingBalances: { cash: 8000 },
    scenarios: [
      { name: "Conservative (20% fewer students)", enrollmentAdjustment: -20, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Growth (10% more students, 5% tuition up)", enrollmentAdjustment: 10, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.25, minDaysCashOnHand: 30, minMonthsRunway: 2, minCapacityUtil: 0.5 },
  },
};

const PRIVATE_SCHOOL: SampleModel = {
  name: "Riverside Christian Academy (Legislator Sample)",
  slug: "Riverside_Christian_Academy",
  schoolStage: "operating_school",
  fundingProfile: "tuition_based",
  data: {
    schoolProfile: {
      schoolName: "Riverside Christian Academy",
      state: "FL",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      schoolStage: "operating_school",
      openingYear: 2023,
      currentStudents: 185,
      maxCapacity: 400,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      locationSecured: true,
      ownershipType: "own",
      propertyTaxAnnual: 0,
      hasMortgage: true,
      mortgageMonthlyPayment: 8500,
      lendingLabIntent: "want_to_understand",
      debtIncluded: true,
    },
    enrollment: { year1: 200, year2: 250, year3: 300, year4: 350, year5: 400, retentionRate: 92 },
    revenue: { tuitionPerStudent: 12500, annualTuitionIncrease: 4, annualDonations: 75000, foundationGrants: 50000, capitalGifts: 25000 },
    revenueRows: [
      { id: "r1", category: "tuition_and_fees", lineItem: "Annual Tuition (K-8)", enabled: true, driverType: "per_student", amounts: [12500, 12500, 12500, 12500, 12500], escalationRate: 4 },
      { id: "r2", category: "tuition_and_fees", lineItem: "Registration & Activity Fees", enabled: true, driverType: "per_student", amounts: [750, 750, 750, 750, 750], escalationRate: 2 },
      { id: "r3", category: "philanthropy", lineItem: "Annual Fund Donations", enabled: true, driverType: "annual_fixed", amounts: [75000, 85000, 95000, 100000, 110000], escalationRate: 0 },
      { id: "r4", category: "grants_contributions", lineItem: "Foundation Grants", enabled: true, driverType: "annual_fixed", amounts: [50000, 40000, 30000, 25000, 20000], escalationRate: 0 },
      { id: "r5", category: "other_revenue", lineItem: "After-School Programs", enabled: true, driverType: "per_student", amounts: [500, 500, 500, 500, 500], escalationRate: 3 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s2", roleName: "Assistant Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 72000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s3", roleName: "Lead Teachers (K-8)", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "12 FTE total" },
      { id: "s4", roleName: "Teaching Assistants", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "6 FTE total" },
      { id: "s5", roleName: "Office Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s6", roleName: "Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s7", roleName: "Maintenance / Custodial", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 32000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
    ],
    expenseRows: [
      { id: "e1", category: "instructional_program", lineItem: "Curriculum & Textbooks", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600], escalationRate: 3, note: "" },
      { id: "e2", category: "technology", lineItem: "Technology (Devices + Software)", enabled: true, driverType: "per_student", amounts: [350, 350, 350, 350, 350], escalationRate: 4, note: "" },
      { id: "e3", category: "occupancy_facility", lineItem: "Utilities & Maintenance", enabled: true, driverType: "annual_fixed", amounts: [36000, 38000, 40000, 42000, 44000], escalationRate: 0, note: "" },
      { id: "e4", category: "administrative_general", lineItem: "Insurance (General + D&O)", enabled: true, driverType: "annual_fixed", amounts: [18000, 19000, 20000, 21000, 22000], escalationRate: 0, note: "" },
      { id: "e5", category: "administrative_general", lineItem: "Marketing & Enrollment", enabled: true, driverType: "annual_fixed", amounts: [15000, 12000, 10000, 8000, 8000], escalationRate: 0, note: "" },
      { id: "e6", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [8000, 10000, 12000, 14000, 15000], escalationRate: 0, note: "" },
      { id: "e7", category: "administrative_general", lineItem: "Accounting & Legal", enabled: true, driverType: "annual_fixed", amounts: [12000, 12500, 13000, 13500, 14000], escalationRate: 0, note: "" },
    ],
    capitalAndDebtRows: [
      { id: "d1", lineItem: "Building Mortgage", enabled: true, driverType: "annual_fixed", amounts: [102000, 102000, 102000, 102000, 102000], note: "Monthly mortgage payment", isLoan: true, loanPrincipal: 1200000, loanRate: 5.5, loanTermYears: 25 },
      { id: "d2", lineItem: "Renovation Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "Phase 2 expansion", isLoan: true, loanPrincipal: 150000, loanRate: 7, loanTermYears: 10 },
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

const CHARTER_SCHOOL: SampleModel = {
  name: "Liberty STEM Charter School (Legislator Sample)",
  slug: "Liberty_STEM_Charter",
  schoolStage: "new_school",
  fundingProfile: "charter_public_funded",
  data: {
    schoolProfile: {
      schoolName: "Liberty STEM Charter School",
      state: "AZ",
      schoolType: "charter_school",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      maxCapacity: 600,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      ownershipType: "rent",
      monthlyRent: 18000,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
      gradeBandEnrollment: {
        k5: [120, 160, 210, 260, 310],
        m68: [80, 110, 140, 170, 200],
        h912: [0, 30, 50, 70, 90],
      },
      gradeBandPerPupil: { k5: 8200, m68: 8800, h912: 9500 },
      enrollmentRevenueMethod: "adm",
    },
    enrollment: { year1: 200, year2: 300, year3: 400, year4: 500, year5: 600, retentionRate: 88 },
    revenue: { publicFundingPerStudent: 8500 },
    revenueRows: [
      { id: "r1", category: "public_funding", lineItem: "State Per-Pupil Funding (K-5)", enabled: true, driverType: "per_student", amounts: [8200, 8200, 8200, 8200, 8200], escalationRate: 2 },
      { id: "r2", category: "public_funding", lineItem: "State Per-Pupil Funding (6-8)", enabled: true, driverType: "per_student", amounts: [8800, 8800, 8800, 8800, 8800], escalationRate: 2 },
      { id: "r3", category: "public_funding", lineItem: "Title I Federal Funding", enabled: true, driverType: "per_student", amounts: [1200, 1200, 1200, 1200, 1200], escalationRate: 0 },
      { id: "r4", category: "grants_contributions", lineItem: "Charter Startup Grant (CSPP)", enabled: true, driverType: "annual_fixed", amounts: [250000, 150000, 0, 0, 0], escalationRate: 0 },
      { id: "r5", category: "other_revenue", lineItem: "After-School & Summer Programs", enabled: true, driverType: "per_student", amounts: [300, 300, 300, 300, 300], escalationRate: 2 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Executive Director", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 110000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s2", roleName: "Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 90000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s3", roleName: "Dean of Students", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "" },
      { id: "s4", roleName: "STEM Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "Starting 8 FTE, scaling to 24" },
      { id: "s5", roleName: "General Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "Starting 4 FTE, scaling to 12" },
      { id: "s6", roleName: "Special Education Staff", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "2 FTE" },
      { id: "s7", roleName: "Office & Finance Staff", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "3 FTE" },
      { id: "s8", roleName: "Custodial / Maintenance", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 35000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "2 FTE" },
    ],
    expenseRows: [
      { id: "e1", category: "instructional_program", lineItem: "STEM Lab Equipment & Curriculum", enabled: true, driverType: "per_student", amounts: [800, 600, 500, 450, 400], escalationRate: 2, note: "" },
      { id: "e2", category: "technology", lineItem: "1:1 Chromebooks + Infrastructure", enabled: true, driverType: "per_student", amounts: [450, 300, 250, 200, 200], escalationRate: 0, note: "" },
      { id: "e3", category: "occupancy_facility", lineItem: "Utilities & Building Maintenance", enabled: true, driverType: "annual_fixed", amounts: [48000, 55000, 65000, 75000, 85000], escalationRate: 0, note: "" },
      { id: "e4", category: "administrative_general", lineItem: "Insurance (GL, D&O, Workers Comp)", enabled: true, driverType: "annual_fixed", amounts: [35000, 40000, 48000, 55000, 60000], escalationRate: 0, note: "" },
      { id: "e5", category: "administrative_general", lineItem: "Legal, Audit & Compliance", enabled: true, driverType: "annual_fixed", amounts: [25000, 28000, 30000, 32000, 35000], escalationRate: 0, note: "" },
      { id: "e6", category: "instructional_program", lineItem: "Student Transportation", enabled: true, driverType: "per_student", amounts: [400, 400, 400, 400, 400], escalationRate: 3, note: "" },
      { id: "e7", category: "instructional_program", lineItem: "Food Service (subsidized)", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600], escalationRate: 2, note: "" },
      { id: "e8", category: "administrative_general", lineItem: "Marketing & Community Outreach", enabled: true, driverType: "annual_fixed", amounts: [20000, 15000, 12000, 10000, 8000], escalationRate: 0, note: "" },
    ],
    capitalAndDebtRows: [
      { id: "d1", lineItem: "Facility Build-Out (Phase 1)", enabled: true, driverType: "annual_fixed", amounts: [350000, 0, 0, 0, 0], note: "Classroom renovation", isLoan: false, loanPrincipal: 0, loanRate: 0, loanTermYears: 0 },
      { id: "d2", lineItem: "Facility Expansion Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "Phase 2 buildout Y3", isLoan: true, loanPrincipal: 500000, loanRate: 6.5, loanTermYears: 15, purpose: "startup" },
      { id: "d3", lineItem: "Equipment Financing", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "STEM lab equipment", isLoan: true, loanPrincipal: 75000, loanRate: 5.5, loanTermYears: 5, purpose: "startup" },
    ],
    openingBalances: { cash: 200000, fixedAssets: 100000 },
    scenarios: [
      { name: "Conservative (25% fewer students)", enrollmentAdjustment: -25, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: -10, facilityAdjustment: 0 },
      { name: "State funding cut (-10%)", enrollmentAdjustment: 0, tuitionAdjustment: -10, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Full capacity ahead of plan", enrollmentAdjustment: 15, tuitionAdjustment: 0, expenseAdjustment: 5, staffingAdjustment: 10, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.15, minDaysCashOnHand: 45, minMonthsRunway: 3, minCapacityUtil: 0.7 },
  },
};

const SAMPLES = [MICROSCHOOL, PRIVATE_SCHOOL, CHARTER_SCHOOL];

async function exportModel(modelData: Record<string, unknown>, slug: string, outDir: string, modelId: number) {
  const consultantOutput = runConsultantEngine(modelData);
  const typedData = modelData as unknown as ModelData;

  const formulaBuffer = await generateWorkbook(modelData, consultantOutput);
  fs.writeFileSync(path.join(outDir, `${slug}_Formula_Workbook.xlsx`), formulaBuffer);
  console.log(`  ✓ Formula Workbook (${formulaBuffer.length} bytes)`);

  const uwWorkbook = await generateUnderwritingWorkbook(modelData);
  const uwBuffer = Buffer.from(await uwWorkbook.xlsx.writeBuffer());
  fs.writeFileSync(path.join(outDir, `${slug}_Underwriting_Package.xlsx`), uwBuffer);
  console.log(`  ✓ Underwriting Package (${uwBuffer.length} bytes)`);

  const lenderPacket = buildLenderPacket(typedData, consultantOutput, modelId);
  const lenderPdf = await generateLenderPacketPDF(lenderPacket);
  fs.writeFileSync(path.join(outDir, `${slug}_Lender_Packet.pdf`), lenderPdf);
  console.log(`  ✓ Lender Packet PDF (${lenderPdf.length} bytes)`);

  const boardPacket = buildBoardPacket(typedData, consultantOutput, modelId);
  const boardPdf = await generateBoardPacketPDF(boardPacket);
  fs.writeFileSync(path.join(outDir, `${slug}_Board_Summary.pdf`), boardPdf);
  console.log(`  ✓ Board Summary PDF (${boardPdf.length} bytes)`);
}

async function main() {
  const outDir = path.resolve(process.cwd(), "legislator-samples");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (!adminEmail) {
    console.error("ADMIN_EMAILS env var not set. Cannot determine owner user.");
    process.exit(1);
  }
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
  if (!adminUser) {
    console.error(`Admin user not found for email: ${adminEmail}`);
    process.exit(1);
  }
  const userId = adminUser.id;

  console.log(`Generating legislator sample models as user ${userId} (${adminEmail})...\n`);

  for (const sample of SAMPLES) {
    console.log(`\n=== ${sample.name} ===`);

    const [model] = await db.insert(financialModelsTable).values({
      userId,
      name: sample.name,
      currentStep: 7,
      data: sample.data,
      schoolStage: sample.schoolStage,
      fundingProfile: sample.fundingProfile,
    }).returning();

    console.log(`  Created model ID: ${model.id}`);

    await exportModel(sample.data, sample.slug, outDir, model.id);

    for (const format of ["xlsx", "xlsx", "pdf", "pdf"]) {
      await db.insert(exportsTable).values({
        userId,
        modelId: model.id,
        format,
      });
    }
  }

  console.log(`\n✅ Done! ${SAMPLES.length * 4} export files saved to: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
