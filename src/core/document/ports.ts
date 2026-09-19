/**
 * Document Intelligence ports (Fase 5).
 *
 * Core defines WHAT it needs; infrastructure implements HOW (ports & adapters).
 * The core never imports R2 SDK, S3 SDK, or any OCR library directly.
 */

// ── Object Storage Port ─────────────────────────────────────────────

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
}

export interface ObjectMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly lastModified?: string;
}

export interface ObjectStoragePort {
  /**
   * Store an object. The key is SYSTEM-GENERATED (never user-provided filename).
   * Idempotent: storing the same key with the same bytes succeeds silently.
   */
  put(input: PutObjectInput): Promise<ObjectMetadata>;

  /** Retrieve an object. Throws if not found. */
  get(key: string): Promise<Uint8Array>;

  /** Check if an object exists. */
  exists(key: string): Promise<boolean>;

  /** Get metadata without fetching the full body. */
  getMetadata(key: string): Promise<ObjectMetadata>;

  /** Delete an object. Idempotent: deleting a nonexistent key is a no-op. */
  delete(key: string): Promise<void>;
}

// ── Text Extractor Port ─────────────────────────────────────────────

export interface ExtractionInput {
  readonly buffer: Uint8Array;
  readonly mimeType: string;
  readonly filename?: string;
}

export interface ExtractionResult {
  readonly fullText: string;
  readonly sections: readonly ExtractedSection[];
  readonly usedOcr: boolean;
  readonly extractorVersion: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ExtractedSection {
  readonly kind: string;
  readonly text: string;
  readonly page?: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface TextExtractorPort {
  /**
   * Extract text from a document. Returns null if the format is not supported.
   * Does NOT throw for unsupported formats — returns null so caller can handle gracefully.
   */
  extract(input: ExtractionInput): Promise<ExtractionResult | null>;

  /** Check if this extractor supports the given MIME type. */
  supports(mimeType: string): boolean;
}

// ── Document Processor Port ─────────────────────────────────────────

export interface DocumentProcessorInput {
  readonly evidenceId: string;
  readonly caseId: string;
  readonly buffer: Uint8Array;
  readonly mimeType: string;
  readonly filename?: string;
}

export interface ProcessedDocument {
  readonly documentId: string;
  readonly mimeType: string;
  readonly text?: string;
  readonly sections?: readonly ExtractedSection[];
  readonly extractorVersion: string;
  readonly checksum: string;
  readonly usedOcr: boolean;
}

export interface DocumentProcessorPort {
  process(input: DocumentProcessorInput): Promise<ProcessedDocument>;
}

// ── Upload Validation Port ──────────────────────────────────────────

export interface ValidateUploadInput {
  readonly buffer: Uint8Array;
  readonly declaredMimeType: string;
  readonly filename: string;
  readonly sizeBytes: number;
}

export interface ValidateUploadResult {
  readonly valid: boolean;
  readonly normalizedMimeType?: string;
  readonly error?: string;
}

export interface UploadValidatorPort {
  validate(input: ValidateUploadInput): ValidateUploadResult;
}
