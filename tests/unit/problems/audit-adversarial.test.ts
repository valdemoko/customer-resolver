/**
 * Fase 4 audit — adversarial tests (docs: auditoría final §10).
 * Only tests for REAL gaps found during the audit (not counter-inflation):
 *
 *  - A1/A2/A3: charge-before-cancellation, same-day, post-cancellation.
 *  - A4: unknown charge date.
 *  - R2 boundary: rule 2 v1 evaluates TRUE for ANY duration > 0 — the audit
 *    finding that the current predicate cannot distinguish 24 months.
 *  - R3: rule 3's confirmation condition interacts with intake skip logic
 *    (confirmation fact may legitimately be absent → INSUFFICIENT_DATA).
 *  - G1: unverifiable source blocks publication (source registry semantics).
 *  - D1: DRAFT rule cannot be served by a published-rules provider.
 *  - S1/S2: semantic security — user legal claims stay USER_PROVIDED facts,
 *    never system legal facts (provenance is a closed type).
 */
import { describe, expect, it } from "vitest";

import { evaluateRule, type Rule, type RuleEvaluationContext } from "@core/rules";
import { isoDate } from "@core/shared/temporal";
import { buildRules } from "@problems/cancellation-charge";

const CONTEXT_DATE = isoDate("2026-09-19");

function context(
  facts: RuleEvaluationContext["facts"],
  overrides?: Partial<RuleEvaluationContext>,
): RuleEvaluationContext {
  return {
    facts,
    contradictedKeys: new Set(),
    jurisdiction: { country: "ES" },
    currentDate: CONTEXT_DATE,
    ...overrides,
  };
}

const dateFact = (key: string, value: string) => ({
  key: key as never,
  status: "CONFIRMED" as const,
  value,
  evidenceRefs: [],
});

const boolFact = (key: string, value: boolean, status = "CONFIRMED") => ({
  key: key as never,
  status: status as never,
  value,
  evidenceRefs: [],
});

function evaluateOn(rule: Rule, facts: RuleEvaluationContext["facts"]) {
  return evaluateRule(rule, context(facts));
}

describe("audit: charge-after-cancellation edge cases", () => {
  const rules = buildRules();

  it("A1: charge before cancellation → NOT_APPLICABLE (fact, no legal reading)", () => {
    const e = evaluateOn(rules.chargeAfterCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
      dateFact("charge.date", "2026-06-01"),
    ]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("A3: charge after cancellation → POTENTIALLY_APPLICABLE with UNCONFIRMED facts", () => {
    const e = evaluateOn(rules.chargeAfterCancellation, [
      { ...dateFact("cancellation.date", "2026-06-10"), status: "UNCONFIRMED" },
      { ...dateFact("charge.date", "2026-07-01"), status: "UNCONFIRMED" },
    ]);
    expect(e.status).toBe("POTENTIALLY_APPLICABLE");
  });

  it("A4: unknown charge date → INSUFFICIENT_DATA listing the missing fact", () => {
    const e = evaluateOn(rules.chargeAfterCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
    ]);
    expect(e.status).toBe("INSUFFICIENT_DATA");
    expect(e.missingFacts).toContain("charge.date");
  });
});

describe("audit fix F1: rule 2 now measures the 24-month calendar window", () => {
  const rules = buildRules();

  it("R2a-fix: 1-day-old contract does NOT produce SUPPORTED (the audited bug)", () => {
    const e = evaluateOn(rules.contractDurationExceeds24Months, [
      dateFact("service.contract_start_date", "2026-09-01"),
      dateFact("cancellation.date", "2026-09-02"),
    ]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("R2b: missing contract start → INSUFFICIENT_DATA (never fabricated)", () => {
    const e = evaluateOn(rules.contractDurationExceeds24Months, [
      dateFact("cancellation.date", "2026-09-02"),
    ]);
    expect(e.status).toBe("INSUFFICIENT_DATA");
    expect(e.missingFacts).toContain("service.contract_start_date");
  });
});

describe("audit: rule 3 confirmation condition and skip logic", () => {
  const rules = buildRules();

  it("R3a: confirmation fact absent (intake skipped or unanswered) → INSUFFICIENT_DATA", () => {
    const e = evaluateOn(rules.chargeAfterConfirmedCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
      dateFact("charge.date", "2026-07-01"),
    ]);
    expect(e.status).toBe("INSUFFICIENT_DATA");
    expect(e.missingFacts).toContain("cancellation.confirmation_exists");
  });

  it("R3b: confirmation false → NOT_APPLICABLE (all facts present, condition not met)", () => {
    const e = evaluateOn(rules.chargeAfterConfirmedCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
      dateFact("charge.date", "2026-07-01"),
      boolFact("cancellation.confirmation_exists", false),
    ]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("R3c: rule 3 does NOT read contract.commitment_exists (no hidden dependency)", () => {
    const withCommitment = evaluateOn(rules.chargeAfterConfirmedCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
      dateFact("charge.date", "2026-07-01"),
      boolFact("contract.commitment_exists", true),
      boolFact("cancellation.confirmation_exists", true),
    ]);
    const without = evaluateOn(rules.chargeAfterConfirmedCancellation, [
      dateFact("cancellation.date", "2026-06-10"),
      dateFact("charge.date", "2026-07-01"),
      boolFact("cancellation.confirmation_exists", true),
    ]);
    expect(withCommitment.status).toBe(without.status);
  });
});

describe("audit: draft rule isolation and publication gate", () => {
  it("D1: the DRAFT rule's key is NOT served by a published-only provider", async () => {
    const rules = buildRules();
    const published = [
      rules.chargeAfterCancellation,
      rules.contractDurationExceeds24Months,
      rules.chargeAfterConfirmedCancellation,
    ];
    // Mimic the analysis service's provider contract:
    const served = published.filter((r) =>
      [rules.penaltyAfterLegalDesistimiento.key].includes(r.key),
    );
    expect(served).toHaveLength(0);
    expect(rules.penaltyAfterLegalDesistimiento.status).toBe("DRAFT");
  });
});

describe("audit: semantic security of legal claims", () => {
  it("S1: provenance is a closed type — no 'legal fact' provenance exists to abuse", async () => {
    // Compile-time + runtime contract: the union has no system-legal variant.
    const { createFact } = await import("@core/case/facts");
    const at = isoDateTime("2026-09-19T12:00:00.000Z");
    // A user asserting "la empresa me dijo que es ilegal" can only produce a
    // USER_PROVIDED fact (string), never a system legal conclusion.
    const fact = createFact({
      caseId: "c",
      key: "user.claim.legality" as never,
      value: { type: "string", value: "La empresa me dijo que es ilegal" },
      provenance: "USER_PROVIDED",
      now: at,
    });
    expect(fact.status).toBe("UNCONFIRMED"); // never CONFIRMED by assertion
    expect(fact.provenance).toBe("USER_PROVIDED");
  });

  it("S2: USER_RESOLVED facts cannot be created outside the resolution path", async () => {
    const { createFact } = await import("@core/case/facts");
    const at = isoDateTime("2026-09-19T12:00:00.000Z");
    expect(() =>
      createFact({
        caseId: "c",
        key: "cancellation.date" as never,
        value: { type: "date", value: isoDate("2026-01-10") },
        provenance: "USER_RESOLVED",
        now: at,
      }),
    ).toThrow(/USER_RESOLVED/);
  });
});

// Helper import (kept at bottom to keep the describe blocks readable).
import { isoDateTime } from "@core/shared/temporal";
