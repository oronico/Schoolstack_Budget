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

// Verifies a Bearer token end-to-end: signature + strict claim shape +
// DB user-existence + tokenVersion revocation check. Shared by the
// strict `authMiddleware` AND by the *optional* JWT decoders on
// `/api/feedback` and `/api/errors/report` so a logged-out / revoked
// token can never get attributed to its previous owner there either
// (round-3 #15).
//
// Outcomes:
//   { ok: true,  userId }           → caller should set req.userId
//   { ok: false, status, message }  → caller MAY 401 (strict) or just
//                                     drop the userId (optional auth)
export type TokenVerificationResult =
  | { ok: true; userId: number }
  | { ok: false; status: 401 | 500; message: string };

export async function verifyTokenStrict(token: string): Promise<TokenVerificationResult> {
  let decoded: { userId: unknown; tokenVersion?: unknown };
  try {
    decoded = jwt.verify(token, getJwtSecret()) as { userId: unknown; tokenVersion?: unknown };
  } catch {
    return { ok: false, status: 401, message: "Invalid or expired token" };
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
    return { ok: false, status: 401, message: "Invalid token payload" };
  }
  if (
    typeof decoded.tokenVersion !== "number" ||
    !Number.isInteger(decoded.tokenVersion) ||
    decoded.tokenVersion < 0
  ) {
    return { ok: false, status: 401, message: "Session has been invalidated. Please log in again." };
  }

  try {
    const [user] = await db
      .select({ tokenVersion: usersTable.tokenVersion })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return { ok: false, status: 401, message: "Session has been invalidated. Please log in again." };
    }
  } catch {
    return { ok: false, status: 500, message: "Authentication check failed" };
  }

  return { ok: true, userId: decoded.userId };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const result = await verifyTokenStrict(authHeader.substring(7));
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  req.userId = result.userId;
  next();
}

export function generateToken(userId: number, tokenVersion: number = 0): string {
  return jwt.sign({ userId, tokenVersion }, getJwtSecret(), { expiresIn: "7d" });
}
