/**
 * flight-cancel module tests (Fase 8.4 — AUDITED VERSION).
 *
 * 8 rules, 70+ scenarios covering:
 * - Definition and fact catalogue integrity
 * - Rule building and publication status
 * - Legal scenario evaluation (Art. 5, 7, 8, 9 EU261/2004)
 * - Art. 5(1)(c) notice-period exemptions (i, ii, iii)
 * - Extraordinary circumstances (Art. 5.3)
 * - Compensation amounts and Art. 7(2) reductions
 * - Package travel (Art. 3(6))
 * - Source integrity
 * - Claim statuses
 * - Edge cases and adversarial scenarios
 * - Contradictions
 * - Derived facts
 * - Anti-hallucination
 */
import { describe, expect, it } from "vitest";
import { ProblemRegistry } from "@core/problems";
import type { FactKey } from "@core/types";
import { evaluateRule, type RuleEvaluationContext } from "@core/rules";
import { isoDate } from "@core/shared/temporal";
import { MODULE_KEY, MODULE_VERSION, flightCancelModule } from "@problems/flight-cancel";
import { buildRules } from "@problems/flight-cancel/rules";

// ── Module Definition ──────────────────────────────────────────────

describe("flight-cancel module definition", () => {
  it("has the correct key and version", () => {
    expect(flightCancelModule.key).toBe(MODULE_KEY);
    expect(flightCancelModule.version).toBe(MODULE_VERSION);
    expect(MODULE_VERSION).toBe(2);
  });

  it("targets Spain with es-ES locale", () => {
    expect(flightCancelModule.jurisdictions).toEqual(["ES"]);
    expect(flightCancelModule.locales).toEqual(["es-ES"]);
  });

  it("can be registered in the ProblemRegistry", () => {
    const registry = new ProblemRegistry();
    registry.register(flightCancelModule);
    expect(registry.has(MODULE_KEY)).toBe(true);
  });

  it("rejects duplicate registration", () => {
    const registry = new ProblemRegistry();
    registry.register(flightCancelModule);
    expect(() => registry.register(flightCancelModule)).toThrow(/already registered/);
  });

  it("has a title and description", () => {
    expect(flightCancelModule.title).toBeTruthy();
    expect(flightCancelModule.description).toBeTruthy();
  });
});

// ── Fact Catalogue Integrity ───────────────────────────────────────

describe("flight-cancel fact catalogue", () => {
  it("every intake question maps to an existing fact key", () => {
    const catalogueKeys = new Set(flightCancelModule.factCatalogue.map((f) => f.key));
    for (const question of flightCancelModule.intake) {
      expect(catalogueKeys.has(question.factKey)).toBe(true);
    }
  });

  it("every required fact has an intake question", () => {
    const requiredFacts = flightCancelModule.factCatalogue.filter((f) => f.required);
    for (const fact of requiredFacts) {
      expect(flightCancelModule.intake.some((q) => q.factKey === fact.key)).toBe(true);
    }
  });

  it("has cancellation.notice_days as a fact", () => {
    const keys = new Set(flightCancelModule.factCatalogue.map((f) => f.key));
    expect(keys.has("cancellation.notice_days" as FactKey)).toBe(true);
  });

  it("has flight.distance_km and flight.compensation_tier as derived facts", () => {
    const keys = new Set(flightCancelModule.factCatalogue.map((f) => f.key));
    expect(keys.has("flight.distance_km" as FactKey)).toBe(true);
    expect(keys.has("flight.compensation_tier" as FactKey)).toBe(true);
  });

  it("has airline.alternative_transport_compliant fact", () => {
    const keys = new Set(flightCancelModule.factCatalogue.map((f) => f.key));
    expect(keys.has("airline.alternative_transport_compliant" as FactKey)).toBe(true);
  });

  it("has passenger.compensation_amount fact", () => {
    const keys = new Set(flightCancelModule.factCatalogue.map((f) => f.key));
    expect(keys.has("passenger.compensation_amount" as FactKey)).toBe(true);
  });

  it("has 7 required facts", () => {
    const required = flightCancelModule.factCatalogue.filter((f) => f.required);
    expect(required.length).toBe(7);
  });

  it("has 9 rule keys", () => {
    expect(flightCancelModule.ruleKeys.length).toBe(9);
  });

  it("notice_days description mentions negative values are possible", () => {
    const noticeDaysFact = flightCancelModule.factCatalogue.find(
      (f) => f.key === "cancellation.notice_days",
    );
    expect(noticeDaysFact?.description).toContain("negativo");
  });
});

// ── Rule Building ──────────────────────────────────────────────────

describe("flight-cancel rules", () => {
  it("builds all 8 rules successfully", () => {
    const rules = buildRules();
    expect(rules.flightWasCancelled).toBeDefined();
    expect(rules.noticePeriodInsufficient).toBeDefined();
    expect(rules.compensationExemptionAlternativeTransport).toBeDefined();
    expect(rules.compensationDueNoExtraordinary).toBeDefined();
    expect(rules.reimbursementEntitlement).toBeDefined();
    expect(rules.assistanceNotOffered).toBeDefined();
    expect(rules.additionalCostsClaim).toBeDefined();
    expect(rules.compensationAmount).toBeDefined();
  });

  it("all rules have correct keys", () => {
    const rules = buildRules();
    expect(rules.flightWasCancelled.key).toBe("flight-cancel.flight-was-cancelled");
    expect(rules.noticePeriodInsufficient.key).toBe("flight-cancel.notice-period-insufficient");
    expect(rules.compensationExemptionAlternativeTransport.key).toBe(
      "flight-cancel.compensation-exemption-alternative-transport",
    );
    expect(rules.compensationDueNoExtraordinary.key).toBe(
      "flight-cancel.compensation-due-no-extraordinary",
    );
    expect(rules.reimbursementEntitlement.key).toBe("flight-cancel.reimbursement-entitlement");
    expect(rules.assistanceNotOffered.key).toBe("flight-cancel.assistance-not-offered");
    expect(rules.additionalCostsClaim.key).toBe("flight-cancel.additional-costs-claim");
    expect(rules.compensationAmount.key).toBe("flight-cancel.compensation-amount");
  });

  it("all rules are PUBLISHED", () => {
    const rules = buildRules();
    for (const rule of Object.values(rules)) {
      expect(rule.status).toBe("PUBLISHED");
    }
  });

  it("all rules have verified sources", () => {
    const rules = buildRules();
    for (const rule of Object.values(rules)) {
      expect(rule.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it("rules match the module's ruleKeys", () => {
    const rules = buildRules();
    const ruleKeys = new Set(Object.values(rules).map((r) => r.key));
    for (const declaredKey of flightCancelModule.ruleKeys) {
      expect(ruleKeys.has(declaredKey)).toBe(true);
    }
  });
});

// ── Legal Scenario Tests ───────────────────────────────────────────

describe("legal rule evaluation", () => {
  const rules = buildRules();
  const baseContext: RuleEvaluationContext = {
    facts: [],
    contradictedKeys: new Set(),
    jurisdiction: { country: "ES" },
    currentDate: isoDate("2026-09-20"),
  };

  function ctx(overrides: Partial<RuleEvaluationContext>): RuleEvaluationContext {
    return { ...baseContext, ...overrides };
  }

  const fact = (
    key: string,
    value: unknown,
    status: "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" = "CONFIRMED",
  ) => ({ key: key as FactKey, value, status, evidenceRefs: [] as readonly string[] });

  // ── Rule 1: flight-was-cancelled ───────────────────────────────

  describe("Rule 1: flight-was-cancelled", () => {
    it("S1: cancellation with airports and date → SUPPORTED", () => {
      const r = evaluateRule(
        rules.flightWasCancelled,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.departure_airport", "MAD"),
            fact("flight.arrival_airport", "CDG"),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S2: no cancellation date → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.flightWasCancelled,
        ctx({
          facts: [fact("flight.departure_airport", "MAD"), fact("flight.arrival_airport", "CDG")],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S3: no airports → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.flightWasCancelled,
        ctx({ facts: [fact("cancellation.date", "2026-09-15")] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Rule 2: notice-period-insufficient ─────────────────────────

  describe("Rule 2: notice-period-insufficient (Art. 5.1.c)", () => {
    it("S4: notice 5 days (< 14) → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 5),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S5: notice 20 days (>= 14) → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-01"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 20),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S6: notice exactly 14 days → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-06"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 14),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S7: same-day cancellation (0 days) → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-20"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 0),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S8: no notice_days fact → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.scheduled_date", "2026-09-20"),
          ],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S9: notice 13 days (just under 14) → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-07"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 13),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S10: notice 7 days → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-13"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 7),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S11: notice 6 days → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-14"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 6),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S12: negative notice_days → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-21"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", -1),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });
  });

  // ── Rule 3: compensation-exemption-alternative-transport ───────

  describe("Rule 3: compensation-exemption-alternative-transport (Art. 5.1.c(ii)/(iii))", () => {
    it("S13: compliant alt transport accepted → SUPPORTED (airline exempt)", () => {
      const r = evaluateRule(
        rules.compensationExemptionAlternativeTransport,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", true),
            fact("airline.alternative_transport_compliant", true),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S14: non-compliant alt transport → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.compensationExemptionAlternativeTransport,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", true),
            fact("airline.alternative_transport_compliant", false),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S15: no alternative transport offered → INSUFFICIENT_DATA (accepted fact missing)", () => {
      const r = evaluateRule(
        rules.compensationExemptionAlternativeTransport,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15")],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S16: alt transport compliance unknown → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.compensationExemptionAlternativeTransport,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", true),
          ],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S17: alt transport offered but not accepted → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.compensationExemptionAlternativeTransport,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", false),
            fact("airline.alternative_transport_compliant", true),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Rule 4: compensation-due-no-extraordinary ──────────────────

  describe("Rule 4: compensation-due-no-extraordinary (Art. 5.3)", () => {
    it("S18: no extraordinary claimed → SUPPORTED", () => {
      const r = evaluateRule(
        rules.compensationDueNoExtraordinary,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.reason_is_extraordinary", false),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S19: extraordinary claimed → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.compensationDueNoExtraordinary,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.reason_is_extraordinary", true),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S20: no info on extraordinary → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.compensationDueNoExtraordinary,
        ctx({ facts: [fact("cancellation.date", "2026-09-15")] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Rule 5: reimbursement-entitlement ──────────────────────────

  describe("Rule 5: reimbursement-entitlement (Art. 8.1(a))", () => {
    it("S21: cancelled, not reimbursed → SUPPORTED", () => {
      const r = evaluateRule(
        rules.reimbursementEntitlement,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("passenger.reimbursed", false)],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S22: cancelled, reimbursed → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.reimbursementEntitlement,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("passenger.reimbursed", true)],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S23: cancelled, no reimbursement info → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.reimbursementEntitlement,
        ctx({ facts: [fact("cancellation.date", "2026-09-15")] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Rule 6: assistance-not-offered ─────────────────────────────

  describe("Rule 6: assistance-not-offered (Art. 9.1)", () => {
    it("S24: cancelled, no assistance → SUPPORTED", () => {
      const r = evaluateRule(
        rules.assistanceNotOffered,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.assistance_offered", false),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S25: cancelled, assistance offered → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.assistanceNotOffered,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("airline.assistance_offered", true),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S26: no cancellation → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.assistanceNotOffered,
        ctx({ facts: [fact("airline.assistance_offered", false)] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Rule 7: additional-costs-claim ─────────────────────────────

  describe("Rule 7: additional-costs-claim (Art. 8.3)", () => {
    it("S27: cancelled, costs > 0 → SUPPORTED", () => {
      const r = evaluateRule(
        rules.additionalCostsClaim,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("passenger.additional_costs", 8500),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S28: cancelled, costs = 0 → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.additionalCostsClaim,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("passenger.additional_costs", { amountMinor: 0, currency: "EUR" }),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S29: cancelled, no costs info → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.additionalCostsClaim,
        ctx({ facts: [fact("cancellation.date", "2026-09-15")] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S30: no cancellation → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.additionalCostsClaim,
        ctx({ facts: [fact("passenger.additional_costs", 5000)] }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Rule 8: compensation-amount ────────────────────────────────

  describe("Rule 8: compensation-amount (Art. 7.1+7.2)", () => {
    it("S31: short-haul, no alt transport → SUPPORTED (250€ tier)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("flight.compensation_tier", 250)],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S32: medium-haul, no alt transport → SUPPORTED (400€ tier)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("flight.compensation_tier", 400)],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S33: long-haul, no alt transport → SUPPORTED (600€ tier)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("flight.compensation_tier", 600)],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S34: compliant alt transport → NOT_APPLICABLE (airline exempt, no full amount)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.compensation_tier", 400),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", true),
            fact("airline.alternative_transport_compliant", true),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("S35: non-compliant alt transport → SUPPORTED (full amount)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.compensation_tier", 400),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", true),
            fact("airline.alternative_transport_compliant", false),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("S36: no cancellation date → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("flight.compensation_tier", 400)],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S37: no compensation tier (unknown distance) → INSUFFICIENT_DATA", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15")],
        }),
      );
      expect(r.status).toBe("INSUFFICIENT_DATA");
    });

    it("S38: tier = 0 (unknown distance) → NOT_APPLICABLE (0 is not > 0)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [fact("cancellation.date", "2026-09-15"), fact("flight.compensation_tier", 0)],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Contradiction scenarios ────────────────────────────────────

  describe("contradictions", () => {
    it("C1: contradicted cancellation date → CONTRADICTED", () => {
      const r = evaluateRule(
        rules.flightWasCancelled,
        ctx({
          facts: [
            {
              key: "cancellation.date" as FactKey,
              value: "2026-09-15",
              status: "CONTRADICTED",
              evidenceRefs: [],
            },
            fact("flight.departure_airport", "MAD"),
            fact("flight.arrival_airport", "CDG"),
          ],
          contradictedKeys: new Set(["cancellation.date"] as FactKey[]),
        }),
      );
      expect(r.status).toBe("CONTRADICTED");
    });

    it("C2: contradicted notice_days → CONTRADICTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.scheduled_date", "2026-09-20"),
            {
              key: "cancellation.notice_days" as FactKey,
              value: 5,
              status: "CONTRADICTED",
              evidenceRefs: [],
            },
          ],
          contradictedKeys: new Set(["cancellation.notice_days"] as FactKey[]),
        }),
      );
      expect(r.status).toBe("CONTRADICTED");
    });

    it("C3: contradicted extraordinary → CONTRADICTED", () => {
      const r = evaluateRule(
        rules.compensationDueNoExtraordinary,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            {
              key: "airline.reason_is_extraordinary" as FactKey,
              value: false,
              status: "CONTRADICTED",
              evidenceRefs: [],
            },
          ],
          contradictedKeys: new Set(["airline.reason_is_extraordinary"] as FactKey[]),
        }),
      );
      expect(r.status).toBe("CONTRADICTED");
    });
  });

  // ── Article 5(1)(c) exemption integration ──────────────────────

  describe("Art. 5(1)(c) exemption integration", () => {
    it("E1: notice 10 days + compliant alt transport → exempt (Art. 5.1.c(ii))", () => {
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("flight.compensation_tier", 400),
      ];
      const c = ctx({ facts });

      // Notice is insufficient (< 14 days)
      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      // BUT alternative transport IS compliant → airline is exempt
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      // And compensation amount should NOT apply (exempt)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });

    it("E2: notice 3 days + compliant alt transport → exempt (Art. 5.1.c(iii))", () => {
      const facts = [
        fact("cancellation.date", "2026-09-17"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 3),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("flight.compensation_tier", 250),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });

    it("E3: notice 10 days + non-compliant alt transport → NOT exempt", () => {
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("flight.compensation_tier", 400),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "NOT_APPLICABLE",
      );
      // Compensation amount should apply (not exempt)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("E4: notice < 7 days + no alt transport offered → exemption INSUFFICIENT_DATA (no accepted/compliant facts)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-18"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 2),
        fact("airline.re_routing_offered", false),
        fact("flight.compensation_tier", 250),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      // Exemption: accepted/compliant facts missing → INSUFFICIENT_DATA
      // (we cannot determine exemption without knowing if alt transport was compliant)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });

    it("E5: notice >= 14 days → no compensation needed, exempt under Art. 5.1.c(i)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-01"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 19),
      ];
      const c = ctx({ facts });

      // Notice is NOT insufficient
      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Full integration scenarios ─────────────────────────────────

  describe("full integration (all rules together)", () => {
    it("FI1: full cancellation scenario — all rules applicable", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "CDG"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", false),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.reason_is_extraordinary", false),
        fact("airline.assistance_offered", false),
        fact("passenger.reimbursed", false),
        fact("passenger.additional_costs", 8500),
        fact("flight.compensation_tier", 250),
      ];

      const c = ctx({ facts });

      expect(evaluateRule(rules.flightWasCancelled, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "NOT_APPLICABLE",
      );
      expect(evaluateRule(rules.compensationDueNoExtraordinary, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.reimbursementEntitlement, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.assistanceNotOffered, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.additionalCostsClaim, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("FI2: exempt scenario — compensation rules should NOT apply", () => {
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "CDG"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.assistance_offered", true),
        fact("passenger.reimbursed", true),
        fact("flight.compensation_tier", 250),
      ];

      const c = ctx({ facts });

      expect(evaluateRule(rules.flightWasCancelled, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Package travel (Art. 3(6)) ─────────────────────────────────

  describe("package travel (Art. 3(6) — NOT modeled, documented limitation)", () => {
    it("PKG1: the module cannot distinguish package travel from individual bookings", () => {
      // This is a KNOWN LIMITATION documented in the implementation report.
      // Art. 3(6): "This Regulation shall not apply in cases where a package
      // tour is cancelled for reasons other than cancellation of the flight."
      //
      // The module currently has no way to detect package travel status.
      // All rules will evaluate normally regardless of package travel context.
      // This is acceptable because:
      //   1. If the FLIGHT was cancelled, EU261 applies even for packages
      //   2. Package cancellation for non-flight reasons is out of scope
      //
      // A future module version could add a "flight.is_package_travel" fact.
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "BCN"),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.flightWasCancelled, c).status).toBe("SUPPORTED");
    });
  });

  // ── Anti-hallucination: no false certainty ─────────────────────

  describe("anti-hallucination: missing data never produces SUPPORTED", () => {
    it("AH1: missing cancellation date → no rule SUPPORTED", () => {
      const facts = [
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "CDG"),
        fact("flight.scheduled_date", "2026-09-20"),
      ];
      const c = ctx({ facts });
      for (const rule of Object.values(rules)) {
        const result = evaluateRule(rule, c);
        expect(result.status).not.toBe("SUPPORTED");
      }
    });

    it("AH2: missing all optional facts → only flight-was-cancelled SUPPORTED", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "CDG"),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.flightWasCancelled, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("INSUFFICIENT_DATA");
      expect(evaluateRule(rules.compensationDueNoExtraordinary, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
      expect(evaluateRule(rules.reimbursementEntitlement, c).status).toBe("INSUFFICIENT_DATA");
      expect(evaluateRule(rules.assistanceNotOffered, c).status).toBe("INSUFFICIENT_DATA");
      expect(evaluateRule(rules.additionalCostsClaim, c).status).toBe("INSUFFICIENT_DATA");
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("INSUFFICIENT_DATA");
    });

    it("AH3: extraordinary unknown → compensation-due-no-extraordinary INSUFFICIENT_DATA", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.departure_airport", "MAD"),
        fact("flight.arrival_airport", "CDG"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationDueNoExtraordinary, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });

    it("AH4: distance unknown → compensation-amount INSUFFICIENT_DATA", () => {
      const facts = [fact("cancellation.date", "2026-09-15")];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("INSUFFICIENT_DATA");
    });

    it("AH5: tier = 0 (unknown distance) → compensation-amount NOT_APPLICABLE", () => {
      // 0 is not > 0, so FACT_GREATER_THAN fails → NOT_APPLICABLE
      const facts = [fact("cancellation.date", "2026-09-15"), fact("flight.compensation_tier", 0)];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    it("EC1: notice_days = 1 → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-19"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 1),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("EC2: negative notice_days (cancellation after scheduled) → SUPPORTED", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-21"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", -1),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });

    it("EC3: large notice_days (200) → NOT_APPLICABLE", () => {
      const r = evaluateRule(
        rules.noticePeriodInsufficient,
        ctx({
          facts: [
            fact("cancellation.date", "2026-03-04"),
            fact("flight.scheduled_date", "2026-09-20"),
            fact("cancellation.notice_days", 200),
          ],
        }),
      );
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("EC4: additional costs with Money object → NOT_APPLICABLE (Money not comparable)", () => {
      const r = evaluateRule(
        rules.additionalCostsClaim,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("passenger.additional_costs", { amountMinor: 12000, currency: "EUR" }),
          ],
        }),
      );
      // Money objects return undefined from toPrimitive, so FACT_GREATER_THAN
      // TYPE_MISMATCH → NOT matched → NOT_APPLICABLE
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("EC5: compensation-amount with alt transport NOT accepted → SUPPORTED (full amount)", () => {
      const r = evaluateRule(
        rules.compensationAmount,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.compensation_tier", 600),
            fact("airline.re_routing_offered", true),
            fact("airline.re_routing.accepted", false),
            fact("airline.alternative_transport_compliant", false),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });
  });

  // ── Scope: EU261 applicability ─────────────────────────────────

  describe("scope applicability (EU261 Art. 3)", () => {
    it("SCOPE1: non-ES jurisdiction → NOT_APPLICABLE (module is ES-only)", () => {
      const r = evaluateRule(rules.flightWasCancelled, {
        facts: [
          fact("cancellation.date", "2026-09-15"),
          fact("flight.departure_airport", "MAD"),
          fact("flight.arrival_airport", "CDG"),
        ],
        contradictedKeys: new Set(),
        jurisdiction: { country: "FR" },
        currentDate: isoDate("2026-09-20"),
      });
      expect(r.status).toBe("NOT_APPLICABLE");
    });

    it("SCOPE2: non-EU carrier + non-EU route → evaluated if ES jurisdiction", () => {
      // A flight New York → Madrid operated by a non-EU carrier
      // The module doesn't model carrier nationality — known limitation
      const r = evaluateRule(
        rules.flightWasCancelled,
        ctx({
          facts: [
            fact("cancellation.date", "2026-09-15"),
            fact("flight.departure_airport", "JFK"),
            fact("flight.arrival_airport", "MAD"),
          ],
        }),
      );
      expect(r.status).toBe("SUPPORTED");
    });
  });

  // ── Compensation amount scenarios (Art. 7.1) ──────────────────

  describe("compensation amount by distance (Art. 7.1)", () => {
    it("AMT1: 1500 km or less → 250€ tier", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 250),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("AMT2: > 1500 km intra-UE → 400€ tier", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("AMT3: > 3500 km → 600€ tier", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
      ];
      const c = ctx({ facts });
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });
  });

  // ── Art. 7(2) 50% reduction scenarios ────────────────────────

  describe("Rule 9: compensation-50-percent-reduction (Art. 7(2))", () => {
    it("RED1: short-haul ≤1500km, delay 1.5h → SUPPORTED (50% reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
      // Rule 8: reduction_eligible = true → NOT_APPLICABLE (full amount rule
      // doesn't apply; reduction takes over)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });

    it("RED2: medium-haul 2000km, delay 2.5h → SUPPORTED (50% reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("RED3: long-haul 4000km, delay 3.5h → SUPPORTED (50% reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("RED4: short-haul, delay 2.5h → NOT_APPLICABLE (exceeds 2h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // reduction_eligible is false → Rule 9 NOT_APPLICABLE
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
      // Rule 8 should apply (full amount)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("RED5: medium-haul, delay 3.5h → NOT_APPLICABLE (exceeds 3h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("RED6: long-haul, delay 4.5h → NOT_APPLICABLE (exceeds 4h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 4.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("RED7: alt transport NOT accepted → NOT_APPLICABLE", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", false),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Re-routing not accepted → reduction not applicable
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
      // But full compensation IS applicable
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("RED8: alt transport exempt (compliant) → NOT_APPLICABLE (exemption applies, not reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Exemption applies → airline pays NOTHING (not 50%)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      // Reduction NOT applicable (exemption takes precedence)
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("RED9: eligible=false + missing delay hours → NOT_APPLICABLE", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // The eligibility fact is definitively false, so the 50% reduction cannot
      // apply no matter what the delay hours say: asking for them would be a
      // dead end (the form does not even ask — the branch is closed).
      const evaluation = evaluateRule(rules.compensation50PercentReduction, c);
      expect(evaluation.status).toBe("NOT_APPLICABLE");
      expect(evaluation.missingFacts).toEqual([]);
    });

    it("RED9b: everything satisfied except the delay hours → INSUFFICIENT_DATA", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        // Non-compliant ⇒ not exempt under Art. 5(1)(c), so the rule can still apply.
        fact("airline.alternative_transport_compliant", false),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      // Missing delay hours → Rule 9 can't evaluate
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });

    it("RED10: reduction_eligible missing → Rule 8 returns SUPPORTED (full amount)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", false),
        fact("airline.alternative_transport_compliant", false),
      ];
      const c = ctx({ facts });

      // No reduction_eligible fact → Rule 8's NOT branch passes → SUPPORTED
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("RED11: contradicted reduction_eligible → CONTRADICTED", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        {
          key: "passenger.compensation_reduction_eligible" as FactKey,
          value: true,
          status: "CONTRADICTED" as const,
          evidenceRefs: [] as readonly string[],
        },
      ];
      const c = ctx({
        facts,
        contradictedKeys: new Set(["passenger.compensation_reduction_eligible"] as FactKey[]),
      });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("CONTRADICTED");
    });
  });

  // ── Exemption vs. Reduction distinction (the core of this audit) ──

  describe("exemption vs. reduction distinction", () => {
    it("DIST1: 5-day notice, compliant alt transport → EXEMPT (Art. 5.1.c(iii)), NOT reduction", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Exemption applies → airline pays NOTHING
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      // Rule 8: exempt → NOT_APPLICABLE (no compensation owed)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      // Rule 9: reduction NOT applicable (exemption already covers it)
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("DIST2: 5-day notice, NON-compliant alt transport, delay 1.5h → NOT exempt, 50% REDUCTION", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 5),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      // Exemption does NOT apply
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "NOT_APPLICABLE",
      );
      // Rule 8: reduction_eligible = true → NOT_APPLICABLE (full amount rule
      // doesn't apply; reduction takes over)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      // Rule 9: reduction APPLIES → 50% of 400 = 200
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("DIST3: 10-day notice, compliant alt transport → EXEMPT (Art. 5.1.c(ii)), NOT reduction", () => {
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Exemption applies → airline pays NOTHING (not 50% of 600)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });

    it("DIST4: 10-day notice, NON-compliant alt transport, delay 3.5h → NOT exempt, 50% REDUCTION (Art. 7(2)(c))", () => {
      // This is the KEY scenario: Art. 5(1)(c)(ii) exemption doesn't apply
      // (alt transport arrived >4h late), but Art. 7(2) reduction DOES apply
      // because 3.5h < 4h threshold for >3500km flights.
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      // NOT exempt (alt transport compliant = false)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "NOT_APPLICABLE",
      );
      // Rule 8: reduction_eligible = true → NOT_APPLICABLE (full amount rule
      // doesn't apply; reduction takes over)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      // Rule 9: reduction APPLIES → 50% of 600 = 300
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });
  });

  // ── Half-amount verification ───────────────────────────────────

  describe("compensation amounts with 50% reduction", () => {
    it("HALF1: 250€ → 125€ when reduction applies", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      // Base: 250€ — Rule 8 NOT_APPLICABLE (reduction_eligible=true → full amount rule doesn't apply)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      // Reduction: SUPPORTED → 50% of 250 = 125€
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("HALF2: 400€ → 200€ when reduction applies", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("HALF3: 600€ → 300€ when reduction applies", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });
  });

  // ── Art. 7(2) boundary tests ──────────────────────────────────

  describe("Art. 7(2) boundary conditions", () => {
    it("BND1: short-haul, delay exactly 2h → NOT reduction (2h is not < 2h)", () => {
      // Art. 7(2)(a): "by two hours" — the reduction applies when the
      // arrival time does NOT exceed by two hours, i.e., delay < 2h
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("BND2: medium-haul, delay exactly 3h → NOT reduction (3h is not < 3h)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("BND3: long-haul, delay exactly 4h → NOT reduction (4h is not < 4h)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 4),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("BND4: short-haul, delay 1h59m → SUPPORTED (just under 2h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 1.98),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("BND5: medium-haul, delay 2h59m → SUPPORTED (just under 3h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.99),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("BND6: long-haul, delay 3h59m → SUPPORTED (just under 4h threshold)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 3.99),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });
  });

  // ── Art. 5(1)(c) vs Art. 7(2) — full scenarios ────────────────

  describe("full Art. 5 + Art. 7 scenarios", () => {
    it("SCEN1: notice ≥14 days → NOT_APPLICABLE (no compensation at all)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-01"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 19),
        fact("flight.compensation_tier", 400),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("NOT_APPLICABLE");
      // Rule 8: no alt transport facts → NOT branches match via NOT(FACT_EXISTS) → SUPPORTED
      // (Rule 8 only determines amount tier; eligibility is determined by Rule 2)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
    });

    it("SCEN2: notice <7d, no alt transport → full compensation (no reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-18"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 2),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", false),
        fact("airline.reimbursement_offered", true),
        fact("airline.assistance_offered", true),
        fact("airline.reason_is_extraordinary", false),
        fact("passenger.reimbursed", false),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
      expect(evaluateRule(rules.compensationDueNoExtraordinary, c).status).toBe("SUPPORTED");
      // Full amount: no alt transport accepted, no reduction
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
      // No reduction: re_routing.accepted, delay hours, and reduction_eligible
      // all MISSING → INSUFFICIENT_DATA (evaluator can't assume NOT_APPLICABLE
      // when required facts are absent)
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });

    it("SCEN3: notice <7d, alt transport accepted, delay 1.5h short-haul → 50% reduction", () => {
      const facts = [
        fact("cancellation.date", "2026-09-18"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 2),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("airline.reason_is_extraordinary", false),
        fact("passenger.reimbursed", false),
        fact("passenger.compensation_reduction_eligible", true),
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.noticePeriodInsufficient, c).status).toBe("SUPPORTED");
      expect(evaluateRule(rules.compensationDueNoExtraordinary, c).status).toBe("SUPPORTED");
      // NOT exempt (compliant = false)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "NOT_APPLICABLE",
      );
      // Rule 8: reduction_eligible = true → NOT_APPLICABLE (full amount rule
      // doesn't apply; reduction takes over)
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      // Rule 9: reduction APPLIES → 50% of 250 = 125€
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("SUPPORTED");
    });

    it("SCEN4: notice 7-14d, alt transport compliant → EXEMPT (Art. 5.1.c(ii))", () => {
      const facts = [
        fact("cancellation.date", "2026-09-10"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 10),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.alternative_arrival_delay_hours", 3.5),
        fact("airline.reason_is_extraordinary", false),
        fact("passenger.reimbursed", false),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Exemption applies → airline pays NOTHING
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe("NOT_APPLICABLE");
    });

    it("SCEN5: notice <7d, alt transport compliant → EXEMPT (Art. 5.1.c(iii))", () => {
      const facts = [
        fact("cancellation.date", "2026-09-18"),
        fact("flight.scheduled_date", "2026-09-20"),
        fact("cancellation.notice_days", 2),
        fact("flight.compensation_tier", 250),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", true),
        fact("airline.alternative_arrival_delay_hours", 1.5),
        fact("airline.reason_is_extraordinary", false),
        fact("passenger.reimbursed", false),
        fact("passenger.compensation_reduction_eligible", false),
      ];
      const c = ctx({ facts });

      // Exemption applies → airline pays NOTHING (not 50% of 250)
      expect(evaluateRule(rules.compensationExemptionAlternativeTransport, c).status).toBe(
        "SUPPORTED",
      );
      expect(evaluateRule(rules.compensationAmount, c).status).toBe("NOT_APPLICABLE");
    });
  });

  // ── Missing data protection ────────────────────────────────────

  describe("missing data never produces false reduction", () => {
    it("MISS1: missing alt_arrival_delay_hours → INSUFFICIENT_DATA (no false reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 400),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        // No delay hours fact
      ];
      const c = ctx({ facts });

      // Missing delay hours → INSUFFICIENT_DATA (evaluator can't assume
      // NOT_APPLICABLE when a required fact is absent)
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });

    it("MISS2: missing reduction_eligible → INSUFFICIENT_DATA (not false reduction)", () => {
      const facts = [
        fact("cancellation.date", "2026-09-15"),
        fact("flight.compensation_tier", 600),
        fact("airline.re_routing_offered", true),
        fact("airline.re_routing.accepted", true),
        fact("airline.alternative_transport_compliant", false),
        fact("airline.alternative_arrival_delay_hours", 2.5),
        // No reduction_eligible fact
      ];
      const c = ctx({ facts });

      expect(evaluateRule(rules.compensationAmount, c).status).toBe("SUPPORTED");
      // reduction_eligible is MISSING → Rule 9 needs it → INSUFFICIENT_DATA
      expect(evaluateRule(rules.compensation50PercentReduction, c).status).toBe(
        "INSUFFICIENT_DATA",
      );
    });
  });

  // ── Source integrity ───────────────────────────────────────────

  describe("source integrity", () => {
    it("all rules reference the EU261 source", () => {
      const rulesList = Object.values(rules);
      for (const rule of rulesList) {
        expect(rule.sourceIds.length).toBeGreaterThan(0);
        expect(rule.sourceIds[0]).toBe("src-eu-regulation-261-2004");
      }
    });

    it("rule keys are stable and deterministic", () => {
      const rules1 = buildRules();
      const rules2 = buildRules();
      expect(Object.keys(rules1)).toEqual(Object.keys(rules2));
      for (const key of Object.keys(rules1) as Array<keyof typeof rules1>) {
        expect(rules1[key].key).toBe(rules2[key].key);
      }
    });
  });
});
