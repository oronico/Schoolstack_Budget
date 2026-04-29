import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeBaseFinancials } from "@workspace/finance";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  driverCoverageFixture,
  type TestModelPayload,
} from "@workspace/finance";

type FullModelData = Parameters<typeof computeBaseFinancials>[0];

function snapshot(fixture: TestModelPayload) {
  const m = computeBaseFinancials(fixture as unknown as FullModelData);
  return {
    enrollment: m.enrollment,
    revenue: m.revenue,
    staffingCost: m.staffingCost,
    facilityCost: m.facilityCost,
    opex: m.opex,
    totalExpenses: m.totalExpenses,
    netIncome: m.netIncome,
    netMargin: m.netMargin,
    dscr: m.dscr,
    staffingPctOfRevenue: m.staffingPctOfRevenue,
    cashPosition: m.cashPosition,
    cashRunwayMonths: m.cashRunwayMonths,
    reserveMonths: m.reserveMonths,
    breakEvenYear: m.breakEvenYear,
    loanDebtService: m.loanDebtService ?? null,
  };
}

const golden = {
  microschool: snapshot(microschoolFixture),
  privateSchool: snapshot(privateSchoolFixture),
  charter: snapshot(charterFixture),
  driverCoverage: snapshot(driverCoverageFixture),
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "lib", "__tests__", "scenario-engine-golden.json");
writeFileSync(outPath, JSON.stringify(golden, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
