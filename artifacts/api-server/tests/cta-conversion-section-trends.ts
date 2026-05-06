// Task #497 — section-engagement trend bucketing regression.
//
// Task #421 added per-(capability, section) impression and click trend
// arrays to GET /admin/cta-conversion so the admin dashboard can render
// a sparkline next to each section row in the Capability Page Section
// Engagement card. The bucketing math (sectionImpressionTrends /
// sectionClickTrends + the trendIndex helper in routes/admin.ts) had no
// automated coverage, so a future refactor of that route could silently
// flatten or misalign the trends without anyone noticing until an
// editor complained the sparklines stopped moving.
//
// This test pins the contract that the UI relies on:
//   1. For windowed ranges (7d / 30d / 90d) every (source, section)
//      that surfaces in sectionEngagement[] also has impressionsTrend
//      and clicksTrend arrays whose length === bucketCount and whose
//      sum === the row's total impressions / clicks. Specific seeded
//      events land in the bucket the trendIndex helper computes for
//      their date_trunc'd timestamp.
//   2. For range=all the response sets bucketUnit=null, bucketCount=0,
//      and every per-section trend array is [] (sparklines must fall
//      back to the dash placeholder in the UI).
//   3. Events older than the current window do NOT contribute to the
//      trend arrays even when they live in the prior window — only
//      the current period feeds the sparkline.

// IMPORTANT: ADMIN_EMAILS must include our test admin BEFORE we import
// app.js, so the adminMiddleware sees it on the very first request.
// (getAdminEmails() re-reads process.env on every call, but pinning
// the env early matches how the production server is configured.)
const ADMIN_EMAIL = `cta-trend-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const existingAdmins = process.env.ADMIN_EMAILS || "";
process.env.ADMIN_EMAILS = existingAdmins
  ? `${existingAdmins},${ADMIN_EMAIL}`
  : ADMIN_EMAIL;

import http from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, eventsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

interface CtaResponse {
  range: "7d" | "30d" | "90d" | "all";
  bucketUnit: "day" | "week" | null;
  bucketCount: number;
  sectionEngagement?: {
    source: string;
    sections: {
      section: string;
      impressions: number;
      clicks: number;
      signups: number;
      clickRate: number;
      impressionsTrend: number[];
      clicksTrend: number[];
    }[];
    scrollDepth: { d25: number; d50: number; d75: number; d100: number };
  }[];
}

async function fetchCta(
  baseUrl: string,
  token: string,
  range: "7d" | "30d" | "90d" | "all",
): Promise<CtaResponse> {
  const res = await fetch(`${baseUrl}/api/admin/cta-conversion?range=${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `GET /admin/cta-conversion?range=${range} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as CtaResponse;
}

// Mirrors the trendIndex helper in src/routes/admin.ts. The route uses
// (cfg.now, cfg.currentStart) computed at request time — we re-derive
// the same start from `now` and apply the same flooring + clamp so the
// expected slot lines up with whatever the server computed for our
// request. Tests pass `now` captured immediately before the fetch.
function expectedTrendIndex(
  eventTs: number,
  now: number,
  bucketCount: number,
  bucketMs: number,
): number {
  const startMs = now - bucketCount * bucketMs;
  // The DB date_trunc('day') / date_trunc('week') runs in the server's
  // session timezone; for the events table that's typically UTC. We
  // emulate that by truncating eventTs to the start of the same UTC
  // day (or ISO week) before applying the index math, mirroring what
  // the route receives back from postgres.
  const truncated = bucketMs === 24 * 60 * 60 * 1000
    ? Date.UTC(
        new Date(eventTs).getUTCFullYear(),
        new Date(eventTs).getUTCMonth(),
        new Date(eventTs).getUTCDate(),
      )
    : (() => {
        // ISO week start (Monday 00:00 UTC). postgres' date_trunc('week')
        // matches the ISO definition.
        const d = new Date(eventTs);
        const day = d.getUTCDay() || 7; // Sunday=7
        const monday = Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate() - (day - 1),
        );
        return monday;
      })();
  const raw = Math.floor((truncated - startMs) / bucketMs);
  return Math.max(0, Math.min(bucketCount - 1, raw));
}

const TEST_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SOURCE = `cta-trend-test-${TEST_RUN_ID}`;
const SECTION = "hero"; // must be in KNOWN_SECTIONS so it isn't filtered out

// Track the events we insert so cleanup can scope to just this run. We
// can't use eventsTable.metadata to filter cleanly across drizzle dialects
// without raw SQL, but we can capture inserted ids and delete them.
const insertedEventIds: number[] = [];

async function insertEvent(
  eventName: "capability_section_impression" | "capability_cta_click",
  source: string,
  section: string,
  createdAt: Date,
): Promise<void> {
  const [row] = await db
    .insert(eventsTable)
    .values({
      eventName,
      metadata: { source, section },
      createdAt,
    })
    .returning({ id: eventsTable.id });
  insertedEventIds.push(row.id);
}

async function purgeInsertedEvents(): Promise<void> {
  if (insertedEventIds.length === 0) return;
  await db.delete(eventsTable).where(inArray(eventsTable.id, insertedEventIds));
  insertedEventIds.length = 0;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run this integration test.");
    process.exit(2);
  }
  const SECRET = process.env.JWT_SECRET;
  if (!SECRET) {
    console.error("JWT_SECRET is required to run this integration test.");
    process.exit(2);
  }

  console.log("=== CTA section-engagement trend bucketing tests ===");

  // --- Set up an admin user we can authenticate as. We bypass /auth/register
  // and write directly to usersTable so the test isn't gated on the
  // verify-email roundtrip; it also makes the test independent of the
  // rate limiter that the registration path enforces.
  const passwordHash = await bcrypt.hash("trend-test-strong-password", 4);
  const [user] = await db
    .insert(usersTable)
    .values({
      email: ADMIN_EMAIL,
      name: "Section Trend Admin",
      passwordHash,
      role: "user",
      tokenVersion: 0,
    })
    .returning({ id: usersTable.id, email: usersTable.email });
  const adminToken = jwt.sign(
    { userId: user.id, tokenVersion: 0 },
    SECRET,
    { expiresIn: "1h" },
  );

  const server = await startServer();
  try {
    // Sanity-check that ADMIN_EMAILS configuration actually allows our
    // synthetic admin through. Without this, a 403 below would look
    // like a bug in the bucketing rather than test setup.
    const probe = await fetch(`${server.baseUrl}/api/admin/cta-conversion?range=all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    check(
      "synthetic admin can hit /api/admin/cta-conversion",
      probe.ok,
      `status=${probe.status} body=${(await probe.text()).slice(0, 160)}`,
    );

    // === Case 1: range=7d (bucketUnit=day, bucketCount=7) ===
    console.log("\n\u2014 7d range: per-day buckets line up with seeded events");

    const dayMs = 24 * 60 * 60 * 1000;
    const now7 = Date.now();
    // Seed five impressions across distinct UTC days in the current
    // 7-day window. We use noon UTC of each target day so date_trunc
    // and our local index math agree regardless of the test's
    // wall-clock time. We pick days that are at least 24h before "now"
    // and at most 6 full days back, so the route's clamp (which puts
    // anything past the boundary into the last slot) doesn't kick in.
    const seededDays7d = [1, 2, 3, 4, 5];
    for (const daysAgo of seededDays7d) {
      const eventDay = new Date(now7 - daysAgo * dayMs);
      // Pin to noon UTC of that day so the inserted timestamp's
      // date_trunc('day') is unambiguously that calendar day.
      const noonUTC = new Date(
        Date.UTC(
          eventDay.getUTCFullYear(),
          eventDay.getUTCMonth(),
          eventDay.getUTCDate(),
          12,
          0,
          0,
          0,
        ),
      );
      await insertEvent("capability_section_impression", SOURCE, SECTION, noonUTC);
    }
    // Add two CTA clicks on the same source/section so we can verify
    // clicksTrend independently from impressionsTrend.
    const clickDay = new Date(now7 - 2 * dayMs);
    const clickNoonUTC = new Date(
      Date.UTC(
        clickDay.getUTCFullYear(),
        clickDay.getUTCMonth(),
        clickDay.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
    await insertEvent("capability_cta_click", SOURCE, SECTION, clickNoonUTC);
    await insertEvent("capability_cta_click", SOURCE, SECTION, clickNoonUTC);

    // Also seed impressions OUTSIDE the 7d window — one inside the 7d
    // *prior* half (10 days ago, between priorStart=14d and currentStart=7d)
    // and two further back (22 / 50 days) that still fall inside the 90d
    // window. The 10-day-ago event proves that the 7d sparkline excludes
    // prior-period events even when they show up in the row total. The
    // 22/50-day-ago events let the 90d weekly-bucket assertion below
    // pin down per-week placement across multiple distinct ISO weeks
    // (days 22 and 50 land in clearly different weekly buckets from
    // anything in the last 14 days, so the assertion stays sharp even
    // if the test happens to run on a Monday/Sunday boundary).
    const seededExtraDays = [10, 22, 50];
    for (const daysAgo of seededExtraDays) {
      const d = new Date(now7 - daysAgo * dayMs);
      const noonUTC = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0),
      );
      await insertEvent("capability_section_impression", SOURCE, SECTION, noonUTC);
    }
    // Seed a click 22 days ago too, so the 90d clicksTrend isn't a
    // single-bucket histogram. Together with the two clicks at day 2,
    // the 90d clicksTrend should land in (at least) two distinct
    // weekly buckets — a regression that flattens all clicks into the
    // last bucket would fail the histogram comparison below even
    // though it would pass a "sum equals total" check.
    const click22Day = new Date(now7 - 22 * dayMs);
    const click22NoonUTC = new Date(
      Date.UTC(
        click22Day.getUTCFullYear(),
        click22Day.getUTCMonth(),
        click22Day.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
    await insertEvent("capability_cta_click", SOURCE, SECTION, click22NoonUTC);

    const before7d = Date.now();
    const cta7d = await fetchCta(server.baseUrl, adminToken, "7d");
    const after7d = Date.now();
    // Use the midpoint of the request window as our "now" estimate for
    // the expected-index math. The route reads new Date() once at the
    // top of the handler, so any wall-clock value between before/after
    // is within a few ms of cfg.now.
    const approxNow7 = Math.floor((before7d + after7d) / 2);

    check(
      "7d response advertises bucketUnit=day and bucketCount=7",
      cta7d.bucketUnit === "day" && cta7d.bucketCount === 7,
      `bucketUnit=${cta7d.bucketUnit} bucketCount=${cta7d.bucketCount}`,
    );

    const sectionEntry7d = cta7d.sectionEngagement?.find((p) => p.source === SOURCE);
    check(
      "7d response surfaces our seeded source in sectionEngagement",
      !!sectionEntry7d,
      `sources=${cta7d.sectionEngagement?.map((p) => p.source).join(",")}`,
    );
    if (!sectionEntry7d) {
      throw new Error("missing seeded source in 7d response; aborting further checks");
    }

    const heroRow7d = sectionEntry7d.sections.find((s) => s.section === SECTION);
    check(
      "7d response surfaces the hero section row for our seeded source",
      !!heroRow7d,
      `sections=${sectionEntry7d.sections.map((s) => s.section).join(",")}`,
    );
    if (!heroRow7d) throw new Error("missing hero row in 7d response; aborting");

    // Section row totals (impressions/clicks) intentionally include the
    // prior 7d half of the windowFilter (2*bucketCount*bucketMs back), so
    // the row reports 5 + 1 = 6 even though only 5 are inside the
    // sparkline window. Trend arrays must still exclude the prior-period
    // event; that asymmetry is the reason this test exists at all.
    check(
      "7d hero impressions == 6 (5 current-window + 1 prior-window event surface in the row total)",
      heroRow7d.impressions === 6,
      `impressions=${heroRow7d.impressions}`,
    );
    check(
      "7d hero clicks count == 2 seeded events in current window",
      heroRow7d.clicks === 2,
      `clicks=${heroRow7d.clicks}`,
    );

    check(
      "7d hero impressionsTrend has length === bucketCount (7)",
      Array.isArray(heroRow7d.impressionsTrend) && heroRow7d.impressionsTrend.length === 7,
      `length=${heroRow7d.impressionsTrend?.length}`,
    );
    check(
      "7d hero clicksTrend has length === bucketCount (7)",
      Array.isArray(heroRow7d.clicksTrend) && heroRow7d.clicksTrend.length === 7,
      `length=${heroRow7d.clicksTrend?.length}`,
    );

    const impSum7d = heroRow7d.impressionsTrend.reduce((a, b) => a + b, 0);
    const clkSum7d = heroRow7d.clicksTrend.reduce((a, b) => a + b, 0);
    check(
      "7d impressionsTrend sums to the row's impressions total (5; older event excluded)",
      impSum7d === 5,
      `sum=${impSum7d}`,
    );
    check(
      "7d clicksTrend sums to the row's clicks total (2)",
      clkSum7d === 2,
      `sum=${clkSum7d}`,
    );

    // Spot-check that each seeded impression landed in exactly the
    // bucket the route's trendIndex helper would compute for it. We
    // build an expected histogram from the same math the route uses
    // and compare cell-by-cell.
    const expectedImp7d = new Array(7).fill(0) as number[];
    for (const daysAgo of seededDays7d) {
      const ts = Date.UTC(
        new Date(now7 - daysAgo * dayMs).getUTCFullYear(),
        new Date(now7 - daysAgo * dayMs).getUTCMonth(),
        new Date(now7 - daysAgo * dayMs).getUTCDate(),
        12,
      );
      const idx = expectedTrendIndex(ts, approxNow7, 7, dayMs);
      expectedImp7d[idx] += 1;
    }
    check(
      "7d impressionsTrend histogram matches the per-day seed plan",
      JSON.stringify(heroRow7d.impressionsTrend) === JSON.stringify(expectedImp7d),
      `actual=${JSON.stringify(heroRow7d.impressionsTrend)} expected=${JSON.stringify(expectedImp7d)}`,
    );

    const expectedClk7d = new Array(7).fill(0) as number[];
    {
      const ts = Date.UTC(
        clickDay.getUTCFullYear(),
        clickDay.getUTCMonth(),
        clickDay.getUTCDate(),
        12,
      );
      const idx = expectedTrendIndex(ts, approxNow7, 7, dayMs);
      expectedClk7d[idx] += 2;
    }
    check(
      "7d clicksTrend histogram matches the per-day seed plan",
      JSON.stringify(heroRow7d.clicksTrend) === JSON.stringify(expectedClk7d),
      `actual=${JSON.stringify(heroRow7d.clicksTrend)} expected=${JSON.stringify(expectedClk7d)}`,
    );

    // === Case 2: range=90d (bucketUnit=week, bucketCount=13) ===
    console.log("\n\u2014 90d range: per-week buckets are flagged correctly");

    const before90d = Date.now();
    const cta90d = await fetchCta(server.baseUrl, adminToken, "90d");
    const after90d = Date.now();
    const approxNow90 = Math.floor((before90d + after90d) / 2);
    const weekMs = 7 * dayMs;

    check(
      "90d response advertises bucketUnit=week and bucketCount=13",
      cta90d.bucketUnit === "week" && cta90d.bucketCount === 13,
      `bucketUnit=${cta90d.bucketUnit} bucketCount=${cta90d.bucketCount}`,
    );
    const sectionEntry90d = cta90d.sectionEngagement?.find((p) => p.source === SOURCE);
    if (!sectionEntry90d) {
      throw new Error("missing seeded source in 90d response; aborting");
    }
    const heroRow90d = sectionEntry90d.sections.find((s) => s.section === SECTION);
    if (!heroRow90d) throw new Error("missing hero row in 90d response; aborting");
    check(
      "90d hero impressionsTrend has length === 13",
      heroRow90d.impressionsTrend.length === 13,
      `length=${heroRow90d.impressionsTrend.length}`,
    );
    check(
      "90d hero clicksTrend has length === 13",
      heroRow90d.clicksTrend.length === 13,
      `length=${heroRow90d.clicksTrend.length}`,
    );
    // priorStart for 90d = 2 * 13 * 7 = 182 days back, so every seeded
    // event we wrote — the 5 day-1..5 impressions, the day-10
    // impression, and the day-22 / day-50 impressions — all fall inside
    // the row's windowFilter and contribute to the row total. Total
    // impressions = 5 + 1 + 1 + 1 = 8; total clicks = 2 (day 2) + 1
    // (day 22) = 3.
    check(
      "90d hero impressions == 8 (every seeded impression is within the 90d row windowFilter)",
      heroRow90d.impressions === 8,
      `impressions=${heroRow90d.impressions}`,
    );
    check(
      "90d hero clicks == 3 (every seeded click is within the 90d row windowFilter)",
      heroRow90d.clicks === 3,
      `clicks=${heroRow90d.clicks}`,
    );
    check(
      "90d impressionsTrend sums to the row's impressions total (8)",
      heroRow90d.impressionsTrend.reduce((a, b) => a + b, 0) === 8,
      `sum=${heroRow90d.impressionsTrend.reduce((a, b) => a + b, 0)}`,
    );
    check(
      "90d clicksTrend sums to the row's clicks total (3)",
      heroRow90d.clicksTrend.reduce((a, b) => a + b, 0) === 3,
      `sum=${heroRow90d.clicksTrend.reduce((a, b) => a + b, 0)}`,
    );

    // ---- Per-week bucket placement ---------------------------------------
    //
    // The whole point of this test exists right here. The route uses
    // postgres' date_trunc('week', createdAt) to bucket events into
    // ISO weeks (Monday 00:00 UTC start), and trendIndex maps each
    // truncated timestamp to a slot in [0, bucketCount-1]. A regression
    // that mixes up date_trunc('day') for date_trunc('week'), or that
    // uses a different week start (Sunday vs Monday), would still leave
    // the trend array length AND the sum correct, but every event
    // would land in a different slot than expected.
    //
    // We rebuild the expected per-week histogram from the same math the
    // route uses (`expectedTrendIndex` mirrors trendIndex with weekly
    // bucketing) and assert cell-by-cell — both for impressions and
    // for clicks — so any per-slot drift fails this assertion with a
    // legible diff.
    const seededImpressionDays90d = [...seededDays7d, ...seededExtraDays];
    const expectedImp90d = new Array(13).fill(0) as number[];
    for (const daysAgo of seededImpressionDays90d) {
      const d = new Date(now7 - daysAgo * dayMs);
      const ts = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
      const idx = expectedTrendIndex(ts, approxNow90, 13, weekMs);
      expectedImp90d[idx] += 1;
    }
    check(
      "90d impressionsTrend per-week histogram matches the seed plan slot-by-slot",
      JSON.stringify(heroRow90d.impressionsTrend) === JSON.stringify(expectedImp90d),
      `actual=${JSON.stringify(heroRow90d.impressionsTrend)} expected=${JSON.stringify(expectedImp90d)}`,
    );

    const expectedClk90d = new Array(13).fill(0) as number[];
    {
      const ts2 = Date.UTC(
        clickDay.getUTCFullYear(),
        clickDay.getUTCMonth(),
        clickDay.getUTCDate(),
        12,
      );
      const idxRecent = expectedTrendIndex(ts2, approxNow90, 13, weekMs);
      expectedClk90d[idxRecent] += 2;

      const ts22 = Date.UTC(
        click22Day.getUTCFullYear(),
        click22Day.getUTCMonth(),
        click22Day.getUTCDate(),
        12,
      );
      const idx22 = expectedTrendIndex(ts22, approxNow90, 13, weekMs);
      expectedClk90d[idx22] += 1;
    }
    check(
      "90d clicksTrend per-week histogram matches the seed plan slot-by-slot",
      JSON.stringify(heroRow90d.clicksTrend) === JSON.stringify(expectedClk90d),
      `actual=${JSON.stringify(heroRow90d.clicksTrend)} expected=${JSON.stringify(expectedClk90d)}`,
    );

    // The clicks-trend histogram MUST be non-trivial — i.e. the two
    // distinct seeded click days land in two distinct weekly buckets,
    // not a single one. A "we collapsed everything into the last
    // bucket" regression would still pass the sum check above, but it
    // would fail this one: the `nonZeroBuckets` count must be >= 2.
    const nonZeroClickBuckets = heroRow90d.clicksTrend.filter((v) => v > 0).length;
    check(
      "90d clicksTrend spreads across >= 2 distinct weekly buckets",
      nonZeroClickBuckets >= 2,
      `nonZero buckets=${nonZeroClickBuckets} trend=${JSON.stringify(heroRow90d.clicksTrend)}`,
    );

    // === Case 3: range=all → trends fall back to [] ===
    console.log("\n\u2014 all range: trend arrays empty so the UI shows the dash");

    const ctaAll = await fetchCta(server.baseUrl, adminToken, "all");
    check(
      "all-time response sets bucketUnit=null",
      ctaAll.bucketUnit === null,
      `bucketUnit=${ctaAll.bucketUnit}`,
    );
    check(
      "all-time response sets bucketCount=0",
      ctaAll.bucketCount === 0,
      `bucketCount=${ctaAll.bucketCount}`,
    );
    const sectionEntryAll = ctaAll.sectionEngagement?.find((p) => p.source === SOURCE);
    if (!sectionEntryAll) {
      throw new Error("missing seeded source in all-time response; aborting");
    }
    const heroRowAll = sectionEntryAll.sections.find((s) => s.section === SECTION);
    if (!heroRowAll) throw new Error("missing hero row in all-time response; aborting");
    check(
      "all-time impressionsTrend is an empty array",
      Array.isArray(heroRowAll.impressionsTrend) && heroRowAll.impressionsTrend.length === 0,
      `value=${JSON.stringify(heroRowAll.impressionsTrend)}`,
    );
    check(
      "all-time clicksTrend is an empty array",
      Array.isArray(heroRowAll.clicksTrend) && heroRowAll.clicksTrend.length === 0,
      `value=${JSON.stringify(heroRowAll.clicksTrend)}`,
    );
    check(
      "all-time hero impressions counts every seeded event (5 + 1 + 1 + 1 = 8)",
      heroRowAll.impressions === 8,
      `impressions=${heroRowAll.impressions}`,
    );
    check(
      "all-time hero clicks counts every seeded click (2 + 1 = 3)",
      heroRowAll.clicks === 3,
      `clicks=${heroRowAll.clicks}`,
    );
  } finally {
    // Cleanup: drop seeded events first (FK constraint set userId nullable
    // so we don't need to worry about that), then the synthetic admin user.
    try {
      await purgeInsertedEvents();
    } catch (err) {
      console.error("event cleanup failed:", err);
    }
    try {
      await db.delete(usersTable).where(eq(usersTable.email, ADMIN_EMAIL));
    } catch (err) {
      console.error("user cleanup failed:", err);
    }
    await server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
