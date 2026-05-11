// Task #758 — Unit coverage for the cleanup-orphan-uploads sweeper's
// identify-orphans logic.
//
// Task #736 wired the sweeper to walk every `uploads/*` object in the
// bucket and diff it against the set of `objectPath`s referenced from
// `financial_models.data.assumptionConfidence[*].evidenceFiles[*]`.
// Anything in the bucket that no model row references is an orphan
// and gets deleted (in --execute mode).
//
// Two pieces of pure logic carry that contract:
//
//   1. `extractEvidenceObjectPaths(modelData)` — reaches several
//      layers deep into the model JSON to pull out every
//      `assumptionConfidence[*].evidenceFiles[*].objectPath`.
//   2. `identifyOrphanObjectPaths(inBucket, referenced)` — set-diff
//      that picks the orphans out of a bucket listing.
//
// A future refactor of either helper (e.g. moving evidence files
// out of `assumptionConfidence`, switching the diff to a JSONB query)
// could quietly start leaking objects again — the sweeper would still
// "succeed" but report zero orphans, and nobody would notice until
// the storage bill spiked. This test pins both helpers against
// representative fake fixtures so a regression fails loudly.

import {
  extractEvidenceObjectPaths,
  identifyOrphanObjectPaths,
} from "../src/scripts/cleanup-orphan-uploads.js";

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

function eqArr(label: string, actual: string[], expected: string[]): void {
  const a = [...actual].sort();
  const e = [...expected].sort();
  check(
    label,
    a.length === e.length && a.every((v, i) => v === e[i]),
    `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`,
  );
}

function main(): void {
  console.log("=== Orphan Uploads Sweeper Unit Tests (Task #758) ===");

  // ---- extractEvidenceObjectPaths --------------------------------

  eqArr("returns [] for null/undefined data", extractEvidenceObjectPaths(null), []);
  eqArr("returns [] for non-object data", extractEvidenceObjectPaths("string"), []);
  eqArr(
    "returns [] when assumptionConfidence is missing",
    extractEvidenceObjectPaths({ revenueRows: [] }),
    [],
  );
  eqArr(
    "returns [] when assumptionConfidence is not an object",
    extractEvidenceObjectPaths({ assumptionConfidence: "nope" }),
    [],
  );
  eqArr(
    "returns [] when no evidenceFiles arrays are present",
    extractEvidenceObjectPaths({
      assumptionConfidence: {
        tuition_per_student: { confidence: "signed_agreement", evidenceNote: "n/a" },
      },
    }),
    [],
  );

  const richModel = {
    assumptionConfidence: {
      tuition_per_student: {
        confidence: "signed_agreement",
        evidenceFiles: [
          { id: "a", objectPath: "/objects/uploads/u-1/aaa", name: "a.pdf" },
          { id: "b", objectPath: "/objects/uploads/u-1/bbb", name: "b.pdf" },
        ],
      },
      lease_cost: {
        confidence: "draft_agreement",
        evidenceFiles: [
          { id: "c", objectPath: "/objects/uploads/u-1/ccc", name: "lease.pdf" },
        ],
      },
      // Defensive — should be tolerated, not crash.
      enrollment_year2: { confidence: "estimate" },
      bogus_string: "not an object",
      bogus_files_not_array: { evidenceFiles: "still not an array" },
      bogus_file_no_path: {
        evidenceFiles: [
          { id: "d", name: "no-path.pdf" },
          { id: "e", objectPath: 42 },
          { id: "f", objectPath: "" },
          null,
          "bare string",
        ],
      },
    },
  };
  eqArr(
    "extracts every evidenceFiles[*].objectPath across multiple rows",
    extractEvidenceObjectPaths(richModel),
    [
      "/objects/uploads/u-1/aaa",
      "/objects/uploads/u-1/bbb",
      "/objects/uploads/u-1/ccc",
    ],
  );

  // ---- identifyOrphanObjectPaths ---------------------------------

  // Fake bucket listing — a mix of currently-referenced uploads, an
  // orphan from a deleted model, and a never-attached upload that
  // someone abandoned mid-wizard.
  const inBucket = [
    "/objects/uploads/u-1/aaa", // referenced
    "/objects/uploads/u-1/bbb", // referenced
    "/objects/uploads/u-1/ccc", // referenced (in another model)
    "/objects/uploads/u-1/orphan-from-deleted-model",
    "/objects/uploads/u-2/abandoned-upload",
  ];

  // Two fake model rows whose evidence files cover the first three.
  const fakeModels = [
    {
      assumptionConfidence: {
        tuition_per_student: {
          evidenceFiles: [
            { objectPath: "/objects/uploads/u-1/aaa" },
            { objectPath: "/objects/uploads/u-1/bbb" },
          ],
        },
      },
    },
    {
      assumptionConfidence: {
        lease_cost: {
          evidenceFiles: [{ objectPath: "/objects/uploads/u-1/ccc" }],
        },
      },
    },
  ];
  const referenced = new Set<string>();
  for (const m of fakeModels) {
    for (const p of extractEvidenceObjectPaths(m)) referenced.add(p);
  }

  eqArr(
    "identifies bucket objects no model references as orphans",
    identifyOrphanObjectPaths(inBucket, referenced),
    [
      "/objects/uploads/u-1/orphan-from-deleted-model",
      "/objects/uploads/u-2/abandoned-upload",
    ],
  );

  eqArr(
    "returns no orphans when every bucket object is referenced",
    identifyOrphanObjectPaths(
      ["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/bbb"],
      new Set(["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/bbb"]),
    ),
    [],
  );

  eqArr(
    "treats every bucket object as orphan when no models reference any",
    identifyOrphanObjectPaths(
      ["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/bbb"],
      new Set<string>(),
    ),
    ["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/bbb"],
  );

  eqArr(
    "returns [] for an empty bucket",
    identifyOrphanObjectPaths([], new Set(["/objects/uploads/u-1/aaa"])),
    [],
  );

  // The sweeper's safety net: comparison is exact, so a referenced
  // path that doesn't appear in the bucket listing must NOT cause an
  // orphan to be skipped. (Subtle regression: an early `return`
  // short-circuit would be invisible without this.)
  eqArr(
    "ignores referenced paths that are not in the bucket listing",
    identifyOrphanObjectPaths(
      ["/objects/uploads/u-1/orphan"],
      new Set(["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/bbb"]),
    ),
    ["/objects/uploads/u-1/orphan"],
  );

  // Accepts an iterable for `referenced` too — exercises the
  // `instanceof Set` branch in the helper.
  eqArr(
    "accepts an iterable (not just a Set) for referenced",
    identifyOrphanObjectPaths(
      ["/objects/uploads/u-1/aaa", "/objects/uploads/u-1/orphan"],
      ["/objects/uploads/u-1/aaa"],
    ),
    ["/objects/uploads/u-1/orphan"],
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main();
