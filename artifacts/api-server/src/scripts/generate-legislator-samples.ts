import { db } from "@workspace/db";
import { financialModelsTable, exportsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runConsultantEngine } from "../lib/consultant-engine.js";
import { generateWorkbook } from "../lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../lib/underwriting-workbook.js";
import { buildLenderPacket } from "../lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../lib/packets/board-packet-pdf.js";
import type { ModelData } from "../lib/workbook-helpers.js";
import {
  CHARTER_SCHOOL_DEMO,
  MICROSCHOOL_DEMO,
  PRIVATE_SCHOOL_DEMO,
} from "../lib/demo-models/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface SampleModel {
  name: string;
  slug: string;
  schoolStage: "new_school" | "operating_school";
  fundingProfile: "tuition_based" | "charter_public_funded" | "hybrid_mixed";
  data: Record<string, unknown>;
}

// Each sample wraps a canonical demo school from src/lib/demo-models/
// (see task #546). The legislator script only needs to add its own
// "(Legislator Sample)" name suffix and the slug used for the export
// filenames — everything else lives in the shared module.
const MICROSCHOOL: SampleModel = {
  name: `${MICROSCHOOL_DEMO.baseSchoolName} (Legislator Sample)`,
  slug: MICROSCHOOL_DEMO.slug,
  schoolStage: MICROSCHOOL_DEMO.schoolStage,
  fundingProfile: MICROSCHOOL_DEMO.fundingProfile,
  data: MICROSCHOOL_DEMO.data,
};

const PRIVATE_SCHOOL: SampleModel = {
  name: `${PRIVATE_SCHOOL_DEMO.baseSchoolName} (Legislator Sample)`,
  slug: PRIVATE_SCHOOL_DEMO.slug,
  schoolStage: PRIVATE_SCHOOL_DEMO.schoolStage,
  fundingProfile: PRIVATE_SCHOOL_DEMO.fundingProfile,
  data: PRIVATE_SCHOOL_DEMO.data,
};

const CHARTER_SCHOOL: SampleModel = {
  name: `${CHARTER_SCHOOL_DEMO.baseSchoolName} (Legislator Sample)`,
  slug: CHARTER_SCHOOL_DEMO.slug,
  schoolStage: CHARTER_SCHOOL_DEMO.schoolStage,
  fundingProfile: CHARTER_SCHOOL_DEMO.fundingProfile,
  data: CHARTER_SCHOOL_DEMO.data,
};

const SAMPLES = [MICROSCHOOL, PRIVATE_SCHOOL, CHARTER_SCHOOL];

async function exportModel(modelData: Record<string, unknown>, slug: string, outDir: string, modelId: number) {
  const consultantOutput = await runConsultantEngine(modelData);
  const typedData = modelData as unknown as ModelData;

  const formulaBuffer = await generateWorkbook(modelData, consultantOutput);
  fs.writeFileSync(path.join(outDir, `${slug}_Formula_Workbook.xlsx`), formulaBuffer);
  console.log(`  ✓ Formula Workbook (${formulaBuffer.length} bytes)`);

  const uwWorkbook = await generateUnderwritingWorkbook(modelData);
  const uwBuffer = Buffer.from(await uwWorkbook.xlsx.writeBuffer());
  fs.writeFileSync(path.join(outDir, `${slug}_Underwriting_Package.xlsx`), uwBuffer);
  console.log(`  ✓ Underwriting Package (${uwBuffer.length} bytes)`);

  const lenderPacket = buildLenderPacket(typedData, consultantOutput, modelId);
  const lenderPdf = await generateLenderPacketPDF(lenderPacket);
  fs.writeFileSync(path.join(outDir, `${slug}_Lender_Packet.pdf`), lenderPdf);
  console.log(`  ✓ Lender Packet PDF (${lenderPdf.length} bytes)`);

  const boardPacket = buildBoardPacket(typedData, consultantOutput, modelId);
  const boardPdf = await generateBoardPacketPDF(boardPacket);
  fs.writeFileSync(path.join(outDir, `${slug}_Board_Summary.pdf`), boardPdf);
  console.log(`  ✓ Board Summary PDF (${boardPdf.length} bytes)`);
}

async function main() {
  const outDir = path.resolve(process.cwd(), "legislator-samples");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (!adminEmail) {
    console.error("ADMIN_EMAILS env var not set. Cannot determine owner user.");
    process.exit(1);
  }
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
  if (!adminUser) {
    console.error(`Admin user not found for email: ${adminEmail}`);
    process.exit(1);
  }
  const userId = adminUser.id;

  console.log(`Generating legislator sample models as user ${userId} (${adminEmail})...\n`);

  for (const sample of SAMPLES) {
    console.log(`\n=== ${sample.name} ===`);

    const [model] = await db.insert(financialModelsTable).values({
      userId,
      name: sample.name,
      currentStep: 7,
      data: sample.data,
      schoolStage: sample.schoolStage,
      fundingProfile: sample.fundingProfile,
    }).returning();

    console.log(`  Created model ID: ${model.id}`);

    await exportModel(sample.data, sample.slug, outDir, model.id);

    for (const format of ["xlsx", "xlsx", "pdf", "pdf"]) {
      await db.insert(exportsTable).values({
        userId,
        modelId: model.id,
        format,
      });
    }
  }

  console.log(`\n✅ Done! ${SAMPLES.length * 4} export files saved to: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
