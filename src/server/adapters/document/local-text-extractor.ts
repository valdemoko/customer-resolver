/**
 * Local text extractor adapter (Fase 5).
 *
 * Deterministic extraction for text/plain and text/csv (no external dependencies).
 * For PDF: extracts text from text-based PDFs when possible; returns null for
 * image-only PDFs (OCR deferred to Fase 6).
 *
 * Implements TextExtractorPort — the core never imports this module.
 *
 * Privacy: extracted text is NEVER logged; caller is responsible for handling.
 */
import type {
  ExtractedSection,
  ExtractionInput,
  ExtractionResult,
  TextExtractorPort,
} from "@core/document/ports";

const EXTRACTOR_VERSION = "local-text@1.0.0";

// ── Plain text extractor ────────────────────────────────────────────

function extractPlainText(buffer: Uint8Array): ExtractionResult {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const sections: ExtractedSection[] =
    text.length > 0
      ? [
          {
            kind: "body",
            text,
            startOffset: 0,
            endOffset: text.length,
          },
        ]
      : [];

  return {
    fullText: text,
    sections,
    usedOcr: false,
    extractorVersion: EXTRACTOR_VERSION,
    metadata: { charCount: text.length },
  };
}

// ── CSV extractor ───────────────────────────────────────────────────

function extractCsv(buffer: Uint8Array): ExtractionResult {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const lines = text.split(/\r?\n/);
  const sections: ExtractedSection[] = [];
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    sections.push({
      kind: i === 0 ? "header" : "row",
      text: line,
      startOffset: offset,
      endOffset: offset + line.length,
    });
    offset += line.length + 1; // +1 for \n
  }

  return {
    fullText: text,
    sections,
    usedOcr: false,
    extractorVersion: EXTRACTOR_VERSION,
    metadata: { lineCount: lines.length, headerLine: lines[0] ?? "" },
  };
}

// ── PDF text extraction (basic) ─────────────────────────────────────

/**
 * Extract text from a text-based PDF by scanning for text streams.
 * This is a lightweight parser — not a full PDF implementation.
 * For production, use pdf-parse or pdfjs-dist behind this adapter.
 *
 * Returns null for image-only PDFs (no extractable text found).
 */
function extractPdfText(buffer: Uint8Array): ExtractionResult | null {
  // Convert to string for scanning (PDF is mostly ASCII for structure)
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(buffer);

  // Look for text content in PDF streams
  const textChunks: string[] = [];
  const pages: ExtractedSection[] = [];

  // Simple heuristic: find text between BT and ET markers (PDF text objects)
  const textRegex = /BT[\s\S]*?ET/g;
  let match;
  let pageCounter = 0;

  while ((match = textRegex.exec(raw)) !== null) {
    const chunk = match[0];
    // Extract text from Tj and TJ operators
    const tjMatches = chunk.match(/\(([^)]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tj of tjMatches) {
        const text = tj.replace(/\)\s*Tj$/, "").replace(/^\(/, "");
        if (text.trim().length > 0) {
          textChunks.push(text);
        }
      }
    }

    // TJ arrays: [(text) (text)] TJ
    const tjArrayMatches = chunk.match(/\[([^\]]*)\]\s*TJ/g);
    if (tjArrayMatches) {
      for (const arr of tjArrayMatches) {
        const inner = arr.replace(/^\[/, "").replace(/\]\s*TJ$/, "");
        const strMatches = inner.match(/\(([^)]*)\)/g);
        if (strMatches) {
          const assembled = strMatches.map((s) => s.replace(/^\(/, "").replace(/\)$/, "")).join("");
          if (assembled.trim().length > 0) {
            textChunks.push(assembled);
          }
        }
      }
    }
  }

  if (textChunks.length === 0) return null;

  const fullText = textChunks.join("\n");
  let offset = 0;
  for (const chunk of textChunks) {
    pages.push({
      kind: "page",
      text: chunk,
      page: pageCounter++,
      startOffset: offset,
      endOffset: offset + chunk.length,
    });
    offset += chunk.length + 1;
  }

  return {
    fullText,
    sections: pages,
    usedOcr: false,
    extractorVersion: EXTRACTOR_VERSION,
    metadata: {
      pageCount: pages.length,
      method: "pdf-text-stream",
    },
  };
}

// ── Adapter implementation ──────────────────────────────────────────

export class LocalTextExtractorAdapter implements TextExtractorPort {
  async extract(input: ExtractionInput): Promise<ExtractionResult | null> {
    const { buffer, mimeType } = input;

    switch (mimeType) {
      case "text/plain":
        return extractPlainText(buffer);
      case "text/csv":
        return extractCsv(buffer);
      case "application/pdf":
        return extractPdfText(buffer);
      default:
        return null;
    }
  }

  supports(mimeType: string): boolean {
    return ["text/plain", "text/csv", "application/pdf"].includes(mimeType);
  }
}
