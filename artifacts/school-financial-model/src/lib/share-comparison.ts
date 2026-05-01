// URL-hash codec for the Scenarios-page "Compare decisions side-by-side"
// picker. Encodes the chosen 2-4 saved decision keys (each is a
// `${name}|${createdAt}` composite) into a `#compare=…` fragment so a
// founder can paste a link in Slack/email and have the recipient land on
// the exact comparison they were looking at.
//
// Why a separate helper from `whatif-engine`'s codec?
//  - This one carries opaque scenario keys, not WhatIf overrides — they
//    travel together on the same page, but they never overlap.
//  - We re-use the URL hash so the link survives a hard reload and works
//    without any server round-trip, mirroring the What-If quick-share UX.
//
// Format: `compare=<encKey1>,<encKey2>[,<encKey3>[,<encKey4>]]`
//  - Each key is URI-encoded so any character (`|`, commas in scenario
//    names, unicode) round-trips safely. `encodeURIComponent` escapes `,`
//    as `%2C`, so splitting the payload on `,` is unambiguous.
//  - Empty / blank keys are dropped on encode; duplicates are preserved
//    (the picker dedupes/warns separately so we don't silently change
//    which columns get rendered).

const HASH_KEY = "compare";

// Hard ceiling matching `MAX_DECISION_COMPARE` in the scenarios page —
// we trim oversized payloads on decode so a malformed link can't push
// the picker past its column palette. Keep these in sync if either side
// ever raises the cap.
export const MAX_COMPARE_KEYS = 4;

export function encodeCompareKeysToHash(keys: string[]): string {
  const cleaned = keys
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter((k) => k.length > 0)
    .slice(0, MAX_COMPARE_KEYS);
  if (cleaned.length === 0) return "";
  return `${HASH_KEY}=${cleaned.map((k) => encodeURIComponent(k)).join(",")}`;
}

export function decodeCompareKeysFromHash(hash: string): string[] {
  if (!hash) return [];
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return [];
  // Allow the codec to coexist with other hash params (e.g. `whatif=…`)
  // separated by `&`, so a single URL can deep-link to multiple surfaces.
  for (const seg of trimmed.split("&")) {
    if (!seg.startsWith(`${HASH_KEY}=`)) continue;
    const payload = seg.slice(HASH_KEY.length + 1);
    if (!payload) return [];
    const out: string[] = [];
    for (const piece of payload.split(",")) {
      if (!piece) continue;
      try {
        const decoded = decodeURIComponent(piece);
        if (decoded) out.push(decoded);
      } catch {
        // Malformed escape sequence — skip this key but keep the rest.
        // A garbled key would just fail to match a saved scenario anyway.
        continue;
      }
      if (out.length >= MAX_COMPARE_KEYS) break;
    }
    return out;
  }
  return [];
}

// Builds the absolute URL a founder copies to clipboard. Preserves the
// current pathname + search so any active filters / sort state on the
// scenarios page (`?outcome=pursued&sort=status`) travel with the link.
export function buildCompareShareUrl(
  keys: string[],
  loc: { origin: string; pathname: string; search: string } = window.location,
): string {
  const hash = encodeCompareKeysToHash(keys);
  const base = `${loc.origin}${loc.pathname}${loc.search}`;
  return hash ? `${base}#${hash}` : base;
}
