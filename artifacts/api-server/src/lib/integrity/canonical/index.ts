/**
 * Task #930 / M3 — Canonical Computation Layer barrel.
 *
 * Consumers (the M5 harness, M4 integrity report, and the api-server
 * coverage test) import every public surface through here so the
 * internal file layout can change without touching call sites.
 */
export {
  computeCanonicalValues,
  computeCanonicalValuesForFixture,
  computeCanonicalValuesForFixtures,
  listResolverMetricIds,
  findRegistryGaps,
  findResolverGaps,
  type CanonicalValueRecord,
  type ComputeResolverContext,
  type CanonicalResolver,
} from "./compute.js";
export {
  loadPersonaFixtures,
  getPersonaFixture,
  type PersonaFixture,
  type PersonaSlug,
} from "./fixtures.js";
