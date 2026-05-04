/**
 * Task #469 — Single-year cascade for the expert review mailer.
 *
 * The advisor brief used to read `data.revenue[length-1]` and
 * `data.netIncome[length-1]` unconditionally and labelled them
 * "Y5 Revenue" / "Y5 Net Income". Single-year founders have length-5
 * arrays where Y2-Y5 are zero-padded, so advisors saw "Y5 Revenue: $0"
 * and assumed the school had shut down by Year 5.
 *
 * We exercise the pure `renderReviewRequestEmail` so the assertions are
 * pinned to the real template HTML without going through Resend.
 */
import { renderReviewRequestEmail, type ReviewRequestData } from "../mailer.js";

function makeData(over: Partial<ReviewRequestData> = {}): ReviewRequestData {
  return {
    requesterName: "Founder",
    requesterEmail: "founder@example.com",
    schoolName: "Test School",
    state: "CA",
    schoolType: "Microschool",
    entityType: "Nonprofit",
    enrollment: [50, 0, 0, 0, 0],
    revenue: [600_000, 0, 0, 0, 0],
    expenses: [550_000, 0, 0, 0, 0],
    netIncome: [50_000, 0, 0, 0, 0],
    dscr: [1.5, 0, 0, 0, 0],
    reserveMonths: 2,
    cashRunwayMonths: 60,
    daysCashOnHand: 60,
    criticalFindings: [],
    ...over,
  };
}

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
  }
}

// --- Five-year mode --------------------------------------------------------
const fiveYear = renderReviewRequestEmail(makeData({
  enrollment: [50, 70, 100, 130, 160],
  revenue: [600_000, 800_000, 1_100_000, 1_300_000, 1_500_000],
  expenses: [550_000, 700_000, 900_000, 1_000_000, 1_100_000],
  netIncome: [50_000, 100_000, 200_000, 300_000, 400_000],
  dscr: [1.2, 1.4, 1.6, 1.8, 2.0],
}));
check(
  "five-year mode labels the headline as Y5",
  fiveYear.html.includes("Y5 Revenue") && fiveYear.html.includes("Y5 Net Income"),
);
check(
  "five-year mode renders Y1 through Y5 column headers in the rollup table",
  fiveYear.html.includes(">Y1<") && fiveYear.html.includes(">Y5<"),
);
check(
  "five-year mode shows the Y5 figure ($1,500,000)",
  fiveYear.html.includes("$1,500,000"),
);

// --- Single-year mode ------------------------------------------------------
const singleYear = renderReviewRequestEmail(makeData({ isSingleYear: true }));
check(
  "single-year mode does NOT print 'Y5 Revenue' / 'Y5 Net Income'",
  !singleYear.html.includes("Y5 Revenue") && !singleYear.html.includes("Y5 Net Income"),
);
check(
  "single-year mode keeps the Y1 Revenue / Y1 Margin row",
  singleYear.html.includes("Y1 Revenue") && singleYear.html.includes("Y1 Margin"),
);
check(
  "single-year mode renders the Y1 Net Income label + value (relabel, not omit)",
  singleYear.html.includes("Y1 Net Income") && singleYear.html.includes("$50,000"),
  "expected the snapshot to surface Y1 Net Income for advisors",
);
check(
  "single-year mode replaces 'Enrollment Y1→Y5' with 'Enrollment Y1' (no phantom-year wording)",
  singleYear.html.includes("Enrollment Y1<") && !singleYear.html.includes("Y1→Y5"),
);
check(
  "single-year mode does NOT print the multi-year enrollment arrow chain",
  !singleYear.html.includes(" → "),
);
check(
  "single-year rollup renders only the Y1 column header",
  singleYear.html.includes(">Y1<") && !singleYear.html.includes(">Y2<") && !singleYear.html.includes(">Y5<"),
);
check(
  "single-year rollup does NOT print the phantom $0 Y2-Y5 cells",
  // Y1 figures in this fixture are non-zero ($600k rev / $550k exp /
  // $50k NI / 1.50x DSCR), so any "$0" cell can only originate from a
  // stray Y2-Y5 column slipping past the yearCount=1 slice.
  !singleYear.html.includes(">$0<"),
);
check(
  "single-year HTML never references Y2-Y5 anywhere (no Y5-anchored summary fields)",
  !/\bY[2-5]\b/.test(singleYear.html),
  "found a Y2-Y5 token in single-year output",
);

// --- Single-year break-even regression -------------------------------------
// Prior bug: `findBreakEvenYear(data.netIncome)` walked the full length-5
// array. With Y1 net loss and zero-padded Y2-Y5, a $0 net income reads as
// "broke even", so the brief printed a phantom "Year 2" break-even.
const singleYearLoss = renderReviewRequestEmail(makeData({
  isSingleYear: true,
  revenue: [400_000, 0, 0, 0, 0],
  expenses: [500_000, 0, 0, 0, 0],
  netIncome: [-100_000, 0, 0, 0, 0],
}));
check(
  "single-year Y1 loss does NOT print 'Year 2' (or any Y2+) break-even",
  !/Year [2-5]\b/.test(singleYearLoss.html),
  "expected break-even row to read 'Not reached in Year 1' for a single-year Y1 loss",
);
check(
  "single-year Y1 loss surfaces the explicit 'Not reached in Year 1' fallback",
  singleYearLoss.html.includes("Not reached in Year 1"),
);

const singleYearProfit = renderReviewRequestEmail(makeData({ isSingleYear: true }));
check(
  "single-year Y1 profit reports break-even as 'Year 1'",
  singleYearProfit.html.includes("Year 1"),
);

if (failures.length > 0) {
  console.error("\nmailer single-year cascade: FAIL");
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("\nmailer single-year cascade: OK");
