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
  signals: z.array(z.string()).min(1).max(10),
  matchedRequiredFacts: z.array(z.string()),
  missingRequiredFacts: z.array(z.string()),
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
  sourceText: z.string().min(1).max(2000),
  aiInterpretation: z.string().min(1).max(1000),
  certainty: factCertaintySchema,
  problemKey: z.string().min(1),
});

// ── Detected entity schema ───────────────────────────────────────────

export const detectedEntitySchema = z.object({
  type: entityTypeSchema,
  rawText: z.string().min(1).max(500),
  normalizedValue: z.string().optional(),
  confidence: factCertaintySchema,
});

// ── Missing info hint schema ─────────────────────────────────────────

export const missingInfoHintSchema = z.object({
  factKey: z.string().min(1),
  questionHint: z.string().min(1).max(500),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  requiredByRules: z.array(z.string()),
});

// ── Ambiguity schema ─────────────────────────────────────────────────

export const ambiguitySchema = z.object({
  description: z.string().min(1).max(500),
  affectedFacts: z.array(z.string()),
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
  signals: z.array(z.string()).min(1).max(5),
});

// ── Full interpretation schema ───────────────────────────────────────
//
// This is the strict output schema for the AI.
// All fields are required — the AI must produce a complete response.
// Unknown fields are rejected by Zod strict mode.

export const intakeInterpretationSchema = z
  .object({
    summary: z.string().min(1).max(1000),
    candidateModules: z.array(moduleCandidateSchema).min(1).max(5),
    factCandidates: z.array(intakeFactCandidateSchema).max(20),
    missingInformation: z.array(missingInfoHintSchema).max(10),
    ambiguities: z.array(ambiguitySchema).max(10),
    contradictions: z.array(apparentContradictionSchema).max(5),
    entities: z.array(detectedEntitySchema).max(20),
    jurisdictionHints: z.array(jurisdictionHintSchema).max(3),
    classificationConfidence: classificationConfidenceSchema,
  })
  .strict();

export type IntakeInterpretationOutput = z.infer<typeof intakeInterpretationSchema>;

// ── Schema version ───────────────────────────────────────────────────

export const INTAKE_SCHEMA_VERSION = "intake-interpretation@1";
