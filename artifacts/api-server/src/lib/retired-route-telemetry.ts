import type { Request } from "express";
import { trackEvent } from "./track-event";
import { verifyTokenStrict } from "../middlewares/auth";

function classifyIp(rawIp: string | undefined): "loopback" | "private" | "public" | "unknown" {
  if (!rawIp) return "unknown";
  const ip = rawIp.replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.")) return "loopback";
  if (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  ) {
    return "private";
  }
  return "public";
}

function truncate(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > max ? value.slice(0, max) : value;
}

// Resolve the request's auth state without coupling the retired-route
// stubs to the strict authMiddleware (these endpoints were always
// unauthenticated, so we still want to serve the 410 either way). We
// distinguish between "no header", "header but signature/claim/db check
// failed" (likely an expired or revoked token from a legitimate prior
// caller — useful signal!), and "valid session". Header parsing failures
// never break the response — the helper always resolves.
async function resolveAuthState(req: Request): Promise<"none" | "invalid" | "valid"> {
  const header = req.headers["authorization"];
  if (typeof header !== "string" || header.length === 0) return "none";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !match[1]) return "invalid";
  try {
    const result = await verifyTokenStrict(match[1]);
    return result.ok ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

export async function logRetiredPublicRouteHit(req: Request, route: string): Promise<void> {
  const headers = req.headers;
  const authState = await resolveAuthState(req);
  const requestId =
    truncate(headers["x-request-id"], 128) ?? truncate(headers["x-amzn-trace-id"], 128);
  const metadata = {
    route,
    method: req.method,
    timestamp: new Date().toISOString(),
    requestId,
    userAgent: truncate(headers["user-agent"], 256),
    referer: truncate(headers["referer"] ?? headers["referrer"], 256),
    origin: truncate(headers["origin"], 256),
    ipClass: classifyIp(req.ip),
    authState,
  };
  console.warn(`[retired-public-route] ${route}`, metadata);
  void trackEvent("retired_public_route_hit", null, metadata);
}
