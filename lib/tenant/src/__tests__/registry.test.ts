/**
 * Task #571 — CI gate for the tenant registry.
 *
 * Asserts:
 *   1. `validateRegistry()` returns no errors against the live registry
 *      (catches bad hex/email/slug/host on every PR before deploy).
 *   2. `validateTenant()` actually catches each documented bad input
 *      (so the gate can't silently accept garbage if a future refactor
 *      breaks the validator itself).
 *   3. The hostname resolver round-trips: every registered host →
 *      correct tenant; unknown host → undefined; case/port-insensitive.
 *   4. `resolveTenant()` precedence is correct: override beats host
 *      beats default; override is ignored when `allowOverride` is false.
 */
import {
  DEFAULT_TENANT_SLUG,
  findTenantByHost,
  getDefaultTenant,
  getTenant,
  listTenants,
  normalizeHost,
  resolveTenant,
  validateRegistry,
  validateTenant,
  type TenantConfig,
} from "../index.js";

const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`  ✗ ${name}${detail ? "\n      " + detail : ""}`);
  }
}

function clone(t: TenantConfig): TenantConfig {
  return JSON.parse(JSON.stringify(t));
}

console.log("tenant/registry.test:");

// --- 1. live registry passes validation -------------------------------------
{
  const errors = validateRegistry();
  check(
    "validateRegistry(): live registry has zero errors",
    errors.length === 0,
    errors.join("\n      "),
  );
}

// --- 2. registry shape sanity -----------------------------------------------
{
  const tenants = listTenants();
  check("listTenants(): returns at least 1 tenant", tenants.length >= 1);
  check(
    `listTenants(): contains the default slug "${DEFAULT_TENANT_SLUG}"`,
    tenants.some((t) => t.slug === DEFAULT_TENANT_SLUG),
  );
  check(
    "getTenant(default): resolves",
    getTenant(DEFAULT_TENANT_SLUG)?.slug === DEFAULT_TENANT_SLUG,
  );
  check(
    "getTenant(unknown): returns undefined",
    getTenant("does-not-exist") === undefined,
  );
  check(
    "getTenant(null/undefined): returns undefined",
    getTenant(null) === undefined && getTenant(undefined) === undefined,
  );
}

// --- 3. validator actually catches bad data ---------------------------------
{
  const baseline = getDefaultTenant();
  check(
    "validateTenant(default): zero errors",
    validateTenant(baseline).length === 0,
  );

  const badSlug = clone(baseline);
  badSlug.slug = "Invalid Slug!";
  check(
    "validateTenant: rejects slug with capitals/spaces/punctuation",
    validateTenant(badSlug).some((e) => e.includes("slug")),
  );

  const badHex = clone(baseline);
  badHex.theme.pdfPalette.green = "16A34A"; // missing "#"
  check(
    "validateTenant: rejects hex without leading '#'",
    validateTenant(badHex).some((e) => e.includes("pdfPalette.green")),
  );

  const badArgb = clone(baseline);
  badArgb.theme.workbookPalette.navy = "FF1E29"; // wrong length
  check(
    "validateTenant: rejects ARGB token of wrong length",
    validateTenant(badArgb).some((e) => e.includes("workbookPalette.navy")),
  );

  const badEmail = clone(baseline);
  badEmail.email.fromAddress = "not-an-email";
  check(
    "validateTenant: rejects invalid fromAddress",
    validateTenant(badEmail).some((e) => e.includes("email.fromAddress")),
  );

  const badAdmin = clone(baseline);
  badAdmin.email.adminEmails = ["bad@", "ok@example.com"];
  check(
    "validateTenant: rejects malformed admin email",
    validateTenant(badAdmin).some((e) => e.includes("adminEmails")),
  );

  const badEmptyAdmin = clone(baseline);
  badEmptyAdmin.email.adminEmails = [];
  check(
    "validateTenant: rejects empty adminEmails",
    validateTenant(badEmptyAdmin).some((e) => e.includes("adminEmails")),
  );

  const badUrl = clone(baseline);
  badUrl.seo.baseUrl = "ftp://example.com";
  check(
    "validateTenant: rejects non-http(s) baseUrl",
    validateTenant(badUrl).some((e) => e.includes("seo.baseUrl")),
  );

  const trailingSlash = clone(baseline);
  trailingSlash.seo.baseUrl = "https://example.com/";
  check(
    "validateTenant: rejects baseUrl with trailing slash",
    validateTenant(trailingSlash).some((e) => e.includes("seo.baseUrl")),
  );

  const badHost = clone(baseline);
  badHost.hosts = ["https://example.com"]; // protocol leaked in
  check(
    "validateTenant: rejects hosts containing a protocol",
    validateTenant(badHost).some((e) => e.includes("hosts")),
  );

  const noHosts = clone(baseline);
  noHosts.hosts = [];
  check(
    "validateTenant: rejects empty hosts list",
    validateTenant(noHosts).some((e) => e.includes("hosts")),
  );

  const badAsset = clone(baseline);
  badAsset.assets.logo = "logos/relative.svg"; // missing leading '/'
  check(
    "validateTenant: rejects asset path missing leading '/'",
    validateTenant(badAsset).some((e) => e.includes("assets.logo")),
  );
}

// --- 4. host normalization + reverse lookup ---------------------------------
{
  const host = getDefaultTenant().hosts[0];
  if (!host) throw new Error("default tenant has no hosts to lookup");

  check(
    "findTenantByHost(exact): resolves to default",
    findTenantByHost(host)?.slug === DEFAULT_TENANT_SLUG,
  );
  check(
    "findTenantByHost(uppercased): case-insensitive",
    findTenantByHost(host.toUpperCase())?.slug === DEFAULT_TENANT_SLUG,
  );
  check(
    "findTenantByHost(host:port): port-insensitive",
    findTenantByHost(`${host}:8080`)?.slug === DEFAULT_TENANT_SLUG,
  );
  check(
    "findTenantByHost(https://host/path): protocol/path-insensitive",
    findTenantByHost(`https://${host}/some/path`)?.slug === DEFAULT_TENANT_SLUG,
  );
  check(
    "findTenantByHost(unknown): returns undefined",
    findTenantByHost("nonexistent.example") === undefined,
  );
  check(
    "findTenantByHost(empty/null): returns undefined",
    findTenantByHost("") === undefined && findTenantByHost(null) === undefined,
  );
  check(
    "normalizeHost: strips protocol/port/path/case",
    normalizeHost(`HTTPS://${host.toUpperCase()}:443/foo?x=1`) === host.toLowerCase(),
  );
}

// --- 5. resolveTenant precedence --------------------------------------------
{
  const host = getDefaultTenant().hosts[0]!;
  // host wins over default
  {
    const r = resolveTenant({ host });
    check("resolve: host match → source 'host'", r.source === "host");
  }
  // unknown host → default
  {
    const r = resolveTenant({ host: "nonexistent.example" });
    check(
      "resolve: unknown host → default tenant + source 'default'",
      r.tenant.slug === DEFAULT_TENANT_SLUG && r.source === "default",
    );
  }
  // override beats host when allowed
  {
    const r = resolveTenant({
      host: "nonexistent.example",
      override: DEFAULT_TENANT_SLUG,
      allowOverride: true,
    });
    check(
      "resolve: override honoured when allowOverride=true",
      r.tenant.slug === DEFAULT_TENANT_SLUG && r.source === "override",
    );
  }
  // override ignored when disallowed (production-like)
  {
    const r = resolveTenant({
      host,
      override: "does-not-exist",
      allowOverride: false,
    });
    check(
      "resolve: override ignored when allowOverride=false",
      r.tenant.slug === DEFAULT_TENANT_SLUG && r.source === "host",
    );
  }
  // unknown override slug falls through to host
  {
    const r = resolveTenant({
      host,
      override: "does-not-exist",
      allowOverride: true,
    });
    check(
      "resolve: unknown override slug falls through to host",
      r.tenant.slug === DEFAULT_TENANT_SLUG && r.source === "host",
    );
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} tenant-registry check(s) failed:`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`\ntenant/registry.test: all checks passed`);
