import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isReplit = process.env.REPL_ID !== undefined;
// `E2E_MODE=1` is set by playwright.config.ts when it spawns this dev server
// for the e2e validation workflow. In that mode we strip the Replit dev
// plugins (cartographer, runtime-error-modal, dev-banner). They watch the
// entire workspace from `..`, attach to source files, and inject overlays
// that are useless to a headless Chromium — they were also the most
// plausible suspect for the long-run "Vite dev server appears to die
// mid-run" flake (Task #380), since cartographer holds many file watchers
// across artifacts that have nothing to do with the page being tested.
// Keeping them on for normal `pnpm dev` preserves the Replit experience.
const isE2E = process.env.E2E_MODE === "1";
const enableReplitDevPlugins = isReplit && !isE2E;
const rawPort = process.env.PORT || "5173";
const port = Number(rawPort);
const basePath = process.env.BASE_PATH || "/";
// Use the IPv4 loopback for the api proxy target. `localhost` resolves to
// `::1` first on this container (verbatim DNS in Node 17+), but the
// api-server only listens on `0.0.0.0` (IPv4). Routing the proxy through
// `localhost` therefore intermittently surfaces `ECONNREFUSED ::1:8080`
// even though the server is healthy. `127.0.0.1` removes the ambiguity.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8080";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(enableReplitDevPlugins
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
          ...(process.env.NODE_ENV !== "production"
            ? [
                await import("@replit/vite-plugin-cartographer").then((m) =>
                  m.cartographer({
                    root: path.resolve(import.meta.dirname, ".."),
                  }),
                ),
                await import("@replit/vite-plugin-dev-banner").then((m) =>
                  m.devBanner(),
                ),
              ]
            : []),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("recharts") || id.includes("d3-")) {
            return "vendor-charts";
          }
          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("react-hook-form") || id.includes("@hookform")) {
            return "vendor-forms";
          }
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("@tanstack")) {
            return "vendor-query";
          }
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("date-fns")) {
            return "vendor-date";
          }
          if (id.includes("zod")) {
            return "vendor-zod";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Ignore Playwright output dirs so the e2e validation workflow doesn't
    // trigger HMR reloads in the regular dev server when it writes traces,
    // screenshots, or HTML reports.
    watch: {
      ignored: [
        "**/playwright-report/**",
        "**/test-results/**",
        "**/.playwright/**",
      ],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
