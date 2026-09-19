/**
 * Rule evaluator (Fase 3) — PURE and DETERMINISTIC.
 *
 * evaluate(rule, context) → RuleEvaluation, with no I/O, no time reads, no AI.
 * Core semantics (docs prompt §7/§8):
 *  - a missing required fact → INSUFFICIENT_DATA (never false)
 *  - a fact blocked by an unresolved contradiction → CONTRADICTED (never guessed)
 *  - unconfirmed facts make the rule POTENTIALLY_APPLICABLE (evidence ≠ truth)
 */
import { isoDateDaysBetween, isIsoDate } from "../shared/temporal";
import type {
  Condition,
  ConditionTrace,
  FactPrimitive,
  Rule,
  RuleEvaluation,
  RuleEvaluationContext,
  RuleEvaluationStatus,
} from "./types";
import { jurisdictionApplies } from "./jurisdiction";

interface FactLookup {
  readonly present: boolean;
  readonly contradicted: boolean;
  readonly status: "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" | "SUPERSEDED" | undefined;
  readonly value: unknown;
  readonly evidenceRefs: readonly string[];
}

function lookup(context: RuleEvaluationContext, key: string): FactLookup {
  const fact = context.facts.find((f) => f.key === key);
  if (!fact)
    return {
      present: false,
      contradicted: false,
      status: undefined,
      value: undefined,
      evidenceRefs: [],
    };
  return {
    present: true,
    contradicted: context.contradictedKeys.has(fact.key) || fact.status === "CONTRADICTED",
    status: fact.status,
    value: fact.value,
    evidenceRefs: fact.evidenceRefs,
  };
}

function toPrimitive(value: unknown): FactPrimitive | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  // money/enum/object facts are not comparable with primitives in v1
  return undefined;
}

function evalAtomic(condition: Condition, context: RuleEvaluationContext): ConditionTrace {
  const key = "key" in condition ? condition.key : undefined;
  const fact = key
    ? lookup(context, key)
    : { present: true, contradicted: false, status: undefined, value: undefined, evidenceRefs: [] };

  // Contradiction first: never guess a blocked fact's value.
  if (key && fact.contradicted) {
    return { kind: condition.kind, key, matched: false, reason: "CONTRADICTED_FACT" };
  }

  switch (condition.kind) {
    case "FACT_EXISTS":
      return {
        kind: condition.kind,
        key,
        matched: fact.present,
        reason: fact.present ? "MATCHED" : "MISSING_FACT",
      };

    case "FACT_EQUALS":
    case "FACT_NOT_EQUALS": {
      if (!fact.present)
        return { kind: condition.kind, key, matched: false, reason: "MISSING_FACT" };
      const actual = toPrimitive(fact.value);
      const expected = condition.kind === "FACT_EQUALS" ? condition.equals : condition.notEquals;
      if (actual === undefined || typeof actual !== typeof expected) {
        return {
          kind: condition.kind,
          key,
          matched: false,
          reason: "TYPE_MISMATCH",
          actual: fact.value,
          expected,
        };
      }
      const equal = actual === expected;
      const matched = condition.kind === "FACT_EQUALS" ? equal : !equal;
      return {
        kind: condition.kind,
        key,
        matched,
        reason: matched ? "MATCHED" : "NOT_MATCHED",
        actual,
        expected,
      };
    }

    case "FACT_GREATER_THAN":
    case "FACT_LESS_THAN":
    case "FACT_GREATER_OR_EQUAL":
    case "FACT_LESS_OR_EQUAL": {
      if (!fact.present)
        return { kind: condition.kind, key, matched: false, reason: "MISSING_FACT" };
      const actual = toPrimitive(fact.value);
      if (typeof actual !== "number") {
        return {
          kind: condition.kind,
          key,
          matched: false,
          reason: "TYPE_MISMATCH",
          actual: fact.value,
        };
      }
      let matched: boolean;
      switch (condition.kind) {
        case "FACT_GREATER_THAN":
          matched = actual > condition.than;
          break;
        case "FACT_LESS_THAN":
          matched = actual < condition.than;
          break;
        case "FACT_GREATER_OR_EQUAL":
          matched = actual >= condition.than;
          break;
        default:
          matched = actual <= condition.than;
          break;
      }
      return {
        kind: condition.kind,
        key,
        matched,
        reason: matched ? "MATCHED" : "NOT_MATCHED",
        actual,
        expected: condition.than,
      };
    }

    case "DATE_BEFORE":
    case "DATE_AFTER": {
      if (!fact.present)
        return { kind: condition.kind, key, matched: false, reason: "MISSING_FACT" };
      const actual = toPrimitive(fact.value);
      if (typeof actual !== "string" || !isIsoDate(actual)) {
        return {
          kind: condition.kind,
          key,
          matched: false,
          reason: "TYPE_MISMATCH",
          actual: fact.value,
        };
      }
      const anchor = condition.kind === "DATE_BEFORE" ? condition.before : condition.after;
      const days = isoDateDaysBetween(actual, anchor);
      const matched = condition.kind === "DATE_BEFORE" ? days > 0 : days < 0;
      return {
        kind: condition.kind,
        key,
        matched,
        reason: matched ? "MATCHED" : "NOT_MATCHED",
        actual,
        expected: anchor,
      };
    }

    case "DATE_WITHIN_DAYS": {
      if (!fact.present)
        return { kind: condition.kind, key, matched: false, reason: "MISSING_FACT" };
      const actual = toPrimitive(fact.value);
      if (typeof actual !== "string" || !isIsoDate(actual)) {
        return {
          kind: condition.kind,
          key,
          matched: false,
          reason: "TYPE_MISMATCH",
          actual: fact.value,
        };
      }
      const reference = condition.referenceDate ?? context.currentDate;
      const days = isoDateDaysBetween(actual, reference); // positive: fact is before reference
      const matched = days >= 0 && days <= condition.withinDays;
      return {
        kind: condition.kind,
        key,
        matched,
        reason: matched ? "MATCHED" : "NOT_MATCHED",
        actual: days,
        expected: condition.withinDays,
      };
    }

    case "BOOLEAN_IS_TRUE":
    case "BOOLEAN_IS_FALSE": {
      if (!fact.present)
        return { kind: condition.kind, key, matched: false, reason: "MISSING_FACT" };
      const actual = toPrimitive(fact.value);
      if (typeof actual !== "boolean") {
        return {
          kind: condition.kind,
          key,
          matched: false,
          reason: "TYPE_MISMATCH",
          actual: fact.value,
        };
      }
      const matched = condition.kind === "BOOLEAN_IS_TRUE" ? actual : !actual;
      return {
        kind: condition.kind,
        key,
        matched,
        reason: matched ? "MATCHED" : "NOT_MATCHED",
        actual,
      };
    }

    default:
      // compositions are handled by evalCondition — unreachable here
      return { kind: condition.kind, matched: false, reason: "NOT_MATCHED" };
  }
}

function evalCondition(condition: Condition, context: RuleEvaluationContext): ConditionTrace {
  if (condition.kind === "ALL") {
    if (condition.conditions.length === 0) {
      return { kind: "ALL", matched: false, reason: "EMPTY_COMPOSITION", children: [] };
    }
    const children = condition.conditions.map((c) => evalCondition(c, context));
    return {
      kind: "ALL",
      matched: children.every((c) => c.matched),
      reason: children.every((c) => c.matched) ? "MATCHED" : "NOT_MATCHED",
      children,
    };
  }
  if (condition.kind === "ANY") {
    if (condition.conditions.length === 0) {
      return { kind: "ANY", matched: false, reason: "EMPTY_COMPOSITION", children: [] };
    }
    const children = condition.conditions.map((c) => evalCondition(c, context));
    return {
      kind: "ANY",
      matched: children.some((c) => c.matched),
      reason: children.some((c) => c.matched) ? "MATCHED" : "NOT_MATCHED",
      children,
    };
  }
  if (condition.kind === "NOT") {
    const child = evalCondition(condition.condition, context);
    return {
      kind: "NOT",
      matched: !child.matched,
      reason: "NEGATED",
      children: [child],
    };
  }
  return evalAtomic(condition, context);
}

function missingAndContradicted(
  condition: Condition,
  context: RuleEvaluationContext,
): { missing: Set<string>; contradicted: Set<string>; evidence: Set<string> } {
  const missing = new Set<string>();
  const contradicted = new Set<string>();
  const evidence = new Set<string>();

  function walk(c: Condition): void {
    if ("key" in c && c.key) {
      const fact = context.facts.find((f) => f.key === c.key);
      if (!fact) missing.add(c.key);
      else {
        if (context.contradictedKeys.has(fact.key) || fact.status === "CONTRADICTED")
          contradicted.add(c.key);
        fact.evidenceRefs.forEach((ref) => evidence.add(ref));
      }
    }
    if (c.kind === "ALL" || c.kind === "ANY") c.conditions.forEach(walk);
    else if (c.kind === "NOT") walk(c.condition);
  }
  walk(condition);
  return { missing, contradicted, evidence };
}

/**
 * Evaluate a rule against a context. PURE: same inputs → same output, always.
 */
export function evaluateRule(rule: Rule, context: RuleEvaluationContext): RuleEvaluation {
  // Jurisdiction gate first (NOT_APPLICABLE with reason).
  if (!jurisdictionApplies(rule.scope, context.jurisdiction)) {
    return {
      ruleKey: rule.key,
      ruleVersion: rule.version,
      status: "NOT_APPLICABLE",
      traces: [],
      missingFacts: [],
      contradictedFacts: [],
      evidenceRefs: [],
      sourceIds: rule.sourceIds,
      notApplicableReason: `Rule scope ${rule.scope.level} ${rule.scope.country}${
        rule.scope.level === "REGIONAL" ? `/${rule.scope.region}` : ""
      } does not match case jurisdiction ${context.jurisdiction.country}${
        context.jurisdiction.region ? `/${context.jurisdiction.region}` : ""
      }`,
    };
  }

  const trace = evalCondition(rule.root, context);
  const { missing, contradicted, evidence } = missingAndContradicted(rule.root, context);

  let status: RuleEvaluationStatus;
  if (trace.matched) {
    // Any UNCONFIRMED fact involved → POTENTIALLY_APPLICABLE (not fully supported).
    const hasUnconfirmed = context.facts.some(
      (f) => f.status === "UNCONFIRMED" && referencesKey(rule.root, f.key),
    );
    status = hasUnconfirmed ? "POTENTIALLY_APPLICABLE" : "SUPPORTED";
  } else if (contradicted.size > 0) {
    status = "CONTRADICTED";
  } else if (missing.size > 0) {
    status = "INSUFFICIENT_DATA";
  } else {
    // All facts present and unblocked, but conditions evaluated false.
    status = "UNKNOWN";
  }

  return {
    ruleKey: rule.key,
    ruleVersion: rule.version,
    status,
    traces: [trace],
    missingFacts: [...missing] as unknown as RuleEvaluation["missingFacts"],
    contradictedFacts: [...contradicted] as unknown as RuleEvaluation["contradictedFacts"],
    evidenceRefs: [...evidence],
    sourceIds: rule.sourceIds,
  };
}

function referencesKey(condition: Condition, key: string): boolean {
  if ("key" in condition && condition.key === key) return true;
  if (condition.kind === "ALL" || condition.kind === "ANY") {
    return condition.conditions.some((c) => referencesKey(c, key));
  }
  if (condition.kind === "NOT") return referencesKey(condition.condition, key);
  return false;
}
