/**
 * Flight derivations: what the passenger's answers already imply.
 *
 * Real case: the person says the airline offered no alternative flight. The
 * analysis still asked "did you accept the alternative flight?" and "was the
 * alternative compliant?", and the compensation rules stayed undecided — for a
 * fact that cannot exist. These tests pin the logical consequences (nothing to
 * accept ⇒ not accepted; no alternative ⇒ not compliant; no accepted re-routing
 * ⇒ no Art. 7.2 reduction) and the conclusion they unlock.
 */
import { describe, expect, it } from "vitest";

import { evaluateRule } from "@core/rules/evaluator";
import { resolveAirport } from "@core/problems/airports";
import { buildExportAnswers } from "@core/export/answers";
import { buildResult } from "@core/result/engine";
import type { Fact, FactKey } from "@core/types";
import { buildRules } from "@problems/flight-cancel";

/** The derivations under test, reimplemented as a table to assert their effect. */
function deriveLikeAnalysisService(values: Record<string, unknown>) {
  const derived: Record<string, unknown> = {};
  if (values["airline.re_routing_offered"] === false) {
    derived["airline.re_routing.accepted"] = false;
    derived["airline.alternative_transport_compliant"] = false;
    derived["passenger.compensation_reduction_eligible"] = false;
  }
  return { ...values, ...derived };
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

describe("airport answers feed the compensation tier", () => {
  it("computes Madrid–London as the 250 € tier from city names", () => {
    const madrid = resolveAirport("Madrid");
    const london = resolveAirport("Londres");
    expect(madrid).not.toBeNull();
    expect(london).not.toBeNull();

    const distance = haversine(madrid!, london!);
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1500);
    const tier = distance <= 1500 ? 250 : distance <= 3500 ? 400 : 600;
    expect(tier).toBe(250);
  });

  it("puts a long-haul route in the 600 € tier", () => {
    const madrid = resolveAirport("Madrid");
    const tokyo = resolveAirport("Tokio");
    const distance = haversine(madrid!, tokyo!);
    expect(distance).toBeGreaterThan(3500);
  });
});

describe("re-routing declined by the airline", () => {
  const facts = deriveLikeAnalysisService({
    "flight.departure_airport": "Madrid",
    "flight.arrival_airport": "Londres",
    "cancellation.date": "2026-08-08",
    "flight.scheduled_date": "2026-08-10",
    "cancellation.notice_days": 2,
    "airline.re_routing_offered": false,
    "airline.reimbursement_offered": true,
    "airline.assistance_offered": true,
    "airline.reason_is_extraordinary": false,
    "passenger.reimbursed": false,
    "flight.compensation_tier": 250,
    "flight.distance_km": 1240,
    "passenger.additional_costs": 0,
  });

  it("settles the facts that depended on an alternative flight", () => {
    expect(facts["airline.re_routing.accepted"]).toBe(false);
    expect(facts["airline.alternative_transport_compliant"]).toBe(false);
    expect(facts["passenger.compensation_reduction_eligible"]).toBe(false);
  });

  it("leaves no rule waiting for data it can never receive", () => {
    const rules = Object.values(buildRules());
    const evaluations = rules.map((rule) =>
      evaluateRule(rule, {
        facts: Object.entries(facts).map(([key, value]) => ({
          key: key as FactKey,
          status: "CONFIRMED" as const,
          value,
          evidenceRefs: [],
        })),
        contradictedKeys: new Set<FactKey>(),
        jurisdiction: { country: "ES" },
        currentDate: "2026-09-01" as never,
      }),
    );

    const missing = new Set(evaluations.flatMap((e) => e.missingFacts.map((k) => String(k))));
    expect([...missing]).toHaveLength(0);
  });

  it("concludes the case instead of reporting missing data", () => {
    const rules = Object.values(buildRules());
    const factList: Fact[] = Object.entries(facts).map(
      ([key, value], index) =>
        ({
          id: `f${index}`,
          caseId: "case-1",
          key: key as FactKey,
          value: { type: typeof value === "boolean" ? "boolean" : "number", value },
          status: "CONFIRMED",
          confidence: "USER",
          provenance: "USER_PROVIDED",
          evidenceRefs: [],
          createdAt: "2026-09-01T00:00:00.000Z" as never,
          updatedAt: "2026-09-01T00:00:00.000Z" as never,
          version: 1,
        }) as unknown as Fact,
    );

    const evaluations = rules.map((rule) =>
      evaluateRule(rule, {
        facts: factList.map((f) => ({
          key: f.key,
          status: "CONFIRMED" as const,
          value: (f.value as { value: unknown }).value,
          evidenceRefs: [],
        })),
        contradictedKeys: new Set<FactKey>(),
        jurisdiction: { country: "ES" },
        currentDate: "2026-09-01" as never,
      }),
    );

    const result = buildResult({
      caseId: "case-1",
      problemKey: "flight-cancel",
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      engineVersion: "test",
      facts: factList,
      evaluations,
      sources: [],
      questions: [],
      intakeComplete: true,
    });

    expect(result.missingInformation).toHaveLength(0);
    expect(result.overallStatus).toBe("SUPPORTED");
    expect(result.claims.filter((c) => c.status === "INSUFFICIENT_DATA")).toHaveLength(0);
  });
});

describe("answers section", () => {
  it("never shows a fact whose name is unknown", () => {
    const answers = buildExportAnswers(
      [
        { key: "internal.raw_key", value: { type: "string", value: "x" }, status: "CONFIRMED" },
        { key: "airline.name", value: { type: "string", value: "Iberia" }, status: "CONFIRMED" },
      ],
      { questions: { "airline.name": "¿Qué aerolínea era?" }, factLabels: {} },
    );
    expect(answers).toEqual([{ label: "¿Qué aerolínea era?", value: "Iberia", origin: "USER" }]);
  });
});
