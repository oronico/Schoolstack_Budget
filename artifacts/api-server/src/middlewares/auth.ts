import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET environment variable is required in production"); })() : "schoolstack-dev-secret-change-in-production");

export interface AuthRequest extends Request {
  userId?: number;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; tokenVersion?: number };
    req.userId = decoded.userId;

    if (typeof decoded.tokenVersion === "number") {
      db.select({ tokenVersion: usersTable.tokenVersion })
        .from(usersTable)
        .where(eq(usersTable.id, decoded.userId))
        .limit(1)
        .then(([user]) => {
          if (!user || user.tokenVersion !== decoded.tokenVersion) {
            res.status(401).json({ error: "Session has been invalidated. Please log in again." });
            return;
          }
          next();
        })
        .catch(() => {
          res.status(500).json({ error: "Authentication check failed" });
        });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
}

export function generateToken(userId: number, tokenVersion: number = 0): string {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET, { expiresIn: "7d" });
}
