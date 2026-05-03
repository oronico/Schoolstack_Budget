import { Router, type IRouter, type Response, type NextFunction } from "express";
import { db, feedbackTable, usersTable } from "@workspace/db";
import { desc, eq, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest, verifyTokenStrict } from "../middlewares/auth";
import { adminMiddleware } from "../middlewares/admin";

const router: IRouter = Router();

// Optional auth on /feedback: attribute the row to the caller IFF they
// present a *currently valid* Bearer token (signature OK, strict claim
// shape, user still exists, tokenVersion matches). Anything weaker —
// e.g. a JWT whose signature verifies but whose tokenVersion was bumped
// by /auth/logout or /auth/reset-password — drops to anonymous instead
// of being trusted (round-3 #15: previously this route only called
// jwt.verify and trusted decoded.userId without the version recheck,
// re-introducing the round-2 bypass on this surface).
async function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const result = await verifyTokenStrict(authHeader.substring(7));
    if (result.ok) {
      req.userId = result.userId;
    }
  }
  next();
}

router.post("/feedback", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { category, message, pageUrl, email } = req.body;

    if (!category || !message) {
      res.status(400).json({ error: "Category and message are required." });
      return;
    }

    const validCategories = ["like", "dislike", "bug", "feature", "nps"];
    if (!validCategories.includes(category)) {
      res.status(400).json({ error: "Invalid category." });
      return;
    }

    const { score } = req.body;
    if (category === "nps") {
      if (!Number.isInteger(score) || score < 0 || score > 10) {
        res.status(400).json({ error: "NPS score must be an integer between 0 and 10." });
        return;
      }
    }

    if (typeof message !== "string" || message.trim().length === 0 || message.length > 5000) {
      res.status(400).json({ error: "Message must be between 1 and 5000 characters." });
      return;
    }

    if (email !== undefined && email !== null && typeof email === "string" && email.length > 255) {
      res.status(400).json({ error: "Email must be 255 characters or fewer." });
      return;
    }

    if (pageUrl !== undefined && pageUrl !== null && typeof pageUrl === "string" && pageUrl.length > 2000) {
      res.status(400).json({ error: "Page URL is too long." });
      return;
    }

    const [inserted] = await db
      .insert(feedbackTable)
      .values({
        category,
        message: message.trim(),
        score: category === "nps" && Number.isFinite(score) ? Math.round(score) : null,
        pageUrl: typeof pageUrl === "string" ? pageUrl.substring(0, 2000) : null,
        userId: req.userId || null,
        email: typeof email === "string" && email.length > 0 ? email.substring(0, 255) : null,
      })
      .returning({ id: feedbackTable.id });

    res.status(201).json({ id: inserted.id, success: true });
  } catch (err) {
    console.error("Feedback submission error:", err);
    res.status(500).json({ error: "Failed to submit feedback." });
  }
});

router.get(
  "/admin/feedback",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const rawPage = parseInt(req.query.page as string || "1", 10);
      const rawLimit = parseInt(req.query.limit as string || "20", 10);
      const page = isNaN(rawPage) ? 1 : Math.max(1, rawPage);
      const limit = isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));
      const offset = (page - 1) * limit;

      let query = db
        .select({
          id: feedbackTable.id,
          category: feedbackTable.category,
          message: feedbackTable.message,
          score: feedbackTable.score,
          pageUrl: feedbackTable.pageUrl,
          userId: feedbackTable.userId,
          email: feedbackTable.email,
          createdAt: feedbackTable.createdAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(feedbackTable)
        .leftJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
        .orderBy(desc(feedbackTable.createdAt))
        .limit(limit)
        .offset(offset)
        .$dynamic();

      let countQuery = db
        .select({ value: count() })
        .from(feedbackTable)
        .$dynamic();

      if (category && ["like", "dislike", "bug", "feature", "nps"].includes(category)) {
        query = query.where(eq(feedbackTable.category, category));
        countQuery = countQuery.where(eq(feedbackTable.category, category));
      }

      const [feedbackItems, [totalResult]] = await Promise.all([query, countQuery]);

      res.json({
        items: feedbackItems.map((f) => ({
          id: f.id,
          category: f.category,
          message: f.message,
          score: f.score,
          pageUrl: f.pageUrl,
          email: f.email || f.userEmail || null,
          userName: f.userName || null,
          userId: f.userId,
          createdAt: f.createdAt.toISOString(),
        })),
        total: totalResult.value,
        page,
        limit,
      });
    } catch (err) {
      console.error("Admin feedback list error:", err);
      res.status(500).json({ error: "Failed to fetch feedback." });
    }
  },
);

export default router;
