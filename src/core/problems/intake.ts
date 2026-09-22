/**
 * Adaptive intake engine (Fase 4) — generic, in the core, module-agnostic.
 *
 * resolveNextQuestion(module, knownFacts) → next unanswered applicable
 * question or "complete". Never re-asks a fact already known; honours
 * `askIf` skip logic. Pure and deterministic.
 */
import type { IntakeQuestion, ProblemModuleDefinition } from "./contract";
import type { FactKey } from "../types";

/**
 * Comparable primitive of a stored fact value.
 *
 * Facts are persisted as the structured union `{ type: "boolean", value: true }`,
 * but `askIf` conditions compare the PRIMITIVE (`true === true`). Passing the
 * wrapper around made every `askIf` evaluate false, so the questions behind
 * them (seller's response details, repair history, warranty claims) were never
 * asked and the analysis always reported missing data.
 *
 * Money keeps its structure: rules compare `amountMinor`/`currency` as a unit.
 */
export function factPrimitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if ("amountMinor" in record) return value;
  if ("type" in record && "value" in record) return record.value;
  return value;
}

/**
 * Comparable values of a case's CONFIRMED facts, ready for `askIf` evaluation.
 *
 * This is the map every question selector must receive. Building it from the raw
 * stored values (without `factPrimitive`) silently disabled every conditional
 * question in the form.
 */
export function factValueMap(
  facts: readonly {
    readonly key: FactKey | string;
    readonly value: unknown;
    readonly status: string;
  }[],
): Map<FactKey, unknown> {
  const map = new Map<FactKey, unknown>();
  for (const fact of facts) {
    if (fact.status !== "CONFIRMED") continue;
    map.set(fact.key as FactKey, factPrimitive(fact.value));
  }
  return map;
}

export interface KnownFact {
  readonly key: FactKey;
  readonly status: "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" | "SUPERSEDED";
}

export type IntakeProgress =
  | {
      readonly state: "QUESTION";
      readonly question: IntakeQuestion;
      readonly remainingEstimate: number;
    }
  | {
      readonly state: "COMPLETE";
      readonly missingRequired: readonly IntakeQuestion[];
    };

export function resolveNextQuestion(
  module: ProblemModuleDefinition,
  knownFacts: readonly KnownFact[],
): IntakeProgress {
  const known = new Set(knownFacts.filter((f) => f.status !== "SUPERSEDED").map((f) => f.key));

  const isKnown = (factKey: FactKey): boolean => known.has(factKey);

  const applicable = module.intake.filter((question) => {
    if (isKnown(question.factKey)) return false; // never re-ask
    return true; // askIf handled by resolveNextQuestionWithValues
  });

  const next = applicable[0];
  if (!next) {
    // Complete: report required questions that were skipped but never answered.
    const missingRequired = module.intake.filter((q) => q.required && !isKnown(q.factKey));
    return { state: "COMPLETE", missingRequired };
  }

  return {
    state: "QUESTION",
    question: next,
    remainingEstimate: applicable.length,
  };
}

/**
 * Value-aware variant: caller supplies current values (from case facts) so
 * `askIf` can compare against actual values, not just presence. This is the
 * primary runtime function.
 */
export function resolveNextQuestionWithValues(
  module: ProblemModuleDefinition,
  knownFacts: readonly KnownFact[],
  values: ReadonlyMap<FactKey, unknown>,
): IntakeProgress {
  const known = new Set(knownFacts.filter((f) => f.status !== "SUPERSEDED").map((f) => f.key));

  const applicable = module.intake.filter((question) => {
    if (known.has(question.factKey)) return false;
    return (question.askIf ?? []).every((dep) => {
      if (!known.has(dep.factKey)) return false;
      return values.get(dep.factKey) === dep.equals;
    });
  });

  const next = applicable[0];
  if (!next) {
    const missingRequired = module.intake.filter((q) => q.required && !known.has(q.factKey));
    return { state: "COMPLETE", missingRequired };
  }
  return { state: "QUESTION", question: next, remainingEstimate: applicable.length };
}
