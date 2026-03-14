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
