// Integration test for the `assumptionConfidence` field on the public
// share-link payload returned by GET /api/shared/:token.
//
// Task #659 added the "Assumptions Confidence" card to the shared lender
// view (artifacts/school-financial-model/src/pages/shared/SharedModelPage.tsx),
// sourced from `data.assumptionConfidence` republished by the
// /shared/:token handler in artifacts/api-server/src/routes/models.ts
// (around line 2160). The component-level tests feed a hand-crafted
// payload, so a regression in the server route — forgetting to publish
// the field, dropping evidence notes/files, or surfacing `undefined`
// instead of an empty object on legacy models — wouldn't be caught
// until a lender actually opened a real link.
//
// This test exercises GET /api/shared/:token end-to-end against a real
// saved model and asserts:
//   1. Happy path: a model with multiple per-assumption confidence
//      entries (including evidence notes and evidenceFiles) round-trips
//      through the route untouched.
//   2. Empty / legacy path: an older model with no `assumptionConfidence`
//      key in `data` still publishes `assumptionConfidence: {}` so the
//      client can render the section conditionally without first
//      defending against `undefined`.
//
// Mirrors the harness in shared-route-break-even-downside.ts (Task #790).

import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  financialModelsTable,
  sharedLinksTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { microschoolStartup } from "./sample-payloads.js";

// --- Tiny test harness ---------------------------------------------------

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

function eqv<T>(label: string, actual: T, expected: T) {
  check(
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function deepEq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `expected ${e}, got ${a}`);
}

// --- DB helpers ----------------------------------------------------------

async function createUser(email: string): Promise<number> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  return row.id;
}

async function createModel(
  userId: number,
  data: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name: "Test Model", data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function createShareLink(
  modelId: number,
): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const [row] = await db
    .insert(sharedLinksTable)
    .values({ modelId, token })
    .returning({ id: sharedLinksTable.id, token: sharedLinksTable.token });
  return { id: row.id, token: row.token };
}

async function deleteUserCascade(userId: number) {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

// --- HTTP harness --------------------------------------------------------

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

// --- Tests ---------------------------------------------------------------

async function testHappyPath(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: assumptionConfidence round-trips populated map —",
  );

  // Cover the three pieces of the per-assumption record the lender
  // card actually renders: a confidence tier, an evidence note, and
  // an evidenceFiles array (with the App Storage objectPath the
  // lender PDF appendix consumes). Use multiple keys spanning
  // different wizard steps so a regression that drops a single
  // entry — or accidentally truncates the map — surfaces as a
  // missing key in the response.
  const assumptionConfidence = {
    enrollmentYear1: {
      confidence: "signed_agreement",
      evidenceNote: "12 signed enrollment letters on file from open house.",
      evidenceFiles: [
        {
          name: "enrollment-letters.pdf",
          size: 482_103,
          objectPath: "/uploads/test/enrollment-letters.pdf",
        },
      ],
    },
    tuitionPerStudent: {
      confidence: "research",
      evidenceNote:
        "Set against three comparable microschools within 10mi (avg $11,400).",
    },
    monthlyRent: {
      confidence: "quote",
      evidenceNote: "Verbal quote from landlord; LOI pending counter-signature.",
      evidenceFiles: [],
    },
    teacherSalary: {
      confidence: "estimate",
    },
  };

  const modelData = {
    ...(microschoolStartup as unknown as Record<string, unknown>),
    assumptionConfidence,
  };

  const userId = await createUser(
    `shared-assumption-conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  try {
    const modelId = await createModel(userId, modelData);
    const link = await createShareLink(modelId);

    const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
    const body = (await res.json()) as Record<string, unknown>;

    eqv("status is 200", res.status, 200);

    check(
      "response includes the assumptionConfidence key",
      "assumptionConfidence" in body,
      `keys: ${JSON.stringify(Object.keys(body))}`,
    );

    const conf = body.assumptionConfidence as Record<
      string,
      Record<string, unknown>
    > | undefined;
    check(
      "assumptionConfidence is a non-null object",
      typeof conf === "object" && conf !== null,
      `got ${typeof conf}`,
    );
    if (!conf) return;

    // Every founder-saved key must come through — an off-by-one or
    // accidental filter on the route would surface here as a missing
    // entry rather than only at lender-page render time.
    deepEq(
      "every saved assumption key is republished",
      Object.keys(conf).sort(),
      Object.keys(assumptionConfidence).sort(),
    );

    // Per-key payload fidelity: confidence tier, evidence note text,
    // and evidence file metadata (the lender PDF appendix consumes
    // the objectPath to embed attachments — silently dropping it
    // would make every share link's appendix render empty).
    eqv(
      "enrollmentYear1.confidence is preserved",
      conf.enrollmentYear1?.confidence,
      "signed_agreement",
    );
    eqv(
      "enrollmentYear1.evidenceNote is preserved",
      conf.enrollmentYear1?.evidenceNote,
      "12 signed enrollment letters on file from open house.",
    );
    deepEq(
      "enrollmentYear1.evidenceFiles is preserved with objectPath",
      conf.enrollmentYear1?.evidenceFiles,
      assumptionConfidence.enrollmentYear1.evidenceFiles,
    );

    eqv(
      "tuitionPerStudent.confidence is preserved",
      conf.tuitionPerStudent?.confidence,
      "research",
    );
    eqv(
      "tuitionPerStudent.evidenceNote is preserved",
      conf.tuitionPerStudent?.evidenceNote,
      "Set against three comparable microschools within 10mi (avg $11,400).",
    );

    eqv(
      "monthlyRent.confidence is preserved",
      conf.monthlyRent?.confidence,
      "quote",
    );
    deepEq(
      "monthlyRent.evidenceFiles preserves an empty array (not coerced to undefined)",
      conf.monthlyRent?.evidenceFiles,
      [],
    );

    // Estimate-only entry with no note / files: the bare minimum
    // shape the wizard saves once a founder taps a confidence
    // chip without filling in evidence. The lender page filters
    // these into the "still tagged estimate without evidence"
    // callout, so the response must still publish them.
    eqv(
      "teacherSalary.confidence is preserved (estimate, no evidence)",
      conf.teacherSalary?.confidence,
      "estimate",
    );
    check(
      "teacherSalary entry survives even without evidenceNote/evidenceFiles",
      conf.teacherSalary !== undefined && conf.teacherSalary !== null,
      `got ${JSON.stringify(conf.teacherSalary)}`,
    );
  } finally {
    await deleteUserCascade(userId);
  }
}

async function testLegacyEmptyPath(server: BootedServer) {
  console.log(
    "\n— GET /shared/:token: legacy model with no assumptionConfidence → field still present as {} —",
  );

  // The route's shape contract is that `assumptionConfidence` is
  // ALWAYS published — as `{}` when the saved model predates
  // Task #659 and has no such key. The client renders the
  // Assumptions Confidence section conditionally on
  // `Object.keys(data.assumptionConfidence ?? {}).length > 0`,
  // and ALSO unsafely accesses `data.assumptionConfidence || {}`,
  // so dropping the key from the response (`undefined`) wouldn't
  // crash the page but WOULD silently break any future code
  // that does `'assumptionConfidence' in data` — exactly the
  // contract this test pins.
  const legacyData: Record<string, unknown> = {
    schoolProfile: {
      schoolName: "Legacy Microschool",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      modelDuration: "five_year",
      maxCapacity: 30,
    },
    enrollment: { year1: 10, year2: 12, year3: 15, year4: 18, year5: 20 },
    revenue: { tuitionPerStudent: 10_000, annualTuitionIncrease: 0 },
    staffing: { teacherSalary: 40_000, founderSalary: 50_000, benefitsRate: 0 },
    facilities: { monthlyRent: 1_500, annualRentIncrease: 0 },
    openingBalances: { cash: 10_000 },
  };

  const userId = await createUser(
    `shared-assumption-conf-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  try {
    const modelId = await createModel(userId, legacyData);
    const link = await createShareLink(modelId);

    const res = await fetch(`${server.baseUrl}/api/shared/${link.token}`);
    const body = (await res.json()) as Record<string, unknown>;

    eqv("status is 200", res.status, 200);
    check(
      "response always includes the assumptionConfidence key",
      "assumptionConfidence" in body,
      `keys: ${JSON.stringify(Object.keys(body))}`,
    );
    const conf = body.assumptionConfidence;
    check(
      "assumptionConfidence is an object (never undefined / null) for legacy data",
      typeof conf === "object" && conf !== null && !Array.isArray(conf),
      `got ${JSON.stringify(conf)}`,
    );
    deepEq(
      "assumptionConfidence is exactly {} for a model with no saved confidence",
      conf,
      {},
    );
  } finally {
    await deleteUserCascade(userId);
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

  console.log("=== Shared Route assumptionConfidence Integration Tests ===");

  const server = await bootApp();
  try {
    await testHappyPath(server);
    await testLegacyEmptyPath(server);
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
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100).unref();
  });
