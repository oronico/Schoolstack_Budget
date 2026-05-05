import type {
  ArgbColor,
  HexColor,
  TenantConfig,
} from "./types.js";
import { DEFAULT_TENANT_SLUG, listTenants } from "./registry.js";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const ARGB_RE = /^[0-9A-Fa-f]{8}$/;
// Conservative: must contain a single `@`, a `.` in the domain, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const HTTPS_URL_RE = /^https?:\/\/[^\s]+$/;

/**
 * Validates a single tenant config. Returns a list of human-readable
 * error messages (empty array = valid). Used both at startup (logged
 * warning) and in the CI unit test (fails the build on any error).
 */
export function validateTenant(t: TenantConfig): string[] {
  const errors: string[] = [];
  const where = (path: string) => `tenant "${t.slug}" → ${path}`;

  if (!SLUG_RE.test(t.slug)) {
    errors.push(`${where("slug")}: must match ${SLUG_RE} (got ${JSON.stringify(t.slug)})`);
  }

  if (!Array.isArray(t.hosts) || t.hosts.length === 0) {
    errors.push(`${where("hosts")}: at least one host required`);
  } else {
    for (const h of t.hosts) {
      if (typeof h !== "string" || !h.trim() || /\s/.test(h) || h.includes("://") || h.includes("/")) {
        errors.push(`${where("hosts")}: invalid hostname ${JSON.stringify(h)} (no protocol, path, or whitespace)`);
      }
    }
  }

  for (const field of ["productName", "companyName", "editorialName"] as const) {
    if (typeof t[field] !== "string" || !t[field].trim()) {
      errors.push(`${where(field)}: required non-empty string`);
    }
  }

  // --- email ---
  if (!EMAIL_RE.test(t.email.fromAddress)) {
    errors.push(`${where("email.fromAddress")}: invalid email ${JSON.stringify(t.email.fromAddress)}`);
  }
  if (!Array.isArray(t.email.adminEmails) || t.email.adminEmails.length === 0) {
    errors.push(`${where("email.adminEmails")}: at least one admin email required`);
  } else {
    for (const a of t.email.adminEmails) {
      if (!EMAIL_RE.test(a)) {
        errors.push(`${where("email.adminEmails")}: invalid email ${JSON.stringify(a)}`);
      }
    }
  }
  if (t.email.replyTo !== undefined && !EMAIL_RE.test(t.email.replyTo)) {
    errors.push(`${where("email.replyTo")}: invalid email ${JSON.stringify(t.email.replyTo)}`);
  }

  // --- seo ---
  for (const field of ["siteName", "defaultTitle", "defaultDescription"] as const) {
    if (typeof t.seo[field] !== "string" || !t.seo[field].trim()) {
      errors.push(`${where(`seo.${field}`)}: required non-empty string`);
    }
  }
  if (!HTTPS_URL_RE.test(t.seo.baseUrl)) {
    errors.push(`${where("seo.baseUrl")}: must be an http(s) URL (got ${JSON.stringify(t.seo.baseUrl)})`);
  } else if (t.seo.baseUrl.endsWith("/")) {
    errors.push(`${where("seo.baseUrl")}: must not end with a trailing slash (got ${JSON.stringify(t.seo.baseUrl)})`);
  }

  // --- theme ---
  pushHexErrors(errors, t.theme.web as unknown as Record<string, HexColor>, where, "theme.web");
  pushHexErrors(errors, t.theme.pdfPalette as unknown as Record<string, HexColor>, where, "theme.pdfPalette");
  pushArgbErrors(errors, t.theme.workbookPalette as unknown as Record<string, ArgbColor>, where, "theme.workbookPalette");

  // --- assets ---
  for (const [k, v] of Object.entries(t.assets)) {
    if (typeof v !== "string" || !v.startsWith("/")) {
      errors.push(`${where(`assets.${k}`)}: must be a public-relative path starting with "/" (got ${JSON.stringify(v)})`);
    }
  }

  // --- legal ---
  if (typeof t.legal.legalEntity !== "string" || !t.legal.legalEntity.trim()) {
    errors.push(`${where("legal.legalEntity")}: required non-empty string`);
  }
  if (typeof t.legal.poweredBy !== "boolean") {
    errors.push(`${where("legal.poweredBy")}: must be a boolean`);
  }

  // --- crossProducts ---
  if (!Array.isArray(t.crossProducts)) {
    errors.push(`${where("crossProducts")}: must be an array`);
  }

  return errors;
}

function pushHexErrors(
  errors: string[],
  obj: Record<string, HexColor>,
  where: (path: string) => string,
  prefix: string,
) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string" || !HEX_RE.test(v)) {
      errors.push(`${where(`${prefix}.${k}`)}: must be #RRGGBB hex (got ${JSON.stringify(v)})`);
    }
  }
}

function pushArgbErrors(
  errors: string[],
  obj: Record<string, ArgbColor>,
  where: (path: string) => string,
  prefix: string,
) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string" || !ARGB_RE.test(v)) {
      errors.push(`${where(`${prefix}.${k}`)}: must be 8-char ARGB hex with no "#" (got ${JSON.stringify(v)})`);
    }
  }
}

/**
 * Validates the entire registry. Asserts (a) every tenant passes
 * `validateTenant`, (b) the default slug actually resolves, (c) no two
 * tenants claim the same hostname.
 */
export function validateRegistry(): string[] {
  const errors: string[] = [];
  const tenants = listTenants();

  if (tenants.length === 0) {
    errors.push("registry: empty (must contain at least the default tenant)");
    return errors;
  }

  let foundDefault = false;
  const hostOwners = new Map<string, string>();

  for (const t of tenants) {
    errors.push(...validateTenant(t));
    if (t.slug === DEFAULT_TENANT_SLUG) foundDefault = true;
    for (const h of t.hosts) {
      const key = h.trim().toLowerCase();
      const prev = hostOwners.get(key);
      if (prev && prev !== t.slug) {
        errors.push(`registry: hostname "${key}" claimed by both "${prev}" and "${t.slug}"`);
      }
      hostOwners.set(key, t.slug);
    }
  }

  if (!foundDefault) {
    errors.push(`registry: default tenant "${DEFAULT_TENANT_SLUG}" not present`);
  }

  return errors;
}
