import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = "#FAF9F7";
const NAVY = "#1E293B";
const EVERGREEN = "#328555";
const EVERGREEN_LIGHT = "#5BA07A";
const AMBER = "#D97706";

function buildSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${NAVY}"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="barGrad1" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${EVERGREEN}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${EVERGREEN}"/>
    </linearGradient>
    <linearGradient id="barGrad2" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${EVERGREEN_LIGHT}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${EVERGREEN_LIGHT}"/>
    </linearGradient>
    <linearGradient id="barGrad3" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${EVERGREEN}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${EVERGREEN}"/>
    </linearGradient>
    <linearGradient id="barGrad4" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${AMBER}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${AMBER}"/>
    </linearGradient>
    <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${CREAM}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${CREAM}" stop-opacity="0.8"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.04" stroke="${CREAM}" stroke-width="0.5">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${60 * i}" y1="0" x2="${60 * i}" y2="${HEIGHT}"/>`).join("\n    ")}
    ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${60 * i}" x2="${WIDTH}" y2="${60 * i}"/>`).join("\n    ")}
  </g>

  <!-- ===== ILLUSTRATION: Growth bars (right side) ===== -->
  <g transform="translate(720, 100)">
    <!-- Bar chart base line -->
    <line x1="0" y1="380" x2="420" y2="380" stroke="${CREAM}" stroke-opacity="0.15" stroke-width="2"/>

    <!-- Bar 1 - shortest -->
    <rect x="30" y="280" width="60" height="100" rx="6" fill="url(#barGrad1)" opacity="0.7"/>

    <!-- Bar 2 -->
    <rect x="110" y="220" width="60" height="160" rx="6" fill="url(#barGrad2)" opacity="0.8"/>

    <!-- Bar 3 -->
    <rect x="190" y="150" width="60" height="230" rx="6" fill="url(#barGrad3)" opacity="0.85"/>

    <!-- Bar 4 -->
    <rect x="270" y="100" width="60" height="280" rx="6" fill="url(#barGrad1)" opacity="0.9"/>

    <!-- Bar 5 - tallest, amber accent -->
    <rect x="350" y="40" width="60" height="340" rx="6" fill="url(#barGrad4)"/>

    <!-- Trend line going up across bars -->
    <path d="M 60 270 C 120 230, 160 210, 220 145 S 320 80, 380 35"
          stroke="url(#trendLine)" stroke-width="3" fill="none" stroke-linecap="round"/>

    <!-- Dot at end of trend line -->
    <circle cx="380" cy="35" r="6" fill="${AMBER}"/>
    <circle cx="380" cy="35" r="10" fill="${AMBER}" opacity="0.3"/>

    <!-- Stacked layers below bars (building blocks metaphor) -->
    <g transform="translate(60, 395)">
      <rect x="0" y="0" width="300" height="10" rx="3" fill="${EVERGREEN}" opacity="0.3"/>
      <rect x="20" y="14" width="260" height="10" rx="3" fill="${EVERGREEN}" opacity="0.2"/>
      <rect x="40" y="28" width="220" height="10" rx="3" fill="${EVERGREEN}" opacity="0.12"/>
    </g>

    <!-- Small floating elements for visual interest -->
    <rect x="385" y="15" width="22" height="5" rx="2" fill="${AMBER}" opacity="0.5"/>
    <rect x="395" y="5" width="12" height="5" rx="2" fill="${AMBER}" opacity="0.3"/>
  </g>

  <!-- ===== LOGO MARK (top-left) ===== -->
  <g transform="translate(72, 72)">
    <rect x="0" y="22" width="36" height="9" rx="4" fill="${CREAM}"/>
    <rect x="2" y="11" width="32" height="9" rx="4" fill="${EVERGREEN_LIGHT}" opacity="0.7"/>
    <rect x="0" y="0" width="28" height="9" rx="4" fill="${EVERGREEN}"/>
  </g>

  <!-- Logo text -->
  <text x="122" y="100" font-family="Quicksand, 'Segoe UI', sans-serif" font-weight="700" font-size="28" fill="${CREAM}">SchoolStack</text>
  <text x="310" y="100" font-family="Quicksand, 'Segoe UI', sans-serif" font-weight="700" font-size="28" fill="${EVERGREEN_LIGHT}">Budget</text>

  <!-- ===== TAGLINE ===== -->
  <text x="72" y="220" font-family="Quicksand, 'Segoe UI', sans-serif" font-weight="700" font-size="52" fill="${CREAM}">Build your school's</text>
  <text x="72" y="285" font-family="Quicksand, 'Segoe UI', sans-serif" font-weight="700" font-size="52" fill="${EVERGREEN_LIGHT}">financial story.</text>

  <!-- Subtitle -->
  <text x="72" y="340" font-family="Nunito, 'Segoe UI', sans-serif" font-weight="400" font-size="22" fill="${CREAM}" opacity="0.6">5-year financial model — guided, professional, lender-ready.</text>

  <!-- Accent line -->
  <rect x="72" y="155" width="80" height="4" rx="2" fill="${AMBER}"/>

  <!-- ===== URL (bottom-left) ===== -->
  <text x="72" y="560" font-family="Nunito, 'Segoe UI', sans-serif" font-weight="500" font-size="18" fill="${CREAM}" opacity="0.45">budget.schoolstack.ai</text>

  <!-- Bottom accent bar -->
  <rect x="0" y="${HEIGHT - 4}" width="${WIDTH}" height="4" fill="${EVERGREEN}"/>
</svg>`;
}

async function main() {
  const svg = buildSvg();
  const outputDir = path.resolve(
    __dirname,
    "../../artifacts/school-financial-model/public/images",
  );
  const outputPath = path.join(outputDir, "og-image.png");

  await sharp(Buffer.from(svg)).resize(WIDTH, HEIGHT).png().toFile(outputPath);

  console.log(`OG image generated: ${outputPath}`);
  console.log(`Dimensions: ${WIDTH}x${HEIGHT}`);
}

main().catch((err) => {
  console.error("Failed to generate OG image:", err);
  process.exit(1);
});
