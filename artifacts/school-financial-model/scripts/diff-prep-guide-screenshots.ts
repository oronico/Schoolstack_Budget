/**
 * Task #935 — pixel-tolerant diff for the committed wizard prep-guide
 * screenshots vs. the freshly-captured ones in
 * `public/images/prep-guide/`. Used by `.github/workflows/prep-guide-drift.yml`
 * after `capture:prep-guide` + `build:prep-guide` to decide whether the
 * captures meaningfully changed.
 *
 * Why a tolerant diff rather than `git diff --exit-code`:
 *   The capture pipeline is locked down for reproducibility (bundled
 *   Latin woff2 fonts served via route interception, deterministic
 *   Chromium launch args, animations frozen, save-status badge hidden)
 *   but a handful of sub-pixel rounding artifacts in SVG/icon
 *   rasterization still drift by 6–50 pixels (max delta ≤ ~12) between
 *   any two runs on the same machine — let alone across Replit and
 *   GitHub Actions Ubuntu runners. A strict byte-diff therefore flakes,
 *   but a wizard UI change of any practical size easily exceeds the
 *   threshold below.
 *
 * Usage:
 *   tsx scripts/diff-prep-guide-screenshots.ts <baseline-dir> <current-dir>
 *
 * Exits 0 if every image is within tolerance, 1 if any image differs
 * meaningfully or if shapes/files don't match.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Per-pixel color-distance tolerance — pixelmatch's `threshold` is a 0..1
// YIQ distance. 0.1 is its tested default for "near-identical" comparisons
// and easily ignores the sub-pixel SVG/font rasterization noise the
// capture pipeline leaves behind (max observed delta ~12/765).
const PIXEL_THRESHOLD = 0.1;
// Maximum number of differing pixels per image before we flag drift.
// Observed run-to-run noise on the same host is ≤50 pixels; we set the
// cap to 400 (≈ 0.04% of a 1280×880 frame) so a real wizard change —
// even a single re-laid-out form row — trips the diff loudly, but
// rasterization jitter doesn't.
const MAX_DIFF_PIXELS = 400;

function loadPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

interface ImageDiff {
  filename: string;
  diffPixels: number;
  totalPixels: number;
  reason?: string;
}

function diffOne(baselinePath: string, currentPath: string): ImageDiff {
  const filename = baselinePath.split("/").pop()!;
  if (!existsSync(currentPath)) {
    return {
      filename,
      diffPixels: -1,
      totalPixels: 0,
      reason: "missing from current capture",
    };
  }
  const baseline = loadPng(baselinePath);
  const current = loadPng(currentPath);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      filename,
      diffPixels: -1,
      totalPixels: 0,
      reason: `dimensions changed: baseline ${baseline.width}x${baseline.height} → current ${current.width}x${current.height}`,
    };
  }
  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: PIXEL_THRESHOLD },
  );
  return { filename, diffPixels, totalPixels: width * height };
}

function main(): void {
  const [, , baselineDir, currentDir] = process.argv;
  if (!baselineDir || !currentDir) {
    console.error(
      "usage: tsx scripts/diff-prep-guide-screenshots.ts <baseline-dir> <current-dir>",
    );
    process.exit(2);
  }

  const baselineFiles = readdirSync(baselineDir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  const currentFiles = new Set(
    readdirSync(currentDir).filter((f) => f.endsWith(".png")),
  );

  const results: ImageDiff[] = [];
  for (const f of baselineFiles) {
    results.push(diffOne(join(baselineDir, f), join(currentDir, f)));
  }
  // Surface files present in current but not in baseline (new captures
  // a contributor forgot to commit) as failures too.
  for (const f of currentFiles) {
    if (!baselineFiles.includes(f)) {
      results.push({
        filename: f,
        diffPixels: -1,
        totalPixels: 0,
        reason: "present in current capture but missing from committed baseline",
      });
    }
  }

  let failed = false;
  for (const r of results) {
    if (r.reason) {
      console.error(`FAIL ${r.filename}: ${r.reason}`);
      failed = true;
    } else if (r.diffPixels > MAX_DIFF_PIXELS) {
      console.error(
        `FAIL ${r.filename}: ${r.diffPixels} differing pixels (cap ${MAX_DIFF_PIXELS}, total ${r.totalPixels})`,
      );
      failed = true;
    } else {
      console.log(
        `ok   ${r.filename}: ${r.diffPixels} differing pixels (cap ${MAX_DIFF_PIXELS})`,
      );
    }
  }

  if (failed) {
    console.error("");
    console.error(
      "Prep Guide screenshots drifted beyond rasterization noise. Most likely",
    );
    console.error(
      "the wizard UI changed. Re-run `capture:prep-guide` + `build:prep-guide`",
    );
    console.error("locally and commit the regenerated PNGs + prep-guide.pdf.");
    process.exit(1);
  }
  console.log(
    `\nAll ${results.length} prep-guide screenshots within tolerance.`,
  );
}

main();
