/**
 * warranty-rejection module tests (Fase 8.2 — APPROVED FOR IMPLEMENTATION).
 *
 * Covers:
 * - Module definition integrity
 * - Fact catalogue integrity
 * - Rule building (6 rules, all PUBLISHED)
 * - 22 legal scenario tests
 * - Edge cases: contradictions, unconfirmed facts, empty facts
 * - Anti-hallucination tests: AI extraction ≠ confirmed fact
 */
import { describe, expect, it } from "vitest";
import { ProblemRegistry } from "@core/problems";
import type { FactKey } from "@core/types";
import { evaluateRule, type RuleEvaluationContext } from "@core/rules";
import { isoDate } from "@core/shared/temporal";
import { MODULE_KEY, MODULE_VERSION, warrantyRejectionModule } from "@problems/warranty-rejection";
import { buildRules } from "@problems/warranty-rejection/rules";

// ── Module Definition ──────────────────────────────────────────────

describe("warranty-rejection module definition", () => {
  it("has the correct key and version", () => {
    expect(warrantyRejectionModule.key).toBe(MODULE_KEY);
    expect(warrantyRejectionModule.version).toBe(MODULE_VERSION);
    expect(MODULE_VERSION).toBe(1);
  });

  it("targets Spain with es-ES locale", () => {
    expect(warrantyRejectionModule.jurisdictions).toEqual(["ES"]);
    expect(warrantyRejectionModule.locales).toEqual(["es-ES"]);
  });

  it("can be registered in the ProblemRegistry", () => {
    const registry = new ProblemRegistry();
    registry.register(warrantyRejectionModule);
    expect(registry.has(MODULE_KEY)).toBe(true);
  });

  it("rejects duplicate registration", () => {
    const registry = new ProblemRegistry();
    registry.register(warrantyRejectionModule);
    expect(() => registry.register(warrantyRejectionModule)).toThrow(/already registered/);
  });

  it("has a title and description", () => {
    expect(warrantyRejectionModule.title).toBeTruthy();
    expect(warrantyRejectionModule.description).toBeTruthy();
  });

  it("declares 6 rule keys", () => {
    expect(warrantyRejectionModule.ruleKeys).toHaveLength(6);
  });
});

// ── Fact Catalogue Integrity ───────────────────────────────────────

describe("warranty-rejection fact catalogue", () => {
  it("every intake question maps to an existing fact key", () => {
    const catalogueKeys = new Set(warrantyRejectionModule.factCatalogue.map((f) => f.key));
    for (const question of warrantyRejectionModule.intake) {
      expect(catalogueKeys.has(question.factKey)).toBe(true);
    }
  });

  it("every required fact has an intake question", () => {
    const requiredFacts = warrantyRejectionModule.factCatalogue.filter((f) => f.required);
    for (const fact of requiredFacts) {
      expect(warrantyRejectionModule.intake.some((q) => q.factKey === fact.key)).toBe(true);
    }
  });

  it("has exactly 3 required facts", () => {
    const required = warrantyRejectionModule.factCatalogue.filter((f) => f.required);
    expect(required).toHaveLength(3);
    expect(required.map((f) => f.key)).toEqual([
      "nonconformity.description",
      "seller.response_received",
      "seller.rejection",
    ]);
  });

  it("has derived facts in the catalogue", () => {
    const keys = new Set(warrantyRejectionModule.factCatalogue.map((f) => f.key));
    expect(keys.has("compliance.current_date" as FactKey)).toBe(true);
    expect(keys.has("compliance.responsibility_deadline" as FactKey)).toBe(true);
    expect(keys.has("compliance.presumption_deadline" as FactKey)).toBe(true);
    expect(keys.has("compliance.after_repair_deadline" as FactKey)).toBe(true);
  });

  it("has all 6 rule keys declared in the module", () => {
    const expected = [
      "warranty-rejection.seller-rejected-within-period",
      "warranty-rejection.presumption-applies",
      "warranty-rejection.no-remedy-offered",
      "warranty-rejection.repair-failed-or-defect-recurred",
      "warranty-rejection.seller-claims-expired",
      "warranty-rejection.seller-declares-wont-repair",
    ];
    expect(warrantyRejectionModule.ruleKeys).toEqual(expected);
  });
});

// ── Rule Building ──────────────────────────────────────────────────

describe("warranty-rejection rules", () => {
  it("builds all 6 rules successfully", () => {
    const rules = buildRules();
    expect(rules.sellerRejectedWithinPeriod).toBeDefined();
    expect(rules.presumptionApplies).toBeDefined();
    expect(rules.noRemedyOffered).toBeDefined();
    expect(rules.repairFailedOrDefectRecurred).toBeDefined();
    expect(rules.sellerClaimsExpired).toBeDefined();
    expect(rules.sellerDeclaresWontRepair).toBeDefined();
  });

  it("all rules have correct keys", () => {
    const rules = buildRules();
    expect(rules.sellerRejectedWithinPeriod.key).toBe(
      "warranty-rejection.seller-rejected-within-period",
    );
    expect(rules.presumptionApplies.key).toBe("warranty-rejection.presumption-applies");
    expect(rules.noRemedyOffered.key).toBe("warranty-rejection.no-remedy-offered");
    expect(rules.repairFailedOrDefectRecurred.key).toBe(
      "warranty-rejection.repair-failed-or-defect-recurred",
    );
    expect(rules.sellerClaimsExpired.key).toBe("warranty-rejection.seller-claims-expired");
    expect(rules.sellerDeclaresWontRepair.key).toBe(
      "warranty-rejection.seller-declares-wont-repair",
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
    for (const declaredKey of warrantyRejectionModule.ruleKeys) {
      expect(ruleKeys.has(declaredKey)).toBe(true);
    }
  });

  it("all rules have scope ES_COUNTRY_WIDE", () => {
    const rules = buildRules();
    for (const rule of Object.values(rules)) {
      expect(rule.scope).toEqual({ level: "COUNTRY_WIDE", country: "ES" });
    }
  });
});

// ── 22 Legal Scenario Tests ────────────────────────────────────────

describe("legal rule evaluation (22+ scenarios)", () => {
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

  // ── Rule 1: seller-rejected-within-period ─────────────────────

  // S1: Defect within 3 years, within 2-year presumption
  it("S1: defect within 3 years → SUPPORTED", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.responsibility_deadline", "2026-12-01"), // in the future
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S2: Defect after 3 years → NOT_APPLICABLE
  it("S2: defect after 3 years → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.responsibility_deadline", "2026-01-01"), // in the past
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S3: No rejection → NOT_APPLICABLE
  it("S3: no seller rejection → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [fact("seller.rejection", false), fact("compliance.responsibility_deadline", "2026-12-01")],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S4: Missing deadline → INSUFFICIENT_DATA
  it("S4: missing delivery date → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({ facts: [fact("seller.rejection", true)] }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Rule 2: presumption-applies ──────────────────────────────

  // S5: Within 2-year presumption → SUPPORTED
  it("S5: within 2 years → SUPPORTED", () => {
    const r = evaluateRule(
      rules.presumptionApplies,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.presumption_deadline", "2026-12-01"), // in the future
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S6: After 2 years → NOT_APPLICABLE
  it("S6: after 2 years → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.presumptionApplies,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.presumption_deadline", "2026-01-01"), // in the past
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S7: No rejection → NOT_APPLICABLE
  it("S7: no rejection → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.presumptionApplies,
      ctx({
        facts: [fact("seller.rejection", false), fact("compliance.presumption_deadline", "2026-12-01")],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S8: Missing deadline → INSUFFICIENT_DATA
  it("S8: missing delivery date → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.presumptionApplies,
      ctx({ facts: [fact("seller.rejection", true)] }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Rule 3: no-remedy-offered ───────────────────────────────

  // S9: Rejected, no remedy offered → SUPPORTED
  it("S9: rejected without remedy → SUPPORTED", () => {
    const r = evaluateRule(
      rules.noRemedyOffered,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.offered_repair", false),
          fact("seller.offered_replacement", false),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S10: Rejected, repair offered → NOT_APPLICABLE
  it("S10: rejected but repair offered → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.noRemedyOffered,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.offered_repair", true),
          fact("seller.offered_replacement", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S11: Rejected, replacement offered → NOT_APPLICABLE
  it("S11: rejected but replacement offered → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.noRemedyOffered,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.offered_repair", false),
          fact("seller.offered_replacement", true),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S12: No rejection → NOT_APPLICABLE
  it("S12: no rejection → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.noRemedyOffered,
      ctx({
        facts: [
          fact("seller.rejection", false),
          fact("seller.offered_repair", false),
          fact("seller.offered_replacement", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S13: Missing offered_repair → INSUFFICIENT_DATA
  it("S13: missing remedy info → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.noRemedyOffered,
      ctx({
        facts: [fact("seller.rejection", true)],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Rule 4: repair-failed-or-defect-recurred ────────────────

  // S14: Repair completed + failed → SUPPORTED
  it("S14: repair failed → SUPPORTED", () => {
    const r = evaluateRule(
      rules.repairFailedOrDefectRecurred,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("repair.completed", true),
          fact("repair.failed", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S15: Repair completed + defect recurred → SUPPORTED
  it("S15: defect recurred → SUPPORTED", () => {
    const r = evaluateRule(
      rules.repairFailedOrDefectRecurred,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("repair.completed", true),
          fact("repair.defect_recurred", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S16: Repair completed, no failure, no recurrence → NOT_APPLICABLE
  it("S16: repair succeeded, no recurrence → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.repairFailedOrDefectRecurred,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("repair.completed", true),
          fact("repair.failed", false),
          fact("repair.defect_recurred", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // S17: No repair attempted → INSUFFICIENT_DATA
  it("S17: no repair attempted → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(
      rules.repairFailedOrDefectRecurred,
      ctx({
        facts: [fact("seller.rejection", true)],
      }),
    );
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Rule 5: seller-claims-expired ───────────────────────────

  // S18: Seller claims expired → SUPPORTED
  it("S18: seller claims expired → SUPPORTED", () => {
    const r = evaluateRule(
      rules.sellerClaimsExpired,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.claimed_warranty_expired", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S19: Seller did not claim expired → NOT_APPLICABLE
  it("S19: no expiry claim → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerClaimsExpired,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.claimed_warranty_expired", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // ── Rule 6: seller-declares-wont-repair ─────────────────────

  // S20: Seller declares won't repair → SUPPORTED
  it("S20: declares won't repair → SUPPORTED", () => {
    const r = evaluateRule(
      rules.sellerDeclaresWontRepair,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.declared_wont_repair", true),
        ],
      }),
    );
    expect(r.status).toBe("SUPPORTED");
  });

  // S21: Seller did not declare → NOT_APPLICABLE
  it("S21: no declaration → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerDeclaresWontRepair,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("seller.declared_wont_repair", false),
        ],
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  // ── Edge cases ──────────────────────────────────────────────

  // S22: Contradicted fact → CONTRADICTED
  it("S22: contradicted deadline → CONTRADICTED", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.responsibility_deadline", "2026-12-01", "CONTRADICTED"),
        ],
        contradictedKeys: new Set(["compliance.responsibility_deadline" as FactKey]),
      }),
    );
    expect(r.status).toBe("CONTRADICTED");
  });

  // S23: Unconfirmed fact → POTENTIALLY_APPLICABLE
  it("S23: unconfirmed deadline → POTENTIALLY_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.responsibility_deadline", "2026-12-01", "UNCONFIRMED"),
        ],
      }),
    );
    expect(r.status).toBe("POTENTIALLY_APPLICABLE");
  });

  // S24: Empty facts → INSUFFICIENT_DATA
  it("S24: empty facts → INSUFFICIENT_DATA", () => {
    const r = evaluateRule(rules.sellerRejectedWithinPeriod, ctx({ facts: [] }));
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });

  // ── Cross-rule consistency ──────────────────────────────────

  // S25: Full chain: rejected within period + presumption applies + no remedy
  it("S25: full chain → multiple rules SUPPORTED", () => {
    const facts = [
      fact("seller.rejection", true),
      fact("compliance.responsibility_deadline", "2026-12-01"),
      fact("compliance.presumption_deadline", "2026-12-01"),
      fact("seller.offered_repair", false),
      fact("seller.offered_replacement", false),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.sellerRejectedWithinPeriod, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.presumptionApplies, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.noRemedyOffered, c).status).toBe("SUPPORTED");
  });

  // S26: After period, seller claims expired, offers repair → mixed
  it("S26: expired + claims expired + offers repair → mixed statuses", () => {
    const facts = [
      fact("seller.rejection", true),
      fact("compliance.responsibility_deadline", "2026-01-01"), // expired
      fact("compliance.presumption_deadline", "2026-01-01"), // expired
      fact("seller.claimed_warranty_expired", true),
      fact("seller.offered_repair", true),
      fact("seller.offered_replacement", false),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.sellerRejectedWithinPeriod, c).status).toBe("NOT_APPLICABLE");
    expect(evaluateRule(rules.presumptionApplies, c).status).toBe("NOT_APPLICABLE");
    expect(evaluateRule(rules.sellerClaimsExpired, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.noRemedyOffered, c).status).toBe("NOT_APPLICABLE");
  });

  // S27: Repair failed + defect recurred + seller declares won't repair
  it("S27: repair failed + recurred + won't repair → multiple SUPPORTED", () => {
    const facts = [
      fact("seller.rejection", true),
      fact("repair.completed", true),
      fact("repair.failed", false),
      fact("repair.defect_recurred", true),
      fact("seller.declared_wont_repair", true),
    ];
    const c = ctx({ facts });
    expect(evaluateRule(rules.repairFailedOrDefectRecurred, c).status).toBe("SUPPORTED");
    expect(evaluateRule(rules.sellerDeclaresWontRepair, c).status).toBe("SUPPORTED");
  });

  // S28: Wrong jurisdiction → NOT_APPLICABLE
  it("S28: wrong jurisdiction → NOT_APPLICABLE", () => {
    const r = evaluateRule(
      rules.sellerRejectedWithinPeriod,
      ctx({
        facts: [
          fact("seller.rejection", true),
          fact("compliance.responsibility_deadline", "2026-12-01"),
        ],
        jurisdiction: { country: "PT" },
      }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });
});

// ── Anti-Hallucination Tests ──────────────────────────────────────

describe("anti-hallucination: AI extraction ≠ confirmed fact", () => {
  it("UNCONFIRMED fact from AI extraction caps rule at POTENTIALLY_APPLICABLE", () => {
    const rules = buildRules();
    const context: RuleEvaluationContext = {
      facts: [
        {
          key: "seller.rejection" as FactKey,
          value: true,
          status: "UNCONFIRMED",
          evidenceRefs: [],
        },
        {
          key: "compliance.responsibility_deadline" as FactKey,
          value: "2026-12-01",
          status: "CONFIRMED",
          evidenceRefs: [],
        },
        {
          key: "seller.offered_repair" as FactKey,
          value: false,
          status: "UNCONFIRMED",
          evidenceRefs: [],
        },
        {
          key: "seller.offered_replacement" as FactKey,
          value: false,
          status: "UNCONFIRMED",
          evidenceRefs: [],
        },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "ES" },
      currentDate: isoDate("2026-09-20"),
    };

    // Condition is met but seller.rejection is UNCONFIRMED → POTENTIALLY_APPLICABLE
    const r = evaluateRule(rules.sellerRejectedWithinPeriod, context);
    expect(r.status).toBe("POTENTIALLY_APPLICABLE");
  });

  it("CONTRADICTED fact blocks the rule entirely", () => {
    const rules = buildRules();
    const context: RuleEvaluationContext = {
      facts: [
        {
          key: "seller.rejection" as FactKey,
          value: true,
          status: "CONFIRMED",
          evidenceRefs: [],
        },
        {
          key: "compliance.responsibility_deadline" as FactKey,
          value: "2026-12-01",
          status: "CONTRADICTED",
          evidenceRefs: [],
        },
      ],
      contradictedKeys: new Set(["compliance.responsibility_deadline" as FactKey]),
      jurisdiction: { country: "ES" },
      currentDate: isoDate("2026-09-20"),
    };

    const r = evaluateRule(rules.sellerRejectedWithinPeriod, context);
    expect(r.status).toBe("CONTRADICTED");
  });

  it("seller rejection = true does NOT automatically mean any rule passes", () => {
    const rules = buildRules();
    const context: RuleEvaluationContext = {
      facts: [
        { key: "seller.rejection" as FactKey, value: true, status: "CONFIRMED", evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "ES" },
      currentDate: isoDate("2026-09-20"),
    };

    // Rules 1, 2 need delivery date → INSUFFICIENT_DATA
    expect(evaluateRule(rules.sellerRejectedWithinPeriod, context).status).toBe("INSUFFICIENT_DATA");
    expect(evaluateRule(rules.presumptionApplies, context).status).toBe("INSUFFICIENT_DATA");

    // Rules 3 needs offered_repair and offered_replacement → INSUFFICIENT_DATA
    expect(evaluateRule(rules.noRemedyOffered, context).status).toBe("INSUFFICIENT_DATA");

    // Rules 4 needs repair.completed → INSUFFICIENT_DATA
    expect(evaluateRule(rules.repairFailedOrDefectRecurred, context).status).toBe("INSUFFICIENT_DATA");

    // Rules 5, 6 need their specific boolean facts → INSUFFICIENT_DATA
    expect(evaluateRule(rules.sellerClaimsExpired, context).status).toBe("INSUFFICIENT_DATA");
    expect(evaluateRule(rules.sellerDeclaresWontRepair, context).status).toBe("INSUFFICIENT_DATA");
  });

  it("a rejected warranty does NOT automatically imply defect or non-conformity", () => {
    // The system never claims 'defect exists' — only evaluates time periods
    // and seller response facts. The rules never check nonconformity.description.
    const rules = buildRules();
    for (const rule of Object.values(rules)) {
      // None of the rules reference nonconformity.description as a condition
      const hasDefectFact =
        rule.root.kind === "ALL" || rule.root.kind === "ANY"
          ? JSON.stringify(rule.root).includes("nonconformity.description")
          : false;
      expect(hasDefectFact).toBe(false);
    }
  });

  it("a defect description does NOT automatically imply right to refund", () => {
    // None of our rules mention refund or resolution as automatic outcomes.
    // Rules report factual positions, not legal conclusions.
    const rules = buildRules();
    for (const rule of Object.values(rules)) {
      const ruleStr = JSON.stringify(rule);
      // No rule asserts 'right to refund' or 'right to resolution'
      expect(ruleStr).not.toMatch(/derecho a reembolso/i);
      expect(ruleStr).not.toMatch(/derecho a resolución/i);
    }
  });
});
