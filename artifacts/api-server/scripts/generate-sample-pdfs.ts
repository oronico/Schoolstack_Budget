import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { generateLoanReadinessPDF } from "../src/lib/pdf-loan-readiness.js";
import {
  CHARTER_SCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  MICROSCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

const OUT = resolve(process.cwd(), "qa-output/populated-samples");
mkdirSync(OUT, { recursive: true });

const PERSONAS = [
  { slug: "Charter_Public_Funding", model: CHARTER_SCHOOL_MODEL },
  { slug: "Private_School_ESA", model: PRIVATE_SCHOOL_MODEL },
  { slug: "Microschool_Startup", model: MICROSCHOOL_MODEL },
];

async function run() {
  for (const { slug, model } of PERSONAS) {
    const data = model.data as unknown as ModelData;
    const schoolName =
      (data as Record<string, any>)?.schoolProfile?.schoolName ?? slug;
    console.log(`\n=== ${slug} (${schoolName}) ===`);

    const consultant = await runConsultantEngine(
      data as unknown as Record<string, unknown>,
    );

    const lenderPacket = buildLenderPacket(data, consultant, 1);
    const lenderPdf = await generateLenderPacketPDF(lenderPacket);
    const lenderPath = `${OUT}/Lender_Packet__${slug}.pdf`;
    writeFileSync(lenderPath, lenderPdf);
    console.log(`  wrote ${lenderPath} (${lenderPdf.length} bytes)`);

    const boardPacket = buildBoardPacket(data, consultant, 1);
    const boardPdf = await generateBoardPacketPDF(boardPacket);
    const boardPath = `${OUT}/Board_Packet__${slug}.pdf`;
    writeFileSync(boardPath, boardPdf);
    console.log(`  wrote ${boardPath} (${boardPdf.length} bytes)`);

    const loanPdf = await generateLoanReadinessPDF(
      consultant,
      String(schoolName),
      (data as Record<string, any>)?.schoolProfile?.entityType,
    );
    const loanPath = `${OUT}/Loan_Readiness__${slug}.pdf`;
    writeFileSync(loanPath, loanPdf);
    console.log(`  wrote ${loanPath} (${loanPdf.length} bytes)`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
