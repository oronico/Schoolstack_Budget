import {
  computeSchoolProfileFacilityOverlay,
  hasSchoolProfileFacilityData,
  type FacilityOverlayResult,
} from "../src/lib/consultant-engine.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerance = 1) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${expected}, got ${Math.round(actual)} (diff ${Math.round(diff)})`);
  }
}

function checkZero(label: string, result: FacilityOverlayResult) {
  check(`${label} total`, result.total, 0);
  check(`${label} rent`, result.rent, 0);
  check(`${label} nnnCam`, result.nnnCam, 0);
  check(`${label} nnnMaintenance`, result.nnnMaintenance, 0);
  check(`${label} nnnUtilities`, result.nnnUtilities, 0);
  check(`${label} propertyTax`, result.propertyTax, 0);
  check(`${label} mortgage`, result.mortgage, 0);
  check(`${label} estimatedBudget`, result.estimatedBudget, 0);
}

const PF = 1;

function testSinglePhaseRentBaseline() {
  console.log("\n— Single Phase: Rent Baseline —");
  const sp = {
    locationSecured: true,
    facilityPhases: [{
      id: "p1", ownershipType: "rent", startYear: 1, endYear: 5,
      monthlyRent: 3000, annualRentEscalation: 3,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Rent Y1 base", y0.rent, 3000 * 12);

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, PF);
  check("Rent Y2 escalated", y1.rent, 3000 * 12 * 1.03, 1);

  const y4 = computeSchoolProfileFacilityOverlay(sp as any, 4, PF);
  check("Rent Y5 escalated", y4.rent, 3000 * 12 * Math.pow(1.03, 4), 2);
}

function testSinglePhaseRentWithNNN() {
  console.log("\n— Single Phase: Rent with NNN —");
  const sp = {
    locationSecured: true,
    facilityPhases: [{
      id: "p1", ownershipType: "rent", startYear: 1, endYear: 5,
      monthlyRent: 5000, annualRentEscalation: 0,
      isNNNLease: true, nnnCamCharges: 200, nnnMaintenance: 150, nnnUtilities: 100,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("NNN Y1 rent", y0.rent, 5000 * 12);
  check("NNN Y1 cam", y0.nnnCam, 200 * 12);
  check("NNN Y1 maint", y0.nnnMaintenance, 150 * 12);
  check("NNN Y1 util", y0.nnnUtilities, 100 * 12);
  check("NNN Y1 total", y0.total, 5000 * 12 + 200 * 12 + 150 * 12 + 100 * 12);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  const inflFactor = Math.pow(1.03, 2);
  check("NNN Y3 cam inflated", y2.nnnCam, 200 * 12 * inflFactor, 1);
  check("NNN Y3 maint inflated", y2.nnnMaintenance, 150 * 12 * inflFactor, 1);
  check("NNN Y3 util inflated", y2.nnnUtilities, 100 * 12 * inflFactor, 1);
}

function testSinglePhaseOwn() {
  console.log("\n— Single Phase: Own (Mortgage + Property Tax) —");
  const sp = {
    locationSecured: true,
    entityType: "llc_single",
    facilityPhases: [{
      id: "p1", ownershipType: "own", startYear: 1, endYear: 5,
      propertyTaxAnnual: 12000, hasMortgage: true, mortgageMonthlyPayment: 2500,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Own Y1 propTax", y0.propertyTax, 12000);
  check("Own Y1 mortgage", y0.mortgage, 2500 * 12);
  check("Own Y1 total", y0.total, 12000 + 2500 * 12);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("Own Y3 propTax growth", y2.propertyTax, 12000 * Math.pow(1.02, 2), 1);
  check("Own Y3 mortgage flat", y2.mortgage, 2500 * 12);
}

function testSinglePhaseOwnNonprofit() {
  console.log("\n— Single Phase: Own (Nonprofit — no property tax) —");
  const sp = {
    locationSecured: true,
    entityType: "nonprofit_501c3",
    facilityPhases: [{
      id: "p1", ownershipType: "own", startYear: 1, endYear: 5,
      propertyTaxAnnual: 12000, hasMortgage: true, mortgageMonthlyPayment: 2500,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Nonprofit Own Y1 propTax", y0.propertyTax, 0);
  check("Nonprofit Own Y1 mortgage", y0.mortgage, 2500 * 12);
}

function testSinglePhaseDonated() {
  console.log("\n— Single Phase: Donated —");
  const sp = {
    locationSecured: true,
    openingYear: 2026,
    facilityPhases: [{
      id: "p1", ownershipType: "donated", startYear: 1, endYear: 5,
      comparableMarketRent: 4000, hasWrittenAgreement: true,
      facilityArrangementEndDate: "2028-06-30",
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Donated Y1 rent (before end)", y0.rent, 0);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("Donated Y3 rent (after end)", y2.rent, 4000 * 12);
}

function testSinglePhaseHomeBased() {
  console.log("\n— Single Phase: Home-Based —");
  const sp = {
    locationSecured: true,
    facilityPhases: [{
      id: "p1", ownershipType: "home_based", startYear: 1, endYear: 5,
      monthlyFacilityAllocation: 800,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("HomeBased Y1 budget", y0.estimatedBudget, 800 * 12);
  check("HomeBased Y1 total", y0.total, 800 * 12);

  const y4 = computeSchoolProfileFacilityOverlay(sp as any, 4, PF);
  check("HomeBased Y5 budget flat", y4.estimatedBudget, 800 * 12);
}

function testMultiPhaseDonatedToRent() {
  console.log("\n— Multi-Phase: Donated (Y1–2) → Rent (Y3–5) —");
  const sp = {
    locationSecured: true,
    openingYear: 2026,
    facilityPhases: [
      { id: "p1", ownershipType: "donated", startYear: 1, endYear: 2, comparableMarketRent: 3000 },
      { id: "p2", ownershipType: "rent", startYear: 3, endYear: 5, monthlyRent: 4000, annualRentEscalation: 3 },
    ],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("DtoR Y1 total (donated, no market rent trigger)", y0.total, 0);

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, PF);
  check("DtoR Y2 total (donated)", y1.total, 0);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("DtoR Y3 rent base (phase 2 starts)", y2.rent, 4000 * 12);

  const y3 = computeSchoolProfileFacilityOverlay(sp as any, 3, PF);
  check("DtoR Y4 rent escalated from phase base", y3.rent, 4000 * 12 * 1.03, 1);

  const y4 = computeSchoolProfileFacilityOverlay(sp as any, 4, PF);
  check("DtoR Y5 rent escalated 2nd year", y4.rent, 4000 * 12 * Math.pow(1.03, 2), 2);
}

function testMultiPhaseRentToOwn() {
  console.log("\n— Multi-Phase: Rent (Y1–3) → Own (Y4–5) —");
  const sp = {
    locationSecured: true,
    entityType: "llc_single",
    facilityPhases: [
      { id: "p1", ownershipType: "rent", startYear: 1, endYear: 3, monthlyRent: 3500, annualRentEscalation: 2 },
      { id: "p2", ownershipType: "own", startYear: 4, endYear: 5, propertyTaxAnnual: 10000, hasMortgage: true, mortgageMonthlyPayment: 2000 },
    ],
  };

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, PF);
  check("RtoO Y2 rent", y1.rent, 3500 * 12 * 1.02, 1);
  check("RtoO Y2 mortgage", y1.mortgage, 0);

  const y3 = computeSchoolProfileFacilityOverlay(sp as any, 3, PF);
  check("RtoO Y4 rent (now own)", y3.rent, 0);
  check("RtoO Y4 mortgage", y3.mortgage, 2000 * 12);
  check("RtoO Y4 propTax", y3.propertyTax, 10000);

  const y4 = computeSchoolProfileFacilityOverlay(sp as any, 4, PF);
  check("RtoO Y5 propTax growth (relIdx=1)", y4.propertyTax, 10000 * 1.02, 1);
}

function testMultiPhaseNNNOnlyInLeasePhase() {
  console.log("\n— Multi-Phase: NNN charges only in lease phase —");
  const sp = {
    locationSecured: true,
    facilityPhases: [
      { id: "p1", ownershipType: "donated", startYear: 1, endYear: 2, comparableMarketRent: 2000 },
      { id: "p2", ownershipType: "rent", startYear: 3, endYear: 5, monthlyRent: 5000, isNNNLease: true, nnnCamCharges: 300, nnnMaintenance: 100, nnnUtilities: 50 },
    ],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("NNNPhase Y1 nnnCam (donated phase)", y0.nnnCam, 0);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("NNNPhase Y3 nnnCam (lease phase)", y2.nnnCam, 300 * 12);
  check("NNNPhase Y3 nnnMaint", y2.nnnMaintenance, 100 * 12);
  check("NNNPhase Y3 nnnUtil", y2.nnnUtilities, 50 * 12);
}

function testGapBetweenPhases() {
  console.log("\n— Edge Case: Gap between phases (Y3 uncovered) —");
  const sp = {
    locationSecured: true,
    facilityPhases: [
      { id: "p1", ownershipType: "rent", startYear: 1, endYear: 2, monthlyRent: 3000 },
      { id: "p2", ownershipType: "rent", startYear: 4, endYear: 5, monthlyRent: 4000 },
    ],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Gap Y1 rent", y0.rent, 3000 * 12);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  checkZero("Gap Y3 (uncovered)", y2);

  const y3 = computeSchoolProfileFacilityOverlay(sp as any, 3, PF);
  check("Gap Y4 rent (p2 starts)", y3.rent, 4000 * 12);
}

function testPhaseStartYearGtEndYear() {
  console.log("\n— Edge Case: startYear > endYear (invalid phase) —");
  const sp = {
    locationSecured: true,
    facilityPhases: [
      { id: "p1", ownershipType: "rent", startYear: 4, endYear: 2, monthlyRent: 5000 },
    ],
  };

  for (let y = 0; y < 5; y++) {
    const result = computeSchoolProfileFacilityOverlay(sp as any, y, PF);
    checkZero(`InvPhase Y${y + 1}`, result);
  }
}

function testProrationFactorY1() {
  console.log("\n— Proration Factor: Y1 partial year (10/12) —");
  const pf = 10 / 12;
  const sp = {
    locationSecured: true,
    facilityPhases: [{
      id: "p1", ownershipType: "rent", startYear: 1, endYear: 5,
      monthlyRent: 3000, annualRentEscalation: 0,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, pf);
  check("Prorated Y1 rent", y0.rent, 3000 * 12 * pf, 1);

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, pf);
  check("Full Y2 rent (pf only affects Y1)", y1.rent, 3000 * 12);
}

function testLegacySinglePhase() {
  console.log("\n— Legacy: No phases, flat fields —");
  const sp = {
    locationSecured: true,
    ownershipType: "rent",
    monthlyRent: 2500,
    annualRentEscalation: 2,
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("Legacy Y1 rent", y0.rent, 2500 * 12);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("Legacy Y3 rent escalated", y2.rent, 2500 * 12 * Math.pow(1.02, 2), 1);
}

function testLocationNotSecured() {
  console.log("\n— Location Not Secured: estimatedBudget fallback —");
  const sp = {
    locationSecured: false,
    estimatedMonthlyFacilityBudget: 5000,
    facilityPhases: [{
      id: "p1", ownershipType: "rent", startYear: 1, endYear: 5,
      monthlyRent: 3000,
    }],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("NotSecured Y1 budget", y0.estimatedBudget, 5000 * 12);
  check("NotSecured Y1 rent (ignored)", y0.rent, 0);
}

function testHasSchoolProfileFacilityData() {
  console.log("\n— hasSchoolProfileFacilityData checks —");

  check("hasFacData: phases with location", hasSchoolProfileFacilityData({
    locationSecured: true,
    facilityPhases: [{ id: "p1", ownershipType: "rent", startYear: 1, endYear: 5 }],
  } as any) ? 1 : 0, 1);

  check("hasFacData: no location + budget", hasSchoolProfileFacilityData({
    locationSecured: false,
    estimatedMonthlyFacilityBudget: 3000,
  } as any) ? 1 : 0, 1);

  check("hasFacData: empty profile", hasSchoolProfileFacilityData({} as any) ? 1 : 0, 0);

  check("hasFacData: rent with amount", hasSchoolProfileFacilityData({
    locationSecured: true,
    ownershipType: "rent",
    monthlyRent: 2000,
  } as any) ? 1 : 0, 1);

  check("hasFacData: own with tax", hasSchoolProfileFacilityData({
    locationSecured: true,
    ownershipType: "own",
    propertyTaxAnnual: 5000,
  } as any) ? 1 : 0, 1);

  check("hasFacData: home_based with allocation", hasSchoolProfileFacilityData({
    locationSecured: true,
    ownershipType: "home_based",
    monthlyFacilityAllocation: 500,
  } as any) ? 1 : 0, 1);

  check("hasFacData: donated", hasSchoolProfileFacilityData({
    locationSecured: true,
    ownershipType: "donated",
  } as any) ? 1 : 0, 1);
}

function testEscalationResetAtPhaseBoundary() {
  console.log("\n— Escalation Reset at Phase Boundary —");
  const sp = {
    locationSecured: true,
    facilityPhases: [
      { id: "p1", ownershipType: "rent", startYear: 1, endYear: 2, monthlyRent: 3000, annualRentEscalation: 5 },
      { id: "p2", ownershipType: "rent", startYear: 3, endYear: 5, monthlyRent: 4000, annualRentEscalation: 3 },
    ],
  };

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, PF);
  check("EscReset Y2 rent (p1 esc 5%)", y1.rent, 3000 * 12 * 1.05, 1);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("EscReset Y3 rent (p2 base, no inherited esc)", y2.rent, 4000 * 12);

  const y3 = computeSchoolProfileFacilityOverlay(sp as any, 3, PF);
  check("EscReset Y4 rent (p2 esc 3%, relIdx=1)", y3.rent, 4000 * 12 * 1.03, 1);
}

function testThreePhaseTimeline() {
  console.log("\n— Three-Phase Timeline —");
  const sp = {
    locationSecured: true,
    entityType: "llc_single",
    facilityPhases: [
      { id: "p1", ownershipType: "donated", startYear: 1, endYear: 1, comparableMarketRent: 2000 },
      { id: "p2", ownershipType: "rent", startYear: 2, endYear: 3, monthlyRent: 3500, annualRentEscalation: 2 },
      { id: "p3", ownershipType: "own", startYear: 4, endYear: 5, propertyTaxAnnual: 8000, hasMortgage: true, mortgageMonthlyPayment: 1800 },
    ],
  };

  const y0 = computeSchoolProfileFacilityOverlay(sp as any, 0, PF);
  check("3Phase Y1 total (donated, no trigger)", y0.total, 0);

  const y1 = computeSchoolProfileFacilityOverlay(sp as any, 1, PF);
  check("3Phase Y2 rent (p2 base)", y1.rent, 3500 * 12);

  const y2 = computeSchoolProfileFacilityOverlay(sp as any, 2, PF);
  check("3Phase Y3 rent (p2 esc)", y2.rent, 3500 * 12 * 1.02, 1);

  const y3 = computeSchoolProfileFacilityOverlay(sp as any, 3, PF);
  check("3Phase Y4 mortgage", y3.mortgage, 1800 * 12);
  check("3Phase Y4 propTax", y3.propertyTax, 8000);
  check("3Phase Y4 rent (should be 0)", y3.rent, 0);

  const y4 = computeSchoolProfileFacilityOverlay(sp as any, 4, PF);
  check("3Phase Y5 propTax growth", y4.propertyTax, 8000 * 1.02, 1);
}

console.log("=== Phase Boundary Regression Tests ===");
testSinglePhaseRentBaseline();
testSinglePhaseRentWithNNN();
testSinglePhaseOwn();
testSinglePhaseOwnNonprofit();
testSinglePhaseDonated();
testSinglePhaseHomeBased();
testMultiPhaseDonatedToRent();
testMultiPhaseRentToOwn();
testMultiPhaseNNNOnlyInLeasePhase();
testGapBetweenPhases();
testPhaseStartYearGtEndYear();
testProrationFactorY1();
testLegacySinglePhase();
testLocationNotSecured();
testHasSchoolProfileFacilityData();
testEscalationResetAtPhaseBoundary();
testThreePhaseTimeline();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failures.length > 0) {
  console.log("Failures:");
  failures.forEach(f => console.log(f));
  process.exit(1);
}
console.log("All phase boundary tests PASSED.");
