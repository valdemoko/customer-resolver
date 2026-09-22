/**
 * Case state machine (Fase 1).
 *
 * Pure, deterministic, DB-free (ARCHITECTURE.md §7; states ending in `_X` are
 * informational contexts per the taxonomy in core/types.ts).
 */
import type { CaseEventType, CaseStatus } from "../types";

export interface StateTransitionInput {
  readonly current: CaseStatus;
  readonly event: CaseTransitionEvent;
  /** Optional guard context: e.g. whether unresolved contradictions exist. */
  readonly hasUnresolvedContradictions?: boolean;
}

export type CaseTransitionEvent =
  | "START_COLLECTING"
  | "SUBMIT_FOR_ANALYSIS"
  | "ANALYSIS_NEEDS_MORE_INFO"
  | "CONTRADICTION_DETECTED"
  | "CONTRADICTION_RESOLVED"
  | "ANALYSIS_COMPLETED"
  | "ANALYSIS_TIMED_OUT"
  | "ACTION_STARTED"
  | "RESPONSE_RECEIVED"
  | "ESCALATE"
  | "CLOSE_CASE"
  | "REOPEN";

interface TransitionRule {
  readonly from: readonly CaseStatus[];
  readonly to: CaseStatus | ((input: StateTransitionInput) => CaseStatus);
}

const TRANSITIONS: Readonly<Record<CaseTransitionEvent, TransitionRule>> = {
  START_COLLECTING: {
    from: ["DRAFT", "NEEDS_INFORMATION", "HAS_CONTRADICTIONS"],
    to: "COLLECTING_INFORMATION",
  },
  SUBMIT_FOR_ANALYSIS: {
    from: ["COLLECTING_INFORMATION", "NEEDS_INFORMATION", "HAS_CONTRADICTIONS"],
    to: "READY_FOR_ANALYSIS",
  },
  ANALYSIS_NEEDS_MORE_INFO: {
    from: ["ANALYZING_X", "READY_FOR_ANALYSIS"],
    to: "NEEDS_INFORMATION",
  },
  CONTRADICTION_DETECTED: {
    from: ["COLLECTING_INFORMATION", "READY_FOR_ANALYSIS", "ANALYZING_X"],
    to: "HAS_CONTRADICTIONS",
  },
  CONTRADICTION_RESOLVED: {
    from: ["HAS_CONTRADICTIONS"],
    to: (input) =>
      input.hasUnresolvedContradictions ? "HAS_CONTRADICTIONS" : "COLLECTING_INFORMATION",
  },
  ANALYSIS_COMPLETED: { from: ["ANALYZING_X", "READY_FOR_ANALYSIS"], to: "RESULT_AVAILABLE" },
  ANALYSIS_TIMED_OUT: { from: ["ANALYZING_X"], to: "NEEDS_INFORMATION" },
  ACTION_STARTED: { from: ["RESULT_AVAILABLE"], to: "ACTION_IN_PROGRESS" },
  RESPONSE_RECEIVED: {
    from: ["ACTION_IN_PROGRESS", "AWAITING_RESPONSE", "ESCALATED"],
    to: "RESULT_AVAILABLE",
  },
  ESCALATE: {
    from: ["RESULT_AVAILABLE", "ACTION_IN_PROGRESS", "AWAITING_RESPONSE"],
    to: "ESCALATED",
  },
  CLOSE_CASE: {
    from: [
      "DRAFT",
      "COLLECTING_INFORMATION",
      "RESULT_AVAILABLE",
      "ACTION_IN_PROGRESS",
      "AWAITING_RESPONSE",
      "ESCALATED",
    ],
    to: "CLOSED",
  },
  REOPEN: { from: ["CLOSED"], to: "COLLECTING_INFORMATION" },
};

export interface StateTransitionResult {
  readonly next: CaseStatus;
  readonly changed: boolean;
  readonly eventType: CaseEventType;
}

export class InvalidCaseStateTransition extends Error {
  readonly code = "INVALID_CASE_STATE_TRANSITION";
  constructor(
    readonly current: CaseStatus,
    readonly event: CaseTransitionEvent,
  ) {
    super(`Invalid transition: ${event} from ${current}`);
    this.name = "InvalidCaseStateTransition";
  }
}

/**
 * Apply a transition. Pure: throws `InvalidCaseStateTransition` on invalid
 * combinations instead of silently changing state. `_X` contexts map to their
 * base state for guard logic but are preserved as distinct statuses.
 */
export function transition(input: StateTransitionInput): StateTransitionResult {
  const rule = TRANSITIONS[input.event];
  if (!rule) throw new Error(`Unknown transition event: ${String(input.event)}`);

  const base = (s: CaseStatus): CaseStatus => (s === "ANALYZING_X" ? "ANALYZING_X" : s);
  if (!rule.from.includes(base(input.current))) {
    throw new InvalidCaseStateTransition(input.current, input.event);
  }

  const next = typeof rule.to === "function" ? rule.to(input) : rule.to;
  const changed = next !== input.current;
  return {
    next,
    changed,
    eventType: changed ? "CASE_STATUS_CHANGED" : "CASE_UPDATED",
  };
}

/** All events legal from a given status (useful for UI and tests). */
export function allowedEvents(current: CaseStatus): readonly CaseTransitionEvent[] {
  const base = current === "ANALYZING_X" ? "ANALYZING_X" : current;
  return (Object.keys(TRANSITIONS) as CaseTransitionEvent[]).filter((event) =>
    TRANSITIONS[event].from.includes(base),
  );
}
