import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  financialModelsTable,
  exportsTable,
  eventsTable,
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
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  },
);

router.get(
  "/admin/cta-conversion",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const capabilityClicks = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          position: sql<string>`metadata->>'position'`.as("position"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "capability_cta_click"))
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'position'`);

      const audienceClicks = await db
        .select({
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "audience_card_click"))
        .groupBy(sql`metadata->>'audience'`);

      const crossLinkClicks = await db
        .select({
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          source: sql<string>`metadata->>'source'`.as("source"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "capability_cross_link_click"))
        .groupBy(sql`metadata->>'audience'`, sql`metadata->>'source'`);

      const attributedSignups = await db
        .select({
          channel: sql<string>`metadata->>'channel'`.as("channel"),
          source: sql<string>`metadata->>'source'`.as("source"),
          audience: sql<string>`metadata->>'audience'`.as("audience"),
          section: sql<string>`metadata->>'section'`.as("section"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "cta_attributed_signup"))
        .groupBy(
          sql`metadata->>'channel'`,
          sql`metadata->>'source'`,
          sql`metadata->>'audience'`,
          sql`metadata->>'section'`,
        );

      const sectionImpressions = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          section: sql<string>`metadata->>'section'`.as("section"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "capability_section_impression"))
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'section'`);

      const scrollDepths = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          depth: sql<string>`metadata->>'depth'`.as("depth"),
          count: count(),
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventName, "capability_scroll_depth"))
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'depth'`);

      const clicksBySection = await db
        .select({
          source: sql<string>`metadata->>'source'`.as("source"),
          section: sql<string>`metadata->>'section'`.as("section"),
          count: count(),
        })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.eventName, "capability_cta_click"),
            sql`metadata->>'section' IS NOT NULL`,
          ),
        )
        .groupBy(sql`metadata->>'source'`, sql`metadata->>'section'`);

      const capabilityClickTotals = new Map<string, number>();
      const capabilityRows = capabilityClicks.map((r) => {
        const source = r.source || "unknown";
        capabilityClickTotals.set(source, (capabilityClickTotals.get(source) || 0) + r.count);
        return { source, position: r.position || "primary", clicks: r.count };
      });

      const capabilitySignups = new Map<string, number>();
      const audienceSignups = new Map<string, number>();
      const crossLinkSignups = new Map<string, number>();
      const sectionSignups = new Map<string, number>();
      for (const s of attributedSignups) {
        if (s.channel === "capability" && s.source) {
          capabilitySignups.set(s.source, (capabilitySignups.get(s.source) || 0) + s.count);
          if (s.section) {
            const key = `${s.source}|${s.section}`;
            sectionSignups.set(key, (sectionSignups.get(key) || 0) + s.count);
          }
        } else if (s.channel === "audience" && s.audience) {
          audienceSignups.set(s.audience, (audienceSignups.get(s.audience) || 0) + s.count);
        } else if (s.channel === "cross_link" && s.audience && s.source) {
          const key = `${s.audience}|${s.source}`;
          crossLinkSignups.set(key, (crossLinkSignups.get(key) || 0) + s.count);
        }
      }

      const sectionImpressionsBySource = new Map<string, Map<string, number>>();
      for (const r of sectionImpressions) {
        if (!r.source || !r.section) continue;
        const map = sectionImpressionsBySource.get(r.source) || new Map<string, number>();
        map.set(r.section, (map.get(r.section) || 0) + r.count);
        sectionImpressionsBySource.set(r.source, map);
      }

      const sectionClicksBySource = new Map<string, Map<string, number>>();
      for (const r of clicksBySection) {
        if (!r.source || !r.section) continue;
        const map = sectionClicksBySource.get(r.source) || new Map<string, number>();
        map.set(r.section, (map.get(r.section) || 0) + r.count);
        sectionClicksBySource.set(r.source, map);
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
          return {
            section,
            impressions,
            clicks: sectionClicks,
            signups,
            clickRate: impressions > 0 ? sectionClicks / impressions : 0,
          };
        }).filter(
          (s) => s.impressions > 0 || s.clicks > 0 || s.signups > 0,
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

      const capabilitySummary = Array.from(capabilityClickTotals.entries()).map(
        ([source, clicks]) => {
          const signups = capabilitySignups.get(source) || 0;
          return {
            source,
            clicks,
            signups,
            conversionRate: clicks > 0 ? signups / clicks : 0,
          };
        },
      );

      const audienceSummary = audienceClicks.map((r) => {
        const audience = r.audience || "unknown";
        const signups = audienceSignups.get(audience) || 0;
        return {
          audience,
          clicks: r.count,
          signups,
          conversionRate: r.count > 0 ? signups / r.count : 0,
        };
      });

      capabilitySummary.sort((a, b) => b.clicks - a.clicks);
      audienceSummary.sort((a, b) => b.clicks - a.clicks);

      res.json({
        capability: {
          summary: capabilitySummary,
          byPosition: capabilityRows,
        },
        audience: {
          summary: audienceSummary,
        },
        crossLinks: crossLinkClicks.map((r) => {
          const audience = r.audience || "unknown";
          const source = r.source || "unknown";
          const signups = crossLinkSignups.get(`${audience}|${source}`) || 0;
          return {
            audience,
            source,
            clicks: r.count,
            signups,
            conversionRate: r.count > 0 ? signups / r.count : 0,
          };
        }).sort((a, b) => b.clicks - a.clicks),
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

      const surfaces = COACHING_FUNNEL_SURFACES.map((s) => {
        const shown = counts.get(s.shown) || 0;
        const engaged = counts.get(s.engaged) || 0;
        const dismissed = s.dismissed ? counts.get(s.dismissed) || 0 : null;
        const engagementRate = shown > 0 ? engaged / shown : 0;
        return {
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
          lowEngagement:
            shown > LOW_ENGAGEMENT_MIN_IMPRESSIONS &&
            engagementRate < LOW_ENGAGEMENT_MAX_RATE,
        };
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
          dscr: yearFinancials[0]?.debtService > 0
            ? (yearFinancials[0].netIncome + yearFinancials[0].debtService) / yearFinancials[0].debtService
            : 0,
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
        dscr: yearFinancials[0]?.debtService > 0
          ? (yearFinancials[0].netIncome + yearFinancials[0].debtService) / yearFinancials[0].debtService
          : 0,
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
