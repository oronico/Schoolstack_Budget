# White-Label Strategy: Per-Customer Fork vs Multi-Tenant Theming

**Status:** Discovery memo — recommendation only, no code committed.
**Author:** Engineering (Task #559)
**Audience:** Engineering + sales for the Chesterton and Wildflower conversations.
**Decision needed:** which strategy do we build out before we sign tenant #2.
**Out of scope:** shared-vs-isolated database choice (tracked separately), specific tenant branding choices, sales/contracting.

---

## TL;DR

Build **Path B (multi-tenant theming)** as a 3–4 engineer-week investment. At our current pipeline of two confirmed prospects (Chesterton + Wildflower), Path A is close to break-even on day one and clearly negative by tenant #3 because every fork doubles ongoing maintenance cost on the main branch. The deciding factor is **marginal cost per new tenant after the first one** (Path A: ~7–10 eng-days each, recurring; Path B: ~1–2 eng-days each, mostly DNS coordination).

The Chesterton preview stack we shipped in #558 (`docs/CHESTERTON_PREVIEW.md`) stays alive as the prospect-demo URL **during** the Path B build, then retires when M6 lands.

---

## 1. Branding inventory — what would have to change per tenant

The "SchoolStack Budget" brand is woven through the codebase in six layers, not three. The ripgrep counts below are source-only (excluding `node_modules`, `dist`, tests, `docs/`, `attached_assets/`, lockfiles, and build artifacts) and were taken on the current `main`.

### Layer 1 — Visual theme (design tokens)

| Where | What | Count |
|---|---|---|
| `artifacts/school-financial-model/src/index.css` lines 68/72/83 | HSL tokens `--primary 145 45% 36%`, `--brand 36 90% 44%`, `--accent 173 84% 29%` | 3 token defs |
| `artifacts/school-financial-model/index.html` line 8 | `<meta name="theme-color" content="#328555">` | 1 |
| `artifacts/school-financial-model/public/manifest.json` | `theme_color: "#328555"`, `background_color: "#FAF9F7"` | 2 |
| **`#328555`** (evergreen primary) — raw hex | Used directly in JSX/inline styles instead of CSS vars | **112 occurrences across 25 files** |
| **`#1E293B`** (navy) — also our text color, partly brand-specific | | **251 occurrences across 24 files** |
| `#0D9488` (teal accent) | | 28 occ / 13 files |
| `#D97706` (amber accent) | | 53 occ / 14 files |
| `#FAF9F7` (cream) | | 34 occ / 15 files |
| `#16A34A` (dashboard green) | | 5 occ / 4 files |
| `artifacts/api-server/src/lib/pdf-utils.ts` lines 5–18 | `BRAND` constant — 11 hex values for PDF rendering | 1 const, 11 colors |
| `artifacts/api-server/src/lib/workbook-helpers.ts` lines 20–34 | ARGB tokens (`NAVY`, `EVERGREEN`, `TEAL`, `DASHBOARD_GREEN`, etc.) imported into 6 export files | 1 const block, ~12 colors |

There is **no Tailwind config file** to centralize colors — Tailwind is configured inline through `index.css` only.

### Layer 2 — Chrome (logos, favicons, OG image)

| Path | File |
|---|---|
| `artifacts/school-financial-model/public/logos/` | `schoolstack-budget.svg`, `schoolstack-budget-white.svg`, `schoolstack-mark.svg`, `building-hope.png` |
| `artifacts/school-financial-model/public/` | `favicon.svg`, `images/favicon-{16,32,48,180,192,512}.png`, `images/apple-touch-icon.png`, `images/icon-512.png`, `images/og-image.png`, `images/hero-bg.png` |
| `artifacts/school-financial-model/src/components/layout/Navbar.tsx` line 199–202 | logo `<img>` + `aria-label="SchoolStack Budget - home"` + `alt="SchoolStack Budget"` |
| `artifacts/school-financial-model/src/components/layout/Footer.tsx` lines 12–13, 48–53, 66, 72 | budget-white.svg + Building Hope logo + entity copyright + `admin@schoolstack.ai` link |

**Total swap:** 4 brand logos + 9 favicon/icon variants + 1 OG image + 4 chrome string sites. Per tenant.

### Layer 3 — Copy, SEO, legal

| Path | What |
|---|---|
| `artifacts/school-financial-model/index.html` lines 6–32 | `<title>`, `<meta name="description">`, OG title/description/url/image/site_name (×4), Twitter card title/description/image (×3) |
| `artifacts/school-financial-model/src/components/SEOHead.tsx` lines 3–8 | 4 module constants: `SITE_NAME`, `BASE_URL = "https://budget.schoolstack.ai"`, `DEFAULT_TITLE`, `DEFAULT_DESCRIPTION` (consumed by every page wrapping `<SEOHead>`) |
| `public/manifest.json`, `public/robots.txt`, `public/sitemap.xml`, `public/google0d48f52284c404e6.html` | PWA + crawler/verification metadata |
| **13 page files** under `src/pages/**/*.tsx` | Hardcoded "SchoolStack Budget" or "SchoolStack" copy in body (`landing.tsx`, all 5 `auth/*.tsx`, both `legal/*.tsx`, `solutions/list.tsx`, `model-wizard/index.tsx`, `resources/article.tsx`, `shared/SharedModelPage.tsx`, `settings.tsx`) |
| `src/pages/legal/privacy.tsx` (×2), `legal/terms.tsx` (×1), `Footer.tsx` (×1) | `admin@schoolstack.ai` contact links |
| `src/components/layout/Footer.tsx` lines 53, 66 | **"Building Hope Impact Fund"** = the legal entity controlling the product — not just a brand string. Any tenant rebrand has to either keep this footer (acceptable for a "powered by" model) or get legal sign-off to hide it. |

### Layer 4 — Exports (PDF/XLSX) — the long tail

Every export footer, cover sheet, and document-metadata field carries `SchoolStack Budget` and/or `budget.schoolstack.ai`. Counts by file:

| File | "SchoolStack" mentions |
|---|---|
| `artifacts/api-server/src/lib/pdf-utils.ts` | 5 (Title/Author/Creator + 2 in-doc footers) |
| `artifacts/api-server/src/lib/excel-export.ts` | 8 (footer × 2 + creator + 4 cell values + report title) |
| `artifacts/api-server/src/lib/underwriting-export.ts` | 3 (footer + creator + bottom-of-sheet) |
| `artifacts/api-server/src/lib/underwriting-workbook.ts` | 3 (cover line 72, confidential footer line 117, prepared-by line 2749) |
| `artifacts/api-server/src/lib/workbook-helpers.ts` | 2 (oddFooter line 869 + bottom line 1529) |
| `artifacts/api-server/src/lib/formula-export.ts` | 5 (4 in-doc + creator + footer template) |
| `artifacts/api-server/src/lib/lender-proforma-export.ts` | 4 (header + 2 in-doc + creator) |
| `artifacts/api-server/src/lib/packets/build-decision-history.ts` | 1 |

All seven exporters need to read brand strings + colors from a tenant resolver instead of importing module-level constants.

### Layer 5 — Email

| Path | What | Tenant impact |
|---|---|---|
| `artifacts/api-server/src/lib/mailer.ts` line 91 | `EMAIL_FROM` is **already env-driven** (Resend adapter) | Per-tenant From requires a per-tenant `EMAIL_FROM` value (or per-tenant Resend domain — see Risks) |
| `artifacts/api-server/.env.example` lines 10–12 | `ADMIN_EMAILS=admin@schoolstack.ai`, `EMAIL_FROM=noreply@schoolstack.ai`, `RESEND_API_KEY=...` | Defaults assume schoolstack.ai |
| `artifacts/api-server/src/lib/mailer.ts` ~line 408 (review-confirmation HTML) | Body hardcodes `"Thanks for using SchoolStack Budget."`, `"— The SchoolStack Team"`, `"SchoolStack Budget by SchoolStack.ai"` | HTML template needs tenant param |
| `artifacts/api-server/src/routes/auth.ts`, `routes/public.ts`, `routes/models.ts` | Additional inline transactional email HTML (verify-email, password-reset, account-already-exists, review-request-team) | Same — string-literal brand inside HTML body |
| `artifacts/api-server/src/lib/review-request-data.ts` line 106 | `viewerLabel: "SchoolStack Team Review"` | Tenant-resolve |

**Even with `EMAIL_FROM` swapped per tenant, the rendered email body still says "SchoolStack" until the templates are refactored.**

### Layer 6 — Content-level brand cross-references (the easy-to-miss layer)

These are inside *user-visible product copy*, not chrome — and they assume the user knows the rest of the SchoolStack product family. A non-SchoolStack tenant would not want them:

| Path | What |
|---|---|
| `artifacts/api-server/src/lib/consultant-engine.ts` lines 1195, 1204, 2731, 2744, 2753 | 4 hardcoded marketing nudges to **"SchoolStack Space (space.schoolstack.ai)"** baked into facility/occupancy recommendations |
| `artifacts/school-financial-model/src/lib/coaching/micro-lessons.ts` lines 124, 137, 149, 162 | Lesson body sign-offs "**— SchoolStack Team**" |
| `artifacts/api-server/src/lib/demo-models/microschool.ts` line 83 | Demo capital row labeled "**SchoolStack Lending Lab Microloan**" |
| `artifacts/school-financial-model/src/data/articles.ts`, `data/solution-pages.tsx`, `data/use-case-pages.tsx`, `components/landing/AudienceCarousel.tsx`, `components/NpsModal.tsx` | Long-form content with brand mentions |

### E2E test guards (separate cost, applies to both paths)

`artifacts/school-financial-model/e2e/` contains **39 brand assertions** (`expect(...).toContain("SchoolStack")` and similar). Path A needs each fork to patch these per-tenant; Path B needs them refactored to be tenant-aware once.

### Inventory totals

- **101 source files** reference the brand by name (frontend src 25, api-server src 19, frontend pages 13, frontend other 10, public 7, layout 2, qa 2, lib finance 1, scripts 1, netlify.toml 1, plus 21 in api-server).
- **6 hex tokens** worth refactoring into CSS vars / tenant resolver, with the dominant one (#328555) appearing in 112 places.
- **4 brand logo files + 9 favicon/icon variants + 1 OG image** per tenant.
- **7 server-side export files** with hardcoded footers/metadata.
- **At least 5 email templates** with brand strings inside HTML bodies.

---

## 2. Path A — per-customer fork

**Mechanic:** for each tenant, branch from `main`, hand-edit the six layers above, deploy to a dedicated Netlify branch context + Railway environment. We've already proven this is operationally feasible — Task #558 stood up `chesterton-preview` end-to-end in days using exactly this pattern (`netlify.toml [context.chesterton-preview]` + a Railway environment + `PREVIEW_DEMO_PASSWORD`).

**Per-tenant cost (one-time, per fork):**

| Step | Effort |
|---|---|
| Branch + Netlify branch context + Railway env (template from `chesterton-preview`) | 0.5 day |
| Hand-edit 25-file frontend brand sweep + 13 page copy edits | 1 day |
| Swap 4 logos + regenerate 9 favicons + new OG image | 0.5 day |
| Refactor #328555 (112 sites) + #D97706 (53) + #0D9488 (28) + #FAF9F7 (34) by hand | 1 day |
| Edit 7 api-server export files (footers, metadata, cell values) | 0.5 day |
| Edit 5 email template HTML bodies | 0.5 day |
| Patch 39 e2e brand assertions | 0.5 day |
| Cross-product nudges (consultant-engine + micro-lessons + demo data) — judgment call per tenant | 0.5–1 day |
| Legal review (entity name swap, "Building Hope" footer) | 0.5 day eng + external |
| Per-tenant Resend domain verification (SPF/DKIM/DMARC) | 0.5 day eng + ~1 week DNS coordination |
| **Subtotal per tenant** | **~5.5–6.5 eng-days + DNS coordination** |

**Recurring cost (the killer):** every change to `main` after fork #1 has to be re-tested or merged into N forks. Brand-rebrand commits will conflict with virtually every UI change (#328555 → tenant-color is the #1 hotspot). Realistic estimate: **+30–50% engineering overhead per active fork on every main-branch feature**, growing linearly with N. At N=2 this is tolerable. At N=3 we are spending more time merging than shipping.

**Pros:**
- No upfront platform investment.
- Lets us ship Chesterton tomorrow (in fact, #558 already did).
- Each fork can drift in product features — useful if a tenant requests a custom workflow we don't want in `main`.

**Cons:**
- Quadratic-ish maintenance: N forks × M main-branch features = N×M reconciliation events.
- Brand drift over time (tenant fork misses bug fixes that landed after the fork).
- E2E tests fork too — quality regressions per tenant.
- Onboarding tenant #5 is roughly the same cost as tenant #2 — no economies of scale.

---

## 3. Path B — multi-tenant theming

**Mechanic:** one codebase, one deployment, tenant resolved at request time from hostname (or `X-Tenant` header in dev). Tenant config (logos, colors, copy, From address, legal entity, cross-product flags) lives in a typed registry. Path B is **explicitly agnostic to data isolation** — it works equally well with one shared DB + `tenant_id` columns or one DB per tenant; that decision lives in a separate task.

**One-time build cost (engineering, sequential):**

| Phase | Effort |
|---|---|
| Tenant resolver scaffolding (`lib/tenant/`, Express middleware, React `TenantContext`, type defs) | 2 days |
| Theme + asset pipeline (HSL → `:root[data-tenant]`, refactor 25-file `#328555` sprawl, refactor PDF `BRAND` + workbook ARGB to read tenant resolver, refactor 4 logo refs + favicon set + manifest) | 5 days |
| Copy + SEO decoupling (SEOHead constants → tenant; `<title>`/OG; ~25 frontend + 10 api-server string literals) | 3 days |
| Email + legal hooks (template HTML accepts `tenant` arg; per-tenant `EMAIL_FROM`; `tenant.legalEntity` for footer/privacy/terms) | 3 days |
| Cross-product nudges + content brand (consultant-engine `tenant.crossProducts` flag, micro-lesson sign-offs, demo data labels) | 2 days |
| Refactor 39 e2e brand assertions to tenant-aware + add per-tenant smoke test | 2 days |
| **Subtotal** | **~17 eng-days = 3.5 weeks** |

**Per-new-tenant cost after build:**

| Step | Effort |
|---|---|
| Add tenant config entry (logos, hex tokens, copy, legal entity, From domain) | 0.5 day |
| Custom domain on Netlify + Railway CORS allowlist update | 0.5 day |
| Resend domain verification (SPF/DKIM/DMARC) — eng work small, DNS coordination ~1 week | 0.5 day eng + ~1 week tenant DNS |
| Per-tenant smoke test pass | 0.5 day |
| **Subtotal per tenant** | **~2 eng-days + DNS coordination, no main-branch tax** |

**Pros:**
- Constant per-tenant cost regardless of N.
- One codebase = one place to fix bugs, ship features, hire against.
- E2E coverage automatic for every tenant.
- Forces us to factor out `BRAND`, `EMAIL_FROM`, `SITE_NAME` etc. — work that improves the product even if we never onboard tenant #2.

**Cons:**
- 3.5-week investment with no shippable feature for non-tenant work during that window.
- Tenant configs are now part of `main` — a typo breaks every tenant. Needs a tenant-config validation gate in CI.
- Tenants lose the ability to fork product behavior (acceptable for chrome/copy white-labeling; not acceptable if we agree to per-tenant feature differentiation, which we should refuse).

---

## 4. Recommendation

**Build Path B.**

**Deciding factor: marginal cost per new tenant.** Path A is ~6 eng-days per tenant *plus* a recurring ~30–50% maintenance tax on all main-branch work for as long as that fork lives. Path B is ~3.5 eng-weeks once, then ~2 days per tenant with no recurring tax.

Crossover analysis at our current pipeline:

- **Tenant 1 only:** Path A wins (~6 days vs ~17 days). We've effectively already spent the Path A cost via #558.
- **Tenant 2 (Wildflower):** Path B catches up — Path A spend is now ~12 days + ongoing tax × 2 forks; Path B is ~17 days + 2 days = ~19 days, no tax.
- **Tenant 3:** Path B is clearly ahead. Path A: ~18 eng-days build + 3 forks × ~40% tax on every future PR. Path B: ~21 eng-days build, then 2 days/tenant.
- **Pipeline of 5+:** Path A is structurally untenable.

We have **two confirmed prospects right now**, so we are sitting on the inflection point. Building Path B now is the right call because:
1. By the time we close Wildflower we'll already be at break-even.
2. The refactor work (factoring `BRAND`, `SITE_NAME`, `EMAIL_FROM` per-call-site) improves the codebase regardless of white-labeling.
3. The Chesterton preview stack from #558 lets us hand-demo Chesterton **during** the Path B build using a hand-customized fork, so sales is not blocked.

Suggested sequencing: keep `chesterton-preview` alive for sales demos through M5 below, then retire it the same week we ship M6.

---

## 5. Sequenced build plan (Path B, 6 milestones)

Each milestone ships behind a feature flag of "default to schoolstack tenant if no resolver hits", so `main` keeps shipping production-identical output until M6.

### M1 — Tenant resolver scaffolding (no behavior change)
- New `lib/tenant/` package: `TenantConfig` type, default-tenant registry containing only `schoolstack`, hostname-based resolver.
- Express middleware on api-server attaches `req.tenant`.
- React `TenantProvider` + `useTenant()` hook on web; resolves from hostname, with `X-Tenant` header override for dev.
- **Acceptance:** `useTenant().slug === "schoolstack"` everywhere; e2e green; visual diff against `main` is zero.

### M2 — Theme + asset pipeline
- HSL tokens move to `:root[data-tenant="..."]` blocks; `<html data-tenant>` set from `useTenant`.
- Refactor `#328555`/`#D97706`/`#0D9488`/`#FAF9F7` direct hex usage in 25-file sprawl to CSS vars.
- PDF `BRAND` and workbook ARGB constants become functions of `tenant` (`getBrand(tenant)` / `getPalette(tenant)`).
- Logo refs in Navbar/Footer + favicon set + manifest read from `tenant.assets`.
- **Acceptance:** schoolstack tenant produces byte-identical PDF + visual-identical web output (manual diff plus a snapshot test on one canonical export).

### M3 — Copy, SEO, legal decoupling
- `SEOHead` constants (`SITE_NAME`, `BASE_URL`, `DEFAULT_TITLE`, `DEFAULT_DESCRIPTION`) move into `tenant.seo`.
- `index.html` static `<title>`/OG/Twitter swapped for `<meta>` injected via `Helmet` from tenant config (or built per-tenant at build time).
- Refactor "SchoolStack Budget" / "SchoolStack" / "by SchoolStack.ai" string literals across 25 frontend files + 10 api-server files to `tenant.productName` / `tenant.companyName`.
- Refactor 39 e2e brand assertions to read from `useTenant()` fixtures.
- **Acceptance:** rendered chrome and meta tags identical for default tenant; e2e green.

### M4 — Email + legal hooks
- `mailer.ts` template functions accept `tenant` arg; remove hardcoded "SchoolStack Team" / "SchoolStack Budget by SchoolStack.ai" from email HTML bodies.
- `EMAIL_FROM` resolution moves through `tenant.email.fromAddress` (env still authoritative for the default tenant).
- `tenant.legalEntity` (e.g. `"Building Hope Impact Fund"`) replaces hardcoded copyright/footer/privacy/terms strings.
- **Acceptance:** existing transactional emails byte-identical for default tenant (snapshot test on rendered HTML).

### M5 — Cross-product nudges + content brand
- `consultant-engine.ts` SchoolStack Space references gated on `tenant.crossProducts.includes("space")`.
- `micro-lessons.ts` "— SchoolStack Team" sign-offs use `tenant.editorialName`.
- `demo-models/microschool.ts` "SchoolStack Lending Lab" line item becomes generic ("Bridge Microloan") or driven by `tenant.demoCustomizations`.
- **Acceptance:** default tenant text identical; new tenants can opt into / out of cross-product nudges via config.

### M6 — Onboard tenant #2 end-to-end (Chesterton)
- Add `chesterton` tenant config (logos, hex tokens, productName, companyName, legalEntity, fromAddress, crossProducts: []).
- Provision Resend domain for chesterton's From address; add SPF/DKIM/DMARC to chesterton's DNS; verify in Resend.
- Add Chesterton custom domain to Netlify (Pro plan) + Railway CORS allowlist.
- Per-tenant smoke test: load homepage → register → wizard → export PDF → confirm email branding.
- **Acceptance:** Chesterton-themed product end-to-end at chesterton's domain, including PDF + email; default tenant unchanged; retire `chesterton-preview` branch.

Optional follow-on (not in MVP scope): **M7** Wildflower onboarding (~2 days, mostly DNS), **M8** admin UI to register a tenant without a code deploy.

---

## 6. Open risks and unknowns

1. **Per-tenant email deliverability is the biggest unknown.** Two options, decide before M4:
   - **Shared verified domain** — every tenant sends from `*.schoolstack.ai` (e.g. `chesterton@schoolstack.ai`). Trivial to operate; weak branding because the sender domain is ours. SPF/DKIM done once.
   - **Per-tenant verified domain** — each tenant sends from their own domain (e.g. `noreply@chesterton.example`). Better branding; requires the tenant's IT to add SPF/DKIM/DMARC records and ~1 week of DNS propagation per onboarding. Resend supports multiple verified domains on a single account; confirm exact plan-tier limits with the Resend dashboard before committing to per-tenant onboarding pricing.
   - Strong default to per-tenant verified for white-label credibility, but confirm with sales that prospects will commit to a DNS coordination call.

2. **Data isolation is explicitly out of scope for this memo.** M1–M6 above work equally well with one shared DB + `tenant_id` columns, one DB per tenant, or anything in between. That decision is driven by SOC2/GDPR/contractual obligations, not white-labeling, and should be its own discovery memo. Whichever way that goes, the tenant resolver from M1 is the integration point.

3. **Legal review of "Building Hope Impact Fund" footer.** Some tenants will be fine with a "powered by Building Hope" footer (Path B can leave it intact via `tenant.poweredBy`); others will demand full removal. Implies per-tenant `legalEntity` + `poweredBy` flags. Get an answer from legal before M4 ships, ideally for both Chesterton and Wildflower.

4. **Cross-product nudges are a sales channel.** The 4 SchoolStack Space references in `consultant-engine.ts` exist to drive traffic to a sister product. Stripping them on tenant builds is the right call for white-labeling but represents lost marketing reach. Confirm with sales that this is acceptable on tenant deals.

5. **No visual regression suite exists today.** M2 needs one to prove "default tenant unchanged". Cheap option: snapshot one canonical PDF + one Playwright screenshot of the dashboard (~half day). Expensive option: Percy/Chromatic (~1–2 days). Recommend the cheap option for M2 and revisit after M6.

6. **Netlify multi-domain requires Pro plan** (~$19/mo) — single-site multi-domain is a Pro-tier feature. Path A also needs this if any tenant gets a custom domain, so it doesn't differentiate the two paths, but flag for finance.

7. **Tenant config is now production code.** A typo in a hex value or From address breaks one or all tenants. Add a tenant-config validation step to CI in M1 (typed config + a unit test that asserts every registered tenant has all required fields and valid hex/email formats).

8. **Existing #558 chesterton-preview branch.** Keep alive through M5 as the prospect-demo URL. Retire when M6 ships. Document the cutover in `docs/CHESTERTON_PREVIEW.md` at that time.

9. **Tenant-feature differentiation must be refused.** Path B works only as long as tenants share product behavior — only chrome/copy/colors/email vary. The first time a tenant asks "can you remove the philanthropy step for our build", say no or build a generic feature flag in `main`; do not branch product logic on `tenant.slug`. This is a product-discipline risk, not a code risk.
