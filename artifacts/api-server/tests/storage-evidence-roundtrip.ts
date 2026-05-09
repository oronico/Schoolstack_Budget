// Task #731 — End-to-end coverage for the App Storage evidence-file
// flow that backs assumption attachments.
//
// Evidence files used to be inlined as base64 inside the model JSON.
// Task #714 moved them to App Storage: the wizard requests a presigned
// upload URL, PUTs the bytes directly to GCS, and the model only
// stores the returned `objectPath`. The lender PDF and underwriting
// workbook then surface a download URL pointing back at
// `/api/storage/objects/:objectPath` so the reviewer can pull the
// source document straight from the export.
//
// This test exercises the full round-trip end-to-end:
//   1. POST /api/storage/uploads/request-url validates payloads and
//      returns an upload URL + objectPath
//   2. PUT  the file bytes to that URL (GCS via the Replit sidecar)
//   3. POST /api/models with assumptionConfidence.evidenceFiles
//      carrying only the objectPath — no inline base64
//   4. GET  /api/models/:id reloads and the objectPath survives intact
//   5. GET  /api/storage/objects/:objectPath streams the file back
//      with the expected bytes
//   6. GET  /api/models/:id/export/lender-packet-pdf embeds the
//      download URL into the PDF as a clickable link annotation
//   7. GET  /api/models/:id/export/underwriting-v2 writes the same
//      download URL into the "Assumptions Confidence" cell text
//   8. The 25 MB per-file cap and 25 files-per-row caps documented in
//      AssumptionConfidenceCard are exercised through the full
//      round-trip so a future tightening of the schema, request
//      validator, or model save path can't silently regress them
//
// The test gracefully skips when the Replit object-storage sidecar
// is not available (e.g. in CI without the sidecar bound) so it
// never blocks the rest of the suite.

import http from "node:http";
import type { AddressInfo } from "node:net";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { registerAndVerify } from "./helpers/register-and-verify.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
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

function eq2<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// 1x1 transparent PNG so the lender PDF treats it as an embeddable
// image. Bytes intentionally tiny so GCS round-trip is fast.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_B64, "base64");

// Mirrors the wizard caps in
// artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx
// — keep the two in sync so the test catches client/server drift.
const MAX_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EVIDENCE_FILES_PER_ROW = 25;

interface UploadUrlResponse {
  uploadURL: string;
  objectPath: string;
  metadata?: { name: string; size: number; contentType: string };
}

interface ModelRow {
  id: number;
  version: number;
  data: Record<string, unknown>;
}

async function requestUploadUrl(
  baseUrl: string,
  body: { name: string; size: number; contentType: string },
): Promise<{ status: number; json: UploadUrlResponse | { error: string } }> {
  const res = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: UploadUrlResponse | { error: string };
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function buildModelData(
  evidenceFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
    objectPath: string;
  }>,
) {
  // Reuse microschoolStartup so the lender PDF + underwriting export
  // routes pass `checkUnresolvedFlags`. The fixture raises a single
  // enrollment_spike warning on `enrollment.year2` which we resolve
  // with the corresponding assumptionFlagResponses entry below — same
  // pattern other route-level tests use.
  return {
    ...(microschoolStartup as Record<string, unknown>),
    assumptionFlagResponses: [
      {
        field: "enrollment.year2",
        flagType: "enrollment_spike",
        reason: "Founders confirmed family commitments via signed letters of intent.",
      },
    ],
    assumptionConfidence: {
      tuition_per_student: {
        confidence: "signed_agreement",
        evidenceNote: "Signed enrollment agreements on file.",
        evidenceFiles,
      },
    },
  };
}

async function postModel(
  baseUrl: string,
  token: string,
  body: { name: string; data: Record<string, unknown> },
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(
      `POST /api/models failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return (await res.json()) as ModelRow;
}

async function getModel(baseUrl: string, token: string, id: number): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(
      `GET /api/models/${id} failed: status=${res.status} body=${(await res.text()).slice(0, 400)}`,
    );
  }
  return (await res.json()) as ModelRow;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== Evidence File Storage Round-Trip (Task #731) ===");

  // The lender PDF and underwriting workbook only render the
  // download URL when APP_URL is configured (otherwise the export
  // degrades to filename-only). Pin a stable value so the assertions
  // below have something deterministic to look for.
  const APP_URL = "https://test.example.schoolstack.ai";
  process.env.APP_URL = APP_URL;

  const { baseUrl, close } = await startServer();
  let userId: number | null = null;

  try {
    // -----------------------------------------------------------------
    // Probe the storage sidecar with a no-op request. If the sidecar
    // isn't available in this environment the rest of the test would
    // be meaningless; skip cleanly so the suite stays green.
    // -----------------------------------------------------------------
    const probe = await requestUploadUrl(baseUrl, {
      name: "probe.png",
      size: TINY_PNG_BYTES.length,
      contentType: "image/png",
    });
    if (probe.status === 500) {
      console.warn(
        "  SKIP: Replit object-storage sidecar unavailable in this env (request-url returned 500). " +
          "Set PRIVATE_OBJECT_DIR / PUBLIC_OBJECT_SEARCH_PATHS and run on Replit to exercise this test.",
      );
      console.log(`\nResults: ${passed} passed, ${failed} failed (skipped)`);
      return;
    }

    // -----------------------------------------------------------------
    // 1. Validation: the request-url endpoint rejects malformed bodies.
    // -----------------------------------------------------------------
    const badBody = await requestUploadUrl(baseUrl, {
      // @ts-expect-error — intentionally invalid
      name: "",
      size: 0,
      contentType: "",
    });
    eq2(
      "request-url: rejects empty/zero metadata with 400",
      badBody.status,
      400,
    );

    // -----------------------------------------------------------------
    // 2. Happy path: register, request URL, PUT bytes.
    // -----------------------------------------------------------------
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { token, user } = await registerAndVerify(baseUrl, {
      email: `evidence-roundtrip-${stamp}@example.com`,
      password: "Password123!",
      name: "Evidence Roundtrip",
    });
    userId = user.id;

    eq2(
      "request-url: returns 200 for a valid metadata payload",
      probe.status,
      200,
    );
    const probeBody = probe.json as UploadUrlResponse;
    check(
      "request-url: returns an https uploadURL",
      typeof probeBody.uploadURL === "string" &&
        probeBody.uploadURL.startsWith("https://"),
      `got ${probeBody.uploadURL}`,
    );
    check(
      "request-url: returns an /objects/ objectPath",
      typeof probeBody.objectPath === "string" &&
        probeBody.objectPath.startsWith("/objects/"),
      `got ${probeBody.objectPath}`,
    );

    // PUT the actual bytes to the signed URL.
    const putRes = await fetch(probeBody.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: TINY_PNG_BYTES,
    });
    check(
      "PUT to signed upload URL succeeds",
      putRes.ok,
      `status=${putRes.status}`,
    );

    // -----------------------------------------------------------------
    // 3. Save a model that references the freshly uploaded file by
    //    objectPath (no inline base64).
    // -----------------------------------------------------------------
    const evidenceFile = {
      id: "f1",
      name: "site-photo.png",
      mimeType: "image/png",
      size: TINY_PNG_BYTES.length,
      uploadedAt: new Date().toISOString(),
      objectPath: probeBody.objectPath,
    };
    const created = await postModel(baseUrl, token, {
      name: "Evidence Roundtrip Model",
      data: buildModelData([evidenceFile]),
    });

    // -----------------------------------------------------------------
    // 4. Reload and confirm the objectPath round-trips intact.
    // -----------------------------------------------------------------
    const reloaded = await getModel(baseUrl, token, created.id);
    const confidence =
      (reloaded.data as Record<string, any>).assumptionConfidence
        ?.tuition_per_student;
    const reloadedFiles = confidence?.evidenceFiles as
      | Array<Record<string, unknown>>
      | undefined;
    check(
      "model save preserves the evidenceFiles array",
      Array.isArray(reloadedFiles) && reloadedFiles.length === 1,
      `got ${JSON.stringify(reloadedFiles)}`,
    );
    eq2(
      "evidence file objectPath round-trips",
      reloadedFiles?.[0]?.objectPath,
      probeBody.objectPath,
    );
    eq2(
      "evidence file name round-trips",
      reloadedFiles?.[0]?.name,
      "site-photo.png",
    );
    check(
      "evidence file does NOT carry inline base64 after round-trip",
      !("dataBase64" in (reloadedFiles?.[0] || {})),
      `got keys=${Object.keys(reloadedFiles?.[0] || {}).join(",")}`,
    );

    // -----------------------------------------------------------------
    // 5. Resolve the download URL and confirm bytes match what we PUT.
    //    objectPath is `/objects/<id>`; the public download route is
    //    `/api/storage/objects/<id>`.
    // -----------------------------------------------------------------
    const downloadPath = `/api/storage${probeBody.objectPath}`;
    const downloadRes = await fetch(`${baseUrl}${downloadPath}`);
    eq2("GET /api/storage/objects/:path returns 200", downloadRes.status, 200);
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    eq2(
      "downloaded bytes match the uploaded PNG length",
      downloadedBuf.length,
      TINY_PNG_BYTES.length,
    );
    check(
      "downloaded bytes match the uploaded PNG content",
      downloadedBuf.equals(TINY_PNG_BYTES),
    );

    // Unknown object paths must 404, not leak a generic 500.
    const missingRes = await fetch(
      `${baseUrl}/api/storage/objects/does-not-exist-${stamp}`,
    );
    eq2(
      "GET /api/storage/objects/<missing> returns 404",
      missingRes.status,
      404,
    );

    // -----------------------------------------------------------------
    // 6. Lender PDF embeds the App Storage download URL.
    // -----------------------------------------------------------------
    const expectedDownloadUrl = `${APP_URL}/api/storage${probeBody.objectPath}`;
    const lenderRes = await fetch(
      `${baseUrl}/api/models/${created.id}/export/lender-packet-pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    eq2("lender-packet-pdf returns 200", lenderRes.status, 200);
    const lenderBuf = Buffer.from(await lenderRes.arrayBuffer());
    check(
      "lender-packet-pdf is a valid PDF (starts with %PDF-)",
      lenderBuf.subarray(0, 5).toString("ascii") === "%PDF-",
    );
    // PDFKit emits link annotations as plain (uncompressed) URI
    // strings inside the PDF. Scanning the raw buffer for the URL is
    // the simplest way to prove the appendix actually carried the
    // clickable link through to the export.
    check(
      "lender-packet-pdf contains the App Storage download URL as a link",
      lenderBuf.includes(expectedDownloadUrl),
      `looking for ${expectedDownloadUrl}`,
    );

    // -----------------------------------------------------------------
    // 7. Underwriting workbook prints the download URL in the
    //    "Assumptions Confidence" cell next to the filename.
    // -----------------------------------------------------------------
    const xlsxRes = await fetch(
      `${baseUrl}/api/models/${created.id}/export/underwriting-v2`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    eq2("underwriting-v2 returns 200", xlsxRes.status, 200);
    const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuf);
    const ws = wb.getWorksheet("Assumptions Confidence");
    check(
      "underwriting workbook includes the 'Assumptions Confidence' tab",
      !!ws,
    );
    let foundUrlInCell = false;
    if (ws) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value;
          const text = typeof v === "string" ? v : v && typeof v === "object" && "richText" in v
            ? (v as { richText: Array<{ text: string }> }).richText
                .map((r) => r.text)
                .join("")
            : "";
          if (text.includes(expectedDownloadUrl)) foundUrlInCell = true;
        });
      });
    }
    check(
      "Assumptions Confidence cell text contains the App Storage download URL",
      foundUrlInCell,
      `looking for ${expectedDownloadUrl}`,
    );

    // -----------------------------------------------------------------
    // 8. Exercise the per-file size cap and the per-row count cap.
    //    The size cap is enforced client-side in the wizard but the
    //    server schema must accept metadata up to that ceiling, and
    //    the model document must round-trip exactly that many files
    //    in a single row without truncation.
    // -----------------------------------------------------------------
    const maxSizeFile = {
      id: "max-size",
      name: "huge-lease.pdf",
      mimeType: "application/pdf",
      size: MAX_EVIDENCE_FILE_BYTES,
      uploadedAt: new Date().toISOString(),
      objectPath: probeBody.objectPath,
    };
    const maxSizeModel = await postModel(baseUrl, token, {
      name: "Max Size Evidence Model",
      data: buildModelData([maxSizeFile]),
    });
    const maxSizeReload = await getModel(baseUrl, token, maxSizeModel.id);
    const maxSizeFiles = (maxSizeReload.data as Record<string, any>)
      .assumptionConfidence?.tuition_per_student?.evidenceFiles as
      | Array<Record<string, unknown>>
      | undefined;
    eq2(
      "model accepts an evidence file at the 25 MB per-file cap",
      maxSizeFiles?.[0]?.size,
      MAX_EVIDENCE_FILE_BYTES,
    );

    // Validation must accept a request-url payload at the cap too —
    // an unintended `.max(...)` on the size field would silently
    // break the wizard at the threshold.
    const capRequest = await requestUploadUrl(baseUrl, {
      name: "huge.pdf",
      size: MAX_EVIDENCE_FILE_BYTES,
      contentType: "application/pdf",
    });
    eq2(
      "request-url accepts size = 25 MB exactly (matches wizard cap)",
      capRequest.status,
      200,
    );

    const manyFiles = Array.from({ length: MAX_EVIDENCE_FILES_PER_ROW }, (_, i) => ({
      id: `bulk-${i}`,
      name: `attachment-${i}.png`,
      mimeType: "image/png",
      size: TINY_PNG_BYTES.length,
      uploadedAt: new Date().toISOString(),
      objectPath: probeBody.objectPath,
    }));
    const bulkModel = await postModel(baseUrl, token, {
      name: "Bulk Evidence Model",
      data: buildModelData(manyFiles),
    });
    const bulkReload = await getModel(baseUrl, token, bulkModel.id);
    const bulkFiles = (bulkReload.data as Record<string, any>)
      .assumptionConfidence?.tuition_per_student?.evidenceFiles as
      | Array<Record<string, unknown>>
      | undefined;
    eq2(
      "model round-trips 25 evidence files in a single assumption row",
      bulkFiles?.length,
      MAX_EVIDENCE_FILES_PER_ROW,
    );
    check(
      "every bulk-attached file kept its objectPath through the round-trip",
      Array.isArray(bulkFiles) &&
        bulkFiles.every((f) => typeof f.objectPath === "string"),
    );
  } finally {
    if (userId !== null) {
      try {
        await db.delete(usersTable).where(eq(usersTable.id, userId));
      } catch (err) {
        console.warn("user cleanup failed:", err);
      }
    }
    await close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
