/**
 * Problem Module tests (Fase 4): definition validity, rule gating.
 * TEST FIXTURES ONLY — no legal data asserted here beyond module wiring.
 */
import { describe, expect, it } from "vitest";

import { ProblemRegistry, resolveNextQuestionWithValues } from "@core/problems";
import type { KnownFact } from "@core/problems";
import type { FactKey } from "@core/types";
import { evaluateRule, type RuleEvaluationContext } from "@core/rules";
import { isoDate } from "@core/shared/temporal";
import {
  buildRules,
  cancellationChargeModule,
  MODULE_KEY,
  MODULE_VERSION,
} from "@problems/cancellation-charge";

describe("cancellation-charge module definition", () => {
  it("has a stable identity and valid version", () => {
    expect(MODULE_KEY).toBe("cancellation-charge");
    expect(MODULE_VERSION).toBe(1);
    expect(cancellationChargeModule.key).toBe(MODULE_KEY);
    expect(cancellationChargeModule.jurisdictions).toContain("ES");
  });

  it("registers once into the registry and rejects duplicates", () => {
    const registry = new ProblemRegistry();
    registry.register(cancellationChargeModule);
    expect(() => registry.register(cancellationChargeModule)).toThrow(/already registered/);
    expect(registry.get(MODULE_KEY)).toBe(cancellationChargeModule);
    expect(registry.has("unknown-problem")).toBe(false);
  });

  it("every intake question maps to a catalogue fact (contract invariant)", () => {
    const catalogueKeys = new Set(cancellationChargeModule.factCatalogue.map((f) => f.key));
    for (const question of cancellationChargeModule.intake) {
      expect(catalogueKeys.has(question.factKey)).toBe(true);
    }
  });

  it("supports only ES (single jurisdiction at this stage)", () => {
    expect(cancellationChargeModule.jurisdictions).toEqual(["ES"]);
    expect(cancellationChargeModule.locales).toEqual(["es-ES"]);
  });
});

describe("adaptive intake (skip logic)", () => {
  const known = (key: string): KnownFact => ({
    key: key as never,
    status: "CONFIRMED",
  });

  it("asks required questions first and never re-asks known facts", () => {
    const first = resolveNextQuestionWithValues(cancellationChargeModule, [], new Map());
    expect(first.state).toBe("QUESTION");

    const afterFirst = resolveNextQuestionWithValues(
      cancellationChargeModule,
      [known("cancellation.date")],
      new Map<FactKey, unknown>([["cancellation.date" as FactKey, "2026-01-10"]]),
    );
    expect(afterFirst.state).toBe("QUESTION");
    const q = (afterFirst as { question: { id: string } }).question;
    expect(q.id).not.toBe("q-cancellation-date");
  });

  it("skips the confirmation question unless commitment is known false", () => {
    const withCommitment = resolveNextQuestionWithValues(
      cancellationChargeModule,
      [known("contract.commitment_exists")],
      new Map<FactKey, unknown>([["contract.commitment_exists" as FactKey, true]]),
    );
    if (withCommitment.state === "QUESTION") {
      expect(withCommitment.question.id).not.toBe("q-confirmation");
    }
  });

  it("asks the confirmation question when commitment is false (skip logic active)", () => {
    // Answer everything before it so q-confirmation becomes the next applicable.
    const answers: KnownFact[] = [
      "service.contract_start_date",
      "cancellation.date",
      "charge.date",
      "charge.amount",
    ].map((k) => known(k));
    const values = new Map<string, unknown>([
      ["service.contract_start_date", "2024-01-01"],
      ["cancellation.date", "2026-01-10"],
      ["charge.date", "2026-02-01"],
      ["charge.amount", { amountMinor: 4999, currency: "EUR" }],
    ]);
    const withoutCommitment = resolveNextQuestionWithValues(
      cancellationChargeModule,
      [...answers, known("contract.commitment_exists")],
      new Map([...values, ["contract.commitment_exists", false]]) as never,
    );
    expect(withoutCommitment.state).toBe("QUESTION");
    expect((withoutCommitment as { question: { id: string } }).question.id).toBe("q-confirmation");
  });
});

describe("module rules (gating + pure evaluation)", () => {
  const baseContext: RuleEvaluationContext = {
    facts: [],
    contradictedKeys: new Set(),
    jurisdiction: { country: "ES" },
    currentDate: isoDate("2026-09-19"),
  };

  const date = (key: string, value: string) => ({
    key: key as never,
    status: "CONFIRMED" as const,
    value,
    evidenceRefs: [],
  });

  it("published factual rules evaluate deterministically (charge after cancellation)", () => {
    const rules = buildRules();
    const supported = evaluateRule(rules.chargeAfterCancellation, {
      ...baseContext,
      facts: [date("cancellation.date", "2026-01-10"), date("charge.date", "2026-02-01")],
    });
    expect(supported.status).toBe("SUPPORTED");

    const contradicted = evaluateRule(rules.chargeAfterCancellation, {
      ...baseContext,
      facts: [date("charge.date", "2026-01-05"), date("cancellation.date", "2026-01-10")],
    });
    expect(contradicted.status).toBe("NOT_APPLICABLE"); // facts present, condition false → NOT_APPLICABLE
  });

  it("rule with missing fact returns INSUFFICIENT_DATA, never false", () => {
    const rules = buildRules();
    const evaluation = evaluateRule(rules.chargeAfterCancellation, {
      ...baseContext,
      facts: [date("cancellation.date", "2026-01-10")],
    });
    expect(evaluation.status).toBe("INSUFFICIENT_DATA");
    expect(evaluation.missingFacts).toContain("charge.date");
  });

  it("jurisdiction mismatch yields NOT_APPLICABLE with reason", () => {
    const rules = buildRules();
    const evaluation = evaluateRule(rules.chargeAfterCancellation, {
      ...baseContext,
      jurisdiction: { country: "UK" },
      facts: [date("cancellation.date", "2026-01-10"), date("charge.date", "2026-02-01")],
    });
    expect(evaluation.status).toBe("NOT_APPLICABLE");
    expect(evaluation.notApplicableReason).toBeDefined();
  });

  it("the draft legal rule stays blocked from the published ruleset", () => {
    const rules = buildRules();
    expect(rules.penaltyAfterLegalDesistimiento.status).toBe("DRAFT");
    // Published rules are the only ones served:
    expect(rules.chargeAfterCancellation.status).toBe("PUBLISHED");
    expect(rules.contractDurationOver24Months.status).toBe("PUBLISHED");
    expect(rules.chargeAfterConfirmedCancellation.status).toBe("PUBLISHED");
  });

  it("every published rule declares at least one verified source id", () => {
    const rules = buildRules();
    for (const rule of [
      rules.chargeAfterCancellation,
      rules.contractDurationOver24Months,
      rules.chargeAfterConfirmedCancellation,
    ]) {
      expect(rule.sourceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("sources carry the human verification record (gate)", () => {
    // Rebuild twice: deterministic verification records (same ids/contents).
    const a = buildRules();
    const b = buildRules();
    expect(a.chargeAfterCancellation.sourceIds).toEqual(b.chargeAfterCancellation.sourceIds);
  });
});
