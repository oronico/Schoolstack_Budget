import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { pool } from "@workspace/db";

const app: Express = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? {
          origin: corsOrigin.split(",").map((o) => o.trim()),
          credentials: true,
        }
      : undefined,
  ),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0]?.ok === 1 ? "connected" : "unexpected" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Health check DB error:", message);
    res.status(503).json({ status: "error", db: "disconnected", error: message });
  }
});


app.post("/admin/test-email", async (req, res) => {
  try {
    const { Resend } = await import("resend");
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddr = process.env.EMAIL_FROM || "SchoolStack Budget <onboarding@resend.dev>";
    const appUrl = process.env.APP_URL || "not-set";
    if (!apiKey) {
      res.json({ status: "error", reason: "RESEND_API_KEY not set" });
      return;
    }
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromAddr,
      to: ["aserafin@gmail.com"],
      subject: "SchoolStack Budget - Email Test",
      text: "If you see this, email delivery is working.",
    });
    res.json({ status: error ? "error" : "ok", fromAddr, appUrl, data, error });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ status: "exception", error: msg });
  }
});

app.use("/api", router);

export default app;
