/**
 * Action Engine tests (Fase 7, spec §Testing).
 *
 * Tests the deriveActions function:
 * - Actions derived correctly from claims
 * - No invented actions
 * - Actions blocked if prerequisites missing
 * - Next step determination
 * - Action plan completeness
 */
import { describe, expect, it } from "vitest";
import { deriveActions } from "@core/actions/engine";
import type { Result } from "@core/result/types";

// ── Test Data ───────────────────────────────────────────────────────

function makeResult(overrides: Partial<Result>): Result {
  return {
    caseId: "case-1",
    problemKey: "cancellation-charge",
    evaluatedAt: "2026-09-20T00:00:00Z" as unknown as import("@core/shared/temporal").IsoDateTime,
    engineVersion: "1.0.0",
    overallStatus: "UNKNOWN",
    summary: "Test summary",
    claims: [],
    missingInformation: [],
    contradictions: [],
    sources: [],
    disclaimers: [],
    channels: [],
    intakeComplete: true,
    ...overrides,
    company: overrides.company ?? null,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Action Engine — deriveActions", () => {
  it("returns empty plan when no claims exist", () => {
    const result = makeResult({});
    const plan = deriveActions(result);

    expect(plan.actions).toHaveLength(0);
    expect(plan.complete).toBe(true);
    expect(plan.nextStep).toContain("analizado");
  });

  it("derives REQUEST_REFUND for SUPPORTED claims", () => {
    const result = makeResult({
      overallStatus: "SUPPORTED",
      claims: [
        {
          id: "claim-1",
          ruleKey: "cancellation-charge.charge-after-cancellation",
          ruleVersion: 1,
          status: "SUPPORTED",
          assertion: "Cargo después de cancelación",
          explanation: "Confirmado",
          supportingFacts: [],
          supportingSources: [],
          missingFacts: [],
          contradictedFacts: [],
          ruleTraces: [],
        },
      ],
    });

    const plan = deriveActions(result);
    const refundActions = plan.actions.filter((a) => a.type === "REQUEST_REFUND");

    expect(refundActions.length).toBeGreaterThan(0);
    expect(refundActions[0]?.title).toContain("reembolso");
  });

  it("derives COLLECT_INFORMATION for INSUFFICIENT_DATA", () => {
    const result = makeResult({
      overallStatus: "INSUFFICIENT_DATA",
      missingInformation: [
        {
          factKey: "charge.date" as never,
          description: "Fecha del cargo",
          impact: "required",
          kind: "question",
          answerable: true,
          blockedClaims: ["rule-1"],
        },
      ],
    });

    const plan = deriveActions(result);
    const collectActions = plan.actions.filter((a) => a.type === "COLLECT_INFORMATION");

    expect(collectActions.length).toBeGreaterThan(0);
    expect(plan.complete).toBe(false);
  });

  it("derives PRESERVE_EVIDENCE for CONTRADICTED claims", () => {
    const result = makeResult({
      overallStatus: "CONTRADICTED",
      contradictions: [
        {
          factKey: "cancellation.date" as never,
          description: "Fechas contradictorias",
          conflictingValues: ["2026-09-03", "2026-09-10"],
          affectedClaims: ["rule-1"],
        },
      ],
    });

    const plan = deriveActions(result);
    const preserveActions = plan.actions.filter((a) => a.type === "PRESERVE_EVIDENCE");

    expect(preserveActions.length).toBeGreaterThan(0);
  });

  it("derives GENERATE_DOCUMENT for SUPPORTED claims", () => {
    const result = makeResult({
      overallStatus: "SUPPORTED",
      claims: [
        {
          id: "claim-1",
          ruleKey: "cancellation-charge.charge-after-cancellation",
          ruleVersion: 1,
          status: "SUPPORTED",
          assertion: "Cargo después de cancelación",
          explanation: "Confirmado",
          supportingFacts: [],
          supportingSources: [],
          missingFacts: [],
          contradictedFacts: [],
          ruleTraces: [],
        },
      ],
    });

    const plan = deriveActions(result);
    const docActions = plan.actions.filter((a) => a.type === "GENERATE_DOCUMENT");

    expect(docActions.length).toBeGreaterThan(0);
    expect(docActions[0]?.metadata?.templateId).toBe("reclamation-v1");
  });

  it("never invents actions — only derives from claims and missing info", () => {
    const result = makeResult({
      overallStatus: "NOT_APPLICABLE",
      claims: [
        {
          id: "claim-1",
          ruleKey: "some-rule",
          ruleVersion: 1,
          status: "NOT_APPLICABLE",
          assertion: "Not applicable",
          explanation: "Rule doesn't apply",
          supportingFacts: [],
          supportingSources: [],
          missingFacts: [],
          contradictedFacts: [],
          ruleTraces: [],
        },
      ],
    });

    const plan = deriveActions(result);

    // NOT_APPLICABLE should not generate REQUEST_REFUND or GENERATE_DOCUMENT
    const refundActions = plan.actions.filter((a) => a.type === "REQUEST_REFUND");
    const docActions = plan.actions.filter((a) => a.type === "GENERATE_DOCUMENT");

    expect(refundActions).toHaveLength(0);
    expect(docActions).toHaveLength(0);
  });

  it("determines next step based on missing information", () => {
    const result = makeResult({
      missingInformation: [
        {
          factKey: "charge.date" as never,
          description: "Fecha del cargo",
          impact: "required",
          kind: "question",
          answerable: true,
          blockedClaims: ["rule-1"],
        },
      ],
    });

    const plan = deriveActions(result);

    expect(plan.nextStep).toContain("Fecha del cargo");
    expect(plan.complete).toBe(false);
  });

  it("determines next step based on contradictions", () => {
    const result = makeResult({
      contradictions: [
        {
          factKey: "cancellation.date" as never,
          description: "Fechas contradictorias",
          conflictingValues: ["2026-09-03", "2026-09-10"],
          affectedClaims: ["rule-1"],
        },
      ],
    });

    const plan = deriveActions(result);

    expect(plan.nextStep).toContain("contradictoria");
  });

  it("marks plan as complete when no required information is missing", () => {
    const result = makeResult({
      missingInformation: [
        {
          factKey: "optional-fact" as never,
          description: "Optional info",
          impact: "recommended",
          kind: "question",
          answerable: true,
          blockedClaims: [],
        },
      ],
    });

    const plan = deriveActions(result);

    expect(plan.complete).toBe(true);
  });

  it("actions are sorted by priority", () => {
    const result = makeResult({
      overallStatus: "SUPPORTED",
      claims: [
        {
          id: "claim-1",
          ruleKey: "cancellation-charge.charge-after-cancellation",
          ruleVersion: 1,
          status: "SUPPORTED",
          assertion: "Test",
          explanation: "Test",
          supportingFacts: [],
          supportingSources: [],
          missingFacts: [],
          contradictedFacts: [],
          ruleTraces: [],
        },
      ],
    });

    const plan = deriveActions(result);

    // Check that priorities are in ascending order
    for (let i = 1; i < plan.actions.length; i++) {
      expect(plan.actions[i]!.priority).toBeGreaterThanOrEqual(plan.actions[i - 1]!.priority);
    }
  });
});
