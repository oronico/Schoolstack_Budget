/**
 * Restricted-vs-unrestricted revenue classification (Task #610).
 *
 * Restricted revenue = donor or grant gifts the school cannot legally spend
 * on general operations (capital campaigns, program-restricted gifts,
 * scholarship funds, etc.). Lenders treat restricted cash as unavailable
 * for debt service or operating runway, so this layer pulls those rows out
 * of the "operating cash" flow even though they still appear in total
 * revenue on the P&L.
 *
 * A row is restricted when:
 *   - `isRestricted === true` (founder override on the wizard), OR
 *   - its `id` starts with `restricted_` (the default `restricted_capital`,
 *     `restricted_program`, `restricted_scholarship`, `restricted_other`
 *     line items shipped from `revenue-defaults.ts`).
 *
 * Anything else — including unrestricted philanthropy, unrestricted board
 * giving, individual donations — is treated as unrestricted by default so
 * legacy models migrate without surprises.
 */

interface RestrictedRowLike {
  id?: string;
  isRestricted?: boolean;
}

export function isRestrictedRevenueRow(row: RestrictedRowLike): boolean {
  if (row.isRestricted === true) return true;
  if (row.isRestricted === false) return false;
  const id = row.id ?? "";
  return id.startsWith("restricted_");
}
