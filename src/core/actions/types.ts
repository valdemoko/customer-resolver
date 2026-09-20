/**
 * Action Engine domain types (Fase 7).
 *
 * Pure types — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * Actions are derived from Result claims + missing information.
 * They are NEVER invented by AI — they are deterministic derivations
 * from structured data.
 */
import type { FactKey } from "../types";

// ── Action Type ─────────────────────────────────────────────────────

/**
 * Closed vocabulary of action types.
 * Each type represents a concrete step the user can take.
 */
export type ActionType =
  | "COLLECT_INFORMATION"
  | "PRESERVE_EVIDENCE"
  | "CONTACT_MERCHANT"
  | "REQUEST_REFUND"
  | "SUBMIT_COMPLAINT"
  | "GENERATE_DOCUMENT"
  | "WAIT_FOR_RESPONSE"
  | "ESCALATE";

// ── Action Status ───────────────────────────────────────────────────

export type ActionStatus = "AVAILABLE" | "BLOCKED" | "COMPLETED" | "NOT_APPLICABLE";

// ── Action ──────────────────────────────────────────────────────────

/**
 * A concrete, actionable step the user can take.
 *
 * Actions are derived from:
 * - Result claims (SUPPORTED → REQUEST_REFUND, etc.)
 * - Missing information (INSUFFICIENT_DATA → COLLECT_INFORMATION)
 * - Contradictions (CONTRADICTED → PRESERVE_EVIDENCE)
 *
 * Actions are NEVER fabricated. Each action must be traceable to
 * at least one claim or missing information item.
 */
export interface Action {
  readonly id: string;
  readonly type: ActionType;
  readonly title: string;
  readonly description: string;
  readonly priority: number; // 1 = highest
  readonly status: ActionStatus;
  /** Fact keys needed for this action to be available. */
  readonly prerequisites: readonly FactKey[];
  /** Which claims this action relates to. */
  readonly relatedClaims: readonly string[];
  /** Which evidence items this action relates to. */
  readonly relatedEvidence: readonly string[];
  /** Additional metadata (e.g., deadline, template ID). */
  readonly metadata?: Record<string, unknown>;
}

// ── Action Plan ─────────────────────────────────────────────────────

/**
 * An ordered plan of actions for the user.
 *
 * The plan is deterministic: same Result → same Action Plan.
 * Actions are ordered by priority and grouped by phase.
 */
export interface ActionPlan {
  readonly caseId: string;
  readonly problemKey: string;
  readonly generatedAt: string;
  readonly actions: readonly Action[];
  /** Summary of what the user should do next. */
  readonly nextStep: string;
  /** Whether the plan is complete or needs more information. */
  readonly complete: boolean;
}
