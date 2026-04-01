export type CharterMethodology =
  | "ada"
  | "adm"
  | "single_count_day"
  | "multiple_count_dates"
  | "single_count_period"
  | "multiple_count_periods"
  | "other";

export type SchoolChoiceProgramType =
  | "esa"
  | "voucher"
  | "tax_credit_scholarship"
  | "refundable_tax_credit"
  | "individual_tax_credit"
  | "federal_tax_credit_sgo"
  | "correspondence_charter"
  | "private_scholarship";

export type ProgramStatus = "active" | "pending" | "blocked" | "litigated";

export interface ProgramInfo {
  type: SchoolChoiceProgramType;
  label: string;
  minPerStudent: number;
  maxPerStudent: number;
  homeschoolMinPerStudent?: number;
  homeschoolMaxPerStudent?: number;
  universal: boolean;
  status: ProgramStatus;
  effectiveYear?: number;
  optIn?: boolean;
  notes?: string;
}

export interface CharterPerPupilRange {
  min: number;
  max: number;
  notes?: string;
}

export interface StateFundingEntry {
  charterMethodology: CharterMethodology;
  charterMethodologyLabel: string;
  charterCoachingText: string;
  programs: ProgramInfo[];
  federalTaxCreditSGO: boolean;
  charterBasePerPupil: CharterPerPupilRange;
}

const ADA_COACHING =
  "Your state funds charter schools based on Average Daily Attendance (ADA). Funding is calculated on the average number of students physically present each day. Absent students reduce your funding, so strong attendance programs directly impact revenue.";
const ADM_COACHING =
  "Your state funds charter schools based on Average Daily Membership (ADM). Funding counts every enrolled student each day, regardless of whether they attend. This is generally more favorable for innovative school models.";
const SINGLE_COUNT_DAY_COACHING =
  "Your state funds charter schools based on a single count day. Your enrollment on that specific date determines your funding for the year. New schools that haven't reached full enrollment by the count date may receive less funding than expected.";
const MULTIPLE_COUNT_DATES_COACHING =
  "Your state uses multiple count dates to determine funding. Enrollment is measured on several specific dates throughout the year, which can help smooth out fluctuations.";
const SINGLE_COUNT_PERIOD_COACHING =
  "Your state determines funding based on enrollment during a single count period rather than a single day. This gives schools a window to demonstrate enrollment levels.";
const MULTIPLE_COUNT_PERIODS_COACHING =
  "Your state uses multiple count periods to calculate funding. Each period's enrollment is measured and typically averaged.";
const OTHER_COACHING =
  "Your state has a unique funding methodology. Check with your state education agency for details on how charter school funding is calculated.";

function methodologyLabel(m: CharterMethodology): string {
  switch (m) {
    case "ada": return "Average Daily Attendance (ADA)";
    case "adm": return "Average Daily Membership (ADM)";
    case "single_count_day": return "Single Count Day";
    case "multiple_count_dates": return "Multiple Count Dates";
    case "single_count_period": return "Single Count Period";
    case "multiple_count_periods": return "Multiple Count Periods";
    case "other": return "Other";
  }
}

function coachingText(m: CharterMethodology): string {
  switch (m) {
    case "ada": return ADA_COACHING;
    case "adm": return ADM_COACHING;
    case "single_count_day": return SINGLE_COUNT_DAY_COACHING;
    case "multiple_count_dates": return MULTIPLE_COUNT_DATES_COACHING;
    case "single_count_period": return SINGLE_COUNT_PERIOD_COACHING;
    case "multiple_count_periods": return MULTIPLE_COUNT_PERIODS_COACHING;
    case "other": return OTHER_COACHING;
  }
}

function entry(
  methodology: CharterMethodology,
  programs: ProgramInfo[],
  federalTaxCreditSGO: boolean = false,
  perPupil: CharterPerPupilRange = { min: 8000, max: 12000 }
): StateFundingEntry {
  return {
    charterMethodology: methodology,
    charterMethodologyLabel: methodologyLabel(methodology),
    charterCoachingText: coachingText(methodology),
    programs,
    federalTaxCreditSGO,
    charterBasePerPupil: perPupil,
  };
}

function esa(
  min: number,
  max: number,
  universal: boolean,
  notes?: string,
  homeschoolMin?: number,
  homeschoolMax?: number,
  status: ProgramStatus = "active",
  effectiveYear?: number,
): ProgramInfo {
  return {
    type: "esa",
    label: "Education Savings Account (ESA)",
    minPerStudent: min,
    maxPerStudent: max,
    homeschoolMinPerStudent: homeschoolMin,
    homeschoolMaxPerStudent: homeschoolMax,
    universal,
    status,
    effectiveYear,
    notes,
  };
}

function voucher(min: number, max: number, universal: boolean, notes?: string, status: ProgramStatus = "active"): ProgramInfo {
  return { type: "voucher", label: "Voucher Program", minPerStudent: min, maxPerStudent: max, universal, status, notes };
}

function taxCreditScholarship(min: number, max: number, notes?: string, status: ProgramStatus = "active"): ProgramInfo {
  return { type: "tax_credit_scholarship", label: "Tax-Credit Scholarship", minPerStudent: min, maxPerStudent: max, universal: false, status, notes };
}

function refundableTaxCredit(min: number, max: number, notes?: string, homeschoolMin?: number, homeschoolMax?: number, status: ProgramStatus = "active"): ProgramInfo {
  return {
    type: "refundable_tax_credit",
    label: "Refundable Tax Credit",
    minPerStudent: min,
    maxPerStudent: max,
    homeschoolMinPerStudent: homeschoolMin,
    homeschoolMaxPerStudent: homeschoolMax,
    universal: false,
    status,
    notes,
  };
}

function individualTaxCredit(min: number, max: number, notes?: string, status: ProgramStatus = "active"): ProgramInfo {
  return { type: "individual_tax_credit", label: "Individual Tax Credit / Deduction", minPerStudent: min, maxPerStudent: max, universal: false, status, notes };
}

function correspondenceCharter(min: number, max: number, notes?: string, status: ProgramStatus = "active"): ProgramInfo {
  return { type: "correspondence_charter", label: "Correspondence / Charter Pathway", minPerStudent: min, maxPerStudent: max, universal: false, status, notes };
}

function privateScholarship(min: number, max: number, label: string, notes?: string, status: ProgramStatus = "active"): ProgramInfo {
  return { type: "private_scholarship", label, minPerStudent: min, maxPerStudent: max, universal: false, status, optIn: true, notes };
}

export const STATE_FUNDING_MAP: Record<string, StateFundingEntry> = {
  AL: entry("single_count_period", [
    refundableTaxCredit(1000, 2000, "CHOOSE Act — up to $2,000 for homeschoolers", 1000, 2000),
  ], false, { min: 8200, max: 9000, notes: "State foundation ~$8,290/pupil" }),
  AK: entry("multiple_count_dates", [
    correspondenceCharter(2500, 2700, "Correspondence programs — ~$2,700/student"),
  ], false, { min: 12000, max: 16000, notes: "BSA ~$7,510 + supplemental; total varies by district" }),
  AZ: entry("multiple_count_dates", [
    esa(7000, 8000, true, "Universal ESA — ~$7,000-$8,000/student", 7000, 8000),
    taxCreditScholarship(2000, 5000, "4 tax-credit scholarship programs"),
  ], true, { min: 10400, max: 11000, notes: "Full equalization funding — one of most charter-equitable states" }),
  AR: entry("adm", [
    esa(6600, 7600, true, "Universal by 2025 — ~$6,600-$7,600/student"),
    taxCreditScholarship(2000, 5000),
  ], true, { min: 7600, max: 9000, notes: "LEARNS Act 2023 improved charter equity; foundation base ~$7,618" }),
  CA: entry("ada", [
    correspondenceCharter(2800, 3200, "Charter school enrollment pathway — ~$2,800-$3,200/student"),
  ], false, { min: 12000, max: 16000, notes: "LCFF rate — varies significantly by resident district" }),
  CO: entry("single_count_day", [
    privateScholarship(1000, 3000, "ACE Scholarship", "ACE Scholarships (acescholarships.org) — need-based K-12 scholarships for low-income families attending private schools in Colorado. Schools must partner with ACE and accept all qualified families. Not all private schools receive ACE funds; families must apply and qualify. Amounts vary by grade level and family need."),
  ], true, { min: 10000, max: 11500, notes: "Charter equity law requires 95%+ of district per-pupil revenue" }),
  CT: entry("single_count_day", [], false, { min: 13000, max: 14000, notes: "State charter grant base ~$13,185" }),
  DE: entry("adm", [], false, { min: 15000, max: 16000, notes: "Unit-based formula equivalent to district schools" }),
  FL: entry("adm", [
    esa(7000, 8000, true, "PEP scholarship for homeschoolers — ~$8,000", 7000, 8000),
    voucher(5000, 8000, false, "Multiple scholarship programs"),
  ], true, { min: 9500, max: 10500, notes: "FEFP-based — equalized statewide" }),
  GA: entry("single_count_day", [
    esa(5500, 6500, false, "Promise Scholarship — $6,500 for students in lowest-performing districts (not yet launched)", undefined, undefined, "pending"),
    voucher(3000, 6000, false, "Georgia Special Needs Scholarship"),
    taxCreditScholarship(2000, 5000),
  ], false, { min: 9000, max: 13000, notes: "State QBE formula + Charter School Supplemental Funding" }),
  HI: entry("other", [], false, { min: 10500, max: 11500, notes: "Single statewide district — weighted student formula" }),
  ID: entry("ada", [
    refundableTaxCredit(3000, 5000, "Parental Choice Tax Credit — up to $5,000/student (upheld by Supreme Court Feb 2026)", 3000, 5000),
  ], false, { min: 7500, max: 8500, notes: "State foundation funding; local levy gap can be significant" }),
  IL: entry("multiple_count_periods", [
    individualTaxCredit(100, 250, "25% credit on qualifying expenses, max ~$250"),
  ], false, { min: 9500, max: 11000, notes: "Evidence-Based Funding per-pupil block" }),
  IN: entry("single_count_day", [
    voucher(5000, 8000, true, "Choice Scholarship — universal (income cap eliminated 2026)"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1000, "~$1,000/child tax deduction"),
  ], true, { min: 7500, max: 9000, notes: "State tuition support + complexity index" }),
  IA: entry("single_count_day", [
    esa(7000, 8000, true, "Universal ESA — ~$8,000/student", 7000, 8000),
    taxCreditScholarship(2000, 5000),
  ], true, { min: 7600, max: 8500, notes: "State per-pupil cost ~$7,600 foundation" }),
  KS: entry("single_count_day", [
    taxCreditScholarship(2000, 5000),
  ], false, { min: 7700, max: 8500, notes: "Base state aid per pupil" }),
  KY: entry("ada", [
  ], true, { min: 8500, max: 10000, notes: "SEEK formula — base guarantee per pupil" }),
  LA: entry("multiple_count_dates", [
    esa(5000, 7000, false, "GATOR program — transitioning from voucher to ESA"),
    voucher(4000, 6000, false, "2 voucher programs"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1500, "School expense deduction"),
  ], true, { min: 9000, max: 12000, notes: "Type 2 charters receive MFP allocation from resident district" }),
  ME: entry("multiple_count_dates", [
    voucher(4000, 8000, false, "Town tuitioning program"),
  ], false, { min: 10000, max: 13000, notes: "Essential programs & services formula" }),
  MD: entry("single_count_day", [
    voucher(3000, 6000, false, "BOOST Scholarship Program"),
  ], false, { min: 14000, max: 17000, notes: "Blueprint for Maryland's Future — high per-pupil investment" }),
  MA: entry("single_count_day", [], false, { min: 14000, max: 17000, notes: "Chapter 70 tuition rate from sending district" }),
  MI: entry("multiple_count_dates", [], false, { min: 9150, max: 9600, notes: "Foundation allowance ~$9,150-$9,608 per pupil" }),
  MN: entry("adm", [
    individualTaxCredit(500, 1500, "Education deduction/credit"),
    refundableTaxCredit(1000, 2000, "Refundable education credit", 500, 1500),
  ], false, { min: 10000, max: 12500, notes: "General education aid formula" }),
  MS: entry("ada", [
    esa(5500, 6500, false, "Special needs ESA — ~$6,500", 5500, 6500),
    voucher(3000, 6000, false, "2 voucher programs"),
  ], true, { min: 6700, max: 8500, notes: "Mississippi Adequate Education Program" }),
  MO: entry("ada", [], false, { min: 8000, max: 10000, notes: "State adequacy target formula" }),
  MT: entry("multiple_count_dates", [
    taxCreditScholarship(2000, 5000),
  ], false, { min: 8000, max: 10000, notes: "Base entitlement per ANB" }),
  NE: entry("adm", [
  ], true, { min: 10000, max: 12000, notes: "TEEOSA equalization formula" }),
  NV: entry("single_count_day", [
    taxCreditScholarship(2000, 5000),
  ], false, { min: 8500, max: 10500, notes: "Distributive School Account per-pupil" }),
  NH: entry("single_count_day", [
    esa(4000, 4600, false, "Income-capped at 350% FPL — ~$4,600/student", 4000, 4600),
    voucher(4000, 6000, false),
    taxCreditScholarship(2000, 5000),
  ], true, { min: 8000, max: 10000, notes: "Adequate education grant + local allocation" }),
  NJ: entry("single_count_day", [], false, { min: 16000, max: 20000, notes: "SFRA formula — varies significantly by district. Among highest nationally" }),
  NM: entry("single_count_period", [], false, { min: 9500, max: 11000, notes: "State Equalization Guarantee — funding formula units" }),
  NY: entry("adm", [], false, { min: 14000, max: 18000, notes: "Foundation aid — varies widely by district (NYC charters ~$17,000+)" }),
  NC: entry("adm", [
    esa(5000, 17000, false, "ESA+ for special needs students — ~$9,000-$17,000", 9000, 17000),
    voucher(5000, 8000, true, "Opportunity Scholarship"),
  ], false, { min: 7500, max: 9500, notes: "State allotment per ADM" }),
  ND: entry("adm", [
  ], true, { min: 10000, max: 12000, notes: "Per-pupil payment formula" }),
  OH: entry("multiple_count_periods", [
    voucher(4000, 8000, false, "5 voucher programs (EdChoice ruled unconstitutional by lower court — appeal expected)", "litigated"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1000, "2 individual tax credit programs"),
  ], false, { min: 8000, max: 10500, notes: "Fair School Funding Plan — Opportunity Index based" }),
  OK: entry("adm", [
    voucher(5000, 7500, false),
    taxCreditScholarship(2000, 5000),
    refundableTaxCredit(5000, 7500, "Parental Choice Tax Credit — $5,000-$7,500/student", 5000, 7500),
  ], false, { min: 7500, max: 9000, notes: "State aid formula per weighted ADM" }),
  OR: entry("adm", [
    correspondenceCharter(2500, 3000, "Charter school enrollment pathway"),
  ], false, { min: 10500, max: 12500, notes: "State School Fund grant per extended ADMw" }),
  PA: entry("adm", [
    taxCreditScholarship(2000, 5000, "2 tax-credit scholarship programs"),
  ], false, { min: 10000, max: 15000, notes: "Charter tuition rate = resident district per-pupil cost. Varies widely by district" }),
  RI: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ], false, { min: 14000, max: 16000, notes: "State share formula + local contribution" }),
  SC: entry("adm", [
    esa(3000, 6000, false, "Exceptional needs students", 3000, 6000),
    taxCreditScholarship(2000, 5000),
    refundableTaxCredit(2000, 5000, "Exceptional needs refundable credit"),
  ], false, { min: 7500, max: 9500, notes: "EFA base student cost + weighted pupil units" }),
  SD: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ], false, { min: 7500, max: 9000, notes: "State aid per student formula" }),
  TN: entry("adm", [
    esa(6000, 7000, false, "Limited geographic eligibility — $7,000/student", 6000, 7000),
  ], true, { min: 8500, max: 10000, notes: "TISA (Tennessee Investment in Student Achievement) base" }),
  TX: entry("ada", [
    { ...esa(10000, 10474, false, "Texas Education Freedom Accounts — launching 2026-27; ~$10,474/student, up to $30,000 IEP. Schools must choose to accept ESA students. Enable this if your school will participate.", 2000, 2000, "active", 2026), optIn: true },
  ], false, { min: 7500, max: 9500, notes: "Foundation School Program — basic allotment + tier adjustments" }),
  UT: entry("single_count_day", [
    esa(7000, 8000, false, "Fits All — ~$8,000 (court challenges pending, status uncertain)", 7000, 8000, "litigated"),
    voucher(4000, 6000, false),
  ], false, { min: 8500, max: 10000, notes: "Weighted Pupil Unit value" }),
  VT: entry("adm", [
    voucher(4000, 8000, false, "Town tuitioning program"),
  ], false, { min: 16000, max: 20000, notes: "Education spending per equalized pupil — among highest nationally" }),
  VA: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ], true, { min: 10000, max: 13000, notes: "Standards of Quality per-pupil funding via local school division" }),
  WA: entry("other", [], false, { min: 12000, max: 15000, notes: "Prototypical school model allocation" }),
  WV: entry("single_count_day", [
    esa(4500, 5300, true, "Hope Scholarship — ~$5,300, expanding to all homeschoolers 2026", 4500, 5300),
  ], false, { min: 9000, max: 11000, notes: "State aid formula per net enrollment" }),
  WI: entry("multiple_count_dates", [
    voucher(4000, 8000, false, "4 voucher programs"),
    individualTaxCredit(500, 1000),
  ], false, { min: 9500, max: 11000, notes: "Per-pupil revenue limit" }),
  WY: entry("single_count_period", [
    esa(5000, 6000, false, "~$6,000 (blocked by judge, status uncertain)", 5000, 6000, "blocked"),
  ], false, { min: 16000, max: 18000, notes: "Block grant model — among highest per-pupil nationally" }),
  DC: entry("adm", [
    voucher(5000, 12000, false, "DC Opportunity Scholarship"),
  ], false, { min: 16000, max: 22000, notes: "Uniform Per Student Funding Formula (UPSFF) — highest nationally" }),
};

export type SchoolType =
  | "charter_school"
  | "homeschool_coop"
  | "learning_pod"
  | "microschool"
  | "private_school"
  | "tutoring_center"
  | "other";

export interface StateFundingConfig {
  charterMethodology: CharterMethodology | null;
  charterMethodologyLabel: string | null;
  charterCoachingText: string | null;
  enrollmentRevenueMethod: "ada" | "adm" | "count_days" | null;
  availablePrograms: ProgramInfo[];
  schoolChoiceCoachingText: string;
  federalTaxCreditSGO: boolean;
  stateCode: string;
  charterBasePerPupil: CharterPerPupilRange | null;
}

function methodologyToEnrollmentMethod(m: CharterMethodology): "ada" | "adm" | "count_days" | null {
  switch (m) {
    case "ada": return "ada";
    case "adm": return "adm";
    case "single_count_day":
    case "multiple_count_dates":
    case "single_count_period":
    case "multiple_count_periods":
      return "count_days";
    case "other": return null;
  }
}

function statusSuffix(p: ProgramInfo): string {
  if (p.status === "blocked") return " (currently blocked)";
  if (p.status === "litigated") return " (legal challenge pending)";
  if (p.status === "pending") return " (not yet launched)";
  return "";
}

function buildSchoolChoiceCoaching(programs: ProgramInfo[], schoolType: SchoolType, state: string): string {
  if (programs.length === 0) {
    return `Based on our data, ${state} does not currently have ESA, voucher, or tax-credit scholarship programs available. Check with your state education agency for the latest information.`;
  }

  const parts: string[] = [];
  for (const p of programs) {
    const isHomeschool = schoolType === "homeschool_coop";
    const min = isHomeschool && p.homeschoolMinPerStudent != null ? p.homeschoolMinPerStudent : p.minPerStudent;
    const max = isHomeschool && p.homeschoolMaxPerStudent != null ? p.homeschoolMaxPerStudent : p.maxPerStudent;
    const range = min === max ? `~$${min.toLocaleString()}` : `$${min.toLocaleString()}-$${max.toLocaleString()}`;
    parts.push(`${p.label}: ${range}/student${statusSuffix(p)}`);
  }

  return `${state} offers: ${parts.join("; ")}. Check eligibility requirements with your state — amounts shown are estimates and may vary.`;
}

function filterProgramsForSchoolType(programs: ProgramInfo[], schoolType: SchoolType): ProgramInfo[] {
  switch (schoolType) {
    case "charter_school":
      return [];

    case "homeschool_coop":
      return programs.filter(p =>
        p.type === "esa" ||
        p.type === "refundable_tax_credit" ||
        p.type === "individual_tax_credit" ||
        p.type === "correspondence_charter"
      ).map(p => {
        if ((p.homeschoolMinPerStudent != null) || (p.homeschoolMaxPerStudent != null)) {
          return {
            ...p,
            minPerStudent: p.homeschoolMinPerStudent ?? p.minPerStudent,
            maxPerStudent: p.homeschoolMaxPerStudent ?? p.maxPerStudent,
          };
        }
        return p;
      });

    case "private_school":
      return programs.filter(p =>
        p.type === "esa" ||
        p.type === "voucher" ||
        p.type === "tax_credit_scholarship" ||
        p.type === "refundable_tax_credit" ||
        p.type === "individual_tax_credit" ||
        p.type === "private_scholarship"
      );

    case "microschool":
    case "learning_pod":
    case "tutoring_center":
      return programs.filter(p =>
        p.type === "esa" ||
        p.type === "voucher" ||
        p.type === "tax_credit_scholarship" ||
        p.type === "refundable_tax_credit" ||
        p.type === "individual_tax_credit"
      );

    case "other":
    default:
      return [];
  }
}

export function getStateFundingConfig(
  schoolType: SchoolType,
  stateCode: string,
  openingYear?: number
): StateFundingConfig {
  const normalized = stateCode.toUpperCase();
  const stateData = STATE_FUNDING_MAP[normalized];

  if (!stateData) {
    return {
      charterMethodology: null,
      charterMethodologyLabel: null,
      charterCoachingText: null,
      enrollmentRevenueMethod: null,
      availablePrograms: [],
      schoolChoiceCoachingText: `We don't have funding data for "${stateCode}". Please enter your revenue sources manually.`,
      federalTaxCreditSGO: false,
      stateCode: normalized,
      charterBasePerPupil: null,
    };
  }

  const isCharter = schoolType === "charter_school";

  let filteredPrograms = filterProgramsForSchoolType(stateData.programs, schoolType);

  const schoolTypesEligibleForSGO: SchoolType[] = ["private_school", "microschool", "learning_pod", "tutoring_center", "homeschool_coop"];
  if (stateData.federalTaxCreditSGO && openingYear && openingYear >= 2027 && schoolTypesEligibleForSGO.includes(schoolType)) {
    filteredPrograms = [
      ...filteredPrograms,
      {
        type: "federal_tax_credit_sgo" as SchoolChoiceProgramType,
        label: "Federal Tax Credit (SGO)",
        minPerStudent: 1000,
        maxPerStudent: 1700,
        universal: false,
        status: "active" as ProgramStatus,
        effectiveYear: 2027,
        notes: "Federal tax credit scholarship via Scholarship Granting Organizations — starting January 2027",
      },
    ];
  }

  return {
    charterMethodology: isCharter ? stateData.charterMethodology : null,
    charterMethodologyLabel: isCharter ? stateData.charterMethodologyLabel : null,
    charterCoachingText: isCharter ? stateData.charterCoachingText : null,
    enrollmentRevenueMethod: isCharter ? methodologyToEnrollmentMethod(stateData.charterMethodology) : null,
    availablePrograms: filteredPrograms,
    schoolChoiceCoachingText: buildSchoolChoiceCoaching(filteredPrograms, schoolType, normalized),
    federalTaxCreditSGO: stateData.federalTaxCreditSGO,
    stateCode: normalized,
    charterBasePerPupil: isCharter ? stateData.charterBasePerPupil : null,
  };
}

export function getAllStatesWithProgram(programType: SchoolChoiceProgramType): string[] {
  if (programType === "federal_tax_credit_sgo") {
    return Object.entries(STATE_FUNDING_MAP)
      .filter(([, data]) => data.federalTaxCreditSGO)
      .map(([code]) => code)
      .sort();
  }
  return Object.entries(STATE_FUNDING_MAP)
    .filter(([, data]) => data.programs.some(p => p.type === programType))
    .map(([code]) => code)
    .sort();
}

export function getCharterMethodologyStates(methodology: CharterMethodology): string[] {
  return Object.entries(STATE_FUNDING_MAP)
    .filter(([, data]) => data.charterMethodology === methodology)
    .map(([code]) => code)
    .sort();
}
