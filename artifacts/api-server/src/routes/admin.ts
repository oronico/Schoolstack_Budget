import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  financialModelsTable,
  exportsTable,
} from "@workspace/db/schema";
import { count, countDistinct, gte, desc, sql, eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";

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

export default router;
