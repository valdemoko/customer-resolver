/**
 * How the report talks about missing data.
 *
 * The user saw a wall of repeated actions and, in one line, the raw key
 * `flight.compensation_tier` — a datum no one can answer. These tests pin the
 * three properties that fix it:
 *  1. every missing fact is described in words, never by its key;
 *  2. each one says which fact the person must actually answer;
 *  3. actions are collapsed, so four supported claims do not become four
 *     identical "Solicitar reembolso" steps.
 */
import { describe, expect, it } from "vitest";

import { deriveActions } from "@core/actions/engine";
import { buildResult } from "@core/result/engine";
import type { RuleEvaluation } from "@core/rules/types";
import type { Fact, FactKey } from "@core/types";

function fact(key: string, value: unknown, status: Fact["status"] = "CONFIRMED"): Fact {
  return {
    id: `f-${key}`,
    caseId: "case-1",
    key: key as FactKey,
    value: { type: "string", value } as Fact["value"],
    status,
    confidence: "USER",
    provenance: "USER_PROVIDED",
    evidenceRefs: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
  } as unknown as Fact;
}

function evaluation(
  ruleKey: string,
  missing: readonly string[],
  status: RuleEvaluation["status"] = "INSUFFICIENT_DATA",
): RuleEvaluation {
  return {
    ruleKey,
    ruleVersion: 1,
    status,
    traces: [],
    missingFacts: missing as FactKey[],
    contradictedFacts: [],
    evidenceRefs: [],
    sourceIds: [],
  } as unknown as RuleEvaluation;
}

const QUESTIONS = [
  {
    id: "q-dep",
    text: "¿De qué aeropuerto salía tu vuelo?",
    factKey: "flight.departure_airport",
    required: true,
    type: "string",
  },
  {
    id: "q-extra",
    text: "¿La aerolínea alegó circunstancias extraordinarias?",
    factKey: "airline.reason_is_extraordinary",
    required: false,
    type: "boolean",
  },
];

function build(missing: readonly string[], facts: readonly Fact[] = []) {
  return buildResult({
    caseId: "case-1",
    problemKey: "flight-cancel",
    evaluatedAt: "2026-09-01T00:00:00.000Z",
    engineVersion: "test",
    facts,
    evaluations: [evaluation("flight-cancel.compensation-amount", missing)],
    sources: [],
    questions: QUESTIONS,
    intakeComplete: false,
  });
}

describe("missing information", () => {
  it("describes a fact with the question that collects it", () => {
    const result = build(["airline.reason_is_extraordinary"]);
    const [item] = result.missingInformation;
    expect(item?.description).toBe("¿La aerolínea alegó circunstancias extraordinarias?");
    expect(item?.answerFactKey).toBe("airline.reason_is_extraordinary");
    expect(item?.answerType).toBe("boolean");
    expect(item?.kind).toBe("question");
    expect(item?.answerable).toBe(true);
    expect(item?.impact).toBe("required");
  });

  it("points a derived fact at an answerable input instead of itself", () => {
    const result = build(["flight.compensation_tier"]);
    const [item] = result.missingInformation;
    expect(item?.factKey).toBe("flight.compensation_tier");
    // Never the derived key: that is what the user cannot answer.
    expect(item?.answerFactKey).toBe("flight.departure_airport");
    expect(item?.answerable).toBe(true);
  });

  it("never shows a raw fact key when there is no question", () => {
    const result = build(["flight.compensation_tier"]);
    const [item] = result.missingInformation;
    expect(item?.description).not.toContain("flight.compensation_tier");
    expect(item?.description).toContain("aeropuerto");
  });

  it("explains instead of re-asking when the input is already answered", () => {
    // Both dates are on record, yet the notice period could not be computed:
    // asking "what was the flight date?" again would look broken.
    const result = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: [fact("flight.scheduled_date", "2026-08-10"), fact("cancellation.date", "2026-08-08")],
      evaluations: [
        evaluation("flight-cancel.notice-period-insufficient", ["cancellation.notice_days"]),
      ],
      sources: [],
      questions: [
        {
          id: "q-sched",
          text: "¿Cuál era la fecha programada del vuelo?",
          factKey: "flight.scheduled_date",
          required: true,
          type: "date",
        },
      ],
      intakeComplete: false,
    });

    const [item] = result.missingInformation;
    expect(item?.kind).toBe("review");
    expect(item?.description).toContain("No hemos podido calcular");
    expect(item?.answerFactKey).toBe("flight.scheduled_date");
  });

  it("groups the claims blocked by the same fact", () => {
    const result = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: [],
      evaluations: [
        evaluation("flight-cancel.compensation-amount", ["airline.reason_is_extraordinary"]),
        evaluation("flight-cancel.assistance-not-offered", ["airline.reason_is_extraordinary"]),
      ],
      sources: [],
      questions: QUESTIONS,
      intakeComplete: false,
    });

    expect(result.missingInformation).toHaveLength(1);
    expect(result.missingInformation[0]?.blockedClaims).toHaveLength(2);
  });
});

describe("action plan", () => {
  it("collapses the same action coming from several claims", () => {
    const result = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: [],
      evaluations: [
        evaluation("flight-cancel.flight-was-cancelled", [], "SUPPORTED"),
        evaluation("flight-cancel.reimbursement-entitlement", [], "SUPPORTED"),
        evaluation("flight-cancel.assistance-not-offered", [], "SUPPORTED"),
      ],
      sources: [],
      questions: QUESTIONS,
      intakeComplete: true,
    });

    const plan = deriveActions(result);
    const titles = plan.actions.map((a) => a.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.filter((t) => t === "Solicitar reembolso")).toHaveLength(1);
    expect(titles.filter((t) => t === "Presentar reclamación")).toHaveLength(1);
  });

  it("does not offer a step the person cannot carry out", () => {
    // A fact with no question must not become a "provide this" action.
    const result = build(["flight.compensation_tier"]);
    const plan = deriveActions(result);
    // Here the airport question exists, so the action IS actionable…
    expect(plan.actions.some((a) => a.type === "COLLECT_INFORMATION")).toBe(true);

    const unreachable = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: [],
      evaluations: [evaluation("flight-cancel.compensation-amount", ["fact.with.no.question"])],
      sources: [],
      questions: [],
      intakeComplete: false,
    });
    const unreachablePlan = deriveActions(unreachable);
    expect(unreachablePlan.actions.some((a) => a.type === "COLLECT_INFORMATION")).toBe(false);
    expect(unreachablePlan.complete).toBe(true);
  });

  it("keeps the next step short instead of listing every question", () => {
    const result = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: [],
      evaluations: [
        evaluation("flight-cancel.compensation-amount", [
          "airline.reason_is_extraordinary",
          "flight.departure_airport",
        ]),
      ],
      sources: [],
      questions: QUESTIONS,
      intakeComplete: false,
    });

    const plan = deriveActions(result);
    expect(plan.nextStep).toContain("2 datos");
    expect(plan.nextStep.length).toBeLessThan(200);
  });
});
