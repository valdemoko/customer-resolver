/**
 * Adaptive intake engine (Fase 4) — generic, in the core, module-agnostic.
 *
 * resolveNextQuestion(module, knownFacts) → next unanswered applicable
 * question or "complete". Never re-asks a fact already known; honours
 * `askIf` skip logic. Pure and deterministic.
 */
import type { IntakeQuestion, ProblemModuleDefinition } from "./contract";
import type { FactKey } from "../types";

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
