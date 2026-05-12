// Integration test for GET /api/models/:id/export/lender-packet-pdf.
//
// Sibling to tests/decision-comparison-pdf-route.ts. This test exists so a
// future refactor of the lender packet PDF route cannot silently break the
// audit trail (an exports row + a named analytics event). The existing
// tests/decision-history-pdf.ts test only renders the PDF library in
// isolation; it does NOT exercise the express route, the auth middleware,
// the DB writes, or the trackEvent call.
//
// What this test asserts end-to-end:
//   - real authed user (issued via generateToken)
//   - real model row owned by that user, seeded from microschoolStartup
//   - real HTTP request through the express app on a random port
//   - 200 application/pdf response with attachment Content-Disposition
//   - response body starts with "%PDF-" and is non-trivial in size
//   - one new row in `exports` with format="pdf" + correct user/model ids
//   - one new row in `events` with eventName="exported_lender_packet_pdf"
//     and metadata.modelId pointing back at the model
//   - 404 when a different user requests the model (no exports/events written)
//   - 422 when the model has unresolved warning/critical assumption flags
//     (no exports/events written)
//
// Note on HTTP method: the route is GET (not POST). The task description
// listed POST for the three sibling PDF routes; the actual handlers in
// routes/models.ts are GET. We assert against the real handler.
//
// Note on the flag-blocked status: routes/models.ts returns 422 (not 400)
// for unresolved-flag exports. The task description said "400" but the
// real handler emits 422. We assert against the real handler.

import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable, exportsTable, eventsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";
import { microschoolStartup } from "./sample-payloads.js";

// --- Minimal PDF text extractor -----------------------------------------
// Same technique used in tests/board-packet-pdf-route.ts. pdfkit emits
// FlateDecode-compressed content streams; rendered text lives inside PDF
// string literals `(...)` and hex strings `<...>`. We inflate each stream
// and pull both. Needed here for Task #748 so we can assert the Lender
// Commentary section actually ships in the rendered bytes (founder draft
// sentinel + canonical-engine fallback prose) and a future renderer
// change can't silently drop the section.

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

function extractPDFText(pdf: Buffer): string {
  // Walk the PDF stream-by-stream. Compressed stream bodies can contain byte
  // sequences that look like the literal "stream"/"endstream" markers, so we
  // cannot rely on `Buffer.indexOf("endstream")` to find the real end of a
  // stream. Instead, parse the `/Length N` entry in the stream's dictionary
  // (always present in pdfkit output) and use it to skip exactly N bytes of
  // the encoded body, then resume scanning past `endstream`.
  const STREAM = "stream";
  const ENDSTREAM = "endstream";
  const out: string[] = [];
  let cursor = 0;
  while (cursor < pdf.length) {
    const sIdx = pdf.indexOf(STREAM, cursor);
    if (sIdx === -1) break;
    // Reject `endstream` matches that the indexOf scan landed on.
    if (sIdx >= 3 && pdf.slice(sIdx - 3, sIdx).toString("latin1") === "end") {
      cursor = sIdx + STREAM.length;
      continue;
    }
    // Look back to the start of the preceding dictionary `<<` for /Length.
    const dictStart = pdf.lastIndexOf("<<", sIdx);
    let length: number | null = null;
    if (dictStart !== -1) {
      const dict = pdf.subarray(dictStart, sIdx).toString("latin1");
      const m = /\/Length\s+(\d+)/.exec(dict);
      if (m) length = parseInt(m[1], 10);
    }
    let dataStart = sIdx + STREAM.length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    let dataEnd: number;
    let nextCursor: number;
    if (length !== null) {
      dataEnd = dataStart + length;
      const tailIdx = pdf.indexOf(ENDSTREAM, dataEnd);
      nextCursor = tailIdx === -1 ? pdf.length : tailIdx + ENDSTREAM.length;
    } else {
      // Fallback: best-effort marker scan.
      const eIdx = pdf.indexOf(ENDSTREAM, dataStart);
      if (eIdx === -1) break;
      dataEnd = eIdx;
      if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
      if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
      nextCursor = eIdx + ENDSTREAM.length;
    }
    const raw = pdf.subarray(dataStart, dataEnd);
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    out.push(extractStringLiterals(body));
    cursor = nextCursor;
  }
  return out.join("\n");
}

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

// microschoolStartup raises a single warning flag (`enrollment_spike` on
// `enrollment.year2`). The export route blocks on unresolved warning OR
// critical flags, so the happy-path fixture must seed an
// assumptionFlagResponses entry that resolves it. The blocked-flag test
// below intentionally omits the response.
function happyPathModelData() {
  return {
    ...(microschoolStartup as Record<string, unknown>),
    assumptionFlagResponses: [
      {
        field: "enrollment.year2",
        flagType: "enrollment_spike",
        reason: "Founders confirmed 18 family commitments via signed letters of intent.",
      },
    ],
  };
}

function flagBlockedModelData() {
  // No assumptionFlagResponses, so the warning flag remains unresolved.
  return { ...(microschoolStartup as Record<string, unknown>) };
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  const token = generateToken(row.id);
  return { id: row.id, token };
}

async function createModel(userId: number, data: Record<string, unknown>): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name: "Test Model", data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function deleteUserCascade(userId: number) {
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

async function getPdf(baseUrl: string, modelId: number, token: string) {
  return fetch(`${baseUrl}/api/models/${modelId}/export/lender-packet-pdf`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer) {
  console.log("\n— happy path: 200 PDF + exports row + analytics event —");

  const stamp = Date.now();
  const user = await createUser(`lender-happy-${stamp}@example.com`);
  const modelId = await createModel(user.id, happyPathModelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, user.token);
    eq2("status is 200", res.status, 200);
    eq2("content-type is application/pdf", res.headers.get("content-type"), "application/pdf");

    const cd = res.headers.get("content-disposition") || "";
    check(
      "content-disposition is an attachment with .pdf filename",
      /attachment;\s*filename=.*\.pdf/i.test(cd),
      `got ${JSON.stringify(cd)}`,
    );
    check(
      "filename is suffixed with _Lender_Conversation_Snapshot.pdf (sanitised school name)",
      /_Lender_Conversation_Snapshot\.pdf/.test(cd),
      `got ${JSON.stringify(cd)}`,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    check("response body looks like a PDF (starts with %PDF-)", buf.subarray(0, 5).toString() === "%PDF-");
    check("response body is non-trivial in size (> 1KB)", buf.length > 1024, `got ${buf.length} bytes`);

    const exportRow = await getLatestExport(modelId);
    check("exports row inserted", !!exportRow);
    eq2("exports row userId matches", exportRow?.userId, user.id);
    eq2("exports row modelId matches", exportRow?.modelId, modelId);
    eq2("exports row format is 'pdf'", exportRow?.format, "pdf");

    const eventRow = await getLatestEvent(user.id, "exported_lender_packet_pdf");
    check("analytics event 'exported_lender_packet_pdf' inserted", !!eventRow);
    const meta = (eventRow?.metadata as Record<string, unknown> | null) || {};
    eq2("event metadata.modelId matches", meta.modelId, modelId);
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testOtherUsersModel(server: BootedServer) {
  console.log("\n— other user's model: 404, no exports row, no event —");

  const stamp = Date.now();
  const owner = await createUser(`lender-owner-${stamp}@example.com`);
  const intruder = await createUser(`lender-intruder-${stamp}@example.com`);
  const modelId = await createModel(owner.id, happyPathModelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, intruder.token);
    eq2("status is 404", res.status, 404);

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const intruderEvent = await getLatestEvent(intruder.id, "exported_lender_packet_pdf");
    check("no analytics event for intruder", !intruderEvent);
    const ownerEvent = await getLatestEvent(owner.id, "exported_lender_packet_pdf");
    check("no analytics event for owner either", !ownerEvent);
  } finally {
    await deleteUserCascade(owner.id);
    await deleteUserCascade(intruder.id);
  }
}

async function testFlagBlocked(server: BootedServer) {
  console.log("\n— unresolved warning flag: 422, no exports row, no event —");

  const stamp = Date.now();
  const user = await createUser(`lender-blocked-${stamp}@example.com`);
  // No assumptionFlagResponses → microschoolStartup's enrollment_spike
  // warning blocks the export.
  const modelId = await createModel(user.id, flagBlockedModelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, user.token);
    eq2("status is 422 (unresolved flag)", res.status, 422);

    const json = (await res.json()) as { error?: string };
    check(
      "error mentions blocked export and flagged assumptions",
      typeof json.error === "string" && /Export blocked.*flagged assumption/i.test(json.error),
      `got ${JSON.stringify(json)}`,
    );

    const exportRow = await getLatestExport(modelId);
    check("no exports row was inserted", !exportRow);

    const eventRow = await getLatestEvent(user.id, "exported_lender_packet_pdf");
    check("no analytics event was inserted", !eventRow);
  } finally {
    await deleteUserCascade(user.id);
  }
}

// Task #748 — Lender Commentary PDF section coverage. The lender PDF
// renders a founder-edited lender draft (when present) or falls back to
// the canonical-engine `buildLenderCommentary` prose. The renderer is
// covered at the unit level by build-narrative-commentary.test.ts; these
// two cases assert the section actually ships through the HTTP route so
// a future renderer regression that drops `renderNarrativeCommentarySection`
// for "Lender Commentary" can't pass CI. Mirrors the Grant Version
// coverage Task #747 added for the board PDF route test.

const LENDER_DRAFT_SENTINEL = "LENDER-SENTINEL-748-Q7M19";

function lenderDraftModelData() {
  const base = happyPathModelData() as Record<string, unknown>;
  const existingNarrative = (base.budgetNarrative as Record<string, unknown> | undefined) || {};
  const existingDrafts =
    (existingNarrative.audienceDrafts as Record<string, unknown> | undefined) || {};
  return {
    ...base,
    budgetNarrative: {
      ...existingNarrative,
      audienceDrafts: {
        ...existingDrafts,
        lender: `Underwriters, please note: ${LENDER_DRAFT_SENTINEL}. Our debt service coverage and cash runway projections anchor on the assumptions documented throughout this packet.`,
      },
    },
  };
}

async function testLenderSectionFounderDraft(server: BootedServer) {
  console.log("\n— lender section: founder-edited draft ships in PDF —");

  const stamp = Date.now();
  const user = await createUser(`lender-draft-${stamp}@example.com`);
  const modelId = await createModel(user.id, lenderDraftModelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, user.token);
    eq2("status is 200", res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    check("response body looks like a PDF", buf.subarray(0, 5).toString() === "%PDF-");

    const text = extractPDFText(buf);
    check(
      "Lender Commentary section header is rendered",
      text.includes("Lender Commentary"),
      "expected 'Lender Commentary' section title in extracted PDF text",
    );
    check(
      `founder lender draft sentinel '${LENDER_DRAFT_SENTINEL}' is rendered`,
      text.includes(LENDER_DRAFT_SENTINEL),
      "founder-edited lender prose did not reach the rendered PDF buffer",
    );
    check(
      "founder-draft footer caption is rendered (provenance signal)",
      text.includes("Edited by the founder for this audience"),
      "expected the renderer's founder-draft caption beneath the Lender Commentary section",
    );
  } finally {
    await deleteUserCascade(user.id);
  }
}

async function testLenderSectionCanonicalFallback(server: BootedServer) {
  console.log("\n— lender section: canonical-engine fallback when no draft —");

  const stamp = Date.now();
  const user = await createUser(`lender-fallback-${stamp}@example.com`);
  // Reuse the happy-path data, which has no audienceDrafts.lender set,
  // so the renderer should fall through to the deterministic
  // `buildLenderCommentary` paragraphs.
  const modelId = await createModel(user.id, happyPathModelData());

  try {
    const res = await getPdf(server.baseUrl, modelId, user.token);
    eq2("status is 200", res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    check("response body looks like a PDF", buf.subarray(0, 5).toString() === "%PDF-");

    const text = extractPDFText(buf);
    check(
      "Lender Commentary section header is rendered",
      text.includes("Lender Commentary"),
      "expected 'Lender Commentary' section title in extracted PDF text",
    );
    // Stable opening phrase from `buildLenderCommentary` paragraph 1
    // (verdictSentence). If the canonical lender prose is rewritten this
    // assertion needs to be updated; that change is intentional — we
    // want the test to flag any drift in the fallback content.
    check(
      "canonical-engine lender prose ('Based on the canonical financial engine') is rendered",
      text.includes("Based on the canonical financial engine"),
      "fallback lender commentary did not reach the rendered PDF buffer",
    );
    check(
      "canonical-source footer caption is rendered (no founder-draft tag)",
      text.includes("sourced from the same canonical engine"),
      "expected the renderer's canonical-source caption beneath the Lender Commentary section",
    );
    // Belt-and-suspenders: when there's no founder draft the
    // edited-for-this-audience caption must not appear under the Lender
    // Commentary section.
    check(
      "founder-draft caption is NOT rendered when no draft is set",
      !text.includes("Edited by the founder for this audience"),
      "fallback case unexpectedly emitted the founder-draft caption",
    );
  } finally {
    await deleteUserCascade(user.id);
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

  console.log("=== Lender Packet PDF Route Integration Tests ===");

  const server = await bootApp();
  try {
    await testHappyPath(server);
    await testOtherUsersModel(server);
    await testFlagBlocked(server);
    await testLenderSectionFounderDraft(server);
    await testLenderSectionCanonicalFallback(server);
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
    // Force-exit so the pg pool's idle connections don't keep the process alive.
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
