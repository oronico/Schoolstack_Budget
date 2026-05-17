/**
 * Task #930 / M2 — Component-state (props-state approximation) extractor.
 *
 * IMPORTANT — scope caveat (acknowledged at code review):
 *
 *   This extractor walks the typed JSON props that the in-app React
 *   components receive (e.g. `ConsultantOutput`,
 *   `LenderPacket`, `BoardPacket`). It is NOT a render-equivalent
 *   serializer of the rendered DOM. Components apply local view logic
 *   the props-walk cannot see — `.slice(0, 6)`, conditional sections,
 *   format collapsing (`$166K`), de-duplication, etc.
 *
 *   M4 (Mapping) and M5 (Integrity Harness) MUST treat the records
 *   emitted here as a SUPERSET of what the component renders — every
 *   number the component shows comes from one of these leaves, but
 *   not every leaf is shown. The intended M4/M5 contract is:
 *
 *     1. Map each registry metric to one or more `(producer, location)`
 *        leaves on this surface.
 *     2. Reconcile those mapped leaves to the canonical engine value.
 *     3. To prove "what the founder actually sees" (rendered DOM
 *        text), pair this extractor with a per-component rendered-DOM
 *        snapshot in M5 — that is out of scope for M2.
 *
 *   This compromise was a deliberate choice: rendering the live React
 *   components (`ConsultantAnalysisView`, `LenderPacketPreview`,
 *   `BoardPacketPreview`) from api-server tests would require
 *   importing across artifact boundaries, mocking the design system,
 *   and spinning up jsdom — none of which M3/M4/M5 actually need.
 *
 * Records emitted here share the canonical `ExtractedValue` shape so
 * M4 can apply the same mapping logic across all four surfaces. The
 * location format mirrors `json-export` (dotted JSON path) on
 * purpose: a packet displayed by `LenderPacketPreview` is the same
 * JSON shape the `/api/models/:id/export/lender-packet` endpoint
 * ships, so M5 can run a set-diff between the two producers to
 * detect "API drift between server and client view models" cheaply.
 */
import { walkJsonForNumbers } from "./walk-json.js";
import type { ExtractedValue } from "./types.js";

export interface ExtractComponentStateOptions {
  /** Component identifier (e.g. "ConsultantAnalysisView",
   *  "LenderPacketPreview"). Used as the `producer` field so M4 can
   *  scope assertions to a specific component. */
  componentName: string;
}

export function extractComponentState(
  props: unknown,
  opts: ExtractComponentStateOptions,
): ExtractedValue[] {
  const leaves = walkJsonForNumbers(props);
  return leaves.map((leaf) => ({
    surface: "component-state",
    producer: opts.componentName,
    location: leaf.path,
    value: leaf.value,
    rawToken: leaf.rawToken,
    label: leaf.label,
  }));
}
