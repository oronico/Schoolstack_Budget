import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required. Set it before starting the server.");
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

export interface AuthRequest extends Request {
  userId?: number;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
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
      try {
        const [user] = await db.select({ tokenVersion: usersTable.tokenVersion })
          .from(usersTable)
          .where(eq(usersTable.id, decoded.userId))
          .limit(1);

        if (!user || user.tokenVersion !== decoded.tokenVersion) {
          res.status(401).json({ error: "Session has been invalidated. Please log in again." });
          return;
        }
      } catch {
        res.status(500).json({ error: "Authentication check failed" });
        return;
      }
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
