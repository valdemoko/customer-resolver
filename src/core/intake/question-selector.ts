/**
 * Deterministic question selector (Fase 8.3, spec §6).
 *
 * Selects the next question to ask based on:
 *   - Required facts missing
 *   - Critical ambiguity
 *   - Module intake rules (askIf conditions)
 *
 * Key rules:
 *   - UNCONFIRMED AI candidates do NOT satisfy questions
 *   - Only CONFIRMED facts can satisfy questions
 *   - Same facts + same module → same question (deterministic)
 *   - AI helps formulate wording, does NOT select which question
 */
import type { FactKey } from "../types";
import type { ProblemModuleDefinition, IntakeQuestion } from "../problems/contract";
import type { QuestionSelection } from "./types";
import type { KnownFact } from "../problems/intake";

// ── Question priority ────────────────────────────────────────────────

function questionPriority(question: IntakeQuestion): QuestionSelection["priority"] {
  return question.required ? "REQUIRED" : "MEDIUM";
}

// ── askIf evaluation ─────────────────────────────────────────────────

/**
 * Evaluate askIf conditions against known facts.
 * A question is shown only when ALL askIf conditions are met.
 * If no askIf conditions, the question is always applicable.
 */
function evaluateAskIf(
  question: IntakeQuestion,
  knownFactValues: ReadonlyMap<FactKey, unknown>,
  knownFactKeys: ReadonlySet<FactKey>,
): boolean {
  if (!question.askIf || question.askIf.length === 0) return true;

  return question.askIf.every((dep) => {
    if (!knownFactKeys.has(dep.factKey as FactKey)) return false;
    return knownFactValues.get(dep.factKey as FactKey) === dep.equals;
  });
}

// ── Main selector ────────────────────────────────────────────────────

/**
 * Select the next question for a module based on confirmed facts.
 *
 * Algorithm:
 *   1. Filter out questions where a CONFIRMED fact exists
 *   2. Filter out questions whose askIf condition is false
 *   3. Sort: required facts first, then by module order
 *   4. Return the first question
 *
 * This is PURE and DETERMINISTIC.
 */
export function selectNextQuestion(
  module: ProblemModuleDefinition,
  confirmedFacts: readonly KnownFact[],
  factValues: ReadonlyMap<FactKey, unknown>,
  /**
   * Facts the analysis actually needs (see `computeIntakeRequirements`). When
   * given, the form asks exactly those — a question whose fact no rule reads is
   * not worth the user's time. Omitted ⇒ the whole module questionnaire applies.
   */
  neededFactKeys?: ReadonlySet<string>,
  /**
   * Facts the person explicitly said they do not know. "I don't know" is an
   * answer: without this the same question came back immediately (the selector
   * always returns the first unanswered fact), so the form could never move on.
   * Such a fact stays missing for the rules — it simply stops being asked.
   */
  declinedFactKeys?: ReadonlySet<string>,
): QuestionSelection | null {
  // Build set of confirmed fact keys (non-superceded)
  const confirmedKeys = new Set<FactKey>(
    confirmedFacts.filter((f) => f.status === "CONFIRMED").map((f) => f.key),
  );

  // Filter applicable questions
  const applicable = module.intake.filter((question) => {
    // Skip if fact already confirmed
    if (confirmedKeys.has(question.factKey as FactKey)) return false;

    // Already answered with "I don't know"
    if (declinedFactKeys?.has(question.factKey as string)) return false;

    // Only facts the analysis needs
    if (neededFactKeys && !neededFactKeys.has(question.factKey as string)) return false;

    // Evaluate askIf conditions
    return evaluateAskIf(question, factValues, confirmedKeys);
  });

  if (applicable.length === 0) return null;

  const next = applicable[0]!;
  const remainingCount = applicable.length - 1;

  // The declared answer type travels with the question so the client can render
  // the right control and send a real boolean/number/date — never a string that
  // merely looks like one (the rule engine compares typed values only).
  const catalogueEntry = module.factCatalogue.find((f) => f.key === next.factKey);
  const declaredType = next.type ?? catalogueEntry?.type ?? "string";
  const declaredOptions =
    next.options ?? (catalogueEntry?.options as readonly string[] | undefined) ?? [];

  return {
    factKey: next.factKey as FactKey,
    questionText: next.text,
    reason: next.required ? "Required fact missing" : "Optional fact available for collection",
    priority: questionPriority(next),
    remainingCount,
    questionType: declaredType,
    options: declaredOptions,
    required: next.required,
    totalApplicable: applicable.length,
  };
}

/**
 * Check if all required facts are confirmed for a module.
 */
export function allRequiredFactsConfirmed(
  module: ProblemModuleDefinition,
  confirmedFacts: readonly KnownFact[],
): boolean {
  const confirmedKeys = new Set(
    confirmedFacts.filter((f) => f.status === "CONFIRMED").map((f) => f.key),
  );

  return module.factCatalogue
    .filter((f) => f.required)
    .every((f) => confirmedKeys.has(f.key as FactKey));
}

/**
 * Is the intake done? True only when no applicable question remains.
 *
 * Distinct from `allRequiredFactsConfirmed`, which reflects the module's minimum
 * viable set: that one is true after three questions for warranty-rejection,
 * while the rules still need the seller's response details, the repair history
 * and the delivery date. Treating it as "done" ended the questionnaire too early.
 *
 * A question whose `askIf` is false will never be asked, so it must NOT block
 * completion — otherwise a user who answers "no, the seller never responded"
 * would be stuck in a form that can never finish. With no requirement set this
 * degrades to the required-facts semantics.
 */
export function intakeRequirementsSatisfied(
  module: ProblemModuleDefinition,
  confirmedFacts: readonly KnownFact[],
  factValues: ReadonlyMap<FactKey, unknown>,
  neededFactKeys?: ReadonlySet<string>,
  declinedFactKeys?: ReadonlySet<string>,
): boolean {
  if (!neededFactKeys || neededFactKeys.size === 0) {
    const settled = new Set<FactKey>(
      confirmedFacts.filter((f) => f.status === "CONFIRMED").map((f) => f.key),
    );
    return module.factCatalogue
      .filter((f) => f.required)
      .every((f) => settled.has(f.key as FactKey) || declinedFactKeys?.has(f.key as string) === true);
  }

  return (
    selectNextQuestion(module, confirmedFacts, factValues, neededFactKeys, declinedFactKeys) === null
  );
}
