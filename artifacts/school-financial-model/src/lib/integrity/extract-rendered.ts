/**
 * Task #930 / M2 — Render-based component extractor.
 *
 * Companion to the props-state walker in
 * `artifacts/api-server/src/lib/integrity/extract/component-state.ts`.
 * That walker emits a SUPERSET of what gets rendered (every leaf in
 * the typed props, regardless of view logic); this extractor renders
 * the React component into a jsdom tree and emits one
 * `ExtractedValue` per numeric token that actually appears on screen.
 *
 * Together the two surfaces give M5 the diff needed to detect:
 *   - server-side "shipped but not shown" leaves    (props ⊃ rendered)
 *   - client-side "shown but not on the wire"        (rendered ⊄ props)
 * which is the failure mode the props-walk alone could not catch.
 *
 * Location format: `<testid-or-tag>[<index>]:t<tokenIndex>` — a
 * stable, human-readable cursor into the rendered tree. Token index
 * is the 1-based numeric-token offset within the text node.
 *
 * The `ExtractedValue` shape is re-declared here (rather than imported
 * across artifact boundaries) so SFM does not have to depend on
 * api-server. The shape MUST match
 * `artifacts/api-server/src/lib/integrity/extract/types.ts`; the
 * mirror is enforced by a type assertion in the smoke test below.
 */

const TOKEN_RE = new RegExp(
  [
    "-?\\$\\s?-?[\\d,]+(?:\\.\\d+)?\\s?[KMB]?",
    "-?[\\d,]+(?:\\.\\d+)?\\s?%",
    "-?[\\d,]+(?:\\.\\d+)?\\s?x",
    "-?[\\d,]+(?:\\.\\d+)?\\s?(?:months?|mo)\\b",
    "-?[\\d,]+(?:\\.\\d+)?",
  ].join("|"),
  "gi",
);

const CURRENCY_RE = /^-?\$?\s*-?[\d,]+(?:\.\d+)?\s*[KMB]?$/i;
const PERCENT_RE = /^-?[\d,]+(?:\.\d+)?\s*%$/;
const RATIO_RE = /^-?[\d,]+(?:\.\d+)?\s*x$/i;
const MONTHS_RE = /^-?[\d,]+(?:\.\d+)?\s*(?:mo|months?)$/i;
const BARE_NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;

function parseNumericString(s: string): number | null {
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

export interface ExtractedValue {
  surface: "workbook" | "pdf" | "component-state" | "json-export" | "rendered";
  producer: string;
  location: string;
  value: number;
  rawToken?: string;
  label?: string;
}

function nodeAnchor(el: Element, indexInParent: number): string {
  const testid = el.getAttribute("data-testid");
  if (testid) return testid;
  const tag = el.tagName.toLowerCase();
  return `${tag}[${indexInParent}]`;
}

function ancestorLabel(textNode: Text): string | undefined {
  // Best-effort: walk up looking for an aria-label, data-label, or a
  // preceding sibling whose text is non-numeric. This mirrors how a
  // sighted reader would associate a printed value with its label.
  let cur: Element | null = textNode.parentElement;
  while (cur) {
    const aria = cur.getAttribute("aria-label");
    if (aria && aria.trim().length > 0) return aria.trim();
    const dataLabel = cur.getAttribute("data-label");
    if (dataLabel && dataLabel.trim().length > 0) return dataLabel.trim();
    // Look at previous sibling text for a row-label / heading.
    let sib: Element | null = cur.previousElementSibling;
    while (sib) {
      const txt = (sib.textContent ?? "").trim();
      if (txt.length > 0 && txt.length <= 80 && parseNumericString(txt) === null) {
        return txt;
      }
      sib = sib.previousElementSibling;
    }
    cur = cur.parentElement;
  }
  return undefined;
}

export interface ExtractRenderedOptions {
  componentName: string;
  /** If true, skip text nodes inside <script>/<style>/<svg> subtrees.
   *  Defaults to true. */
  skipNonContent?: boolean;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "SVG", "PATH", "DEFS"]);

export function extractRendered(
  root: Element,
  opts: ExtractRenderedOptions,
): ExtractedValue[] {
  const out: ExtractedValue[] = [];
  const skipNonContent = opts.skipNonContent !== false;
  const seenLocations = new Set<string>();

  function walk(el: Element, indexInParent: number, pathChain: string[]): void {
    if (skipNonContent && SKIP_TAGS.has(el.tagName)) return;
    const anchor = nodeAnchor(el, indexInParent);
    const nextChain = [...pathChain, anchor];
    let childIndex = 0;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const text = (child.textContent ?? "");
        const matches = Array.from(text.matchAll(TOKEN_RE));
        if (matches.length === 0) continue;
        for (let t = 0; t < matches.length; t++) {
          const raw = matches[t][0];
          const parsed = parseNumericString(raw);
          if (parsed === null) continue;
          let location = `${nextChain.join(">")}:t${t + 1}`;
          // De-duplicate if jsdom hands us two children with the same
          // anchor (rare; happens when a parent has multiple
          // identically-tagged children we collapsed).
          let suffix = 0;
          while (seenLocations.has(location)) {
            suffix++;
            location = `${nextChain.join(">")}:t${t + 1}#${suffix}`;
          }
          seenLocations.add(location);
          out.push({
            surface: "rendered",
            producer: opts.componentName,
            location,
            value: parsed,
            rawToken: raw,
            label: ancestorLabel(child as Text),
          });
        }
      } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
        walk(child as Element, childIndex, nextChain);
        childIndex++;
      }
    }
  }

  walk(root, 0, []);
  return out;
}
