import { describe, expect, it } from "vitest";

import { evaluateRule } from "@core/rules/evaluator";
import { createRule } from "@core/rules/factory";
import type { Condition, Rule, RuleEvaluationContext } from "@core/rules/types";
import type { FactKey } from "@core/types";
import { isoDate } from "@core/shared/temporal";

// TEST FIXTURES — artificial rules, no legal meaning
const key = (k: string) => k as FactKey;

function ctx(overrides?: Partial<RuleEvaluationContext>): RuleEvaluationContext {
  return {
    facts: [],
    contradictedKeys: new Set(),
    jurisdiction: { country: "XX" },
    currentDate: isoDate("2026-09-19"),
    ...overrides,
  };
}

function rule(root: Condition, overrides?: Partial<Parameters<typeof createRule>[0]>): Rule {
  return createRule({
    key: "test.rule",
    version: 1 as Rule["version"],
    title: "TEST FIXTURE RULE — NOT LEGAL DATA",
    scope: { level: "COUNTRY_WIDE", country: "XX" },
    root,
    sourceIds: [],
    ...overrides,
  });
}

const fact = (
  k: string,
  value: unknown,
  status: "CONFIRMED" | "UNCONFIRMED" = "CONFIRMED",
  evidenceRefs: string[] = [],
) => ({
  key: key(k),
  status,
  value,
  evidenceRefs,
});

describe("atomic conditions", () => {
  it("FACT_EXISTS: present matches; missing does not", () => {
    const r = rule({ kind: "FACT_EXISTS", key: key("a.b") });
    expect(evaluateRule(r, ctx({ facts: [fact("a.b", "x")] })).status).toBe("SUPPORTED");
    const missing = evaluateRule(r, ctx());
    expect(missing.status).toBe("INSUFFICIENT_DATA"); // missing ≠ false
    expect(missing.missingFacts).toEqual([key("a.b")]);
  });

  it("FACT_EQUALS / FACT_NOT_EQUALS with actual vs expected in trace", () => {
    const r = rule({ kind: "FACT_EQUALS", key: key("a.b"), equals: "hola" });
    expect(evaluateRule(r, ctx({ facts: [fact("a.b", "hola")] })).status).toBe("SUPPORTED");
    const failed = evaluateRule(r, ctx({ facts: [fact("a.b", "adios")] }));
    expect(failed.status).toBe("NOT_APPLICABLE"); // evaluated false, nothing missing
    expect(failed.traces[0]!.children?.[0] ?? failed.traces[0]).toMatchObject({
      reason: "NOT_MATCHED",
      actual: "adios",
      expected: "hola",
    });
    const neq = rule({ kind: "FACT_NOT_EQUALS", key: key("a.b"), notEquals: "hola" });
    expect(evaluateRule(neq, ctx({ facts: [fact("a.b", "adios")] })).status).toBe("SUPPORTED");
  });

  it("numeric comparisons", () => {
    const gt = rule({ kind: "FACT_GREATER_THAN", key: key("n"), than: 10 });
    expect(evaluateRule(gt, ctx({ facts: [fact("n", 11)] })).status).toBe("SUPPORTED");
    expect(evaluateRule(gt, ctx({ facts: [fact("n", 10)] })).status).toBe("NOT_APPLICABLE");
    const geq = rule({ kind: "FACT_GREATER_OR_EQUAL", key: key("n"), than: 10 });
    expect(evaluateRule(geq, ctx({ facts: [fact("n", 10)] })).status).toBe("SUPPORTED");
    const lt = rule({ kind: "FACT_LESS_THAN", key: key("n"), than: 10 });
    expect(evaluateRule(lt, ctx({ facts: [fact("n", 9)] })).status).toBe("SUPPORTED");
    const leq = rule({ kind: "FACT_LESS_OR_EQUAL", key: key("n"), than: 10 });
    expect(evaluateRule(leq, ctx({ facts: [fact("n", 10)] })).status).toBe("SUPPORTED");
  });

  it("DATE_BEFORE / DATE_AFTER reuse IsoDate primitives without timezone tricks", () => {
    const before = rule({ kind: "DATE_BEFORE", key: key("d"), before: isoDate("2026-09-15") });
    expect(evaluateRule(before, ctx({ facts: [fact("d", "2026-09-10")] })).status).toBe(
      "SUPPORTED",
    );
    expect(evaluateRule(before, ctx({ facts: [fact("d", "2026-09-15")] })).status).toBe(
      "NOT_APPLICABLE",
    );
    const after = rule({ kind: "DATE_AFTER", key: key("d"), after: isoDate("2026-09-15") });
    expect(evaluateRule(after, ctx({ facts: [fact("d", "2026-09-16")] })).status).toBe("SUPPORTED");
  });

  it("DATE_WITHIN_DAYS uses injected currentDate (determinism, adversarial J)", () => {
    const r = rule({ kind: "DATE_WITHIN_DAYS", key: key("d"), withinDays: 14 });
    // fact 10 days before currentDate → in window
    expect(evaluateRule(r, ctx({ facts: [fact("d", "2026-09-09")] })).status).toBe("SUPPORTED");
    // same rule, different injected currentDate → different result, deterministically
    expect(
      evaluateRule(r, ctx({ facts: [fact("d", "2026-09-09")], currentDate: isoDate("2026-12-31") }))
        .status,
    ).toBe("NOT_APPLICABLE");
    // boundary: exactly withinDays
    expect(evaluateRule(r, ctx({ facts: [fact("d", "2026-09-05")] })).status).toBe("SUPPORTED");
    // fact after reference → outside
    expect(evaluateRule(r, ctx({ facts: [fact("d", "2026-09-20")] })).status).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("BOOLEAN_IS_TRUE / BOOLEAN_IS_FALSE", () => {
    const t = rule({ kind: "BOOLEAN_IS_TRUE", key: key("flag") });
    expect(evaluateRule(t, ctx({ facts: [fact("flag", true)] })).status).toBe("SUPPORTED");
    expect(evaluateRule(t, ctx({ facts: [fact("flag", false)] })).status).toBe("NOT_APPLICABLE");
    const f = rule({ kind: "BOOLEAN_IS_FALSE", key: key("flag") });
    expect(evaluateRule(f, ctx({ facts: [fact("flag", false)] })).status).toBe("SUPPORTED");
  });

  it("type mismatch fails safely (not crashes, not matches)", () => {
    const r = rule({ kind: "FACT_GREATER_THAN", key: key("n"), than: 10 });
    const result = evaluateRule(r, ctx({ facts: [fact("n", "not-a-number")] }));
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.traces[0]!.reason).toBe("TYPE_MISMATCH");
  });
});

describe("composition", () => {
  it("ALL requires every condition", () => {
    const r = rule({
      kind: "ALL",
      conditions: [
        { kind: "FACT_EXISTS", key: key("a.b") },
        { kind: "FACT_EQUALS", key: key("c.d"), equals: "x" },
      ],
    });
    expect(evaluateRule(r, ctx({ facts: [fact("a.b", "1"), fact("c.d", "x")] })).status).toBe(
      "SUPPORTED",
    );
    const partial = evaluateRule(r, ctx({ facts: [fact("a.b", "1")] }));
    expect(partial.status).toBe("INSUFFICIENT_DATA");
    expect(partial.missingFacts).toEqual([key("c.d")]);
  });

  it("ANY requires at least one", () => {
    const r = rule({
      kind: "ANY",
      conditions: [
        { kind: "FACT_EQUALS", key: key("a.b"), equals: "x" },
        { kind: "FACT_EQUALS", key: key("c.d"), equals: "y" },
      ],
    });
    expect(evaluateRule(r, ctx({ facts: [fact("c.d", "y")] })).status).toBe("SUPPORTED");
    const none = evaluateRule(r, ctx());
    expect(none.status).toBe("INSUFFICIENT_DATA");
  });
  it("NOT negates; empty compositions fail safely", () => {
    const r = rule({
      kind: "NOT",
      condition: { kind: "FACT_EQUALS", key: key("a.b"), equals: "bad" },
    });
    expect(evaluateRule(r, ctx({ facts: [fact("a.b", "good")] })).status).toBe("SUPPORTED");
    // Empty compositions are rejected at construction; the evaluator also fails
    // safely if one ever reaches it (defense in depth).
    const handmade: Rule = {
      ...r,
      root: { kind: "ALL", conditions: [] },
    };
    expect(evaluateRule(handmade, ctx()).status).toBe("NOT_APPLICABLE");
    expect(evaluateRule(handmade, ctx()).traces[0]!.reason).toBe("EMPTY_COMPOSITION");
  });
});

describe("contradictions & evidence", () => {
  it("contradicted fact → CONTRADICTED status, never a guessed value (adversarial C)", () => {
    const r = rule({ kind: "FACT_EQUALS", key: key("a.b"), equals: "10" });
    const result = evaluateRule(
      r,
      ctx({
        facts: [fact("a.b", "10")],
        contradictedKeys: new Set([key("a.b")]),
      }),
    );
    expect(result.status).toBe("CONTRADICTED");
    expect(result.contradictedFacts).toEqual([key("a.b")]);
    expect(result.traces[0]!.reason).toBe("CONTRADICTED_FACT");
  });

  it("evidence refs flow through to the evaluation for traceability", () => {
    const r = rule({ kind: "FACT_EXISTS", key: key("a.b") });
    const result = evaluateRule(
      r,
      ctx({ facts: [fact("a.b", "x", "CONFIRMED", ["ev-1", "ev-2"])] }),
    );
    expect([...result.evidenceRefs].sort()).toEqual(["ev-1", "ev-2"]);
  });

  it("unconfirmed facts downgrade SUPPORTED → POTENTIALLY_APPLICABLE (no false certainty)", () => {
    const r = rule({ kind: "FACT_EXISTS", key: key("a.b") });
    const confirmed = evaluateRule(r, ctx({ facts: [fact("a.b", "x", "CONFIRMED")] }));
    expect(confirmed.status).toBe("SUPPORTED");
    const unconfirmed = evaluateRule(r, ctx({ facts: [fact("a.b", "x", "UNCONFIRMED")] }));
    expect(unconfirmed.status).toBe("POTENTIALLY_APPLICABLE");
  });
});

describe("jurisdiction matching", () => {
  it("COUNTRY_WIDE rule applies to the country and any region; regional only to exact pair", () => {
    const country = rule({ kind: "FACT_EXISTS", key: key("a.b") });
    expect(
      evaluateRule(country, ctx({ jurisdiction: { country: "XX", region: "R1" } })).status,
    ).toBe("INSUFFICIENT_DATA");
    const regional = rule(
      { kind: "FACT_EXISTS", key: key("a.b") },
      {
        scope: { level: "REGIONAL", country: "XX", region: "R1" },
      },
    );
    expect(
      evaluateRule(regional, ctx({ jurisdiction: { country: "XX", region: "R1" } })).status,
    ).toBe("INSUFFICIENT_DATA");
    const otherRegion = evaluateRule(
      regional,
      ctx({ jurisdiction: { country: "XX", region: "R2" } }),
    );
    expect(otherRegion.status).toBe("NOT_APPLICABLE");
    expect(otherRegion.notApplicableReason).toContain("XX/R1");
  });

  it("jurisdiction mismatch is NOT_APPLICABLE with reason (adversarial K)", () => {
    const r = rule({ kind: "FACT_EXISTS", key: key("a.b") });
    const result = evaluateRule(r, ctx({ jurisdiction: { country: "YY" } }));
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.traces).toHaveLength(0); // never evaluated
  });
});

describe("determinism (adversarial I)", () => {
  it("same input twice → identical evaluation object", () => {
    const r = rule({
      kind: "ALL",
      conditions: [
        { kind: "FACT_EXISTS", key: key("a.b") },
        { kind: "DATE_WITHIN_DAYS", key: key("c.d"), withinDays: 30 },
      ],
    });
    const context = ctx({
      facts: [fact("a.b", "x"), fact("c.d", "2026-09-01")],
    });
    expect(evaluateRule(r, context)).toEqual(evaluateRule(r, context));
  });
});
