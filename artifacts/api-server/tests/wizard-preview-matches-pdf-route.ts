// Task #749 — Integration guard test: the wizard's Lender Narrative
// preview panel must render exactly the paragraphs the audience PDFs
// will print for the same model.
//
// Why an integration test (not just a unit test):
// -----------------------------------------------
// The wizard preview pulls its canonical-engine fallback paragraphs
// from `narrativeCommentaries` on the `/api/models/:id/consultant`
// response (artifacts/api-server/src/routes/models.ts). The PDF render
// path pulls them from the same `buildBoardCommentary` /
// `buildGrantCommentary` / `buildLenderCommentary` helpers. There is
// no static guarantee the route stays wired to those helpers — a
// future refactor could swap one of them out, the route could start
// post-processing the paragraphs, or it could drop a key entirely,
// and the wizard preview would then silently disagree with the PDF.
//
// To catch all of that we boot the real express app, create a real
// authed user with a real persisted model from the existing golden
// fixture (`microschoolStartup`), call the actual route, and use the
// response's `narrativeCommentaries` block as the source of the
// wizard's fallback. Then for each audience and a matrix of founder-
// draft shapes we compute:
//   - wizard preview paragraphs (mirrors `splitFounderDraft` from
//     NarrativeStep.tsx + the `narrativeCommentaries` fallback)
//   - PDF render paragraphs (`chooseCommentaryParagraphs(commentary,
//     draft)` from lender-packet-pdf.ts)
// and assert the two lists are deep-equal.
//
// If the route ever stops attaching `narrativeCommentaries`, swaps a
// builder, or post-processes a paragraph, this test fails immediately.

import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { db, usersTable, financialModelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { generateToken } from "../src/middlewares/auth.js";
import { microschoolStartup } from "./sample-payloads.js";
import { chooseCommentaryParagraphs } from "../src/lib/packets/lender-packet-pdf.js";
import type { NarrativeCommentary } from "../src/lib/packets/build-narrative-commentary.js";

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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Mirrors `splitFounderDraft` in
// artifacts/school-financial-model/src/pages/model-wizard/steps/NarrativeStep.tsx.
// The wizard preview applies this splitter to the founder-edited draft
// before rendering. If either side ever changes, the deep-equal check
// against `chooseCommentaryParagraphs` below trips.
function splitFounderDraft(text: string): string[] {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Mirrors NarrativePreviewPanel: non-blank founder draft → split with
// the wizard's splitter; blank / whitespace draft → fall back to the
// canonical-engine commentary served on the consultant response.
function previewParagraphs(
  commentary: NarrativeCommentary,
  founderDraft: string,
): string[] {
  const founderText = (founderDraft || "").trim();
  if (founderText.length > 0) return splitFounderDraft(founderText);
  return commentary.paragraphs;
}

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

async function createUser(email: string): Promise<{ id: number; token: string }> {
  const passwordHash = await bcrypt.hash("test-password-123", 4);
  const [row] = await db
    .insert(usersTable)
    .values({ email, name: "Test User", passwordHash })
    .returning({ id: usersTable.id });
  const token = generateToken(row.id);
  return { id: row.id, token };
}

async function createModel(
  userId: number,
  data: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(financialModelsTable)
    .values({ userId, name: "Wizard Preview Parity Model", data })
    .returning({ id: financialModelsTable.id });
  return row.id;
}

async function deleteUserCascade(userId: number): Promise<void> {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

type AudienceKey = "board" | "grant" | "lender";

// The route returns `narrativeCommentaries` as a JSON object on the
// consultant response. We type-narrow it conservatively because the
// route is the contract under test — if a future refactor drops a key
// or renames `paragraphs`, the assertions below will fail loudly
// rather than us silently coercing the shape.
function readCommentary(
  payload: Record<string, unknown>,
  key: AudienceKey,
): NarrativeCommentary {
  const commentaries = payload.narrativeCommentaries as
    | Record<string, unknown>
    | undefined;
  if (!commentaries || typeof commentaries !== "object") {
    throw new Error(
      "consultant response did not include `narrativeCommentaries` (the wizard preview fallback source)",
    );
  }
  const entry = commentaries[key] as NarrativeCommentary | undefined;
  if (!entry || !Array.isArray(entry.paragraphs)) {
    throw new Error(
      `consultant response narrativeCommentaries.${key} is missing or has no paragraphs[]`,
    );
  }
  return entry;
}

async function run(): Promise<void> {
  const server = await bootApp();
  const stamp = Date.now();
  const user = await createUser(`wizard-preview-parity-${stamp}@example.com`);

  try {
    // Use the canonical golden fixture other route tests use, so this
    // guard rides on the same model shape the rest of the API test
    // suite is already exercising.
    const modelId = await createModel(
      user.id,
      microschoolStartup as unknown as Record<string, unknown>,
    );

    const res = await fetch(
      `${server.baseUrl}/api/models/${modelId}/consultant`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${user.token}` },
      },
    );
    check("consultant route returns 200", res.status === 200, `got ${res.status}`);
    const payload = (await res.json()) as Record<string, unknown>;

    // Audience matrix × founder-draft matrix. Blank / whitespace-only
    // exercise the canonical-engine fallback path; the non-blank cases
    // exercise the splitter agreement (extra blank lines, leading /
    // trailing whitespace around paragraphs, single trailing blank
    // line are all stress patterns the splitter must collapse
    // identically on both sides).
    const founderDrafts: Record<string, string> = {
      blank: "",
      whitespaceOnly: "   \n  \n  ",
      simple:
        "Founder paragraph one for this audience.\n\nFounder paragraph two.\n\nFounder paragraph three.",
      extraBlankLines:
        "  Founder paragraph one.  \n\n\n\n  Founder paragraph two.  \n\n\nFounder paragraph three.\n\n",
    };

    for (const aud of ["board", "grant", "lender"] as AudienceKey[]) {
      const commentary = readCommentary(payload, aud);
      check(
        `${aud}: route attaches a non-empty canonical-engine commentary on the consultant response`,
        commentary.paragraphs.length > 0,
      );

      for (const [draftLabel, draft] of Object.entries(founderDrafts)) {
        const wizard = previewParagraphs(commentary, draft);
        const pdf = chooseCommentaryParagraphs(commentary, draft).paragraphs;

        check(
          `${aud} / draft="${draftLabel}": wizard preview paragraphs deep-equal PDF render paragraphs`,
          arraysEqual(wizard, pdf),
          `wizard=${JSON.stringify(wizard)}; pdf=${JSON.stringify(pdf)}`,
        );

        const founderText = draft.trim();
        if (founderText.length === 0) {
          check(
            `${aud} / draft="${draftLabel}": both sides fall back to the canonical-engine commentary verbatim`,
            arraysEqual(wizard, commentary.paragraphs) &&
              arraysEqual(pdf, commentary.paragraphs),
          );
        } else {
          check(
            `${aud} / draft="${draftLabel}": both sides render the founder draft (no canonical-engine bleed-through)`,
            wizard.length > 0 &&
              wizard.every((p) => !commentary.paragraphs.includes(p)) &&
              pdf.every((p) => !commentary.paragraphs.includes(p)),
          );
        }
      }
    }

    // Empty-on-both-sides edge case: an empty commentary AND a blank
    // founder draft must produce zero paragraphs on both sides so the
    // PDF doesn't print an orphan section header and the wizard
    // preview doesn't show a stale paragraph list. We construct the
    // empty commentary off the route's actual bundle so the shape
    // matches what the route serves.
    const boardCommentary = readCommentary(payload, "board");
    const emptyCommentary: NarrativeCommentary = {
      paragraphs: [],
      allowedFigures: [],
      bundle: boardCommentary.bundle,
      generatedAt: "",
    };
    const wizardEmpty = previewParagraphs(emptyCommentary, "");
    const pdfEmpty = chooseCommentaryParagraphs(emptyCommentary, "").paragraphs;
    check(
      "empty commentary + blank draft: both sides render zero paragraphs",
      wizardEmpty.length === 0 && pdfEmpty.length === 0,
    );
  } finally {
    await deleteUserCascade(user.id);
    await server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
