# SchoolStack Budget — Deployment Guide

Everything you need to get SchoolStack Budget live on the internet. No technical background required.

---

## How It Works

Your app has two parts:

- **The Website** (what users see in their browser) → hosted on **Netlify**
- **The API Server** (the "brain" that handles logins, saves data, generates Excel files) → hosted on **Railway**
- **The Database** (where all your data is stored) → hosted on **Railway** (alongside the API)
- **Email** (password reset emails, notifications) → powered by **Resend**

```
Users visit your website (Netlify)
    ↓
Website talks to your API server (Railway)
    ↓
API server reads/writes data (Railway PostgreSQL database)
    ↓
API server sends emails when needed (Resend)
```

---

## Part 1: Resend (Email Service)

Set this up first so you have the credentials ready for Railway.

### Step 1: Create an Account

- Go to [resend.com](https://resend.com) and sign up
- Free tier: 100 emails/day, 3,000/month — plenty for getting started

### Step 2: Add Your Domain (Optional but Recommended)

- In the Resend dashboard, go to **Domains** → **Add Domain**
- Add your domain (e.g., `schoolstack.ai`)
- Resend gives you DNS records to add in Squarespace
- This lets emails come from `noreply@schoolstack.ai` instead of a generic address
- You can skip this step initially and use Resend's test domain (`onboarding@resend.dev`)

### Step 3: Get Your API Key

- Go to **API Keys** → **Create API Key**
- Copy the key and save it somewhere safe — you'll only see it once
- You'll use this as the `SMTP_PASS` value in Railway

### Resend SMTP Credentials (Save These)

| Setting | Value |
|---------|-------|
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `465` |
| SMTP User | `resend` |
| SMTP Password | Your Resend API key |
| From Address | `SchoolStack Budget <noreply@schoolstack.ai>` (or `onboarding@resend.dev` if you haven't set up your domain) |

---

## Part 2: Railway (API Server + Database)

### Step 1: Create an Account

- Go to [railway.app](https://railway.app) and sign up with your GitHub account

### Step 2: Create a New Project

- Click **"New Project"** → **"Deploy from GitHub Repo"**
- Select your SchoolStack repo
- Railway automatically detects the Dockerfile and uses it to build your API server

### Step 3: Add a Database

- Inside your Railway project, click **"New"** → **"Database"** → **"PostgreSQL"**
- Railway creates a database for you automatically
- Click on the database service → go to the **"Connect"** tab
- Copy the **connection string** (starts with `postgresql://...`) — you'll need this next

### Step 4: Set Environment Variables

- Click on your **app service** (not the database)
- Go to the **"Variables"** tab
- Add each of these:

| Variable | What to Put | Notes |
|----------|------------|-------|
| `PORT` | `8080` | The port the server runs on |
| `DATABASE_URL` | The connection string you copied from Step 3 | Starts with `postgresql://...` |
| `JWT_SECRET` | Any long random string (30+ characters) | Mash your keyboard, e.g., `xK9mP2qR7vN4bL8wJ3cF6hT1yU5dA0` |
| `CORS_ORIGIN` | Your website URL | e.g., `https://schoolstack.ai` or `https://your-site.netlify.app` |
| `ADMIN_EMAILS` | Your email address | The email you'll register with to access the admin dashboard |
| `APP_URL` | Your website URL (same as CORS_ORIGIN) | e.g., `https://schoolstack.ai` |
| `SMTP_HOST` | `smtp.resend.com` | From Part 1 |
| `SMTP_PORT` | `465` | From Part 1 |
| `SMTP_USER` | `resend` | From Part 1 |
| `SMTP_PASS` | Your Resend API key | From Part 1 |
| `SMTP_FROM` | `SchoolStack Budget <noreply@schoolstack.ai>` | Or `onboarding@resend.dev` if no custom domain yet |

### Step 5: Deploy

- Railway auto-deploys when you push to GitHub
- Once deployed, Railway gives you a public URL like `https://your-app.up.railway.app`
- Copy this URL — you'll need it for Netlify

---

## Part 3: Netlify (Website)

### Step 1: Create Your Site

- Go to [netlify.com](https://netlify.com) and sign up / log in
- Click **"Add new site"** → **"Import an existing project"**
- Choose **GitHub** and select your SchoolStack repo
- Pick the `main` branch

### Step 2: Set the Build Settings

On the setup screen (or later under **Site configuration → Build & deploy → Build settings**):

| Setting | Value |
|---------|-------|
| Package directory | `artifacts/school-financial-model` |

Leave everything else as-is — the `netlify.toml` file in your repo already tells Netlify how to build the site.

### Step 3: Add Environment Variable

Go to **Site configuration → Environment variables → Add a variable**:

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | Your Railway app URL (e.g., `https://your-app.up.railway.app`) |

### Step 4: Update One Line in Your Code

In the file `netlify.toml` at the root of your project, find the line that says:

```
YOUR-API-HOST
```

Replace it with your Railway app domain. For example, change:

```
to = "https://YOUR-API-HOST/api/:splat"
```

to:

```
to = "https://your-app.up.railway.app/api/:splat"
```

Then push this change to GitHub — Netlify will automatically rebuild.

### What `netlify.toml` Already Handles (No Action Needed)

These are already configured in the file:

- **Cache headers** — asset files are cached for fast loading
- **SPA routing** — all pages work correctly with browser refresh
- **Build command** — Netlify knows how to build the project

---

## Part 4: Custom Domain (If Using Squarespace DNS)

If you want users to visit `schoolstack.ai` instead of `your-site.netlify.app`:

1. In **Netlify → Domain management → Add custom domain**, add your domain
2. Netlify gives you a DNS target (something like `your-site.netlify.app`)
3. In **Squarespace DNS settings**, add a CNAME record pointing your domain to that Netlify target
4. Back in Netlify, enable **HTTPS** — it provisions a free SSL certificate automatically

---

## Quick Reference: All Environment Variables

### Railway (API Server)

| Variable | Example Value |
|----------|---------------|
| `PORT` | `8080` |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | `xK9mP2qR7vN4bL8wJ3cF6hT1yU5dA0` |
| `CORS_ORIGIN` | `https://schoolstack.ai` |
| `ADMIN_EMAILS` | `you@email.com` |
| `APP_URL` | `https://schoolstack.ai` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | `re_abc123...` (your Resend API key) |
| `SMTP_FROM` | `SchoolStack Budget <noreply@schoolstack.ai>` |

### Netlify (Website)

| Variable | Example Value |
|----------|---------------|
| `VITE_API_BASE_URL` | `https://your-app.up.railway.app` |

### Code Change

| File | Change |
|------|--------|
| `netlify.toml` | Replace `YOUR-API-HOST` with your Railway domain |

---

## Estimated Monthly Costs

| Service | Free Tier | Typical Cost |
|---------|-----------|-------------|
| Netlify | 100GB bandwidth, 300 build minutes/month | Free for most small apps, $19/month if you need more |
| Railway | $5 trial credit, then usage-based | ~$5–10/month for a small app + database |
| Resend | 100 emails/day, 3,000/month | Free to start, $20/month for more volume |

**Total: roughly $5–15/month** to run everything.

---

## Deployment Checklist

- [ ] Resend account created
- [ ] Resend API key copied
- [ ] Resend domain added (optional)
- [ ] Railway account created
- [ ] Railway project created from GitHub repo
- [ ] Railway PostgreSQL database added
- [ ] Railway environment variables set (all 11)
- [ ] Railway app URL copied
- [ ] Netlify account created
- [ ] Netlify site created from GitHub repo
- [ ] Netlify package directory set to `artifacts/school-financial-model`
- [ ] Netlify environment variable `VITE_API_BASE_URL` set
- [ ] `netlify.toml` updated with Railway domain
- [ ] Change pushed to GitHub
- [ ] Custom domain configured (optional)
- [ ] Test: visit your site, create an account, build a model, export to Excel
