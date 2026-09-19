/**
 * Rule domain types (Fase 3).
 *
 * Rules are DECLARATIVE DATA — never executable code. The evaluator is a pure
 * function over them. No eval, no dynamic code, no DSL beyond the condition
 * vocabulary below (ARCHITECTURE.md §13; STRESS_TEST governance lifecycle).
 */
import type { IsoDate } from "../shared/temporal";
import type { FactKey } from "../types";

export type RuleId = string & { readonly __brand: "RuleId" };
export type RuleVersion = number & { readonly __brand: "RuleVersion" };

/** Governance lifecycle (STRESS_TEST §13b). Only PUBLISHED rules serve users. */
export type RuleStatus = "DRAFT" | "REVIEWED" | "VERIFIED" | "PUBLISHED" | "DEPRECATED";

// ── Conditions (closed vocabulary; deterministic) ───────────────────

export type Condition =
  | { readonly kind: "FACT_EXISTS"; readonly key: FactKey }
  | { readonly kind: "FACT_EQUALS"; readonly key: FactKey; readonly equals: FactPrimitive }
  | { readonly kind: "FACT_NOT_EQUALS"; readonly key: FactKey; readonly notEquals: FactPrimitive }
  | { readonly kind: "FACT_GREATER_THAN"; readonly key: FactKey; readonly than: number }
  | { readonly kind: "FACT_LESS_THAN"; readonly key: FactKey; readonly than: number }
  | { readonly kind: "FACT_GREATER_OR_EQUAL"; readonly key: FactKey; readonly than: number }
  | { readonly kind: "FACT_LESS_OR_EQUAL"; readonly key: FactKey; readonly than: number }
  | { readonly kind: "DATE_BEFORE"; readonly key: FactKey; readonly before: IsoDate }
  | { readonly kind: "DATE_AFTER"; readonly key: FactKey; readonly after: IsoDate }
  | {
      readonly kind: "DATE_WITHIN_DAYS";
      readonly key: FactKey;
      /** Inclusive day window measured from the fact's calendar date. */
      readonly withinDays: number;
      /** Optional reference date; defaults to context.currentDate. */
      readonly referenceDate?: IsoDate;
    }
  /** fact(key) is a calendar date strictly after fact(otherKey). */
  | { readonly kind: "DATE_AFTER_FACT"; readonly key: FactKey; readonly otherKey: FactKey }
  /** fact(key) is a calendar date strictly before fact(otherKey). */
  | { readonly kind: "DATE_BEFORE_FACT"; readonly key: FactKey; readonly otherKey: FactKey }
  | { readonly kind: "BOOLEAN_IS_TRUE"; readonly key: FactKey }
  | { readonly kind: "BOOLEAN_IS_FALSE"; readonly key: FactKey }
  | { readonly kind: "ALL"; readonly conditions: readonly Condition[] }
  | { readonly kind: "ANY"; readonly conditions: readonly Condition[] }
  | { readonly kind: "NOT"; readonly condition: Condition };

/** Primitive literal usable in comparisons (mirrors FactValue primitives). */
export type FactPrimitive = string | number | boolean | IsoDate;

// ── Rule ────────────────────────────────────────────────────────────

export type JurisdictionScope =
  | { readonly level: "COUNTRY_WIDE"; readonly country: string }
  | { readonly level: "REGIONAL"; readonly country: string; readonly region: string };

/** Minimal structured explanation of a condition outcome (no legal prose). */
export interface ConditionTrace {
  readonly kind: Condition["kind"];
  readonly key?: FactKey;
  readonly matched: boolean;
  /** Why: missing / contradicted / actual vs expected / composition. */
  readonly reason:
    | "MATCHED"
    | "NOT_MATCHED"
    | "MISSING_FACT"
    | "CONTRADICTED_FACT"
    | "UNCONFIRMED_FACT"
    | "TYPE_MISMATCH"
    | "EMPTY_COMPOSITION"
    | "NEGATED";
  readonly actual?: unknown;
  readonly expected?: unknown;
  readonly otherKey?: FactKey;
  readonly children?: readonly ConditionTrace[];
}

export interface RuleDefinition {
  /** Human-readable rule key, stable across versions (e.g. "test.charge-after-cancel"). */
  readonly key: string;
  readonly version: RuleVersion;
  readonly title: string;
  readonly scope: JurisdictionScope;
  readonly root: Condition;
  /** Source ids required for publication (verified human-reviewed sources). */
  readonly sourceIds: readonly string[];
}

export interface Rule extends RuleDefinition {
  readonly id: RuleId;
  readonly status: RuleStatus;
  readonly createdAt: string;
  /** Immutability: a PUBLISHED rule's definition can never change (new version instead). */
}

// ── Evaluation ──────────────────────────────────────────────────────

/**
 * Evaluation statuses (claim vocabulary from ARCHITECTURE.md §18 Result Engine).
 * INSUFFICIENT_DATA ≠ false; CONTRADICTED ≠ insufficient.
 */
export type RuleEvaluationStatus =
  | "SUPPORTED"
  | "POTENTIALLY_APPLICABLE"
  | "INSUFFICIENT_DATA"
  | "CONTRADICTED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export interface RuleEvaluationContext {
  readonly facts: ReadonlyArray<{
    readonly key: FactKey;
    readonly status: "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" | "SUPERSEDED";
    readonly value: unknown; // runtime primitive extracted from FactValue
    readonly evidenceRefs: readonly string[];
  }>;
  /** Fact keys blocked by UNRESOLVED contradictions (from evidence/contradiction engine). */
  readonly contradictedKeys: ReadonlySet<FactKey>;
  readonly jurisdiction: { readonly country: string; readonly region?: string };
  /** Injected time — rules never call new Date() (determinism, docs prompt §20). */
  readonly currentDate: IsoDate;
}

export interface RuleEvaluation {
  readonly ruleKey: string;
  readonly ruleVersion: RuleVersion;
  readonly status: RuleEvaluationStatus;
  readonly traces: readonly ConditionTrace[];
  readonly missingFacts: readonly FactKey[];
  readonly contradictedFacts: readonly FactKey[];
  readonly evidenceRefs: readonly string[];
  readonly sourceIds: readonly string[];
  /** Not-applicable reason (e.g. jurisdiction mismatch). */
  readonly notApplicableReason?: string;
}
