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
  "bcryptjs",
  "compression",
  "cookie-parser",
  "cors",
  "drizzle-orm",
  "exceljs",
  "express",
  "helmet",
  "jsonwebtoken",
  "resend",
  "pdfkit",
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
    },
    // Point @workspace/db at the migrations folder we copy below. Done in a
    // banner (not via `define`) because we need the value computed at runtime
    // from __dirname, which only exists inside the CJS module wrapper.
    banner: {
      js: "process.env.DRIZZLE_MIGRATIONS_DIR = process.env.DRIZZLE_MIGRATIONS_DIR || require('path').resolve(__dirname, 'drizzle');",
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
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
