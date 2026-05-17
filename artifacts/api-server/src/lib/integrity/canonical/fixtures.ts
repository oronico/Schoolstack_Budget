/**
 * Task #930 / M3 — Persona fixtures for the Canonical Computation
 * Layer.
 *
 * `loadPersonaFixtures()` discovers fixture files automatically from
 * the sibling `fixtures/` directory: any file matching
 * `*.fixture.{ts,js,mjs,cjs}` whose default export is a
 * `PersonaFixture` is picked up. Adding a new persona to the
 * canonical layer is therefore a one-file drop — no edits to the
 * loader, the resolver table, or the integrity test are required.
 *
 * The current persona set (Oakwood / Riverside / Liberty) wraps the
 * seeds exported from `seed-preview-data.ts` — the SAME payloads the
 * demo end-to-end smoke tests already exercise. Reusing the seeds
 * guarantees the M3 canonical values stay in step with whatever the
 * rest of the product treats as the reference shape for each
 * segment.
 *
 * `slug` matches the M5 tier vocabulary
 * (`oakwood` is the single persona quoted by `anchor-oakwood`
 * metrics; `anchor-all` metrics fan out over every entry).
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type PersonaSlug = string;

export interface PersonaFixture {
  /** Stable identifier (lowercase, kebab-case) — used as a key. */
  slug: PersonaSlug;
  /** Reviewer-facing display name (matches the seed). */
  label: string;
  /** High-level segment for documentation / debugging. */
  segment: "MICROSCHOOL" | "PRIVATE" | "CHARTER" | string;
  /**
   * Raw model payload exactly as the consultant engine accepts it
   * (the `data` field of the demo seed). Cast through `unknown` to
   * the loose `Record<string, unknown>` the engine entry point
   * expects — the seed is the canonical shape.
   */
  data: Record<string, unknown>;
}

const FIXTURE_DIR_NAME = "fixtures";
const FIXTURE_SUFFIX_RE = /\.fixture\.(ts|js|mjs|cjs)$/;

function isPersonaFixture(x: unknown): x is PersonaFixture {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.slug === "string" &&
    typeof o.label === "string" &&
    typeof o.segment === "string" &&
    !!o.data &&
    typeof o.data === "object"
  );
}

let cached: readonly PersonaFixture[] | null = null;

/**
 * Discover and load every persona fixture in the sibling
 * `fixtures/` directory. Synchronous on the surface (returns an
 * array) but performs dynamic imports the first time it is called
 * and caches the result. Throws if a `*.fixture.*` file does not
 * default-export a valid `PersonaFixture`, or if duplicate slugs
 * are detected.
 */
export function loadPersonaFixtures(): readonly PersonaFixture[] {
  if (cached) return cached;
  // Synchronous import via `require`-equivalent isn't available
  // under pure ESM, so we expose an async loader and a sync
  // getter that throws if the async loader hasn't been awaited
  // yet. Practically every M3/M4/M5 caller is already async, so
  // we await at the call site.
  throw new Error(
    "[canonical/fixtures] loadPersonaFixtures() requires the async loader; " +
      "call `await loadPersonaFixturesAsync()` (or await it once at process " +
      "start and re-call this sync getter).",
  );
}

/**
 * Async discovery + load. Idempotent — populates the sync-getter
 * cache on first call.
 */
export async function loadPersonaFixturesAsync(): Promise<
  readonly PersonaFixture[]
> {
  if (cached) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, FIXTURE_DIR_NAME);
  const entries = readdirSync(dir).filter((f) => FIXTURE_SUFFIX_RE.test(f));
  entries.sort();
  const loaded: PersonaFixture[] = [];
  for (const file of entries) {
    const url = pathToFileURL(join(dir, file)).href;
    const mod = (await import(url)) as { default?: unknown };
    const fx = mod.default;
    if (!isPersonaFixture(fx)) {
      throw new Error(
        `[canonical/fixtures] ${file}: default export is not a valid ` +
          `PersonaFixture { slug, label, segment, data }.`,
      );
    }
    loaded.push(fx);
  }
  const seen = new Set<string>();
  for (const fx of loaded) {
    if (seen.has(fx.slug)) {
      throw new Error(
        `[canonical/fixtures] duplicate persona slug "${fx.slug}" — ` +
          `every *.fixture.* file must declare a unique slug.`,
      );
    }
    seen.add(fx.slug);
  }
  cached = Object.freeze(loaded);
  return cached;
}

/** Convenience lookup. Throws when slug is unknown. */
export async function getPersonaFixture(
  slug: PersonaSlug,
): Promise<PersonaFixture> {
  const all = await loadPersonaFixturesAsync();
  const found = all.find((p) => p.slug === slug);
  if (!found) {
    throw new Error(`[canonical/fixtures] Unknown persona slug "${slug}"`);
  }
  return found;
}
