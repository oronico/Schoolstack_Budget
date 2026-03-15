import app from "./app";
import { cleanupExpiredRateLimits } from "./lib/rate-limiter";

const port = Number(process.env["PORT"] || "3000");

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});

setInterval(() => {
  cleanupExpiredRateLimits().catch(() => {});
}, 300_000);
