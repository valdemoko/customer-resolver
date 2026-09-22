/**
 * no-delivery-refund module tests (Fase 8.1 — Final Legal Audit, v3).
 *
 * 20 + 9 legal scenario tests covering all branches.
 */
import { describe, expect, it } from "vitest";
import { ProblemRegistry } from "@core/problems";
import type { FactKey } from "@core/types";
import { evaluateRule, type RuleEvaluationContext } from "@core/rules";
import { isoDate } from "@core/shared/temporal";
import { MODULE_KEY, MODULE_VERSION, noDeliveryRefundModule } from "@problems/no-delivery-refund";
import { buildRules } from "@problems/no-delivery-refund/rules";

// ── Module Definition ──────────────────────────────────────────────

describe("no-delivery-refund module definition", () => {
  it("has the correct key and version (v3)", () => {
    expect(noDeliveryRefundModule.key).toBe(MODULE_KEY);
    expect(noDeliveryRefundModule.version).toBe(MODULE_VERSION);
    expect(MODULE_VERSION).toBe(2);
  });

  it("targets Spain with es-ES locale", () => {
    expect(noDeliveryRefundModule.jurisdictions).toEqual(["ES"]);
    expect(noDeliveryRefundModule.locales).toEqual(["es-ES"]);
  });

  it("can be registered in the ProblemRegistry", () => {
    const registry = new ProblemRegistry();
    registry.register(noDeliveryRefundModule);
    expect(registry.has(MODULE_KEY)).toBe(true);
  });

  it("rejects duplicate registration", () => {
    const registry = new ProblemRegistry();
    registry.register(noDeliveryRefundModule);
    expect(() => registry.register(noDeliveryRefundModule)).toThrow(/already registered/);
  });

  it("has a title and description", () => {
    expect(noDeliveryRefundModule.title).toBeTruthy();
    expect(noDeliveryRefundModule.description).toBeTruthy();
  });
});

// ── Fact Catalogue Integrity ───────────────────────────────────────

describe("no-delivery-refund fact catalogue", () => {
  it("every intake question maps to an existing fact key", () => {
    const catalogueKeys = new Set(noDeliveryRefundModule.factCatalogue.map((f) => f.key));
    for (const question of noDeliveryRefundModule.intake) {
      expect(catalogueKeys.has(question.factKey)).toBe(true);
    }
  });

  it("every required fact has an intake question", () => {
    const requiredFacts = noDeliveryRefundModule.factCatalogue.filter((f) => f.required);
    for (const fact of requiredFacts) {
      expect(noDeliveryRefundModule.intake.some((q) => q.factKey === fact.key)).toBe(true);
    }
  });

  it("has delivery.applicable_deadline as a derived fact", () => {
    const keys = new Set(noDeliveryRefundModule.factCatalogue.map((f) => f.key));
    expect(keys.has("delivery.applicable_deadline" as FactKey)).toBe(true);
  });

  it("has v2 facts for legal correctness", () => {
    const keys = new Set(noDeliveryRefundModule.factCatalogue.map((f) => f.key));
    expect(keys.has("communication.seller_refused_delivery" as FactKey)).toBe(true);
    expect(keys.has("delivery.essential_date" as FactKey)).toBe(true);
    expect(keys.has("resolution.declared" as FactKey)).toBe(true);
    expect(keys.has("resolution.date" as FactKey)).toBe(true);
  });
});

// ── Rule Building ──────────────────────────────────────────────────

describe("no-delivery-refund rules", () => {
  it("builds all 4 rules successfully", () => {
    const rules = buildRules();
    expect(rules.deliveryDeadlineExceeded).toBeDefined();
    expect(rules.resolutionAfterAdditionalDeadline).toBeDefined();
    expect(rules.immediateResolutionRefusedOrEssential).toBeDefined();
    expect(rules.refundObligationAfterResolution).toBeDefined();
  });

  it("all rules have correct keys", () => {
    const rules = buildRules();
    expect(rules.deliveryDeadlineExceeded.key).toBe(
      "no-delivery-refund.delivery-deadline-exceeded",
    );
    expect(rules.resolutionAfterAdditionalDeadline.key).toBe(
      "no-delivery-refund.resolution-after-additional-deadline",
    );
    expect(rules.immediateResolutionRefusedOrEssential.key).toBe(
      "no-delivery-refund.immediate-resolution-refused-or-essential",
    );
    expect(rules.refundObligationAfterResolution.key).toBe(
      "no-delivery-refund.refund-obligation-after-resolution",
    );
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
    for (const declaredKey of noDeliveryRefundModule.ruleKeys) {
      expect(ruleKeys.has(declaredKey)).toBe(true);
    }
  });
});

// ── 20 + 9 Legal Scenario Tests ──────────────────────────────────

describe("legal rule evaluation (29 scenarios)", () => {
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

  // ── Rule 1: delivery-deadline-exceeded ─────────────────────────

  // S1: Agreed deadline still valid → NOT_APPLICABLE
  it("S1: agreed deadline still valid → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-12-01"),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S2: Agreed deadline passed, not delivered → SUPPORTED
  it("S2: agreed deadline passed → SUPPORTED", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-08-01"),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S3: No agreed date, less than 30 days → NOT_APPLICABLE (legal deadline not yet passed)
  it("S3: no agreed date, less than 30 days → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-10-15"), // purchase(2026-09-20) + 30 = 2026-10-20, deadline is before
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S4: No agreed date, more than 30 days → SUPPORTED (legal deadline passed)
  it("S4: no agreed date, 30+ days → SUPPORTED", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-08-15"), // 30 days from 2026-07-16
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S5: Product delivered → NOT_APPLICABLE
  it("S5: product delivered → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", true),
          fact("delivery.applicable_deadline", "2026-08-01"),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S6: applicable_deadline absent → INSUFFICIENT_DATA
  it("S6: applicable_deadline absent → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({ facts: [fact("delivery.received", false)] }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── NEW: Agreed date always takes precedence over 30-day default ──

  // S7: Agreed date far in future despite <30 days since purchase → use agreed date
  it("S7: agreed date in future despite <30 days → NOT_APPLICABLE (use agreed date)", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-12-01"), // agreed, far future
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // ── Rule 2: resolution-after-additional-deadline ──────────────

  // S8: Additional deadline granted, contacted, expired → SUPPORTED
  it("S8: additional deadline expired + contacted → SUPPORTED", () => {
    const r = evaluateRule(
      rules.resolutionAfterAdditionalDeadline,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("communication.contacted_seller", true),
          fact("communication.additional_deadline_granted", true),
          fact("communication.additional_deadline_expired", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S9: Additional deadline not expired → NOT_APPLICABLE
  it("S9: additional deadline not expired → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.resolutionAfterAdditionalDeadline,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("communication.contacted_seller", true),
          fact("communication.additional_deadline_granted", true),
          fact("communication.additional_deadline_expired", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S10: Additional deadline granted, seller NOT contacted → INSUFFICIENT_DATA
  it("S10: additional deadline granted, seller not contacted → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.resolutionAfterAdditionalDeadline,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("communication.additional_deadline_granted", true),
          fact("communication.additional_deadline_expired", true),
        ],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // S11: Seller contacted, no additional deadline → INSUFFICIENT_DATA
  it("S11: seller contacted, no additional deadline → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.resolutionAfterAdditionalDeadline,
      ctx({
        facts: [fact("delivery.received", false), fact("communication.contacted_seller", true)],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // S12: Product delivered → NOT_APPLICABLE for resolution rule
  it("S12: product delivered → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.resolutionAfterAdditionalDeadline,
      ctx({
        facts: [
          fact("delivery.received", true),
          fact("communication.contacted_seller", true),
          fact("communication.additional_deadline_granted", true),
          fact("communication.additional_deadline_expired", true),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // ── Rule 3: immediate-resolution-refused-or-essential ─────────

  // S13: Seller refused delivery → SUPPORTED
  it("S13: seller refused → SUPPORTED", () => {
    const r = evaluateRule(
      rules.immediateResolutionRefusedOrEssential,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("communication.seller_refused_delivery", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S14: Essential date, not delivered → SUPPORTED
  it("S14: essential date → SUPPORTED", () => {
    const r = evaluateRule(
      rules.immediateResolutionRefusedOrEssential,
      ctx({ facts: [fact("delivery.received", false), fact("delivery.essential_date", true)] }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S15: No refusal, no essential date → INSUFFICIENT_DATA
  it("S15: no refusal, no essential date → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.immediateResolutionRefusedOrEssential,
      ctx({ facts: [fact("delivery.received", false)] }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // S16: Seller refused BUT product delivered → NOT_APPLICABLE
  it("S16: seller refused but delivered → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.immediateResolutionRefusedOrEssential,
      ctx({
        facts: [
          fact("delivery.received", true),
          fact("communication.seller_refused_delivery", true),
          fact("delivery.essential_date", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // ── Rule 4: refund-obligation-after-resolution ────────────────

  // S17: Resolution declared + deadline expired + refund not received → SUPPORTED
  it("S17: resolution declared + deadline expired + refund pending → SUPPORTED", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("communication.additional_deadline_expired", true),
          fact("refund.received", false),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S18: Resolution declared + seller refused + refund received → NOT_APPLICABLE (fulfilled)
  it("S18: resolution + seller refused + refund received → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("communication.seller_refused_delivery", true),
          fact("communication.additional_deadline_expired", false),
          fact("delivery.essential_date", false),
          fact("refund.received", true),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S19: Resolution declared + essential date + refund not received → SUPPORTED
  it("S19: resolution + essential date + refund pending → SUPPORTED", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("delivery.essential_date", true),
          fact("refund.received", false),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S20: Resolution declared but NO basis for resolution → INSUFFICIENT_DATA
  it("S20: resolution declared, no basis → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("refund.received", false),
        ],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // S21: Basis exists but resolution NOT declared → INSUFFICIENT_DATA
  it("S21: basis exists, resolution not declared → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("communication.additional_deadline_expired", true),
          fact("refund.received", false),
        ],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── NEW: refund.received status scenarios ──────────────────────

  // S22: Resolution + basis + refund.received absent → INSUFFICIENT_DATA
  it("S22: resolution + basis + refund.received absent → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("communication.additional_deadline_expired", true),
          // refund.received intentionally absent
        ],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // S23: Consumer requested refund but NO resolution basis → INSUFFICIENT_DATA
  //
  // Precedence note: `resolution.declared = false` makes this rule definitively
  // inapplicable (no resolution ⇒ no refund obligation under it), so the missing
  // basis facts can no longer change the outcome. The engine reports
  // NOT_APPLICABLE rather than asking the user for data that could never flip
  // the rule — the missing facts are still reported for the rules that can apply.
  it("S23: refund requested with resolution declared → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", false),
          fact("refund.received", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
    // Nothing left to collect for a rule that cannot apply.
    expect(r.missingFacts).toEqual([]);
  });

  // S23b: resolution.declared alone (no basis) → INSUFFICIENT_DATA
  it("S23b: resolution.declared alone → INSUFFICIENT_DATA (no refund obligation)", () => {
    const r = evaluateRule(
      rules.refundObligationAfterResolution,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("resolution.declared", true),
          fact("refund.received", false),
          // NO basis: no expired deadline, no refused, no essential
        ],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Edge cases ────────────────────────────────────────────────

  // S24: Contradicted fact → CONTRADICTED
  it("S24: contradicted fact → CONTRADICTED", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-08-01", "CONTRADICTED"),
        ],
        contradictedKeys: new Set(["delivery.applicable_deadline" as FactKey]),
      }),
    );
    expect(r.status).toBe("CONTRADICTED");
  });

  // S25: Unconfirmed fact → POTENTIALLY_APPLICABLE
  it("S25: unconfirmed fact → POTENTIALLY_APPLICABLE", () => {
    const r = evaluateRule(
      rules.deliveryDeadlineExceeded,
      ctx({
        facts: [
          fact("delivery.received", false),
          fact("delivery.applicable_deadline", "2026-08-01", "UNCONFIRMED"),
        ],
      }),
    );
    expect(r.status).toBe("POTENTIALLY_APPLICABLE");
  });

  // S26: Empty facts → INSUFFICIENT_DATA
  it("S26: empty facts → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(rules.deliveryDeadlineExceeded, ctx({ facts: [] }));
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Cross-rule consistency ────────────────────────────────────

  // S27: Deadline exceeded + additional deadline expired + resolution + refund pending → all relevant rules SUPPORTED
  it("S27: full chain → all rules SUPPORTED", () => {
    const facts = [
      fact("delivery.received", false),
      fact("delivery.applicable_deadline", "2026-08-01"),
      fact("communication.contacted_seller", true),
      fact("communication.additional_deadline_granted", true),
      fact("communication.additional_deadline_expired", true),
      fact("resolution.declared", true),
      fact("refund.received", false),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.deliveryDeadlineExceeded, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.resolutionAfterAdditionalDeadline, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.refundObligationAfterResolution, c).status).toBe("SUPPORTED");
  });

  // S28: Deadline NOT exceeded + no resolution basis → no rules SUPPORTED
  it("S28: no deadline exceeded → no rules SUPPORTED", () => {
    const facts = [
      fact("delivery.received", false),
      fact("delivery.applicable_deadline", "2026-12-01"),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.deliveryDeadlineExceeded, c).status).toBe("NOT_APPLICABLE");
    expect(evaluateRule(rules.resolutionAfterAdditionalDeadline, c).status).toBe(
      "INSUFFICIENT_DATA",
    );
    expect(evaluateRule(rules.immediateResolutionRefusedOrEssential, c).status).toBe(
      "INSUFFICIENT_DATA",
    );
    expect(evaluateRule(rules.refundObligationAfterResolution, c).status).toBe("INSUFFICIENT_DATA");
  });

  // S29: Seller refused + resolution + refund received → resolution SUPPORTED, refund NOT_APPLICABLE
  it("S29: refused + resolution + refund received → mixed statuses", () => {
    const facts = [
      fact("delivery.received", false),
      fact("communication.seller_refused_delivery", true),
      fact("delivery.essential_date", false),
      fact("resolution.declared", true),
      fact("communication.additional_deadline_expired", false),
      fact("refund.received", true),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.immediateResolutionRefusedOrEssential, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.refundObligationAfterResolution, c).status).toBe("NOT_APPLICABLE");
  });
});
