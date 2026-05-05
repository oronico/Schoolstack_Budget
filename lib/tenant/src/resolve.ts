import type { TenantConfig } from "./types.js";
import { findTenantByHost, getDefaultTenant, getTenant } from "./registry.js";

/**
 * Pure resolver shared by the Express middleware and the React provider.
 *
 * Resolution precedence (first match wins):
 *   1. `override` slug (used for `X-Tenant` header on the server and the
 *      `?tenant=` query / `localStorage.tenant` override on the client) —
 *      only honoured when not in production OR when `allowOverride` is
 *      explicitly true. Production middleware passes `false` so a hostile
 *      header can't switch tenants on real traffic.
 *   2. hostname → tenant lookup
 *   3. default tenant
 *
 * Always returns a valid tenant; never returns null. This is what makes
 * M1 a no-op for existing traffic — every legacy hostname falls through
 * to the default `schoolstack` tenant.
 */
export interface ResolveOptions {
  /** Hostname (no protocol/port). Falsy values are ignored. */
  host?: string | null;
  /** Slug override candidate (header / query / storage). */
  override?: string | null;
  /** Whether to honour `override` (default false in production). */
  allowOverride?: boolean;
}

export interface ResolveResult {
  tenant: TenantConfig;
  /** Where this resolution came from — useful for logging / debugging. */
  source: "override" | "host" | "default";
}

export function resolveTenant(opts: ResolveOptions): ResolveResult {
  if (opts.allowOverride && opts.override) {
    const overridden = getTenant(opts.override.trim().toLowerCase());
    if (overridden) {
      return { tenant: overridden, source: "override" };
    }
  }

  if (opts.host) {
    const byHost = findTenantByHost(opts.host);
    if (byHost) {
      return { tenant: byHost, source: "host" };
    }
  }

  return { tenant: getDefaultTenant(), source: "default" };
}
