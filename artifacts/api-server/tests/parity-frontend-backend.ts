// Golden-value snapshot test for the canonical scenario engine
// (computeBaseFinancials in lib/finance/src/decision-engine/scenario-engine.ts).
//
// Since Task #274 consolidated the api-server's three parallel calculation
// engines onto the canonical engine, the previous per-row backend parity
// checks (workbook-helpers vs FE engine) are no longer the right contract:
// the BE workbook helpers and the consultant engine now both flow through
// computeBaseFinancials for Y1-Y5 totals. What we lock in here are the
// canonical numbers themselves, so future engine changes are reviewed
// against an explicit, signed-off baseline.
import { computeBaseFinancials } from "@workspace/finance";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  type TestModelPayload,
} from "@workspace/finance";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerancePct = 0.01) {
  const absTol = Math.max(Math.abs(expected) * (tolerancePct / 100), 1);
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${Math.round(expected)}, got ${Math.round(actual)} (diff ${Math.round(diff)}, tol ${Math.round(absTol)})`);
  }
}

function checkArr(label: string, actual: number[], expected: number[]) {
  if (actual.length !== expected.length) {
    failed++;
    failures.push(`  FAIL: ${label} — length ${actual.length} != ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    check(`${label}[${i}]`, actual[i], expected[i]);
  }
}

function bool(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; }
  else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Goldens: BE engine outputs are computed AFTER applying the consultant
// engine's debtIncluded filter (loans stripped when debtIncluded === false),
// so the snapshots reflect the same fixture shape consumed in production.
function runBE(fixture: TestModelPayload) {
  const sp = fixture.schoolProfile;
  const debtIncluded = sp.debtIncluded !== false;
  const f = debtIncluded ? fixture : { ...fixture, capitalAndDebtRows: fixture.capitalAndDebtRows.filter(r => !r.isLoan) };
  return computeBaseFinancials(f as Parameters<typeof computeBaseFinancials>[0]);
}

interface BEGolden {
  revenue: number[];
  staffingCost: number[];
  facilityCost: number[];
  opex: number[];
  totalExpenses: number[];
  netIncome: number[];
  loanDebtService: number[];
  cashPosition: number[];
}

const microschoolGolden: BEGolden = {
  revenue:        [184667, 340512, 427946, 500518, 516085],
  staffingCost:   [118934, 147003, 151413, 155955, 160634],
  facilityCost:   [30000, 37050, 38131, 39243, 40388],
  opex:           [10500, 17835, 21643, 24768, 25388],
  totalExpenses:  [159434, 201888, 211186, 219967, 226410],
  netIncome:      [25232, 138624, 216759, 280551, 289675],
  loanDebtService:[0, 0, 0, 0, 0],
  cashPosition:   [40232, 178857, 395616, 676167, 965843],
};

const privateGolden: BEGolden = {
  revenue:        [1975000, 2612670, 3286760, 3895050, 4323000],
  staffingCost:   [854772, 854772, 854772, 854772, 854772],
  facilityCost:   [136400, 140492, 144706, 149045, 153512],
  opex:           [146500, 181210, 217905, 251209, 274889],
  totalExpenses:  [1196736, 1220538, 1261447, 1294091, 1322237],
  netIncome:      [778264, 1392132, 2025313, 2600959, 3000763],
  loanDebtService:[34064, 34064, 34064, 34064, 34064],
  cashPosition:   [853264, 2245395, 4270708, 6871667, 9872430],
};

const charterGolden: BEGolden = {
  revenue:        [1288333, 2522800, 3784600, 4759125, 5184400],
  staffingCost:   [997040, 1478601, 1796022, 2042905, 2113443],
  facilityCost:   [235000, 290460, 299166, 308150, 317393],
  opex:           [310000, 597400, 891355, 1130939, 1237531],
  totalExpenses:  [1706865, 2456285, 3076368, 3556818, 3738191],
  netIncome:      [-418532, 66515, 708232, 1202307, 1446209],
  loanDebtService:[49825, 49825, 49825, 49825, 49825],
  cashPosition:   [-368532, -302017, 406216, 1608523, 3054732],
};

function checkBEGolden(label: string, m: ReturnType<typeof computeBaseFinancials>, g: BEGolden) {
  console.log(`\n— ${label} —`);
  checkArr(`${label} revenue`, m.revenue, g.revenue);
  checkArr(`${label} staffingCost`, m.staffingCost, g.staffingCost);
  checkArr(`${label} facilityCost`, m.facilityCost, g.facilityCost);
  checkArr(`${label} opex`, m.opex, g.opex);
  checkArr(`${label} totalExpenses`, m.totalExpenses, g.totalExpenses);
  checkArr(`${label} netIncome`, m.netIncome, g.netIncome);
  checkArr(`${label} loanDebtService`, m.loanDebtService ?? [], g.loanDebtService);
  checkArr(`${label} cashPosition`, m.cashPosition, g.cashPosition);
}

function testCanonicalGoldens() {
  console.log("=== Canonical scenario engine: Y1-Y5 golden snapshots ===");
  console.log("Engine: lib/finance/src/decision-engine/scenario-engine.ts → computeBaseFinancials");
  console.log("Tolerance: 0.01% or $1 absolute minimum");

  checkBEGolden("Microschool", runBE(microschoolFixture), microschoolGolden);
  checkBEGolden("Private", runBE(privateSchoolFixture), privateGolden);
  checkBEGolden("Charter", runBE(charterFixture), charterGolden);
}

function testDscrIdentities() {
  console.log("\n— DSCR identity (NI + DS) / DS —");
  for (const [label, fixture, g] of [
    ["Private", privateSchoolFixture, privateGolden],
    ["Charter", charterFixture, charterGolden],
  ] as const) {
    const m = runBE(fixture);
    for (let y = 0; y < 5; y++) {
      const ds = g.loanDebtService[y];
      if (ds <= 0) continue;
      const expectedDscr = Math.round(((g.netIncome[y] + ds) / ds) * 100) / 100;
      const actualDscr = m.dscr[y];
      const diff = Math.abs(actualDscr - expectedDscr);
      const tol = Math.max(Math.abs(expectedDscr) * 0.01, 0.01);
      if (diff <= tol) { passed++; }
      else {
        failed++;
        failures.push(`  FAIL: ${label} Y${y + 1} DSCR — expected ${expectedDscr}, got ${actualDscr}`);
      }
    }
  }
}

async function testWorkbookGeneration() {
  console.log("\n— Underwriting workbook generation smoke test —");
  for (const [label, fixture] of [
    ["Microschool", microschoolFixture],
    ["Private", privateSchoolFixture],
    ["Charter", charterFixture],
  ] as const) {
    try {
      const wb = await generateUnderwritingWorkbook(fixture as Record<string, unknown>);
      bool(`${label}: workbook generated without error`, true);
      const sheetNames = wb.worksheets.map(ws => ws.name);
      bool(`${label}: has multiple sheets`, sheetNames.length >= 5, `sheetCount=${sheetNames.length}`);
      const hasAssumptions = sheetNames.some(n => n.toLowerCase().includes("assumption"));
      const hasOperating = sheetNames.some(n => n.toLowerCase().includes("operating") || n.toLowerCase().includes("income"));
      bool(`${label}: has assumptions sheet`, hasAssumptions, `sheets=${sheetNames.join(", ")}`);
      bool(`${label}: has operating/income sheet`, hasOperating, `sheets=${sheetNames.join(", ")}`);
    } catch (err) {
      failed++;
      failures.push(`  FAIL: ${label}: workbook generation threw — ${(err as Error).message}`);
    }
  }
}

async function main() {
  testCanonicalGoldens();
  testDscrIdentities();
  await testWorkbookGeneration();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
