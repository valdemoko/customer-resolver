/**
 * Document processing service (Fase 5).
 *
 * Orchestrates: upload → validation → storage → processing → extraction → fact candidates.
 * All mutations go through CaseRepository.saveUnit (atomic, version-bumped).
 *
 * The core never calls R2, S3, or any OCR engine directly — all through ports.
 * Extracted facts are DOCUMENT_EXTRACTED / UNCONFIRMED by default (no auto-confirmation).
 */
import { DomainError, ValidationError } from "@lib/errors";
import type { CaseRepository } from "../ports";
import { CaseNotFoundError } from "../case/service";
import { createEvent } from "../case/events";
import { now as systemNow, type IsoDateTime } from "../shared/temporal";
import {
  type DocumentFactCandidate,
  type DocumentFactCandidateId,
  type DocumentProcessingRun,
  type ExtractorType,
  type PhysicalObject,
  type PhysicalObjectId,
  type ProcessingRunId,
  type ProcessingRunResult,
} from "./types";
import type { ObjectStoragePort, TextExtractorPort, UploadValidatorPort } from "./ports";
import { validateUpload, generateStorageKey, sanitizeFilename } from "./validation";
import { createHash } from "node:crypto";

// ── ID helpers ──────────────────────────────────────────────────────

function newPhysicalObjectId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newProcessingRunId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newCandidateId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Errors ──────────────────────────────────────────────────────────

export class DocumentProcessingError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = "DocumentProcessingError";
  }
}

// ── MIME → ExtractorType mapping ───────────────────────────────────

/** Map MIME type to the correct extractor type. Deterministic, pure. */
function mapExtractorType(mimeType: string): ExtractorType {
  switch (mimeType) {
    case "text/plain":
      return "TEXT_PLAIN";
    case "text/csv":
      return "TEXT_CSV";
    case "application/pdf":
      return "PDF_TEXT";
    default:
      return "UNSUPPORTED";
  }
}

// ── Core logic functions (pure, testable) ───────────────────────────

/**
 * Compute SHA-256 of actual bytes. Deterministic, pure.
 */
export function computeChecksum(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Validate an upload. Returns validation result + sanitized filename.
 * Pure, no I/O.
 */
export function validateDocumentUpload(
  buffer: Uint8Array,
  declaredMimeType: string,
  filename: string,
): {
  valid: boolean;
  sanitizedFilename: string;
  error?: string;
} {
  const sanitized = sanitizeFilename(filename);
  const sizeBytes = buffer.length;

  const result = validateUpload({ buffer, declaredMimeType, filename: sanitized, sizeBytes });

  return {
    valid: result.valid,
    sanitizedFilename: sanitized,
    error: result.error,
  };
}

/**
 * Create a PhysicalObject record from validated upload data.
 * Pure domain function — no I/O.
 */
export function createPhysicalObject(input: {
  caseId: string;
  evidenceId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalFilename?: string;
  at: IsoDateTime;
}): PhysicalObject {
  return {
    id: newPhysicalObjectId() as PhysicalObjectId,
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    originalFilename: input.originalFilename,
    status: "STORED",
    createdAt: input.at,
  };
}

/**
 * Create a DocumentProcessingRun record. Pure domain function.
 */
export function createProcessingRun(input: {
  caseId: string;
  physicalObjectId: string;
  evidenceId: string;
  extractorType: string;
  at: IsoDateTime;
}): DocumentProcessingRun {
  return {
    id: newProcessingRunId() as ProcessingRunId,
    caseId: input.caseId,
    physicalObjectId: input.physicalObjectId,
    evidenceId: input.evidenceId,
    status: "PENDING",
    extractorType: input.extractorType as DocumentProcessingRun["extractorType"],
    extractorVersion: "local-text-extractor@1.0.0",
    retryCount: 0,
    createdAt: input.at,
  };
}

/**
 * Create DocumentFactCandidate records from extraction results.
 * Pure domain function — candidates are NOT confirmed facts.
 */
export function createFactCandidates(input: {
  caseId: string;
  evidenceId: string;
  physicalObjectId: string;
  processingRunId: string;
  extractorVersion: string;
  /** Extracted key-value pairs. Each becomes a candidate. */
  proposedFacts: ReadonlyArray<{
    factKey: string;
    proposedValue: unknown;
    location: { page?: number; startOffset: number; endOffset: number };
    confidence?: number;
  }>;
  at: IsoDateTime;
}): DocumentFactCandidate[] {
  return input.proposedFacts.map(
    (f) =>
      ({
        id: newCandidateId() as DocumentFactCandidateId,
        caseId: input.caseId,
        evidenceId: input.evidenceId,
        physicalObjectId: input.physicalObjectId,
        processingRunId: input.processingRunId,
        factKey: f.factKey,
        proposedValue: f.proposedValue,
        location: {
          physicalObjectId: input.physicalObjectId,
          page: f.location.page,
          startOffset: f.location.startOffset,
          endOffset: f.location.endOffset,
        },
        extractorVersion: input.extractorVersion,
        extractorConfidence: f.confidence,
        relation: "EXTRACTED",
        createdAt: input.at,
      }) satisfies DocumentFactCandidate,
  );
}

// ── Application Service ─────────────────────────────────────────────

export interface UploadAndProcessInput {
  readonly caseId: string;
  readonly evidenceId: string;
  readonly buffer: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
  /** Fact keys the case's module can accept — anything else is dropped. */
  readonly requiredFactKeys?: readonly string[];
  /**
   * Turns extracted text into fact candidates (the AI layer in production).
   * Absent ⇒ the document is stored and its text extracted, with no candidates.
   */
  readonly factExtractor?: DocumentFactExtractor;
}

/** A fact found in a document, before any user confirmation. */
export interface ExtractedFactProposal {
  readonly factKey: string;
  readonly proposedValue: unknown;
  /** `null` when the quote could not be located in the text — dropped: the AI
   *  may not invent where a value came from (spec §7). */
  readonly location: {
    readonly page?: number;
    readonly startOffset: number;
    readonly endOffset: number;
  } | null;
  readonly confidence?: number;
}

/** Port: read fact candidates out of an already-extracted document text. */
export interface DocumentFactExtractor {
  extract(input: {
    readonly caseId: string;
    readonly documentText: string;
    readonly requiredFactKeys: readonly string[];
    readonly physicalObjectId: string;
  }): Promise<readonly ExtractedFactProposal[]>;
}

export interface UploadAndProcessResult {
  readonly physicalObject: PhysicalObject;
  readonly processingRun: DocumentProcessingRun;
  readonly factCandidates: readonly DocumentFactCandidate[];
  /**
   * Why no candidates were produced, when the extraction itself failed.
   * Surfaced to the user: a document the system could not read must never
   * look like a document with nothing in it.
   */
  readonly factExtractionError: string | null;
}

export class DocumentProcessingService {
  constructor(
    private readonly repo: CaseRepository,
    private readonly storage: ObjectStoragePort,
    private readonly extractor: TextExtractorPort,
    private readonly validator: UploadValidatorPort,
  ) {}

  /**
   * End-to-end: validate → store → process → extract → create candidates.
   * All atomic via saveUnit. Idempotent by checksum + extractor version.
   */
  async uploadAndProcess(input: UploadAndProcessInput): Promise<UploadAndProcessResult> {
    const { caseId, evidenceId, buffer, mimeType, filename } = input;
    const at = systemNow();

    // 1. Load case
    const loaded = await this.repo.loadCase(caseId);
    if (!loaded) throw new CaseNotFoundError(caseId);

    // 2. Verify evidence exists and is in correct status
    const evidence = loaded.evidence.find((e) => e.id === evidenceId);
    if (!evidence) throw new DomainError(`Evidence not found: ${evidenceId}`);
    if (evidence.status === "REJECTED") {
      throw new DomainError("Cannot process REJECTED evidence");
    }

    // 3. Validate upload
    const validation = this.validator.validate({
      buffer,
      declaredMimeType: mimeType,
      filename: sanitizeFilename(filename),
      sizeBytes: buffer.length,
    });
    if (!validation.valid) {
      throw new ValidationError(`Upload rejected: ${validation.error}`);
    }

    // 4. Compute checksum from actual bytes
    const checksumSha256 = computeChecksum(buffer);

    // 5. Check idempotency: same byte checksum + same case = already processed
    const existingPhysical = loaded.physicalObjects.find(
      (po) => po.checksumSha256 === checksumSha256,
    );
    if (existingPhysical) {
      throw new DomainError("Document with same checksum already processed for this case");
    }

    // 6. Generate storage key (never user filename)
    const storageKey = generateStorageKey(caseId, filename);

    // 7. Store bytes
    await this.storage.put({
      key: storageKey,
      body: buffer,
      contentType: mimeType,
      metadata: { evidenceId, caseId },
    });

    // 8. Create PhysicalObject
    const physicalObject = createPhysicalObject({
      caseId,
      evidenceId,
      storageKey,
      mimeType,
      sizeBytes: buffer.length,
      checksumSha256,
      originalFilename: filename,
      at,
    });

    // 9. Determine extractor type from MIME type
    const extractorType = mapExtractorType(mimeType);

    // 10. Create processing run
    const run = createProcessingRun({
      caseId,
      physicalObjectId: physicalObject.id,
      evidenceId,
      extractorType,
      at,
    });

    // 10. Process document (text extraction)
    let processingResult: ProcessingRunResult | undefined;
    let factCandidates: DocumentFactCandidate[] = [];
    let factExtractionError: string | null = null;

    if (this.extractor.supports(mimeType)) {
      const extraction = await this.extractor.extract({
        buffer,
        mimeType,
        filename,
      });

      if (extraction) {
        processingResult = {
          extractorType: run.extractorType,
          extractorVersion: extraction.extractorVersion,
          text: {
            fullText: extraction.fullText,
            sections: extraction.sections.map((s) => ({
              kind: s.kind,
              text: s.text,
              location: { page: s.page, startOffset: s.startOffset, endOffset: s.endOffset },
            })),
            usedOcr: extraction.usedOcr,
          },
          metadata: extraction.metadata,
        };

        // Create fact candidates from the extracted text.
        // The extractor port is how the AI layer joins here: without it the text
        // is stored but nothing is proposed (the document would contribute nothing).
        if (extraction.fullText.length > 0) {
          let proposals: readonly ExtractedFactProposal[] = [];
          const requiredFactKeys = input.requiredFactKeys ?? [];
          if (input.factExtractor && requiredFactKeys.length > 0) {
            try {
              proposals = await input.factExtractor.extract({
                caseId,
                documentText: extraction.fullText,
                requiredFactKeys,
                physicalObjectId: physicalObject.id,
              });
            } catch (error) {
              // A failed AI read must not discard the uploaded document: the text
              // stays, and the caller is told so it can say so to the user.
              factExtractionError = error instanceof Error ? error.message : String(error);
              proposals = [];
            }
          }

          factCandidates = createFactCandidates({
            caseId,
            evidenceId,
            physicalObjectId: physicalObject.id,
            processingRunId: run.id,
            extractorVersion: extraction.extractorVersion,
            // Only candidates whose quote was actually found in the document: an
            // unlocatable value cannot be traced to a source.
            proposedFacts: proposals
              .filter((proposal) => proposal.location !== null)
              .map((proposal) => ({
                factKey: proposal.factKey,
                proposedValue: proposal.proposedValue,
                location: proposal.location as {
                  page?: number;
                  startOffset: number;
                  endOffset: number;
                },
                confidence: proposal.confidence,
              })),
            at,
          });
        }

        // Mark run completed
        const completedRun: DocumentProcessingRun = {
          ...run,
          status: "COMPLETED",
          result: processingResult,
          completedAt: at,
        };

        // Persist everything atomically
        await this.repo.saveUnit(
          {
            caseId,
            newFacts: [],
            updatedFacts: [],
            newContradictions: [],
            updatedContradictions: [],
            newEvidence: [],
            updatedEvidence: [{ ...evidence, status: "PROCESSED" as const, updatedAt: at }],
            newPhysicalObjects: [physicalObject],
            newProcessingRuns: [completedRun],
            newFactCandidates: factCandidates,
            newEvents: [
              createEvent(
                caseId,
                "DOCUMENT_UPLOADED",
                {
                  evidenceId,
                  physicalObjectId: physicalObject.id,
                  checksum: checksumSha256,
                  extractorType: run.extractorType,
                },
                at,
              ),
            ],
          },
          loaded.case.version,
        );

        return {
          physicalObject,
          processingRun: completedRun,
          factCandidates,
          factExtractionError,
        };
      }
    }

    // Unsupported format — store but mark as AVAILABLE (not PROCESSED)
    // H2: PROCESSED must mean "extraction completed successfully"
    const failedRun: DocumentProcessingRun = {
      ...run,
      status: "FAILED",
      result: {
        extractorType: "UNSUPPORTED",
        extractorVersion: run.extractorVersion,
        error: `No extractor available for MIME type: ${mimeType}`,
      },
    };

    await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvidence: [],
        updatedEvidence: [{ ...evidence, status: "AVAILABLE" as const, updatedAt: at }],
        newPhysicalObjects: [physicalObject],
        newProcessingRuns: [failedRun],
        newEvents: [
          createEvent(
            caseId,
            "DOCUMENT_UPLOADED",
            {
              evidenceId,
              physicalObjectId: physicalObject.id,
              checksum: checksumSha256,
              extractorType: "UNSUPPORTED",
            },
            at,
          ),
        ],
      },
      loaded.case.version,
    );

    return {
      physicalObject,
      processingRun: failedRun,
      factCandidates,
      factExtractionError,
    };
  }
}
