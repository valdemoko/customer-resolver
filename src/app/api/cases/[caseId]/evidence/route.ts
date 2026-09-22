/**
 * API Route: POST /api/cases/:caseId/evidence
 *
 * Accepts a document (multipart/form-data, field `file`), extracts its text and
 * returns the fact candidates found in it.
 *
 * Security / privacy posture:
 *  - The uploaded bytes are validated (type + size) before anything else.
 *  - Text is extracted in-process; nothing is sent anywhere but our own AI layer.
 *  - Nothing derived from the document is CONFIRMED: every candidate must be
 *    confirmed by the user through /api/intake/confirm, which is the only path
 *    that turns document data into facts the rule engine can use.
 *  - Binary retention requires object storage. When R2 is configured the file is
 *    stored there; otherwise the bytes are used for extraction and discarded
 *    (the extracted data and its provenance stay in the database).
 */
import { NextResponse } from "next/server";
import { CaseService } from "@core/case/service";
import { EvidenceService } from "@core/evidence/service";
import {
  DocumentProcessingService,
  type DocumentFactExtractor,
} from "@core/document/processing-service";
import { AIFactExtractionService } from "@core/ai/fact-extraction";
import { createIntakeServices } from "@server/intake/composition";
import { getBudgetStore } from "@server/intake/budget-store";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { InMemoryObjectStorage } from "@server/adapters/storage/in-memory-object-storage";
import { LocalTextExtractorAdapter } from "@server/adapters/document/local-text-extractor";
import { UploadValidatorAdapter } from "@server/adapters/document/upload-validator";
import { getServerEnv } from "@/lib/env";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 15 MB — larger documents are rejected before being read into memory. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

type Repo = ConstructorParameters<typeof DrizzleCaseRepository>[0];

async function createStorage() {
  const env = getServerEnv();
  if (
    env.R2_ACCOUNT_ID &&
    env.R2_BUCKET_DOCUMENTS &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY
  ) {
    const { R2ObjectStorage } = await import("@server/adapters/storage/r2-object-storage");
    return new R2ObjectStorage({
      accountId: env.R2_ACCOUNT_ID,
      bucketName: env.R2_BUCKET_DOCUMENTS,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }
  // No object storage configured: extract now, keep nothing.
  return new InMemoryObjectStorage();
}

function compositionRoot() {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required (503 until configured)");
  }
  const db = createNeonDb(DATABASE_URL) as unknown as Repo;
  const repo = new DrizzleCaseRepository(db);
  return {
    repo,
    caseService: new CaseService(repo),
    evidenceService: new EvidenceService(repo),
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;

  if (!isValidCaseId(caseId)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid case ID format" } },
      { status: 400 },
    );
  }

  // 1. Read the upload
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Expected multipart/form-data" } },
      { status: 400 },
    );
  }

  const uploaded = form.get("file");
  if (!(uploaded instanceof File)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Missing 'file' field" } },
      { status: 400 },
    );
  }

  if (uploaded.size === 0) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Empty file" } },
      { status: 400 },
    );
  }

  if (uploaded.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: `El archivo supera el límite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
        },
      },
      { status: 413 },
    );
  }

  const filename = uploaded.name || "documento";
  const mimeType = uploaded.type || "application/octet-stream";
  const buffer = new Uint8Array(await uploaded.arrayBuffer());

  // 2. Services
  let services: ReturnType<typeof compositionRoot>;
  try {
    services = compositionRoot();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // 3. The case must exist before anything is attached to it.
  let loadedCase: Awaited<ReturnType<typeof services.caseService.loadCase>>;
  try {
    loadedCase = await services.caseService.loadCase(caseId);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  // 3b. Fact keys this case's problem can accept, and the AI reader that turns
  //     the document text into candidates. Without it an uploaded invoice would
  //     be stored, read, and contribute nothing to the analysis.
  const problemSlug = loadedCase.case.problemSlug;
  let requiredFactKeys: readonly string[] = [];
  let factExtractor: DocumentFactExtractor | undefined;
  try {
    const intake = createIntakeServices();
    requiredFactKeys = intake.registry.has(problemSlug)
      ? intake.registry.get(problemSlug).factCatalogue.map((fact) => fact.key as string)
      : [];
    const budgetStore = getBudgetStore();
    const reader = new AIFactExtractionService(intake.router);

    factExtractor = {
      async extract({ caseId: id, documentText, requiredFactKeys: keys, physicalObjectId }) {
        // Document reading shares the per-case AI budget: an anonymous upload
        // must not become an unlimited AI spend.
        const reservation = await budgetStore.tryReserveBudget(id);
        if (!reservation.allowed) {
          throw new Error("AI budget exhausted for this case");
        }
        try {
          const extracted = await reader.extract({
            caseId: id,
            physicalObjectId,
            documentText,
            requiredFactKeys: keys,
            now: () => new Date().toISOString(),
          });
          return extracted.candidates.map((candidate) => ({
            factKey: candidate.factKey,
            proposedValue: candidate.proposedValue,
            // Only a quote actually found in the text carries a location; see
            // mapModelFactsToCandidates (the AI cannot invent one). Without real
            // offsets there is no traceable location, so the value is dropped
            // rather than attached to a made-up span.
            location:
              candidate.location &&
              typeof candidate.location.startOffset === "number" &&
              typeof candidate.location.endOffset === "number"
                ? {
                    page: candidate.location.page,
                    startOffset: candidate.location.startOffset,
                    endOffset: candidate.location.endOffset,
                  }
                : null,
            confidence:
              candidate.certainty === "EXPLICIT"
                ? 0.95
                : candidate.certainty === "INFERRED"
                  ? 0.7
                  : 0.4,
          }));
        } catch (error) {
          // Nothing was produced for the user: give the slot back so a retry is possible.
          await budgetStore.releaseBudget(id);
          // Carry the AI error's own detail: without it a failure here is
          // indistinguishable from "the document had nothing in it".
          const message = error instanceof Error ? error.message : String(error);
          const cause =
            error instanceof Error && "causeDetail" in error
              ? String((error as Record<string, unknown>).causeDetail)
              : "";
          throw new Error(cause ? `${message} — ${cause}` : message);
        }
      },
    };
  } catch {
    // AI layer unavailable: the document is still stored and its text extracted.
    factExtractor = undefined;
  }

  // 4. Register the evidence container, then process the document.
  try {
    const { evidence } = await services.evidenceService.addEvidence(caseId, {
      type: "DOCUMENT",
      source: "USER",
      content: { kind: "text", text: `Documento aportado por el usuario: ${filename}` },
      label: filename,
    });

    const processing = new DocumentProcessingService(
      services.repo,
      await createStorage(),
      new LocalTextExtractorAdapter(),
      new UploadValidatorAdapter(),
    );

    const result = await processing.uploadAndProcess({
      caseId,
      evidenceId: evidence.id,
      buffer,
      mimeType,
      filename,
      requiredFactKeys,
      factExtractor,
    });

    const extractedText = result.processingRun.result?.text?.fullText ?? "";

    return NextResponse.json({
      evidenceId: evidence.id,
      processingRunId: result.processingRun.id,
      status: result.processingRun.status,
      extractorType: result.processingRun.extractorType,
      extractedCharacters: extractedText.length,
      usedOcr: result.processingRun.result?.text?.usedOcr ?? false,
      extractionError: result.processingRun.result?.error ?? null,
      // Why no data was read out of the document, when reading it failed. A
      // document the system could not read must never look like an empty one.
      factExtractionError: result.factExtractionError,
      // Candidates are NOT facts: the user confirms them (only then do they
      // reach the rule engine).
      candidates: result.factCandidates.map((candidate) => ({
        candidateId: candidate.id,
        factKey: candidate.factKey,
        proposedValue: candidate.proposedValue,
      })),
    });
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    console.error(
      "[evidence] upload failed:",
      JSON.stringify({
        caseId,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    const rejected = /Upload rejected|not supported|Empty file/i.test(message);
    return NextResponse.json(
      {
        error: {
          code: rejected ? "UPLOAD_REJECTED" : "PROCESSING_FAILED",
          message: rejected
            ? "El documento no es válido o su formato no está soportado."
            : "No se pudo procesar el documento.",
        },
      },
      { status: rejected ? 422 : 500 },
    );
  }
}
