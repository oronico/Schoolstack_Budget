/**
 * React `TenantProvider` + `useTenant()` hook.
 *
 * Resolution mirrors the server middleware: hostname-based with a
 * dev-only override. The override sources, in order, are:
 *   1. `?tenant=<slug>` query param (one-shot — also persisted to
 *      `localStorage` so subsequent navigations keep the override)
 *   2. `localStorage.tenant`
 *
 * In production builds (`import.meta.env.PROD`), overrides are ignored
 * — only the hostname matters, exactly like the Express middleware in
 * production mode. This keeps M1 a no-op on real traffic and prevents
 * a tenant switch via a crafted URL param after launch.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TenantConfig } from "./types.js";
import { resolveTenant, type ResolveResult } from "./resolve.js";

interface TenantContextValue {
  tenant: TenantConfig;
  source: ResolveResult["source"];
}

const TenantContext = createContext<TenantContextValue | null>(null);

const OVERRIDE_STORAGE_KEY = "tenant";
const OVERRIDE_QUERY_PARAM = "tenant";

function getClientOverride(allowOverride: boolean): string | null {
  if (!allowOverride) return null;
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get(OVERRIDE_QUERY_PARAM);
    if (fromQuery) {
      // Persist so the override survives client-side navigations that
      // strip the query string (e.g. wouter's setLocation).
      try {
        window.localStorage.setItem(OVERRIDE_STORAGE_KEY, fromQuery);
      } catch {
        // localStorage may be disabled (private mode, sandboxed iframe)
        // — fall through and just use the in-memory value.
      }
      return fromQuery;
    }
  } catch {
    // URLSearchParams should not throw, but guard against exotic envs.
  }

  try {
    return window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getClientHost(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.hostname || null;
}

export interface TenantProviderProps {
  children: ReactNode;
  /**
   * Override the resolution inputs. Used in tests so they don't depend
   * on `window.location` or `localStorage`.
   */
  overrideValue?: TenantConfig;
}

export function TenantProvider({ children, overrideValue }: TenantProviderProps) {
  const value = useMemo<TenantContextValue>(() => {
    if (overrideValue) {
      return { tenant: overrideValue, source: "override" };
    }

    // Vite injects `import.meta.env.PROD`; treat any non-true value as
    // dev so this also works in non-Vite test runners.
    const isProd = ((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD) === true;
    const allowOverride = !isProd;

    const result = resolveTenant({
      host: getClientHost(),
      override: getClientOverride(allowOverride),
      allowOverride,
    });
    return { tenant: result.tenant, source: result.source };
  }, [overrideValue]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used inside <TenantProvider>");
  }
  return ctx.tenant;
}

export function useTenantSource(): ResolveResult["source"] {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantSource must be used inside <TenantProvider>");
  }
  return ctx.source;
}
