/**
 * Persona fixture — Liberty (CHARTER).
 *
 * See oakwood.fixture.ts for discovery details.
 */
import { CHARTER_SCHOOL_MODEL } from "../../../seed-preview-data.js";
import type { PersonaFixture } from "../fixtures.js";

const fixture: PersonaFixture = {
  slug: "liberty",
  label: CHARTER_SCHOOL_MODEL.name,
  segment: "CHARTER",
  data: CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown>,
};

export default fixture;
