import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  financialModelsTable,
  exportsTable,
  eventsTable,
  coachSurfaceOverridesTable,
} from "@workspace/db/schema";
import { count, countDistinct, gte, desc, sql, eq, and, inArray } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";
import { runConsultantEngine, computeYearFinancialsFromData } from "../lib/consultant-engine";
import { normalizeRevenueRows, type RevenueRow } from "../lib/workbook-helpers";
import { sendReviewFeedback } from "../lib/mailer";
import { computeDaysCashOnHand } from "../lib/workbook-helpers.js";
import { sharedLinksTable } from "@workspace/db/schema";
import { isNull } from "drizzle-orm";
import { schoolTypeDisplay, entityTypeDisplay } from "../lib/pdf-utils";
import { computeAnnualDscr } from "@workspace/finance";

function normalizeModelData(data: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(data.revenueRows)) {
    return { ...data, revenueRows: normalizeRevenueRows(data.revenueRows as RevenueRow[]) };
  }
  return data;
}

const router: IRouter = Router();

router.get(
  "/admin/analytics",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const [userCountResult] = await db
        .select({ value: count() })
        .from(usersTable);
      const totalUsers = userCountResult.value;

      const [modelCountResult] = await db
        .select({ value: count() })
        .from(financialModelsTable);
      const totalModels = modelCountResult.value;

      const [exportCountResult] = await db
        .select({ value: count() })
        .from(exportsTable);
      const totalExports = exportCountResult.value;

      const recentSignups = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt))
        .limit(10);

      const recentExports = await db
        .select({
          id: exportsTable.id,
          format: exportsTable.format,
          createdAt: exportsTable.createdAt,
          modelName: financialModelsTable.name,
          userName: usersTable.name,
          // Provenance for share-link-driven downloads (see exports schema
          // in lib/db/src/schema/exports.ts). When `sharedLinkId` is set the
          // row was recorded against the model owner because a recipient
          // downloaded via /shared/:token; the optional `viewerLabel`
          // captures who the founder said the link was for.
          sharedLinkId: exportsTable.sharedLinkId,
          viewerLabel: exportsTable.viewerLabel,
        })
        .from(exportsTable)
        .leftJoin(
          financialModelsTable,
          eq(exportsTable.modelId, financialModelsTable.id),
        )
        .leftJoin(usersTable, eq(exportsTable.userId, usersTable.id))
        .orderBy(desc(exportsTable.createdAt))
        .limit(10);

      const schoolTypes = await db
        .select({
          schoolType: sql<string>`data->'schoolProfile'->>'schoolType'`.as(
            "school_type",
          ),
          count: count(),
        })
        .from(financialModelsTable)
        .where(
          sql`data->'schoolProfile'->>'schoolType' IS NOT NULL AND data->'schoolProfile'->>'schoolType' != ''`,
        )
        .groupBy(sql`data->'schoolProfile'->>'schoolType'`)
        .orderBy(desc(count()));

      const schoolStages = await db
        .select({
          stage: sql<string>`data->'schoolProfile'->>'schoolStage'`.as("school_stage"),
          count: count(),
        })
        .from(financialModelsTable)
        .where(
          sql`data->'schoolProfile'->>'schoolStage' IS NOT NULL AND data->'schoolProfile'->>'schoolStage' != ''`,
        )
        .groupBy(sql`data->'schoolProfile'->>'schoolStage'`)
        .orderBy(desc(count()));

      const fundingProfiles = await db
        .select({
          profile: sql<string>`data->'schoolProfile'->>'fundingProfile'`.as("funding_profile"),
          count: count(),
        })
        .from(financialModelsTable)
        .where(
          sql`data->'schoolProfile'->>'fundingProfile' IS NOT NULL AND data->'schoolProfile'->>'fundingProfile' != ''`,
        )
        .groupBy(sql`data->'schoolProfile'->>'fundingProfile'`)
        .orderBy(desc(count()));

      const topRevenueLines = await db
        .select({
          lineItem: sql<string>`item->>'lineItem'`.as("line_item"),
          count: count(),
        })
        .from(
          sql`${financialModelsTable}, jsonb_array_elements(data->'revenueRows') AS item`,
        )
        .where(sql`(item->>'enabled')::boolean = true`)
        .groupBy(sql`item->>'lineItem'`)
        .orderBy(desc(count()))
        .limit(10);

      const topExpenseCategories = await db
        .select({
          category: sql<string>`item->>'category'`.as("category"),
          count: count(),
        })
        .from(
          sql`${financialModelsTable}, jsonb_array_elements(data->'expenseRows') AS item`,
        )
        .where(sql`(item->>'enabled')::boolean = true`)
        .groupBy(sql`item->>'category'`)
        .orderBy(desc(count()))
        .limit(10);

      const exportsByType = await db
        .select({
          schoolType: sql<string>`data->'schoolProfile'->>'schoolType'`.as("school_type"),
          totalModels: count(financialModelsTable.id).as("total_models"),
          exportedModels: sql<number>`COUNT(DISTINCT ${exportsTable.modelId})`.as("exported_models"),
        })
        .from(financialModelsTable)
        .leftJoin(exportsTable, eq(financialModelsTable.id, exportsTable.modelId))
        .where(
          sql`data->'schoolProfile'->>'schoolType' IS NOT NULL AND data->'schoolProfile'->>'schoolType' != ''`,
        )
        .groupBy(sql`data->'schoolProfile'->>'schoolType'`);

      const [year5Result] = await db
        .select({
          total: count(),
          extended: sql<number>`COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(data->'revenueRows', '[]'::jsonb)) > 0 AND jsonb_array_length((data->'revenueRows'->0->'amounts')) >= 5)`.as("extended"),
        })
        .from(financialModelsTable)
        .where(sql`jsonb_array_length(COALESCE(data->'revenueRows', '[]'::jsonb)) > 0`);

      const [usersWithModelResult] = await db
        .select({ value: countDistinct(financialModelsTable.userId) })
        .from(financialModelsTable);
      const usersWithModel = usersWithModelResult.value;

      const [reachedReviewResult] = await db
        .select({ value: countDistinct(financialModelsTable.userId) })
        .from(financialModelsTable)
        .where(gte(financialModelsTable.currentStep, 6));
      const reachedReview = reachedReviewResult.value;

      const [exportedResult] = await db
        .select({ value: countDistinct(exportsTable.userId) })
        .from(exportsTable)
        .where(eq(exportsTable.format, "xlsx"));
      const exported = exportedResult.value;

      // Task #537 — surface the abandoned-vs-verified ratio so a sudden
      // spike (mailer outage, broken verification link, copy regression)
      // is visible on the admin dashboard. We pair the lifetime totals
      // with a 14-day daily breakdown so the UI can render a sparkline
      // and the founder/admin can eyeball the trend without leaving the
      // page. `signed_up` is logged from /auth/verify-email and
      // `signup_abandoned` is emitted by cleanupExpiredPendingSignups
      // for each pending row it sweeps.
      const SIGNUP_TREND_DAYS = 14;
      // Floor to the start of *today* (UTC) before stepping back the
      // window, so the bucket math below lines up exactly with
      // date_trunc('day', ...) on the SQL side. Without this the window
      // starts mid-day and the oldest bucket gets indexed to -1 and
      // dropped.
      const todayStartMs = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
      const trendStart = new Date(todayStartMs - (SIGNUP_TREND_DAYS - 1) * 24 * 60 * 60 * 1000);
      const signupOutcomeRows = await db
        .select({
          eventName: eventsTable.eventName,
          value: count(),
        })
        .from(eventsTable)
        .where(inArray(eventsTable.eventName, ["signed_up", "signup_abandoned"]))
        .groupBy(eventsTable.eventName);
      let totalVerifiedSignups = 0;
      let totalAbandonedSignups = 0;
      for (const r of signupOutcomeRows) {
        if (r.eventName === "signed_up") totalVerifiedSignups = r.value;
        else if (r.eventName === "signup_abandoned") totalAbandonedSignups = r.value;
      }
      const signupTrendRows = await db
        .select({
          eventName: eventsTable.eventName,
          day: sql<Date>`date_trunc('day', ${eventsTable.createdAt})`.as("day"),
          value: count(),
        })
        .from(eventsTable)
        .where(
          and(
            inArray(eventsTable.eventName, ["signed_up", "signup_abandoned"]),
            gte(eventsTable.createdAt, trendStart),
          ),
        )
        .groupBy(eventsTable.eventName, sql`date_trunc('day', ${eventsTable.createdAt})`);
      const verifiedTrend = new Array(SIGNUP_TREND_DAYS).fill(0) as number[];
      const abandonedTrend = new Array(SIGNUP_TREND_DAYS).fill(0) as number[];
      const dayMs = 24 * 60 * 60 * 1000;
      const trendStartMs = trendStart.getTime();
      for (const r of signupTrendRows) {
        const ts = (r.day instanceof Date ? r.day : new Date(r.day)).getTime();
        const idx = Math.floor((ts - trendStartMs) / dayMs);
        if (idx < 0 || idx >= SIGNUP_TREND_DAYS) continue;
        if (r.eventName === "signed_up") verifiedTrend[idx] += r.value;
        else if (r.eventName === "signup_abandoned") abandonedTrend[idx] += r.value;
      }
      const totalSignupAttempts = totalVerifiedSignups + totalAbandonedSignups;
      const abandonmentRate =
        totalSignupAttempts > 0 ? totalAbandonedSignups / totalSignupAttempts : 0;

      // Task #779 — break the verified-vs-abandoned counts down by email
      // domain so a single provider silently spam-foldering our
      // verification email (Outlook, a school district's mail server,
      // etc.) is distinguishable from "the link copy is confusing".
      // `signup_abandoned` carries the lowercased domain in
      // metadata.domain (see cleanupExpiredPendingSignups in
      // routes/auth.ts). `signed_up` carries the full email in
      // metadata.email; we extract the domain server-side with
      // split_part(lower(...), '@', 2) so the join key matches.
      const abandonedByDomainRows = await db
        .select({
          domain: sql<string>`metadata->>'domain'`.as("domain"),
          value: count(),
        })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.eventName, "signup_abandoned"),
            sql`metadata->>'domain' IS NOT NULL AND metadata->>'domain' <> ''`,
          ),
        )
        .groupBy(sql`metadata->>'domain'`);
      const verifiedByDomainRows = await db
        .select({
          domain: sql<string>`split_part(lower(metadata->>'email'), '@', 2)`.as(
            "domain",
          ),
          value: count(),
        })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.eventName, "signed_up"),
            sql`metadata->>'email' IS NOT NULL`,
            sql`position('@' in metadata->>'email') > 0`,
          ),
        )
        .groupBy(sql`split_part(lower(metadata->>'email'), '@', 2)`);
      const domainCounts = new Map<
        string,
        { verified: number; abandoned: number }
      >();
      const upsertDomain = (
        domain: string,
        field: "verified" | "abandoned",
        value: number,
      ) => {
        const key = domain && domain.length > 0 ? domain : "unknown";
        const cur = domainCounts.get(key) || { verified: 0, abandoned: 0 };
        cur[field] += value;
        domainCounts.set(key, cur);
      };
      for (const r of verifiedByDomainRows) upsertDomain(r.domain, "verified", r.value);
      for (const r of abandonedByDomainRows)
        upsertDomain(r.domain, "abandoned", r.value);
      // Hide tiny samples so a single one-off attempt from a typo'd
      // domain ("gmial.com") doesn't dominate the table at 100%
      // abandoned. Anything with fewer than this many total attempts
      // gets rolled into a single "Other (small samples)" row, which
      // is itself dropped if it ends up empty. Keep the threshold low
      // — this is an internal admin view and we'd rather see noisy
      // signal than nothing.
      const SMALL_SAMPLE_THRESHOLD = 3;
      const MAX_DOMAIN_ROWS = 10;
      type DomainRow = {
        domain: string;
        verified: number;
        abandoned: number;
        total: number;
        abandonmentRate: number;
      };
      const allDomainRows: DomainRow[] = [];
      let otherVerified = 0;
      let otherAbandoned = 0;
      for (const [domain, c] of domainCounts.entries()) {
        const total = c.verified + c.abandoned;
        if (total < SMALL_SAMPLE_THRESHOLD) {
          otherVerified += c.verified;
          otherAbandoned += c.abandoned;
          continue;
        }
        allDomainRows.push({
          domain,
          verified: c.verified,
          abandoned: c.abandoned,
          total,
          abandonmentRate: total > 0 ? c.abandoned / total : 0,
        });
      }
      // Rank by absolute abandoned count (the column the admin cares
      // about) with a total-attempts tiebreak so a 5/5 domain doesn't
      // outrank a 50/100 one. Cap the list so the panel stays compact.
      allDomainRows.sort((a, b) => {
        if (b.abandoned !== a.abandoned) return b.abandoned - a.abandoned;
        return b.total - a.total;
      });
      const signupDomainBreakdown = allDomainRows.slice(0, MAX_DOMAIN_ROWS);
      const otherTotal = otherVerified + otherAbandoned;
      const signupDomainOther =
        otherTotal > 0
          ? {
              verified: otherVerified,
              abandoned: otherAbandoned,
              total: otherTotal,
              abandonmentRate: otherTotal > 0 ? otherAbandoned / otherTotal : 0,
              domainCount:
                Array.from(domainCounts.values()).filter(
                  (c) => c.verified + c.abandoned < SMALL_SAMPLE_THRESHOLD,
                ).length,
            }
          : null;

      res.json({
        totalUsers,
        totalModels,
        totalExports,
        recentSignups: recentSignups.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
        recentExports: recentExports.map((e) => ({
          id: e.id,
          format: e.format,
          modelName: e.modelName || "Unknown Model",
          userName: e.userName || "Unknown User",
          createdAt: e.createdAt.toISOString(),
          // Frontend renders a "via shared link" provenance pill when this
          // is true; the optional viewerLabel further specifies who the
          // founder named the link for ("Board Chair", "First National
          // Bank", etc).
          viaSharedLink: e.sharedLinkId != null,
          viewerLabel: e.viewerLabel,
        })),
        schoolTypeDistribution: schoolTypes.map((s) => ({
          type: s.schoolType || "unknown",
          count: s.count,
        })),
        schoolStageDistribution: schoolStages.map((s) => ({
          stage: s.stage || "unknown",
          count: s.count,
        })),
        fundingProfileDistribution: fundingProfiles.map((f) => ({
          profile: f.profile || "unknown",
          count: f.count,
        })),
        topRevenueLines: topRevenueLines.map((r) => ({
          lineItem: r.lineItem,
          count: r.count,
        })),
        topExpenseCategories: topExpenseCategories.map((e) => ({
          category: e.category,
          count: e.count,
        })),
        exportRateByType: exportsByType.map((e) => ({
          type: e.schoolType || "unknown",
          totalModels: e.totalModels,
          exportedModels: Number(e.exportedModels),
          rate: e.totalModels > 0 ? Number(e.exportedModels) / e.totalModels : 0,
        })),
        year5Adoption: {
          totalRowModels: year5Result.total,
          extendedTo5: Number(year5Result.extended),
          rate: year5Result.total > 0 ? Number(year5Result.extended) / year5Result.total : 0,
        },
        funnel: {
          signedUp: totalUsers,
          createdModel: usersWithModel,
          reachedReview: reachedReview,
          exported: exported,
        },
        // Task #537 — abandoned-vs-verified signups. `trendDays` arrays
        // run from oldest → newest day so the UI can render a sparkline
        // left-to-right.
        signupVerification: {
          verified: totalVerifiedSignups,
          abandoned: totalAbandonedSignups,
          totalAttempts: totalSignupAttempts,
          abandonmentRate,
          trendDays: SIGNUP_TREND_DAYS,
          verifiedTrend,
          abandonedTrend,
          // Task #779 — per-domain breakdown so admins can tell which
          // mail providers are silently dropping the verification
          // email. Pre-sorted by abandoned count desc; small-sample
          // domains (< 3 total attempts) are rolled into `other`.
          domainBreakdown: signupDomainBreakdown,
          domainOther: signupDomainOther,
          domainSmallSampleThreshold: SMALL_SAMPLE_THRESHOLD,
        },
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  },
);

type CtaRange = "7d" | "30d" | "90d" | "all";

interface RangeConfig {
  range: CtaRange;
  windowed: boolean;
  bucketUnit: "day" | "week";
  bucketCount: number;
  bucketMs: number;
  currentStart: Date;
  priorStart: Date;
  now: Date;
}

function getCtaRangeConfig(rangeParam: unknown): RangeConfig {
  const now = new Date();
  const parsed: CtaRange =
    rangeParam === "7d" || rangeParam === "30d" || rangeParam === "90d"
      ? rangeParam
      : "all";
  if (parsed === "all") {
    return {
      range: "all",
      windowed: false,
      bucketUnit: "day",
      bucketCount: 0,
      bucketMs: 0,
      currentStart: new Date(0),
      priorStart: new Date(0),
      now,
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const days = parsed === "7d" ? 7 : parsed === "30d" ? 30 : 90;
  const bucketUnit: "day" | "week" = parsed === "90d" ? "week" : "day";
  const bucketMs = bucketUnit === "week" ? 7 * dayMs : dayMs;
  const bucketCount = parsed === "90d" ? 13 : days;
  const currentStart = new Date(now.getTime() - bucketCount * bucketMs);
  const priorStart = new Date(now.getTime() - 2 * bucketCount * bucketMs);
  return {
    range: parsed,
    windowed: true,
    bucketUnit,
    bucketCount,
    bucketMs,
    currentStart,
    priorStart,
    now,
  };
}

// Walk a list of bucketed event rows (each tagged by a string key) and:
//   * accumulate "current period" and "prior period" totals per key, and
//   * build a fixed-length sparkline array for the current period only.
// Buckets that fall before `priorStart` are ignored (defensive: the SQL
// already filters by priorStart, but if the caller asks for "all" we
// short-circuit earlier and never enter this function).
function bucketize<T extends { bucket: Date | string; key: string; count: number }>(
  rows: T[],
  cfg: RangeConfig,
): { current: Map<string, number>; prior: Map<string, number>; sparklines: Map<string, number[]> } {
  const current = new Map<string, number>();
  const prior = new Map<string, number>();
  const sparklines = new Map<string, number[]>();
  if (!cfg.windowed) {
    // "All time" path — every row counts toward the current period and
    // there is no prior period or sparkline.
    for (const row of rows) {
      current.set(row.key, (current.get(row.key) || 0) + row.count);
    }
    return { current, prior, sparklines };
  }
  const startMs = cfg.currentStart.getTime();
  const priorMs = cfg.priorStart.getTime();
  const bucketMs = cfg.bucketMs;
  const bucketCount = cfg.bucketCount;
  for (const row of rows) {
    const ts = (row.bucket instanceof Date ? row.bucket : new Date(row.bucket)).getTime();
    if (ts < priorMs) continue;
    if (ts < startMs) {
      prior.set(row.key, (prior.get(row.key) || 0) + row.count);
    } else {
      current.set(row.key, (current.get(row.key) || 0) + row.count);
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((ts - startMs) / bucketMs)),
      );
      let arr = sparklines.get(row.key);
      if (!arr) {
        arr = new Array(bucketCount).fill(0) as number[];
        sparklines.set(row.key, arr);
      }
      arr[idx] += row.count;
    }
  }
  return { current, prior, sparklines };
}

router.get(
  "/admin/cta-conversion",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const cfg = getCtaRangeConfig(req.query.range);

      // SQL helpers: when windowed, filter to [priorStart, now] and bucket by
      // day/week; when "all", aggregate everything to a single sentinel bucket
      // so the rest of the pipeline can stay uniform.
      const bucketExpr = cfg.windowed
        ? cfg.bucketUnit === "week"
          ? sql<Date>`date_trunc('week', created_at)`
          : sql<Date>`date_trunc('day', created_at)`
        : sql<Date>`to_timestamp(0)`;
      const windowFilter = cfg.windowed
        ? gte(eventsTable.createdAt, cfg.priorStart)
        : undefined;

      const capabilityClicks = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          position: sql<string>`metadata->>'position'`.as("position"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "capability_cta_click"), windowFilter)
            : eq(eventsTable.eventName, "capability_cta_click"),
        )
        .groupBy(
          sql`metadata->>'source'`,
          sql`metadata->>'position'`,
          bucketExpr,
        );

      const audienceClicks = await db
        .select({
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "audience_card_click"), windowFilter)
            : eq(eventsTable.eventName, "audience_card_click"),
        )
        .groupBy(sql`metadata->>'audience'`, bucketExpr);

      const crossLinkClicks = await db
        .select({
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          source: sql<string>`metadata->>'source'`.as("source"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "capability_cross_link_click"), windowFilter)
            : eq(eventsTable.eventName, "capability_cross_link_click"),
        )
        .groupBy(sql`metadata->>'audience'`, sql`metadata->>'source'`, bucketExpr);

      const attributedSignups = await db
        .select({
          channel: sql<string>`metadata->>'channel'`.as("channel"),
          source: sql<string>`metadata->>'source'`.as("source"),
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          section: sql<string>`metadata->>'section'`.as("section"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "cta_attributed_signup"), windowFilter)
            : eq(eventsTable.eventName, "cta_attributed_signup"),
        )
        .groupBy(
          sql`metadata->>'channel'`,
          sql`metadata->>'source'`,
          sql`metadata->>'audience'`,
          sql`metadata->>'section'`,
          bucketExpr,
        );

      // Section-level engagement queries (impressions, scroll depth,
      // clicks-by-section). Respect the same window filter as everything else
      // so the section breakdown reflects the selected date range.
      const sectionImpressions = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          section: sql<string>`metadata->>'section'`.as("section"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "capability_section_impression"), windowFilter)
            : eq(eventsTable.eventName, "capability_section_impression"),
        )
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'section'`, bucketExpr);

      const scrollDepths = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          depth: sql<string>`metadata->>'depth'`.as("depth"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(eq(eventsTable.eventName, "capability_scroll_depth"), windowFilter)
            : eq(eventsTable.eventName, "capability_scroll_depth"),
        )
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'depth'`);

      const clicksBySection = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          section: sql<string>`metadata->>'section'`.as("section"),
          bucket: bucketExpr.as("bucket"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          windowFilter
            ? and(
                eq(eventsTable.eventName, "capability_cta_click"),
                sql`metadata->>'section' IS NOT NULL`,
                windowFilter,
              )
            : and(
                eq(eventsTable.eventName, "capability_cta_click"),
                sql`metadata->>'section' IS NOT NULL`,
              ),
        )
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'section'`, bucketExpr);

      // Track per-position click totals (collapsed across the whole current
      // period) for the "Primary CTA" / "Closing CTA" columns.
      const capabilityRows: { source: string; position: string; clicks: number }[] = [];
      const positionTotals = new Map<string, number>();
      for (const r of capabilityClicks) {
        const source = r.source || "unknown";
        const position = r.position || "primary";
        const ts = (r.bucket instanceof Date ? r.bucket : new Date(r.bucket)).getTime();
        // For "all" the bucket is the unix-0 sentinel (always >= currentStart=0).
        if (cfg.windowed && ts < cfg.currentStart.getTime()) continue;
        const key = `${source}|${position}`;
        positionTotals.set(key, (positionTotals.get(key) || 0) + r.count);
      }
      for (const [key, clicks] of positionTotals.entries()) {
        const [source, position] = key.split("|");
        capabilityRows.push({ source, position, clicks });
      }

      const capBuckets = bucketize(
        capabilityClicks.map((r) => ({
          bucket: r.bucket,
          key: r.source || "unknown",
          count: r.count,
        })),
        cfg,
      );

      const audBuckets = bucketize(
        audienceClicks.map((r) => ({
          bucket: r.bucket,
          key: r.audience || "unknown",
          count: r.count,
        })),
        cfg,
      );

      const crossBuckets = bucketize(
        crossLinkClicks.map((r) => ({
          bucket: r.bucket,
          key: `${r.audience || "unknown"}|${r.source || "unknown"}`,
          count: r.count,
        })),
        cfg,
      );

      // Signup attribution split by channel.
      const capSignupCurrent = new Map<string, number>();
      const capSignupPrior = new Map<string, number>();
      const audSignupCurrent = new Map<string, number>();
      const audSignupPrior = new Map<string, number>();
      const crossSignupCurrent = new Map<string, number>();
      const crossSignupPrior = new Map<string, number>();
      // Section-level signups respect the same window — only count current
      // period so they line up with the section impression/click queries.
      const sectionSignups = new Map<string, number>();
      for (const s of attributedSignups) {
        const ts = (s.bucket instanceof Date ? s.bucket : new Date(s.bucket)).getTime();
        const isPrior = cfg.windowed && ts < cfg.currentStart.getTime();
        if (s.channel === "capability" && s.source) {
          const m = isPrior ? capSignupPrior : capSignupCurrent;
          m.set(s.source, (m.get(s.source) || 0) + s.count);
          if (!isPrior && s.section) {
            const key = `${s.source}|${s.section}`;
            sectionSignups.set(key, (sectionSignups.get(key) || 0) + s.count);
          }
        } else if (s.channel === "audience" && s.audience) {
          const m = isPrior ? audSignupPrior : audSignupCurrent;
          m.set(s.audience, (m.get(s.audience) || 0) + s.count);
        } else if (s.channel === "cross_link" && s.audience && s.source) {
          const key = `${s.audience}|${s.source}`;
          const m = isPrior ? crossSignupPrior : crossSignupCurrent;
          m.set(key, (m.get(key) || 0) + s.count);
        }
      }

      // Section-level engagement aggregation. All inputs already respect
      // the active windowFilter, so this reflects the selected date range.
      // We also keep per-bucket trend arrays so the admin UI can render a
      // small sparkline showing whether a recent copy/design change moved
      // engagement up or down on a given section. Trends only exist for
      // windowed ranges; "all" returns empty arrays.
      const startMs = cfg.windowed ? cfg.currentStart.getTime() : 0;
      const bucketMs = cfg.bucketMs;
      const bucketCount = cfg.bucketCount;
      const trendIndex = (ts: number): number =>
        Math.min(
          bucketCount - 1,
          Math.max(0, Math.floor((ts - startMs) / bucketMs)),
        );

      // Compute the date_trunc'd start of each sparkline bucket so the
      // admin UI can label exactly which day (or ISO week) a spike
      // landed on. The route's trendIndex math floors
      // `(date_trunc(createdAt) - currentStart) / bucketMs`, which means
      // bucket i contains events whose date_trunc'd timestamp falls in
      // `[currentStart + i*bucketMs, currentStart + (i+1)*bucketMs)`.
      // Since date_trunc snaps to a day or ISO-week boundary in UTC,
      // there is exactly one such boundary per slot. We surface that
      // boundary as the bucket's representative date — that is what the
      // tooltip names ("Tue Apr 28" / "Week of Apr 28").
      const dayMs = 24 * 60 * 60 * 1000;
      function computeBucketStarts(): string[] {
        if (!cfg.windowed) return [];
        const startUtc = cfg.currentStart.getTime();
        let firstBucketMs: number;
        if (cfg.bucketUnit === "day") {
          firstBucketMs = Math.ceil(startUtc / dayMs) * dayMs;
        } else {
          // ISO-week start: Monday 00:00 UTC, matching postgres'
          // date_trunc('week'). Find the first Monday >= currentStart.
          const d = new Date(startUtc);
          const dow = d.getUTCDay() || 7; // Sunday = 7
          const dayStart = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
          );
          const monday = dayStart - (dow - 1) * dayMs;
          firstBucketMs = monday >= startUtc ? monday : monday + 7 * dayMs;
        }
        return Array.from({ length: cfg.bucketCount }, (_, i) =>
          new Date(firstBucketMs + i * cfg.bucketMs).toISOString(),
        );
      }
      const trendBucketStarts = computeBucketStarts();

      // Section totals are split into current vs prior buckets so the
      // admin UI can render a +/- delta badge per section row, mirroring
      // the capSignupCurrent/capSignupPrior pattern used for capability
      // summary rows. The combined `impressions`/`clicks` totals still
      // include both halves of the windowFilter (existing contract — see
      // the cta-conversion-section-trends regression test) and are kept
      // alongside the per-period splits.
      const sectionImpressionsBySource = new Map<string, Map<string, number>>();
      const sectionImpressionsCurrent = new Map<string, number>();
      const sectionImpressionsPrior = new Map<string, number>();
      const sectionImpressionTrends = new Map<string, number[]>();
      for (const r of sectionImpressions) {
        if (!r.source || !r.section) continue;
        const map = sectionImpressionsBySource.get(r.source) || new Map<string, number>();
        map.set(r.section, (map.get(r.section) || 0) + r.count);
        sectionImpressionsBySource.set(r.source, map);
        if (cfg.windowed) {
          const ts = (r.bucket instanceof Date ? r.bucket : new Date(r.bucket)).getTime();
          const key = `${r.source}|${r.section}`;
          if (ts < startMs) {
            sectionImpressionsPrior.set(key, (sectionImpressionsPrior.get(key) || 0) + r.count);
            continue;
          }
          sectionImpressionsCurrent.set(key, (sectionImpressionsCurrent.get(key) || 0) + r.count);
          let arr = sectionImpressionTrends.get(key);
          if (!arr) {
            arr = new Array(bucketCount).fill(0) as number[];
            sectionImpressionTrends.set(key, arr);
          }
          arr[trendIndex(ts)] += r.count;
        }
      }

      const sectionClicksBySource = new Map<string, Map<string, number>>();
      const sectionClicksCurrent = new Map<string, number>();
      const sectionClicksPrior = new Map<string, number>();
      const sectionClickTrends = new Map<string, number[]>();
      for (const r of clicksBySection) {
        if (!r.source || !r.section) continue;
        const map = sectionClicksBySource.get(r.source) || new Map<string, number>();
        map.set(r.section, (map.get(r.section) || 0) + r.count);
        sectionClicksBySource.set(r.source, map);
        if (cfg.windowed) {
          const ts = (r.bucket instanceof Date ? r.bucket : new Date(r.bucket)).getTime();
          const key = `${r.source}|${r.section}`;
          if (ts < startMs) {
            sectionClicksPrior.set(key, (sectionClicksPrior.get(key) || 0) + r.count);
            continue;
          }
          sectionClicksCurrent.set(key, (sectionClicksCurrent.get(key) || 0) + r.count);
          let arr = sectionClickTrends.get(key);
          if (!arr) {
            arr = new Array(bucketCount).fill(0) as number[];
            sectionClickTrends.set(key, arr);
          }
          arr[trendIndex(ts)] += r.count;
        }
      }

      const scrollDepthBySource = new Map<string, Record<string, number>>();
      for (const r of scrollDepths) {
        if (!r.source || !r.depth) continue;
        const bucket = scrollDepthBySource.get(r.source) || {};
        bucket[r.depth] = (bucket[r.depth] || 0) + r.count;
        scrollDepthBySource.set(r.source, bucket);
      }

      const KNOWN_SECTIONS = [
        "hero",
        "inside_product",
        "how_it_works",
        "faq",
        "closing_cta",
      ];
      const sectionSources = new Set<string>([
        ...sectionImpressionsBySource.keys(),
        ...sectionClicksBySource.keys(),
        ...scrollDepthBySource.keys(),
      ]);
      const sectionEngagement = Array.from(sectionSources).map((source) => {
        const imps = sectionImpressionsBySource.get(source) || new Map();
        const clicks = sectionClicksBySource.get(source) || new Map();
        const sections = KNOWN_SECTIONS.map((section) => {
          const impressions = imps.get(section) || 0;
          const sectionClicks = clicks.get(section) || 0;
          const signups = sectionSignups.get(`${source}|${section}`) || 0;
          const trendKey = `${source}|${section}`;
          const impressionsTrend = cfg.windowed
            ? sectionImpressionTrends.get(trendKey) ??
              new Array(cfg.bucketCount).fill(0)
            : [];
          const clicksTrend = cfg.windowed
            ? sectionClickTrends.get(trendKey) ??
              new Array(cfg.bucketCount).fill(0)
            : [];
          // Per-period splits for the +/- delta badge in the admin UI.
          // Only meaningful for windowed ranges; for "all" both are 0.
          const currentImpressions = cfg.windowed
            ? sectionImpressionsCurrent.get(trendKey) || 0
            : 0;
          const previousImpressions = cfg.windowed
            ? sectionImpressionsPrior.get(trendKey) || 0
            : 0;
          const currentClicks = cfg.windowed
            ? sectionClicksCurrent.get(trendKey) || 0
            : 0;
          const previousClicks = cfg.windowed
            ? sectionClicksPrior.get(trendKey) || 0
            : 0;
          const currentClickRate =
            currentImpressions > 0 ? currentClicks / currentImpressions : 0;
          const previousClickRate =
            previousImpressions > 0 ? previousClicks / previousImpressions : 0;
          return {
            section,
            impressions,
            clicks: sectionClicks,
            signups,
            clickRate: impressions > 0 ? sectionClicks / impressions : 0,
            impressionsTrend,
            clicksTrend,
            currentImpressions,
            previousImpressions,
            currentClicks,
            previousClicks,
            currentClickRate,
            previousClickRate,
          };
        }).filter(
          (s) =>
            s.impressions > 0 ||
            s.clicks > 0 ||
            s.signups > 0 ||
            s.previousImpressions > 0 ||
            s.previousClicks > 0,
        );
        const scroll = scrollDepthBySource.get(source) || {};
        return {
          source,
          sections,
          scrollDepth: {
            d25: Number(scroll["25"] || 0),
            d50: Number(scroll["50"] || 0),
            d75: Number(scroll["75"] || 0),
            d100: Number(scroll["100"] || 0),
          },
        };
      });
      sectionEngagement.sort((a, b) => {
        const aTotal = a.sections.reduce((s, x) => s + x.impressions, 0);
        const bTotal = b.sections.reduce((s, x) => s + x.impressions, 0);
        return bTotal - aTotal;
      });

      function buildRow(
        key: string,
        clicks: number,
        priorClicks: number,
        signups: number,
        priorSignups: number,
        sparkline: number[] | undefined,
      ) {
        const conversionRate = clicks > 0 ? signups / clicks : 0;
        const previousConversionRate = priorClicks > 0 ? priorSignups / priorClicks : 0;
        return {
          clicks,
          signups,
          conversionRate,
          previousClicks: priorClicks,
          previousSignups: priorSignups,
          previousConversionRate,
          sparkline: cfg.windowed
            ? sparkline ?? new Array(cfg.bucketCount).fill(0)
            : [],
          key,
        };
      }

      // Union of all keys seen in either current or prior so a row that
      // disappeared this period still surfaces (with clicks=0, prior>0).
      const capKeys = new Set<string>([
        ...capBuckets.current.keys(),
        ...capBuckets.prior.keys(),
      ]);
      const capabilitySummary = Array.from(capKeys).map((source) => {
        const row = buildRow(
          source,
          capBuckets.current.get(source) || 0,
          capBuckets.prior.get(source) || 0,
          capSignupCurrent.get(source) || 0,
          capSignupPrior.get(source) || 0,
          capBuckets.sparklines.get(source),
        );
        return { source, ...row };
      });

      const audKeys = new Set<string>([
        ...audBuckets.current.keys(),
        ...audBuckets.prior.keys(),
      ]);
      const audienceSummary = Array.from(audKeys).map((audience) => {
        const row = buildRow(
          audience,
          audBuckets.current.get(audience) || 0,
          audBuckets.prior.get(audience) || 0,
          audSignupCurrent.get(audience) || 0,
          audSignupPrior.get(audience) || 0,
          audBuckets.sparklines.get(audience),
        );
        return { audience, ...row };
      });

      const crossKeys = new Set<string>([
        ...crossBuckets.current.keys(),
        ...crossBuckets.prior.keys(),
      ]);
      const crossLinks = Array.from(crossKeys).map((key) => {
        const [audience, source] = key.split("|");
        const row = buildRow(
          key,
          crossBuckets.current.get(key) || 0,
          crossBuckets.prior.get(key) || 0,
          crossSignupCurrent.get(key) || 0,
          crossSignupPrior.get(key) || 0,
          crossBuckets.sparklines.get(key),
        );
        return { audience, source, ...row };
      });

      capabilitySummary.sort((a, b) => b.clicks - a.clicks);
      audienceSummary.sort((a, b) => b.clicks - a.clicks);
      crossLinks.sort((a, b) => b.clicks - a.clicks);

      res.json({
        range: cfg.range,
        bucketUnit: cfg.windowed ? cfg.bucketUnit : null,
        bucketCount: cfg.windowed ? cfg.bucketCount : 0,
        rangeStart: cfg.windowed ? cfg.currentStart.toISOString() : null,
        rangeEnd: cfg.windowed ? cfg.now.toISOString() : null,
        // Bucket-start timestamps aligned positionally with every
        // sparkline trend array in this response (impressionsTrend,
        // clicksTrend, capability/audience/crossLinks sparkline). Used
        // by the admin UI to label the date a sparkline point
        // represents in its hover tooltip. Empty array for range=all.
        trendBucketStarts,
        capability: {
          summary: capabilitySummary.map(({ key: _key, ...rest }) => rest),
          byPosition: capabilityRows,
        },
        audience: {
          summary: audienceSummary.map(({ key: _key, ...rest }) => rest),
        },
        crossLinks: crossLinks.map(({ key: _key, ...rest }) => rest),
        sectionEngagement,
      });
    } catch (err) {
      console.error("CTA conversion analytics error:", err);
      res.status(500).json({ error: "Failed to fetch CTA conversion data." });
    }
  },
);

// Coaching funnel — paired *_shown / *_engaged / *_dismissed counts for
// each major coach surface over the last 30 days. The internal coaching
// dashboard renders this as a horizontal funnel bar per surface so we
// can see, at a glance, which coach lines are reaching founders and
// which are being skipped or shown but ignored. Only basics/extra
// founders ever emit these events; advanced-mode users are silent.
//
// `sourcePath` points at the file that emits the *_shown event for the
// surface, so the admin UI can deep-link to it from the low-engagement
// tooltip (Task #410). When more than one file emits a given event,
// list the primary owner — i.e. the component whose render mounts the
// surface, not a shared track helper.
const COACHING_FUNNEL_SURFACES: Array<{
  key: string;
  label: string;
  shown: string;
  engaged: string;
  dismissed?: string;
  sourcePath: string;
}> = [
  {
    key: "dashboard_launcher_coach",
    label: "Dashboard launcher coach",
    shown: "dashboard_launcher_coach_shown",
    engaged: "dashboard_launcher_coach_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/components/decision-flow/DecisionLauncher.tsx",
  },
  {
    key: "things_changed_coach",
    label: "Things-have-changed banner",
    shown: "things_changed_coach_shown",
    engaged: "things_changed_coach_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/components/decision-flow/DecisionLauncher.tsx",
  },
  {
    key: "decision_why_explainer",
    label: "Decision flow Why callout",
    shown: "decision_why_explainer_shown",
    engaged: "decision_why_explainer_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/components/decision-flow/WhyStep.tsx",
  },
  {
    key: "impact_kpi_nudge",
    label: "Impact summary KPI nudge",
    shown: "impact_kpi_nudge_shown",
    engaged: "impact_kpi_nudge_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/components/decision-flow/ImpactSummary.tsx",
  },
  {
    key: "save_action_apply_reminder",
    label: "Save-action Apply reminder",
    shown: "save_action_apply_reminder_shown",
    engaged: "save_action_apply_reminder_engaged",
    dismissed: "save_action_apply_reminder_dismissed",
    sourcePath:
      "artifacts/school-financial-model/src/components/decision-flow/SaveActions.tsx",
  },
  {
    key: "accounting_export_lesson",
    label: "Accounting export lesson",
    shown: "accounting_export_lesson_shown",
    engaged: "accounting_export_lesson_engaged",
    dismissed: "accounting_export_lesson_dismissed",
    sourcePath:
      "artifacts/school-financial-model/src/pages/model-wizard/steps/SchoolProfileStep.tsx",
  },
  {
    key: "accounting_export_post_upload_coach",
    label: "Post-upload coach line",
    shown: "accounting_export_post_upload_coach_shown",
    engaged: "accounting_export_post_upload_coach_engaged",
    dismissed: "accounting_export_post_upload_coach_dismissed",
    sourcePath:
      "artifacts/school-financial-model/src/pages/model-wizard/steps/SchoolProfileStep.tsx",
  },
  {
    key: "actuals_coach_intro",
    label: "Actuals coach intro",
    shown: "actuals_coach_intro_shown",
    engaged: "actuals_coach_intro_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/pages/scenarios/index.tsx",
  },
  {
    key: "actuals_variance_nudge",
    label: "Actuals variance nudge",
    shown: "actuals_variance_nudge_shown",
    engaged: "actuals_variance_nudge_engaged",
    sourcePath:
      "artifacts/school-financial-model/src/pages/scenarios/index.tsx",
  },
];

// Low-engagement threshold for the Coaching tab "this surface looks dead"
// callout (Task #410). A surface is flagged when it cleared the impression
// floor (so we're not flagging brand-new surfaces or noise) AND its
// engagement rate is under the floor. Mirrored verbatim into the API
// response so the admin UI can surface the exact numbers in the tooltip
// without hardcoding them in two places.
const LOW_ENGAGEMENT_MIN_IMPRESSIONS = 100;
const LOW_ENGAGEMENT_MAX_RATE = 0.05;

router.get(
  "/admin/coaching-funnel",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      // 30-day rolling window. We deliberately do NOT persist per-day
      // rollups — the route just reads raw events each time so the
      // funnel stays "ephemeral" (Task #285) and disappears as old
      // events age out.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const allEventNames = COACHING_FUNNEL_SURFACES.flatMap((s) =>
        s.dismissed ? [s.shown, s.engaged, s.dismissed] : [s.shown, s.engaged],
      );

      // Defensive server-side guard: even though every coach surface
      // gates emission on `guidanceLevel !== "advanced"` client-side, we
      // also exclude any rows whose metadata reports advanced here so a
      // future client regression can't silently pollute the funnel
      // (Task #285 acceptance: advanced-mode founders emit nothing).
      const rows = await db
        .select({
          eventName: eventsTable.eventName,
          count: count(),
        })
        .from(eventsTable)
        .where(
          and(
            inArray(eventsTable.eventName, allEventNames),
            gte(eventsTable.createdAt, since),
            sql`(${eventsTable.metadata}->>'guidanceLevel') is distinct from 'advanced'`,
          ),
        )
        .groupBy(eventsTable.eventName);

      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.eventName, r.count);

      // Pull admin snooze/retire decisions (Task #430). Retired surfaces
      // drop out of the funnel entirely; active snoozes suppress the
      // amber "looks dead" badge and surface a "snoozed by … until …"
      // hint instead. Expired snoozes (snoozedUntil <= now) are ignored
      // so the badge can re-appear without the admin having to clear
      // the row by hand.
      const overrideRows = await db
        .select({
          surfaceKey: coachSurfaceOverridesTable.surfaceKey,
          action: coachSurfaceOverridesTable.action,
          snoozedUntil: coachSurfaceOverridesTable.snoozedUntil,
          actorEmail: coachSurfaceOverridesTable.actorEmail,
          updatedAt: coachSurfaceOverridesTable.updatedAt,
        })
        .from(coachSurfaceOverridesTable);
      const now = Date.now();
      const overrides = new Map<
        string,
        {
          action: "snooze" | "retire";
          snoozedUntil: Date | null;
          actorEmail: string | null;
          updatedAt: Date;
        }
      >();
      for (const o of overrideRows) {
        if (o.action === "retire") {
          overrides.set(o.surfaceKey, {
            action: "retire",
            snoozedUntil: null,
            actorEmail: o.actorEmail,
            updatedAt: o.updatedAt,
          });
        } else if (
          o.action === "snooze" &&
          o.snoozedUntil &&
          o.snoozedUntil.getTime() > now
        ) {
          overrides.set(o.surfaceKey, {
            action: "snooze",
            snoozedUntil: o.snoozedUntil,
            actorEmail: o.actorEmail,
            updatedAt: o.updatedAt,
          });
        }
      }

      const surfaces = COACHING_FUNNEL_SURFACES.flatMap((s) => {
        const override = overrides.get(s.key);
        // Retired surfaces are hidden from the funnel entirely.
        if (override?.action === "retire") return [];
        const shown = counts.get(s.shown) || 0;
        const engaged = counts.get(s.engaged) || 0;
        const dismissed = s.dismissed ? counts.get(s.dismissed) || 0 : null;
        const engagementRate = shown > 0 ? engaged / shown : 0;
        const isSnoozed = override?.action === "snooze";
        return [
          {
            key: s.key,
            label: s.label,
            shown,
            engaged,
            dismissed,
            engagementRate,
            dismissalRate:
              s.dismissed && shown > 0 ? (dismissed ?? 0) / shown : null,
            sourcePath: s.sourcePath,
            // Statistically meaningful low engagement: enough impressions
            // to trust the rate, and rate below the floor. The admin UI
            // sorts these to the top and shows an amber "looks dead" badge.
            // While a snooze is active we suppress the badge — the
            // snooze hint takes its place.
            lowEngagement:
              !isSnoozed &&
              shown > LOW_ENGAGEMENT_MIN_IMPRESSIONS &&
              engagementRate < LOW_ENGAGEMENT_MAX_RATE,
            snooze: isSnoozed
              ? {
                  until: override!.snoozedUntil!.toISOString(),
                  by: override!.actorEmail,
                }
              : null,
          },
        ];
      });

      res.json({
        windowDays: 30,
        since: since.toISOString(),
        lowEngagementThreshold: {
          minImpressions: LOW_ENGAGEMENT_MIN_IMPRESSIONS,
          maxEngagementRate: LOW_ENGAGEMENT_MAX_RATE,
        },
        surfaces,
      });
    } catch (err) {
      console.error("Coaching funnel analytics error:", err);
      res.status(500).json({ error: "Failed to fetch coaching funnel data." });
    }
  },
);

// Snooze / retire a coach surface (Task #430). Upserts on `surfaceKey`
// so flipping a surface from snoozed to retired (or extending a snooze)
// stays a single row. The admin's id + email are snapshotted into the
// row so the UI can render "snoozed by <admin> until <date>" without a
// join, and so attribution survives if the user is later removed.
const SNOOZE_DAYS = 7;
const VALID_SURFACE_KEYS = new Set(COACHING_FUNNEL_SURFACES.map((s) => s.key));

router.post(
  "/admin/coaching-funnel/overrides",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const body = (req.body ?? {}) as {
        surfaceKey?: unknown;
        action?: unknown;
      };
      const surfaceKey =
        typeof body.surfaceKey === "string" ? body.surfaceKey : "";
      const action = typeof body.action === "string" ? body.action : "";
      if (!VALID_SURFACE_KEYS.has(surfaceKey)) {
        res.status(400).json({ error: "Unknown surface key." });
        return;
      }
      if (action !== "snooze" && action !== "retire") {
        res
          .status(400)
          .json({ error: "Action must be 'snooze' or 'retire'." });
        return;
      }

      const [actor] = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .limit(1);

      const snoozedUntil =
        action === "snooze"
          ? new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
          : null;
      const nowDate = new Date();

      await db
        .insert(coachSurfaceOverridesTable)
        .values({
          surfaceKey,
          action,
          snoozedUntil,
          actorUserId: actor?.id ?? null,
          actorEmail: actor?.email ?? null,
        })
        .onConflictDoUpdate({
          target: coachSurfaceOverridesTable.surfaceKey,
          set: {
            action,
            snoozedUntil,
            actorUserId: actor?.id ?? null,
            actorEmail: actor?.email ?? null,
            updatedAt: nowDate,
          },
        });

      res.json({
        surfaceKey,
        action,
        snoozedUntil: snoozedUntil ? snoozedUntil.toISOString() : null,
        actorEmail: actor?.email ?? null,
      });
    } catch (err) {
      console.error("Coaching funnel override error:", err);
      res.status(500).json({ error: "Failed to save coach surface override." });
    }
  },
);

// Clear an override (e.g. an admin un-snoozes or un-retires a surface).
router.delete(
  "/admin/coaching-funnel/overrides/:surfaceKey",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const rawKey = req.params.surfaceKey;
      const surfaceKey = typeof rawKey === "string" ? rawKey : "";
      if (!VALID_SURFACE_KEYS.has(surfaceKey)) {
        res.status(400).json({ error: "Unknown surface key." });
        return;
      }
      await db
        .delete(coachSurfaceOverridesTable)
        .where(eq(coachSurfaceOverridesTable.surfaceKey, surfaceKey));
      res.json({ surfaceKey, cleared: true });
    } catch (err) {
      console.error("Coaching funnel override clear error:", err);
      res.status(500).json({ error: "Failed to clear coach surface override." });
    }
  },
);

// Coach downgrade precursors (Task #411).
//
// Joins guidance_mode_changed -> "advanced" downgrades against the
// per-surface *_dismissed events from Task #285 to surface the top 5
// coach lines a founder dismissed in the 24 hours before silencing the
// coach. The hypothesis: surfaces that frequently appear right before a
// downgrade are the ones pushing founders to mute the coach, so they're
// the highest-value copy to rewrite or retire.
//
// We look back 90 days for downgrade events to keep enough signal on
// low-volume installs while excluding stale data, and only consider
// surfaces that have a `dismissed` event configured in
// COACHING_FUNNEL_SURFACES — surfaces without an explicit dismissal
// affordance can't show up here. Each dismissal contributes at most
// once to the count (a single dismissal that falls inside multiple
// overlapping precursor windows is still only counted once); we treat
// the metric as "distinct dismissals that preceded any downgrade",
// which keeps the number stable when a user downgrades, comes back to
// basics, and downgrades again within 24h.
const COACH_DOWNGRADE_LOOKBACK_DAYS = 90;
const COACH_DOWNGRADE_PRECURSOR_HOURS = 24;
const COACH_DOWNGRADE_TOP_N = 5;

router.get(
  "/admin/coach-downgrade-precursors",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const dismissibleSurfaces = COACHING_FUNNEL_SURFACES.filter(
        (s): s is typeof s & { dismissed: string } => Boolean(s.dismissed),
      );
      const dismissedEventNames = dismissibleSurfaces.map((s) => s.dismissed);
      const surfaceMeta = new Map(
        dismissibleSurfaces.map((s) => [
          s.dismissed,
          { key: s.key, label: s.label, sourcePath: s.sourcePath },
        ]),
      );

      const since = new Date(
        Date.now() - COACH_DOWNGRADE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
      const precursorWindowMs =
        COACH_DOWNGRADE_PRECURSOR_HOURS * 60 * 60 * 1000;

      // basics/extra -> advanced downgrades within the lookback window.
      const downgrades = await db
        .select({
          userId: eventsTable.userId,
          downgradeAt: eventsTable.createdAt,
        })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.eventName, "guidance_mode_changed"),
            sql`${eventsTable.metadata}->>'guidanceLevel' = 'advanced'`,
            sql`${eventsTable.userId} IS NOT NULL`,
            gte(eventsTable.createdAt, since),
          ),
        );

      if (downgrades.length === 0 || dismissedEventNames.length === 0) {
        res.json({
          windowDays: COACH_DOWNGRADE_LOOKBACK_DAYS,
          precursorWindowHours: COACH_DOWNGRADE_PRECURSOR_HOURS,
          totalDowngrades: downgrades.length,
          surfaces: [],
        });
        return;
      }

      const userIds = Array.from(
        new Set(
          downgrades
            .map((d) => d.userId)
            .filter((id): id is number => id != null),
        ),
      );

      // Pull every candidate dismissal by an affected user from the
      // earliest possible precursor moment onward, then filter to those
      // that fall inside any user's [downgrade-24h, downgrade) window.
      const earliestDismissalSince = new Date(
        since.getTime() - precursorWindowMs,
      );
      const dismissals = await db
        .select({
          userId: eventsTable.userId,
          eventName: eventsTable.eventName,
          createdAt: eventsTable.createdAt,
        })
        .from(eventsTable)
        .where(
          and(
            inArray(eventsTable.eventName, dismissedEventNames),
            inArray(eventsTable.userId, userIds),
            gte(eventsTable.createdAt, earliestDismissalSince),
          ),
        );

      const downgradesByUser = new Map<number, number[]>();
      for (const d of downgrades) {
        if (d.userId == null) continue;
        const arr = downgradesByUser.get(d.userId) ?? [];
        arr.push(d.downgradeAt.getTime());
        downgradesByUser.set(d.userId, arr);
      }

      const counts = new Map<string, number>();
      for (const dis of dismissals) {
        if (dis.userId == null) continue;
        const userDowngrades = downgradesByUser.get(dis.userId);
        if (!userDowngrades) continue;
        const dismissalMs = dis.createdAt.getTime();
        const matched = userDowngrades.some(
          (t) => dismissalMs >= t - precursorWindowMs && dismissalMs < t,
        );
        if (matched) {
          counts.set(dis.eventName, (counts.get(dis.eventName) || 0) + 1);
        }
      }

      const surfaces = Array.from(counts.entries())
        .map(([eventName, dismissals]) => {
          const meta = surfaceMeta.get(eventName);
          return {
            key: meta?.key ?? eventName,
            label: meta?.label ?? eventName,
            sourcePath: meta?.sourcePath ?? "",
            dismissedEvent: eventName,
            dismissals,
          };
        })
        .sort((a, b) => b.dismissals - a.dismissals)
        .slice(0, COACH_DOWNGRADE_TOP_N);

      res.json({
        windowDays: COACH_DOWNGRADE_LOOKBACK_DAYS,
        precursorWindowHours: COACH_DOWNGRADE_PRECURSOR_HOURS,
        totalDowngrades: downgrades.length,
        surfaces,
      });
    } catch (err) {
      console.error("Coach downgrade precursors error:", err);
      res
        .status(500)
        .json({ error: "Failed to fetch coach downgrade precursors." });
    }
  },
);

router.get(
  "/admin/reviews",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const reviewEvents = await db
        .select({
          id: eventsTable.id,
          userId: eventsTable.userId,
          metadata: eventsTable.metadata,
          createdAt: eventsTable.createdAt,
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "requested_model_review"))
        .orderBy(desc(eventsTable.createdAt));

      const validEvents = reviewEvents.filter((e) => {
        const meta = e.metadata as Record<string, unknown>;
        return typeof meta?.modelId === "number" && e.userId != null;
      });

      const modelIds = validEvents
        .map((e) => (e.metadata as Record<string, unknown>)?.modelId as number)
        .filter((id): id is number => typeof id === "number");

      const uniqueModelIds = [...new Set(modelIds)];

      let modelsMap: Record<number, { name: string; schoolName: string; schoolType: string; data: Record<string, unknown> }> = {};
      if (uniqueModelIds.length > 0) {
        const models = await db
          .select({
            id: financialModelsTable.id,
            name: financialModelsTable.name,
            data: financialModelsTable.data,
          })
          .from(financialModelsTable)
          .where(inArray(financialModelsTable.id, uniqueModelIds));

        for (const m of models) {
          const d = m.data as Record<string, unknown>;
          const profile = d?.schoolProfile as Record<string, unknown> | undefined;
          const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
          const schoolType = (typeof profile?.schoolType === "string" ? profile.schoolType : "") || "";
          modelsMap[m.id] = { name: m.name, schoolName, schoolType, data: d };
        }
      }

      const userIds = validEvents
        .map((e) => e.userId)
        .filter((id): id is number => typeof id === "number");
      const uniqueUserIds = [...new Set(userIds)];

      let usersMap: Record<number, { name: string; email: string }> = {};
      if (uniqueUserIds.length > 0) {
        const users = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, uniqueUserIds));
        for (const u of users) {
          usersMap[u.id] = { name: u.name, email: u.email };
        }
      }

      const feedbackSentEvents = await db
        .select({ metadata: eventsTable.metadata })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "review_feedback_sent"));

      const sentModelIds = new Set(
        feedbackSentEvents
          .map((e) => (e.metadata as Record<string, unknown>)?.modelId as number)
          .filter((id): id is number => typeof id === "number")
      );

      let sharedLinksMap: Record<number, string> = {};
      if (uniqueModelIds.length > 0) {
        const links = await db
          .select({
            modelId: sharedLinksTable.modelId,
            token: sharedLinksTable.token,
          })
          .from(sharedLinksTable)
          .where(and(
            inArray(sharedLinksTable.modelId, uniqueModelIds),
            isNull(sharedLinksTable.revokedAt),
          ));

        const appUrl = process.env.APP_URL
          || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : null);

        if (appUrl) {
          for (const link of links) {
            if (!sharedLinksMap[link.modelId]) {
              sharedLinksMap[link.modelId] = `${appUrl}/shared/${link.token}`;
            }
          }
        }
      }

      const reviews = validEvents.map((e) => {
        const meta = e.metadata as Record<string, unknown>;
        const modelId = meta?.modelId as number;
        const model = modelsMap[modelId];
        const user = e.userId ? usersMap[e.userId] : null;
        const feedbackSent = sentModelIds.has(modelId);

        return {
          eventId: e.id,
          modelId,
          userId: e.userId,
          requesterName: user?.name || "Unknown",
          requesterEmail: user?.email || "Unknown",
          schoolName: model?.schoolName || "Unknown",
          schoolType: model?.schoolType || "",
          modelName: model?.name || "Untitled",
          requestedAt: e.createdAt.toISOString(),
          feedbackSent,
          status: feedbackSent ? "sent" as const : "pending" as const,
          sharedViewUrl: sharedLinksMap[modelId] || null,
        };
      });

      reviews.sort((a, b) => {
        if (a.feedbackSent !== b.feedbackSent) return a.feedbackSent ? 1 : -1;
        return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
      });

      res.json({ reviews });
    } catch (err) {
      console.error("Admin reviews error:", err);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  },
);

router.get(
  "/admin/reviews/:modelId/analysis",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const modelId = parseInt(String(req.params.modelId), 10);
      if (isNaN(modelId)) {
        res.status(400).json({ error: "Invalid model ID." });
        return;
      }

      const [model] = await db
        .select()
        .from(financialModelsTable)
        .where(eq(financialModelsTable.id, modelId))
        .limit(1);

      if (!model) {
        res.status(404).json({ error: "Model not found." });
        return;
      }

      const data = normalizeModelData(model.data as Record<string, unknown>);
      const consultantOutput = await runConsultantEngine(data);
      const yearFinancials = computeYearFinancialsFromData(data);

      const profile = data.schoolProfile as Record<string, unknown> | undefined;
      const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
      const state = (typeof profile?.state === "string" ? profile.state : "") || "N/A";
      const schoolType = schoolTypeDisplay(profile?.schoolType as string);
      const entityType = entityTypeDisplay(profile?.entityType as string);

      const priorSnapshot = (data as Record<string, unknown>).priorYearSnapshot as Record<string, number> | undefined;
      const y1StartingCash = priorSnapshot?.endingCash || 0;
      const y1EndingCash = y1StartingCash + (yearFinancials[0]?.netIncome || 0);
      const daysCashOnHand = computeDaysCashOnHand(y1EndingCash, yearFinancials[0]?.totalExpenses || 0);

      const cf = consultantOutput.cumulativeFinancials || [];
      const reserveMonths = cf.length > 0 ? cf[cf.length - 1].reserveMonths : 0;

      const user = model.userId
        ? await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, model.userId)).limit(1).then(r => r[0])
        : null;

      let sharedViewUrl: string | null = null;
      const [sharedLink] = await db
        .select({ token: sharedLinksTable.token })
        .from(sharedLinksTable)
        .where(and(
          eq(sharedLinksTable.modelId, modelId),
          isNull(sharedLinksTable.revokedAt),
        ))
        .limit(1);
      if (sharedLink) {
        const appUrl = process.env.APP_URL
          || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : null);
        if (appUrl) {
          sharedViewUrl = `${appUrl}/shared/${sharedLink.token}`;
        }
      }

      res.json({
        modelName: model.name,
        schoolName,
        state,
        schoolType,
        entityType,
        requesterName: user?.name || "Unknown",
        requesterEmail: user?.email || "Unknown",
        lenderReadiness: consultantOutput.lenderReadiness,
        executiveSummary: consultantOutput.executiveSummary,
        biggestStrength: consultantOutput.biggestStrength,
        biggestRisk: consultantOutput.biggestRisk,
        sharedViewUrl,
        topIssues: consultantOutput.topIssues.slice(0, 8).map(i => ({
          title: i.title,
          severity: i.severity,
          explanation: i.whyItMatters,
        })),
        yearFinancials: yearFinancials.map(yf => ({
          year: yf.year,
          students: yf.students,
          totalRevenue: yf.totalRevenue,
          totalExpenses: yf.totalExpenses,
          netIncome: yf.netIncome,
          netMargin: yf.netMargin,
          debtService: yf.debtService,
        })),
        metrics: {
          y1Revenue: yearFinancials[0]?.totalRevenue || 0,
          y1NetMargin: yearFinancials[0]?.netMargin || 0,
          dscr: yearFinancials[0] ? (computeAnnualDscr(yearFinancials[0]) ?? 0) : 0,
          cashRunwayMonths: consultantOutput.cashRunwayMonths || 0,
          reserveMonths,
          daysCashOnHand,
          lenderReadiness: consultantOutput.lenderReadiness,
        },
      });
    } catch (err) {
      console.error("Admin review analysis error:", err);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  },
);

router.post(
  "/admin/reviews/:modelId/send-feedback",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const modelId = parseInt(String(req.params.modelId), 10);
      if (isNaN(modelId)) {
        res.status(400).json({ error: "Invalid model ID." });
        return;
      }

      const { strengths, watchItems, recommendations } = req.body;

      if (!strengths && !watchItems && !recommendations) {
        res.status(400).json({ error: "At least one feedback section is required." });
        return;
      }

      const [model] = await db
        .select({
          id: financialModelsTable.id,
          name: financialModelsTable.name,
          userId: financialModelsTable.userId,
          data: financialModelsTable.data,
        })
        .from(financialModelsTable)
        .where(eq(financialModelsTable.id, modelId))
        .limit(1);

      if (!model) {
        res.status(404).json({ error: "Model not found." });
        return;
      }

      if (!model.userId) {
        res.status(400).json({ error: "Model has no associated user." });
        return;
      }

      const [owner] = await db
        .select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, model.userId))
        .limit(1);

      if (!owner || !owner.email) {
        res.status(400).json({ error: "Could not find model owner's email." });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(owner.email)) {
        res.status(400).json({ error: "Owner has an invalid email address." });
        return;
      }

      const modelData = normalizeModelData(model.data as Record<string, unknown>);
      const consultantOutput = await runConsultantEngine(modelData);
      const yearFinancials = computeYearFinancialsFromData(modelData);
      const profile = modelData.schoolProfile as Record<string, unknown> | undefined;
      const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";

      const serverMetrics = {
        y1Revenue: yearFinancials[0]?.totalRevenue || 0,
        y1NetMargin: yearFinancials[0]?.netMargin || 0,
        dscr: yearFinancials[0] ? (computeAnnualDscr(yearFinancials[0]) ?? 0) : 0,
        cashRunwayMonths: consultantOutput.cashRunwayMonths || 0,
        lenderReadiness: consultantOutput.lenderReadiness,
      };

      const appUrl = process.env.APP_URL
        || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : null);
      const dashboardUrl = appUrl ? `${appUrl}/dashboard` : undefined;

      const result = await sendReviewFeedback({
        recipientName: owner.name,
        recipientEmail: owner.email,
        schoolName,
        strengths: strengths || "",
        watchItems: watchItems || "",
        recommendations: recommendations || "",
        dashboardUrl,
        metrics: serverMetrics,
      });

      if (!result.success) {
        res.status(500).json({ error: result.error || "Failed to send feedback email." });
        return;
      }

      await db.insert(eventsTable).values({
        userId: req.userId,
        eventName: "review_feedback_sent",
        metadata: { modelId, recipientEmail: owner.email, sentBy: req.userId },
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Send review feedback error:", err);
      res.status(500).json({ error: "Failed to send feedback." });
    }
  },
);

export default router;
