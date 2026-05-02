/**
 * Task #436 regression test — board packet recruiting projection range.
 *
 * Verifies that:
 *   1. `buildRecruitingProjections` returns null for a non-CSN model
 *      (no `chesterton.recruitingPipeline`), so the renderer skips the
 *      section gracefully on microschool / charter / etc. fixtures.
 *   2. With a Chesterton fixture (recruiting pipeline + chosen
 *      `prospectConversionDivisor`), the helper returns the three
 *      best/expected/worst buckets with the math the wizard uses
 *      (floor(prospects/divisor); coverage% vs. sum of `year1`).
 *   3. The "Expected" bucket carries the founder's chosen divisor — not
 *      the 1-in-3 default — so the board sees the rate the rest of the
 *      budget actually assumes.
 *   4. The rendered board PDF contains all three projection numbers, the
 *      "Best/Expected/Worst" labels, the explicit "founder's chosen rate"
 *      annotation, and the section title — i.e. the section actually flows
 *      through `generateBoardPacketPDF` and isn't being silently dropped.
 */
import zlib from "node:zlib";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import {
  buildBoardPacket,
  buildRecruitingProjections,
} from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// PDF text extraction. Same approach as board-packet-cap-insight.ts /
// decision-history-pdf.ts — PDFKit emits text via both literal `(...)`
// strings and `<...>` hex strings (TJ + standard fonts), so we have to
// handle both. Inlined here so this test stays self-contained.
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
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    out.push(extractStringLiterals(body));
    cursor = eIdx + "endstream".length;
  }
  return out.join("\n");
}

function extractStringLiterals(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++;
      let depth = 1;
      let str = "";
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const n = content[i + 1];
          if (n === undefined) { i++; break; }
          if (n === "n") { str += "\n"; i += 2; continue; }
          if (n === "r") { str += "\r"; i += 2; continue; }
          if (n === "t") { str += "\t"; i += 2; continue; }
          if (n === "b" || n === "f") { i += 2; continue; }
          if (n === "(" || n === ")" || n === "\\") { str += n; i += 2; continue; }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (oct.length < 3 && i < content.length && content[i] >= "0" && content[i] <= "7") {
              oct += content[i];
              i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n;
          i += 2;
          continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") {
          depth--;
          if (depth === 0) { i++; break; }
          str += c;
          i++;
          continue;
        }
        str += c;
        i++;
      }
      result += str;
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
          hex += c;
        }
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) {
        str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      }
      result += str;
      continue;
    }
    i++;
  }
  return result;
}

// Layer Chesterton recruiting data on top of the microschool fixture so the
// rest of the consultant pipeline (which expects the full ModelData shape)
// still has everything it needs to build a valid board packet. The
// `chesterton.*` block is a top-level field on ModelData that
// `buildRecruitingProjections` reads via a structural cast; the underlying
// builder doesn't care that ModelData's TS type doesn't list it.
//
// Pipeline numbers chosen so the divisors yield distinct, easy-to-assert
// integers:
//   total prospects = 60
//   year1 goal = 20 (10 freshman + 10 sophomore)
//   best   (1 in 2) = floor(60/2) = 30 students  → 150% coverage
//   expected (1 in 3) = floor(60/3) = 20 students → 100% coverage
//   worst  (1 in 5) = floor(60/5) = 12 students  → 60% coverage
function chestertonFixture(divisor = 3): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  base.chesterton = {
    planningYear: 2027,
    prospectConversionDivisor: divisor,
    phaseEnrollment: [
      { grade: "freshman", year0: 0, year1: 10, year2: 10, year3: 10, year4: 10 },
      { grade: "sophomore", year0: 0, year1: 10, year2: 10, year3: 10, year4: 10 },
    ],
    recruitingPipeline: [
      { id: "r1", source: "Parish A", prospectiveStudents: 25 },
      { id: "r2", source: "Parish B", prospectiveStudents: 20 },
      { id: "r3", source: "Homeschool co-op", prospectiveStudents: 15 },
    ],
  };
  // Resolve the assumption flag the microschool fixture trips so
  // buildBoardPacket runs end-to-end through the consultant engine
  // without the flag-blocking path interfering.
  base.assumptionFlagResponses = [
    {
      field: "enrollment.year2",
      flagType: "enrollment_spike",
      reason: "Founders confirmed 18 family commitments via signed letters of intent.",
    },
  ];
  return base;
}

async function run() {
  // ---- 1. non-CSN model produces no projection block ---------------------
  const nonCsnInput = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  const nonCsnProjections = buildRecruitingProjections(nonCsnInput as unknown as ModelData);
  check(
    "non-CSN model returns null projections (renderer will skip the section)",
    nonCsnProjections === null,
    `expected null, got ${JSON.stringify(nonCsnProjections)}`,
  );

  // ---- 2. Chesterton model produces three buckets with correct math ------
  const csnInput = chestertonFixture(3);
  const projections = buildRecruitingProjections(csnInput as unknown as ModelData);
  check("CSN model returns a recruiting projections object", !!projections);
  check(
    "totalProspects sums prospectiveStudents across the pipeline (25+20+15=60)",
    projections?.totalProspects === 60,
    `got ${projections?.totalProspects}`,
  );
  check(
    "year1Goal sums year1 across phaseEnrollment (10+10=20)",
    projections?.year1Goal === 20,
    `got ${projections?.year1Goal}`,
  );
  check(
    "expectedDivisor matches the founder's chosen rate (3)",
    projections?.expectedDivisor === 3,
    `got ${projections?.expectedDivisor}`,
  );
  check(
    "exactly three projection rows (best, expected, worst)",
    projections?.projections.length === 3,
    `got ${projections?.projections.length}`,
  );

  const best = projections?.projections.find((p) => p.kind === "best");
  const expected = projections?.projections.find((p) => p.kind === "expected");
  const worst = projections?.projections.find((p) => p.kind === "worst");

  check("best bucket uses divisor 2", best?.divisor === 2);
  check(
    "best bucket projects floor(60/2) = 30 students",
    best?.projectedStudents === 30,
    `got ${best?.projectedStudents}`,
  );
  check(
    "best bucket coverage rounds to 150%",
    !!best && Math.round(best.coveragePct) === 150,
    `got ${best?.coveragePct}`,
  );

  check("expected bucket uses founder's chosen divisor (3)", expected?.divisor === 3);
  check(
    "expected bucket projects floor(60/3) = 20 students",
    expected?.projectedStudents === 20,
    `got ${expected?.projectedStudents}`,
  );
  check(
    "expected bucket coverage rounds to 100%",
    !!expected && Math.round(expected.coveragePct) === 100,
    `got ${expected?.coveragePct}`,
  );

  check("worst bucket uses divisor 5", worst?.divisor === 5);
  check(
    "worst bucket projects floor(60/5) = 12 students",
    worst?.projectedStudents === 12,
    `got ${worst?.projectedStudents}`,
  );
  check(
    "worst bucket coverage rounds to 60%",
    !!worst && Math.round(worst.coveragePct) === 60,
    `got ${worst?.coveragePct}`,
  );

  // ---- 3. founder's chosen divisor (not the 1-in-3 default) is honored ---
  const customDivisorInput = chestertonFixture(4);
  const customProjections = buildRecruitingProjections(customDivisorInput as unknown as ModelData);
  const customExpected = customProjections?.projections.find((p) => p.kind === "expected");
  check(
    "expected bucket reflects a non-default chosen divisor (4)",
    customExpected?.divisor === 4,
    `got ${customExpected?.divisor}`,
  );
  check(
    "expected bucket recomputes projection for the chosen divisor (60/4=15)",
    customExpected?.projectedStudents === 15,
    `got ${customExpected?.projectedStudents}`,
  );

  // ---- 4. rendered board PDF includes all three projections + labels -----
  const consultant = await runConsultantEngine(csnInput);
  const packet = buildBoardPacket(csnInput as unknown as ModelData, consultant, 1, "comfortable");
  check(
    "BoardPacket carries the recruitingProjections field for CSN models",
    !!packet.recruitingProjections,
    "buildBoardPacket dropped the projections — board PDF will skip the section",
  );

  const pdfBuffer = await generateBoardPacketPDF(packet);
  check("board PDF builds without error", pdfBuffer.length > 0);

  const pdfText = extractPDFText(pdfBuffer);

  check(
    "PDF contains the 'Recruiting Projection Range' section title",
    pdfText.includes("Recruiting Projection Range"),
    "section title missing — renderRecruitingProjections may not be wired into generateBoardPacketPDF",
  );
  check(
    "PDF contains the 'Best (1 in 2)' label",
    pdfText.includes("Best (1 in 2)"),
    `pdf text snippet: ${pdfText.slice(0, 400)}`,
  );
  check(
    "PDF contains the 'Expected' label with the founder's chosen rate annotation",
    pdfText.includes("Expected") && pdfText.includes("founder") && pdfText.includes("1 in 3"),
    "expected label/annotation missing — the founder's chosen rate must be clearly marked",
  );
  check(
    "PDF contains the 'Worst (1 in 5)' label",
    pdfText.includes("Worst (1 in 5)"),
    "worst-case label missing from PDF",
  );
  check(
    "PDF contains the best-case projected student count (30)",
    pdfText.includes("30"),
    "best-case projection number missing",
  );
  check(
    "PDF contains the expected projected student count (20)",
    pdfText.includes("20"),
    "expected projection number missing",
  );
  check(
    "PDF contains the worst-case projected student count (12)",
    pdfText.includes("12"),
    "worst-case projection number missing",
  );
  check(
    "PDF contains the Year 1 goal narrative (60-prospect pool, 20-student goal)",
    pdfText.includes("60") && pdfText.includes("Year 1 enrollment goal"),
    `pdf text snippet: ${pdfText.slice(0, 400)}`,
  );

  // ---- summary -----------------------------------------------------------
  console.log(`\nboard-packet-recruiting-projections: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
