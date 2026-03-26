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
  | "correspondence_charter";

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
  notes?: string;
}

export interface StateFundingEntry {
  charterMethodology: CharterMethodology;
  charterMethodologyLabel: string;
  charterCoachingText: string;
  programs: ProgramInfo[];
  federalTaxCreditSGO: boolean;
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
  federalTaxCreditSGO: boolean = false
): StateFundingEntry {
  return {
    charterMethodology: methodology,
    charterMethodologyLabel: methodologyLabel(methodology),
    charterCoachingText: coachingText(methodology),
    programs,
    federalTaxCreditSGO,
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

export const STATE_FUNDING_MAP: Record<string, StateFundingEntry> = {
  AL: entry("single_count_period", [
    refundableTaxCredit(1000, 2000, "CHOOSE Act — up to $2,000 for homeschoolers", 1000, 2000),
  ]),
  AK: entry("multiple_count_dates", [
    correspondenceCharter(2500, 2700, "Correspondence programs — ~$2,700/student"),
  ]),
  AZ: entry("multiple_count_dates", [
    esa(7000, 8000, true, "Universal ESA — ~$7,000-$8,000/student", 7000, 8000),
    taxCreditScholarship(2000, 5000, "4 tax-credit scholarship programs"),
  ], true),
  AR: entry("adm", [
    esa(6600, 7600, true, "Universal by 2025 — ~$6,600-$7,600/student"),
    taxCreditScholarship(2000, 5000),
  ], true),
  CA: entry("ada", [
    correspondenceCharter(2800, 3200, "Charter school enrollment pathway — ~$2,800-$3,200/student"),
  ]),
  CO: entry("single_count_day", [
  ], true),
  CT: entry("single_count_day", []),
  DE: entry("adm", []),
  FL: entry("adm", [
    esa(7000, 8000, true, "PEP scholarship for homeschoolers — ~$8,000", 7000, 8000),
    voucher(5000, 8000, false, "Multiple scholarship programs"),
  ], true),
  GA: entry("single_count_day", [
    esa(5500, 6500, false, "Promise Scholarship — $6,500 for students in lowest-performing districts (not yet launched)", undefined, undefined, "pending"),
    voucher(3000, 6000, false, "Georgia Special Needs Scholarship"),
    taxCreditScholarship(2000, 5000),
  ]),
  HI: entry("other", []),
  ID: entry("ada", [
    refundableTaxCredit(3000, 5000, "Parental Choice Tax Credit — up to $5,000/student (upheld by Supreme Court Feb 2026)", 3000, 5000),
  ]),
  IL: entry("multiple_count_periods", [
    individualTaxCredit(100, 250, "25% credit on qualifying expenses, max ~$250"),
  ]),
  IN: entry("single_count_day", [
    voucher(5000, 8000, true, "Choice Scholarship — universal (income cap eliminated 2026)"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1000, "~$1,000/child tax deduction"),
  ], true),
  IA: entry("single_count_day", [
    esa(7000, 8000, true, "Universal ESA — ~$8,000/student", 7000, 8000),
    taxCreditScholarship(2000, 5000),
  ], true),
  KS: entry("single_count_day", [
    taxCreditScholarship(2000, 5000),
  ]),
  KY: entry("ada", [
  ], true),
  LA: entry("multiple_count_dates", [
    esa(5000, 7000, false, "GATOR program — transitioning from voucher to ESA"),
    voucher(4000, 6000, false, "2 voucher programs"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1500, "School expense deduction"),
  ], true),
  ME: entry("multiple_count_dates", [
    voucher(4000, 8000, false, "Town tuitioning program"),
  ]),
  MD: entry("single_count_day", [
    voucher(3000, 6000, false, "BOOST Scholarship Program"),
  ]),
  MA: entry("single_count_day", []),
  MI: entry("multiple_count_dates", []),
  MN: entry("adm", [
    individualTaxCredit(500, 1500, "Education deduction/credit"),
    refundableTaxCredit(1000, 2000, "Refundable education credit", 500, 1500),
  ]),
  MS: entry("ada", [
    esa(5500, 6500, false, "Special needs ESA — ~$6,500", 5500, 6500),
    voucher(3000, 6000, false, "2 voucher programs"),
  ], true),
  MO: entry("ada", []),
  MT: entry("multiple_count_dates", [
    taxCreditScholarship(2000, 5000),
  ]),
  NE: entry("adm", [
  ], true),
  NV: entry("single_count_day", [
    taxCreditScholarship(2000, 5000),
  ]),
  NH: entry("single_count_day", [
    esa(4000, 4600, false, "Income-capped at 350% FPL — ~$4,600/student", 4000, 4600),
    voucher(4000, 6000, false),
    taxCreditScholarship(2000, 5000),
  ], true),
  NJ: entry("single_count_day", []),
  NM: entry("single_count_period", []),
  NY: entry("adm", []),
  NC: entry("adm", [
    esa(5000, 17000, false, "ESA+ for special needs students — ~$9,000-$17,000", 9000, 17000),
    voucher(5000, 8000, true, "Opportunity Scholarship"),
  ]),
  ND: entry("adm", [
  ], true),
  OH: entry("multiple_count_periods", [
    voucher(4000, 8000, false, "5 voucher programs (EdChoice ruled unconstitutional by lower court — appeal expected)", "litigated"),
    taxCreditScholarship(2000, 5000),
    individualTaxCredit(500, 1000, "2 individual tax credit programs"),
  ]),
  OK: entry("adm", [
    voucher(5000, 7500, false),
    taxCreditScholarship(2000, 5000),
    refundableTaxCredit(5000, 7500, "Parental Choice Tax Credit — $5,000-$7,500/student", 5000, 7500),
  ]),
  OR: entry("adm", [
    correspondenceCharter(2500, 3000, "Charter school enrollment pathway"),
  ]),
  PA: entry("adm", [
    taxCreditScholarship(2000, 5000, "2 tax-credit scholarship programs"),
  ]),
  RI: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ]),
  SC: entry("adm", [
    esa(3000, 6000, false, "Exceptional needs students", 3000, 6000),
    taxCreditScholarship(2000, 5000),
    refundableTaxCredit(2000, 5000, "Exceptional needs refundable credit"),
  ]),
  SD: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ]),
  TN: entry("adm", [
    esa(6000, 7000, false, "Limited geographic eligibility — $7,000/student", 6000, 7000),
  ], true),
  TX: entry("ada", [
    esa(10000, 10474, false, "Education Freedom Accounts — launching 2026-27; ~$10,474/student private, up to $30,000 IEP", 2000, 2000, "active", 2026),
  ]),
  UT: entry("single_count_day", [
    esa(7000, 8000, false, "Fits All — ~$8,000 (court challenges pending, status uncertain)", 7000, 8000, "litigated"),
    voucher(4000, 6000, false),
  ]),
  VT: entry("adm", [
    voucher(4000, 8000, false, "Town tuitioning program"),
  ]),
  VA: entry("adm", [
    taxCreditScholarship(2000, 5000),
  ], true),
  WA: entry("other", []),
  WV: entry("single_count_day", [
    esa(4500, 5300, true, "Hope Scholarship — ~$5,300, expanding to all homeschoolers 2026", 4500, 5300),
  ]),
  WI: entry("multiple_count_dates", [
    voucher(4000, 8000, false, "4 voucher programs"),
    individualTaxCredit(500, 1000),
  ]),
  WY: entry("single_count_period", [
    esa(5000, 6000, false, "~$6,000 (blocked by judge, status uncertain)", 5000, 6000, "blocked"),
  ]),
  DC: entry("adm", [
    voucher(5000, 12000, false, "DC Opportunity Scholarship"),
  ]),
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
  const stateData = STATE_FUNDING_MAP[stateCode.toUpperCase()];

  if (!stateData) {
    return {
      charterMethodology: null,
      charterMethodologyLabel: null,
      charterCoachingText: null,
      enrollmentRevenueMethod: null,
      availablePrograms: [],
      schoolChoiceCoachingText: `We don't have funding data for "${stateCode}". Please enter your revenue sources manually.`,
      federalTaxCreditSGO: false,
      stateCode,
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
    schoolChoiceCoachingText: buildSchoolChoiceCoaching(filteredPrograms, schoolType, stateCode),
    federalTaxCreditSGO: stateData.federalTaxCreditSGO,
    stateCode,
  };
}

export function getAllStatesWithProgram(programType: SchoolChoiceProgramType): string[] {
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
