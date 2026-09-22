/**
 * Zod schemas for AI interpretation output validation (Fase 8.3, spec §11).
 *
 * Strict validation — all AI output is validated before entering the domain.
 * Unknown fields rejected. Invalid enums rejected. Fact keys validated at runtime.
 *
 * Never: JSON.parse + cast as Type without validation.
 * Never: trust TypeScript types as runtime validation.
 */
import { z } from "zod";

// ── Classification confidence ────────────────────────────────────────

export const classificationConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

// ── Fact certainty ───────────────────────────────────────────────────

export const factCertaintySchema = z.enum(["EXPLICIT", "INFERRED", "AMBIGUOUS"]);

// ── Entity type ──────────────────────────────────────────────────────

export const entityTypeSchema = z.enum([
  "COMPANY",
  "PRODUCT",
  "PERSON",
  "LOCATION",
  "DATE_EXPRESSION",
  "MONETARY_AMOUNT",
]);

// ── Module candidate schema ──────────────────────────────────────────

/**
 * A list the model may omit OR set to `null` — both mean "empty".
 *
 * Smaller models write `"signals": null` for anything not applicable, while the
 * schema expresses "empty" as an omitted field. Zod rejects `null` for an
 * optional field, so a valid interpretation used to be discarded as an invalid
 * structured output (503). Normalising here keeps the meaning and never accepts
 * an invalid element.
 */
function nullishList<T extends z.ZodTypeAny>(element: T, max: number) {
  return z
    .array(element)
    .max(max)
    .nullish()
    .transform((value) => value ?? []);
}

export const moduleCandidateSchema = z.object({
  problemKey: z.string().min(1),
  signals: nullishList(z.string(), 10),
  matchedRequiredFacts: nullishList(z.string(), 50),
  missingRequiredFacts: nullishList(z.string(), 50),
  confidence: classificationConfidenceSchema,
});

// ── Fact value schema (matches core/types.ts FactValue) ─────────────
// Prevents AI from injecting arbitrary types.

export const factValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("string"), value: z.string() }),
  z.object({ type: z.literal("number"), value: z.number() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("date"), value: z.string() }),
  z.object({ type: z.literal("datetime"), value: z.string() }),
  z.object({
    type: z.literal("money"),
    value: z.object({
      amountMinor: z.number().int(),
      currency: z.string(),
    }),
  }),
  z.object({ type: z.literal("enum"), value: z.string(), options: z.array(z.string()) }),
  z.object({ type: z.literal("object"), value: z.record(z.string(), z.unknown()) }),
]);

// ── Fact candidate schema ────────────────────────────────────────────

export const intakeFactCandidateSchema = z.object({
  candidateId: z.string().min(1),
  factKey: z.string().min(1),
  proposedValue: factValueSchema,
  // sourceText is required: every fact must be traceable to a verbatim quote.
  sourceText: z.string().min(1).max(2000),
  aiInterpretation: z.string().max(1000).default(""),
  certainty: factCertaintySchema,
  // Empty when the fact does not belong to any candidate module (out-of-scope
  // problem). Accepts an explicit null as well: models use null for "none".
  problemKey: z.string().nullish(),
});

// ── Detected entity schema ───────────────────────────────────────────

export const detectedEntitySchema = z.object({
  type: entityTypeSchema,
  rawText: z.string().min(1).max(500),
  normalizedValue: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
  confidence: factCertaintySchema,
});

export const emptyStringArray = nullishList(z.string(), 50);

// ── Missing info hint schema ─────────────────────────────────────────

export const missingInfoHintSchema = z.object({
  factKey: z.string().min(1),
  questionHint: z.string().min(1).max(500),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  requiredByRules: emptyStringArray,
});

// ── Ambiguity schema ─────────────────────────────────────────────────

export const ambiguitySchema = z.object({
  description: z.string().min(1).max(500),
  affectedFacts: emptyStringArray,
  resolutionHint: z.string().min(1).max(500),
});

// ── Apparent contradiction schema ────────────────────────────────────

export const apparentContradictionSchema = z.object({
  factKeyA: z.string().min(1),
  valueA: z.string().min(1).max(500),
  sourceA: z.string().min(1).max(500),
  factKeyB: z.string().min(1),
  valueB: z.string().min(1).max(500),
  sourceB: z.string().min(1).max(500),
  description: z.string().min(1).max(500),
});

// ── Jurisdiction hint schema ─────────────────────────────────────────

export const jurisdictionHintSchema = z.object({
  jurisdiction: z.string().min(2).max(10),
  confidence: classificationConfidenceSchema,
  signals: z.array(z.string()).max(5).default([]),
});

// ── Full interpretation schema ───────────────────────────────────────
//
// This is the strict output schema for the AI.
// All fields are required — the AI must produce a complete response.
// Unknown fields are rejected by Zod strict mode.

export const intakeInterpretationSchema = z
  .object({
    summary: z
      .string()
      .max(1000)
      .nullish()
      .transform((v) => v ?? ""),
    // Empty is valid: it means the problem matches none of the registered modules,
    // which the deterministic routing layer turns into UNSUPPORTED (never a 503).
    candidateModules: nullishList(moduleCandidateSchema, 5),
    factCandidates: nullishList(intakeFactCandidateSchema, 20),
    missingInformation: nullishList(missingInfoHintSchema, 10),
    ambiguities: nullishList(ambiguitySchema, 10),
    contradictions: nullishList(apparentContradictionSchema, 5),
    entities: nullishList(detectedEntitySchema, 20),
    jurisdictionHints: nullishList(jurisdictionHintSchema, 3),
    classificationConfidence: classificationConfidenceSchema,
  })
  .strict();

export type IntakeInterpretationOutput = z.infer<typeof intakeInterpretationSchema>;

// ── General guidance schema (problems with no registered module) ─────
//
// When a problem matches no registered module, Resolveo cannot run its rule
// engine, so there is no verified result to show. Instead of a dead end the
// AI produces GENERAL orientation: what the situation is, what the person can
// do next, who to contact and what to gather.
//
// It is explicitly NOT a personalized legal analysis: no legal articles, no
// deadlines, no amounts, no verdicts, no invented facts or organisations.
// The escalation channels are a closed list fixed by the prompt.

export const guidanceStepSchema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(1200),
});

export const guidanceChannelSchema = z.object({
  target: z.string().min(1).max(200),
  channel: z
    .string()
    .max(400)
    .nullish()
    .transform((v) => v ?? ""),
  why: z.string().min(1).max(600),
});

export const generalGuidanceSchema = z
  .object({
    // Required and non-empty: an orientation with no restated situation is
    // useless, and the caller degrades gracefully when the answer is rejected.
    understanding: z.string().min(1).max(1200),
    // Omitted OR null lists mean "empty" — the model uses both interchangeably,
    // and rejecting the whole answer over that would be a false negative.
    generalSteps: nullishList(guidanceStepSchema, 8),
    whereToComplain: nullishList(guidanceChannelSchema, 5),
    documentsToGather: nullishList(z.string().min(1).max(400), 12),
    whatWeCannotDo: nullishList(z.string().min(1).max(400), 8),
  })
  .strict();

export type GeneralGuidanceOutput = z.infer<typeof generalGuidanceSchema>;

// ── Schema version ───────────────────────────────────────────────────

export const INTAKE_SCHEMA_VERSION = "intake-interpretation@1";

/** Version identifier of the general-guidance output contract. */
export const GENERAL_GUIDANCE_SCHEMA_VERSION = "general-guidance@1";
