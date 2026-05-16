// Task #909 — synthetic guardrail: the `liquidity` HealthSignal must
// trigger off `min(cumulative_cash_by_month) < 0`, not off "monthly net
// cash flow < 0". The Oakwood demo (cumulative low = $4,932 in July,
// monthly net dips in some months) was wrongly emitting "Cash goes
// negative in month 1" pre-fix. The parallel `cash_flow_timing` signal
// covers the burns-more-than-it-generates-in-some-months case with
// distinct copy.

import { generateHealthSignals } from "../src/lib/financial-health.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { OAKWOOD_CEO_SEED } from "./fixtures/oakwood-ceo-seed.js";

let passed = 0;
let failed = 0;
const ok = (m: string) => { console.log(`  ✓ ${m}`); passed++; };
const bad = (m: string) => { console.error(`  ✗ ${m}`); failed++; };

function baseInput() {
  return {
    y1NetMargin: 0.05,
    lastYearNetMargin: 0.10,
    breakEvenYear: 0,
    yearCount: 5,
    cashRunwayMonths: 6,
    reserveMonths: 4,
    staffingCostPct: 0.55,
    facilityCostPct: 0.18,
    dscr: 1.5,
    hasDebt: true,
    philanthropyPct: 0.05,
    publicRevenuePct: 0.0,
    tuitionPct: 0.95,
    entityType: "for_profit",
    avgMonthlyBurn: 50_000,
  };
}

// Case 1 — cumulative cash dips below zero. Liquidity must flip to
// at_risk and reference the trough month + dollar amount, not the
// canonical cashRunwayMonths read as a month index.
{
  const signals = generateHealthSignals({
    ...baseInput(),
    lowestCumulativeCash: -15_000,
    lowestCumulativeCashMonthLabel: "Jul",
    lowestCumulativeCashYearIndex: 0,
    negativeNetCashFlowMonths: 4,
  });
  const liq = signals.find((s) => s.dimension === "liquidity");
  if (!liq) { bad("liquidity signal emitted (cumulative < 0)"); }
  else {
    if (liq.status === "at_risk") ok("cumulative < 0 → liquidity at_risk");
    else bad(`cumulative < 0 should be at_risk, got ${liq.status}`);
    if (/Cumulative cash dips/.test(liq.explanation)) ok("explanation references cumulative trough");
    else bad(`explanation should mention cumulative trough: ${liq.explanation}`);
    if (/Jul/.test(liq.explanation)) ok("explanation includes trough month label");
    else bad(`explanation should include 'Jul': ${liq.explanation}`);
    if (!/in month \d/.test(liq.explanation)) ok("explanation does NOT say 'in month N'");
    else bad(`explanation should not say 'in month N': ${liq.explanation}`);
  }
  // cash_flow_timing should be suppressed when liquidity is already at_risk
  const timing = signals.find((s) => s.dimension === "cash_flow_timing");
  if (!timing) ok("cash_flow_timing suppressed when liquidity already at_risk");
  else bad("cash_flow_timing should be suppressed when cumulative < 0");
}

// Case 2 — Oakwood pattern: cumulative stays positive but dips to a
// thin buffer ($4,932) in July. Liquidity is "watch" with buffer-thin
// copy, NOT "goes negative". cash_flow_timing emits a parallel watch
// signal because monthly net is negative in some months.
{
  const signals = generateHealthSignals({
    ...baseInput(),
    reserveMonths: 1.5,
    lowestCumulativeCash: 4_932,
    lowestCumulativeCashMonthLabel: "Jul",
    lowestCumulativeCashYearIndex: 0,
    negativeNetCashFlowMonths: 3,
  });
  const liq = signals.find((s) => s.dimension === "liquidity");
  if (!liq) { bad("liquidity signal emitted (Oakwood pattern)"); }
  else {
    if (liq.status === "watch") ok("Oakwood (positive trough, thin buffer) → liquidity watch");
    else bad(`Oakwood pattern should be watch, got ${liq.status}`);
    if (!/goes negative/i.test(liq.explanation)) ok("Oakwood liquidity copy does NOT say 'goes negative'");
    else bad(`Oakwood copy should not say 'goes negative': ${liq.explanation}`);
    if (/buffer thins/i.test(liq.explanation)) ok("Oakwood liquidity copy says 'buffer thins'");
    else bad(`Oakwood copy should say 'buffer thins': ${liq.explanation}`);
  }
  const timing = signals.find((s) => s.dimension === "cash_flow_timing");
  if (!timing) { bad("cash_flow_timing signal emitted when monthly net < 0 in some months"); }
  else {
    if (timing.status === "watch") ok("monthly net < 0 (cumulative ok) → cash_flow_timing watch");
    else bad(`cash_flow_timing should be watch, got ${timing.status}`);
    if (/burns more cash than it generates/.test(timing.explanation)) ok("cash_flow_timing copy uses distinct burn phrase");
    else bad(`cash_flow_timing copy should mention burns-more-than-generates: ${timing.explanation}`);
  }
}

// Case 3 — cumulative comfortable (> 1 month of burn) AND every month
// generates net cash. Both signals are healthy.
{
  const signals = generateHealthSignals({
    ...baseInput(),
    lowestCumulativeCash: 200_000,
    lowestCumulativeCashMonthLabel: "Jul",
    lowestCumulativeCashYearIndex: 0,
    negativeNetCashFlowMonths: 0,
  });
  const liq = signals.find((s) => s.dimension === "liquidity");
  if (liq?.status === "healthy") ok("comfortable buffer + good reserves → liquidity healthy");
  else bad(`expected liquidity healthy, got ${liq?.status}`);
  const timing = signals.find((s) => s.dimension === "cash_flow_timing");
  if (timing?.status === "healthy") ok("no negative months → cash_flow_timing healthy");
  else bad(`expected cash_flow_timing healthy, got ${timing?.status}`);
}

// Case 4 — legacy callers that don't pass cumulative data (workbook
// signals sheet) keep working: liquidity falls back to runway-based
// verdict without crashing and the cash_flow_timing dimension drops
// silently.
{
  const signals = generateHealthSignals({
    ...baseInput(),
    reserveMonths: 0.5,
    cashRunwayMonths: 1.2,
  });
  const liq = signals.find((s) => s.dimension === "liquidity");
  if (liq?.status === "at_risk") ok("legacy fallback: runway < 3 → at_risk");
  else bad(`legacy fallback expected at_risk, got ${liq?.status}`);
  if (liq && !/in month \d/i.test(liq.explanation)) ok("legacy fallback copy does NOT say 'in month N'");
  else bad(`legacy fallback copy should not say 'in month N': ${liq?.explanation}`);
  const timing = signals.find((s) => s.dimension === "cash_flow_timing");
  if (!timing) ok("cash_flow_timing dropped when negativeNetCashFlowMonths undefined");
  else bad("cash_flow_timing should be omitted for legacy callers");
}

// Case 5 — real Oakwood CEO demo seed end-to-end through the consultant
// engine. Oakwood's Y1 cumulative cash trough is positive but thin
// (~$5K in July). Before the #909 fix, the engine raised an at_risk
// liquidity signal claiming "Cash goes negative in month 1" because it
// was reading `cashRunwayMonths` as a 0-indexed month number. After
// the fix, liquidity must be "watch" with buffer-thin copy and the
// parallel cash_flow_timing signal must carry the burns-more phrase.
{
  const consultant = await runConsultantEngine(OAKWOOD_CEO_SEED);
  const signals = consultant.healthSignals || [];
  const liq = signals.find((s) => s.dimension === "liquidity");
  if (!liq) { bad("Oakwood real seed → liquidity signal emitted"); }
  else {
    if (liq.status === "watch") ok("Oakwood real seed → liquidity watch");
    else bad(`Oakwood real seed liquidity should be watch, got ${liq.status} — ${liq.explanation}`);
    if (!/goes negative/i.test(liq.explanation)) ok("Oakwood real seed liquidity copy does NOT say 'goes negative'");
    else bad(`Oakwood real seed liquidity should not say 'goes negative': ${liq.explanation}`);
    if (!/in month \d/i.test(liq.explanation)) ok("Oakwood real seed liquidity copy does NOT say 'in month N'");
    else bad(`Oakwood real seed liquidity should not say 'in month N': ${liq.explanation}`);
    if (/buffer thins/i.test(liq.explanation)) ok("Oakwood real seed liquidity copy says 'buffer thins'");
    else bad(`Oakwood real seed liquidity should say 'buffer thins': ${liq.explanation}`);
    // Lock in the actual computed trough — Oakwood's Y1 (Jul-start fiscal,
    // 10-month partial) burns harder in the first quarter while the
    // startup grant doesn't land until Q2, so cumulative cash bottoms
    // in Sep of Y1 at ~$703. Asserting the exact month + year keeps
    // future engine regressions from silently shifting the trough.
    if (/\bSep\b/.test(liq.explanation)) ok("Oakwood real seed liquidity copy pins trough to Sep");
    else bad(`Oakwood real seed liquidity should reference 'Sep' trough month: ${liq.explanation}`);
    if (/of Year 1/i.test(liq.explanation)) ok("Oakwood real seed liquidity copy pins trough to Year 1");
    else bad(`Oakwood real seed liquidity should reference 'of Year 1': ${liq.explanation}`);
  }
  const timing = signals.find((s) => s.dimension === "cash_flow_timing");
  if (!timing) { bad("Oakwood real seed → cash_flow_timing signal emitted"); }
  else {
    if (timing.status === "watch") ok("Oakwood real seed → cash_flow_timing watch");
    else bad(`Oakwood real seed cash_flow_timing should be watch, got ${timing.status} — ${timing.explanation}`);
    if (/burns more cash than it generates/.test(timing.explanation)) ok("Oakwood real seed cash_flow_timing copy uses burns-more phrase");
    else bad(`Oakwood real seed cash_flow_timing should say 'burns more cash than it generates': ${timing.explanation}`);
  }
}

console.log(`cash-goes-negative-flag: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
