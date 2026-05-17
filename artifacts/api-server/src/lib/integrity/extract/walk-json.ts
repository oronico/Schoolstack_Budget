/**
 * Task #930 / M2 — Shared JSON walker for the component-state and
 * json-export extractors.
 *
 * Walks an arbitrary JSON-shaped value (objects / arrays / primitives)
 * and yields every finite numeric leaf with its dotted path and the
 * nearest field name (used by M4 as a label hint).
 *
 * Strings that LOOK numeric (`"$1,234"`, `"12.5%"`, `"1.45x"`,
 * `"8.0 mo"`, `"$166K"`) are parsed too — the React components and
 * the API responses both ship printed strings alongside raw numbers,
 * and the integrity harness needs to compare both flavours back to
 * the canonical value.
 */

const CURRENCY_RE = /^-?\$?\s*-?[\d,]+(?:\.\d+)?\s*[KMB]?$/i;
const PERCENT_RE = /^-?[\d,]+(?:\.\d+)?\s*%$/;
const RATIO_RE = /^-?[\d,]+(?:\.\d+)?\s*x$/i;
const MONTHS_RE = /^-?[\d,]+(?:\.\d+)?\s*(?:mo|months?)$/i;
const BARE_NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;

export interface NumericLeaf {
  path: string;
  value: number;
  rawToken?: string;
  label?: string;
}

/**
 * Parse a single string token to a number with an "is-numeric" verdict.
 * Returns `null` if the string is not interpretable as a single number.
 * K/M/B suffixes are expanded to thousands/millions/billions.
 */
export function parseNumericString(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  let stripped = trimmed;
  let scale = 1;
  if (CURRENCY_RE.test(trimmed)) {
    stripped = trimmed.replace(/[$,\s]/g, "");
    const last = stripped.slice(-1).toUpperCase();
    if (last === "K") { scale = 1_000; stripped = stripped.slice(0, -1); }
    else if (last === "M") { scale = 1_000_000; stripped = stripped.slice(0, -1); }
    else if (last === "B") { scale = 1_000_000_000; stripped = stripped.slice(0, -1); }
  } else if (PERCENT_RE.test(trimmed)) {
    stripped = trimmed.replace(/[%,\s]/g, "");
    scale = 0.01;
  } else if (RATIO_RE.test(trimmed)) {
    stripped = trimmed.replace(/[x,\s]/gi, "");
  } else if (MONTHS_RE.test(trimmed)) {
    stripped = trimmed.replace(/[a-z,\s]/gi, "");
  } else if (BARE_NUMBER_RE.test(trimmed)) {
    stripped = trimmed.replace(/,/g, "");
  } else {
    return null;
  }
  const n = Number(stripped) * scale;
  return Number.isFinite(n) ? n : null;
}

function pushPathSegment(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  if (path.length === 0) return key;
  return `${path}.${key}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Yield every numeric leaf from `root` as a flat list. `label` is the
 * nearest field-name segment in the path (the immediate parent key for
 * an object leaf; the parent of the enclosing array for an array leaf).
 */
export function walkJsonForNumbers(root: unknown): NumericLeaf[] {
  const out: NumericLeaf[] = [];

  function lastFieldName(parents: (string | number)[]): string | undefined {
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i];
      if (typeof p === "string") return p;
    }
    return undefined;
  }

  function recurse(node: unknown, path: string, parents: (string | number)[]): void {
    if (node === null || node === undefined) return;
    if (typeof node === "number") {
      if (Number.isFinite(node)) {
        out.push({ path, value: node, label: lastFieldName(parents) });
      }
      return;
    }
    if (typeof node === "string") {
      const parsed = parseNumericString(node);
      if (parsed !== null) {
        out.push({
          path,
          value: parsed,
          rawToken: node,
          label: lastFieldName(parents),
        });
      }
      return;
    }
    if (typeof node === "boolean") return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        recurse(node[i], pushPathSegment(path, i), [...parents, i]);
      }
      return;
    }
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        recurse(v, pushPathSegment(path, k), [...parents, k]);
      }
    }
  }

  recurse(root, "", []);
  return out;
}
