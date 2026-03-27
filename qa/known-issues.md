# Known Issues

**Date:** March 27, 2026

## Issues

### 1. Netlify Proxy Not End-to-End Verified in This QA Run

- **Severity:** Medium
- **User Impact:** If Netlify proxy misconfiguration resurfaces, API calls from `budget.schoolstack.ai` could fail or return HTML instead of data.
- **Workaround:** Previous fix was deployed and verified. `_redirects` file has correct proxy rules. Retest after next Netlify deploy.
- **Will testers hit it in first 20 minutes?** Only if using the production URL (`budget.schoolstack.ai`). If testing locally or on Replit preview, not affected.

### 2. JWT_SECRET Uses Dev Default in Local Environment

- **Severity:** Low
- **User Impact:** None for testers. Production (Railway) has a proper secret set.
- **Workaround:** N/A — this is expected for local dev.
- **Will testers hit it in first 20 minutes?** No.

### 3. Lender Packet and Board Packet XLSX Routes Return JSON

- **Severity:** Info (Not a bug — by design)
- **User Impact:** None. These routes (`/export/lender-packet`, `/export/board-packet`) return the structured packet JSON data. The PDF versions are separate routes (`/export/lender-packet-pdf`, `/export/board-packet-pdf`). The frontend uses the correct routes.
- **Workaround:** N/A.
- **Will testers hit it in first 20 minutes?** No — the frontend maps export buttons to the correct routes.

### 4. Rate Limiter Not Stress-Tested

- **Severity:** Low
- **User Impact:** Under extreme concurrent load, the DB-backed rate limiter could theoretically have a race condition. At 100-user scale, this is very unlikely.
- **Workaround:** Rate limiter uses PostgreSQL UPSERT which is naturally safe.
- **Will testers hit it in first 20 minutes?** No.

### 5. Email Delivery (Password Reset) Not Tested

- **Severity:** Low
- **User Impact:** If a tester uses "Forgot password", the email may or may not arrive depending on Resend API key configuration in the target environment.
- **Workaround:** Testers should register with a fresh account rather than relying on password reset.
- **Will testers hit it in first 20 minutes?** Unlikely — only if they forget their password.
