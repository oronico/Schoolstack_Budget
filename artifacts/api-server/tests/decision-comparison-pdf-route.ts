// Integration test for POST /api/models/:id/export/decision-comparison-pdf.
//
// The existing decision-history-pdf.ts test only renders the PDF library in
// isolation, and the Playwright spec only checks the HTTP response shape. This
// test exercises the full route end-to-end:
//   - real authed user (issued via generateToken)
//   - real model row owned by that user
//   - real HTTP request through the express app on a random port
//   - asserts a 200 PDF response with the expected Content-Disposition
//   - asserts a row was inserted into `exports` with format="pdf"
//   - asserts a row was inserted into `events` with the analytics event name
//   - covers 400 (invalid payload), 404 (other user's model), and the
//     schoolName fallback path.
//
// We do not mock trackEvent — it writes to the events table, so verifying
// that table is the most direct proof the audit trail is intact.

import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable, exportsTable, eventsTable, sharedLinksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
// --- Minimal PDF text extractor -----------------------------------------
// pdfkit emits FlateDecode-compressed content streams; rendered text lives
// inside PDF string literals `(...)` and hex strings `<...>`. We inflate
// each stream and pull both. This is the same technique used in
// tests/decision-history-pdf.ts. We need it here because asserting
// observable side effects of the schoolName-fallback branch requires
// reading the rendered subtitle bytes — otherwise the test would still
// pass if the fallback code were deleted.

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

function eq2<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- Fixtures ------------------------------------------------------------

// Five-year metric arrays tagged so a regression in the PDF layout that
// somehow short-circuits the body would still surface as different bytes.
const sampleMetrics = {
  revenue: [100_000, 200_000, 300_000, 400_000, 500_000],
  netIncome: [-20_000, 10_000, 40_000, 80_000, 120_000],
  netMargin: [-0.2, 0.05, 0.13, 0.2, 0.24],
  dscr: [0.1, 0.8, 1.2, 1.5, 1.8],
  breakEvenYear: 3,
  cashRunwayMonths: 18,
};

function makeSide(label: string) {
  return {
    label,
    decisionLabel: "Evaluate a site",
    narrative: `Notes for ${label}`,
    impact: {
      base: sampleMetrics,
      adjusted: {
        ...sampleMetrics,
        netIncome: sampleMetrics.netIncome.map((n) => n + 5_000),
      },
      deltas: {
        revenue: [0, 0, 0, 0, 0],
        netIncome: [5_000, 5_000, 5_000, 5_000, 5_000],
        breakEvenYearShift: 0,
        cashRunwayDeltaMonths: 0,
      },
      nudges: [
        { signal: "green", label: "Healthy DSCR", message: "DSCR clears 1.2 by Y3." },
      ],
    },
  };
}

function validBody() {
  return {
    schoolName: "Test Academy",
    primary: makeSide("Annex on Birch St."),
    compare: makeSide("Annex on Cedar Ave."),
  };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({
      email,
      name: "Test User",
      passwordHash,
    })
    .returning({ id: usersTable.id });
  const token = generateToken(row.id);
  return { id: row.id, token };
}

async function createModel(userId: number, schoolName?: string): Promise<number> {
  const data: Record<string, unknown> = {};
  if (schoolName) data.schoolProfile = { schoolName };
  const [row] = await db
    .insert(financialModelsTable)
    .values({
      userId,
      name: "Test Model",
      data,
    })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function deleteUserCascade(userId: number) {
  // exports/events/financial_models all cascade off users (or set null).
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

async function getLatestExport(modelId: number) {
  const rows = await db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.modelId, modelId))
    .orderBy(desc(exportsTable.id))
    .limit(1);
  return rows[0];
}

async function createSharedLink(modelId: number, viewerLabel: string | null) {
  const token = crypto.randomBytes(32).toString("hex");
  const [row] = await db
    .insert(sharedLinksTable)
    .values({ modelId, token, viewerLabel })
    .returning({ id: sharedLinksTable.id, token: sharedLinksTable.token });
  return row;
}

async function getLatestEvent(userId: number, eventName: string) {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.userId, userId), eq(eventsTable.eventName, eventName)))
    .orderBy(desc(eventsTable.id))
    .limit(1);
  return rows[0];
}

// --- HTTP helpers --------------------------------------------------------

interface BootedServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function bootApp(): Promise<BootedServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error("Failed to bind test server"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
    server.on("error", reject);
  });
}

async function postPdf(
  baseUrl: string,
  modelId: number,
  token: string,
  body: unknown,
) {
  return fetch(`${baseUrl}/api/models/${modelId}/export/decision-comparison-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function postSharedPdf(
  baseUrl: string,
  shareToken: string,
  body: unknown,
) {
  return fetch(`${baseUrl}/api/shared/${shareToken}/export/decision-comparison-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer) {
  console.log("\n— happy path: 200 PDF + exports row + analytics event —");

  const stamp = Date.now();
  const user = await createUser(`happy-${stamp}@example.com`);
  const modelId = await createModel(user.id, "Test Academy");

  try {
    const res = await postPdf(server.baseUrl, modelId, user.token, validBody());
    eq2("status is 200", res.status, 200);
    eq2("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const cd = res.headers.get("content-disposition") || "";
    check(
      "content-disposition is an attachment with .pdf filename",
      /attachment;\s*filename=.*\.pdf/i.test(cd),
      `got ${JSON.stringify(cd)}`,
    );
    check(
      "filename uses sanitised label tokens (Annex_on_Birch_St_vs_Annex_on_Cedar_Ave)",
      /Annex_on_Birch_St.*vs.*Annex_on_Cedar_Ave/.test(cd),
      `got ${JSON.stringify(cd)}`,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    check("response body looks like a PDF (starts with %PDF-)", buf.subarray(0, 5).toString() === "%PDF-");
    check("response body is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

    // Positive-control for the schoolName fallback test below: when the
    // client *does* send schoolName, that name lands in the rendered
    // subtitle ("<schoolName> — board-ready scenario comparison"). This
    // anchors what we'll assert in the fallback case.
    const text = extractPdfText(buf);
    check(
      "PDF subtitle contains the explicit schoolName from the payload",
      text.includes("Test Academy"),
      `extracted text did not contain "Test Academy"`,
    );
    check(
      "PDF subtitle contains the board-ready phrase",
      text.includes("board-ready scenario comparison"),
      `extracted text did not contain expected subtitle phrase`,
    );
    check(
      "PDF body contains the primary scenario label",
      text.includes("Annex on Birch St."),
    );
    check(
      "PDF body contains the compare scenario label",
      text.includes("Annex on Cedar Ave."),
    );

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row userId matches", exportRow?.userId, user.id);
    eq2("exports row format is 'pdf'", exportRow?.format, "pdf");

    const eventRow = await getLatestEvent(user.id, "exported_decision_comparison_pdf");
    check("analytics event inserted", !!eventRow);
    const meta = (eventRow?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId matches", meta.modelId, modelId);
    eq2("event metadata.primary matches the primary label", meta.primary, "Annex on Birch St.");
    eq2("event metadata.compare matches the compare label", meta.compare, "Annex on Cedar Ave.");
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testInvalidPayload(server: BootedServer) {
  console.log("\n— invalid payload: 400, no exports row, no event —");

  const stamp = Date.now();
  const user = await createUser(`bad-${stamp}@example.com`);
  const modelId = await createModel(user.id, "Test Academy");

  try {
    // Missing `compare` side entirely — validateDecisionComparisonRequest
    // returns null, which the route turns into a 400.
    const res = await postPdf(server.baseUrl, modelId, user.token, {
      schoolName: "Test Academy",
      primary: makeSide("Only A"),
    });
    eq2("status is 400", res.status, 400);

    const json = (await res.json()) as { error?: string };
    check(
      "error mentions invalid comparison payload",
      typeof json.error === "string" && /Invalid comparison payload/i.test(json.error),
      `got ${JSON.stringify(json)}`,
    );

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const eventRow = await getLatestEvent(user.id, "exported_decision_comparison_pdf");
    check("no analytics event was inserted", !eventRow);
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testOtherUsersModel(server: BootedServer) {
  console.log("\n— other user's model: 404, no exports row, no event —");

  const stamp = Date.now();
  const owner = await createUser(`owner-${stamp}@example.com`);
  const intruder = await createUser(`intruder-${stamp}@example.com`);
  const modelId = await createModel(owner.id, "Owner Academy");

  try {
    const res = await postPdf(server.baseUrl, modelId, intruder.token, validBody());
    eq2("status is 404", res.status, 404);

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const intruderEvent = await getLatestEvent(intruder.id, "exported_decision_comparison_pdf");
    check("no analytics event for intruder", !intruderEvent);
    const ownerEvent = await getLatestEvent(owner.id, "exported_decision_comparison_pdf");
    check("no analytics event for owner either", !ownerEvent);
  } finally {
    // Owner's user delete will cascade-delete the model; then drop intruder.
    await deleteUserCascade(owner.id);
    await deleteUserCascade(intruder.id);
  }
}

async function testSchoolNameFallback(server: BootedServer) {
  console.log("\n— schoolName fallback: missing in payload → pulled from model.data —");

  const stamp = Date.now();
  const user = await createUser(`fallback-${stamp}@example.com`);
  // Persisted school name on the model. The PDF subtitle reads from this
  // when the client omits schoolName from the payload.
  const persistedName = "Persisted Academy";
  const modelId = await createModel(user.id, persistedName);

  try {
    const body = validBody();
    delete (body as { schoolName?: string }).schoolName;
    // Sanity: confirm we really stripped it. If a future refactor of
    // validBody() adds a non-string default we'd silently stop testing the
    // fallback branch.
    check(
      "test setup: payload has no schoolName before sending",
      !("schoolName" in body),
    );

    const res = await postPdf(server.baseUrl, modelId, user.token, body);
    eq2("status is 200", res.status, 200);
    eq2("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const buf = Buffer.from(await res.arrayBuffer());
    check("body is a PDF", buf.subarray(0, 5).toString() === "%PDF-");

    // The fallback branch in the route reads `model.data.schoolProfile
    // .schoolName` and stitches it into the subtitle. If that branch is
    // removed (or renamed wrong, e.g. profile.name), the persisted name
    // won't reach the renderer and this assertion will fail.
    const text = extractPdfText(buf);
    check(
      "PDF subtitle contains the persisted schoolName from the model",
      text.includes(persistedName),
      `extracted text did not contain ${JSON.stringify(persistedName)}`,
    );
    check(
      "PDF subtitle contains the board-ready phrase",
      text.includes("board-ready scenario comparison"),
    );

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row format is 'pdf'", exportRow?.format, "pdf");

    const eventRow = await getLatestEvent(user.id, "exported_decision_comparison_pdf");
    check("analytics event inserted", !!eventRow);
  } finally {
    await deleteUserCascade(user.id);
  }
}

// Negative control: when the persisted model has NO schoolName either
// (neither in payload nor in model.data), the route must still succeed and
// fall back to the generic subtitle. This guards against a future bug where
// the fallback throws on missing profile.
async function testNoSchoolNameAnywhere(server: BootedServer) {
  console.log("\n— no schoolName anywhere: 200 with generic subtitle —");

  const stamp = Date.now();
  const user = await createUser(`nogeneric-${stamp}@example.com`);
  // Model has no schoolProfile at all.
  const modelId = await createModel(user.id /* no schoolName */);

  try {
    const body = validBody();
    delete (body as { schoolName?: string }).schoolName;
    const res = await postPdf(server.baseUrl, modelId, user.token, body);
    eq2("status is 200", res.status, 200);

    const buf = Buffer.from(await res.arrayBuffer());
    const text = extractPdfText(buf);
    // The route's generic branch yields just "Board-ready scenario
    // comparison" (no school-name prefix and no em dash separator).
    check(
      "PDF subtitle is the generic 'Board-ready scenario comparison'",
      text.includes("Board-ready scenario comparison"),
    );
    check(
      "PDF subtitle does not contain the explicit-name em dash separator",
      !text.includes(" \u2014 board-ready scenario comparison"),
    );
  } finally {
    await deleteUserCascade(user.id);
  }
}

// Task #223: a recipient downloading via /shared/:token must result in an
// exports row attributed to the model owner with provenance fields populated
// (sharedLinkId + viewerLabel). Without this, share-link downloads stay
// invisible in the founder's exports history — the regression we're guarding
// against. The owner-driven path is unchanged: those rows still have
// sharedLinkId == null.
async function testSharedLinkRecordsExportRow(server: BootedServer) {
  console.log("\n— share-link path: exports row attributed to owner with provenance —");

  const stamp = Date.now();
  const owner = await createUser(`share-owner-${stamp}@example.com`);
  const modelId = await createModel(owner.id, "Shared Academy");
  const link = await createSharedLink(modelId, "Board Chair");

  try {
    const res = await postSharedPdf(server.baseUrl, link.token, validBody());
    eq2("status is 200", res.status, 200);
    eq2("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const buf = Buffer.from(await res.arrayBuffer());
    check("response body is a PDF", buf.subarray(0, 5).toString() === "%PDF-");

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted for share-link download", !!exportRow);
    eq2("exports row attributed to model owner", exportRow?.userId, owner.id);
    eq2("exports row format is 'pdf'", exportRow?.format, "pdf");
    eq2("exports row carries sharedLinkId provenance", exportRow?.sharedLinkId, link.id);
    eq2("exports row carries viewerLabel from the link", exportRow?.viewerLabel, "Board Chair");

    const eventRow = await getLatestEvent(owner.id, "exported_decision_comparison_pdf_via_share");
    check("analytics event still inserted", !!eventRow);
    const meta = (eventRow?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId matches", meta.modelId, modelId);
    eq2("event metadata.sharedLinkId matches", meta.sharedLinkId, link.id);
  } finally {
    // user delete cascades through model → exports → shared_links.
    await deleteUserCascade(owner.id);
  }
}

// Counterpart guard: when the founder runs the *authenticated* comparison
// PDF route, the inserted exports row must NOT carry share-link provenance.
// This anchors the "owner-driven vs share-link" distinction the admin UI
// renders and prevents a future refactor from accidentally tagging owner
// exports as share-link downloads.
async function testOwnerExportHasNoShareProvenance(server: BootedServer) {
  console.log("\n— owner-driven path: exports row has no share-link provenance —");

  const stamp = Date.now();
  const user = await createUser(`owner-noshare-${stamp}@example.com`);
  const modelId = await createModel(user.id, "Owner Academy");

  try {
    const res = await postPdf(server.baseUrl, modelId, user.token, validBody());
    eq2("status is 200", res.status, 200);

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row attributed to the owner", exportRow?.userId, user.id);
    eq2("exports row has null sharedLinkId", exportRow?.sharedLinkId ?? null, null);
    eq2("exports row has null viewerLabel", exportRow?.viewerLabel ?? null, null);
  } finally {
    await deleteUserCascade(user.id);
  }
}

// And the share-link path must work even when the founder didn't label the
// link — viewerLabel just stays NULL, the row still appears with
// sharedLinkId set so the admin UI can render the generic "via shared link"
// pill (without a named viewer).
async function testSharedLinkWithoutViewerLabel(server: BootedServer) {
  console.log("\n— share-link path: unlabeled link → null viewerLabel, still tagged —");

  const stamp = Date.now();
  const owner = await createUser(`share-nolabel-${stamp}@example.com`);
  const modelId = await createModel(owner.id, "Unlabeled Academy");
  const link = await createSharedLink(modelId, null);

  try {
    const res = await postSharedPdf(server.baseUrl, link.token, validBody());
    eq2("status is 200", res.status, 200);

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row attributed to owner", exportRow?.userId, owner.id);
    eq2("exports row sharedLinkId set", exportRow?.sharedLinkId, link.id);
    eq2("exports row viewerLabel is null", exportRow?.viewerLabel ?? null, null);
  } finally {
    await deleteUserCascade(owner.id);
  }
}

// --- Entrypoint ----------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Decision Comparison PDF Route Integration Tests ===");

  const server = await bootApp();
  try {
    await testHappyPath(server);
    await testInvalidPayload(server);
    await testOtherUsersModel(server);
    await testSchoolNameFallback(server);
    await testNoSchoolNameAnywhere(server);
    await testSharedLinkRecordsExportRow(server);
    await testOwnerExportHasNoShareProvenance(server);
    await testSharedLinkWithoutViewerLabel(server);
  } finally {
    await server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(2);
  })
  .finally(() => {
    // The express timeout middleware leaves no open handles, but the pg pool
    // does. Force-exit so the test process terminates cleanly even if the
    // pool keeps idle connections alive.
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
