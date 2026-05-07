/**
 * Task #618 — Export reconciliation regression test.
 *
 * For each golden fixture (microschool, charter, Chesterton-style),
 * this test:
 *
 *   1. Computes the canonical baseline by calling the engine of
 *      record (`computeBaseFinancials` + `computeLenderStressTests`)
 *      and the consultant engine adapter (`runConsultantEngine`)
 *      that downstream exports consume.
 *
 *   2. Generates every founder-facing export — Lender Pro Forma
 *      workbook, Underwriting workbook, Lender packet PDF data,
 *      Board packet PDF data — and parses headline figures BACK out
 *      of each one.
 *
 *   3. Asserts every parsed figure (DSCR by year, ending cash,
 *      break-even students/year, runway months, normalized DSCR,
 *      stress-scenario results) matches the canonical engine output
 *      to the cent.
 *
 * If any export drifts off the canonical engine — even by a rounding
 * unit — the failure message names the golden model AND the metric
 * that drifted AND the export it drifted on, so the contributor can
 * locate the regression without sifting through diffs.
 *
 * This is the surface-by-surface companion to:
 *   - `cross-engine-test.ts` — locks the consultant engine snapshot.
 *   - `school-financial-model/.../scenario-engine-parity.test.ts` —
 *     locks the canonical engine snapshot.
 *   - `canonical-engine-enforcement.ts` — bans new local
 *     re-implementations of these formulas.
 *
 * Adding a new golden model? See `tests/CANONICAL-ENGINE.md`.
 */
import ExcelJS from "exceljs";
import {
  computeBaseFinancials,
  computeLenderStressTests,
  microschoolFixture,
  charterFixture,
  chestertonAcademyFixture,
  type TestModelPayload,
  type LenderStressTestResults,
} from "@workspace/finance";
import { runConsultantEngine, type ConsultantOutput } from "../src/lib/consultant-engine.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";

/** A 1-cent (or 1-student) tolerance — these MUST tie exactly. */
const CENT = 1;
/** DSCR / runway-month tolerance: same rounding the engine applies. */
const DSCR_EPS = 0.01;
const MONTH_EPS = 0.1;

interface GoldenSpec {
  name: string;
  fixture: TestModelPayload;
}

const GOLDENS: GoldenSpec[] = [
  { name: "microschool", fixture: microschoolFixture },
  { name: "charter", fixture: charterFixture },
  { name: "chesterton", fixture: chestertonAcademyFixture },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

/**
 * Centralized assertion helper. Failure messages name the golden
 * model AND the drifted metric AND the export surface so CI logs
 * point straight at the regression.
 */
function assertNear(
  golden: string,
  surface: string,
  metric: string,
  expected: number,
  actual: number,
  tol: number,
): void {
  const diff = Math.abs(expected - actual);
  if (Number.isFinite(expected) && Number.isFinite(actual) && diff <= tol) {
    passed++;
    return;
  }
  failed++;
  failures.push(
    `  FAIL [golden=${golden}] [surface=${surface}] [metric=${metric}] ` +
      `expected=${expected} actual=${actual} diff=${diff} tol=${tol}`,
  );
}

function assertEq<T>(
  golden: string,
  surface: string,
  metric: string,
  expected: T,
  actual: T,
): void {
  if (expected === actual) {
    passed++;
    return;
  }
  failed++;
  failures.push(
    `  FAIL [golden=${golden}] [surface=${surface}] [metric=${metric}] ` +
      `expected=${String(expected)} actual=${String(actual)}`,
  );
}

/** Read the cached numeric result of either a literal cell or a formula cell. */
function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result: unknown }).result;
    return r === null || r === undefined ? "" : String(r);
  }
  return String(v);
}

/**
 * Round-trip a generated workbook through xlsx serialization so we
 * exercise the same path the API hands to clients (cached formula
 * results survive serialization).
 */
async function roundtrip(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

/**
 * Walk the "Stress Tests" sheet of the lender pro-forma workbook,
 * collecting per-block (Base + 5 scenarios) parsed metrics keyed by
 * the block header. The block layout is set by `addLenderStressTestsSheet`
 * in `lender-proforma-export.ts`:
 *
 *   <header row>
 *   <description row>          (optional, italic)
 *   Net Income          | Y1..Y5 | Δ
 *   DSCR                | Y1..Y5 | Δ
 *   Ending Cash         | Y1..Y5 | Δ
 *   Break-Even Students | Y1..Y5 | Δ
 *   Cash Runway (mo)    | single value in Y1 col
 *   Break-Even Year     | "Year N" or "Never"
 *   <blank row>
 */
interface ParsedStressBlock {
  netIncome: number[];
  dscr: number[];
  endingCash: number[];
  breakEvenStudents: Array<number | null>;
  cashRunwayMonths: number;
  breakEvenYear: number | null;
}

function parseStressTestsSheet(
  ws: ExcelJS.Worksheet,
  expectedBlockNames: string[],
): Map<string, ParsedStressBlock> {
  const blocks = new Map<string, ParsedStressBlock>();
  let currentBlock: string | null = null;
  let working: Partial<ParsedStressBlock> = {};

  const flush = () => {
    if (
      currentBlock &&
      working.netIncome &&
      working.dscr &&
      working.endingCash &&
      working.breakEvenStudents &&
      typeof working.cashRunwayMonths === "number" &&
      working.breakEvenYear !== undefined
    ) {
      blocks.set(currentBlock, working as ParsedStressBlock);
    }
  };

  ws.eachRow((row) => {
    const colA = cellStr(row.getCell(1)).trim();
    const colB = cellStr(row.getCell(2)).trim();

    if (expectedBlockNames.includes(colA)) {
      flush();
      currentBlock = colA;
      working = {};
      return;
    }

    if (!currentBlock) return;

    const yearVals: number[] = [];
    for (let y = 0; y < 5; y++) {
      const v = cellNum(row.getCell(3 + y));
      yearVals.push(v ?? 0);
    }

    if (colB === "Net Income") {
      working.netIncome = yearVals;
    } else if (colB === "DSCR") {
      // Workbook writes "N/A" for engine-zero rows; treat those as 0
      // so we can compare to the canonical `dscr[]` array directly
      // (canonical also encodes "no debt" as 0).
      working.dscr = yearVals.map((v, y) => {
        const raw = row.getCell(3 + y).value;
        if (raw === "N/A") return 0;
        return v;
      });
    } else if (colB === "Ending Cash") {
      working.endingCash = yearVals;
    } else if (colB === "Break-Even Students") {
      working.breakEvenStudents = yearVals.map((v, y) => {
        const raw = row.getCell(3 + y).value;
        if (raw === "N/A" || raw === null || raw === undefined) return null;
        return v;
      });
    } else if (colB === "Cash Runway (mo)") {
      working.cashRunwayMonths = cellNum(row.getCell(3)) ?? 0;
    } else if (colB === "Break-Even Year") {
      const raw = cellStr(row.getCell(3)).trim();
      if (raw.toLowerCase() === "never" || raw === "") {
        working.breakEvenYear = null;
      } else {
        // "Year N"
        const m = /Year\s+(\d+)/i.exec(raw);
        working.breakEvenYear = m ? Number(m[1]) : null;
      }
    }
  });
  flush();
  return blocks;
}

/**
 * Parse "DSCR & Covenants" sheet of the underwriting workbook. We
 * need the per-year DSCR row, the Ending Cash row, the Months of
 * Runway row, and the Break-Even Enrollment row. Layout is
 * write-once in `buildDSCRCovenants` (`underwriting-workbook.ts`).
 */
interface ParsedUnderwritingDscrSheet {
  dscr: number[];
  endingCash: number[];
  monthsOfRunway: number[];
  breakEvenEnrollment: Array<number | null>;
  // Task #618 — to verify Days Cash / Months Runway formulas don't
  // accidentally reference the canonical Ending Cash row, we parse
  // the formula text and confirm it cites the working-capital basis
  // row (not the Ending Cash row).
  endingCashRowNumber: number;
  daysCashFormulas: string[];
  monthsRunwayFormulas: string[];
}

function parseUnderwritingDscrSheet(
  ws: ExcelJS.Worksheet,
  yearCount: number,
): ParsedUnderwritingDscrSheet {
  let dscrRow = -1;
  let cashRow = -1;
  let daysRow = -1;
  let runwayRow = -1;
  let beRow = -1;

  ws.eachRow((row, rowNumber) => {
    const label = cellStr(row.getCell(1)).trim();
    if (label === "DSCR" && dscrRow < 0) dscrRow = rowNumber;
    if (label === "Ending Cash" && cashRow < 0) cashRow = rowNumber;
    if (label === "Days Cash on Hand" && daysRow < 0) daysRow = rowNumber;
    if (label === "Months of Runway" && runwayRow < 0) runwayRow = rowNumber;
    // Two "Break-Even Enrollment" rows exist (one in Break-Even Analysis,
    // one in Scenarios). Take the first — that's the canonical one.
    if (label === "Break-Even Enrollment" && beRow < 0) beRow = rowNumber;
  });

  const readFormulas = (r: number): string[] => {
    if (r < 0) return new Array(yearCount).fill("");
    const out: string[] = [];
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const v = cell.value as { formula?: string } | string | number | null;
      out.push(
        typeof v === "object" && v !== null && "formula" in v && v.formula
          ? v.formula
          : "",
      );
    }
    return out;
  };

  const readYears = (r: number): number[] => {
    if (r < 0) return new Array(yearCount).fill(0);
    const out: number[] = [];
    for (let y = 0; y < yearCount; y++) {
      out.push(cellNum(ws.getCell(r, y + 2)) ?? 0);
    }
    return out;
  };

  const readYearsNullable = (r: number): Array<number | null> => {
    if (r < 0) return new Array(yearCount).fill(null);
    const out: Array<number | null> = [];
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      if (cell.value === "N/A") {
        out.push(null);
      } else {
        out.push(cellNum(cell));
      }
    }
    return out;
  };

  return {
    dscr: readYears(dscrRow),
    endingCash: readYears(cashRow),
    monthsOfRunway: readYears(runwayRow),
    breakEvenEnrollment: readYearsNullable(beRow),
    endingCashRowNumber: cashRow,
    daysCashFormulas: readFormulas(daysRow),
    monthsRunwayFormulas: readFormulas(runwayRow),
  };
}

// Excel column letter for a 1-indexed column number (1 → "A", 27 → "AA").
function colLetter(col: number): string {
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Reconcile every export surface against the canonical engine for a
 * single golden fixture. Each helper assertion records pass/fail
 * with the golden + surface + metric tagged so failures are
 * actionable.
 */
async function reconcileGolden(spec: GoldenSpec): Promise<void> {
  const { name, fixture } = spec;
  const rawData = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;

  // ---- 1. Canonical baseline ----------------------------------------
  // The single source of truth that every export must agree with.
  const baseMetrics = computeBaseFinancials(
    fixture as Parameters<typeof computeBaseFinancials>[0],
  );
  const canonicalStress: LenderStressTestResults = computeLenderStressTests(
    fixture as Parameters<typeof computeLenderStressTests>[0],
  );
  const consultantOutput: ConsultantOutput = await runConsultantEngine(rawData);

  // Engine-on-engine sanity: ConsultantOutput.lenderStressTests is
  // produced by the same `computeLenderStressTests` call internally,
  // but assert it here so any future regression that swaps the
  // implementation gets caught immediately.
  assertEq(
    name,
    "consultant-engine",
    "lenderStressTests.base.breakEvenYear",
    canonicalStress.base.breakEvenYear,
    consultantOutput.lenderStressTests.base.breakEvenYear,
  );
  assertNear(
    name,
    "consultant-engine",
    "cashRunwayMonths",
    baseMetrics.cashRunwayMonths,
    consultantOutput.cashRunwayMonths,
    MONTH_EPS,
  );

  // ---- 2. Lender Pro Forma workbook ---------------------------------
  // Stress Tests sheet must echo every block (Base + 5 scenarios) the
  // canonical helper produces, to the cent.
  const lenderBuf = await generateLenderProFormaWorkbook(rawData, consultantOutput);
  const lenderWb = await roundtrip(lenderBuf);
  const stressSheet = lenderWb.worksheets.find((w) => w.name === "Stress Tests");
  assertEq(
    name,
    "lender-proforma",
    "Stress Tests sheet exists",
    true,
    !!stressSheet,
  );
  if (stressSheet) {
    const blockNames = ["Base Case", ...canonicalStress.scenarios.map((s) => s.name)];
    const parsed = parseStressTestsSheet(stressSheet, blockNames);

    // Base block reconciliation
    const baseParsed = parsed.get("Base Case");
    assertEq(
      name,
      "lender-proforma:Stress",
      "Base Case block parsed",
      true,
      !!baseParsed,
    );
    if (baseParsed) {
      const expectedBaseEndingCash =
        baseMetrics.unrestrictedCash ?? baseMetrics.cashPosition;
      for (let y = 0; y < 5; y++) {
        assertNear(
          name,
          "lender-proforma:Stress(Base)",
          `DSCR Y${y + 1}`,
          canonicalStress.base.dscr[y] ?? 0,
          baseParsed.dscr[y] ?? 0,
          DSCR_EPS,
        );
        assertNear(
          name,
          "lender-proforma:Stress(Base)",
          `Net Income Y${y + 1}`,
          canonicalStress.base.netIncome[y] ?? 0,
          baseParsed.netIncome[y] ?? 0,
          CENT,
        );
        assertNear(
          name,
          "lender-proforma:Stress(Base)",
          `Ending Cash Y${y + 1}`,
          expectedBaseEndingCash[y] ?? 0,
          baseParsed.endingCash[y] ?? 0,
          CENT,
        );
        const expectBE = canonicalStress.base.breakEvenStudents[y];
        const actualBE = baseParsed.breakEvenStudents[y];
        if (expectBE === null) {
          assertEq(
            name,
            "lender-proforma:Stress(Base)",
            `Break-Even Students Y${y + 1}`,
            null,
            actualBE,
          );
        } else {
          assertNear(
            name,
            "lender-proforma:Stress(Base)",
            `Break-Even Students Y${y + 1}`,
            expectBE,
            actualBE ?? -1,
            CENT,
          );
        }
      }
      assertNear(
        name,
        "lender-proforma:Stress(Base)",
        "Cash Runway Months",
        canonicalStress.base.cashRunwayMonths,
        baseParsed.cashRunwayMonths,
        MONTH_EPS,
      );
      assertEq(
        name,
        "lender-proforma:Stress(Base)",
        "Break-Even Year",
        canonicalStress.base.breakEvenYear,
        baseParsed.breakEvenYear,
      );
    }

    // Each downstream scenario — including normalized DSCR
    // (`founder_normalization`) and stress-test results
    // (`enrollment_minus_10/20`, `esa_delay_3mo`, `rent_shock_25`).
    for (const sc of canonicalStress.scenarios) {
      const scParsed = parsed.get(sc.name);
      assertEq(
        name,
        `lender-proforma:Stress(${sc.id})`,
        "scenario block parsed",
        true,
        !!scParsed,
      );
      if (!scParsed) continue;
      for (let y = 0; y < 5; y++) {
        assertNear(
          name,
          `lender-proforma:Stress(${sc.id})`,
          `DSCR Y${y + 1}`,
          sc.dscr[y] ?? 0,
          scParsed.dscr[y] ?? 0,
          DSCR_EPS,
        );
        assertNear(
          name,
          `lender-proforma:Stress(${sc.id})`,
          `Ending Cash Y${y + 1}`,
          sc.endingCash[y] ?? 0,
          scParsed.endingCash[y] ?? 0,
          CENT,
        );
        assertNear(
          name,
          `lender-proforma:Stress(${sc.id})`,
          `Net Income Y${y + 1}`,
          sc.netIncome[y] ?? 0,
          scParsed.netIncome[y] ?? 0,
          CENT,
        );
      }
      assertNear(
        name,
        `lender-proforma:Stress(${sc.id})`,
        "Cash Runway Months",
        sc.cashRunwayMonths,
        scParsed.cashRunwayMonths,
        MONTH_EPS,
      );
      assertEq(
        name,
        `lender-proforma:Stress(${sc.id})`,
        "Break-Even Year",
        sc.breakEvenYear,
        scParsed.breakEvenYear,
      );
    }
  }

  // ---- 3. Underwriting workbook -------------------------------------
  // DSCR & Covenants sheet must surface DSCR, Ending Cash, Runway,
  // and Break-Even Enrollment derived from the same canonical
  // numbers that drive the dashboard.
  const uwWb = await generateUnderwritingWorkbook(rawData);
  const uwBuf = await uwWb.xlsx.writeBuffer();
  const uwLoaded = await roundtrip(uwBuf as Buffer);
  const dscrSheet = uwLoaded.worksheets.find((w) => w.name === "DSCR & Covenants");
  assertEq(
    name,
    "underwriting",
    "DSCR & Covenants sheet exists",
    true,
    !!dscrSheet,
  );
  if (dscrSheet) {
    // Task #618 — `generateUnderwritingWorkbook` calls
    // `computeBaseFinancials` against a workbook-built model object
    // that injects the resolved escalation rates into
    // `facilities.{annualSalaryIncrease, generalCostInflation}`.
    // Mirror that adjustment here so the canonical baseline we
    // compare against is the SAME baseline the workbook fed into the
    // sheet — otherwise we'd reconcile against the wrong vector and
    // get spurious diffs from escalation-resolution drift.
    const sharedRate =
      (rawData.tuitionEscalation as { rate?: number } | undefined)?.rate ?? 3;
    const salaryEscPct =
      (rawData.salaryEscalationRate as number | undefined) ?? sharedRate;
    const costInflPct =
      (rawData.costInflationRate as number | undefined) ?? sharedRate;
    const facilitiesIn =
      (rawData.facilities as Record<string, unknown> | undefined) ?? {};
    // Workbook strips loan rows when schoolProfile.debtIncluded === false;
    // mirror that here so canonical sees the same row set.
    const sp = rawData.schoolProfile as { debtIncluded?: boolean } | undefined;
    const debtIncluded = sp?.debtIncluded !== false;
    const capRowsIn = (rawData.capitalAndDebtRows as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
    const effectiveCapRows = debtIncluded
      ? capRowsIn
      : capRowsIn.filter((r) => !(r as { isLoan?: boolean }).isLoan);
    const beModelData = {
      ...rawData,
      capitalAndDebtRows: effectiveCapRows,
      facilities: {
        ...facilitiesIn,
        annualSalaryIncrease: salaryEscPct,
        generalCostInflation: costInflPct,
      },
    };
    const uwCanonical = computeBaseFinancials(
      beModelData as Parameters<typeof computeBaseFinancials>[0],
    );
    const parsed = parseUnderwritingDscrSheet(dscrSheet, 5);

    // Task #618 — guard against the regression where Days Cash on
    // Hand and Months of Runway formulas accidentally reference the
    // (now canonical accrual) "Ending Cash" row. Both must point to
    // the hidden working-capital basis row instead, otherwise a
    // workbook recalculation in Excel would silently flip those
    // covenant-relevant metrics to a different cash basis than the
    // cached values reflect.
    const endingCashRefs = [
      `B${parsed.endingCashRowNumber}`,
      `C${parsed.endingCashRowNumber}`,
      `D${parsed.endingCashRowNumber}`,
      `E${parsed.endingCashRowNumber}`,
      `F${parsed.endingCashRowNumber}`,
    ];
    for (let y = 0; y < 5; y++) {
      const colRef = `${colLetter(y + 2)}${parsed.endingCashRowNumber}`;
      const daysFormula = parsed.daysCashFormulas[y] ?? "";
      const runwayFormula = parsed.monthsRunwayFormulas[y] ?? "";
      assertEq(
        name,
        "underwriting:DSCR&Covenants",
        `Days Cash Y${y + 1} formula avoids Ending Cash row (${colRef})`,
        false,
        endingCashRefs.some((ref) => daysFormula.includes(ref)),
      );
      assertEq(
        name,
        "underwriting:DSCR&Covenants",
        `Months Runway Y${y + 1} formula avoids Ending Cash row (${colRef})`,
        false,
        endingCashRefs.some((ref) => runwayFormula.includes(ref)),
      );
    }
    // The headline DSCR / Ending Cash / Break-Even rows
    // on the "DSCR & Covenants" sheet are now sourced from
    // @workspace/finance via canonicalOverrides in
    // generateUnderwritingWorkbook, so they MUST tie to the canonical
    // engine to the cent. The CFADS row above the DSCR row, the
    // working-capital cash trajectory used by Days Cash / Months
    // Runway / Current Ratio, and the per-student break-even
    // derivation rows are intentionally left as the loan-committee
    // analytical view and are not reconciled here.
    for (let y = 0; y < 5; y++) {
      // DSCR: canonical reports 0 as "no debt service modeled" and
      // the workbook surfaces "N/A" for that case (parsed as 0
      // because cellNum on "N/A" returns null → fallback 0).
      const expectDscr = uwCanonical.dscr[y] ?? 0;
      assertNear(
        name,
        "underwriting:DSCR&Covenants",
        `DSCR Y${y + 1}`,
        expectDscr,
        parsed.dscr[y] ?? 0,
        DSCR_EPS,
      );
      // Ending Cash: canonical accrual cash position.
      assertNear(
        name,
        "underwriting:DSCR&Covenants",
        `Ending Cash Y${y + 1}`,
        uwCanonical.cashPosition[y] ?? 0,
        parsed.endingCash[y] ?? 0,
        CENT,
      );
      // Break-Even Enrollment: canonical contribution-margin output.
      const expectBE = uwCanonical.breakEvenStudents[y];
      const actualBE = parsed.breakEvenEnrollment[y];
      if (expectBE === null) {
        assertEq(
          name,
          "underwriting:DSCR&Covenants",
          `Break-Even Enrollment Y${y + 1}`,
          null,
          actualBE,
        );
      } else {
        assertNear(
          name,
          "underwriting:DSCR&Covenants",
          `Break-Even Enrollment Y${y + 1}`,
          expectBE,
          actualBE ?? -1,
          CENT,
        );
      }
    }
  }

  // ---- 4. Lender packet PDF data ------------------------------------
  // The PDF renderer is deterministic over `LenderPacket` data, so
  // asserting the structured packet object guarantees the rendered
  // PDF carries the same numbers (the per-section PDF tests already
  // verify the renderer doesn't drop them).
  const lenderPacket = buildLenderPacket(
    rawData as never,
    consultantOutput,
    /* modelId */ 1,
  );

  // Cash runway (board + lender share the helper)
  assertNear(
    name,
    "lender-packet:cashRunway",
    "runwayMonths",
    consultantOutput.cashRunwayMonths,
    lenderPacket.cashRunway.runwayMonths,
    MONTH_EPS,
  );

  // Break-even & downside (Task #612 — sourced via computeBaseFinancials)
  for (let y = 0; y < 5; y++) {
    const expectBE = baseMetrics.breakEvenStudents[y];
    const actualBE = lenderPacket.breakEvenDownside.breakEvenStudents[y];
    if (expectBE === null) {
      assertEq(
        name,
        "lender-packet:breakEvenDownside",
        `breakEvenStudents Y${y + 1}`,
        null,
        actualBE,
      );
    } else {
      assertNear(
        name,
        "lender-packet:breakEvenDownside",
        `breakEvenStudents Y${y + 1}`,
        expectBE,
        actualBE ?? -1,
        CENT,
      );
    }
  }

  // Lender stress tests pull-through (Task #616)
  for (const sc of canonicalStress.scenarios) {
    const scInPacket = lenderPacket.lenderStressTests.scenarios.find(
      (s) => s.id === sc.id,
    );
    assertEq(
      name,
      "lender-packet:stress",
      `scenario ${sc.id} present`,
      true,
      !!scInPacket,
    );
    if (!scInPacket) continue;
    for (let y = 0; y < 5; y++) {
      assertNear(
        name,
        `lender-packet:stress(${sc.id})`,
        `DSCR Y${y + 1}`,
        sc.dscr[y] ?? 0,
        scInPacket.dscr[y] ?? 0,
        DSCR_EPS,
      );
      assertNear(
        name,
        `lender-packet:stress(${sc.id})`,
        `Ending Cash Y${y + 1}`,
        sc.endingCash[y] ?? 0,
        scInPacket.endingCash[y] ?? 0,
        CENT,
      );
    }
    assertNear(
      name,
      `lender-packet:stress(${sc.id})`,
      "cashRunwayMonths",
      sc.cashRunwayMonths,
      scInPacket.cashRunwayMonths,
      MONTH_EPS,
    );
    assertEq(
      name,
      `lender-packet:stress(${sc.id})`,
      "breakEvenYear",
      sc.breakEvenYear,
      scInPacket.breakEvenYear,
    );
  }

  // ---- 5. Board packet PDF data -------------------------------------
  const boardPacket = buildBoardPacket(rawData as never, consultantOutput, 1);
  assertNear(
    name,
    "board-packet:cashRunway",
    "runwayMonths",
    consultantOutput.cashRunwayMonths,
    boardPacket.cashRunway.runwayMonths,
    MONTH_EPS,
  );
  // Board packet's runway view comes from the same `buildCashRunway`
  // helper as the lender packet — reconcile the trough year to
  // confirm both deliverables show the same crunch year.
  assertEq(
    name,
    "board-packet:cashRunway",
    "trough year matches lender packet",
    lenderPacket.cashRunway.troughCallout?.year ?? null,
    boardPacket.cashRunway.troughCallout?.year ?? null,
  );
}

async function main(): Promise<void> {
  for (const golden of GOLDENS) {
    try {
      await reconcileGolden(golden);
    } catch (err) {
      failed++;
      failures.push(
        `  FAIL [golden=${golden.name}] [surface=harness] threw: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `\nExport reconciliation: ${passed} passed, ${failed} failed across ${GOLDENS.length} golden model(s).`,
  );
  if (failed > 0) {
    console.error("\nDrift detected — every failure below names the golden model + metric:\n");
    for (const f of failures) console.error(f);
    console.error(
      "\nNext step: trace the failing surface back to its data builder. " +
        "Headline figures must come from `@workspace/finance` " +
        "(`computeBaseFinancials`, `computeLenderStressTests`, " +
        "`computeCashRunwayMonths`). See tests/CANONICAL-ENGINE.md.\n",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Export reconciliation crashed:", err);
  process.exit(1);
});
