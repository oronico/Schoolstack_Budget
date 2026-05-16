import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { microschoolStartup } from "./sample-payloads.js";

async function main() {
  const input: any = { ...(microschoolStartup as any) };
  input.customScenarios = [
    { name: "Add Middle School wing", outcomeStatus: "pursued", decisionType: "add_program",
      appliedToModelAt: "2025-03-15T12:00:00Z", outcomeUpdatedAt: "2025-03-15T12:00:00Z",
      overrides: { addProgramName: "Middle School", addProgramGradeBand: "6-8", addProgramTuition: 14000, addProgramEnrollment: [10,20,30,30,30], addProgramAddedFte: 2.5 },
      actuals: { asOfYear: 1, enrollmentActual: 42, revenueActual: 720000, expenseActual: 690000, netIncomeActual: 30000, programEnrollmentActual: 8, notes: "x", updatedAt: "2025-09-01T10:00:00Z" } },
    { name: "Lease downtown facility", outcomeStatus: "pursued", decisionType: "evaluate_site",
      appliedToModelAt: "2025-04-15T12:00:00Z", outcomeUpdatedAt: "2025-04-15T12:00:00Z",
      overrides: { monthlyRent: 8500, rentEscalation: 3, sqftDelta: 1500, siteFitOutCost: 75000 },
      actuals: { asOfYear: 1, enrollmentActual: 38, revenueActual: 650000, expenseActual: 720000, netIncomeActual: -70000, signedMonthlyRent: 9200, notes: "y", updatedAt: "2025-09-15T10:00:00Z" } },
  ];
  const consultant: any = await runConsultantEngine(input);
  const board: any = buildBoardPacket(input, consultant, 1, null, null);
  const lender: any = buildLenderPacket(input, consultant, 1, null, null);
  console.log("BOARD fa.entries:", board.forecastAccuracy?.entries?.length, "unfilt:", board.forecastAccuracyUnfilteredCount);
  console.log("LENDER fa.entries:", lender.forecastAccuracy?.entries?.length, "unfilt:", lender.forecastAccuracyUnfilteredCount);
  try {
    const pdf = await generateBoardPacketPDF(board);
    console.log("PDF gen OK, size:", pdf.length);
    const { default: fs } = await import("node:fs");
    fs.writeFileSync("/tmp/dbg-board.pdf", pdf);
    const zlib = await import("node:zlib");
    function extractPDFText(pdf: Buffer): string {
      const out: string[] = [];
      let cursor = 0;
      while (cursor < pdf.length) {
        const sIdx = pdf.indexOf("stream", cursor);
        if (sIdx === -1) break;
        let dataStart = sIdx + "stream".length;
        if (pdf[dataStart] === 0x0d) dataStart++;
        if (pdf[dataStart] === 0x0a) dataStart++;
        const eIdx = pdf.indexOf("endstream", dataStart);
        if (eIdx === -1) break;
        let dataEnd = eIdx;
        if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
        if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
        const raw = pdf.subarray(dataStart, dataEnd);
        let body = "";
        try { body = zlib.inflateSync(raw).toString("binary"); }
        catch { body = raw.toString("binary"); }
        for (const m of body.matchAll(/\(((?:[^\\()]|\\.)*)\)/g)) out.push(m[1].replace(/\\(.)/g, "$1"));
        for (const m of body.matchAll(/<([0-9a-fA-F]+)>/g)) {
          const hex = m[1]; let s = "";
          for (let i=0;i<hex.length;i+=4) s += String.fromCharCode(parseInt(hex.slice(i,i+4),16));
          out.push(s);
        }
        cursor = eIdx + "endstream".length;
      }
      return out.join("");
    }
    const text: string = extractPDFText(pdf);
    console.log("text length:", text.length);
    console.log("includes 'Forecast Accuracy':", text.includes("Forecast Accuracy"));
    console.log("includes 'Where our prior':", text.includes("Where our prior"));
    console.log("includes 'Forecast':", text.includes("Forecast"));
    console.log("includes 'Stress Test':", text.includes("Stress Test"));
    // print region around 'Forecast' if any
    const idx = text.indexOf("Forecast");
    console.log("first 'Forecast' at idx:", idx);
    if (idx >= 0) console.log("region:", JSON.stringify(text.slice(idx, idx + 200)));
    else console.log("last 600 chars:", JSON.stringify(text.slice(-600)));
  } catch (e: any) {
    console.error("PDF GEN THROWN:", e?.message);
    console.error(e?.stack?.slice(0, 3000));
  }
}
main().catch(e => { console.error("OUTER:", e?.message, e?.stack); process.exit(1); });
