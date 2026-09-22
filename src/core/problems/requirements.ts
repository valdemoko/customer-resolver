/**
 * Intake requirements: which facts must be collected before the analysis can
 * conclude anything about a case.
 *
 * Why this exists: a module marks as `required` only the minimum facts needed
 * to start a conversation (warranty-rejection marks 3). The rules, however, read
 * many more (`seller.offered_repair`, `repair.completed`, deadlines derived from
 * the delivery date…). Asking only the `required` ones ended the questionnaire
 * after three questions, so every rule reported INSUFFICIENT_DATA and the user
 * never received a real answer.
 *
 * The needed set is therefore derived from the rules themselves:
 *   required catalogue facts ∪ facts read by the module's rules
 *   − facts the system can derive on its own
 *   ∩ facts the module can actually ask about
 *
 * PURE and DETERMINISTIC.
 */
import type { Rule } from "../rules";
import { collectRuleFactKeys } from "../rules/fact-keys";
import { COMPANY_FACT_KEYS } from "../result/company";
import type { ProblemModuleDefinition } from "./contract";

/**
 * Derived facts: computed by the analysis from other facts, never asked.
 *
 * Single source of truth for "what does this derived fact need?". Kept honest by
 * `tests/unit/problems/requirements.test.ts`, which checks that every entry here
 * produces a real derived fact when its inputs are present (see
 * `computeDerivedFacts`) — so this table cannot silently drift from the engine.
 */
export const DERIVED_FACT_SOURCES: Readonly<Record<string, readonly string[]>> = {
  /** Art. 120.1 TRLGDCU: delivery + 36 months. */
  "compliance.responsibility_deadline": ["purchase.delivery_date"],
  /** Art. 121.1 TRLGDCU: delivery + 24 months. */
  "compliance.presumption_deadline": ["purchase.delivery_date"],
  /** Art. 122.3 TRLGDCU: return from repair + 12 months. */
  "compliance.after_repair_deadline": ["repair.completed", "repair.delivery_date"],
  /** Art. 66 bis.1 TRLGDCU: promised date, or purchase + 30 days. */
  "delivery.applicable_deadline": ["delivery.promised_date", "purchase.date"],
  /** Days between the cancellation notice and the scheduled departure. */
  "cancellation.notice_days": ["flight.scheduled_date", "cancellation.date"],
  /** Great-circle distance between the two airports of the itinerary. */
  "flight.distance_km": ["flight.departure_airport", "flight.arrival_airport"],
  /** Art. 7 EU261/2004 compensation tier, from the distance. */
  "flight.compensation_tier": ["flight.distance_km"],
  /** Art. 7.2 reduction when re-routing still arrives within the threshold. */
  "passenger.compensation_reduction_eligible": [
    "airline.re_routing.accepted",
    "airline.alternative_arrival_delay_hours",
  ],
};

export interface IntakeRequirements {
  /** Fact keys to collect from the user (each has an intake question). */
  readonly neededFactKeys: ReadonlySet<string>;
  /** Fact keys the system derives; never asked, never reported as missing input. */
  readonly derivedFactKeys: ReadonlySet<string>;
}

/**
 * Compute the facts an analysis run needs, given the module's rules.
 *
 * `rules` may be empty (module not published yet): then only the module's own
 * `required` catalogue facts are demanded, which is the previous behaviour.
 */
export function computeIntakeRequirements(
  module: ProblemModuleDefinition,
  rules: readonly Rule[],
): IntakeRequirements {
  const derivedFactKeys = new Set(Object.keys(DERIVED_FACT_SOURCES));
  const askableFactKeys = new Set(module.intake.map((q) => q.factKey as string));

  const referenced = new Set<string>();
  for (const key of collectRuleFactKeys(rules)) referenced.add(key as string);
  for (const fact of module.factCatalogue) {
    if (fact.required) referenced.add(fact.key as string);
  }

  // The company the claim is against. No rule reads it, but the report needs it
  // to name the company and show its official customer-service channels, so its
  // question is collected like any other (only when the module declares one).
  for (const key of COMPANY_FACT_KEYS) {
    if (askableFactKeys.has(key)) referenced.add(key);
  }

  // Expand derivations transitively: a rule reading `flight.distance_km` needs
  // the airports, which need nothing else.
  const pending = [...referenced];
  while (pending.length > 0) {
    const key = pending.pop() as string;
    for (const source of DERIVED_FACT_SOURCES[key] ?? []) {
      if (referenced.has(source)) continue;
      referenced.add(source);
      pending.push(source);
    }
  }

  // A question can be gated behind another fact (`askIf: commitment = false`).
  // If the precondition is never collected, the gated question can never be
  // answered either — and the rule that reads it reports missing data forever.
  // So the preconditions of any needed question are needed too.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const question of module.intake) {
      if (!referenced.has(question.factKey as string)) continue;
      for (const dep of question.askIf ?? []) {
        if (referenced.has(dep.factKey as string)) continue;
        referenced.add(dep.factKey as string);
        expanded = true;
      }
    }
  }

  const neededFactKeys = new Set(
    [...referenced].filter((key) => !derivedFactKeys.has(key) && askableFactKeys.has(key)),
  );

  return { neededFactKeys, derivedFactKeys };
}

/**
 * Resolve a fact key that rules reported as missing into the fact the USER can
 * actually answer: derived facts are translated to the first of their inputs.
 */
export function resolveAnswerableFactKey(key: string): string {
  const sources = DERIVED_FACT_SOURCES[key];
  if (!sources || sources.length === 0) return key;
  return resolveAnswerableFactKey(sources[0] as string);
}
