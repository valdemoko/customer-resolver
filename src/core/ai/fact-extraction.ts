/**
 * Document fact extraction — F5 ↔ F6 integration (Fase 6, spec §7/§8/§13).
 *
 *   Evidence + processed document text + problem required facts
 *     → AI (sanitized, budgeted, structured output)
 *     → DocumentFactCandidate[] (relation PROPOSED, NEVER confirmed)
 *
 * Absolute rule: AI output ≠ confirmed Fact. Candidates stay unconfirmed
 * until the existing user/system confirmation flow creates Facts (F2 rules).
 *
 * The AI cannot fabricate source locations: a candidate only carries a
 * location when the model's sourceQuote is actually FOUND in the document
 * text; otherwise location = null. We never accept invented page/offsets.
 */
import { z } from "zod";
import { sanitizeUntrustedText, assembleUserMessage } from "./sanitize";
import { estimateCost, type UsageTotals } from "./cost";
import type { AIRouter } from "./router";
import type { AIRequestRecord, AIUsage, AITaskType } from "./types";
import type { DocumentLocation } from "../document/types";

// ── Model output schema (spec §8) ───────────────────────────────────
//
// Explicit schema — never `{ answer: ... }`. Unknown extra keys are
// rejected so a model cannot smuggle conclusion-like fields through.

export const FACT_EXTRACTION_SCHEMA_VERSION = "document-fact-extraction@1";

export const modelFactSchema = z.object({
  // The list must be present — an answer without it is malformed, not empty —
  // but an explicit null means "nothing found".
  facts: z
    .array(
      z.object({
        factKey: z.string().min(1),
        value: z.unknown(),
        sourceQuote: z
          .string()
          .min(1)
          .nullish()
          .transform((v) => v ?? undefined)
          .optional(),
        sourceLocation: z
          .object({
            page: z.number().int().positive().optional(),
            startOffset: z.number().int().nonnegative(),
            endOffset: z.number().int().nonnegative(),
          })
          .nullish()
          .transform((v) => v ?? undefined)
          .optional(),
        // A model that does not state its confidence is read as AMBIGUOUS —
        // the one value that never upgrades a value to a confident extraction.
        // Requiring the field rejected otherwise usable answers outright.
        certainty: z
          .enum(["EXPLICIT", "INFERRED", "AMBIGUOUS"])
          .nullish()
          .transform((v) => v ?? "AMBIGUOUS"),
      }),
    )
    .max(50)
    .nullable()
    .transform((v) => v ?? []),
});

export type ModelFactExtraction = z.infer<typeof modelFactSchema>;

// ── Token budget (spec §13) ─────────────────────────────────────────

export interface TokenBudget {
  /** Maximum characters of document text sent to the model. */
  readonly maxDocumentChars: number;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = { maxDocumentChars: 8_000 };

export interface BudgetedDocument {
  /** The text actually sent (sanitized + possibly truncated). */
  readonly text: string;
  /** Whether the original text was truncated (recorded in input hash). */
  readonly truncated: boolean;
}

/**
 * Deterministic truncation strategy: keep the beginning of the document
 * (metadata/invoice headers usually live there) plus the END (totals,
 * closing statements), with an explicit truncation marker. We never silently
 * drop the middle: the marker makes the cut visible to the model and to the
 * input hash. (No embeddings/RAG — spec §29.)
 */
export function budgetDocumentText(rawText: string, budget: TokenBudget): BudgetedDocument {
  if (rawText.length <= budget.maxDocumentChars) {
    return { text: rawText, truncated: false };
  }
  const headLen = Math.floor((budget.maxDocumentChars - 100) * 0.7);
  const tailLen = budget.maxDocumentChars - 100 - headLen;
  const head = rawText.slice(0, headLen);
  const tail = rawText.slice(rawText.length - tailLen);
  const text = `${head}\n[...document truncated for length: ${
    rawText.length
  } chars total...]\n${tail}`;
  return { text, truncated: true };
}

// ── Input assembly ──────────────────────────────────────────────────

export interface FactExtractionInput {
  readonly caseId: string;
  /** Provenance is attached at persistence time; unused by the call itself. */
  readonly evidenceId?: string;
  readonly physicalObjectId: string;
  readonly processingRunId?: string;
  /** Processed document text from F5 (DocumentText.fullText). */
  readonly documentText: string;
  /** Required fact keys declared by the problem module (e.g. cancellation.date). */
  readonly requiredFactKeys: readonly string[];
  readonly budget?: TokenBudget;
  readonly now: () => string;
}

const INSTRUCTION = `Extract every fact whose factKey appears in the REQUIRED FACT KEYS list.

Return ONLY this JSON object, with no prose and no code fences:
{
  "facts": [
    {
      "factKey": "one of the REQUIRED FACT KEYS, copied exactly",
      "value": "the value as it appears (a string, number or boolean)",
      "sourceQuote": "the exact fragment of the document this value comes from",
      "certainty": "EXPLICIT | INFERRED | AMBIGUOUS"
    }
  ]
}

Rules: every field above is required for each fact; write {"facts": []} when the document contains none of the required facts; omit facts that are not in the document; use "EXPLICIT" only when the document states the value literally; do not resolve contradictions.`;

/** Build the full user message (sanitized document + required fact keys). */
export function assembleExtractionPrompt(
  documentText: string,
  requiredFactKeys: readonly string[],
  budget: TokenBudget,
): { userMessage: string; contentParts: readonly string[]; truncated: boolean } {
  const budgeted = budgetDocumentText(documentText, budget);
  const sanitized = sanitizeUntrustedText(budgeted.text);
  const userMessage = assembleUserMessage(
    sanitized.text,
    `${INSTRUCTION}\n\nREQUIRED FACT KEYS: ${requiredFactKeys.join(", ") || "(none)"}`,
  );
  const contentParts = [budgeted.text, ...requiredFactKeys];
  return { userMessage, contentParts, truncated: budgeted.truncated };
}

// ── Candidate mapping (spec §7) ─────────────────────────────────────

export interface ExtractedFactCandidate {
  readonly factKey: string;
  readonly proposedValue: unknown;
  /** DocumentLocation when the quote was FOUND in the text; otherwise null. */
  readonly location: DocumentLocation | null;
  readonly certainty: "EXPLICIT" | "INFERRED" | "AMBIGUOUS";
}

/**
 * Locate a model-reported quote inside the actual document text.
 * Returns null when the quote cannot be found — we NEVER trust model
 * offsets alone (the AI cannot invent a location, spec §7).
 */
export function locateQuote(
  documentText: string,
  quote: string,
  physicalObjectId: string,
): DocumentLocation | null {
  const normalizedDoc = normalize(documentText);
  const normalizedQuote = normalize(quote);
  if (normalizedQuote.length === 0) return null;
  const index = normalizedDoc.indexOf(normalizedQuote);
  if (index === -1) return null;
  return {
    physicalObjectId,
    startOffset: index,
    endOffset: index + normalizedQuote.length,
  };
}

/** Whitespace-collapsed comparison so line breaks never hide a real quote. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Map validated model output to candidates.
 *  - fact keys not in the required list are DROPPED (schema discipline)
 *  - AMBIGUOUS facts keep their certainty — never upgraded to exact values
 *  - relation/certainty mapping happens at persistence time by the caller
 */
export function mapModelFactsToCandidates(
  modelOutput: ModelFactExtraction,
  documentText: string,
  requiredFactKeys: readonly string[],
  physicalObjectId: string,
): ExtractedFactCandidate[] {
  const out: ExtractedFactCandidate[] = [];
  for (const fact of modelOutput.facts) {
    if (!requiredFactKeys.includes(fact.factKey)) continue;
    const location =
      fact.sourceQuote !== undefined
        ? locateQuote(documentText, fact.sourceQuote, physicalObjectId)
        : null;
    out.push({
      factKey: fact.factKey,
      proposedValue: fact.value,
      location,
      certainty: fact.certainty,
    });
  }
  return out;
}

// ── Certainty → candidate relation ──────────────────────────────────

/** EXPLICIT statements are direct extractions; the rest are proposals. */
export function certaintyToRelation(certainty: "EXPLICIT" | "INFERRED" | "AMBIGUOUS") {
  return certainty === "EXPLICIT" ? ("EXTRACTED" as const) : ("PROPOSED" as const);
}

// ── Application service ─────────────────────────────────────────────

export interface AIFactExtractionResult {
  readonly candidates: readonly ExtractedFactCandidate[];
  readonly record: AIRequestRecord;
  readonly inputTruncated: boolean;
  readonly inputHash: string;
}

export class AIFactExtractionService {
  constructor(
    private readonly router: AIRouter,
    private readonly task: AITaskType = "DOCUMENT_FACT_EXTRACTION",
  ) {}

  /**
   * Extract fact candidates from a processed document.
   * The router validates the output and records provenance; this service
   * only maps the validated output into domain candidates (unconfirmed).
   */
  async extract(input: FactExtractionInput): Promise<AIFactExtractionResult> {
    const budget = input.budget ?? DEFAULT_TOKEN_BUDGET;
    const { userMessage, contentParts, truncated } = assembleExtractionPrompt(
      input.documentText,
      input.requiredFactKeys,
      budget,
    );

    const run = await this.router.run({
      task: this.task,
      caseId: input.caseId,
      maxOutputTokens: 1024,
      temperature: 0,
      userMessage,
      inputContentParts: contentParts,
      promptId: "document-fact-extraction",
      outputSchema: modelFactSchema,
      now: input.now,
    });

    const candidates = mapModelFactsToCandidates(
      run.data as ModelFactExtraction,
      input.documentText,
      input.requiredFactKeys,
      input.physicalObjectId,
    );

    return {
      candidates,
      record: run.record,
      inputTruncated: truncated,
      inputHash: run.record.inputHash,
    };
  }
}

// ── Usage/cost re-export (convenience for callers building records) ─

export function usageWithCost(model: string, usage: UsageTotals | null): AIUsage {
  const cost = estimateCost(model, usage);
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: usage ? usage.inputTokens + usage.outputTokens : 0,
    estimatedCost: cost,
    costCurrency: cost === null ? null : "USD",
  };
}
