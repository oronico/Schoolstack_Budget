import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Render `text` with every (case-insensitive) occurrence of `query` wrapped in
 * a highlight `<mark>` span. Designed for the staffing quick-finder (Task #346)
 * and the saved-scenario card search — both flows want the same visual cue
 * (bolded + tinted background) so founders can see *why* a row matched the
 * filter without rescanning the card header.
 *
 * - When `query` is empty/whitespace, returns the original `text` unchanged.
 * - When the query does not appear in `text`, returns the original `text`
 *   unchanged (the caller is responsible for deciding whether to render the
 *   row at all).
 * - The match is case-insensitive but preserves the source text's casing
 *   inside the highlight, so "Lead Math Teacher" + query "math" highlights
 *   the original "Math" not "math".
 *
 * The wrapper element is a `<mark>` with `data-testid="match-highlight"` so
 * e2e tests can assert that the visual emphasis actually rendered.
 */
export function highlightMatch(
  text: string,
  query: string,
  className?: string,
): ReactNode {
  if (!text) return text;
  const trimmed = query.trim();
  if (trimmed.length === 0) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  if (!lowerText.includes(lowerQuery)) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, cursor);
  let key = 0;
  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }
    const end = matchIndex + lowerQuery.length;
    parts.push(
      <mark
        key={`m-${key++}`}
        data-testid="match-highlight"
        className={cn(
          "rounded-[3px] bg-primary/20 text-foreground font-semibold px-0.5",
          className,
        )}
      >
        {text.slice(matchIndex, end)}
      </mark>,
    );
    cursor = end;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}
