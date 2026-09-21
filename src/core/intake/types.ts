/**
 * Universal Problem Intake types (Fase 8.3).
 *
 * Pure domain types — no I/O, no framework, no AI SDK.
 * These types define the contract between AI interpretation and
 * deterministic routing/question selection.
 *
 * Fundamental principle:
 *   AI → interpretation → IntakeFactCandidate (UNCONFIRMED)
 *      → user confirmation → Fact (CONFIRMED)
 *      → Rule Engine → validated result
 *
 * AI output is DATA, never legal truth.
 */
import type { FactKey, FactValue, JurisdictionCode } from "../types";
import type { AIRequestId } from "../ai/types";

// ── Classification confidence ────────────────────────────────────────
//
// AI's assessment of how well input matches a module or jurisdiction.
// NEVER maps to SUPPORTED/CONFIRMED or any legal status.

export type ClassificationConfidence = "HIGH" | "MEDIUM" | "LOW";

// ── Fact certainty ───────────────────────────────────────────────────
//
// AI's reading of the user's statement about a specific fact.
// NEVER equals CONFIRMED — even EXPLICIT must be user-confirmed.

export type FactCertainty = "EXPLICIT" | "INFERRED" | "AMBIGUOUS";

// ── Routing status ───────────────────────────────────────────────────

export type RoutingStatus =
  | "ROUTED"
  | "NEEDS_CLARIFICATION"
  | "NEEDS_INFORMATION"
  | "UNSUPPORTED"
  | "UNSUPPORTED_JURISDICTION"
  | "FAILED";

// ── Intake operation status ──────────────────────────────────────────

export type IntakeOperationStatus =
  | "SUCCESS"
  | "AI_FAILED"
  | "SCHEMA_INVALID"
  | "BUDGET_EXCEEDED"
  | "UNSUPPORTED"
  | "UNSUPPORTED_JURISDICTION"
  | "INTERNAL_ERROR";

// ── Module candidate ─────────────────────────────────────────────────

export interface ModuleCandidate {
  /** Problem key (must be valid module key). */
  readonly problemKey: string;
  /** Why the system thinks this module might apply. */
  readonly signals: readonly string[];
  /** Which required facts appear supported by the input. */
  readonly matchedRequiredFacts: readonly string[];
  /** Which required facts are absent. */
  readonly missingRequiredFacts: readonly string[];
  /** AI's classification confidence (one signal among many). */
  readonly confidence: ClassificationConfidence;
}

// ── Intake fact candidate ────────────────────────────────────────────
//
// Always UNCONFIRMED. Status is set by the system, never by AI.
// Even certainty = EXPLICIT does not mean CONFIRMED.

export interface IntakeFactCandidate {
  /** Candidate ID (stable within the interpretation). */
  readonly candidateId: string;
  /** Fact key — validated against module catalogue at runtime. */
  readonly factKey: FactKey;
  /** Proposed value from AI. */
  readonly proposedValue: FactValue;
  /** EXACT original user text fragment (verbatim quote). */
  readonly sourceText: string;
  /** What the AI believes the text means. */
  readonly aiInterpretation: string;
  /** AI's reading of the user's statement. */
  readonly certainty: FactCertainty;
  /** Which module this fact belongs to. */
  readonly problemKey: string;
  /** Always UNCONFIRMED — set by system. */
  readonly status: "UNCONFIRMED";
  /** AI request that produced this candidate. */
  readonly aiRequestId: AIRequestId;
}

// ── Detected entity ──────────────────────────────────────────────────

export type EntityType =
  "COMPANY" | "PRODUCT" | "PERSON" | "LOCATION" | "DATE_EXPRESSION" | "MONETARY_AMOUNT";

export interface DetectedEntity {
  readonly type: EntityType;
  /** Exact text from user input. */
  readonly rawText: string;
  /** AI interpretation (e.g. "MediaMarkt" from "la tienda de media markt"). */
  readonly normalizedValue?: string;
  readonly confidence: FactCertainty;
}

// ── Missing information hint ─────────────────────────────────────────

export interface MissingInfoHint {
  /** What fact is missing. */
  readonly factKey: string;
  /** Suggested question to ask. */
  readonly questionHint: string;
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
  /** Which rules need this fact. */
  readonly requiredByRules: readonly string[];
}

// ── Ambiguity ────────────────────────────────────────────────────────

export interface Ambiguity {
  readonly description: string;
  readonly affectedFacts: readonly string[];
  readonly resolutionHint: string;
}

// ── Apparent contradiction ───────────────────────────────────────────
//
// AI-detected contradictions are informational, not status-changing.
// The existing contradiction engine handles real contradictions.

export interface ApparentContradiction {
  readonly factKeyA: string;
  readonly valueA: string;
  readonly sourceA: string;
  readonly factKeyB: string;
  readonly valueB: string;
  readonly sourceB: string;
  readonly description: string;
}

// ── Jurisdiction hint ────────────────────────────────────────────────
//
// AI provides HINTS only. Jurisdiction Engine decides final applicability.

export interface JurisdictionHint {
  readonly jurisdiction: string;
  readonly confidence: ClassificationConfidence;
  readonly signals: readonly string[];
}

// ── Intake interpretation ────────────────────────────────────────────
//
// The AI's structured understanding of what the user described.
// This is the primary AI output for F8.3.

export interface IntakeInterpretation {
  /** Plain language summary (no legal conclusions). */
  readonly summary: string;
  /** Candidate modules ranked by relevance. */
  readonly candidateModules: readonly ModuleCandidate[];
  /** Unconfirmed fact candidates extracted from user input. */
  readonly factCandidates: readonly IntakeFactCandidate[];
  /** Information the system detected is missing. */
  readonly missingInformation: readonly MissingInfoHint[];
  /** Ambiguities detected in the user's description. */
  readonly ambiguities: readonly Ambiguity[];
  /** Apparent contradictions between statements. */
  readonly contradictions: readonly ApparentContradiction[];
  /** Entities detected (companies, products, dates, amounts). */
  readonly entities: readonly DetectedEntity[];
  /** Jurisdiction hints from the input. */
  readonly jurisdictionHints: readonly JurisdictionHint[];
  /** Overall classification confidence (across all candidates). */
  readonly classificationConfidence: ClassificationConfidence;
  /** Interpretation schema version. */
  readonly interpretationVersion: string;
  /** AI request ID for provenance. */
  readonly aiRequestId: AIRequestId;
}

// ── Routing rationale ────────────────────────────────────────────────

export interface RoutingRationale {
  /** Signals that triggered the routing decision. */
  readonly signals: readonly string[];
  /** Facts that matched the selected module. */
  readonly matchedFacts: readonly string[];
  /** Required facts that are still missing. */
  readonly missingFacts: readonly string[];
  /** Whether the jurisdiction is compatible with the module. */
  readonly jurisdictionCompatible: boolean;
  /** Whether there are blocking contradictions. */
  readonly noBlockingContradictions: boolean;
  /** Numeric routing score (for debugging). */
  readonly score: number;
  /** Threshold that was required. */
  readonly threshold: number;
}

// ── Routing decision ─────────────────────────────────────────────────

export interface RoutingDecision {
  readonly status: RoutingStatus;
  /** Selected module (only when status = ROUTED or NEEDS_INFORMATION). */
  readonly moduleCandidate?: ModuleCandidate;
  /** Structured rationale (for snapshots/debugging). */
  readonly rationale: RoutingRationale;
  /** User-facing explanation (simple, hedging language). */
  readonly userExplanation: string;
}

// ── Question selection ───────────────────────────────────────────────

export interface QuestionSelection {
  /** The fact key this question targets. */
  readonly factKey: FactKey;
  /** The question text (AI may help formulate wording). */
  readonly questionText: string;
  /** Why this question was selected. */
  readonly reason: string;
  /** Priority for display ordering. */
  readonly priority: "REQUIRED" | "HIGH" | "MEDIUM" | "LOW";
  /** Remaining questions after this one. */
  readonly remainingCount: number;
}

// ── Confirmation result ──────────────────────────────────────────────

export interface ConfirmationResult {
  readonly success: boolean;
  /** The confirmed fact key. */
  readonly factKey: FactKey;
  /** Contradiction detected (if the new fact conflicts with existing). */
  readonly contradictionDetected: boolean;
  /** Contradiction ID (if detected). */
  readonly contradictionId?: string;
}

// ── Intake session state ─────────────────────────────────────────────

export interface IntakeSession {
  readonly caseId: string;
  readonly problemKey?: string;
  readonly jurisdiction?: JurisdictionCode;
  readonly interpretationCount: number;
  readonly maxInterpretations: number;
  readonly factCandidates: readonly IntakeFactCandidate[];
  readonly confirmedFactKeys: readonly FactKey[];
  readonly routingDecision?: RoutingDecision;
  /** Budget exhausted flag. */
  readonly budgetExhausted: boolean;
}

// ── AI-safe module descriptor ────────────────────────────────────────
//
// What the AI sees about each module. NO internal implementation details.

export interface AISafeModuleDescriptor {
  readonly problemKey: string;
  readonly title: string;
  readonly description: string;
  readonly semanticSignals: readonly string[];
  readonly requiredFactCategories: readonly string[];
  readonly supportedJurisdictions: readonly string[];
}

// Error types are in ./errors.ts (extends AppError for typed error taxonomy)
