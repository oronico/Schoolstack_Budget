/**
 * Express middleware that attaches `req.tenant` from hostname (with an
 * `X-Tenant` header override accepted only in non-production).
 *
 * Mounted in `artifacts/api-server/src/app.ts`. M1: nothing downstream
 * reads `req.tenant` yet, so this middleware is observably a no-op —
 * but the type augmentation lets M2+ consumers type-check their reads
 * against the resolver instead of the tenant object literal.
 */
import type { NextFunction, Request, Response } from "express";
import type { TenantConfig } from "./types.js";
import { resolveTenant, type ResolveResult } from "./resolve.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant: TenantConfig;
      tenantSource: ResolveResult["source"];
    }
  }
}

export interface TenantMiddlewareOptions {
  /**
   * Whether to honour the `X-Tenant` header. Defaults to:
   *   - `false` in production
   *   - `true` everywhere else
   * Tests can pass `true` explicitly to force the override on, or
   * `false` to test production-like resolution locally.
   */
  allowHeaderOverride?: boolean;
  /**
   * Header name that carries the override slug. Defaults to `X-Tenant`.
   */
  headerName?: string;
}

export function tenantMiddleware(opts: TenantMiddlewareOptions = {}) {
  const headerName = (opts.headerName ?? "X-Tenant").toLowerCase();
  const isProd = process.env.NODE_ENV === "production";
  const allowOverride = opts.allowHeaderOverride ?? !isProd;

  return function tenantMiddlewareHandler(req: Request, _res: Response, next: NextFunction) {
    // Express normalizes header names to lowercase on `req.headers`.
    const headerValue = req.headers[headerName];
    const override = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    // `req.hostname` strips the port already, but skip `req.get('host')`
    // because it includes `:8080` and friends.
    const host = req.hostname || null;

    const result = resolveTenant({
      host,
      override: override ?? null,
      allowOverride,
    });

    req.tenant = result.tenant;
    req.tenantSource = result.source;
    next();
  };
}
