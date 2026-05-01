import type {
  ChestertonData,
  ChestertonGradeRow,
  ChestertonSubjectRow,
  ChestertonFundraisingRow,
  ChestertonGiftRow,
  ChestertonRecruitingRow,
  ChestertonFacilityRow,
  ChestertonContactRow,
} from "../../pages/model-wizard/schema";

export const CHESTERTON_PHASES = ["Discovery", "Preparation", "Activation", "Launch"] as const;
export type ChestertonPhase = typeof CHESTERTON_PHASES[number];

export function chestertonPhaseForYear(yearOffset: number): ChestertonPhase {
  if (yearOffset <= 0) return "Discovery";
  if (yearOffset === 1) return "Preparation";
  if (yearOffset === 2) return "Activation";
  return "Launch";
}

export const CHESTERTON_GRADES: Array<{ key: ChestertonGradeRow["grade"]; label: string }> = [
  { key: "freshman", label: "Freshman (9th)" },
  { key: "sophomore", label: "Sophomore (10th)" },
  { key: "junior", label: "Junior (11th)" },
  { key: "senior", label: "Senior (12th)" },
];

export const DEFAULT_CHESTERTON_PHASE_ENROLLMENT: ChestertonGradeRow[] = [
  { grade: "freshman", year0: 15, year1: 15, year2: 20, year3: 21, year4: 22, year5: 22 },
  { grade: "sophomore", year0: 0, year1: 15, year2: 15, year3: 20, year4: 20, year5: 22 },
  { grade: "junior", year0: 0, year1: 0, year2: 13, year3: 14, year4: 18, year5: 20 },
  { grade: "senior", year0: 0, year1: 0, year2: 0, year3: 12, year4: 13, year5: 18 },
];

export const DEFAULT_CHESTERTON_CLASSES_PER_GRADE = [1, 1, 1, 2, 2, 2];

export const DEFAULT_CHESTERTON_SUBJECTS: ChestertonSubjectRow[] = [
  { id: "subj-literature", subject: "Literature", periodsPerSection: 5 },
  { id: "subj-mathematics", subject: "Mathematics", periodsPerSection: 5 },
  { id: "subj-theology", subject: "Theology", periodsPerSection: 5 },
  { id: "subj-latin", subject: "Latin", periodsPerSection: 5 },
  { id: "subj-science", subject: "Science", periodsPerSection: 5 },
  { id: "subj-history", subject: "History", periodsPerSection: 5 },
  { id: "subj-arts", subject: "Arts & Music", periodsPerSection: 3 },
  { id: "subj-pe", subject: "Physical Education", periodsPerSection: 2 },
];

export const DEFAULT_CHESTERTON_FUNDRAISING: ChestertonFundraisingRow[] = [
  { id: "fund-major", category: "Major Gifts ($25,000+)", goalAmount: 100000, numberOfGifts: 3, averageGift: 33333 },
  { id: "fund-mid", category: "Mid-Major Gifts ($5,000–$25,000)", goalAmount: 132500, numberOfGifts: 27, averageGift: 4907 },
  { id: "fund-annual", category: "Annual Fund ($500–$5,000)", goalAmount: 91250, numberOfGifts: 165, averageGift: 553 },
  { id: "fund-grass", category: "Grassroots (under $500)", goalAmount: 13125, numberOfGifts: 225, averageGift: 58 },
  { id: "fund-events", category: "Events", goalAmount: 50000, numberOfGifts: 0, averageGift: 0, notes: "Galas, auctions, peer-to-peer drives" },
];

// Standard Chesterton "Sample Gift Chart" pyramid — composition of first
// freshman class fundraising goal. Pulled from the CSN Operating Manual
// "5 - GIFT CHART" worksheet.
export const DEFAULT_CHESTERTON_GIFT_CHART: ChestertonGiftRow[] = [
  { id: "gift-50000", giftAmount: 50000, numberOfGifts: 1, numberOfProspects: 5 },
  { id: "gift-25000", giftAmount: 25000, numberOfGifts: 2, numberOfProspects: 5 },
  { id: "gift-20000", giftAmount: 20000, numberOfGifts: 1, numberOfProspects: 5 },
  { id: "gift-10000", giftAmount: 10000, numberOfGifts: 8, numberOfProspects: 20 },
  { id: "gift-7500", giftAmount: 7500, numberOfGifts: 7, numberOfProspects: 25 },
  { id: "gift-5000", giftAmount: 5000, numberOfGifts: 12, numberOfProspects: 25 },
  { id: "gift-2500", giftAmount: 2500, numberOfGifts: 17, numberOfProspects: 30 },
  { id: "gift-1000", giftAmount: 1000, numberOfGifts: 15, numberOfProspects: 30 },
  { id: "gift-500", giftAmount: 500, numberOfGifts: 35, numberOfProspects: 75 },
  { id: "gift-250", giftAmount: 250, numberOfGifts: 65, numberOfProspects: 120 },
  { id: "gift-100", giftAmount: 100, numberOfGifts: 100, numberOfProspects: 150 },
  { id: "gift-25", giftAmount: 25, numberOfGifts: 125, numberOfProspects: 250 },
];

export const DEFAULT_CHESTERTON_RECRUITING: ChestertonRecruitingRow[] = [
  { id: "rec-siblings", source: "Siblings of current students", prospectiveStudents: 0, notes: "If applicable" },
  { id: "rec-feeder", source: "Feeder school graduates", prospectiveStudents: 0, notes: "Parochial K–8 8th grade class" },
  { id: "rec-homeschool", source: "Homeschool students", prospectiveStudents: 0, notes: "Homeschool co-op partners" },
  { id: "rec-other", source: "Other source", prospectiveStudents: 0, notes: "Word of mouth, parish events, etc." },
];

export const DEFAULT_CHESTERTON_FACILITIES: ChestertonFacilityRow[] = [
  { id: "fac-1", name: "Phase I (Year 0–1)", capacity: 70, location: "TBD" },
  { id: "fac-2", name: "Phase II (Year 2–3)", capacity: 100, location: "TBD" },
  { id: "fac-3", name: "Phase III (Year 4+)", capacity: 250, location: "TBD" },
];

export const DEFAULT_CHESTERTON_PRIESTLY_OUTREACH: ChestertonContactRow[] = [
  { id: "priest-1", name: "Father TBD", affiliation: "Parish Name" },
  { id: "priest-2", name: "Father TBD", affiliation: "Parish Name" },
  { id: "priest-3", name: "Father TBD", affiliation: "Parish Name" },
];

export const DEFAULT_CHESTERTON_INFLUENCERS: ChestertonContactRow[] = [
  { id: "inf-1", name: "First Last", affiliation: "Role" },
  { id: "inf-2", name: "First Last", affiliation: "Role" },
];

function nextSchoolYearStart(): number {
  const now = new Date();
  // Plan year is the school-year that begins this fall (or next fall after
  // June). e.g. opened the model in Mar 2026 → planning for 2026; opened in
  // Aug 2026 → planning for 2026; opened in Apr 2027 → planning for 2027.
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear();
}

export function buildDefaultChestertonData(overrides: Partial<ChestertonData> = {}): ChestertonData {
  const totalFundraisingGoal = DEFAULT_CHESTERTON_FUNDRAISING.reduce((sum, row) => sum + (row.goalAmount || 0), 0);
  return {
    planningYear: nextSchoolYearStart() + 1,
    startingTuition: 8500,
    tuitionGrowthRate: 0.04,
    bookSupplyFee: 600,
    financialAidPct: 0.10,
    startingTeacherSalary: 44000,
    benefitsFirstYearAmount: 0,
    attritionRate: 0.10,
    totalFundraisingGoal,
    prospectConversionDivisor: 3,
    phaseEnrollment: DEFAULT_CHESTERTON_PHASE_ENROLLMENT.map(r => ({ ...r })),
    classesPerGrade: [...DEFAULT_CHESTERTON_CLASSES_PER_GRADE],
    salarySchedule: DEFAULT_CHESTERTON_SUBJECTS.map(r => ({ ...r })),
    fundraisingGoals: DEFAULT_CHESTERTON_FUNDRAISING.map(r => ({ ...r })),
    giftChart: DEFAULT_CHESTERTON_GIFT_CHART.map(r => ({ ...r })),
    recruitingPipeline: DEFAULT_CHESTERTON_RECRUITING.map(r => ({ ...r })),
    prospectiveFacilities: DEFAULT_CHESTERTON_FACILITIES.map(r => ({ ...r })),
    priestlyOutreach: DEFAULT_CHESTERTON_PRIESTLY_OUTREACH.map(r => ({ ...r })),
    keyInfluencers: DEFAULT_CHESTERTON_INFLUENCERS.map(r => ({ ...r })),
    ...overrides,
  };
}

// Quick helpers used by the wizard + export builder.
export function totalEnrollmentForYear(rows: ChestertonGradeRow[] | undefined, yearKey: keyof Omit<ChestertonGradeRow, "grade">): number {
  if (!rows) return 0;
  return rows.reduce((sum, r) => sum + (Number(r[yearKey]) || 0), 0);
}

export function chestertonYearLabels(planningYear: number): string[] {
  const labels: string[] = [];
  for (let i = -1; i <= 5; i++) {
    const start = planningYear + i;
    const end = String(start + 1).slice(-2);
    labels.push(`${start}-${end}`);
  }
  return labels;
}

export function avgSalaryPerPeriod(startingTeacherSalary: number, periodsPerFTE = 5): number {
  if (!periodsPerFTE) return 0;
  return startingTeacherSalary / periodsPerFTE;
}
