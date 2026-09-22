/**
 * Result Engine tests (Fase 7, spec §Testing).
 *
 * Tests the buildResult function against various scenarios:
 * - SUPPORTED: all facts confirmed, rule matches
 * - INSUFFICIENT_DATA: missing required facts
 * - CONTRADICTED: conflicting information
 * - POTENTIALLY_APPLICABLE: unconfirmed facts
 * - NOT_APPLICABLE: rule doesn't apply
 * - UNKNOWN: classification failure
 */
import { describe, expect, it } from "vitest";
import { buildResult, type BuildResultInput } from "@core/result/engine";
import type { Fact } from "@core/types";
import type { RuleEvaluation } from "@core/rules/types";
import type { SupportingSource } from "@core/result/types";

// ── Test Data ───────────────────────────────────────────────────────

function makeFact(overrides: Partial<Fact>): Fact {
  return {
    id: "fact-1" as Fact["id"],
    caseId: "case-1",
    key: "cancellation.date" as Fact["key"],
    value: {
      type: "date",
      value: "2026-09-03" as unknown as import("@core/shared/temporal").IsoDate,
    },
    provenance: "USER_PROVIDED",
    status: "CONFIRMED",
    confidence: "USER",
    evidenceRefs: [],
    createdAt: "2026-09-20T00:00:00Z" as Fact["createdAt"],
    updatedAt: "2026-09-20T00:00:00Z" as Fact["updatedAt"],
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<RuleEvaluation>): RuleEvaluation {
  return {
    ruleKey: "cancellation-charge.charge-after-cancellation",
    ruleVersion: 1 as unknown as import("@core/rules/types").RuleVersion,
    status: "SUPPORTED",
    traces: [],
    missingFacts: [],
    contradictedFacts: [],
    evidenceRefs: [],
    sourceIds: ["src:ley-3-2014"],
    ...overrides,
  };
}

function makeSource(overrides: Partial<SupportingSource>): SupportingSource {
  return {
    sourceId: "src:ley-3-2014",
    title: "Ley 3/2014",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-2014-33296",
    type: "law",
    retrievedAt: "2026-09-20",
    claim: "Derecho de desistimiento",
    ...overrides,
  };
}

const BASE_INPUT: BuildResultInput = {
  caseId: "case-1",
  problemKey: "cancellation-charge",
  evaluatedAt: "2026-09-20T00:00:00Z",
  engineVersion: "1.0.0",
  facts: [],
  evaluations: [],
  sources: [],
  questions: [],
  intakeComplete: true,
};

// ── Tests ───────────────────────────────────────────────────────────

describe("Result Engine — buildResult", () => {
  it("returns UNKNOWN when no evaluations exist", () => {
    const result = buildResult(BASE_INPUT);
    expect(result.overallStatus).toBe("UNKNOWN");
    expect(result.claims).toHaveLength(0);
    expect(result.summary).toContain("Análisis completado");
  });

  it("returns SUPPORTED when all evaluations are SUPPORTED", () => {
    const fact = makeFact({});
    const evaluation = makeEvaluation({ status: "SUPPORTED" });
    const source = makeSource({});

    const result = buildResult({
      ...BASE_INPUT,
      facts: [fact],
      evaluations: [evaluation],
      sources: [source],
    });

    expect(result.overallStatus).toBe("SUPPORTED");
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.status).toBe("SUPPORTED");
    expect(result.claims[0]?.assertion).toContain("cancelación");
    expect(result.disclaimers).toContain("Esta información no constituye asesoramiento legal.");
  });

  it("returns INSUFFICIENT_DATA when facts are missing", () => {
    const evaluation = makeEvaluation({
      status: "INSUFFICIENT_DATA",
      missingFacts: ["charge.date" as Fact["key"]],
    });

    const result = buildResult({
      ...BASE_INPUT,
      evaluations: [evaluation],
      questions: [
        { id: "q-charge-date", text: "¿Fecha del cargo?", factKey: "charge.date", required: true },
      ],
    });

    expect(result.overallStatus).toBe("INSUFFICIENT_DATA");
    expect(result.missingInformation).toHaveLength(1);
    expect(result.missingInformation[0]?.factKey).toBe("charge.date");
  });

  it("returns CONTRADICTED when facts conflict", () => {
    const evaluation = makeEvaluation({
      status: "CONTRADICTED",
      contradictedFacts: ["cancellation.date" as Fact["key"]],
    });

    const result = buildResult({
      ...BASE_INPUT,
      evaluations: [evaluation],
    });

    expect(result.overallStatus).toBe("CONTRADICTED");
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]?.factKey).toBe("cancellation.date");
  });

  it("returns POTENTIALLY_APPLICABLE when some facts are unconfirmed", () => {
    const fact = makeFact({ status: "UNCONFIRMED" });
    const evaluation = makeEvaluation({ status: "POTENTIALLY_APPLICABLE" });

    const result = buildResult({
      ...BASE_INPUT,
      facts: [fact],
      evaluations: [evaluation],
    });

    expect(result.overallStatus).toBe("POTENTIALLY_APPLICABLE");
    expect(result.claims[0]?.status).toBe("POTENTIALLY_APPLICABLE");
    expect(result.disclaimers).toContain(
      "Algunas conclusiones son provisionales y requieren confirmación adicional.",
    );
  });

  it("returns NOT_APPLICABLE when rule doesn't apply", () => {
    const evaluation = makeEvaluation({
      status: "NOT_APPLICABLE",
      notApplicableReason: "Jurisdiction mismatch",
    });

    const result = buildResult({
      ...BASE_INPUT,
      evaluations: [evaluation],
    });

    expect(result.overallStatus).toBe("NOT_APPLICABLE");
    expect(result.claims[0]?.status).toBe("NOT_APPLICABLE");
  });

  it("aggregates highest status from multiple claims", () => {
    const evaluations = [
      makeEvaluation({ ruleKey: "rule-1", status: "INSUFFICIENT_DATA" }),
      makeEvaluation({ ruleKey: "rule-2", status: "SUPPORTED" }),
    ];

    const result = buildResult({
      ...BASE_INPUT,
      evaluations,
    });

    // SUPPORTED (5) > INSUFFICIENT_DATA (2)
    expect(result.overallStatus).toBe("SUPPORTED");
    expect(result.claims).toHaveLength(2);
  });

  it("never invents sources — only uses provided sources", () => {
    const evaluation = makeEvaluation({
      status: "SUPPORTED",
      sourceIds: ["src:nonexistent"],
    });

    const result = buildResult({
      ...BASE_INPUT,
      evaluations: [evaluation],
      sources: [], // no sources provided
    });

    expect(result.sources).toHaveLength(0);
    expect(result.claims[0]?.supportingSources).toHaveLength(0);
  });

  it("reads the facts a rule actually used from its traces", () => {
    // Only the facts named in the traces belong to this conclusion; listing
    // every fact of the case made "en qué se basa" meaningless.
    const evaluation = makeEvaluation({
      status: "SUPPORTED",
      traces: [
        {
          kind: "FACT_EXISTS",
          key: "cancellation.date" as Fact["key"],
          matched: true,
          reason: "MATCHED",
        },
      ],
    });

    const result = buildResult({
      ...BASE_INPUT,
      facts: [
        makeFact({}),
        makeFact({ id: "fact-2" as Fact["id"], key: "charge.amount" as Fact["key"] }),
      ],
      evaluations: [evaluation],
    });

    expect(result.claims[0]?.supportingFacts.map((f) => f.factKey)).toEqual(["cancellation.date"]);
  });

  it("names the company the claim is against, with its contacts when known", () => {
    const withCompany = buildResult({
      ...BASE_INPUT,
      facts: [
        makeFact({
          key: "seller.name" as Fact["key"],
          value: { type: "string", value: "Vueling" },
        }),
      ],
    });
    expect(withCompany.company?.name).toBe("Vueling");
    expect(withCompany.company?.known).toBe(true);

    const withoutCompany = buildResult(BASE_INPUT);
    expect(withoutCompany.company).toBeNull();
  });

  it("preserves fact traceability", () => {
    const fact = makeFact({});
    const evaluation = makeEvaluation({ status: "SUPPORTED" });

    const result = buildResult({
      ...BASE_INPUT,
      facts: [fact],
      evaluations: [evaluation],
    });

    expect(result.claims[0]?.supportingFacts).toHaveLength(1);
    expect(result.claims[0]?.supportingFacts[0]?.factKey).toBe("cancellation.date");
  });
});
