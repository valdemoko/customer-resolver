/**
 * Result Engine domain types (Fase 7).
 *
 * Pure types — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * The Result Engine converts raw rule evaluations into a structured,
 * human-readable result that the UI can render. It NEVER invents facts,
 * NEVER fabricates sources, and NEVER overstates certainty.
 *
 * Core principle:
 *   AI → interpretation → FactCandidate (UNCONFIRMED)
 *      → Evidence + provenance → Rule Engine → validated Result
 */
import type { FactKey, FactValue } from "../types";
import type { IsoDateTime } from "../shared/temporal";
import type { ConsumerChannel } from "./channels";
import type { CaseCompany } from "./company";

// ── Claim Status (vocabulary from ARCHITECTURE.md §18) ──────────────

/**
 * Each claim carries a status that precisely communicates what the
 * system can and cannot determine. These are NOT legal conclusions —
 * they are factual assessments with explicit confidence levels.
 */
export type ClaimStatus =
  | "SUPPORTED"
  | "POTENTIALLY_APPLICABLE"
  | "INSUFFICIENT_DATA"
  | "CONTRADICTED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

// ── Supporting Evidence ─────────────────────────────────────────────

export interface SupportingFact {
  readonly factKey: FactKey;
  readonly value: FactValue;
  readonly status: "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED";
  readonly confidence: "USER" | "PARSER" | "OCR" | "AI" | "DERIVED";
  readonly evidenceIds: readonly string[];
}

export interface SupportingSource {
  readonly sourceId: string;
  readonly title: string;
  readonly url: string;
  readonly type: string;
  readonly retrievedAt: string;
  /** Human-readable claim this source supports. */
  readonly claim: string;
}

// ── Claim ───────────────────────────────────────────────────────────

/**
 * A claim is a specific assertion derived from rule evaluations.
 * It traces back to: Claim → Rule Evaluation → Facts → Evidence → Source.
 *
 * Claims are NEVER fabricated. Each claim must be backed by at least
 * one rule evaluation.
 */
export interface Claim {
  readonly id: string;
  readonly ruleKey: string;
  readonly ruleVersion: number;
  readonly status: ClaimStatus;
  /** Human-readable assertion (e.g. "El cargo se produjo después de la cancelación"). */
  readonly assertion: string;
  /** Detailed explanation of why this status was reached. */
  readonly explanation: string;
  /** Facts that directly support or contradict this claim. */
  readonly supportingFacts: readonly SupportingFact[];
  /** Official sources that back this claim (when SUPPORTED). */
  readonly supportingSources: readonly SupportingSource[];
  /** Fact keys that are missing for this claim. */
  readonly missingFacts: readonly FactKey[];
  /** Fact keys that are contradicted for this claim. */
  readonly contradictedFacts: readonly FactKey[];
  /** Raw rule evaluation traces (for debugging/audit). */
  readonly ruleTraces: readonly unknown[];
} // ── Missing Information ─────────────────────────────────────────────
export interface MissingInformation {
  /** The fact the rules reported as missing (may be a derived fact). */
  readonly factKey: FactKey;
  readonly questionId?: string;
  /**
   * The fact the USER can actually answer, when an intake question exists for
   * it (directly, or as an input of a derived fact). This is what the report
   * must ask for — asking for `flight.compensation_tier` is unanswerable.
   */
  readonly answerFactKey?: FactKey;
  /** Plain-language question or explanation. Never a raw fact key. */
  readonly description: string;
  /**
   * `question` — the user was asked this and can answer it now.
   * `review` — the answer is on record but the derived value could not be
   * computed from it, so the report explains what to check instead of asking
   * the same question again as if nothing had been answered.
   */
  readonly kind: "question" | "review";
  /**
   * Answer type declared by the module for `answerFactKey` (`boolean`, `date`,
   * `money`…), so the report renders the right control instead of a free-text
   * box whose value the rule engine cannot compare.
   */
  readonly answerType?: string;
  /** Allowed values when the declared type is `enum`. */
  readonly answerOptions?: readonly string[];
  readonly impact: "required" | "recommended";
  /**
   * True only when answering `answerFactKey` can actually unblock the claim.
   * When false, no question exists: the user is told what could not be
   * computed instead of being sent to a dead end.
   */
  readonly answerable: boolean;
  /** Which claims are blocked by this missing fact. */
  readonly blockedClaims: readonly string[];
}

// ── Contradiction ───────────────────────────────────────────────────

export interface ResultContradiction {
  readonly factKey: FactKey;
  readonly description: string;
  /** The conflicting values. */
  readonly conflictingValues: readonly unknown[];
  /** Which claims are affected. */
  readonly affectedClaims: readonly string[];
}

// ── Result ──────────────────────────────────────────────────────────

/**
 * The complete result of a case analysis.
 *
 * This is the primary output of the Result Engine. It aggregates
 * all rule evaluations into a structured, traceable, human-readable
 * result that the UI can render faithfully.
 */
export interface Result {
  readonly caseId: string;
  readonly problemKey: string;
  readonly evaluatedAt: IsoDateTime;
  readonly engineVersion: string;

  /** Overall status derived from all claims. */
  readonly overallStatus: ClaimStatus;

  /** Human-readable summary of the case. */
  readonly summary: string;

  /** All claims derived from rule evaluations. */
  readonly claims: readonly Claim[];

  /** Facts the user still needs to provide. */
  readonly missingInformation: readonly MissingInformation[];

  /** Detected contradictions that block claims. */
  readonly contradictions: readonly ResultContradiction[];

  /** All sources referenced by claims. */
  readonly sources: readonly SupportingSource[];

  /** Disclaimers that must be shown to the user. */
  readonly disclaimers: readonly string[];

  /**
   * Official bodies the user can take this case to (who decides WHERE to act).
   * Always present — even an undecidable case has a competent authority.
   */
  readonly channels: readonly ConsumerChannel[];

  /**
   * The company the claim is against, with its verified customer-service
   * channels when we have them. Null until the person tells us which company it
   * is — the report asks for it instead of guessing.
   */
  readonly company: CaseCompany | null;

  /** Whether the intake is complete (all required facts provided). */
  readonly intakeComplete: boolean;
}
