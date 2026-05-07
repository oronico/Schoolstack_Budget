# Founder Voice — Writing Guide for SchoolStack Budget

This guide governs every founder-facing string in SchoolStack Budget. The
product is a **founder-first planning tool that produces lender-grade
deliverables** — not a bank portal, not an underwriting engine. Our voice is
warm, coaching, accurate, and never makes a credit decision.

---

## Who reads what

| Surface                                    | Primary reader            | Tone                                       |
| ------------------------------------------ | ------------------------- | ------------------------------------------ |
| Wizard, dashboard, settings, share viewer  | Founder                   | Warm, coaching, plain-English              |
| Marketing pages, emails                    | Founder                   | Warm, plain-English                        |
| Lender Conversation Snapshot PDF (cover, headers) | Founder + lender   | Plain, precise, lender-grade               |
| Board and Funder Summary PDF               | Founder + board / funder  | Plain, precise, board-ready                |
| Founder Planning Workbook (cover, tab labels) | Founder + reviewer    | Plain, precise; technical tab names OK     |
| Internal code, route paths, file names, test fixtures | Engineers      | Whatever is conventional; not constrained  |

If a string is rendered to a founder anywhere — **including** PDF/XLSX cover
pages they read before forwarding — it follows this guide. Internal
identifiers, route paths (`/underwriting`), file names
(`underwriting-workbook.ts`), variable names, and test fixtures are out of
scope.

## The five export labels (canonical)

These are the only names we use for the five export deliverables, on every
founder-facing surface, in marketing copy, in emails, and on PDF/XLSX cover
pages. Filenames mirror the same words.

| Internal key             | Founder-facing label                                         | Filename stem                       |
| ------------------------ | ------------------------------------------------------------ | ----------------------------------- |
| `formula` (single year)  | **1-Year Operating Budget**                                  | `Operating_Budget_<id>.xlsx`        |
| `formula` (5-year)       | **5-Year Financial Model**                                   | `5_Year_Financial_Model_<id>.xlsx`  |
| `underwritingV2`         | **Founder Planning Workbook**                                | `Founder_Planning_Workbook_<id>.xlsx` |
| `boardPacketPdf`         | **Board and Funder Summary**                                 | `Board_and_Funder_Summary_<id>.pdf` |
| `lenderPacketPdf`        | **Lender Conversation Snapshot**                             | `Lender_Conversation_Snapshot_<id>.pdf` |

Do **not** ship any of these older names on founder-facing surfaces:
"Lender-Ready Packet", "Lender Packet", "Board Summary", "Board Packet",
"Underwriting Package", "Underwriting Workbook" (as a label), "Formula
Workbook", "Credit Memo", "Underwriting File", "Approval Packet",
"Bank Review".

## Banned phrases

Never use these on a founder-facing surface. They imply that we, or the
software, made a credit decision — which we do not.

- "underwriting decision"
- "credit decision"
- "bank determination"
- "approval packet" / "approved by the model" / "denied by the model"
- "credit memo"
- "underwriting file"
- "bank review"
- "pass / fail" as a verdict on a founder's model (use it only for test names)
- "ineligible" as a flat verdict on a founder's school
  (say "may not qualify for some lending programs" instead)
- "Loan officer says no" or any phrasing that puts words in a lender's mouth

Universal vocabulary that uses one of these words for a different reason
(e.g. "Accept / Decline cookies" in a cookie banner, a founder marking a
scenario as "Pursued / Did not pursue", a state government "approved" charter
status) is fine — it is not a credit verdict.

## Phrase swaps

| Avoid                                  | Prefer                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| "Underwriting workbook"                | "Founder Planning Workbook"                                            |
| "Lender packet" / "Lender-ready packet"| "Lender Conversation Snapshot"                                         |
| "Board summary" / "Board packet"       | "Board and Funder Summary"                                             |
| "Lender concerns"                      | "Things to address before talking to a lender"                         |
| "Lender Readiness Snapshot"            | "Loan Readiness Snapshot"                                              |
| "Public Underwriting Wizard"           | "Founder Quick-Start Wizard"                                           |
| "Underwriters expect…" (verdict tone)  | "Lenders typically look for…" (coaching tone)                          |
| "Approved" (as a model verdict)        | "On track", "ready to share", or describe the specific metric          |
| "Failed", "ineligible"                 | "Below the typical lender benchmark", "may not qualify for some programs" |
| "Risk / mitigant assessment"           | "What to watch and how to address it"                                  |

## Tone rules

1. **Coach, do not judge.** Tell the founder what the number means and what
   they can do about it. Never tell them they have been approved or denied.
2. **Plain English first, technical term in parentheses.** "Cash Trough (the
   lowest cash balance during your projection)" — not "Cash Trough" alone.
3. **Numbers belong to the founder.** Say "your DSCR", "your cash runway".
   Avoid "the model says" or "we calculate" when "your numbers show" is true.
4. **The deliverable is lender-grade, the conversation is warm.** "Lender-grade"
   describes the export quality. Founder copy stays warm regardless.
5. **Specificity beats verdicts.** "DSCR is 1.05× — most lenders want 1.20× or
   better" is better than "DSCR fails the lender test".

## Enforcement

A vitest test in `artifacts/school-financial-model/src/__tests__/founder-voice.test.ts`
fails the build if any of the banned phrases above appears in
`artifacts/school-financial-model/src/` outside of test fixtures, code
comments, route paths, or files explicitly allowlisted in that test. PRs that
introduce a new banned phrase must either rephrase the copy or extend the
allowlist with a written justification in the PR description.
