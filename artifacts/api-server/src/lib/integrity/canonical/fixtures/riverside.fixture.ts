/**
 * Persona fixture — Riverside (PRIVATE).
 *
 * See oakwood.fixture.ts for discovery details.
 */
import { PRIVATE_SCHOOL_MODEL } from "../../../seed-preview-data.js";
import type { PersonaFixture } from "../fixtures.js";

const fixture: PersonaFixture = {
  slug: "riverside",
  label: PRIVATE_SCHOOL_MODEL.name,
  segment: "PRIVATE",
  data: PRIVATE_SCHOOL_MODEL.data as unknown as Record<string, unknown>,
};

export default fixture;
