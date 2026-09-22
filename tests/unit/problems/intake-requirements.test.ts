/**
 * Guard tests: the questionnaire must be able to collect everything the rules read.
 *
 * Regression context: the intake form used to stop once the module's three
 * `required` facts were confirmed, while the rules read around ten facts. Every
 * analysis therefore ended in INSUFFICIENT_DATA — the user filled the form and
 * got no answer. These tests fail if that gap reopens.
 */
import { describe, expect, it } from "vitest";

import { computeDerivedFacts } from "@core/problems";
import { computeIntakeRequirements, DERIVED_FACT_SOURCES } from "@core/problems/requirements";
import { collectRuleFactKeys } from "@core/rules/fact-keys";
import { intakeRequirementsSatisfied, selectNextQuestion } from "@core/intake/question-selector";
import { factValueMap } from "@core/problems/intake";
import type { KnownFact } from "@core/problems";
import { createProblemRegistry } from "@server/problems/registry";
import { moduleCodeRules } from "@server/rules/publish-module-rules";

const registry = createProblemRegistry();
const modules = registry.list();

/** Structured FactValue for a fact of the given key, per the module catalogue. */
function factValues(
  moduleKey: string,
  entries: readonly (readonly [string, unknown])[],
): { key: string; value: unknown; status: string }[] {
  const problemModule = registry.get(moduleKey);
  return entries.map(([key, raw]) => {
    const catalogueEntry = problemModule.factCatalogue.find((f) => f.key === key);
    const type = catalogueEntry?.type ?? "string";
    return {
      key,
      value: { type, value: raw },
      status: "CONFIRMED",
    };
  });
}

describe("module registration", () => {
  it("publishes every rule the module declares, and declares every published rule", () => {
    for (const problemModule of modules) {
      const codeRules = moduleCodeRules(problemModule.key);
      expect(codeRules.length, `${problemModule.key} has no code-defined rules`).toBeGreaterThan(0);

      const codeKeys = new Set(codeRules.map((r) => r.key));
      for (const declared of problemModule.ruleKeys) {
        expect(codeKeys.has(declared), `${problemModule.key}: ${declared} is not defined`).toBe(true);
      }

      // A rule that is PUBLISHED in code but not declared would be published
      // into the database and then never evaluated — silent dead analysis.
      const undeclared = codeRules
        .filter((r) => r.status === "PUBLISHED" && !problemModule.ruleKeys.includes(r.key))
        .map((r) => r.key);
      expect(undeclared, `${problemModule.key}: published but not declared`).toEqual([]);
    }
  });
});

describe("intake requirements", () => {
  it("demands every fact the rules read, not just the module's required minimum", () => {
    const problemModule = registry.get("warranty-rejection");
    const requirements = computeIntakeRequirements(
      problemModule,
      moduleCodeRules(problemModule.key),
    );

    // Facts the rules genuinely read.
    for (const key of [
      "seller.rejection",
      "seller.offered_repair",
      "seller.offered_replacement",
      "repair.completed",
      "repair.failed",
      "repair.defect_recurred",
      "seller.claimed_warranty_expired",
      "seller.declared_wont_repair",
      // Input of the derived deadlines, so the temporal rules can run at all.
      "purchase.delivery_date",
    ]) {
      expect(requirements.neededFactKeys.has(key), `${key} should be asked`).toBe(true);
    }

    // Derived facts are computed, never asked.
    expect(requirements.derivedFactKeys.has("compliance.responsibility_deadline")).toBe(true);
    expect(requirements.neededFactKeys.has("compliance.responsibility_deadline")).toBe(false);
    expect(requirements.neededFactKeys.has("compliance.presumption_deadline")).toBe(false);

    // Strictly more than the module's three required facts.
    expect(problemModule.factCatalogue.filter((f) => f.required)).toHaveLength(3);
    expect(requirements.neededFactKeys.size).toBeGreaterThan(3);
  });

  it("can collect every fact any rule reads (asked directly or derived)", () => {
    const uncollectable: string[] = [];

    for (const problemModule of modules) {
      const rules = moduleCodeRules(problemModule.key);
      const { neededFactKeys, derivedFactKeys } = computeIntakeRequirements(problemModule, rules);
      const askable = new Set(problemModule.intake.map((q) => q.factKey as string));

      for (const key of collectRuleFactKeys(rules)) {
        const factKey = key as string;
        if (neededFactKeys.has(factKey) || derivedFactKeys.has(factKey)) continue;
        // A fact the system neither asks about nor derives: no run can conclude.
        uncollectable.push(`${problemModule.key}:${factKey} (askable=${askable.has(factKey)})`);
      }
    }

    expect(uncollectable).toEqual([]);
  });

  it("is satisfied only once every needed fact is confirmed", () => {
    const problemModule = registry.get("warranty-rejection");
    const { neededFactKeys } = computeIntakeRequirements(
      problemModule,
      moduleCodeRules(problemModule.key),
    );

    const partial: KnownFact[] = [
      { key: "nonconformity.description" as KnownFact["key"], status: "CONFIRMED" },
      { key: "seller.response_received" as KnownFact["key"], status: "CONFIRMED" },
      { key: "seller.rejection" as KnownFact["key"], status: "CONFIRMED" },
    ];
    expect(intakeRequirementsSatisfied(problemModule, partial, new Map(), neededFactKeys)).toBe(
      false,
    );

    const complete: KnownFact[] = [...neededFactKeys].map((key) => ({
      key: key as KnownFact["key"],
      status: "CONFIRMED",
    }));
    expect(intakeRequirementsSatisfied(problemModule, complete, new Map(), neededFactKeys)).toBe(
      true,
    );
  });

  it("falls back to the required-facts semantics when no requirement set is given", () => {
    const problemModule = registry.get("warranty-rejection");
    const requiredOnly: KnownFact[] = problemModule.factCatalogue
      .filter((f) => f.required)
      .map((f) => ({ key: f.key as KnownFact["key"], status: "CONFIRMED" }));
    expect(intakeRequirementsSatisfied(problemModule, requiredOnly, new Map())).toBe(true);
  });

  it("asks the conditional questions once their condition is met", () => {
    // Regression: facts are stored as { type, value } wrappers. Feeding those
    // wrappers straight into `askIf` made every comparison false, so the seller
    // response details, the repair history and the warranty claims were never
    // asked — the form ended after 5 questions and the rules reported no data.
    const problemModule = registry.get("warranty-rejection");
    const { neededFactKeys } = computeIntakeRequirements(
      problemModule,
      moduleCodeRules(problemModule.key),
    );

    const facts = [
      {
        key: "nonconformity.description",
        value: { type: "string", value: "No carga a las tres semanas." },
        status: "CONFIRMED",
      },
      {
        key: "seller.response_received",
        value: { type: "boolean", value: true },
        status: "CONFIRMED",
      },
      { key: "seller.rejection", value: { type: "boolean", value: true }, status: "CONFIRMED" },
    ];
    const known: KnownFact[] = facts.map((f) => ({
      key: f.key as KnownFact["key"],
      status: "CONFIRMED",
    }));

    const next = selectNextQuestion(
      problemModule,
      known,
      factValueMap(facts),
      neededFactKeys,
    );
    expect(next?.factKey).toBe("seller.offered_repair");
  });

  it("finishes instead of deadlocking when a condition closes a branch", () => {
    // "The seller never responded" hides every question behind that condition.
    // They can never be confirmed, so they must not block completion.
    const problemModule = registry.get("warranty-rejection");
    const { neededFactKeys } = computeIntakeRequirements(
      problemModule,
      moduleCodeRules(problemModule.key),
    );

    const facts = [
      {
        key: "nonconformity.description",
        value: { type: "string", value: "No carga." },
        status: "CONFIRMED",
      },
      {
        key: "seller.response_received",
        value: { type: "boolean", value: false },
        status: "CONFIRMED",
      },
      { key: "seller.rejection", value: { type: "boolean", value: false }, status: "CONFIRMED" },
      { key: "purchase.delivery_date", value: { type: "date", value: "2026-05-01" }, status: "CONFIRMED" },
      { key: "repair.completed", value: { type: "boolean", value: false }, status: "CONFIRMED" },
    ];
    const known: KnownFact[] = facts.map((f) => ({
      key: f.key as KnownFact["key"],
      status: "CONFIRMED",
    }));

    expect(intakeRequirementsSatisfied(problemModule, known, factValueMap(facts), neededFactKeys)).toBe(
      true,
    );
  });
});

describe("derived fact table", () => {
  const covered = new Set<string>();

  function expectDerived(moduleKey: string, entries: readonly (readonly [string, unknown])[]) {
    const problemModule = registry.get(moduleKey);
    const produced = computeDerivedFacts(factValues(moduleKey, entries), problemModule).map(
      (f) => f.key as string,
    );
    for (const key of produced) covered.add(key);
    return produced;
  }

  it("computes the warranty deadlines from the delivery date", () => {
    const produced = expectDerived("warranty-rejection", [["purchase.delivery_date", "2026-05-01"]]);
    expect(produced).toContain("compliance.responsibility_deadline");
    expect(produced).toContain("compliance.presumption_deadline");
  });

  it("computes the post-repair deadline from a completed repair", () => {
    const produced = expectDerived("warranty-rejection", [
      ["repair.completed", true],
      ["repair.delivery_date", "2026-06-01"],
    ]);
    expect(produced).toContain("compliance.after_repair_deadline");
  });

  it("computes the applicable delivery deadline (Art. 66 bis)", () => {
    const promised = expectDerived("no-delivery-refund", [["delivery.promised_date", "2026-05-01"]]);
    expect(promised).toContain("delivery.applicable_deadline");

    const fromPurchase = expectDerived("no-delivery-refund", [["purchase.date", "2026-04-01"]]);
    expect(fromPurchase).toContain("delivery.applicable_deadline");
  });

  it("computes the flight notice days, distance, tier and reduction", () => {
    const notice = expectDerived("flight-cancel", [
      ["flight.scheduled_date", "2026-05-10"],
      ["cancellation.date", "2026-05-01"],
    ]);
    expect(notice).toContain("cancellation.notice_days");

    const distance = expectDerived("flight-cancel", [
      ["flight.departure_airport", "MAD"],
      ["flight.arrival_airport", "BCN"],
    ]);
    expect(distance).toContain("flight.distance_km");
    expect(distance).toContain("flight.compensation_tier");

    const reduction = expectDerived("flight-cancel", [
      ["flight.departure_airport", "MAD"],
      ["flight.arrival_airport", "BCN"],
      ["airline.re_routing.accepted", true],
      ["airline.alternative_arrival_delay_hours", 1],
    ]);
    expect(reduction).toContain("passenger.compensation_reduction_eligible");
  });

  it("documents every derived fact the analysis knows how to compute", () => {
    const undocumented = Object.keys(DERIVED_FACT_SOURCES).filter((key) => !covered.has(key));
    expect(undocumented).toEqual([]);
  });
});
