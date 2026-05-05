import type { TenantConfig, TenantSlug } from "./types.js";

/**
 * The `schoolstack` tenant captures *today's* hardcoded brand. Until
 * M2–M5 land, no consumer reads from this object — the registry exists
 * so M2+ refactors can flip from module-level constants to
 * `useTenant().theme.pdfPalette` (etc.) without re-deriving values.
 *
 * Source-of-truth references when populating these fields (kept here so
 * a future contributor changing the brand can find every call site):
 *   - PDF palette  → artifacts/api-server/src/lib/pdf-utils.ts L5–18
 *   - Workbook palette → artifacts/api-server/src/lib/workbook-helpers.ts L20–34
 *   - Web HSL tokens → artifacts/school-financial-model/src/index.css L68/72/83
 *   - SEO constants → artifacts/school-financial-model/src/components/SEOHead.tsx L3–8
 *   - Email from   → artifacts/api-server/.env.example (EMAIL_FROM)
 *   - Legal entity → artifacts/school-financial-model/src/components/layout/Footer.tsx L66
 */
const SCHOOLSTACK: TenantConfig = {
  slug: "schoolstack",
  hosts: ["budget.schoolstack.ai"],
  productName: "SchoolStack Budget",
  companyName: "SchoolStack.ai",
  editorialName: "SchoolStack Team",
  email: {
    fromAddress: "noreply@schoolstack.ai",
    adminEmails: ["admin@schoolstack.ai"],
  },
  seo: {
    siteName: "SchoolStack Budget",
    baseUrl: "https://budget.schoolstack.ai",
    defaultTitle: "SchoolStack Budget - Your Mission Deserves a Financial Story",
    defaultDescription:
      "Build lender-ready 5-year financial projections for your school in under an hour. Guided, professional, exportable. No finance degree required.",
  },
  theme: {
    web: {
      primary: "#328555",
      brand: "#D97706",
      accent: "#0D9488",
      amber: "#D97706",
      cream: "#FAF9F7",
      navy: "#1E293B",
      dashboardGreen: "#16A34A",
    },
    pdfPalette: {
      green: "#16A34A",
      navy: "#1E293B",
      teal: "#0D9488",
      amber: "#D97706",
      cream: "#FAF9F7",
      white: "#FFFFFF",
      lightGray: "#F1F5F9",
      gray: "#94A3B8",
      darkGray: "#475569",
      red: "#E11D48",
      black: "#0F172A",
    },
    workbookPalette: {
      navy: "FF1E293B",
      white: "FFFFFFFF",
      lightGray: "FFE8EDF2",
      greenBg: "FFE8F5E9",
      redBg: "FFFCE4EC",
      amberBg: "FFFFF8E1",
      teal: "FF0D9488",
      evergreen: "FF328555",
      cream: "FFFAF9F7",
      dashboardGreen: "FF16A34A",
    },
  },
  assets: {
    logo: "/logos/schoolstack-budget.svg",
    logoWhite: "/logos/schoolstack-budget-white.svg",
    mark: "/logos/schoolstack-mark.svg",
    favicon: "/favicon.svg",
    ogImage: "/images/og-image.png",
  },
  legal: {
    legalEntity: "Building Hope Impact Fund",
    poweredBy: false,
  },
  crossProducts: ["space", "lending-lab"],
};

/**
 * The active registry. M1 ships with one entry only — the default
 * tenant. Subsequent tenants land in M6 (Chesterton) and beyond.
 *
 * Adding a tenant here without updating the M2–M5 consumers is *safe*:
 * nothing reads from the new entry until those refactors land.
 */
const REGISTRY: ReadonlyMap<TenantSlug, TenantConfig> = new Map([
  [SCHOOLSTACK.slug, SCHOOLSTACK],
]);

export const DEFAULT_TENANT_SLUG: TenantSlug = SCHOOLSTACK.slug;

export function getTenant(slug: TenantSlug | null | undefined): TenantConfig | undefined {
  if (!slug) return undefined;
  return REGISTRY.get(slug);
}

export function getDefaultTenant(): TenantConfig {
  const t = REGISTRY.get(DEFAULT_TENANT_SLUG);
  // The validation gate (`validateRegistry`) guarantees the default slug
  // resolves; this branch only fires if someone deletes the default
  // tenant from the registry, which the unit test will catch in CI.
  if (!t) {
    throw new Error(
      `[tenant] Default tenant "${DEFAULT_TENANT_SLUG}" missing from registry`,
    );
  }
  return t;
}

export function listTenants(): readonly TenantConfig[] {
  return Array.from(REGISTRY.values());
}

/** Reverse lookup: hostname → tenant. Case-insensitive, port-insensitive. */
export function findTenantByHost(host: string | null | undefined): TenantConfig | undefined {
  if (!host) return undefined;
  const normalized = normalizeHost(host);
  if (!normalized) return undefined;
  for (const tenant of REGISTRY.values()) {
    if (tenant.hosts.some((h) => normalizeHost(h) === normalized)) {
      return tenant;
    }
  }
  return undefined;
}

/** Strip protocol, port, trailing dot, lowercase. Returns "" for blank input. */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (!h) return "";
  // Drop protocol if a full URL was passed by mistake.
  const protoIdx = h.indexOf("://");
  if (protoIdx >= 0) h = h.slice(protoIdx + 3);
  // Drop path/query.
  const slashIdx = h.indexOf("/");
  if (slashIdx >= 0) h = h.slice(0, slashIdx);
  // Drop port.
  const colonIdx = h.indexOf(":");
  if (colonIdx >= 0) h = h.slice(0, colonIdx);
  // Drop trailing dot (FQDN canonical form).
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}
