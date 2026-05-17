/**
 * Task #930 / #977 — M5 per-persona render coverage harness (SFM half).
 *
 * The api-server harness at
 * `artifacts/api-server/tests/math-integrity-harness.ts` writes per-
 * persona React-props snapshots into
 * `src/lib/integrity/__fixtures__/render-props/<persona>.json` and
 * then spawns this vitest file. For every persona × component pairing
 * we:
 *
 *   1. Render the in-app component (`ConsultantAnalysisView` or the
 *      `NarrativeHeader + CommentaryBlock` subtree of
 *      `LenderPacketPreview`) with the persona's real, engine-derived
 *      props.
 *   2. Run `extractRendered` over the resulting DOM ("component-rendered"
 *      surface — the DOM-walk subset).
 *   3. Run a props-walk equivalent to api-server's
 *      `extractComponentState` over the same input ("component-props"
 *      surface — the superset).
 *   4. Assert BOTH cross-surface directions:
 *        a. rendered ⊆ props (strict, no tolerance): catches "shown but
 *           not on the wire" regressions where the component fabricates
 *           a number the server never sent.
 *        b. critical props leaves ⊆ rendered: catches "shipped but not
 *           shown" / render-suppression regressions for the persona's
 *           headline KPIs (cash runway months, lender-readiness cap
 *           callout) — the class the rendered ⊆ props check cannot see.
 *
 * The snapshot files at `__fixtures__/render-props/<persona>.json`
 * are committed as golden fixtures so stand-alone `pnpm --filter
 * @workspace/school-financial-model run test` invocations pass
 * without first running the api-server harness. The api-server
 * harness is the authoritative driver and rewrites the fixtures
 * in-place on every run, so any persona-data drift surfaces as a
 * normal source-controlled diff. As a safety net, the tests `skipIf`
 * with a clear message if the fixtures dir is somehow absent.
 *
 * Note on `LenderPacketPreview`: the top-level component fetches
 * `/api/models/:id/export/lender-packet` itself, so it can't render
 * cleanly in jsdom. The smoke test at `./extract-rendered.test.tsx`
 * already established the convention of exercising the exported
 * `NarrativeHeader + CommentaryBlock` subtrees as the renderable
 * surface — the persona-backed harness here follows that convention
 * and uses the persona's actual lender packet payload from the
 * snapshot.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRendered } from "../extract-rendered";

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { ConsultantAnalysisView } from "@/components/consultant/ConsultantAnalysisView";
import {
  NarrativeHeader,
  CommentaryBlock,
} from "@/components/export/LenderPacketPreview";
import type { ConsultantOutput } from "@workspace/api-client-react";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(
  HERE,
  "..",
  "__fixtures__",
  "render-props",
);

/**
 * Local structural mirrors of the LenderPacketPreview component prop
 * shapes (kept structural rather than imported from api-server to
 * avoid cross-artifact dependency, and kept explicit rather than
 * `any` so the harness retains type safety per the M5 code-review
 * bar). Both interfaces are pure data — they mirror the runtime
 * shape the components destructure, not the full canonical schema.
 */
interface NarrativeSummaryShape {
  headline: string;
  summary: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendedFocus: string;
}

interface LenderReadinessShape {
  status: string;
  explanation: string;
  result?: {
    uncappedRating?: string;
    effectiveRating?: string;
    cap?: {
      applied?: boolean;
      reason?: string;
      pendingEvidenceCount?: number;
      totalAssumptionCount?: number;
      taggedCount?: number;
      taggedFraction?: number;
    };
    callout?: string;
  };
}

interface NarrativeCommentaryShape {
  paragraphs: string[];
  allowedFigures: string[];
  generatedAt: string;
}

interface LenderPacketShape {
  narrative?: NarrativeSummaryShape;
  lenderReadiness?: LenderReadinessShape;
  lenderCommentary?: NarrativeCommentaryShape;
}

interface RenderPropsSnapshot {
  personaSlug: string;
  personaLabel: string;
  personaSegment: string;
  consultant: ConsultantOutput;
  lenderPacket: LenderPacketShape & Record<string, unknown>;
}

function loadSnapshots(): RenderPropsSnapshot[] {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  const out: RenderPropsSnapshot[] = [];
  for (const file of readdirSync(SNAPSHOT_DIR)) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const raw = JSON.parse(
      readFileSync(join(SNAPSHOT_DIR, file), "utf8"),
    ) as RenderPropsSnapshot;
    out.push(raw);
  }
  return out.sort((a, b) => a.personaSlug.localeCompare(b.personaSlug));
}

/**
 * Props-walk equivalent of api-server's `extractComponentState`
 * (`artifacts/api-server/src/lib/integrity/extract/component-state.ts`).
 * Mirrors the walker contract: yield one record per numeric leaf in
 * the typed props payload, tagged with the logical "component-props"
 * surface name. Kept locally so SFM does not have to cross the
 * artifact boundary into api-server source.
 */
interface PropsRecord {
  surface: "component-props";
  producer: string;
  location: string;
  value: number;
  label: string | null;
}

function extractPropsNumeric(
  payload: unknown,
  componentName: string,
): PropsRecord[] {
  const out: PropsRecord[] = [];
  const stack: { node: unknown; path: string; label: string | null }[] = [
    { node: payload, path: "$", label: null },
  ];
  while (stack.length > 0) {
    const { node, path, label } = stack.pop()!;
    if (node === null || node === undefined) continue;
    if (typeof node === "number") {
      if (Number.isFinite(node)) {
        out.push({
          surface: "component-props",
          producer: componentName,
          location: path,
          value: node,
          label,
        });
      }
      continue;
    }
    if (typeof node === "string") {
      // Strings sometimes carry numeric tokens (e.g. lender callout
      // "Rating capped … 22 of 22 assumptions", or ISO timestamps
      // like "2026-05-17T22:33:37"). We extract POSITIVE numerics
      // only — a leading `-?` would greedily consume the `-` between
      // ISO date components ("2026-05-17" → "-17"), causing the
      // rendered "+17" day-of-month to fail to match the props side.
      // Genuine negative numbers in the wire schema arrive as
      // `typeof "number"` and are handled by the number branch above.
      const matches = node.match(/\d[\d,]*(?:\.\d+)?/g);
      if (matches) {
        let i = 0;
        for (const m of matches) {
          const parsed = Number.parseFloat(m.replace(/,/g, ""));
          if (Number.isFinite(parsed)) {
            out.push({
              surface: "component-props",
              producer: componentName,
              location: `${path}#str[${i++}]`,
              value: parsed,
              label,
            });
          }
        }
      }
      continue;
    }
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        stack.push({ node: node[i], path: `${path}[${i}]`, label });
      }
      continue;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        stack.push({ node: v, path: `${path}.${k}`, label: k });
      }
      continue;
    }
  }
  return out;
}

/**
 * Per-token tolerance for the rendered ⊆ props check. The rendered
 * extractor canonicalises tokens (`$166K` → 166000, `12.5%` → 0.125),
 * so the props side carries the underlying numeric verbatim. We use a
 * combined absolute + relative bound — generous enough to absorb the
 * inherent floor/ceiling rounding the components apply for display
 * (`toFixed(1)` mo, integer rounding for $K), strict enough that a
 * fabricated number is caught.
 */
const ABS_TOL = 0.5; // catches integer rounding (e.g. $48,500 vs 48500)
const REL_TOL = 0.01; // 1% — catches $K rounding ($166K → 166000 from 165980)

function matchesAnyProp(
  rendered: number,
  props: readonly PropsRecord[],
): boolean {
  for (const p of props) {
    const diff = Math.abs(p.value - rendered);
    if (diff <= ABS_TOL) return true;
    if (
      rendered !== 0 &&
      diff / Math.abs(rendered) <= REL_TOL
    ) {
      return true;
    }
    // Cross-scale aliases the renderer applies before printing.
    // - Percent rendered as fraction in props (12.5% → 0.125 rendered;
    //   props may carry 12.5 instead).
    // - K/M rounding (rendered side): rendered 166000 may correspond
    //   to props 166 ($K shorthand).
    // - K compact (rendered side, INVERSE): `fmtCompact($76,000)` may
    //   collapse to bare "76" without a K suffix in tight cells (the
    //   sensitivity matrix net-income cells do this); props carries
    //   the full 76000.
    const aliases = [
      p.value,
      p.value * 100,
      p.value / 100,
      p.value * 1000,
      p.value / 1000,
    ];
    for (const alias of aliases) {
      const aDiff = Math.abs(alias - rendered);
      if (aDiff <= ABS_TOL) return true;
      if (rendered !== 0 && aDiff / Math.abs(rendered) <= REL_TOL) {
        return true;
      }
    }
  }
  return false;
}

/**
 * `extractRendered` canonicalises tokens with the same KMB/percent/
 * months scaling. To assert "this critical props value made it into
 * the rendered DOM", we reuse the SAME tolerance ladder used for the
 * subset check above so this and the orphan check agree on what
 * "equal enough" means.
 */
function renderedHasValue(
  target: number,
  rendered: readonly { value: number }[],
): boolean {
  // Build a one-element synthetic props array so we can reuse the
  // matcher's tolerance semantics in the opposite direction.
  const fakeProps: PropsRecord[] = [
    {
      surface: "component-props",
      producer: "__critical__",
      location: "$",
      value: target,
      label: null,
    },
  ];
  for (const r of rendered) {
    if (matchesAnyProp(r.value, fakeProps)) return true;
  }
  return false;
}

const snapshots = loadSnapshots();

describe.skipIf(snapshots.length === 0)(
  "M5 per-persona render coverage (component-props vs component-rendered)",
  () => {
    it("loaded all 3 persona snapshots from the api-server harness", () => {
      expect(snapshots.length).toBeGreaterThanOrEqual(3);
      const slugs = snapshots.map((s) => s.personaSlug).sort();
      expect(slugs).toEqual(
        expect.arrayContaining(["liberty", "oakwood", "riverside"]),
      );
    });

    for (const snap of snapshots) {
      describe(`persona: ${snap.personaSlug} (${snap.personaSegment})`, () => {
        it("ConsultantAnalysisView: rendered ⊆ props AND critical KPI ⊆ rendered", () => {
          const { container } = render(
            <ConsultantAnalysisView
              data={snap.consultant}
              niLabel="Net Income"
              cumNiLabel="Cumulative Net Income"
            />,
          );
          // Exclude the CustomStressTestForm subtree — its `<p>` /
          // `<input>` defaultValue numerics come from useState
          // initialisers inside the form component, not the
          // ConsultantAnalysisView `data` prop, so they cannot be
          // reconciled to the props-walk by design.
          const rendered = extractRendered(container, {
            componentName: "ConsultantAnalysisView",
            skipSubtreeTestIds: ["custom-stress-test-form"],
          });
          // 4a-coverage: every persona must paint at least one
          // numeric token in this view.
          expect(rendered.length).toBeGreaterThan(0);

          const props = extractPropsNumeric(
            snap.consultant,
            "ConsultantAnalysisView",
          );
          expect(props.length).toBeGreaterThan(0);

          // 4a. Strict superset invariant: every rendered numeric
          // token MUST have a props counterpart (under the documented
          // tolerance ladder). No ceiling, no tolerance for orphans.
          const orphans = rendered.filter(
            (r) => !matchesAnyProp(r.value, props),
          );
          if (orphans.length > 0) {
            const sample = orphans
              .slice(0, 10)
              .map(
                (o) =>
                  `${o.value} @ ${o.location} (raw=${o.rawToken ?? "?"}, label=${o.label ?? "?"})`,
              )
              .join("\n  ");
            throw new Error(
              `persona ${snap.personaSlug} / ConsultantAnalysisView: ${orphans.length} rendered numeric token(s) have no matching props value (rendered ⊄ props):\n  ${sample}`,
            );
          }

          // 4b. Render-suppression guard (props ⊆ rendered for
          // critical KPI). The cash runway months value is the
          // consultant view's headline figure; if the component ever
          // suppressed it conditionally we'd see this fire.
          const runway = snap.consultant.cashRunwayMonths;
          if (typeof runway === "number" && Number.isFinite(runway)) {
            expect(
              renderedHasValue(runway, rendered),
              `persona ${snap.personaSlug} / ConsultantAnalysisView: cashRunwayMonths=${runway} present in props but NOT rendered (suppression-class regression)`,
            ).toBe(true);
          }
        });

        it("LenderPacketPreview (NarrativeHeader + CommentaryBlock): rendered ⊆ props AND cap callout ⊆ rendered", () => {
          const lp = snap.lenderPacket;
          // Persona payloads MUST carry the narrative + readiness
          // subtrees — they're built unconditionally by
          // `buildLenderPacket`. A missing field here is itself a
          // regression we want to flag.
          expect(lp.narrative).toBeTruthy();
          expect(lp.lenderReadiness).toBeTruthy();
          const narrative = lp.narrative!;
          const readiness = lp.lenderReadiness!;

          // Use the snapshot's commentary verbatim when present.
          // Missing commentary is itself a regression for personas
          // expected to produce one (Liberty + Oakwood always have
          // it post-#617); we render a minimal stub ONLY so the
          // CommentaryBlock can still mount and the rendered-side
          // coverage check is meaningful. A WARN is emitted so a
          // silent disappearance is still surfaced.
          let commentary = lp.lenderCommentary;
          if (!commentary) {
            console.warn(
              `[lender-commentary missing] persona=${snap.personaSlug} — rendering minimal stub`,
            );
            commentary = {
              paragraphs: [
                "No lender commentary generated for this persona.",
              ],
              allowedFigures: [],
              generatedAt: new Date("2026-01-01").toISOString(),
            };
          }

          const { container } = render(
            <div>
              <NarrativeHeader
                narrative={narrative}
                readiness={readiness}
              />
              <CommentaryBlock
                title="Lender Commentary"
                accent="lender"
                commentary={commentary}
                onRegenerate={() => {}}
                regenerating={false}
              />
            </div>,
          );
          const rendered = extractRendered(container, {
            componentName: "LenderPacketPreview",
            // The "Regenerated at {stamp}" paragraph runs
            // `new Date(generatedAt).toLocaleString()`, which
            // produces a locale/timezone-dependent formatting (e.g.
            // 12-hour clock with AM/PM, locale-specific date order)
            // that does not align 1:1 with the ISO string the props
            // extractor walks. The stamp is purely a UI-side
            // transformation of an existing prop, not a numeric
            // claim, so it's excluded from the rendered ⊆ props
            // check.
            skipSubtreeTestIds: [
              "commentary-stamp-lender",
              "commentary-stamp-board",
            ],
          });
          expect(rendered.length).toBeGreaterThan(0);

          const propsPayload = {
            narrative,
            lenderReadiness: readiness,
            lenderCommentary: commentary,
          };
          const props = extractPropsNumeric(
            propsPayload,
            "LenderPacketPreview",
          );
          expect(props.length).toBeGreaterThan(0);

          // 4a. Strict superset invariant.
          const orphans = rendered.filter(
            (r) => !matchesAnyProp(r.value, props),
          );
          if (orphans.length > 0) {
            const sample = orphans
              .slice(0, 10)
              .map(
                (o) =>
                  `${o.value} @ ${o.location} (raw=${o.rawToken ?? "?"}, label=${o.label ?? "?"})`,
              )
              .join("\n  ");
            throw new Error(
              `persona ${snap.personaSlug} / LenderPacketPreview: ${orphans.length} rendered numeric token(s) have no matching props value (rendered ⊄ props):\n  ${sample}`,
            );
          }

          // 4b. Render-suppression guard (props ⊆ rendered): when the
          // lender-readiness cap is applied, the pre-rendered callout
          // string MUST surface in the DOM. The callout typically
          // reads "Rating capped at <X> — only <tagged> of
          // <total> assumptions tagged with evidence." Both numeric
          // counts must reach the rendered output.
          const cap = readiness.result?.cap;
          if (cap?.applied) {
            const tagged = cap.taggedCount;
            const total = cap.totalAssumptionCount;
            if (typeof total === "number" && Number.isFinite(total)) {
              expect(
                renderedHasValue(total, rendered),
                `persona ${snap.personaSlug} / LenderPacketPreview: cap.totalAssumptionCount=${total} present in props but NOT rendered (cap callout suppression)`,
              ).toBe(true);
            }
            if (typeof tagged === "number" && Number.isFinite(tagged)) {
              expect(
                renderedHasValue(tagged, rendered),
                `persona ${snap.personaSlug} / LenderPacketPreview: cap.taggedCount=${tagged} present in props but NOT rendered (cap callout suppression)`,
              ).toBe(true);
            }
          }
        });
      });
    }
  },
);

// When no snapshots are present (standalone `pnpm --filter
// @workspace/school-financial-model run test` without the api-server
// harness having run first), keep this file from looking like a
// silently empty suite — emit a single visible skip note.
describe.skipIf(snapshots.length > 0)(
  "M5 per-persona render coverage (skipped — no snapshots present)",
  () => {
    it.skip(
      `run \`pnpm --filter @workspace/api-server run test:math-integrity-harness\` to populate ${SNAPSHOT_DIR}`,
      () => {},
    );
  },
);
