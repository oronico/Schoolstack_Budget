// Task #758 — End-to-end coverage for the inline orphan-uploads
// cleanup wired into the model PUT and DELETE handlers (Task #736).
//
// Today the cleanup is "fire and forget" inside the route handler:
// after the DB write succeeds we kick off `safeDeleteUnreferenced`
// without awaiting it, so the route response itself doesn't tell us
// whether the underlying GCS object was actually removed. Without
// this test, a regression in `extractEvidenceObjectPaths` (e.g. the
// path-shape changes), the diff (`prev \ next`), or the
// `safeDeleteUnreferenced` global-reference guard (e.g. duplicate
// protection accidentally inverts) would silently leak objects in
// App Storage and we'd only notice when the storage bill spiked.
//
// This test exercises the full round-trip:
//   1. Upload two evidence files via the real /api/storage flow
//   2. Attach both to a model via POST /api/models
//   3. PUT the model with one file removed → poll until that object
//      is gone from App Storage and assert the other survives
//   4. Duplicate the model so two rows reference the same object,
//      then PUT one of them to drop the attachment → object must
//      stay alive because the duplicate still references it
//   5. DELETE the second copy → object is finally cleaned up
//   6. DELETE a model with attachments straight up → the underlying
//      object is gone
//
// As with storage-evidence-roundtrip.ts, the test gracefully skips
// when the Replit object-storage sidecar is not bound so it never
// blocks the rest of the suite.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@workspace/db";
import { usersTable, financialModelsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { ObjectStorageService, ObjectNotFoundError } from "../src/lib/objectStorage.js";
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

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_B64, "base64");

const storage = new ObjectStorageService();

async function uploadOne(
  baseUrl: string,
  token: string,
  name: string,
): Promise<string> {
  const reqRes = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, size: TINY_PNG_BYTES.length, contentType: "image/png" }),
  });
  if (reqRes.status !== 200) {
    throw new Error(`request-url failed: ${reqRes.status} ${(await reqRes.text()).slice(0, 200)}`);
  }
  const { uploadURL, objectPath } = (await reqRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: TINY_PNG_BYTES,
  });
  if (!putRes.ok) {
    throw new Error(`PUT to signed URL failed: ${putRes.status}`);
  }
  const finalize = await fetch(`${baseUrl}/api/storage/uploads/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath }),
  });
  if (finalize.status !== 200) {
    throw new Error(`finalize failed: ${finalize.status} ${(await finalize.text()).slice(0, 200)}`);
  }
  return objectPath;
}

async function objectExists(objectPath: string): Promise<boolean> {
  try {
    await storage.getObjectEntityFile(objectPath);
    return true;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return false;
    throw err;
  }
}

// The PUT/DELETE handlers fire the cleanup with `void
// safeDeleteUnreferenced(...)` — the response returns before the
// object is actually gone. Poll for absence/presence so the test
// isn't flaky against the inevitable few-hundred-millisecond GCS
// round-trip. 10s is generous; in practice the delete lands in
// well under a second on a healthy sidecar.
async function waitFor(
  predicate: () => Promise<boolean>,
  { timeoutMs = 10_000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function buildModelData(
  evidenceFiles: Array<{ id: string; name: string; objectPath: string }>,
) {
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
        evidenceFiles: evidenceFiles.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: "image/png",
          size: TINY_PNG_BYTES.length,
          uploadedAt: new Date().toISOString(),
          objectPath: f.objectPath,
        })),
      },
    },
  };
}

interface ModelRow {
  id: number;
  version: number;
  data: Record<string, unknown>;
}

async function postModel(
  baseUrl: string,
  token: string,
  body: { name: string; data: Record<string, unknown> },
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(`POST /api/models failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as ModelRow;
}

async function putModel(
  baseUrl: string,
  token: string,
  id: number,
  ifMatchVersion: number,
  body: { data: Record<string, unknown> },
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "If-Match": `"${ifMatchVersion}"`,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    throw new Error(`PUT /api/models/${id} failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
  return (await res.json()) as ModelRow;
}

async function duplicateModel(
  baseUrl: string,
  token: string,
  id: number,
): Promise<ModelRow> {
  const res = await fetch(`${baseUrl}/api/models/${id}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (res.status !== 201) {
    throw new Error(`duplicate failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as ModelRow;
}

async function deleteModel(baseUrl: string, token: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/models/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`DELETE /api/models/${id} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
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

  console.log("=== Orphan Uploads Cleanup Round-Trip (Task #758) ===");

  const { baseUrl, close } = await startServer();
  let userId: number | null = null;
  const createdModelIds: number[] = [];

  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { token, user } = await registerAndVerify(baseUrl, {
      email: `orphan-cleanup-${stamp}@example.com`,
      password: "Password123!",
      name: "Orphan Cleanup",
    });
    userId = user.id;

    // Probe the sidecar with a real authed call. If unavailable in
    // this env, the rest of the test is meaningless — skip cleanly.
    const probe = await fetch(`${baseUrl}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "probe.png",
        size: TINY_PNG_BYTES.length,
        contentType: "image/png",
      }),
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
    // Scenario A — PUT removes one of two attachments → only that
    // object is cleaned up; the surviving attachment stays put.
    // -----------------------------------------------------------------
    const pathA = await uploadOne(baseUrl, token, "lease.png");
    const pathB = await uploadOne(baseUrl, token, "letter-of-intent.png");
    eq2("scenario A: file A exists in App Storage after upload", await objectExists(pathA), true);
    eq2("scenario A: file B exists in App Storage after upload", await objectExists(pathB), true);

    const modelA = await postModel(baseUrl, token, {
      name: `Orphan Cleanup A ${stamp}`,
      data: buildModelData([
        { id: "a", name: "lease.png", objectPath: pathA },
        { id: "b", name: "letter-of-intent.png", objectPath: pathB },
      ]),
    });
    createdModelIds.push(modelA.id);

    // PUT the model with file A removed.
    const updated = await putModel(baseUrl, token, modelA.id, modelA.version, {
      data: buildModelData([{ id: "b", name: "letter-of-intent.png", objectPath: pathB }]),
    });
    check(
      "scenario A: PUT bumps the version after removing one attachment",
      updated.version === modelA.version + 1,
      `version went ${modelA.version} → ${updated.version}`,
    );

    const aGone = await waitFor(async () => !(await objectExists(pathA)));
    eq2("scenario A: file A is removed from App Storage after PUT", aGone, true);
    eq2(
      "scenario A: file B survives because it is still referenced",
      await objectExists(pathB),
      true,
    );

    // -----------------------------------------------------------------
    // Scenario B — duplicate-protection. Two models reference the
    // same `objectPath` (POST /models/:id/duplicate copies data
    // verbatim). Removing the attachment from ONE model must NOT
    // delete the underlying object — the duplicate still needs it.
    // -----------------------------------------------------------------
    const dup = await duplicateModel(baseUrl, token, modelA.id);
    createdModelIds.push(dup.id);

    // Re-read modelA (its version may have advanced via PUT above).
    const modelAfresh = await fetch(`${baseUrl}/api/models/${modelA.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const modelAJson = (await modelAfresh.json()) as ModelRow;

    // Drop the attachment from modelA only.
    await putModel(baseUrl, token, modelA.id, modelAJson.version, {
      data: buildModelData([]),
    });

    // Give the fire-and-forget cleanup a chance to (incorrectly) run.
    await new Promise((r) => setTimeout(r, 1500));
    eq2(
      "scenario B: file B survives because the duplicate still references it",
      await objectExists(pathB),
      true,
    );

    // Now delete the duplicate. With no remaining references, the
    // object must finally be cleaned up.
    await deleteModel(baseUrl, token, dup.id);
    const bGone = await waitFor(async () => !(await objectExists(pathB)));
    eq2(
      "scenario B: file B is removed once the last referencing model is deleted",
      bGone,
      true,
    );

    // -----------------------------------------------------------------
    // Scenario C — DELETE on a model with live attachments cleans up
    // the underlying objects directly.
    // -----------------------------------------------------------------
    const pathC = await uploadOne(baseUrl, token, "site-photo.png");
    const pathD = await uploadOne(baseUrl, token, "mou.png");
    eq2("scenario C: file C exists after upload", await objectExists(pathC), true);
    eq2("scenario C: file D exists after upload", await objectExists(pathD), true);

    const modelC = await postModel(baseUrl, token, {
      name: `Orphan Cleanup C ${stamp}`,
      data: buildModelData([
        { id: "c", name: "site-photo.png", objectPath: pathC },
        { id: "d", name: "mou.png", objectPath: pathD },
      ]),
    });
    // Don't push to createdModelIds — we're deleting it as part of
    // the test. (The user-cleanup pass below tolerates missing rows.)

    await deleteModel(baseUrl, token, modelC.id);
    const cGone = await waitFor(async () => !(await objectExists(pathC)));
    const dGone = await waitFor(async () => !(await objectExists(pathD)));
    eq2("scenario C: file C is removed after model DELETE", cGone, true);
    eq2("scenario C: file D is removed after model DELETE", dGone, true);
  } finally {
    // Best-effort cleanup so reruns don't accumulate test fixtures.
    for (const id of createdModelIds) {
      try {
        await db.delete(financialModelsTable).where(eq(financialModelsTable.id, id));
      } catch {}
    }
    if (userId !== null) {
      try {
        await db.delete(usersTable).where(eq(usersTable.id, userId));
      } catch {}
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
  console.error("orphan-uploads-cleanup test crashed:", err);
  process.exit(1);
});
