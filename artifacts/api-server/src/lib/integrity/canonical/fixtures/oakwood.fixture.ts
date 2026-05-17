/**
 * Persona fixture — Oakwood (MICROSCHOOL).
 *
 * Discovered automatically by `loadPersonaFixtures()` via the
 * `*.fixture.ts` naming convention in this directory. Adding a new
 * persona = drop a new file here; no edits to the loader, the
 * resolver table, or the integrity test are required.
 */
import { MICROSCHOOL_MODEL } from "../../../seed-preview-data.js";
import type { PersonaFixture } from "../fixtures.js";

const fixture: PersonaFixture = {
  slug: "oakwood",
  label: MICROSCHOOL_MODEL.name,
  segment: "MICROSCHOOL",
  data: MICROSCHOOL_MODEL.data as unknown as Record<string, unknown>,
};

export default fixture;
