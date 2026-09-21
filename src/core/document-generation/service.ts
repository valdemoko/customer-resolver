/**
 * Document Generation Service (Fase 12).
 *
 * Orchestrates the full document generation pipeline:
 *   1. Build structured input from case data
 *   2. Call AI to draft the document
 *   3. Validate the draft deterministically
 *   4. If validation passes → return validated document
 *   5. If validation fails → return errors, no document
 *
 * The AI can draft. The AI CANNOT decide what rights the user has.
 * The AI CANNOT invent facts, sources, or legal articles.
 */
import type { Fact } from "../types";
import type { Result } from "../result/types";
import type { ActionPlan } from "../actions/types";
import type { AIRequestId } from "../ai/types";
import type { AIRouter } from "../ai/router";
import {
  type DocumentGenerationInput,
  type DocumentSection,
  type GeneratedDocument,
  type FactualStatement,
  type LegalStatement,
  type DocumentCitation,
  type UnresolvedItem,
} from "./types";
import { generatedDraftSchema, type ValidatedDraft } from "./schemas";
import { buildDocumentInput } from "./input-builder";
import { validateDraft, type ValidationResult } from "./validator";

// ── Constants ───────────────────────────────────────────────────────

export const DOCUMENT_GENERATION_PROMPT_ID = "document-generation";
export const DOCUMENT_GENERATION_SCHEMA_VERSION = "document-generation@1";

// ── Generation Result ───────────────────────────────────────────────

export interface GenerationResult {
  readonly success: boolean;
  readonly document?: GeneratedDocument;
  readonly validation: ValidationResult;
  readonly aiRequestId?: AIRequestId;
  readonly errors?: readonly string[];
}

// ── Draft to Document Conversion ────────────────────────────────────

function convertDraftToDocument(
  draft: ValidatedDraft,
  input: DocumentGenerationInput,
  aiRequestId: AIRequestId,
  analysisSnapshotId?: string,
): GeneratedDocument {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // Convert sections
  const sections: DocumentSection[] = draft.sections.map((s, index) => ({
    id: `section-${index}`,
    type: s.type,
    title: s.title,
    content: s.content,
    factKeys: input.confirmedFacts
      .filter((f) => s.content.includes(f.factKey) || s.content.includes(f.text))
      .map((f) => f.factKey),
    claimIds: input.supportedClaims
      .filter((c) => s.content.includes(c.text))
      .map((c) => c.claimId),
    sourceIds: input.applicableSources
      .filter((src) => s.content.includes(src.sourceTitle))
      .map((src) => src.sourceId),
    origin: "SYSTEM_GENERATED" as const,
  }));

  // Convert factual statements
  const factualStatements: FactualStatement[] = draft.factualStatements.map((s) => {
    const confirmed = input.confirmedFacts.find((f) => f.factKey === s.factKey);
    return {
      factKey: s.factKey as FactualStatement["factKey"],
      factId: confirmed?.factId ?? "",
      text: s.text,
      confidence: confirmed?.confidence ?? "CONFIRMED",
      qualification: confirmed?.qualification,
    };
  });

  // Convert legal statements
  const legalStatements: LegalStatement[] = draft.legalStatements.map((s) => {
    const supported = input.supportedClaims.find((c) => c.claimId === s.claimId);
    return {
      claimId: s.claimId,
      ruleKey: supported?.ruleKey ?? "",
      text: s.text,
      citationIds: supported?.citationIds ?? [],
    };
  });

  // Build citations
  const citations: DocumentCitation[] = input.applicableSources.map((s) => ({
    id: s.id,
    assertionRef: s.assertionRef,
    sourceId: s.sourceId,
    sourceTitle: s.sourceTitle,
    articleRef: s.articleRef,
    sourceUrl: s.sourceUrl,
  }));

  // Build unresolved items
  const unresolvedItems: UnresolvedItem[] = draft.unresolvedItems.map((u) => ({
    type: u.type as UnresolvedItem["type"],
    description: u.description,
  }));

  // Add any input unresolved items not already in the draft
  for (const item of input.unresolvedItems) {
    const alreadyPresent = unresolvedItems.some(
      (u) => u.type === item.type && u.description === item.description,
    );
    if (!alreadyPresent) {
      unresolvedItems.push(item);
    }
  }

  return {
    id,
    caseId: "", // Will be set by the caller
    type: input.documentType,
    status: "DRAFT",
    version: 1,
    format: "txt",
    title: draft.title,
    recipient: input.recipient.name,
    subject: draft.subject,
    sections,
    factualStatements,
    legalStatements,
    citations,
    unresolvedItems,
    analysisSnapshotId,
    aiRequestId,
    promptId: DOCUMENT_GENERATION_PROMPT_ID,
    promptVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Main Service ────────────────────────────────────────────────────

export interface DocumentGenerationServiceParams {
  readonly router: AIRouter;
}

export class DocumentGenerationService {
  constructor(private readonly params: DocumentGenerationServiceParams) {}

  /**
   * Generate a document from case data.
   *
   * Pipeline:
   *   1. Build input (only confirmed/supported data)
   *   2. Sanitize and call AI
   *   3. Validate draft deterministically
   *   4. Return result (document or errors)
   */
  async generate(params: {
    readonly caseId: string;
    readonly result: Result;
    readonly actionPlan: ActionPlan;
    readonly facts: readonly Fact[];
    readonly sender: {
      readonly name?: string;
      readonly address?: string;
      readonly email?: string;
      readonly phone?: string;
    };
    readonly recipient: {
      readonly name: string;
      readonly address?: string;
      readonly email?: string;
    };
    readonly requestedAction: string;
    readonly analysisSnapshotId?: string;
    readonly now?: () => string;
  }): Promise<GenerationResult> {
    const { caseId, result, facts, sender, recipient, requestedAction, analysisSnapshotId } = params;
    const now = params.now ?? (() => new Date().toISOString());

    // 1. Build structured input (only confirmed/supported data)
    const input = buildDocumentInput({
      caseId,
      result,
      actionPlan: params.actionPlan,
      facts,
      sender,
      recipient,
      requestedAction,
    });

    // Check if there are enough data to generate
    if (input.confirmedFacts.length === 0 && input.supportedClaims.length === 0) {
      return {
        success: false,
        validation: {
          valid: false,
          errors: [
            {
              code: "INSUFFICIENT_DATA",
              message:
                "No hay hechos confirmados ni reclamaciones soportadas para generar un documento",
              severity: "BLOCKING",
            },
          ],
          warnings: [],
        },
        errors: [
          "No hay suficientes datos confirmados para generar un documento formal",
        ],
      };
    }

    // 2. Build the prompt for AI
    const promptText = this.buildPrompt(input);

    // 3. Call AI with structured output
    let aiResult;
    try {
      aiResult = await this.params.router.run({
        task: "DRAFTING",
        caseId,
        maxOutputTokens: 4096,
        temperature: 0.1, // Low temperature for formal drafting
        userMessage: promptText,
        inputContentParts: [promptText],
        promptId: DOCUMENT_GENERATION_PROMPT_ID,
        outputSchema: generatedDraftSchema,
        now,
      });
    } catch (error) {
      return {
        success: false,
        validation: {
          valid: false,
          errors: [
            {
              code: "AI_GENERATION_FAILED",
              message: `AI generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
              severity: "BLOCKING",
            },
          ],
          warnings: [],
        },
        errors: ["La generación del documento falló. Intente de nuevo."],
      };
    }

    const draft = aiResult.data as ValidatedDraft;

    // 4. Validate the draft deterministically
    const validation = validateDraft(draft, input);

    if (!validation.valid) {
      return {
        success: false,
        validation,
        aiRequestId: aiResult.record.aiRequestId,
        errors: validation.errors.map((e) => e.message),
      };
    }

    // 5. Convert to document
    const document = convertDraftToDocument(
      draft,
      input,
      aiResult.record.aiRequestId,
      analysisSnapshotId,
    );

    return {
      success: true,
      document,
      validation,
      aiRequestId: aiResult.record.aiRequestId,
    };
  }

  /**
   * Build the AI prompt for document generation.
   * The prompt explicitly constrains what the AI can and cannot do.
   */
  private buildPrompt(input: DocumentGenerationInput): string {
    const factsText = input.confirmedFacts
      .map((f) => `- ${f.factKey}: ${f.text}`)
      .join("\n");

    const claimsText = input.supportedClaims
      .map((c) => `- [${c.claimId}] ${c.text}`)
      .join("\n");

    const sourcesText = input.applicableSources
      .map(
        (s) =>
          `- ${s.sourceTitle}${s.articleRef ? ` (${s.articleRef})` : ""}: ${s.sourceUrl}`,
      )
      .join("\n");

    const timelineText = input.timeline
      .map((t) => `- ${t.date}: ${t.description}`)
      .join("\n");

  const senderInfo = [
      input.sender.name && `Nombre: ${input.sender.name}`,
      input.sender.address && `Dirección: ${input.sender.address}`,
      input.sender.email && `Email: ${input.sender.email}`,
      input.sender.phone && `Teléfono: ${input.sender.phone}`,
    ]
      .filter(Boolean)
      .join("\n");

    return `Genera un documento formal de tipo ${input.documentType} en español.

CONTEXTO:
- Jurisdicción: ${input.jurisdiction}
- Problema: ${input.caseMetadata.problemTitle}
- Fecha del caso: ${input.caseMetadata.createdAt}

REMITENTE:
${senderInfo || "[No proporcionado]"}

DESTINATARIO:
${input.recipient.name}${input.recipient.address ? `\n${input.recipient.address}` : ""}

HECHOS CONFIRMADOS (solo usar estos):
${factsText || "[Ninguno confirmado]"}

RECLAMACIONES SOPORTADAS (solo usar estas):
${claimsText || "[Ninguna soportada]"}

FUENTES VERIFICADAS:
${sourcesText || "[Ninguna]"}

CRONOLOGÍA:
${timelineText || "[No disponible]"}

INFORMACIÓN PENDIENTE:
${input.unresolvedItems.map((u) => `- [${u.type}] ${u.description}`).join("\n") || "[Ninguna]"}

SOLICITUD ESPECÍFICA:
${input.requestedAction}

REGLAS ESTRICTAS:
1. USA SOLO los hechos confirmados arriba. NO inventes hechos.
2. USA SOLO las reclamaciones soportadas arriba. NO inventes derechos.
3. USA SOLO las fuentes verificadas arriba. NO inventes artículos ni leyes.
4. NO inventes cantidades, fechas o plazos que no estén en los datos.
5. Si hay información contradictoria, menciónala. NO la ocultes.
6. El tono debe ser: formal, claro, firme, no agresivo.
7. El documento debe ser directamente utilizable para presentar una reclamación.
8. Para cada afirmación factual, vincúlala al factKey correspondiente.
9. Para cada afirmación legal, vincúlala al claimId correspondiente.
10. NO incluyas "último aviso" salvo que esté explícitamente solicitado.

FORMATO DE SALIDA: JSON estricto según el schema proporcionado.`;
  }
}
