import { Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { AuthRequest } from "./auth";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    res.status(403).json({ error: "Admin access is not configured" });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId))
    .limit(1);

  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    res.status(403).json({ error: "Admin access denied" });
    return;
  }

  next();
}
