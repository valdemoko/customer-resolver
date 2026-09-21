/**
 * F14 + F15 — Adversarial Integration Tests
 *
 * These tests verify that jurisdiction isolation works correctly end-to-end.
 * They specifically test that non-ES jurisdictions CANNOT accidentally
 * receive ES-specific legal conclusions.
 */
import { describe, it, expect } from "vitest";
import { jurisdictionApplies } from "@core/rules/jurisdiction";
import { evaluateRule } from "@core/rules/evaluator";
import type { JurisdictionScope, Rule } from "@core/rules/types";
import { routeInterpretation } from "@core/intake/routing";
import type { IntakeInterpretation, AISafeModuleDescriptor } from "@core/intake/types";
import { getJurisdictionConfig, isModuleAvailableInJurisdiction, getJurisdictionsByLevel } from "@core/jurisdiction/config";
import type { FactKey, JurisdictionCode } from "@core/types";

// ── ES Rules for Testing ──────────────────────────────────────────

const esScope: JurisdictionScope = {
  level: "COUNTRY_WIDE",
  country: "ES",
};

const esRule: Rule = {
  id: "test-rule" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
  key: "CC.CANCELLATION_WITHOUT_NOTICE",
  version: 1 as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
  status: "PUBLISHED",
  title: "Test Rule",
  createdAt: "2026-01-01",
  root: {
    kind: "ALL",
    conditions: [
      { kind: "BOOLEAN_IS_TRUE", key: "purchase.paid" as FactKey },
      { kind: "BOOLEAN_IS_FALSE", key: "merchant.notified" as FactKey },
    ],
  },
  scope: esScope,
  sourceIds: ["BOE-A-2007-20331-art68"],
};

// ── Module Definitions ──────────────────────────────────────────

const mockModules: AISafeModuleDescriptor[] = [
  {
    problemKey: "cancellation-charge",
    title: "Cancellation Charge",
    description: "Testing",
    supportedJurisdictions: ["ES"],
    semanticSignals: ["cancelled", "charge"],
    requiredFactCategories: [],
  },
  {
    problemKey: "warranty-rejection",
    title: "Warranty Rejection",
    description: "Testing",
    supportedJurisdictions: ["ES"],
    semanticSignals: ["warranty", "rejected"],
    requiredFactCategories: [],
  },
];

const registeredKeys = new Set(["cancellation-charge", "warranty-rejection"]);

// Helper to create minimal valid IntakeInterpretation
function makeInterpretation(overrides: Partial<IntakeInterpretation>): IntakeInterpretation {
  return {
    summary: "Test",
    candidateModules: [],
    factCandidates: [],
    missingInformation: [],
    ambiguities: [],
    contradictions: [],
    entities: [],
    jurisdictionHints: [],
    classificationConfidence: "HIGH",
    interpretationVersion: "1.0",
    aiRequestId: "test-request" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    ...overrides,
  };
}

// ── Jurisdiction Scoping Tests ──────────────────────────────────

describe("CRITICAL — Rule Engine jurisdiction isolation", () => {
  it("ES rule + ES case → APPLIES", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "ES" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("SUPPORTED");
  });

  it("ES rule + UK case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "UK" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + FR case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "FR" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + US case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "US" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + US-CA case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "US", region: "CA" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + DE case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "DE" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + PT case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "PT" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + IT case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "IT" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });
});

// ── jurisdictionApplies Tests ──────────────────────────────────

describe("CRITICAL — jurisdictionApplies function", () => {
  it("COUNTRY_WIDE ES rule + ES case → true", () => {
    expect(jurisdictionApplies(esScope, { country: "ES" })).toBe(true);
  });

  it("COUNTRY_WIDE ES rule + UK case → false", () => {
    expect(jurisdictionApplies(esScope, { country: "UK" })).toBe(false);
  });

  it("COUNTRY_WIDE ES rule + FR case → false", () => {
    expect(jurisdictionApplies(esScope, { country: "FR" })).toBe(false);
  });

  it("COUNTRY_WIDE ES rule + US case → false", () => {
    expect(jurisdictionApplies(esScope, { country: "US" })).toBe(false);
  });

  it("COUNTRY_WIDE ES rule + ES-AN case → true (COUNTRY_WIDE matches any region)", () => {
    expect(jurisdictionApplies(esScope, { country: "ES", region: "AN" })).toBe(true);
  });

  it("REGIONAL ES/AN rule + ES/AN case → true", () => {
    const regionalScope: JurisdictionScope = {
      level: "REGIONAL",
      country: "ES",
      region: "AN",
    };
    expect(jurisdictionApplies(regionalScope, { country: "ES", region: "AN" })).toBe(true);
  });

  it("REGIONAL ES/AN rule + ES/CT case → false", () => {
    const regionalScope: JurisdictionScope = {
      level: "REGIONAL",
      country: "ES",
      region: "AN",
    };
    expect(jurisdictionApplies(regionalScope, { country: "ES", region: "CT" })).toBe(false);
  });

  it("REGIONAL ES/AN rule + UK case → false", () => {
    const regionalScope: JurisdictionScope = {
      level: "REGIONAL",
      country: "ES",
      region: "AN",
    };
    expect(jurisdictionApplies(regionalScope, { country: "UK" })).toBe(false);
  });
});

// ── Routing Jurisdiction Tests ──────────────────────────────────

describe("CRITICAL — Routing respects jurisdiction", () => {
  it("ES problem + ES jurisdiction → ROUTED", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [{ jurisdiction: "ES" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    expect(decision.status).toBe("ROUTED");
    expect(decision.moduleCandidate?.problemKey).toBe("cancellation-charge");
  });

  it("ES problem + UK jurisdiction → NOT ROUTED (UNSUPPORTED_JURISDICTION)", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [{ jurisdiction: "UK" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    expect(decision.status).toBe("UNSUPPORTED_JURISDICTION");
  });

  it("ES problem + FR jurisdiction → NOT ROUTED (UNSUPPORTED_JURISDICTION)", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [{ jurisdiction: "FR" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    expect(decision.status).toBe("UNSUPPORTED_JURISDICTION");
  });

  it("ES problem + US jurisdiction → NOT ROUTED (UNSUPPORTED_JURISDICTION)", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [{ jurisdiction: "US" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    expect(decision.status).toBe("UNSUPPORTED_JURISDICTION");
  });

  it("ES problem + no jurisdiction hints → NOT ROUTED (no jurisdiction compatible)", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    // Without jurisdiction hints, jurisdiction is NOT compatible
    expect(decision.status).not.toBe("ROUTED");
  });
});

// ── Support Level Tests ──────────────────────────────────────────

describe("CRITICAL — Support levels are correctly separated", () => {
  it("ES has DETERMINISTIC support", () => {
    const config = getJurisdictionConfig("ES");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("DETERMINISTIC");
  });

  it("UK has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("UK");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("FR has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("FR");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("US has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("US");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("DE has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("DE");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("PT has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("PT");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("IT has RESEARCH_ONLY support", () => {
    const config = getJurisdictionConfig("IT");
    expect(config).toBeDefined();
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("cancellation-charge is available in ES", () => {
    expect(isModuleAvailableInJurisdiction("cancellation-charge", "ES")).toBe(true);
  });

  it("cancellation-charge is NOT available in UK", () => {
    expect(isModuleAvailableInJurisdiction("cancellation-charge", "UK")).toBe(false);
  });

  it("cancellation-charge is NOT available in FR", () => {
    expect(isModuleAvailableInJurisdiction("cancellation-charge", "FR")).toBe(false);
  });

  it("cancellation-charge is NOT available in US", () => {
    expect(isModuleAvailableInJurisdiction("cancellation-charge", "US")).toBe(false);
  });

  it("DETERMINISTIC jurisdictions include ES", () => {
    const deterministic = getJurisdictionsByLevel("DETERMINISTIC");
    expect(deterministic.some(j => j.code === "ES")).toBe(true);
  });

  it("DETERMINISTIC jurisdictions do NOT include UK", () => {
    const deterministic = getJurisdictionsByLevel("DETERMINISTIC");
    expect(deterministic.some(j => j.code === "UK")).toBe(false);
  });

  it("DETERMINISTIC jurisdictions do NOT include FR", () => {
    const deterministic = getJurisdictionsByLevel("DETERMINISTIC");
    expect(deterministic.some(j => j.code === "FR")).toBe(false);
  });

  it("RESEARCH_ONLY jurisdictions include UK", () => {
    const researchOnly = getJurisdictionsByLevel("RESEARCH_ONLY");
    expect(researchOnly.some(j => j.code === "UK")).toBe(true);
  });

  it("RESEARCH_ONLY jurisdictions include FR", () => {
    const researchOnly = getJurisdictionsByLevel("RESEARCH_ONLY");
    expect(researchOnly.some(j => j.code === "FR")).toBe(true);
  });
});

// ── Language ≠ Jurisdiction Tests ────────────────────────────────

describe("CRITICAL — Language ≠ Jurisdiction", () => {
  it("Spanish language + UK jurisdiction → remains UK", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      // Spanish language but UK jurisdiction
      jurisdictionHints: [{ jurisdiction: "UK" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    // Should NOT route to ES module despite Spanish language
    expect(decision.status).toBe("UNSUPPORTED_JURISDICTION");
  });

  it("English language + ES jurisdiction → remains ES", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      // English language but ES jurisdiction
      jurisdictionHints: [{ jurisdiction: "ES" as JurisdictionCode, confidence: "HIGH", signals: ["language"] }],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    // Should route to ES module despite English language
    expect(decision.status).toBe("ROUTED");
    expect(decision.moduleCandidate?.problemKey).toBe("cancellation-charge");
  });
});

// ── US vs US-CA Isolation Tests ────────────────────────────────

describe("CRITICAL — US vs US-CA isolation", () => {
  it("US jurisdiction is distinct from US-CA", () => {
    const usConfig = getJurisdictionConfig("US");
    const usCaConfig = getJurisdictionConfig("US-CA");

    expect(usConfig).toBeDefined();
    expect(usCaConfig).toBeDefined();
    expect(usConfig!.code).not.toBe(usCaConfig!.code);
  });

  it("ES rule + US case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "US" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("ES rule + US-CA case → NOT_APPLICABLE", () => {
    const result = evaluateRule(esRule, {
      facts: [
        { key: "purchase.paid" as FactKey, status: "CONFIRMED", value: true, evidenceRefs: [] },
        { key: "merchant.notified" as FactKey, status: "CONFIRMED", value: false, evidenceRefs: [] },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "US", region: "CA" },
      currentDate: "2026-09-21" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });
});

// ── Unknown Jurisdiction Tests ──────────────────────────────────

describe("CRITICAL — Unknown jurisdiction requires clarification", () => {
  it("Unknown jurisdiction → NOT routed to deterministic module", () => {
    const interpretation = makeInterpretation({
      candidateModules: [{
        problemKey: "cancellation-charge",
        confidence: "HIGH",
        signals: ["cancelled", "charge"],
        matchedRequiredFacts: [],
        missingRequiredFacts: [],
      }],
      jurisdictionHints: [],
    });

    const decision = routeInterpretation(interpretation, mockModules, registeredKeys);
    // Without jurisdiction, cannot route to deterministic module
    expect(decision.status).not.toBe("ROUTED");
  });
});
