import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile, cp } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@google-cloud/storage",
  "adm-zip",
  "bcryptjs",
  "compression",
  "cookie-parser",
  "cors",
  "drizzle-orm",
  "exceljs",
  "express",
  "google-auth-library",
  "helmet",
  "hyperformula",
  "jsonwebtoken",
  "resend",
  "pdfkit",
  "pdf-lib",
  "pg",
  "zod",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  const sharedEsbuildOptions = {
    platform: "node" as const,
    bundle: true,
    format: "cjs" as const,
    define: {
      "process.env.NODE_ENV": '"production"',
      // Production crash fix (task #1000 follow-on): esbuild leaves
      // `import.meta.url` as a literal when emitting CJS, which evaluates
      // to `undefined` at runtime. Every top-level
      // `fileURLToPath(import.meta.url)` then throws a TypeError before
      // any request handler runs — the `/app/index.cjs` crash loop
      // observed in production. We can't put an expression on the RHS
      // of `define` (esbuild requires an entity name or JS literal), so
      // the banner below injects a `__import_meta_url__` variable
      // computed from the CJS-wrapper's natively-injected `__filename`,
      // and this `define` rewrites every `import.meta.url` reference
      // (in pdf-utils.ts, integrity/canonical/fixtures.ts, lib/db) to
      // that variable. Result: both the bundled CJS and source ESM/tsx
      // paths see a working `file://` URL string.
      "import.meta.url": "__import_meta_url__",
    },
    // Banner-injected runtime: see `define` above for the import.meta.url
    // shim. The DRIZZLE_MIGRATIONS_DIR line points @workspace/db at the
    // migrations folder we copy below, computed from `__dirname` which
    // only exists inside the CJS module wrapper.
    banner: {
      js:
        "var __import_meta_url__ = require('url').pathToFileURL(__filename).href;" +
        "process.env.DRIZZLE_MIGRATIONS_DIR = process.env.DRIZZLE_MIGRATIONS_DIR || require('path').resolve(__dirname, 'drizzle');",
    },
    minify: true,
    external: externals,
    logLevel: "info" as const,
  };

  await esbuild({
    ...sharedEsbuildOptions,
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    outfile: path.resolve(distDir, "index.cjs"),
  });

  // Standalone migration runner. Shipped as its own bundle so the Docker
  // entrypoint can run migrations as a distinct step (and fail the deploy
  // loudly) before booting the API server.
  console.log("building migrate entry...");
  await esbuild({
    ...sharedEsbuildOptions,
    entryPoints: [path.resolve(__dirname, "src/migrate.ts")],
    outfile: path.resolve(distDir, "migrate.cjs"),
  });

  // Ship the SQL migrations alongside the bundle so drizzle's migrator can find
  // them at runtime (resolveMigrationsFolder() in @workspace/db looks for a
  // sibling `drizzle/` directory).
  const migrationsSrc = path.resolve(__dirname, "..", "..", "lib", "db", "drizzle");
  const migrationsDest = path.resolve(distDir, "drizzle");
  console.log(`copying migrations: ${migrationsSrc} -> ${migrationsDest}`);
  await cp(migrationsSrc, migrationsDest, { recursive: true });

  // Task #922 — ship the vendored Unicode-capable DejaVu Sans TTFs
  // alongside the bundle so `pdf-utils.ts:resolveFontPath` finds them
  // at runtime under `dist/assets/fonts/`. Without this, the production
  // build silently falls back to PDFKit's built-in WinAnsi Helvetica and
  // re-introduces the corruption tokens (`"H`, `!"`, `!'`, `"d`)
  // covered by `tests/pdf-encoding-corruption-922.ts`.
  const fontsSrc = path.resolve(__dirname, "assets", "fonts");
  const fontsDest = path.resolve(distDir, "assets", "fonts");
  console.log(`copying fonts: ${fontsSrc} -> ${fontsDest}`);
  await cp(fontsSrc, fontsDest, { recursive: true });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
