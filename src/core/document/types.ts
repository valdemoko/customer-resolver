/**
 * Document Intelligence domain types (Fase 5).
 *
 * Pure domain types — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * Separation from Evidence (Fase 2):
 *  - Evidence = semantic entity (WHAT the case has)
 *  - PhysicalObject = stored bytes (HOW it is persisted)
 *  - ProcessedDocument = extraction result (WHAT was extracted)
 *  - DocumentFactCandidate = proposed fact from extraction (NOT confirmed)
 *
 * None of these types implies that extracted facts are TRUE.
 */
import type { IsoDateTime } from "../shared/temporal";

// ── Physical Object (stored bytes) ──────────────────────────────────

export type PhysicalObjectId = string & { readonly __brand: "PhysicalObjectId" };

export type PhysicalObjectStatus = "STORED" | "PROCESSING" | "DELETED";

export interface PhysicalObject {
  readonly id: PhysicalObjectId;
  readonly caseId: string;
  readonly evidenceId: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** SHA-256 of the actual file bytes. This is the canonical integrity identifier. */
  readonly checksumSha256: string;
  readonly originalFilename?: string;
  readonly status: PhysicalObjectStatus;
  readonly createdAt: IsoDateTime;
}

// ── Document Processing Run ─────────────────────────────────────────

export type ProcessingRunId = string & { readonly __brand: "ProcessingRunId" };

export type ProcessingRunStatus =
  "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "RETRY_SCHEDULED";

export type ExtractorType = "TEXT_PLAIN" | "TEXT_CSV" | "PDF_TEXT" | "OCR" | "UNSUPPORTED";

export interface TextLocation {
  readonly page?: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface DocumentSection {
  readonly kind: string;
  readonly text: string;
  readonly location: TextLocation;
}

export interface DocumentText {
  readonly fullText: string;
  readonly sections: readonly DocumentSection[];
  /** Whether extraction relied on OCR (always false for text/plain, text/csv, text-with-text-PDF). */
  readonly usedOcr: boolean;
}

export interface ProcessingRunResult {
  readonly extractorType: ExtractorType;
  readonly extractorVersion: string;
  readonly text?: DocumentText;
  /** Raw metadata from the extractor (page count, etc). */
  readonly metadata?: Record<string, unknown>;
  readonly error?: string;
}

export interface DocumentProcessingRun {
  readonly id: ProcessingRunId;
  readonly caseId: string;
  readonly physicalObjectId: string;
  readonly evidenceId: string;
  readonly status: ProcessingRunStatus;
  readonly extractorType: ExtractorType;
  readonly extractorVersion: string;
  readonly result?: ProcessingRunResult;
  /** Number of retry attempts (max 3). */
  readonly retryCount: number;
  readonly createdAt: IsoDateTime;
  readonly completedAt?: IsoDateTime;
}

// ── Document Fact Candidate ─────────────────────────────────────────

export type DocumentFactCandidateId = string & {
  readonly __brand: "DocumentFactCandidateId";
};

export type CandidateRelation = "EXTRACTED" | "PROPOSED";

export interface DocumentLocation {
  /** Physical object this location refers to. */
  readonly physicalObjectId: string;
  /** Processing run that produced this location (persistence detail). */
  readonly processingRunId?: string;
  readonly page?: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
  /** Bounding box for images (future OCR). */
  readonly boundingBox?: { x: number; y: number; w: number; h: number };
}

export interface DocumentFactCandidate {
  readonly id: DocumentFactCandidateId;
  readonly caseId: string;
  readonly evidenceId: string;
  readonly physicalObjectId: string;
  readonly processingRunId: string;
  /** The fact key this candidate proposes (e.g., "cancellation.date"). */
  readonly factKey: string;
  /** The proposed value — typed as unknown, validated at the boundary. */
  readonly proposedValue: unknown;
  /** Where in the document this was extracted from. */
  readonly location: DocumentLocation;
  readonly extractorVersion: string;
  readonly extractorConfidence?: number;
  /** Relation to the document: EXTRACTED = directly from text, PROPOSED = inferred. */
  readonly relation: CandidateRelation;
  /** Has this candidate been linked to a fact in the case? */
  readonly linkedFactId?: string;
  readonly createdAt: IsoDateTime;
}

// ── Upload Configuration ────────────────────────────────────────────

export interface UploadConfig {
  readonly maxFileSizeBytes: number;
  readonly allowedMimeTypes: readonly string[];
  readonly allowedExtensions: readonly string[];
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  /** 20 MB default max. */
  maxFileSizeBytes: 20 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/webp",
  ],
  allowedExtensions: [".pdf", ".txt", ".csv", ".jpg", ".jpeg", ".png", ".webp"],
} as const;
