/**
 * Task #930 / M3 — Persona fixtures for the Canonical Computation
 * Layer.
 *
 * The three personas the M5 cross-surface harness anchors against:
 *
 *   - Oakwood   (microschool / private tuition only)
 *   - Riverside (private school with grants + tuition + offsets)
 *   - Liberty   (charter, per-pupil ADM public funding)
 *
 * Each fixture wraps the persona seed exported from
 * `seed-preview-data.ts` — the SAME payload the demo end-to-end
 * smoke tests already exercise (`charter-demo-end-to-end.ts`,
 * `non-charter-demos-end-to-end.ts`). Reusing the seeds (instead of
 * inventing new ones) guarantees the M3 canonical values stay in
 * step with whatever the rest of the product treats as the
 * reference shape for each segment.
 *
 * `slug` matches the M5 tier vocabulary
 * (`oakwood` is the single persona quoted by `anchor-oakwood`
 * metrics; `anchor-all` metrics fan out over every entry).
 */
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../../seed-preview-data.js";

export type PersonaSlug = "oakwood" | "riverside" | "liberty";

export interface PersonaFixture {
  slug: PersonaSlug;
  /** Reviewer-facing display name (matches the seed). */
  label: string;
  /** High-level segment for documentation / debugging. */
  segment: "MICROSCHOOL" | "PRIVATE" | "CHARTER";
  /**
   * Raw model payload exactly as the consultant engine accepts it
   * (the `data` field of the demo seed). Cast through `unknown` to
   * the loose `Record<string, unknown>` the engine entry point
   * expects — the seed is the canonical shape.
   */
  data: Record<string, unknown>;
}

/**
 * Returns every persona fixture the canonical compute layer (and
 * the M5 harness) should anchor against. Frozen so consumers can
 * iterate without worrying about accidental mutation between
 * personas.
 */
export function loadPersonaFixtures(): readonly PersonaFixture[] {
  return Object.freeze([
    {
      slug: "oakwood",
      label: MICROSCHOOL_MODEL.name,
      segment: "MICROSCHOOL",
      data: MICROSCHOOL_MODEL.data as unknown as Record<string, unknown>,
    },
    {
      slug: "riverside",
      label: PRIVATE_SCHOOL_MODEL.name,
      segment: "PRIVATE",
      data: PRIVATE_SCHOOL_MODEL.data as unknown as Record<string, unknown>,
    },
    {
      slug: "liberty",
      label: CHARTER_SCHOOL_MODEL.name,
      segment: "CHARTER",
      data: CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown>,
    },
  ] as const);
}

/** Convenience lookup. Throws when slug is unknown. */
export function getPersonaFixture(slug: PersonaSlug): PersonaFixture {
  const found = loadPersonaFixtures().find((p) => p.slug === slug);
  if (!found) {
    throw new Error(`[canonical/fixtures] Unknown persona slug "${slug}"`);
  }
  return found;
}
