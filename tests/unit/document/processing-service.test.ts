/**
 * Document processing service unit tests (Fase 5).
 * Tests pure domain functions — no I/O.
 */
import { describe, expect, it } from "vitest";
import {
  computeChecksum,
  validateDocumentUpload,
  createPhysicalObject,
  createProcessingRun,
  createFactCandidates,
} from "@core/document/processing-service";
import { DEFAULT_UPLOAD_CONFIG } from "@core/document/types";
import type { IsoDateTime } from "@core/shared/temporal";

const NOW = "2026-09-19T12:00:00.000Z" as IsoDateTime;

function at<T>(arr: readonly T[], index: number): T {
  expect(arr.length).toBeGreaterThan(index);
  const item = arr[index];
  if (item === undefined) throw new Error(`Expected item at index ${index}`);
  return item;
}

// ── computeChecksum ─────────────────────────────────────────────────

describe("computeChecksum", () => {
  it("produces SHA-256 hex string", () => {
    const buffer = new TextEncoder().encode("test content");
    const checksum = computeChecksum(buffer);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const buffer = new TextEncoder().encode("deterministic");
    expect(computeChecksum(buffer)).toBe(computeChecksum(buffer));
  });

  it("different content produces different checksums", () => {
    const a = computeChecksum(new TextEncoder().encode("content A"));
    const b = computeChecksum(new TextEncoder().encode("content B"));
    expect(a).not.toBe(b);
  });

  it("matches standard SHA-256", async () => {
    const { createHash } = await import("node:crypto");
    const buffer = new TextEncoder().encode("verify me");
    const expected = createHash("sha256").update(buffer).digest("hex");
    expect(computeChecksum(buffer)).toBe(expected);
  });
});

// ── validateDocumentUpload ──────────────────────────────────────────

describe("validateDocumentUpload", () => {
  // Helper: create a buffer with PDF magic bytes
  function pdfBuffer(): Uint8Array {
    return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  }

  it("validates a clean PDF upload", () => {
    const buffer = pdfBuffer();
    const result = validateDocumentUpload(buffer, "application/pdf", "invoice.pdf");
    expect(result.valid).toBe(true);
    expect(result.sanitizedFilename).toBe("invoice.pdf");
  });

  it("sanitizes malicious filenames", () => {
    const result = validateDocumentUpload(
      new TextEncoder().encode("content"),
      "text/plain",
      "../../../etc/passwd.txt",
    );
    expect(result.valid).toBe(true);
    expect(result.sanitizedFilename).toBe("passwd.txt");
  });

  it("rejects oversized files", () => {
    const bigBuffer = new Uint8Array(DEFAULT_UPLOAD_CONFIG.maxFileSizeBytes + 1);
    bigBuffer.fill(0x41);
    const result = validateDocumentUpload(bigBuffer, "application/pdf", "big.pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects double extensions", () => {
    const result = validateDocumentUpload(
      new TextEncoder().encode("content"),
      "text/plain",
      "doc.pdf.exe",
    );
    expect(result.valid).toBe(false);
  });
});

// ── createPhysicalObject ────────────────────────────────────────────

describe("createPhysicalObject", () => {
  it("creates a valid PhysicalObject", () => {
    const obj = createPhysicalObject({
      caseId: "case-1",
      evidenceId: "ev-1",
      storageKey: "case-1/abc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256: "a".repeat(64),
      originalFilename: "invoice.pdf",
      at: NOW,
    });

    expect(obj.id).toBeTruthy();
    expect(obj.caseId).toBe("case-1");
    expect(obj.evidenceId).toBe("ev-1");
    expect(obj.storageKey).toBe("case-1/abc.pdf");
    expect(obj.mimeType).toBe("application/pdf");
    expect(obj.sizeBytes).toBe(1024);
    expect(obj.checksumSha256).toBe("a".repeat(64));
    expect(obj.originalFilename).toBe("invoice.pdf");
    expect(obj.status).toBe("STORED");
    expect(obj.createdAt).toBe(NOW);
  });

  it("generates unique IDs", () => {
    const obj1 = createPhysicalObject({
      caseId: "c",
      evidenceId: "e",
      storageKey: "k1",
      mimeType: "text/plain",
      sizeBytes: 1,
      checksumSha256: "a",
      at: NOW,
    });
    const obj2 = createPhysicalObject({
      caseId: "c",
      evidenceId: "e",
      storageKey: "k2",
      mimeType: "text/plain",
      sizeBytes: 1,
      checksumSha256: "a",
      at: NOW,
    });
    expect(obj1.id).not.toBe(obj2.id);
  });
});

// ── createProcessingRun ─────────────────────────────────────────────

describe("createProcessingRun", () => {
  it("creates a valid ProcessingRun with PENDING status", () => {
    const run = createProcessingRun({
      caseId: "case-1",
      physicalObjectId: "po-1",
      evidenceId: "ev-1",
      extractorType: "PDF_TEXT",
      at: NOW,
    });

    expect(run.id).toBeTruthy();
    expect(run.status).toBe("PENDING");
    expect(run.extractorType).toBe("PDF_TEXT");
    expect(run.retryCount).toBe(0);
  });
});

// ── createFactCandidates ────────────────────────────────────────────

describe("createFactCandidates", () => {
  it("creates candidates from proposed facts", () => {
    const candidates = createFactCandidates({
      caseId: "case-1",
      evidenceId: "ev-1",
      physicalObjectId: "po-1",
      processingRunId: "run-1",
      extractorVersion: "local-text@1.0.0",
      proposedFacts: [
        {
          factKey: "invoice.date",
          proposedValue: "2026-09-15",
          location: { page: 1, startOffset: 0, endOffset: 10 },
          confidence: 0.95,
        },
        {
          factKey: "invoice.amount",
          proposedValue: 150.0,
          location: { page: 1, startOffset: 20, endOffset: 30 },
          confidence: 0.88,
        },
      ],
      at: NOW,
    });

    expect(candidates).toHaveLength(2);

    expect(at(candidates, 0).factKey).toBe("invoice.date");
    expect(at(candidates, 0).proposedValue).toBe("2026-09-15");
    expect(at(candidates, 0).relation).toBe("EXTRACTED");
    expect(at(candidates, 0).extractorConfidence).toBe(0.95);
    expect(at(candidates, 0).linkedFactId).toBeUndefined();

    expect(at(candidates, 1).factKey).toBe("invoice.amount");
    expect(at(candidates, 1).proposedValue).toBe(150.0);
  });

  it("returns empty array for no proposed facts", () => {
    const candidates = createFactCandidates({
      caseId: "c",
      evidenceId: "e",
      physicalObjectId: "po",
      processingRunId: "run",
      extractorVersion: "v1",
      proposedFacts: [],
      at: NOW,
    });
    expect(candidates).toHaveLength(0);
  });

  it("generates unique IDs for each candidate", () => {
    const candidates = createFactCandidates({
      caseId: "c",
      evidenceId: "e",
      physicalObjectId: "po",
      processingRunId: "run",
      extractorVersion: "v1",
      proposedFacts: [
        { factKey: "a", proposedValue: 1, location: { startOffset: 0, endOffset: 1 } },
        { factKey: "b", proposedValue: 2, location: { startOffset: 2, endOffset: 3 } },
      ],
      at: NOW,
    });
    expect(at(candidates, 0).id).not.toBe(at(candidates, 1).id);
  });

  it("preserves location details", () => {
    const candidates = createFactCandidates({
      caseId: "c",
      evidenceId: "e",
      physicalObjectId: "po",
      processingRunId: "run",
      extractorVersion: "v1",
      proposedFacts: [
        {
          factKey: "k",
          proposedValue: "v",
          location: { page: 3, startOffset: 100, endOffset: 200 },
        },
      ],
      at: NOW,
    });
    const location = at(candidates, 0).location;
    expect(location).not.toBeNull();
    expect(location?.page).toBe(3);
    expect(location?.startOffset).toBe(100);
    expect(location?.endOffset).toBe(200);
    expect(location?.physicalObjectId).toBe("po");
  });
});
