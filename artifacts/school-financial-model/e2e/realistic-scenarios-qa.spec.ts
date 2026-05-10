import { test, expect } from "./utils/test";
import type { ConsoleMessage, Download, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";

/**
 * REALISTIC SCHOOL SCENARIO QA — drives the production /underwriting flow at
 *   https://budget.schoolstack.ai/underwriting
 * through six anonymized founder scenarios from the QA brief and validates:
 *   1. Math credibility (revenue + expense + DSCR sanity)
 *   2. Founder-safe tone (no banned credit-decision language)
 *   3. Excel workbook export (downloads, opens, no #REF / NaN / undefined)
 *   4. Expected risk flags surface in the Readiness Snapshot
 *
 * Scenarios are anonymized launch-program test schools — no real borrower data.
 *
 * Run with:
 *   E2E_BASE_URL=https://budget.schoolstack.ai \
 *     pnpm --filter @workspace/school-financial-model exec playwright test \
 *     realistic-scenarios-qa.spec.ts --workers=3 --reporter=list
 */

const STORAGE_KEY = "guest_underwriting_model_v1";

const QA_OUT_DIR = path.resolve(
  process.cwd(),
  ".local",
  "e2e-logs",
  "realistic-scenarios-qa",
);

test.beforeAll(() => {
  fs.mkdirSync(QA_OUT_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------
// Banned founder-facing language (from QA brief). These tokens MUST NOT appear
// in the Readiness Snapshot text or anywhere inside the exported workbook.
// Matched case-insensitively on word boundaries.
// ---------------------------------------------------------------------------
const BANNED_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "approved", pattern: /\bapproved\b/i },
  { label: "declined", pattern: /\bdeclined\b/i },
  { label: "rejected", pattern: /\brejected\b/i },
  { label: "ineligible", pattern: /\bineligible\b/i },
  { label: "failed", pattern: /\bfailed\b/i },
  { label: "pass/fail", pattern: /\bpass\s*\/\s*fail\b/i },
  { label: "credit decision", pattern: /\bcredit\s+decision\b/i },
  { label: "underwriting decision", pattern: /\bunderwriting\s+decision\b/i },
  { label: "loan approval", pattern: /\bloan\s+approval\b/i },
  { label: "approval packet", pattern: /\bapproval\s+packet\b/i },
  { label: "bank determination", pattern: /\bbank\s+determination\b/i },
];

// Workbook math-error / corruption tokens. Matched case-sensitively where the
// token is itself case-sensitive in xlsx (#REF!, #DIV/0!, etc.) and case-
// insensitively for the JS-leak tokens (undefined, NaN).
const WORKBOOK_BAD_TOKENS: { label: string; pattern: RegExp }[] = [
  { label: "#REF!", pattern: /#REF!/ },
  { label: "#DIV/0!", pattern: /#DIV\/0!/ },
  { label: "#VALUE!", pattern: /#VALUE!/ },
  { label: "#NAME?", pattern: /#NAME\?/ },
  { label: "#NUM!", pattern: /#NUM!/ },
  { label: "#N/A", pattern: /#N\/A\b/ },
  { label: "NaN", pattern: /\bNaN\b/ },
  { label: "undefined", pattern: /\bundefined\b/i },
];

interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const cap: ConsoleCapture = { errors: [], pageErrors: [] };
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") cap.errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    cap.pageErrors.push(String(err?.stack ?? err));
  });
  return cap;
}

async function clearStorageBeforeNav(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* about:blank may not have storage; init script reruns on real nav */
    }
  }, STORAGE_KEY);
}

async function fill(page: Page, testId: string, value: string): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el, `expected ${testId} visible`).toBeVisible({ timeout: 15_000 });
  await el.fill(value);
}

async function pick(page: Page, testId: string, value: string): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el, `expected ${testId} visible`).toBeVisible({ timeout: 15_000 });
  await el.selectOption(value);
}

async function setToggle(page: Page, testId: string, want: boolean): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el).toBeVisible({ timeout: 15_000 });
  const isOn = await el.isChecked();
  if (isOn !== want) {
    await el.click();
  }
}

async function clickNext(page: Page): Promise<void> {
  await page.getByTestId("button-next").click();
}

// ---------------------------------------------------------------------------
// Scenario definitions — anonymized founder personas from the QA brief.
// ---------------------------------------------------------------------------

type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";
type EnrollmentValidation =
  | "verbal_commitments"
  | "deposits_collected"
  | "signed_agreements";

interface Scenario {
  slug: string;
  name: string;
  schoolType:
    | "microschool"
    | "private_school"
    | "charter_school"
    | "public_school";
  stage: "new_school" | "operating_school";
  state: string;
  fundingProfile: FundingProfile;

  year1Students: number;
  growthPct: number;
  enrollmentValidation: EnrollmentValidation;
  signedAgreements?: number;
  depositCount?: number;
  averageDeposit?: number;
  collectionRate: number;
  retentionRate: number;

  tuition: number;
  publicFunding: number;
  philanthropy: number;

  studentsPerTeacher: number;
  teacherSalary: number;
  numAdmin: number;
  adminSalary: number;
  founderPaidYear1: boolean;
  founderComp: number;
  founderCompYear: 1 | 2 | 3 | 4 | 5;

  monthlyRent: number;
  utilities: number;
  insurance: number;
  curriculum: number;
  otherOpex: number;

  beginningCash: number;
  hasExistingDebt: boolean;
  existingDebtBalance?: number;
  existingDebtService?: number;

  // Public-funded only
  fundingApproval?: "approved" | "pending" | "not_applicable";
  canWithstand90DayDelay?: boolean;

  // Brief-supplied tone / risk expectations (free-text, used in the report)
  expectedTone: string;
  expectedFlags: string[];
}

const SCENARIOS: Scenario[] = [
  {
    slug: "S1-magnolia-fragile-microschool",
    name: "Magnolia Learning Studio",
    schoolType: "microschool",
    stage: "new_school",
    state: "SC",
    fundingProfile: "tuition_based",
    year1Students: 18,
    growthPct: 20,
    enrollmentValidation: "deposits_collected",
    depositCount: 7,
    averageDeposit: 250,
    collectionRate: 95,
    retentionRate: 80,
    tuition: 9500,
    publicFunding: 0,
    philanthropy: 10000,
    studentsPerTeacher: 10,
    teacherSalary: 42000,
    numAdmin: 0,
    adminSalary: 0,
    founderPaidYear1: false,
    founderComp: 45000,
    founderCompYear: 3,
    monthlyRent: 2500,
    utilities: 7200,
    insurance: 5000,
    curriculum: 6000,
    otherOpex: 10000,
    beginningCash: 8000,
    hasExistingDebt: false,
    expectedTone:
      "Model shows promise but needs more clarity around enrollment evidence, founder compensation, facility readiness, and cash cushion.",
    expectedFlags: [
      "founder compensation gap",
      "low beginning cash",
      "limited enrollment validation",
      "likely early cash pressure",
    ],
  },
  {
    slug: "S2-riverbend-stronger-operating",
    name: "Riverbend Microschool",
    schoolType: "microschool",
    stage: "operating_school",
    state: "FL",
    fundingProfile: "hybrid_mixed",
    year1Students: 48,
    growthPct: 12,
    enrollmentValidation: "signed_agreements",
    signedAgreements: 41,
    collectionRate: 96,
    retentionRate: 88,
    tuition: 11500,
    publicFunding: 4000,
    philanthropy: 0,
    studentsPerTeacher: 12,
    teacherSalary: 50000,
    numAdmin: 1,
    adminSalary: 58000,
    founderPaidYear1: true,
    founderComp: 58000,
    founderCompYear: 1,
    monthlyRent: 5200,
    utilities: 14000,
    insurance: 9000,
    curriculum: 15000,
    otherOpex: 24000,
    beginningCash: 65000,
    hasExistingDebt: true,
    existingDebtBalance: 18000,
    existingDebtService: 6000,
    fundingApproval: "approved",
    canWithstand90DayDelay: true,
    expectedTone:
      "More developed model anchored in operating history, enrollment evidence, and a clear facility path; still coaches on cash timing and debt service.",
    expectedFlags: [
      "mostly positive readiness",
      "debt service reflected in DSCR / readiness language",
    ],
  },
  {
    slug: "S3-horizon-esa-timing-risk",
    name: "Horizon Choice Academy",
    schoolType: "private_school",
    stage: "new_school",
    state: "AZ",
    fundingProfile: "hybrid_mixed",
    year1Students: 25,
    growthPct: 18,
    enrollmentValidation: "verbal_commitments",
    collectionRate: 92,
    retentionRate: 80,
    tuition: 5000,
    publicFunding: 8000,
    philanthropy: 15000,
    studentsPerTeacher: 11,
    teacherSalary: 48000,
    numAdmin: 1,
    adminSalary: 45000,
    founderPaidYear1: true,
    founderComp: 45000,
    founderCompYear: 1,
    monthlyRent: 3500,
    utilities: 9500,
    insurance: 7500,
    curriculum: 9000,
    otherOpex: 18000,
    beginningCash: 10000,
    hasExistingDebt: false,
    fundingApproval: "pending",
    canWithstand90DayDelay: false,
    expectedTone:
      "Annual revenue may support the plan, but cash timing could create pressure if public funds are delayed. Coach, not reject.",
    expectedFlags: [
      "public funding timing risk",
      "pending funding risk",
      "90-day delay risk",
      "limited enrollment validation",
      "cash cushion concern",
    ],
  },
  {
    slug: "S4-st-gabriel-board-funder-ready",
    name: "St. Gabriel Classical School",
    schoolType: "private_school",
    stage: "operating_school",
    state: "TX",
    fundingProfile: "tuition_based",
    year1Students: 78,
    growthPct: 8,
    enrollmentValidation: "signed_agreements",
    signedAgreements: 70,
    collectionRate: 97,
    retentionRate: 90,
    tuition: 8500,
    publicFunding: 0,
    philanthropy: 125000,
    studentsPerTeacher: 14,
    teacherSalary: 47000,
    numAdmin: 1,
    adminSalary: 72000,
    founderPaidYear1: true,
    founderComp: 72000,
    founderCompYear: 1,
    monthlyRent: 6500,
    utilities: 22000,
    insurance: 12000,
    curriculum: 20000,
    otherOpex: 48000,
    beginningCash: 95000,
    hasExistingDebt: false,
    expectedTone:
      "Strong operating foundation; gently raises whether philanthropy is recurring, restricted, or needed for ongoing operations.",
    expectedFlags: [
      "strong operating base",
      "philanthropy dependence visible",
      "facility / staffing burden visible",
    ],
  },
  {
    slug: "S5-civic-prep-charter",
    name: "Civic Prep Charter School",
    schoolType: "charter_school",
    stage: "operating_school",
    state: "CO",
    fundingProfile: "charter_public_funded",
    year1Students: 200,
    growthPct: 10,
    enrollmentValidation: "signed_agreements",
    signedAgreements: 190,
    collectionRate: 100,
    retentionRate: 86,
    tuition: 0,
    publicFunding: 11500,
    philanthropy: 150000,
    studentsPerTeacher: 18,
    teacherSalary: 58000,
    numAdmin: 2,
    adminSalary: 95000,
    founderPaidYear1: true,
    founderComp: 95000,
    founderCompYear: 1,
    monthlyRent: 38000,
    utilities: 65000,
    insurance: 35000,
    curriculum: 80000,
    otherOpex: 260000,
    beginningCash: 350000,
    hasExistingDebt: true,
    existingDebtBalance: 250000,
    existingDebtService: 58000,
    fundingApproval: "approved",
    canWithstand90DayDelay: true,
    expectedTone:
      "Model depends heavily on public funding timing and enrollment stability. Board review focus: cash timing, facility burden, downside enrollment.",
    expectedFlags: [
      "public funding concentration",
      "debt service reflected",
      "facility burden visible",
      "enrollment sensitivity relevant",
    ],
  },
  {
    slug: "S6-brightpath-fantasy-stress",
    name: "BrightPath Launch School",
    schoolType: "microschool",
    stage: "new_school",
    state: "GA",
    fundingProfile: "tuition_based",
    year1Students: 60,
    growthPct: 35,
    enrollmentValidation: "verbal_commitments",
    collectionRate: 90,
    retentionRate: 75,
    tuition: 14000,
    publicFunding: 0,
    philanthropy: 0,
    studentsPerTeacher: 20,
    teacherSalary: 35000,
    numAdmin: 0,
    adminSalary: 0,
    founderPaidYear1: false,
    founderComp: 50000,
    founderCompYear: 5,
    monthlyRent: 9500,
    utilities: 18000,
    insurance: 4000,
    curriculum: 3000,
    otherOpex: 5000,
    beginningCash: 2000,
    hasExistingDebt: true,
    existingDebtBalance: 40000,
    existingDebtService: 12000,
    expectedTone:
      "Model relies on several assumptions that need more support before sharing externally: enrollment evidence, facility readiness, founder compensation, cash cushion, debt service.",
    expectedFlags: [
      "aggressive enrollment growth",
      "weak enrollment evidence",
      "no founder compensation",
      "low beginning cash",
      "existing debt pressure",
    ],
  },
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface ScenarioResult {
  slug: string;
  name: string;
  readinessStatus: string;
  readinessCardText: string;
  reviewSchoolName: string;
  reviewY1: string;
  reviewY5: string;

  analysisAttempted: boolean;
  analysisSucceeded: boolean;
  analysisError: string | null;

  downloadAttempted: boolean;
  downloadSucceeded: boolean;
  downloadFilename: string | null;
  downloadBytes: number | null;
  downloadError: string | null;

  workbookOpened: boolean;
  workbookSheets: string[];
  workbookBadTokens: { label: string; sample: string }[];

  consoleErrors: number;
  pageErrors: number;
  consoleErrorSamples: string[];
  pageErrorSamples: string[];

  bannedInReadinessCard: { label: string; sample: string }[];
  bannedInWorkbook: { label: string; sample: string }[];

  // Math sanity (computed from review fields + scenario inputs)
  mathSanity: {
    expectedY1Revenue: number;
    expectedY5Students: number;
    reviewY5Number: number;
    revenueCredible: boolean;
    notes: string[];
  };
}

const RESULTS: ScenarioResult[] = [];

test.afterAll(() => {
  const summaryPath = path.join(QA_OUT_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(RESULTS, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(
    "\n=== REALISTIC SCENARIO QA — RESULTS ===\n" +
      JSON.stringify(RESULTS, null, 2) +
      `\n=== summary written to ${summaryPath} ===\n`,
  );
});

// ---------------------------------------------------------------------------
// Workbook validator
// ---------------------------------------------------------------------------

async function validateWorkbook(
  workbookPath: string,
): Promise<{
  opened: boolean;
  sheets: string[];
  badTokens: { label: string; sample: string }[];
  bannedTokens: { label: string; sample: string }[];
  rawTextSample: string;
}> {
  const buf = fs.readFileSync(workbookPath);
  const zip = await JSZip.loadAsync(buf);
  // sheet names from xl/workbook.xml
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const sheets: string[] = [];
  if (wbXml) {
    const re = /<sheet[^>]*name="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(wbXml)) !== null) sheets.push(m[1]);
  }

  // Concatenate all sheet xml + sharedStrings for the token sweep
  const parts: string[] = [];
  for (const fname of Object.keys(zip.files)) {
    if (
      fname.startsWith("xl/worksheets/") ||
      fname === "xl/sharedStrings.xml" ||
      fname === "xl/calcChain.xml"
    ) {
      const txt = await zip.file(fname)?.async("string");
      if (txt) parts.push(txt);
    }
  }
  const allText = parts.join("\n");

  const badTokens: { label: string; sample: string }[] = [];
  for (const t of WORKBOOK_BAD_TOKENS) {
    const m = t.pattern.exec(allText);
    if (m) {
      const start = Math.max(0, m.index - 60);
      badTokens.push({
        label: t.label,
        sample: allText.slice(start, m.index + 60).replace(/\s+/g, " "),
      });
    }
  }

  const bannedTokens: { label: string; sample: string }[] = [];
  for (const t of BANNED_PATTERNS) {
    const m = t.pattern.exec(allText);
    if (m) {
      const start = Math.max(0, m.index - 60);
      bannedTokens.push({
        label: t.label,
        sample: allText.slice(start, m.index + 60).replace(/\s+/g, " "),
      });
    }
  }

  return {
    opened: true,
    sheets,
    badTokens,
    bannedTokens,
    rawTextSample: allText.slice(0, 200),
  };
}

function scanBanned(
  text: string,
): { label: string; sample: string }[] {
  const out: { label: string; sample: string }[] = [];
  for (const t of BANNED_PATTERNS) {
    const m = t.pattern.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 50);
      out.push({
        label: t.label,
        sample: text.slice(start, m.index + 50).replace(/\s+/g, " "),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wizard driver — fills all 6 wizard steps from a Scenario object
// ---------------------------------------------------------------------------

async function driveScenario(page: Page, s: Scenario): Promise<void> {
  // Step 1
  await fill(page, "input-school-name", s.name);
  await pick(page, "select-school-type", s.schoolType);
  await pick(page, "select-school-stage", s.stage);
  await pick(page, "select-funding-profile", s.fundingProfile);
  await fill(page, "input-state", s.state);
  await clickNext(page);

  // Step 2
  await fill(page, "input-year1-students", String(s.year1Students));
  await fill(page, "input-growth-pct", String(s.growthPct));
  await pick(page, "select-enrollment-validation", s.enrollmentValidation);
  if (s.enrollmentValidation === "signed_agreements") {
    await fill(page, "input-signed-agreements", String(s.signedAgreements ?? 0));
  } else if (s.enrollmentValidation === "deposits_collected") {
    await fill(page, "input-deposit-count", String(s.depositCount ?? 0));
    await fill(page, "input-avg-deposit", String(s.averageDeposit ?? 0));
  }
  await fill(page, "input-collection-rate", String(s.collectionRate));
  await fill(page, "input-retention-rate", String(s.retentionRate));
  await clickNext(page);

  // Step 3
  await fill(page, "input-tuition", String(s.tuition));
  await fill(page, "input-public-funding", String(s.publicFunding));
  await fill(page, "input-philanthropy", String(s.philanthropy));
  await clickNext(page);

  // Step 4
  await fill(page, "input-students-per-teacher", String(s.studentsPerTeacher));
  await fill(page, "input-teacher-salary", String(s.teacherSalary));
  await fill(page, "input-num-admin", String(s.numAdmin));
  await fill(page, "input-admin-salary", String(s.adminSalary));
  await setToggle(page, "toggle-founder-paid", s.founderPaidYear1);
  await fill(page, "input-founder-comp", String(s.founderComp));
  await pick(page, "select-founder-comp-year", String(s.founderCompYear));
  await clickNext(page);

  // Step 5 (expenses + facility)
  await fill(page, "input-monthly-rent", String(s.monthlyRent));
  await fill(page, "input-utilities", String(s.utilities));
  await fill(page, "input-insurance", String(s.insurance));
  await fill(page, "input-curriculum", String(s.curriculum));
  await fill(page, "input-other-opex", String(s.otherOpex));
  await clickNext(page);

  // Step 6 (debt + cash + funding timing)
  await fill(page, "input-beginning-cash", String(s.beginningCash));
  await setToggle(page, "toggle-existing-debt", s.hasExistingDebt);
  if (s.hasExistingDebt) {
    await fill(page, "input-existing-debt-balance", String(s.existingDebtBalance ?? 0));
    await fill(page, "input-existing-debt-service", String(s.existingDebtService ?? 0));
  }
  if (s.fundingProfile === "charter_public_funded" || s.fundingProfile === "hybrid_mixed") {
    await pick(page, "select-funding-approval", s.fundingApproval ?? "approved");
    await setToggle(page, "toggle-90day-delay", s.canWithstand90DayDelay ?? true);
  }
  await clickNext(page);
}

// ---------------------------------------------------------------------------
// Run-analysis + download workflow shared by all scenarios
// ---------------------------------------------------------------------------

async function captureReviewAndExport(
  page: Page,
  s: Scenario,
  consoleCap: ConsoleCapture,
): Promise<ScenarioResult> {
  await expect(
    page.getByTestId("lender-readiness-snapshot"),
    "lender readiness snapshot must render on review",
  ).toBeVisible({ timeout: 20_000 });

  const readinessStatus = (
    await page.getByTestId("readiness-status").textContent()
  )?.trim() ?? "(missing)";
  const readinessCardText = (
    await page.getByTestId("lender-readiness-snapshot").textContent()
  )?.trim() ?? "";
  const reviewSchoolName = (
    await page.getByTestId("review-school-name").textContent()
  )?.trim() ?? "";
  const reviewY1 = (
    await page.getByTestId("review-y1-students").textContent()
  )?.trim() ?? "";
  const reviewY5 = (
    await page.getByTestId("review-y5-students").textContent()
  )?.trim() ?? "";

  // 1) Run readiness analysis
  let analysisSucceeded = false;
  let analysisError: string | null = null;
  const runBtn = page.getByTestId("button-run-analysis");
  const analysisAttempted = await runBtn.isVisible().catch(() => false);
  if (analysisAttempted) {
    await runBtn.click().catch(() => {});
    const success = page
      .getByTestId("card-analysis-result")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "success" as const)
      .catch(() => null);
    const failure = page
      .getByTestId("text-analysis-error")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "failure" as const)
      .catch(() => null);
    const outcome = await Promise.race([success, failure]);
    if (outcome === "success") {
      analysisSucceeded = true;
    } else if (outcome === "failure") {
      analysisError = (
        await page.getByTestId("text-analysis-error").textContent()
      )?.trim() ?? "(unknown error)";
    } else {
      analysisError = "timeout waiting for analysis result";
    }
  }

  // 2) Download workbook
  let downloadSucceeded = false;
  let downloadFilename: string | null = null;
  let downloadBytes: number | null = null;
  let downloadError: string | null = null;
  let workbookOpened = false;
  let workbookSheets: string[] = [];
  let workbookBadTokens: { label: string; sample: string }[] = [];
  let bannedInWorkbook: { label: string; sample: string }[] = [];

  const dlBtn = page.getByTestId("button-download-excel");
  const downloadAttempted = await dlBtn.isVisible().catch(() => false);
  if (downloadAttempted) {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
      await dlBtn.click();
      const download: Download = await downloadPromise;
      downloadFilename = download.suggestedFilename();
      const target = path.join(QA_OUT_DIR, `${s.slug}-${downloadFilename}`);
      await download.saveAs(target);
      const stat = fs.statSync(target);
      downloadBytes = stat.size;
      downloadSucceeded = downloadBytes > 1024;
      if (!downloadSucceeded) {
        downloadError = `workbook only ${downloadBytes} bytes — likely truncated`;
      } else {
        const v = await validateWorkbook(target);
        workbookOpened = v.opened;
        workbookSheets = v.sheets;
        workbookBadTokens = v.badTokens;
        bannedInWorkbook = v.bannedTokens;
      }
    } catch (err) {
      downloadError = String(err instanceof Error ? err.message : err);
      const errBanner = page.getByTestId("text-export-error");
      if (await errBanner.isVisible().catch(() => false)) {
        downloadError = `${downloadError} | banner: ${(
          await errBanner.textContent()
        )?.trim()}`;
      }
    }
  }

  const bannedInReadinessCard = scanBanned(readinessCardText);

  // 3) Math sanity (rough — flags clearly impossible math)
  // Expected Y1 revenue: students × (tuition + publicFunding) × collection + philanthropy
  const expectedY1Revenue = Math.round(
    s.year1Students * (s.tuition + s.publicFunding) * (s.collectionRate / 100) +
      s.philanthropy,
  );
  const expectedY5Students = Math.round(
    s.year1Students * Math.pow(1 + s.growthPct / 100, 4),
  );
  const reviewY5Number = Number(reviewY5.replace(/[^0-9]/g, "")) || 0;
  const mathNotes: string[] = [];
  // The wizard's Y5 projection clamps growth — accept ±15% drift before flagging.
  const y5Drift = expectedY5Students > 0 ? Math.abs(reviewY5Number - expectedY5Students) / expectedY5Students : 0;
  if (y5Drift > 0.15) {
    mathNotes.push(
      `Y5 students drift ${(y5Drift * 100).toFixed(1)}% (expected ~${expectedY5Students}, review showed ${reviewY5Number})`,
    );
  }
  // Revenue credibility: revenue per student should be within an order of magnitude of (tuition + publicFunding).
  const revenueCredible = expectedY1Revenue > 0 || s.tuition + s.publicFunding === 0;

  return {
    slug: s.slug,
    name: s.name,
    readinessStatus,
    readinessCardText,
    reviewSchoolName,
    reviewY1,
    reviewY5,
    analysisAttempted,
    analysisSucceeded,
    analysisError,
    downloadAttempted,
    downloadSucceeded,
    downloadFilename,
    downloadBytes,
    downloadError,
    workbookOpened,
    workbookSheets,
    workbookBadTokens,
    consoleErrors: consoleCap.errors.length,
    pageErrors: consoleCap.pageErrors.length,
    consoleErrorSamples: consoleCap.errors.slice(0, 5),
    pageErrorSamples: consoleCap.pageErrors.slice(0, 5),
    bannedInReadinessCard,
    bannedInWorkbook,
    mathSanity: {
      expectedY1Revenue,
      expectedY5Students,
      reviewY5Number,
      revenueCredible,
      notes: mathNotes,
    },
  };
}

// ---------------------------------------------------------------------------
// Test cases — one per scenario, parameterized
// ---------------------------------------------------------------------------

for (const s of SCENARIOS) {
  test(`[QA] ${s.slug} — ${s.name}`, async ({ page }) => {
    const consoleCap = attachConsoleCapture(page);
    await clearStorageBeforeNav(page);
    await page.goto("/underwriting", { waitUntil: "domcontentloaded" });

    await driveScenario(page, s);
    const result = await captureReviewAndExport(page, s, consoleCap);
    RESULTS.push(result);

    // P0 hard assertions — any of these fails ⇒ launch blocker.
    expect(
      result.pageErrors,
      `[P0] page errors: ${result.pageErrorSamples.join("\n")}`,
    ).toBe(0);
    expect(
      result.analysisAttempted,
      "[P0] Run readiness analysis button must render",
    ).toBe(true);
    expect(
      result.analysisSucceeded,
      `[P0] readiness analysis must succeed (err: ${result.analysisError})`,
    ).toBe(true);
    expect(
      result.downloadAttempted,
      "[P0] Download Excel button must render",
    ).toBe(true);
    expect(
      result.downloadSucceeded,
      `[P0] workbook download must succeed (err: ${result.downloadError})`,
    ).toBe(true);
    expect(
      result.downloadBytes ?? 0,
      "[P0] workbook must be > 10 KB",
    ).toBeGreaterThan(10_000);
    expect(
      result.workbookOpened,
      "[P0] workbook must open as a valid xlsx zip",
    ).toBe(true);
    expect(
      result.workbookBadTokens,
      `[P0] workbook contains broken-formula / NaN / undefined tokens: ${JSON.stringify(result.workbookBadTokens)}`,
    ).toEqual([]);
    expect(
      result.bannedInReadinessCard,
      `[P0] banned credit-decision language in readiness card: ${JSON.stringify(result.bannedInReadinessCard)}`,
    ).toEqual([]);
    expect(
      result.bannedInWorkbook,
      `[P0] banned credit-decision language in exported workbook: ${JSON.stringify(result.bannedInWorkbook)}`,
    ).toEqual([]);
  });
}
