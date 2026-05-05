/**
 * White-label tenant configuration (Task #571 — M1 of WHITE_LABEL_STRATEGY).
 *
 * The shape below is *forward-compatible* with M2–M5 consumers (PDF
 * exporters, workbook exporters, SEO head, mailer, footer/legal). M1
 * itself wires up only the resolver — no consumer reads any of these
 * fields yet, so adding a tenant cannot change observable behaviour.
 *
 * Anticipated consumers (deferred to later milestones):
 *   - M2: artifacts/api-server/src/lib/pdf-utils.ts BRAND constant
 *         → `theme.pdfPalette`
 *   - M2: artifacts/api-server/src/lib/workbook-helpers.ts ARGB tokens
 *         → `theme.workbookPalette`
 *   - M2: artifacts/school-financial-model logo refs in Navbar/Footer
 *         + favicon set + manifest → `assets.*`
 *   - M3: artifacts/school-financial-model/src/components/SEOHead.tsx
 *         module constants → `seo.*`
 *   - M4: artifacts/api-server/src/lib/mailer.ts EMAIL_FROM / template
 *         HTML → `email.*` and `productName` / `companyName`
 *   - M5: consultant-engine SchoolStack Space references → `crossProducts`
 *
 * If a consumer needs a field that is not on this type, add it here
 * (and to the `schoolstack` registry entry) before refactoring the
 * consumer — never branch product behaviour on `tenant.slug`.
 */

/** Lowercase, URL-safe slug (the registry key). */
export type TenantSlug = string;

/** 6-digit hex colour with leading `#`, e.g. `#328555`. */
export type HexColor = string;

/** 8-digit ARGB hex (no `#`), e.g. `FF1E293B`. ExcelJS palette format. */
export type ArgbColor = string;

/**
 * Palette consumed by `artifacts/api-server/src/lib/pdf-utils.ts`'s
 * `BRAND` constant. Keys mirror that constant 1:1 so the eventual M2
 * refactor is a straight rename, not a redesign.
 */
export interface PdfPalette {
  green: HexColor;
  navy: HexColor;
  teal: HexColor;
  amber: HexColor;
  cream: HexColor;
  white: HexColor;
  lightGray: HexColor;
  gray: HexColor;
  darkGray: HexColor;
  red: HexColor;
  black: HexColor;
}

/**
 * Palette consumed by `artifacts/api-server/src/lib/workbook-helpers.ts`.
 * ARGB (8-char hex, no leading `#`) is the format ExcelJS expects. Keys
 * mirror the existing exported constants in that file.
 */
export interface WorkbookPalette {
  navy: ArgbColor;
  white: ArgbColor;
  lightGray: ArgbColor;
  greenBg: ArgbColor;
  redBg: ArgbColor;
  amberBg: ArgbColor;
  teal: ArgbColor;
  evergreen: ArgbColor;
  cream: ArgbColor;
  dashboardGreen: ArgbColor;
}

/**
 * Web-side design tokens. The hex values currently live as raw literals
 * across ~25 frontend files plus `index.css`. M2 will move them behind
 * `:root[data-tenant="..."]` CSS vars sourced from this block.
 */
export interface WebPalette {
  primary: HexColor;
  brand: HexColor;
  accent: HexColor;
  amber: HexColor;
  cream: HexColor;
  navy: HexColor;
  dashboardGreen: HexColor;
}

export interface TenantTheme {
  web: WebPalette;
  pdfPalette: PdfPalette;
  workbookPalette: WorkbookPalette;
}

/**
 * Asset paths are stored as URL paths relative to the web artifact's
 * `public/` directory (so the M2 refactor can resolve them with
 * `${import.meta.env.BASE_URL}${assets.logo}`).
 */
export interface TenantAssets {
  logo: string;
  logoWhite: string;
  mark: string;
  favicon: string;
  ogImage: string;
}

export interface TenantSeo {
  siteName: string;
  baseUrl: string;
  defaultTitle: string;
  defaultDescription: string;
}

export interface TenantEmail {
  fromAddress: string;
  adminEmails: readonly string[];
  replyTo?: string;
}

export interface TenantLegal {
  /** e.g. "Building Hope Impact Fund". Used in footer + privacy + terms. */
  legalEntity: string;
  /**
   * Whether to show a "powered by SchoolStack" footer line. Default
   * tenant has this off (it *is* SchoolStack); future tenants opt in.
   */
  poweredBy: boolean;
}

/**
 * Cross-product nudge flags. M5 will gate marketing references in
 * `consultant-engine.ts` and the micro-lessons sign-off on these.
 */
export type CrossProduct = "space" | "lending-lab";

export interface TenantConfig {
  /** Registry key. Lowercase, URL-safe. */
  slug: TenantSlug;
  /** Hostnames (without protocol) that resolve to this tenant. */
  hosts: readonly string[];
  /** "SchoolStack Budget" — the user-facing product name. */
  productName: string;
  /** "SchoolStack.ai" — the operating company name. */
  companyName: string;
  /** Used as the "— SchoolStack Team" sign-off in micro-lessons / email. */
  editorialName: string;
  email: TenantEmail;
  seo: TenantSeo;
  theme: TenantTheme;
  assets: TenantAssets;
  legal: TenantLegal;
  crossProducts: readonly CrossProduct[];
}
