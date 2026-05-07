# Founder Voice Style Guide

This document is the canonical reference for the language and labels SchoolStack
Budget shows founders. The companion lint test
(`src/__tests__/founder-voice.test.ts`) enforces the rules below across every
file under `src/` whenever it runs in CI.

## Why a style guide

SchoolStack Budget is a planning workbook for school founders, not a credit
underwriting product. Founders use it to think through their financial picture,
share it with a board, and have informed conversations with funders and
lenders. We never render a credit verdict on a founder's plan — only the
founder's lender can do that, with their own underwriting process. Our copy
must therefore avoid any language that implies SchoolStack approves, declines,
qualifies, or disqualifies a founder.

## The five canonical export labels

Every founder-facing surface (the wizard, marketing pages, dashboards,
analytics events, support docs) refers to the exports by exactly these names:

| Canonical label              | Format | Filename token                |
| ---------------------------- | ------ | ------------------------------ |
| Founder Planning Workbook    | XLSX   | `Founder_Planning_Workbook`    |
| 1-Year Operating Budget      | XLSX   | `1-Year_Operating_Budget`      |
| 5-Year Financial Model       | XLSX   | `5-Year_Financial_Model`       |
| Board and Funder Summary     | PDF    | `Board_and_Funder_Summary`     |
| Lender Conversation Snapshot | PDF    | `Lender_Conversation_Snapshot` |

Downloads use the canonical pattern `SchoolName_<token>.<ext>` — e.g.
`Acme_Charter_Academy_Lender_Conversation_Snapshot.pdf`. The school name is
sanitized to `[A-Za-z0-9 _-]` and spaces become underscores. When the server
provides a `Content-Disposition: filename=…` header, that takes precedence; the
fallback in `ExportStep.tsx` uses the canonical pattern with the school name
from the wizard.

### Deprecated labels (do not use)

| Old / banned label                | Replace with                   |
| --------------------------------- | ------------------------------ |
| Underwriting Model / Workbook     | Founder Planning Workbook      |
| Underwriting Package / Packet     | Lender Conversation Snapshot   |
| Underwriting File                 | Lender Conversation Snapshot   |
| Lender Packet / Lender-Ready Pack | Lender Conversation Snapshot   |
| Bank Packet                       | Lender Conversation Snapshot   |
| Credit Memo                       | Lender Conversation Snapshot   |
| Loan Approval Packet              | Lender Conversation Snapshot   |
| Formula Workbook                  | 5-Year Financial Model         |
| Budget Workbook                   | 1-Year Operating Budget        |
| Single-Year Export                | 1-Year Operating Budget        |

## Banned founder-facing phrases

The following phrases must never appear on a founder-visible surface. The
lint test enforces each one as a separate `BANNED_PATTERNS` entry; comments
are stripped before matching.

- `underwriting decision`, `credit decision`, `bank determination`,
  `bank review`
- `underwriting workbook`, `underwriting file`, `underwriting packet`,
  `Underwriting Model workbook`
- `credit memo`, `approval packet`, `loan approval packet`, `loan approval`,
  `borrower approval`
- `approved`, `declined`, `ineligible`, `rejected`, `rejection` (literal
  judgment words about a founder's plan)
- `failed` / `pass` / `fail` used as a verdict on the founder (generic JS
  runtime errors thrown via `throw new Error("… failed")` are allowlisted
  per file)

### Carve-outs (allowlist)

A small set of files legitimately use words from the banned list in a
non-verdict context. They are listed in `GLOBAL_ALLOWLIST` or per-pattern
`extraAllowlist` in `founder-voice.test.ts`:

- `components/CookieConsent.tsx`, `lib/analytics.ts` — universal cookie
  vocabulary (Accept / Decline).
- `pages/scenarios/index.tsx`, `pages/model-wizard/schema.ts` — the
  founder's own scenario tracker (`Pursued / Declined / On hold`).
- `pages/underwriting.tsx` — the `/underwriting` route name and a
  `PublicFundingApprovalStatus` enum that mirrors government program
  terminology. Out of scope for renaming per the task's "Out of scope"
  rules; founder-visible labels rendered from this page still follow the
  guide.
- `lib/error-reporter.ts` — `PromiseRejectionEvent` /
  `window.onunhandledrejection` are standard browser API names.
- Generic JS error throws (`throw new Error("… failed")`) in the
  `GENERIC_ERROR_FAILED_ALLOWLIST` files — runtime-error labels, not
  founder verdicts.

## Approved vocabulary cheatsheet

| Founder-facing concept                 | Use                                  |
| -------------------------------------- | ------------------------------------ |
| The exportable XLSX with all tabs      | Founder Planning Workbook            |
| The single-year operating P&L          | 1-Year Operating Budget              |
| The 5-year projection workbook         | 5-Year Financial Model               |
| The board / philanthropy 1-pager       | Board and Funder Summary             |
| The lender conversation 1-pager        | Lender Conversation Snapshot         |
| Warm-up / readiness check on the plan  | "Lender readiness snapshot" (lower)  |
| Generic adjective for export quality   | "Lender-ready" (allowed)             |

## Founder-facing language QA — Task #676 proof pack

This section is the proof pack entry for Task #676, which swept founder-facing
copy, exports, and tests for residual underwriting/credit-verdict language.

**Surfaces audited.**

- `src/components/landing/AudienceCarousel.tsx` — Lenders & CDFIs tagline
  rewritten ("…and a Lender Conversation Snapshot.").
- `src/data/use-case-pages.tsx` — Lenders use-case page SEO description and
  closing text rewritten ("financial data" instead of "underwriting data").
- `src/data/solution-pages.tsx`, `src/data/articles.ts`,
  `src/components/SEOHead.tsx`, `src/pages/landing.tsx`,
  `src/pages/resources/article.tsx`, `src/pages/solutions/list.tsx`,
  `src/lib/coaching/founder-persona.ts`,
  `src/components/solutions/InsideTheProductVisuals.tsx` — verified clean
  (only the allowed adjective "lender-ready" remains).
- `src/pages/model-wizard/steps/ExportStep.tsx` — the five canonical labels
  and filename tokens already render as-is; fallback download filenames
  updated to the `SchoolName_<token>.<ext>` pattern.
- `src/pages/underwriting.tsx` — kept as-is per task "Out of scope"
  rules (route name, enum names, government-program "Approved" status). A
  per-pattern allowlist entry covers `loan approval` / `loan readiness`
  language on this internal-style reviewer screen.
- `src/lib/revenue-defaults.ts`, `src/lib/seed-five-year.ts` — comments only;
  stripped before linting and left untouched.

**Tests added.**

- New banned patterns in `founder-voice.test.ts`: `underwriting packet`,
  `underwriting workbook`, `Underwriting Model workbook`, `loan approval`,
  `loan approval packet`, `borrower approval`, literal `rejected`,
  literal `rejection`.
- New `describe("founder voice — canonical export labels & filenames")`
  block asserts each of the five canonical labels and the five canonical
  filename tokens render in `ExportStep.tsx`, and asserts that deprecated
  filename tokens (e.g. `Underwriting_Model.xlsx`, `Loan_Approval_Packet.pdf`,
  `Budget_Workbook.xlsx`, `Single-Year_Export.xlsx`) do not.

**Validation.**

- `pnpm --filter @workspace/school-financial-model test
  -- --run founder-voice` — passes.
- `pnpm --filter @workspace/school-financial-model test
  -- --run ExportStep.single-year` — passes (renders the canonical labels).
- The `e2e/underwriting-deferred-founder-comp.spec.ts` regression contract
  is unaffected by the wording changes (it asserts test-id selectors and
  flag text only).
