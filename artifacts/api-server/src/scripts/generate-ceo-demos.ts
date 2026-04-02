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
import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  getEnrollmentArray,
  computeNewStudents,
  computeReturningStudents,
  type RevenueRow,
  type StaffingRow,
  type ExpenseRow,
  type CapitalDebtRow,
} from "../lib/workbook-helpers.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface SampleModel {
  name: string;
  slug: string;
  schoolStage: "new_school" | "operating_school";
  fundingProfile: "tuition_based" | "charter_public_funded" | "hybrid_mixed";
  data: Record<string, unknown>;
}

const CEO_MICROSCHOOL: SampleModel = {
  name: "Oakwood Learning Studio (CEO Demo — 20 Students)",
  slug: "Oakwood_Learning_Studio_CEO",
  schoolStage: "new_school",
  fundingProfile: "tuition_based",
  data: {
    schoolProfile: {
      schoolName: "Oakwood Learning Studio",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      ein: "86-7771234",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 45,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      facilityStreet: "2845 N Scottsdale Rd",
      facilityCity: "Scottsdale",
      facilityState: "AZ",
      facilityZip: "85257",
      ownershipType: "rent",
      monthlyRent: 2200,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
    },
    enrollment: { year1: 20, year2: 26, year3: 32, year4: 37, year5: 40, retentionRate: 88, applicationsReceived: 35, waitlistCount: 8 },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [14, 18, 22, 26, 28] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [4, 5, 7, 8, 9] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 40, studentCounts: [2, 3, 3, 3, 3] },
    ],
    tuitionEscalation: { rate: 3 },
    revenue: {
      tuitionPerStudent: 10000,
      annualTuitionIncrease: 3,
      annualDonations: 12000,
      foundationGrants: 18000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10300, 10609, 10927, 11255], escalationRate: 3, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", enabled: true, driverType: "percent_of_base", amounts: [8, 8, 8, 8, 8], percentBase: "gross_tuition", billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", enabled: true, driverType: "annual_fixed", amounts: [8000, 7000, 5000, 4000, 3000], grantStatus: "projected", receiptQuarter: 1 },
      { id: "grants", category: "philanthropy", lineItem: "Startup Grant (Foundation)", enabled: true, driverType: "annual_fixed", amounts: [15000, 10000, 5000, 0, 0], grantStatus: "confirmed", receiptQuarter: 2 },
      { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental (Weekend)", enabled: true, driverType: "annual_fixed", amounts: [2400, 2400, 3000, 3000, 3600] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Founder / Lead Teacher", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 58000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Owner-operator", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 38000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Part-Time Aide / Tutor", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 24000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Y2", staffingMode: "ratio", studentRatio: 15, minFte: 0, maxFte: 2, startYear: 2 },
      { id: "s4", roleName: "Bookkeeper (Contract)", functionCategory: "administrative", employmentType: "contract", fte: 0.15, annualizedRate: 24000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false, notes: "Outsourced monthly", staffingMode: "fixed" },
    ],
    facilities: {
      monthlyRent: 2200,
      annualRentIncrease: 3,
      annualUtilities: 4200,
      annualInsurance: 2800,
      curriculumCostPerStudent: 450,
      techCostPerStudent: 350,
      annualMarketing: 3500,
      annualSalaryIncrease: 3,
      generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", canonicalKey: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [2200, 2266, 2334, 2404, 2476], escalationRate: 3, accountCode: "7100" },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [4200, 4326, 4456, 4590, 4728], accountCode: "7200" },
      { id: "e3", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [2800, 2884, 2971, 3060, 3152], accountCode: "7300" },
      { id: "e4", category: "occupancy_facility", lineItem: "Maintenance & Repairs (General)", enabled: true, driverType: "annual_fixed", amounts: [1500, 1545, 1591, 1639, 1688], accountCode: "7400" },
      { id: "e5", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (New)", enabled: true, driverType: "per_new_student", amounts: [450, 450, 450, 450, 450], accountCode: "5100" },
      { id: "e6", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (Returning)", enabled: true, driverType: "per_returning_student", amounts: [90, 90, 90, 90, 90], accountCode: "5101" },
      { id: "e7", category: "instructional_program", lineItem: "Classroom Supplies", enabled: true, driverType: "per_student", amounts: [120, 120, 120, 120, 120], accountCode: "5110" },
      { id: "e8", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [1500, 2000, 2500, 2500, 3000], accountCode: "5200" },
      { id: "e9", category: "instructional_program", lineItem: "Field Trips & Experiential Learning", enabled: true, driverType: "per_student", amounts: [150, 150, 150, 150, 150], accountCode: "5220" },
      { id: "e10", category: "technology", lineItem: "Student Devices & Hardware (New)", enabled: true, driverType: "per_new_student", amounts: [350, 350, 350, 350, 350], accountCode: "6100" },
      { id: "e11", category: "technology", lineItem: "Student Devices & Hardware (Returning)", enabled: true, driverType: "per_returning_student", amounts: [50, 50, 50, 50, 50], accountCode: "6101" },
      { id: "e12", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [2400, 2472, 2546, 2622, 2701], accountCode: "6200" },
      { id: "e13", category: "technology", lineItem: "Internet & Telecommunications", enabled: true, driverType: "monthly", amounts: [175, 180, 186, 191, 197], accountCode: "6300" },
      { id: "e14", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [3500, 3000, 2500, 2000, 1800], accountCode: "8200" },
      { id: "e15", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [4500, 4635, 4774, 4917, 5065], accountCode: "8300" },
      { id: "e16", category: "administrative_general", lineItem: "Office Supplies & Postage", enabled: true, driverType: "annual_fixed", amounts: [1200, 1236, 1273, 1311, 1350], accountCode: "8400" },
      { id: "e17", category: "administrative_general", lineItem: "Bank & Merchant Processing Fees", enabled: true, driverType: "percent_of_revenue", amounts: [2.5, 2.5, 2.5, 2.5, 2.5], accountCode: "8500" },
      { id: "e18", category: "administrative_general", lineItem: "Workers' Compensation Insurance", enabled: true, driverType: "annual_fixed", amounts: [1800, 1854, 1910, 1967, 2026], accountCode: "8520" },
      { id: "e19", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", enabled: true, driverType: "annual_fixed", amounts: [1500, 1545, 1591, 1639, 1688], accountCode: "8900" },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [8000, 2000, 1500, 1000, 500], isLoan: false, accountCode: "9100" },
      { id: "cd2", lineItem: "Startup Equipment & Supplies", enabled: true, driverType: "annual_fixed", amounts: [5000, 0, 0, 0, 0], isLoan: false, accountCode: "9300" },
      { id: "cd3", lineItem: "SchoolStack Lending Lab Microloan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 20000, loanRate: 6.5, loanTermYears: 5, purpose: "startup", accountCode: "9500" },
    ],
    openingBalances: { cash: 12000, accountsReceivable: 0, fixedAssets: 3000, otherAssets: 0, accountsPayable: 500, currentDebtPortion: 0, longTermDebt: 0 },
    sourcesAndUses: {
      sources: [
        { lineItem: "Owner Equity Contribution", amount: 25000, category: "equity" },
        { lineItem: "SchoolStack Microloan", amount: 20000, category: "debt" },
        { lineItem: "Foundation Startup Grant", amount: 18000, category: "grants" },
      ],
      uses: [
        { lineItem: "Facility Deposit & Setup", amount: 15000, category: "capital" },
        { lineItem: "FF&E (Furniture & Fixtures)", amount: 8000, category: "capital" },
        { lineItem: "Technology & Devices", amount: 7000, category: "capital" },
        { lineItem: "Curriculum & Materials", amount: 5000, category: "startup" },
        { lineItem: "Marketing & Enrollment", amount: 4000, category: "startup" },
        { lineItem: "Working Capital Reserve", amount: 12000, category: "reserves" },
        { lineItem: "Insurance & Licensing", amount: 3000, category: "startup" },
        { lineItem: "Pre-Opening Operating", amount: 9000, category: "startup" },
      ],
    },
    scenarios: [
      { name: "Conservative (20% fewer students)", enrollmentAdjustment: -20, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Aggressive (15% more students, 5% tuition up)", enrollmentAdjustment: 15, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.25, minDaysCashOnHand: 30, minMonthsRunway: 2, minCapacityUtil: 0.5 },
  },
};

const CEO_PRIVATE_SCHOOL: SampleModel = {
  name: "Cornerstone Classical Academy (CEO Demo — 100 Students)",
  slug: "Cornerstone_Classical_Academy_CEO",
  schoolStage: "operating_school",
  fundingProfile: "tuition_based",
  data: {
    schoolProfile: {
      schoolName: "Cornerstone Classical Academy",
      state: "FL",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      ein: "59-8881234",
      schoolStage: "operating_school",
      fundingProfile: "tuition_based",
      operatingYear: "second_year_plus",
      openingYear: 2023,
      currentStudents: 88,
      maxCapacity: 250,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      isAccredited: true,
      accreditingBody: "SACS-CASI / Cognia",
      locationSecured: true,
      facilityStreet: "4120 Bayshore Blvd",
      facilityCity: "Tampa",
      facilityState: "FL",
      facilityZip: "33611",
      ownershipType: "own",
      propertyTaxAnnual: 0,
      hasMortgage: true,
      mortgageMonthlyPayment: 7200,
      lendingLabIntent: "want_to_understand",
      debtIncluded: true,
    },
    enrollment: { year1: 100, year2: 125, year3: 155, year4: 180, year5: 200, retentionRate: 92, applicationsReceived: 160, waitlistCount: 22 },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [65, 80, 100, 115, 130] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount (10%)", discountPercent: 10, studentCounts: [20, 25, 30, 35, 38] },
      { id: "t3", tierType: "staff_discount", label: "Staff/Faculty Discount (25%)", discountPercent: 25, studentCounts: [5, 6, 8, 10, 12] },
      { id: "t4", tierType: "high_need_scholarship", label: "Need-Based Scholarship (50%)", discountPercent: 50, studentCounts: [10, 14, 17, 20, 20] },
    ],
    tuitionEscalation: { rate: 4 },
    revenue: {
      tuitionPerStudent: 14000,
      annualTuitionIncrease: 4,
      scholarshipRate: 12,
      annualDonations: 45000,
      foundationGrants: 35000,
      capitalGifts: 15000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [14000, 14560, 15142, 15748, 16378], escalationRate: 4, billingMonths: 10, collectionMethod: "autopay", collectionRate: 97, collectionDelayDays: 0 },
      { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [500, 500, 500, 500, 500], billingMonths: 12 },
      { id: "student_fees", category: "tuition_and_fees", lineItem: "Student Fees (Technology & Activity)", enabled: true, driverType: "per_student", amounts: [400, 412, 424, 437, 450] },
      { id: "aftercare", category: "tuition_and_fees", lineItem: "Aftercare / Extended Day", enabled: true, driverType: "annual_fixed", amounts: [36000, 45000, 55000, 64000, 72000] },
      { id: "summer_program", category: "tuition_and_fees", lineItem: "Summer Program Revenue", enabled: true, driverType: "annual_fixed", amounts: [18000, 22000, 28000, 32000, 38000] },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", enabled: true, driverType: "percent_of_base", amounts: [12, 12, 12, 12, 12], percentBase: "gross_tuition", billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "unrestricted_annual_fund", category: "philanthropy", lineItem: "Annual Fund / Unrestricted Giving", enabled: true, driverType: "annual_fixed", amounts: [45000, 52000, 60000, 68000, 75000], grantStatus: "projected", receiptQuarter: 1 },
      { id: "unrestricted_board_giving", category: "philanthropy", lineItem: "Board Giving / Board Commitments", enabled: true, driverType: "annual_fixed", amounts: [20000, 24000, 28000, 32000, 36000], grantStatus: "confirmed", receiptQuarter: 2 },
      { id: "grants", category: "philanthropy", lineItem: "Grants", enabled: true, driverType: "annual_fixed", amounts: [35000, 30000, 25000, 20000, 15000], grantStatus: "confirmed", receiptQuarter: 1 },
      { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising Events", enabled: true, driverType: "annual_fixed", amounts: [15000, 18000, 22000, 25000, 28000], grantStatus: "projected", receiptQuarter: 4 },
      { id: "restricted_capital", category: "philanthropy", lineItem: "Restricted - Capital / Building", enabled: true, driverType: "annual_fixed", amounts: [15000, 10000, 10000, 5000, 5000], grantStatus: "projected", receiptQuarter: 3 },
      { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental", enabled: true, driverType: "annual_fixed", amounts: [8400, 9000, 10000, 11000, 12000] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 24, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 72000, benefitsEligible: true, benefitsRate: 24, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Year 2", staffingMode: "fixed", startYear: 2 },
      { id: "s3", roleName: "Classroom Teachers (K-8)", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio-driven 1:18", staffingMode: "ratio", studentRatio: 18, minFte: 5, maxFte: 14 },
      { id: "s4", roleName: "Specialist Teachers (Art, Music, PE, Latin)", functionCategory: "instructional", employmentType: "full_time", fte: 2, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s5", roleName: "Teaching Assistants / Paraprofessionals", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "ratio", studentRatio: 40, minFte: 2, maxFte: 6 },
      { id: "s6", roleName: "School Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s7", roleName: "Office Manager / Registrar", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s8", roleName: "Admissions / Development Coordinator", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 46000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Year 2", staffingMode: "fixed", startYear: 2 },
      { id: "s9", roleName: "Facilities / Custodial", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 34000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s10", roleName: "Bookkeeper / Accountant", functionCategory: "administrative", employmentType: "contract", fte: 0.25, annualizedRate: 20000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false, notes: "Part-time contract", staffingMode: "fixed" },
      { id: "s11", roleName: "Aftercare Staff", functionCategory: "instructional", employmentType: "part_time", fte: 1, annualizedRate: 22000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
    ],
    facilities: {
      annualRentIncrease: 0,
      annualUtilities: 24000,
      annualInsurance: 14000,
      facilityMaintenance: 18000,
      curriculumCostPerStudent: 550,
      techCostPerStudent: 380,
      annualMarketing: 18000,
      annualSalaryIncrease: 3,
      generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [24000, 24720, 25462, 26226, 27013], accountCode: "7200" },
      { id: "e2", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [14000, 14420, 14853, 15298, 15757], accountCode: "7300" },
      { id: "e3", category: "occupancy_facility", lineItem: "Maintenance & Repairs (General)", enabled: true, driverType: "annual_fixed", amounts: [18000, 18540, 19096, 19669, 20259], accountCode: "7400" },
      { id: "e4", category: "occupancy_facility", lineItem: "Janitorial / Cleaning", enabled: true, driverType: "monthly", amounts: [800, 824, 849, 874, 900], accountCode: "7460" },
      { id: "e5", category: "occupancy_facility", lineItem: "Security", enabled: true, driverType: "monthly", amounts: [350, 361, 372, 383, 394], accountCode: "7470" },
      { id: "e6", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (New)", enabled: true, driverType: "per_new_student", amounts: [550, 550, 550, 550, 550], accountCode: "5100" },
      { id: "e7", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (Returning)", enabled: true, driverType: "per_returning_student", amounts: [110, 110, 110, 110, 110], accountCode: "5101" },
      { id: "e8", category: "instructional_program", lineItem: "Classroom Supplies", enabled: true, driverType: "per_student", amounts: [120, 124, 127, 131, 135], accountCode: "5110" },
      { id: "e9", category: "instructional_program", lineItem: "Testing & Assessment", enabled: true, driverType: "per_student", amounts: [60, 62, 64, 66, 68], accountCode: "5120" },
      { id: "e10", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [8000, 10000, 12000, 14000, 15000], accountCode: "5200" },
      { id: "e11", category: "instructional_program", lineItem: "Field Trips & Experiential Learning", enabled: true, driverType: "per_student", amounts: [200, 206, 212, 219, 225], accountCode: "5220" },
      { id: "e12", category: "technology", lineItem: "Student Devices & Hardware (New)", enabled: true, driverType: "per_new_student", amounts: [380, 380, 380, 380, 380], accountCode: "6100" },
      { id: "e13", category: "technology", lineItem: "Student Devices & Hardware (Returning)", enabled: true, driverType: "per_returning_student", amounts: [60, 60, 60, 60, 60], accountCode: "6101" },
      { id: "e14", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [8000, 8240, 8487, 8742, 9004], accountCode: "6200" },
      { id: "e15", category: "technology", lineItem: "Internet & Telecommunications", enabled: true, driverType: "monthly", amounts: [450, 464, 478, 492, 507], accountCode: "6300" },
      { id: "e16", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [18000, 15000, 13000, 11000, 10000], accountCode: "8200" },
      { id: "e17", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [14000, 14420, 14853, 15298, 15757], accountCode: "8300" },
      { id: "e18", category: "administrative_general", lineItem: "Office Supplies & Postage", enabled: true, driverType: "annual_fixed", amounts: [3000, 3090, 3183, 3278, 3377], accountCode: "8400" },
      { id: "e19", category: "administrative_general", lineItem: "Bank & Merchant Processing Fees", enabled: true, driverType: "percent_of_revenue", amounts: [2.5, 2.5, 2.5, 2.5, 2.5], accountCode: "8500" },
      { id: "e20", category: "administrative_general", lineItem: "Workers' Compensation Insurance", enabled: true, driverType: "annual_fixed", amounts: [5500, 5665, 5835, 6010, 6190], accountCode: "8520" },
      { id: "e21", category: "administrative_general", lineItem: "Accreditation & Licensing Fees", enabled: true, driverType: "annual_fixed", amounts: [4500, 3000, 3000, 4500, 3000], accountCode: "8615" },
      { id: "e22", category: "administrative_general", lineItem: "Audit & Compliance", enabled: true, driverType: "annual_fixed", amounts: [7000, 7210, 7426, 7649, 7878], accountCode: "8810" },
      { id: "e23", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", enabled: true, driverType: "annual_fixed", amounts: [4000, 4120, 4244, 4371, 4502], accountCode: "8900" },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "Building Mortgage", enabled: true, driverType: "annual_fixed", amounts: [86400, 86400, 86400, 86400, 86400], note: "$7,200/month mortgage", isLoan: true, loanPrincipal: 950000, loanRate: 5.25, loanTermYears: 25, accountCode: "9500" },
      { id: "cd2", lineItem: "Renovation Loan (Phase 2 classrooms)", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "Y2 expansion", isLoan: true, loanPrincipal: 120000, loanRate: 7.0, loanTermYears: 10, accountCode: "9500" },
      { id: "cd3", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [15000, 12000, 10000, 8000, 5000], isLoan: false, accountCode: "9100" },
      { id: "cd4", lineItem: "Playground & Outdoor Space", enabled: true, driverType: "annual_fixed", amounts: [0, 25000, 0, 0, 0], isLoan: false, note: "Phase 2 playground", accountCode: "9200" },
    ],
    openingBalances: { cash: 145000, accountsReceivable: 18000, fixedAssets: 680000, otherAssets: 5000, accountsPayable: 12000, currentDebtPortion: 28000, longTermDebt: 950000 },
    priorYearSnapshot: { endingEnrollment: 88, totalRevenue: 1320000, totalExpenses: 1180000, endingCash: 145000 },
    currentYearProjection: { currentEnrollment: 88, projectedRevenue: 1380000, projectedExpenses: 1240000, currentCash: 155000, monthsCompleted: 6 },
    scenarios: [
      { name: "Conservative (flat enrollment Y2-3)", enrollmentAdjustment: -15, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Aggressive Growth (+15% enrollment, +3% tuition)", enrollmentAdjustment: 15, tuitionAdjustment: 3, expenseAdjustment: 5, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.2, minDaysCashOnHand: 60, minMonthsRunway: 3, minCapacityUtil: 0.6 },
  },
};

const CEO_CHARTER_SCHOOL: SampleModel = {
  name: "Summit Scholars Charter (CEO Demo — 500 Students)",
  slug: "Summit_Scholars_Charter_CEO",
  schoolStage: "new_school",
  fundingProfile: "charter_public_funded",
  data: {
    schoolProfile: {
      schoolName: "Summit Scholars Charter",
      state: "OH",
      schoolType: "charter_school",
      entityType: "nonprofit_501c3",
      ein: "31-9991234",
      schoolStage: "new_school",
      fundingProfile: "charter_public_funded",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 900,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      hasManagementFee: true,
      managementFeePercent: 3,
      locationSecured: true,
      facilityStreet: "1880 E Broad St",
      facilityCity: "Columbus",
      facilityState: "OH",
      facilityZip: "43203",
      ownershipType: "rent",
      monthlyRent: 32000,
      annualRentEscalation: 3,
      isNNNLease: true,
      nnnCamCharges: 4500,
      nnnMaintenance: 2000,
      nnnUtilities: 0,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
      gradeBandEnrollment: {
        k5: [300, 375, 440, 500, 540],
        m68: [200, 250, 300, 340, 360],
        h912: [0, 0, 0, 0, 0],
      },
      gradeBandPerPupil: { k5: 8450, m68: 9100, h912: 0 },
      enrollmentRevenueMethod: "adm",
      charterDepositTiming: "monthly",
      spedCount: [60, 80, 100, 115, 125],
      ellCount: [40, 55, 70, 80, 85],
      ecoDisCount: [250, 315, 370, 420, 450],
      enrollmentGrowthRate: 12,
      stateFundingMethodology: "adm",
    },
    enrollment: { year1: 500, year2: 625, year3: 740, year4: 840, year5: 900, retentionRate: 86, applicationsReceived: 780, waitlistCount: 120 },
    revenue: {
      publicFundingPerStudent: 8700,
      annualTuitionIncrease: 2,
      annualFundraising: 40000,
      foundationGrants: 200000,
      capitalGifts: 75000,
    },
    revenueRows: [
      { id: "state_local_perpupil", category: "public_funding", lineItem: "State / Local Per-Pupil Revenue", enabled: true, driverType: "per_student", amounts: [8700, 8874, 9051, 9232, 9417], escalationRate: 2, billingMonths: 12, paymentFrequency: "monthly", paymentTiming: "arrears", note: "OH per-pupil foundation formula" },
      { id: "title_i", category: "public_funding", lineItem: "Title I — Low-Income Students", enabled: true, driverType: "annual_fixed", amounts: [200000, 258000, 310000, 358000, 390000], billingMonths: 12, disbursementType: "reimbursement", reimbursementLagMonths: 2, note: "~$800/qualifying low-income student × eco-dis count" },
      { id: "title_ii", category: "public_funding", lineItem: "Title II — Teacher Quality", enabled: true, driverType: "annual_fixed", amounts: [22000, 24000, 26000, 28000, 30000], billingMonths: 12, paymentFrequency: "quarterly", paymentTiming: "arrears" },
      { id: "sped_funding", category: "public_funding", lineItem: "IDEA — Special Education", enabled: true, driverType: "annual_fixed", amounts: [108000, 148000, 190000, 222000, 244000], billingMonths: 12, note: "~$1,800/IEP student × SPED count" },
      { id: "food_reimbursement", category: "public_funding", lineItem: "Food Service Reimbursement", enabled: true, driverType: "annual_fixed", amounts: [175000, 225000, 275000, 320000, 350000], billingMonths: 12, paymentFrequency: "monthly", paymentTiming: "arrears", note: "CEP eligible" },
      { id: "transportation_funding", category: "public_funding", lineItem: "Transportation Funding", enabled: true, driverType: "annual_fixed", amounts: [100000, 130000, 160000, 185000, 200000] },
      { id: "csp_grant", category: "philanthropy", lineItem: "Charter School Program (CSP) Grant", enabled: true, driverType: "annual_fixed", amounts: [250000, 175000, 75000, 0, 0], grantStatus: "confirmed", receiptQuarter: 1, note: "Federal CSP grant — 3-year window" },
      { id: "unrestricted_annual_fund", category: "philanthropy", lineItem: "Annual Fund / Unrestricted Giving", enabled: true, driverType: "annual_fixed", amounts: [20000, 25000, 32000, 38000, 45000], grantStatus: "projected", receiptQuarter: 1 },
      { id: "unrestricted_board_giving", category: "philanthropy", lineItem: "Board Giving / Board Commitments", enabled: true, driverType: "annual_fixed", amounts: [15000, 18000, 22000, 26000, 30000], grantStatus: "confirmed", receiptQuarter: 2 },
      { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", enabled: true, driverType: "annual_fixed", amounts: [30000, 38000, 48000, 55000, 65000], grantStatus: "projected", receiptQuarter: 3 },
      { id: "facility_rental", category: "other_revenue", lineItem: "Facility Rental", enabled: true, driverType: "annual_fixed", amounts: [10000, 12000, 15000, 18000, 22000] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Executive Director / CEO", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 120000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s2", roleName: "Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Dean of Students", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 78000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s4", roleName: "Dean of Academics", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 80000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Y2", staffingMode: "fixed", startYear: 2 },
      { id: "s5", roleName: "Core Teachers (ELA, Math, Science, SS)", functionCategory: "instructional", employmentType: "full_time", fte: 14, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio-driven 1:22", staffingMode: "ratio", studentRatio: 22, minFte: 12, maxFte: 45 },
      { id: "s6", roleName: "Specials Teachers (Art, Music, PE, Tech)", functionCategory: "instructional", employmentType: "full_time", fte: 4, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s7", roleName: "Special Education Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 54000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio 1:20 SPED students", staffingMode: "ratio", studentRatio: 20, minFte: 2, maxFte: 8 },
      { id: "s8", roleName: "ELL / Bilingual Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 2, annualizedRate: 50000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s9", roleName: "Instructional Aides / Paraprofessionals", functionCategory: "instructional", employmentType: "full_time", fte: 4, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio 1:60", staffingMode: "ratio", studentRatio: 60, minFte: 4, maxFte: 16 },
      { id: "s10", roleName: "School Counselor(s)", functionCategory: "student_support", employmentType: "full_time", fte: 2, annualizedRate: 56000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s11", roleName: "Social Worker", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s12", roleName: "School Nurse", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s13", roleName: "Operations Manager", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 60000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s14", roleName: "Office / Front Desk Staff", functionCategory: "administrative", employmentType: "full_time", fte: 2, annualizedRate: 38000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s15", roleName: "Finance / Business Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 65000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s16", roleName: "Compliance / Reporting Officer", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s17", roleName: "IT Support Specialist", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 50000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s18", roleName: "Custodial / Maintenance Staff", functionCategory: "operations", employmentType: "full_time", fte: 3, annualizedRate: 33000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s19", roleName: "Food Service Staff", functionCategory: "operations", employmentType: "full_time", fte: 3, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s20", roleName: "Transportation Coordinator", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
    ],
    facilities: {
      monthlyRent: 32000,
      annualRentIncrease: 3,
      annualUtilities: 72000,
      annualInsurance: 42000,
      facilityMaintenance: 35000,
      curriculumCostPerStudent: 650,
      techCostPerStudent: 450,
      annualMarketing: 30000,
      foodServicePerStudent: 750,
      transportationAnnual: 180000,
      annualSalaryIncrease: 0,
      generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", canonicalKey: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [32000, 32960, 33949, 34967, 36016], escalationRate: 3, accountCode: "7100" },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [72000, 80000, 90000, 98000, 105000], accountCode: "7200" },
      { id: "e3", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [42000, 48000, 55000, 60000, 65000], accountCode: "7300" },
      { id: "e4", category: "occupancy_facility", lineItem: "Maintenance & Repairs (General)", enabled: true, driverType: "annual_fixed", amounts: [35000, 40000, 45000, 50000, 55000], accountCode: "7400" },
      { id: "e5", category: "occupancy_facility", lineItem: "Janitorial / Cleaning", enabled: true, driverType: "monthly", amounts: [3500, 3800, 4200, 4500, 4800], accountCode: "7460" },
      { id: "e6", category: "occupancy_facility", lineItem: "Security", enabled: true, driverType: "monthly", amounts: [1800, 1854, 1910, 1967, 2026], accountCode: "7470" },
      { id: "e7", category: "occupancy_facility", lineItem: "CAM / NNN Charges", enabled: true, driverType: "monthly", amounts: [6500, 6695, 6896, 7103, 7316], accountCode: "7100" },
      { id: "e8", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (New)", enabled: true, driverType: "per_new_student", amounts: [650, 650, 650, 650, 650], accountCode: "5100" },
      { id: "e9", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (Returning)", enabled: true, driverType: "per_returning_student", amounts: [130, 130, 130, 130, 130], accountCode: "5101" },
      { id: "e10", category: "instructional_program", lineItem: "Classroom Supplies", enabled: true, driverType: "per_student", amounts: [110, 113, 117, 120, 124], accountCode: "5110" },
      { id: "e11", category: "instructional_program", lineItem: "Testing & Assessment", enabled: true, driverType: "per_student", amounts: [75, 77, 80, 82, 85], accountCode: "5120" },
      { id: "e12", category: "instructional_program", lineItem: "Special Education Services (Contracted)", enabled: true, driverType: "annual_fixed", amounts: [45000, 55000, 68000, 78000, 85000], accountCode: "5130" },
      { id: "e13", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [25000, 30000, 35000, 40000, 45000], accountCode: "5200" },
      { id: "e14", category: "instructional_program", lineItem: "Food / Meal Service", enabled: true, driverType: "per_student", amounts: [750, 773, 796, 820, 845], accountCode: "5300" },
      { id: "e15", category: "instructional_program", lineItem: "Student Transportation", enabled: true, driverType: "annual_fixed", amounts: [180000, 225000, 270000, 310000, 340000], accountCode: "5310" },
      { id: "e16", category: "instructional_program", lineItem: "Student Recruitment & Outreach", enabled: true, driverType: "annual_fixed", amounts: [15000, 12000, 10000, 8000, 6000], accountCode: "5315" },
      { id: "e17", category: "instructional_program", lineItem: "Uniforms / Student Supplies", enabled: true, driverType: "per_student", amounts: [100, 50, 50, 50, 50], accountCode: "5320" },
      { id: "e18", category: "technology", lineItem: "Student Devices & Hardware (New)", enabled: true, driverType: "per_new_student", amounts: [450, 450, 450, 450, 450], accountCode: "6100" },
      { id: "e19", category: "technology", lineItem: "Student Devices & Hardware (Returning)", enabled: true, driverType: "per_returning_student", amounts: [60, 60, 60, 60, 60], accountCode: "6101" },
      { id: "e20", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [18000, 22000, 26000, 30000, 33000], accountCode: "6200" },
      { id: "e21", category: "technology", lineItem: "Internet & Telecommunications", enabled: true, driverType: "monthly", amounts: [1200, 1236, 1273, 1311, 1350], accountCode: "6300" },
      { id: "e22", category: "technology", lineItem: "IT Support / Managed Services", enabled: true, driverType: "annual_fixed", amounts: [12000, 14000, 16000, 18000, 20000], accountCode: "6400" },
      { id: "e23", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [30000, 25000, 20000, 15000, 12000], accountCode: "8200" },
      { id: "e24", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [22000, 24000, 26000, 28000, 30000], accountCode: "8300" },
      { id: "e25", category: "administrative_general", lineItem: "Office Supplies & Postage", enabled: true, driverType: "annual_fixed", amounts: [6000, 7000, 8000, 9000, 10000], accountCode: "8400" },
      { id: "e26", category: "administrative_general", lineItem: "Workers' Compensation Insurance", enabled: true, driverType: "annual_fixed", amounts: [18000, 20000, 23000, 25000, 27000], accountCode: "8520" },
      { id: "e27", category: "administrative_general", lineItem: "Authorizer / Management Fee", enabled: true, driverType: "percent_of_revenue", amounts: [3, 3, 3, 3, 3], accountCode: "8800" },
      { id: "e28", category: "administrative_general", lineItem: "Audit & Compliance", enabled: true, driverType: "annual_fixed", amounts: [15000, 16000, 18000, 20000, 22000], accountCode: "8810" },
      { id: "e29", category: "administrative_general", lineItem: "Board & Governance", enabled: true, driverType: "annual_fixed", amounts: [5000, 5000, 6000, 6000, 7000], accountCode: "8820" },
      { id: "e30", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", enabled: true, driverType: "annual_fixed", amounts: [10000, 12000, 14000, 16000, 18000], accountCode: "8900" },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "Facility Build-Out (Phase 1)", enabled: true, driverType: "annual_fixed", amounts: [450000, 0, 0, 0, 0], note: "Classroom renovation and buildout", isLoan: false, accountCode: "9200" },
      { id: "cd2", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [120000, 35000, 25000, 20000, 15000], isLoan: false, accountCode: "9100" },
      { id: "cd3", lineItem: "Startup Equipment & Supplies", enabled: true, driverType: "annual_fixed", amounts: [40000, 0, 0, 0, 0], isLoan: false, accountCode: "9300" },
      { id: "cd4", lineItem: "Facility Improvement Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "15-year facility loan for buildout", isLoan: true, loanPrincipal: 650000, loanRate: 6.0, loanTermYears: 15, purpose: "startup", accountCode: "9500" },
      { id: "cd5", lineItem: "Equipment Financing", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], note: "5-year equipment loan", isLoan: true, loanPrincipal: 100000, loanRate: 5.5, loanTermYears: 5, purpose: "startup", accountCode: "9500" },
    ],
    openingBalances: { cash: 280000, accountsReceivable: 0, fixedAssets: 150000, otherAssets: 0, accountsPayable: 25000, currentDebtPortion: 0, longTermDebt: 0 },
    sourcesAndUses: {
      sources: [
        { lineItem: "Facility Improvement Loan", amount: 650000, category: "debt" },
        { lineItem: "Equipment Financing", amount: 100000, category: "debt" },
        { lineItem: "CSP Startup Grant (Year 1)", amount: 250000, category: "grants" },
        { lineItem: "Capital Campaign / Board Giving", amount: 90000, category: "equity" },
        { lineItem: "Operating Cash Reserve", amount: 280000, category: "cash" },
      ],
      uses: [
        { lineItem: "Facility Build-Out & Renovation", amount: 450000, category: "capital" },
        { lineItem: "FF&E (Furniture & Fixtures)", amount: 120000, category: "capital" },
        { lineItem: "Technology Infrastructure & Devices", amount: 85000, category: "capital" },
        { lineItem: "Startup Equipment & Supplies", amount: 40000, category: "capital" },
        { lineItem: "Pre-Opening Staffing (3 months)", amount: 180000, category: "startup" },
        { lineItem: "Marketing & Student Recruitment", amount: 35000, category: "startup" },
        { lineItem: "Insurance & Licensing", amount: 20000, category: "startup" },
        { lineItem: "Working Capital Reserve", amount: 280000, category: "reserves" },
        { lineItem: "Contingency (5%)", amount: 160000, category: "reserves" },
      ],
    },
    scenarios: [
      { name: "Conservative (25% fewer students)", enrollmentAdjustment: -25, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: -10, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "State Funding Cut (-8%)", enrollmentAdjustment: 0, tuitionAdjustment: -8, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.15, minDaysCashOnHand: 45, minMonthsRunway: 3, minCapacityUtil: 0.7 },
  },
};

const CEO_SAMPLES = [CEO_MICROSCHOOL, CEO_PRIVATE_SCHOOL, CEO_CHARTER_SCHOOL];

function normalizeStaffRow(raw: Record<string, unknown>): StaffingRow {
  return {
    id: (raw.id as string) || "",
    roleName: (raw.roleName as string) || "",
    functionCategory: (raw.functionCategory as string) || "",
    employmentType: (raw.employmentType as string) || "full_time",
    fte: (raw.fte as number) || 1,
    annualizedRate: (raw.annualizedRate as number) || 0,
    benefitsEligible: raw.benefitsEligible !== false,
    benefitsRate: (raw.benefitsRate as number) || 0,
    payrollTaxRate: (raw.payrollTaxRate as number) || 7.65,
    payrollLike: (raw.payrollLike as boolean) || false,
    notes: (raw.notes as string) || "",
    staffingMode: (raw.staffingMode as "fixed" | "ratio") || "fixed",
    studentRatio: raw.studentRatio != null ? (raw.studentRatio as number) : undefined,
    minFte: raw.minFte != null ? (raw.minFte as number) : undefined,
    maxFte: raw.maxFte != null ? (raw.maxFte as number) : undefined,
    startYear: raw.startYear != null ? (raw.startYear as number) : undefined,
    endYear: raw.endYear != null ? (raw.endYear as number) : undefined,
  };
}

let goldenPassed = 0;
let goldenFailed = 0;
const goldenFailures: string[] = [];

function check(label: string, actual: number, expected: number, tolerance = 1) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    goldenPassed++;
  } else {
    goldenFailed++;
    goldenFailures.push(`  FAIL: ${label} — expected ${expected}, got ${Math.round(actual)} (diff ${Math.round(diff)})`);
  }
}

function runGoldenVerification() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       CEO DEMO — GOLDEN MODEL ARITHMETIC VERIFICATION      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const microData = CEO_MICROSCHOOL.data;
  const microEnroll = getEnrollmentArray(microData.enrollment as Record<string, unknown>);
  const microRevRows = microData.revenueRows as unknown as RevenueRow[];
  const microStaffRows = (microData.staffingRows as unknown as Record<string, unknown>[]).map(normalizeStaffRow);
  const microExpRows = microData.expenseRows as unknown as ExpenseRow[];
  const microCDRows = (microData.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];
  const microProfile = microData.schoolProfile as Record<string, unknown>;

  console.log("\n— Oakwood Learning Studio (Microschool, 20 students Y1) —");
  const microRevY1 = computeRevenueForYear(microRevRows, 0, microEnroll[0]);
  console.log(`  Y1 Revenue: $${Math.round(microRevY1).toLocaleString()}`);
  const microPersY1 = computePersonnelForYear(microStaffRows, 3 / 100, 10 / 12, 0, microEnroll[0]);
  console.log(`  Y1 Personnel: $${Math.round(microPersY1).toLocaleString()}`);
  const microOpexY1 = computeExpenseForYear(microExpRows, 0, microEnroll[0], microRevY1, 3, microEnroll[0], 0);
  console.log(`  Y1 OpEx: $${Math.round(microOpexY1).toLocaleString()}`);
  const microCDY1 = computeCapDebtForYear(microCDRows, 0, microEnroll[0]);
  console.log(`  Y1 Cap&Debt: $${Math.round(microCDY1).toLocaleString()}`);
  const microTotalY1 = microPersY1 + microOpexY1 + microCDY1;
  const microNIY1 = microRevY1 - microTotalY1;
  console.log(`  Y1 Net Income: $${Math.round(microNIY1).toLocaleString()}`);

  check("Micro CEO Y1 Revenue > $180K", microRevY1 > 180000 ? 1 : 0, 1, 0);
  check("Micro CEO Y1 Revenue < $350K", microRevY1 < 350000 ? 1 : 0, 1, 0);

  const microRevY5 = computeRevenueForYear(microRevRows, 4, microEnroll[4]);
  const microPersY5 = computePersonnelForYear(microStaffRows, 3 / 100, 1, 4, microEnroll[4]);
  const microNewY5 = computeNewStudents(microEnroll, 88, 4);
  const microRetY5 = computeReturningStudents(microEnroll, 88, 4);
  const microOpexY5 = computeExpenseForYear(microExpRows, 4, microEnroll[4], microRevY5, 3, microNewY5, microRetY5);
  const microCDY5 = computeCapDebtForYear(microCDRows, 4, microEnroll[4]);
  const microNIY5 = microRevY5 - (microPersY5 + microOpexY5 + microCDY5);
  console.log(`  Y5 Revenue: $${Math.round(microRevY5).toLocaleString()}`);
  console.log(`  Y5 Net Income: $${Math.round(microNIY5).toLocaleString()}`);
  const microMarginY5 = microRevY5 > 0 ? microNIY5 / microRevY5 : 0;
  console.log(`  Y5 Net Margin: ${(microMarginY5 * 100).toFixed(1)}%`);
  check("Micro CEO Y5 positive NI", microNIY5 > 0 ? 1 : 0, 1, 0);

  console.log("\n— Cornerstone Classical Academy (Private, 100 students Y1) —");
  const privData = CEO_PRIVATE_SCHOOL.data;
  const privEnroll = getEnrollmentArray(privData.enrollment as Record<string, unknown>);
  const privRevRows = privData.revenueRows as unknown as RevenueRow[];
  const privStaffRows = (privData.staffingRows as unknown as Record<string, unknown>[]).map(normalizeStaffRow);
  const privExpRows = privData.expenseRows as unknown as ExpenseRow[];
  const privCDRows = (privData.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];

  const privRevY1 = computeRevenueForYear(privRevRows, 0, privEnroll[0]);
  console.log(`  Y1 Revenue: $${Math.round(privRevY1).toLocaleString()}`);
  const privPersY1 = computePersonnelForYear(privStaffRows, 3 / 100, 1, 0, privEnroll[0]);
  console.log(`  Y1 Personnel: $${Math.round(privPersY1).toLocaleString()}`);
  const privOpexY1 = computeExpenseForYear(privExpRows, 0, privEnroll[0], privRevY1, 3, privEnroll[0], 0);
  console.log(`  Y1 OpEx: $${Math.round(privOpexY1).toLocaleString()}`);
  const privCDY1 = computeCapDebtForYear(privCDRows, 0, privEnroll[0]);
  console.log(`  Y1 Cap&Debt: $${Math.round(privCDY1).toLocaleString()}`);
  const privTotalY1 = privPersY1 + privOpexY1 + privCDY1;
  const privNIY1 = privRevY1 - privTotalY1;
  console.log(`  Y1 Net Income: $${Math.round(privNIY1).toLocaleString()}`);

  check("Private CEO Y1 Revenue > $1.3M", privRevY1 > 1300000 ? 1 : 0, 1, 0);
  check("Private CEO Y1 Revenue < $1.8M", privRevY1 < 1800000 ? 1 : 0, 1, 0);
  const privStaffPctY1 = privPersY1 / privRevY1;
  console.log(`  Y1 Staffing % of Revenue: ${(privStaffPctY1 * 100).toFixed(1)}%`);
  check("Private CEO staffing 50-70% of revenue", privStaffPctY1 > 0.50 && privStaffPctY1 < 0.70 ? 1 : 0, 1, 0);
  check("Private CEO Y1 positive NI", privNIY1 > 0 ? 1 : 0, 1, 0);

  const privRevY5 = computeRevenueForYear(privRevRows, 4, privEnroll[4]);
  const privPersY5 = computePersonnelForYear(privStaffRows, 3 / 100, 1, 4, privEnroll[4]);
  const privNewY5 = computeNewStudents(privEnroll, 92, 4);
  const privRetY5 = computeReturningStudents(privEnroll, 92, 4);
  const privOpexY5 = computeExpenseForYear(privExpRows, 4, privEnroll[4], privRevY5, 3, privNewY5, privRetY5);
  const privCDY5 = computeCapDebtForYear(privCDRows, 4, privEnroll[4]);
  const privNIY5 = privRevY5 - (privPersY5 + privOpexY5 + privCDY5);
  console.log(`  Y5 Revenue: $${Math.round(privRevY5).toLocaleString()}`);
  console.log(`  Y5 Net Income: $${Math.round(privNIY5).toLocaleString()}`);
  check("Private CEO Y5 positive NI", privNIY5 > 0 ? 1 : 0, 1, 0);

  console.log("\n— Summit Scholars Charter (Charter, 500 students Y1) —");
  const charterData = CEO_CHARTER_SCHOOL.data;
  const charterEnroll = getEnrollmentArray(charterData.enrollment as Record<string, unknown>);
  const charterRevRows = charterData.revenueRows as unknown as RevenueRow[];
  const charterStaffRows = (charterData.staffingRows as unknown as Record<string, unknown>[]).map(normalizeStaffRow);
  const charterExpRows = charterData.expenseRows as unknown as ExpenseRow[];
  const charterCDRows = (charterData.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];

  const charterRevY1 = computeRevenueForYear(charterRevRows, 0, charterEnroll[0]);
  console.log(`  Y1 Revenue: $${Math.round(charterRevY1).toLocaleString()}`);
  const charterPersY1 = computePersonnelForYear(charterStaffRows, 0, 10 / 12, 0, charterEnroll[0]);
  console.log(`  Y1 Personnel: $${Math.round(charterPersY1).toLocaleString()}`);
  const charterOpexY1 = computeExpenseForYear(charterExpRows, 0, charterEnroll[0], charterRevY1, 3, charterEnroll[0], 0);
  console.log(`  Y1 OpEx: $${Math.round(charterOpexY1).toLocaleString()}`);
  const charterCDY1 = computeCapDebtForYear(charterCDRows, 0, charterEnroll[0]);
  console.log(`  Y1 Cap&Debt: $${Math.round(charterCDY1).toLocaleString()}`);
  const charterTotalY1 = charterPersY1 + charterOpexY1 + charterCDY1;
  const charterNIY1 = charterRevY1 - charterTotalY1;
  console.log(`  Y1 Net Income: $${Math.round(charterNIY1).toLocaleString()}`);

  check("Charter CEO Y1 Revenue > $4M", charterRevY1 > 4000000 ? 1 : 0, 1, 0);
  check("Charter CEO Y1 Revenue < $7M", charterRevY1 < 7000000 ? 1 : 0, 1, 0);
  const charterStaffPctY1 = charterPersY1 / charterRevY1;
  console.log(`  Y1 Staffing % of Revenue: ${(charterStaffPctY1 * 100).toFixed(1)}%`);
  check("Charter CEO staffing 40-75% of revenue", charterStaffPctY1 > 0.40 && charterStaffPctY1 < 0.75 ? 1 : 0, 1, 0);

  const charterRevY5 = computeRevenueForYear(charterRevRows, 4, charterEnroll[4]);
  const charterPersY5 = computePersonnelForYear(charterStaffRows, 0, 1, 4, charterEnroll[4]);
  const charterNewY5 = computeNewStudents(charterEnroll, 86, 4);
  const charterRetY5 = computeReturningStudents(charterEnroll, 86, 4);
  const charterOpexY5 = computeExpenseForYear(charterExpRows, 4, charterEnroll[4], charterRevY5, 3, charterNewY5, charterRetY5);
  const charterCDY5 = computeCapDebtForYear(charterCDRows, 4, charterEnroll[4]);
  const charterNIY5 = charterRevY5 - (charterPersY5 + charterOpexY5 + charterCDY5);
  console.log(`  Y5 Revenue: $${Math.round(charterRevY5).toLocaleString()}`);
  console.log(`  Y5 Net Income: $${Math.round(charterNIY5).toLocaleString()}`);
  check("Charter CEO Y5 positive NI", charterNIY5 > 0 ? 1 : 0, 1, 0);

  console.log(`\n  Golden checks: ${goldenPassed} passed, ${goldenFailed} failed`);
  if (goldenFailures.length > 0) {
    for (const f of goldenFailures) console.log(f);
  }
  return goldenFailed === 0;
}

async function exportModel(modelData: Record<string, unknown>, slug: string, outDir: string, modelId: number) {
  const consultantOutput = await runConsultantEngine(modelData);
  const typedData = modelData as unknown as ModelData;

  console.log(`  Consultant engine: ${consultantOutput.lenderReadiness}`);
  const signals = consultantOutput.healthSignals || [];
  for (const sig of signals.slice(0, 6)) {
    const detail = sig.explanation || "";
    console.log(`    ${sig.status === "healthy" ? "🟢" : sig.status === "watch" ? "🟡" : "🔴"} ${sig.label}: ${String(detail).slice(0, 80)}`);
  }

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
  const goldenOk = runGoldenVerification();
  if (!goldenOk) {
    console.error("\n❌ Golden model verification failed. Fix the numbers before seeding.");
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), "ceo-demo-samples");
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

  console.log(`\nGenerating CEO demo models as user ${userId} (${adminEmail})...\n`);

  for (const sample of CEO_SAMPLES) {
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

  console.log(`\n✅ Done! ${CEO_SAMPLES.length * 4} export files saved to: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
