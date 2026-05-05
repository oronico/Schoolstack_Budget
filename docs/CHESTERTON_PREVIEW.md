# Chesterton Preview Stack

A long-lived preview environment aimed at Chesterton (a real prospective partner school in the Chesterton Schools Network mold). Hand the URL + login to the Chesterton team to evaluate SchoolStack Budget without exposing them to production data.

This is a **prospect-facing demo URL**, not a public site. Treat the URL and password the same way you would a sales demo room key: share it with the Chesterton point of contact via the team password manager, not in a public Slack channel or marketing email.

---

## What Chesterton sees

After logging in, the demo account has four sample financial models pre-built and parked at the Review / Export step. The one most relevant to Chesterton is:

> **Chesterton Academy of Saint Edmund (Demo Chesterton Academy)**
>
> A founding-year Catholic classical high school modeled on the Chesterton Schools Network operating template:
> - Grades 9–12, single freshman class founding the school, one new grade added per year (15 → 30 → 45 → 60 → 75 students)
> - $8,500 starting tuition with 4% annual growth, 10% need-based aid pool, 15% sibling-discount tier
> - Classical subject specialists (Literature, Mathematics, Theology, Latin, Science, History, Arts) at the CSN starting-teacher salary of $44,000
> - ~$287K total philanthropy goal in Year 1 modeled after the CSN "Sample Gift Chart" pyramid
> - Phase I parish-shared facility, founding-year FF&E, optional bridge loan in Year 2

The other three demo schools (microschool / private school / charter school) are also visible so Chesterton can compare different school models side-by-side.

---

## Operator handoff (one-time setup per environment)

These steps stand the preview up. Once configured, every push to the `chesterton-preview` branch redeploys it.

### 1. Create the `chesterton-preview` branch

```bash
git checkout -b chesterton-preview
git push -u origin chesterton-preview
```

Treat `chesterton-preview` as a long-lived branch (don't delete it). Periodically merge `main` into it so the preview tracks the latest product. Don't merge `chesterton-preview` back into `main` — it has no source-of-truth changes (other than this doc, which is already on `main`).

### 2. Create the Railway environment

In the Railway dashboard for the `schoolstackbudget` service:
1. Create a new environment named `chesterton-preview`.
2. Add the Postgres plugin (this provisions a dedicated empty database — the auto-seed will fill it on first boot).
3. Set the public domain to `schoolstackbudget-chesterton.up.railway.app` (this is the URL that `netlify.toml` is preconfigured to point at — see `[context.chesterton-preview.environment]`). If you choose a different URL, override `VITE_API_BASE_URL` in the Netlify UI for the `chesterton-preview` branch instead.
4. Set the standard production environment variables (`JWT_SECRET`, `RESEND_API_KEY`, `ALLOWED_ORIGINS`, `NODE_ENV=production`).
5. **Set `PREVIEW_DEMO_PASSWORD`** to a non-default value of your choice (don't reuse the production JWT secret or any real-customer credential — this password leaves the building, the JWT secret does not). Save the chosen value to the team password manager. The default `demo1234` is documented in the public README, so leaving it unset would make the URL trivially crawlable.
6. Confirm `SKIP_PREVIEW_SEED` is unset (the seed must run on first boot to insert the demo user + four sample models).

### 3. Confirm the Netlify branch deploy

Netlify's branch-deploy feature is already enabled in `netlify.toml`. After the first push to `chesterton-preview`, Netlify will build and publish the branch automatically at:

```
https://chesterton-preview--<your-netlify-site-name>.netlify.app
```

To confirm the frontend is wired to the Chesterton Railway environment (not prod), do **both** of the following — `/api/*` on the Netlify URL is hardcoded to prod via the `[[redirects]]` block in `netlify.toml`, so a quick `curl` to `chesterton-preview--<site>.netlify.app/api/health` would mislead you. The frontend bundle uses the absolute `VITE_API_BASE_URL` from the branch-context build env above, which is the right path:

1. Hit the Chesterton Railway URL directly to confirm the API is up:
   ```bash
   curl https://schoolstackbudget-chesterton.up.railway.app/api/health
   # expect { "status": "ok", "db": "connected", ... }
   ```
2. Open the Netlify branch URL in a browser, log in, and watch the network tab. Every `/api/*` call should target `https://schoolstackbudget-chesterton.up.railway.app`, **not** `schoolstackbudget.up.railway.app`. If you see prod URLs in the network tab, the `VITE_API_BASE_URL` override didn't take — check the Netlify build log for that branch and confirm the `[context.chesterton-preview.environment]` block was honored.

### 4. Trigger the seed

The seed runs the first time the API boots against an empty `users` table. To force it after a Postgres reset, redeploy the Railway service. Confirm via the Railway logs that you see:

```
[seed] Created demo user: demo@schoolstack.ai (id=1)
[seed]   + model: Oakwood Learning Studio (Demo Microschool) ...
[seed]   + model: Riverside Christian Academy (Demo Private School) ...
[seed]   + model: Liberty STEM Charter School (Demo Charter School) ...
[seed]   + model: Chesterton Academy of Saint Edmund (Demo Chesterton Academy) ...
[seed] Done. Reviewers can log in with demo@schoolstack.ai / <password> (password source: PREVIEW_DEMO_PASSWORD override).
```

The "password source: PREVIEW_DEMO_PASSWORD override" line is the operator-visible confirmation that the password rotation took. If you instead see "password source: default", `PREVIEW_DEMO_PASSWORD` was unset at the moment of the seed.

> **Heads up — `PREVIEW_DEMO_PASSWORD` only takes effect on the first seed (empty-DB run).** Once the demo user exists, changing the env var on the Railway service has no effect on their stored bcrypt hash. To rotate the password later you must either reset the Postgres (which clears all their work) or update the user's hash manually. For a prospect demo this is unlikely to matter, but document the chosen password in the team password manager so you don't have to re-derive it.

---

## Reviewer one-pager (send this to Chesterton)

Customize the URL + password and paste into the email.

> Hi {Chesterton contact},
>
> Here's a private preview of SchoolStack Budget you can poke around in over the next few weeks. There's no real customer data in here — it's a demo environment with four pre-built sample schools, including one we modeled after a CSN founding-class plan so you can see what your scenario looks like in the tool.
>
> **URL:** `https://chesterton-preview--<site>.netlify.app`
> **Email:** `demo@schoolstack.ai`
> **Password:** `<see team password manager>`
>
> **What to try first (≈ 10 minutes):**
> 1. Log in with the credentials above.
> 2. From the dashboard, open **Chesterton Academy of Saint Edmund (Demo Chesterton Academy)**. This is the CSN-shaped demo — single founding freshman class growing to a full 9–12 over four years, classical subject specialists, the CSN gift-chart fundraising pyramid.
> 3. Click through the wizard tabs (School Profile → Enrollment → Tuition → Staffing → Expenses → Capital & Debt → Review). Everything is editable; nothing you change affects anyone else's preview.
> 4. From the Review / Export step, hit **Export Lender Packet** — a one-click PDF you'd hand to a CDFI or bank.
> 5. Tell us what you'd want to be different. The fastest channel is to reply to this email; the in-app feedback widget (bottom-right corner) also routes to us.
>
> If anything looks broken or confusing, just send a screenshot. We're iterating quickly and your reactions land directly in our backlog.

---

## Out-of-scope (intentionally not in this preview)

- **A custom domain (e.g. `chesterton-preview.schoolstack.ai`).** The Netlify branch-deploy URL is the deliverable. Adding a custom domain is straightforward later if Chesterton's team wants a cleaner URL.
- **White-labeled UI / PDFs (Chesterton branding instead of "SchoolStack Budget").** That decision is being made under the parallel discovery task (white-label strategy memo); this preview shows the regular SchoolStack-branded app.
- **The dedicated `chesterton_academy` wizard branch.** The seeded demo uses the standard `private_school` shape so it flows through every export. Reviewers who want to see the CSN Operating Manual export path can do that from "Create new model" → pick "Chesterton Academy" as the school type.
- **Production data.** The Chesterton Railway environment has its own ephemeral Postgres. Resetting it (e.g. to rotate `PREVIEW_DEMO_PASSWORD`) does not affect any other environment.
