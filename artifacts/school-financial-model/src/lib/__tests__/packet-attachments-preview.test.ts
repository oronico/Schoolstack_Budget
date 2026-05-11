import { describe, expect, it } from "vitest";
import {
  buildPacketAttachmentsPreview,
  classifyPacketAttachment,
  formatPacketAttachmentSize,
  PACKET_ATTACHMENT_MAX_BYTES,
} from "../packet-attachments-preview";

const baseFile = {
  id: "f1",
  name: "lease.pdf",
  mimeType: "application/pdf",
  size: 1024,
  uploadedAt: "2025-01-01T00:00:00Z",
};

describe("classifyPacketAttachment", () => {
  it("treats a small PDF as embedded", () => {
    const r = classifyPacketAttachment({ ...baseFile });
    expect(r.disposition).toBe("embedded-pdf");
    expect(r.label).toBe("Embedded");
  });

  it("flags an oversized PDF as available on request", () => {
    const r = classifyPacketAttachment({
      ...baseFile,
      size: PACKET_ATTACHMENT_MAX_BYTES + 1,
    });
    expect(r.disposition).toBe("oversized");
    expect(r.label).toBe("Available on request — exceeds 10 MB");
  });

  it("treats a small PNG/JPEG as embedded image", () => {
    expect(
      classifyPacketAttachment({
        ...baseFile,
        name: "site.png",
        mimeType: "image/png",
      }).disposition,
    ).toBe("embedded-image");
    expect(
      classifyPacketAttachment({
        ...baseFile,
        name: "site.jpg",
        mimeType: "image/jpeg",
      }).disposition,
    ).toBe("embedded-image");
  });

  it("keeps a large PNG/JPEG marked as embedded (server treats all as image)", () => {
    // Mirrors `evidenceAttachmentDisposition` in lender-packet-pdf.ts:
    // images return the "image" disposition regardless of declared
    // size — the 5 MB thumbnail cap is a render-time fallback.
    const r = classifyPacketAttachment({
      ...baseFile,
      name: "huge.png",
      mimeType: "image/png",
      size: PACKET_ATTACHMENT_MAX_BYTES * 2,
    });
    expect(r.disposition).toBe("embedded-image");
    expect(r.label).toBe("Embedded");
  });

  it("flags webp/heic/gif images as unsupported (PDFKit limit)", () => {
    expect(
      classifyPacketAttachment({
        ...baseFile,
        name: "site.webp",
        mimeType: "image/webp",
      }).disposition,
    ).toBe("unsupported");
  });

  it("flags arbitrary non-image non-pdf as unsupported when small", () => {
    const r = classifyPacketAttachment({
      ...baseFile,
      name: "rates.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(r.disposition).toBe("unsupported");
    expect(r.label).toBe("Available on request — unsupported type");
  });

  it("detects PDFs by file extension when mime type is missing", () => {
    expect(
      classifyPacketAttachment({
        ...baseFile,
        name: "MOU.PDF",
        mimeType: "",
      }).disposition,
    ).toBe("embedded-pdf");
  });
});

describe("buildPacketAttachmentsPreview", () => {
  it("walks the confidence map and rolls up totals", () => {
    const out = buildPacketAttachmentsPreview({
      facility_rent_y1: {
        confidence: "signed_agreement",
        evidenceFiles: [
          { ...baseFile, id: "a", name: "lease.pdf", size: 1_500_000 },
        ],
      },
      operating_expenses_y1: {
        confidence: "estimate",
        evidenceFiles: [
          {
            ...baseFile,
            id: "b",
            name: "scan.png",
            mimeType: "image/png",
            size: 1_000_000,
          },
          {
            ...baseFile,
            id: "c",
            name: "huge.pdf",
            size: PACKET_ATTACHMENT_MAX_BYTES + 100,
          },
        ],
      },
    });
    expect(out.items).toHaveLength(3);
    expect(out.embeddedCount).toBe(2);
    expect(out.availableOnRequestCount).toBe(1);
    expect(out.totalEmbeddedBytes).toBe(2_500_000);
    const labels = out.items.map((i) => i.assumptionLabel);
    expect(labels).toContain("Year 1 facility cost");
    expect(labels).toContain("Year 1 operating expenses");
    expect(out.items.find((i) => i.name === "huge.pdf")?.disposition).toBe(
      "oversized",
    );
  });

  it("ignores entries without files and unknown registry keys", () => {
    const out = buildPacketAttachmentsPreview({
      not_a_real_key: {
        confidence: "estimate",
        evidenceFiles: [{ ...baseFile, id: "x" }],
      } as never,
      year1_facility_cost: { confidence: "estimate" },
    });
    expect(out.items).toHaveLength(0);
    expect(out.totalEmbeddedBytes).toBe(0);
  });

  it("handles undefined confidence map", () => {
    const out = buildPacketAttachmentsPreview(undefined);
    expect(out).toEqual({
      items: [],
      totalEmbeddedBytes: 0,
      embeddedCount: 0,
      availableOnRequestCount: 0,
    });
  });
});

describe("formatPacketAttachmentSize", () => {
  it("formats bytes / KB / MB", () => {
    expect(formatPacketAttachmentSize(0)).toBe("0 B");
    expect(formatPacketAttachmentSize(512)).toBe("512 B");
    expect(formatPacketAttachmentSize(2048)).toBe("2 KB");
    expect(formatPacketAttachmentSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
