import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let _jwtSecret: string | undefined;

export function getJwtSecret(): string {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is required. Set it before starting the server.");
    }
    _jwtSecret = secret;
  }
  return _jwtSecret;
}

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
  let decoded: { userId: unknown; tokenVersion?: unknown };
  try {
    decoded = jwt.verify(token, getJwtSecret()) as { userId: unknown; tokenVersion?: unknown };
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Strict claim shape — guards against:
  //  (a) string-coerced userIds (e.g. "1' OR 1=1--") slipping past the
  //      JWT layer and reaching the DB driver,
  //  (b) legacy tokens issued before the tokenVersion claim was added —
  //      they previously bypassed the user-existence + revocation check
  //      entirely (auth bypass / ghost-user attack with a leaked secret).
  if (
    typeof decoded.userId !== "number" ||
    !Number.isInteger(decoded.userId) ||
    decoded.userId <= 0 ||
    decoded.userId > 2_147_483_647
  ) {
    res.status(401).json({ error: "Invalid token payload" });
    return;
  }
  if (
    typeof decoded.tokenVersion !== "number" ||
    !Number.isInteger(decoded.tokenVersion) ||
    decoded.tokenVersion < 0
  ) {
    res.status(401).json({ error: "Session has been invalidated. Please log in again." });
    return;
  }

  try {
    const [user] = await db
      .select({ tokenVersion: usersTable.tokenVersion })
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

  req.userId = decoded.userId;
  next();
}

export function generateToken(userId: number, tokenVersion: number = 0): string {
  return jwt.sign({ userId, tokenVersion }, getJwtSecret(), { expiresIn: "7d" });
}
