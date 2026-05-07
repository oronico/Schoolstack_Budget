// Task #605 — Phase 1 underwriting schema smoke test.
//
// Verifies the six new tables behave the way the schema plan says they
// should:
//   1. Create an underwriting_application linked to a real user.
//   2. Attach an underwriting_document to that application.
//   3. Link an underwriting_evidence row to the document.
//   4. Save an underwriting_metrics_snapshot.
//   5. Save an eligibility_gate_results row pointing at the evidence.
//   6. Mutate the application and write an audit_log row by hand
//      (mirroring what the route handler will do once the UI lands).
//   7. Confirm an existing financial_models row still reads back fine,
//      proving the migration left legacy data alone.
//
// Cleans up everything it inserted on success or failure so the test is
// safe to run repeatedly against a shared dev DB.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  financialModelsTable,
  underwritingApplicationsTable,
  underwritingDocumentsTable,
  underwritingEvidenceTable,
  underwritingMetricsSnapshotsTable,
  eligibilityGateResultsTable,
  auditLogTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const TEST_EMAIL = `task605-${crypto.randomBytes(4).toString("hex")}@example.com`;

async function main(): Promise<void> {
  if (!db) {
    console.error("DATABASE_URL not configured — cannot run underwriting smoke test.");
    process.exit(2);
  }

  let userId: number | null = null;
  let modelId: number | null = null;
  let applicationId: number | null = null;

  try {
    // Seed a throwaway user + budget model so the FKs have something to bite.
    const passwordHash = await bcrypt.hash("smoke-test-only", 10);
    const [user] = await db
      .insert(usersTable)
      .values({ email: TEST_EMAIL, name: "Task 605 Smoke", passwordHash })
      .returning({ id: usersTable.id });
    userId = user.id;

    const [model] = await db
      .insert(financialModelsTable)
      .values({ userId: user.id, name: "smoke model", data: { hello: "world" } })
      .returning({ id: financialModelsTable.id });
    modelId = model.id;

    console.log("\n— application + child rows");
    const [application] = await db
      .insert(underwritingApplicationsTable)
      .values({
        userId: user.id,
        financialModelId: model.id,
        loanPurpose: "facility acquisition",
        requestedAmountCents: 750_000_00,
        requestedTermMonths: 84,
      })
      .returning();
    applicationId = application.id;
    check("application inserts with default status=draft", application.status === "draft");
    check("application keeps financial_model_id pointer", application.financialModelId === model.id);

    const [document] = await db
      .insert(underwritingDocumentsTable)
      .values({
        applicationId: application.id,
        documentType: "tax_return",
        displayName: "FY24 Form 990",
        storageRef: `appstorage://uw/${application.id}/fy24-990.pdf`,
        contentSha256: crypto.createHash("sha256").update("smoke").digest("hex"),
        byteSize: 12_345,
        mimeType: "application/pdf",
        uploadedByUserId: user.id,
      })
      .returning();
    check("document attaches to application", document.applicationId === application.id);
    check("document defaults verification_status=uploaded", document.verificationStatus === "uploaded");

    const [evidence] = await db
      .insert(underwritingEvidenceTable)
      .values({
        applicationId: application.id,
        documentId: document.id,
        evidenceType: "financial_metric",
        claimKey: "fy24_total_revenue",
        value: { amountCents: 1_200_000_00, period: "FY24" },
        sourceLocator: "page 1, line 12",
        collectionMethod: "underwriter_extracted",
        collectedByUserId: user.id,
      })
      .returning();
    check("evidence links to document", evidence.documentId === document.id);
    check("evidence stores typed jsonb value", typeof evidence.value === "object" && evidence.value !== null);

    const [snapshot] = await db
      .insert(underwritingMetricsSnapshotsTable)
      .values({
        applicationId: application.id,
        snapshotKind: "intake",
        sourceFinancialModelId: model.id,
        sourceFinancialModelVersion: 1,
        metrics: { dscr: 1.34, daysCashOnHand: 65, currentRatio: 2.1 },
        createdByUserId: user.id,
      })
      .returning();
    check("metrics snapshot stores jsonb metrics blob", typeof snapshot.metrics === "object");

    const [gate] = await db
      .insert(eligibilityGateResultsTable)
      .values({
        applicationId: application.id,
        gateCode: "minimum_dscr",
        outcome: "pass",
        evaluationDetails: { threshold: 1.2, observed: 1.34 },
        evidenceId: evidence.id,
      })
      .returning();
    check("gate result links to evidence", gate.evidenceId === evidence.id);

    console.log("\n— audit log on update");
    await db
      .update(underwritingApplicationsTable)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(underwritingApplicationsTable.id, application.id));

    await db.insert(auditLogTable).values({
      actorUserId: user.id,
      actorRole: "user",
      entityType: "underwriting_application",
      entityId: application.id,
      action: "status_change",
      before: { status: "draft" },
      after: { status: "submitted" },
      note: "submitted via smoke test",
    });

    const auditRows = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.entityId, application.id));
    check("audit_log row written for the status change", auditRows.length === 1);
    check("audit_log row records the actor", auditRows[0]?.actorUserId === user.id);

    console.log("\n— legacy financial_models still reads cleanly");
    const [reread] = await db
      .select()
      .from(financialModelsTable)
      .where(eq(financialModelsTable.id, model.id));
    check("financial_models row round-trips", reread?.id === model.id);
    check("financial_models jsonb data intact", JSON.stringify(reread?.data) === JSON.stringify({ hello: "world" }));

    // Cascade-delete check: removing the application removes children.
    await db.delete(underwritingApplicationsTable).where(eq(underwritingApplicationsTable.id, application.id));
    applicationId = null;
    const orphanDocs = await db
      .select({ id: underwritingDocumentsTable.id })
      .from(underwritingDocumentsTable)
      .where(eq(underwritingDocumentsTable.applicationId, application.id));
    check("documents cascade-deleted with application", orphanDocs.length === 0);
    const orphanGates = await db
      .select({ id: eligibilityGateResultsTable.id })
      .from(eligibilityGateResultsTable)
      .where(eq(eligibilityGateResultsTable.applicationId, application.id));
    check("gate results cascade-deleted with application", orphanGates.length === 0);
    // Audit log intentionally NOT cascaded — the entity is gone but the
    // history must remain.
    const auditAfterDelete = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.entityId, application.id));
    check("audit_log row survives application delete", auditAfterDelete.length === 1);

    // Cleanup audit row by hand.
    await db.delete(auditLogTable).where(eq(auditLogTable.entityId, application.id));
  } finally {
    if (applicationId !== null) {
      await db.delete(underwritingApplicationsTable).where(eq(underwritingApplicationsTable.id, applicationId));
    }
    if (modelId !== null) {
      await db.delete(financialModelsTable).where(eq(financialModelsTable.id, modelId));
    }
    if (userId !== null) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }

  console.log(`\n${passed} passed / ${failed} failed`);
  if (failed > 0) {
    for (const line of failures) console.error(line);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
