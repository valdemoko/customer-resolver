/**
 * Upload security validation tests (Fase 5).
 * Tests pure validation logic — no I/O, no external dependencies.
 */
import { describe, expect, it } from "vitest";
import { validateUpload, sanitizeFilename, generateStorageKey } from "@core/document/validation";
import { DEFAULT_UPLOAD_CONFIG } from "@core/document/types";

// ── Helpers ──────────────────────────────────────────────────────────

function textBuffer(content = "Hello world"): Uint8Array {
  return new TextEncoder().encode(content);
}

function pdfBuffer(): Uint8Array {
  // PDF magic bytes: %PDF
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
}

function pngBuffer(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function jpegBuffer(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
}

function webpBuffer(): Uint8Array {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
}

// ── sanitizeFilename ────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("removes path components", () => {
    expect(sanitizeFilename("/etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\test\\file.pdf")).toBe("file.pdf");
  });

  it("removes control characters", () => {
    expect(sanitizeFilename("file\x00name.pdf")).toBe("filename.pdf");
  });

  it("collapses double dots", () => {
    expect(sanitizeFilename("factura..pdf.exe")).toBe("factura.pdf.exe");
  });

  it("trims leading dots", () => {
    expect(sanitizeFilename("...hidden.pdf")).toBe("hidden.pdf");
  });

  it("limits length to 255 characters", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(255);
  });

  it("returns 'document' for empty input", () => {
    expect(sanitizeFilename("")).toBe("document");
    expect(sanitizeFilename("   ")).toBe("document");
  });

  it("preserves normal filenames", () => {
    expect(sanitizeFilename("factura-septiembre.pdf")).toBe("factura-septiembre.pdf");
  });

  it("handles URL-encoded null bytes in filenames", () => {
    // %00 is URL-encoded null byte — may appear in malicious filenames
    expect(sanitizeFilename("document.pdf%00.exe")).toBe("document.pdf%00.exe");
  });

  it("handles literal null bytes in filenames", () => {
    expect(sanitizeFilename("document.pdf\x00.exe")).toBe("document.pdf.exe");
  });
});

// ── validateUpload ──────────────────────────────────────────────────

describe("validateUpload", () => {
  describe("size validation", () => {
    it("rejects empty files", () => {
      const result = validateUpload({
        buffer: new Uint8Array(0),
        declaredMimeType: "text/plain",
        filename: "empty.txt",
        sizeBytes: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("rejects files exceeding max size", () => {
      const bigBuffer = new Uint8Array(DEFAULT_UPLOAD_CONFIG.maxFileSizeBytes + 1);
      bigBuffer.fill(0x41);
      const result = validateUpload({
        buffer: bigBuffer,
        declaredMimeType: "text/plain",
        filename: "big.txt",
        sizeBytes: bigBuffer.length,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    it("accepts files within size limit", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "small.txt",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("filename validation", () => {
    it("rejects path traversal in filename", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "../../../etc/passwd",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dangerous");
    });

    it("rejects backslash path traversal", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "..\\..\\windows\\system32\\cmd.exe",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects control characters in filename", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "file\x01name.txt",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects dots-only filename", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "...",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("double extension attacks", () => {
    it("rejects factura.pdf.exe", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "factura.pdf.exe",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("double extension");
    });

    it("rejects document.pdf%00.exe", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "document.pdf%00.exe",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("MIME type validation", () => {
    it("rejects disallowed MIME types", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "application/x-executable",
        filename: "malware.bin",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("accepts allowed MIME types with matching buffers", () => {
      const testCases: Array<{ mime: string; buffer: Uint8Array; ext: string }> = [
        { mime: "application/pdf", buffer: pdfBuffer(), ext: ".pdf" },
        { mime: "text/plain", buffer: textBuffer(), ext: ".txt" },
        { mime: "text/csv", buffer: textBuffer("a,b\nc,d"), ext: ".csv" },
        { mime: "image/jpeg", buffer: jpegBuffer(), ext: ".jpg" },
        { mime: "image/png", buffer: pngBuffer(), ext: ".png" },
        { mime: "image/webp", buffer: webpBuffer(), ext: ".webp" },
      ];
      for (const { mime, buffer, ext } of testCases) {
        const result = validateUpload({
          buffer,
          declaredMimeType: mime,
          filename: `file${ext}`,
          sizeBytes: buffer.length,
        });
        expect(result.valid, `Expected ${mime} to be accepted`).toBe(true);
      }
    });
  });

  describe("magic bytes / content sniffing", () => {
    it("rejects PDF declared as text/plain", () => {
      const result = validateUpload({
        buffer: pdfBuffer(),
        declaredMimeType: "text/plain",
        filename: "document.txt",
        sizeBytes: pdfBuffer().length,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("MIME mismatch");
    });

    it("rejects PNG declared as JPEG", () => {
      const result = validateUpload({
        buffer: pngBuffer(),
        declaredMimeType: "image/jpeg",
        filename: "image.jpg",
        sizeBytes: pngBuffer().length,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("MIME mismatch");
    });

    it("accepts text/plain for text content (no reliable magic bytes)", () => {
      const result = validateUpload({
        buffer: textBuffer("Hello, this is plain text content"),
        declaredMimeType: "text/plain",
        filename: "readme.txt",
        sizeBytes: textBuffer().length,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts correct PDF with PDF MIME", () => {
      const result = validateUpload({
        buffer: pdfBuffer(),
        declaredMimeType: "application/pdf",
        filename: "document.pdf",
        sizeBytes: pdfBuffer().length,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts correct PNG with PNG MIME", () => {
      const result = validateUpload({
        buffer: pngBuffer(),
        declaredMimeType: "image/png",
        filename: "image.png",
        sizeBytes: pngBuffer().length,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts correct JPEG with JPEG MIME", () => {
      const result = validateUpload({
        buffer: jpegBuffer(),
        declaredMimeType: "image/jpeg",
        filename: "photo.jpg",
        sizeBytes: jpegBuffer().length,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts correct WebP with WebP MIME", () => {
      const result = validateUpload({
        buffer: webpBuffer(),
        declaredMimeType: "image/webp",
        filename: "image.webp",
        sizeBytes: webpBuffer().length,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("extension validation", () => {
    it("rejects disallowed extensions", () => {
      const result = validateUpload({
        buffer: textBuffer(),
        declaredMimeType: "text/plain",
        filename: "malware.exe",
        sizeBytes: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("extension not allowed");
    });

    it("accepts allowed extensions", () => {
      for (const ext of DEFAULT_UPLOAD_CONFIG.allowedExtensions) {
        const result = validateUpload({
          buffer: textBuffer(),
          declaredMimeType: "text/plain",
          filename: `file${ext}`,
          sizeBytes: 100,
        });
        expect(result.valid).toBe(true);
      }
    });
  });
});

// ── generateStorageKey ──────────────────────────────────────────────

describe("generateStorageKey", () => {
  it("includes caseId prefix", () => {
    const key = generateStorageKey("case-123", "document.pdf");
    expect(key).toMatch(/^case-123\//);
  });

  it("includes file extension", () => {
    const key = generateStorageKey("case-123", "document.pdf");
    expect(key).toMatch(/\.pdf$/);
  });

  it("does not use original filename", () => {
    const key = generateStorageKey("case-123", "../../../etc/passwd");
    expect(key).not.toContain("passwd");
    expect(key).not.toContain("..");
  });

  it("generates unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateStorageKey("case-123", "file.pdf"));
    }
    expect(keys.size).toBe(100);
  });
});
