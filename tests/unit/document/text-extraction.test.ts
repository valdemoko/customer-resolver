/**
 * Text extraction tests (Fase 5).
 * Tests the LocalTextExtractorAdapter — deterministic, no external dependencies.
 */
import { describe, expect, it } from "vitest";
import { LocalTextExtractorAdapter } from "@server/adapters/document/local-text-extractor";

const extractor = new LocalTextExtractorAdapter();

function assertNotNull<T>(value: T | null | undefined): asserts value is T {
  expect(value).not.toBeNull();
}

function assertDefined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}

// ── MIME support ────────────────────────────────────────────────────

describe("supports", () => {
  it("supports text/plain", () => expect(extractor.supports("text/plain")).toBe(true));
  it("supports text/csv", () => expect(extractor.supports("text/csv")).toBe(true));
  it("supports application/pdf", () => expect(extractor.supports("application/pdf")).toBe(true));
  it("does not support image/jpeg", () => expect(extractor.supports("image/jpeg")).toBe(false));
  it("does not support application/zip", () =>
    expect(extractor.supports("application/zip")).toBe(false));
});

// ── Plain text extraction ───────────────────────────────────────────

describe("text/plain extraction", () => {
  it("extracts full text from plain text", async () => {
    const buffer = new TextEncoder().encode("Hello, world!\nThis is a test.");
    const result = await extractor.extract({ buffer, mimeType: "text/plain" });
    assertNotNull(result);
    expect(result.fullText).toBe("Hello, world!\nThis is a test.");
    expect(result.usedOcr).toBe(false);
    expect(result.sections).toHaveLength(1);
    expect(assertDefined(result.sections[0]).kind).toBe("body");
  });

  it("handles empty text", async () => {
    const buffer = new TextEncoder().encode("");
    const result = await extractor.extract({ buffer, mimeType: "text/plain" });
    assertNotNull(result);
    expect(result.fullText).toBe("");
    expect(result.sections).toHaveLength(0);
  });

  it("preserves unicode characters", async () => {
    const buffer = new TextEncoder().encode("Español: áéíóú ñ, Deutsch: öüä, 中文: 你好");
    const result = await extractor.extract({ buffer, mimeType: "text/plain" });
    assertNotNull(result);
    expect(result.fullText).toContain("Español");
    expect(result.fullText).toContain("中文");
  });
});

// ── CSV extraction ──────────────────────────────────────────────────

describe("text/csv extraction", () => {
  it("extracts CSV with header and rows", async () => {
    const csv = "name,date,amount\nFactura 1,2026-01-15,150.00\nFactura 2,2026-02-20,200.00";
    const buffer = new TextEncoder().encode(csv);
    const result = await extractor.extract({ buffer, mimeType: "text/csv" });

    assertNotNull(result);
    expect(result.sections).toHaveLength(3);
    expect(assertDefined(result.sections[0]).kind).toBe("header");
    expect(assertDefined(result.sections[1]).kind).toBe("row");
    expect(result.metadata).toEqual(
      expect.objectContaining({ lineCount: 3, headerLine: "name,date,amount" }),
    );
  });

  it("handles single-line CSV (header only)", async () => {
    const buffer = new TextEncoder().encode("col1,col2,col3");
    const result = await extractor.extract({ buffer, mimeType: "text/csv" });
    assertNotNull(result);
    expect(result.sections).toHaveLength(1);
    expect(assertDefined(result.sections[0]).kind).toBe("header");
  });
});

// ── PDF extraction ──────────────────────────────────────────────────

describe("PDF extraction", () => {
  it("returns null for image-only PDF (no extractable text)", async () => {
    // Fake PDF without BT/ET text markers
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const result = await extractor.extract({ buffer, mimeType: "application/pdf" });

    expect(result).toBeNull();
  });

  it("extracts text from text-based PDF (BT/ET markers)", async () => {
    // Minimal PDF-like buffer with BT/ET text markers
    const textContent = "BT /F1 12 Tf 100 700 Td (Hello PDF) Tj ET";
    const buffer = new TextEncoder().encode(textContent);
    const result = await extractor.extract({ buffer, mimeType: "application/pdf" });
    assertNotNull(result);
    expect(result.fullText).toContain("Hello PDF");
    expect(result.usedOcr).toBe(false);
  });
});

// ── Unsupported formats ─────────────────────────────────────────────

describe("unsupported formats", () => {
  it("returns null for image/jpeg", async () => {
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const result = await extractor.extract({ buffer, mimeType: "image/jpeg" });
    expect(result).toBeNull();
  });

  it("returns null for application/zip", async () => {
    const buffer = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const result = await extractor.extract({ buffer, mimeType: "application/zip" });
    expect(result).toBeNull();
  });
});

// ── Reproducibility ─────────────────────────────────────────────────

describe("extraction reproducibility", () => {
  it("same input produces same output", async () => {
    const buffer = new TextEncoder().encode("Test content for reproducibility check");
    const result1 = await extractor.extract({ buffer, mimeType: "text/plain" });
    const result2 = await extractor.extract({ buffer, mimeType: "text/plain" });

    expect(result1).toEqual(result2);
  });

  it("extractor version is consistent", async () => {
    const buffer = new TextEncoder().encode("test");
    const result = await extractor.extract({ buffer, mimeType: "text/plain" });
    assertNotNull(result);
    expect(result.extractorVersion).toBe("local-text@1.0.0");
  });
});
