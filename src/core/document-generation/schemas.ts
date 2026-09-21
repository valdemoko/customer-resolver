/**
 * Document Generation schemas (Fase 12).
 *
 * Zod schemas for:
 *   1. Validating the AI-generated draft (never trust raw LLM output)
 *   2. Validating document generation input (boundary defense)
 *
 * The AI output schema is the contract between the prompt and the
 * deterministic validation layer. Every field is validated.
 */
import { z } from "zod";

// ── AI Output Schema (GeneratedDraft) ───────────────────────────────

/**
 * Strict schema for AI-generated document drafts.
 * The AI MUST conform to this schema exactly.
 * Unexpected fields are stripped, missing fields cause rejection.
 */
export const generatedDraftSchema = z
  .object({
    title: z.string().min(1).max(200),
    subject: z.string().min(1).max(500),
    sections: z
      .array(
        z.object({
          type: z.enum([
            "HEADER",
            "INTRODUCTION",
            "FACTS",
            "EVIDENCE",
            "LEGAL_BASIS",
            "REQUEST",
            "DEADLINE",
            "ATTACHMENTS",
            "REFERENCES",
            "SIGNATURE",
            "CUSTOM",
          ]),
          title: z.string().min(1).max(200),
          content: z.string().min(1).max(10000),
        }),
      )
      .min(1)
      .max(20),
    factualStatements: z
      .array(
        z.object({
          factKey: z.string().min(1),
          text: z.string().min(1).max(2000),
        }),
      )
      .max(50),
    legalStatements: z
      .array(
        z.object({
          claimId: z.string().min(1),
          text: z.string().min(1).max(2000),
        }),
      )
      .max(20),
    requestedActions: z.array(z.string().max(500)).max(10),
    unresolvedItems: z
      .array(
        z.object({
          type: z.string().max(100),
          description: z.string().max(1000),
        }),
      )
      .max(20),
  })
  .strict();

export type ValidatedDraft = z.infer<typeof generatedDraftSchema>;

// ── Document Generation Input Schema ────────────────────────────────

/**
 * Validates the input we send to the AI.
 * Ensures all required fields are present and well-formed.
 * The input is built from confirmed data only — this schema
 * is a safety net, not the primary source of truth.
 */
export const documentGenerationInputSchema = z.object({
  documentType: z.enum([
    "CONSUMER_COMPLAINT",
    "REFUND_REQUEST",
    "WARRANTY_CLAIM",
    "FLIGHT_CANCELLATION_CLAIM",
    "GENERAL_FORMAL_REQUEST",
  ]),
  jurisdiction: z.string().min(1).max(10),
  language: z.string().min(2).max(5),
  sender: z.object({
    name: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(50).optional(),
  }),
  recipient: z.object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    email: z.string().email().max(200).optional(),
  }),
  confirmedFacts: z
    .array(
      z.object({
        factKey: z.string().min(1),
        factId: z.string().min(1),
        text: z.string().min(1).max(2000),
        confidence: z.enum(["CONFIRMED", "QUALIFIED"]),
        qualification: z.string().max(500).optional(),
      }),
    )
    .max(50),
  supportedClaims: z
    .array(
      z.object({
        claimId: z.string().min(1),
        ruleKey: z.string().min(1),
        text: z.string().min(1).max(2000),
        citationIds: z.array(z.string()).max(10),
      }),
    )
    .max(20),
  applicableSources: z
    .array(
      z.object({
        id: z.string().min(1),
        assertionRef: z.string().min(1),
        sourceId: z.string().min(1),
        sourceTitle: z.string().min(1),
        articleRef: z.string().max(200).optional(),
        sourceUrl: z.string().url(),
      }),
    )
    .max(20),
  timeline: z
    .array(
      z.object({
        date: z.string().min(1),
        description: z.string().min(1).max(500),
      }),
    )
    .max(30),
  requestedAction: z.string().min(1).max(1000),
  caseMetadata: z.object({
    problemKey: z.string().min(1),
    problemTitle: z.string().min(1),
    createdAt: z.string().min(1),
  }),
  analysisSnapshotId: z.string().optional(),
  unresolvedItems: z
    .array(
      z.object({
        type: z.enum(["CONTRADICTION", "MISSING_INFORMATION", "UNCONFIRMED_FACT"]),
        description: z.string().min(1).max(1000),
        factKey: z.string().optional(),
        claimId: z.string().optional(),
      }),
    )
    .max(20),
});
