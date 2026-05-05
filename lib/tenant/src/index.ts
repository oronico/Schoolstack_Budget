export type {
  ArgbColor,
  CrossProduct,
  HexColor,
  PdfPalette,
  TenantAssets,
  TenantConfig,
  TenantEmail,
  TenantLegal,
  TenantSeo,
  TenantSlug,
  TenantTheme,
  WebPalette,
  WorkbookPalette,
} from "./types.js";

export {
  DEFAULT_TENANT_SLUG,
  findTenantByHost,
  getDefaultTenant,
  getTenant,
  listTenants,
  normalizeHost,
} from "./registry.js";

export {
  resolveTenant,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve.js";

export { validateRegistry, validateTenant } from "./validate.js";
