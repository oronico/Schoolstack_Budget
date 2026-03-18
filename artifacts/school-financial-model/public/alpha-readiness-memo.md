# SchoolStack Budget — Alpha Readiness Memo

**Date:** March 17, 2026
**Author:** Engineering Team
**Version:** Alpha Candidate v1

---

## 1. What Is Complete

### Epic 1: Founder Model (Core Wizard + Exports)

Epic 1 is **fully complete**. Every feature required for a school founder to build, analyze, and export a 5-year financial model is functional and tested.

| Capability | Status | Notes |
|:---|:---:|:---|
| 8-step model wizard (Profile → Export) | ✅ | New & operating schools, all school types |
| Programs & enrollment with 5-year projections | ✅ | Per-program tuition, escalation, capacity warnings |
| Revenue model (6 categories, 5 driver types) | ✅ | Tuition tiers, per-student, fixed, % of revenue, % of base |
| FTE-based staffing with benefits/payroll tax | ✅ | Contract vs. employee, payroll-like toggle |
| Expense model (4 built-in + custom categories) | ✅ | Per-student, fixed, % of revenue drivers |
| Capital & debt with loan calculator | ✅ | Interest, amortization, balloon payments |
| Partial first-year proration | ✅ | Configurable operating months |
| Enrollment benchmarking guidance | ✅ | School-type-specific, capacity-aware inline tips |
| Demand confidence signals | ✅ | Applications, waitlist, retention rate |
| Formula Workbook export (XLSX) | ✅ | 3-tab with live formulas |
| Underwriting Package export (XLSX) | ✅ | 21-tab full underwriting model |
| Lender Pro Forma export (XLSX) | ✅ | 8-tab with cross-tab formulas |
| Golden test suite | ✅ | 115 assertions, 0 failures |
| Authentication (register, login, reset) | ✅ | JWT-based, bcrypt passwords |
| Dashboard with model lifecycle management | ✅ | Create, duplicate, archive, delete |

### Epic 2: Decision Engine & Coaching

Epic 2 is **substantially complete** for Phase 1. The core decision engine and coaching system are functional.

| Capability | Status | Notes |
|:---:|:---:|:---|
| Consultant engine (deterministic analysis) | ✅ | Lender readiness, stress tests, sensitivity matrix, cash runway |
| Health signals (7 dimensions) | ✅ | DSCR, reserves, margin, staffing ratio, etc. |
| Top 3 Issues panel ("What should I fix first?") | ✅ | 8 decision rules, severity ranking, jump-to-step |
| Recommendations engine | ✅ | Prioritized actions with supporting metrics |
| Budgeting Co-Pilot Phase 1 | ✅ | 3 guidance modes, 13 inline explainers, KPI formula transparency |
| Section explainers | ✅ | Context-aware cards on enrollment, revenue, staffing, expenses |

### Epic 3: Output Productization & Scenario Planning

Epic 3 is **substantially complete**. All four export deliverables and the scenario planner are functional.

| Capability | Status | Notes |
|:---:|:---:|:---|
| Packet architecture (shared data layer) | ✅ | Canonical math from workbook-helpers, no duplicated logic |
| Lender-Ready Packet (PDF) | ✅ | Risk/mitigant pairs, DSCR summary, branded cover |
| Board Summary (PDF) | ✅ | Outlook, top risks, cash runway, scenario snapshots, focus areas |
| Lender Packet preview modal | ✅ | Full JSON preview before PDF download |
| Board Packet preview modal | ✅ | Full JSON preview before PDF download |
| Scenario Planner | ✅ | Up to 3 scenarios, 5 adjustment sliders, deep comparison mode |
| Scenario persistence & export integration | ✅ | Scenarios flow into underwriting XLSX |
| Export step (4-card grid) | ✅ | Lender Packet, Board Summary, Underwriting, Formula |

---

## 2. Intentionally Deferred

| Item | Rationale |
|:---|:---|
| **Coaching Phase 2** (micro-lessons, proactive nudges) | Phase 1 covers the essential guidance; Phase 2 adds depth but is not required for alpha |
| **Multi-user collaboration** | Single-founder workflow is the alpha use case |
| **Automated email notifications** (RESEND_API_KEY is configured but unused for user-facing emails) | Not needed for alpha; manual outreach is sufficient |
| **Public sharing / read-only model links** | Low priority for alpha testers who are creating their own models |
| **Mobile-responsive optimization** | Desktop is the primary workflow for financial modeling; mobile polish is post-alpha |
| **Advanced charter per-pupil funding logic** | Basic per-student revenue covers charter schools; advanced state-specific formulas are post-alpha |
| **Stripe / payment integration** | Alpha is free; monetization is post-validation |
| **Audit trail / version history** | Nice-to-have for compliance; not blocking alpha |
| **PDF export for Pro Forma (standalone)** | Lender Packet PDF supersedes this; standalone route exists but is not surfaced in the UI |

---

## 3. Known Risks & Limitations

### Technical

| Risk | Severity | Detail |
|:---|:---:|:---|
| **38 pre-existing TypeScript errors** | Medium | 8 in api-server (guidanceLevel type mismatch, feedbackTable missing export), 30 in frontend (API client type mismatches for coaching/consultant features). None cause runtime failures — all are strict-mode type gaps. |
| **No automated E2E test suite** | Medium | Golden model tests cover financial math exhaustively, but there are no Playwright tests covering the wizard flow end-to-end. Manual QA is the current gate. |
| **Single-server architecture** | Low | API server is a single Express process on Railway. Adequate for alpha (<50 concurrent users) but not horizontally scalable. |
| **No rate limiting on authenticated routes** | Low | Public routes have PostgreSQL-backed rate limiting; authenticated routes do not. Acceptable for alpha with known users. |

### Product

| Risk | Severity | Detail |
|:---|:---:|:---|
| **First-time user onboarding** | Medium | The wizard is comprehensive but can feel overwhelming for a founder with no financial background. The coaching system helps but has not been user-tested. |
| **Scenario Planner discoverability** | Low | Only accessible from dashboard for step-8 models; users may not realize it exists after completing the wizard. |
| **Excel compatibility** | Low | Formula workbooks include cached results for Google Sheets, but complex formulas may not render identically across all spreadsheet applications. |

---

## 4. Recommended Alpha User Profile

The ideal alpha tester is:

- **A school founder or operator** actively building a financial model for a new or early-stage school (Years 1-3)
- **Seeking financing** or preparing board materials — they have a concrete use case for the exports
- **Comfortable with a desktop browser** (Chrome or Edge preferred)
- **Willing to provide structured feedback** — they understand this is a pre-launch product
- **School types:** Microschool, private/independent school, or charter school. All three are well-supported by the model.
- **Not expected:** Deep financial expertise. The coaching system and consultant engine are designed to guide non-finance founders.

**Suggested cohort size:** 5-10 founders, ideally a mix of new-school planners and Year 1-2 operators.

---

## 5. Go / No-Go Recommendation

### **Recommendation: GO for Alpha**

The core value proposition — build a lender-ready 5-year financial model and export it as a professional packet — is fully functional from end to end. The math engine is validated by 115 golden tests with zero failures. Four distinct export formats are available. The consultant engine provides meaningful, actionable analysis. The scenario planner adds a layer of strategic depth that exceeds typical alpha expectations.

**Conditions for go:**
1. Manual QA walkthrough of the complete wizard flow with at least 2 school types (charter + microschool) before inviting external users
2. Verify Netlify production build deploys cleanly from current main branch
3. Confirm Railway API server health check passes and database is accessible

**What would change this to a no-go:**
- Discovery of a financial math error in the golden test suite
- Production deployment failure that cannot be resolved within 24 hours
- A data-loss bug in model save/load

---

## 6. Top 5 Bugs / Polish Items Before External Alpha

| # | Item | Type | Impact | Effort |
|:---:|:---|:---:|:---|:---:|
| 1 | **Resolve TypeScript type mismatches** for `guidanceLevel`, `feedbackTable`, and `ConsultantOutput` (38 errors) | Tech Debt | Prevents clean CI builds; risks masking real errors introduced in future work | Medium |
| 2 | **Add a "What's Next" prompt after wizard completion** — when users reach step 8 and export, guide them to the Scenario Planner and dashboard | Polish | Users may not discover the scenario planner or know they can iterate on their model | Small |
| 3 | **Board Packet: missing `cash_flow` section in filtered sections** — the board packet filters sections but the cash_flow section may not appear if not present in the base packet's section list | Bug | Cash runway data shows in the preview cards but the expandable section card may be absent | Small |
| 4 | **Hardcode-free year labels** — applications/waitlist fields reference "2026-27" directly rather than computing from the model's planned opening year | Polish | Will show stale year labels for models with different opening years | Small |
| 5 | **Add a simple onboarding tooltip or welcome modal** for first-time users explaining the 8-step wizard flow and approximate completion time | Polish | Reduces first-session drop-off for founders who feel overwhelmed by the wizard scope | Medium |

---

*Prepared for internal review. This memo reflects the state of the `main` branch as of commit `b626f36` (March 17, 2026).*
