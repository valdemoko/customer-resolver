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

export const moduleCandidateSchema = z.object({
  problemKey: z.string().min(1),
  // Array fields default to empty: smaller models frequently omit them, and an
  // omitted list carries the same meaning as an empty one. Rejecting the whole
  // response for that reason would turn a valid interpretation into a 503.
  signals: z.array(z.string()).max(10).default([]),
  matchedRequiredFacts: z.array(z.string()).default([]),
  missingRequiredFacts: z.array(z.string()).default([]),
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
  // Empty when the fact does not belong to any candidate module (out-of-scope problem).
  problemKey: z.string().optional(),
});

// ── Detected entity schema ───────────────────────────────────────────

export const detectedEntitySchema = z.object({
  type: entityTypeSchema,
  rawText: z.string().min(1).max(500),
  normalizedValue: z.string().optional(),
  confidence: factCertaintySchema,
});

export const emptyStringArray = z.array(z.string()).default([]);

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
    summary: z.string().max(1000).default(""),
    // Empty is valid: it means the problem matches none of the registered modules,
    // which the deterministic routing layer turns into UNSUPPORTED (never a 503).
    candidateModules: z.array(moduleCandidateSchema).max(5).default([]),
    factCandidates: z.array(intakeFactCandidateSchema).max(20).default([]),
    missingInformation: z.array(missingInfoHintSchema).max(10).default([]),
    ambiguities: z.array(ambiguitySchema).max(10).default([]),
    contradictions: z.array(apparentContradictionSchema).max(5).default([]),
    entities: z.array(detectedEntitySchema).max(20).default([]),
    jurisdictionHints: z.array(jurisdictionHintSchema).max(3).default([]),
    classificationConfidence: classificationConfidenceSchema,
  })
  .strict();

export type IntakeInterpretationOutput = z.infer<typeof intakeInterpretationSchema>;

// ── Schema version ───────────────────────────────────────────────────

export const INTAKE_SCHEMA_VERSION = "intake-interpretation@1";
