// Task #839 — shared PDF rasterizer used by both the lender/board
// packet renderers (which embed first-page thumbnails into the PDF
// appendix) and the in-app evidence thumbnail endpoint (so the
// browser doesn't have to ship mupdf-wasm). Lazy-loads the mupdf
// module so the API server's cold-start cost is unaffected when no
// PDFs need rasterization.

let mupdfModulePromise: Promise<typeof import("mupdf")> | null = null;

function getMupdf(): Promise<typeof import("mupdf")> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = import("mupdf");
  }
  return mupdfModulePromise;
}

/**
 * Rasterize the first page of a PDF to a PNG buffer. Returns null on
 * any failure (encrypted, malformed, empty document, etc.) so callers
 * can fall back to a file-type indicator badge.
 *
 * The 0.5x source-pixel scale produces a fingernail-size thumbnail at
 * typical letter / A4 page dimensions — plenty of detail for the
 * 56pt PDF appendix box and the ~10rem in-app preview without
 * bloating the embed.
 */
export async function rasterizePdfFirstPage(bytes: Buffer): Promise<Buffer | null> {
  try {
    const mupdf = await getMupdf();
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
      if (doc.countPages() < 1) return null;
      const page = doc.loadPage(0);
      const matrix = mupdf.Matrix.scale(0.5, 0.5);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
      const png = pixmap.asPNG();
      return Buffer.from(png);
    } finally {
      (doc as unknown as { destroy?: () => void }).destroy?.();
    }
  } catch {
    return null;
  }
}
