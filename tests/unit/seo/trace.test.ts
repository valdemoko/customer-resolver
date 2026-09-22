/**
 * Traceability tests.
 *
 * `/como-funciona` and the problem pages now *show* the chain
 * HECHO → REGLA → ARTÍCULO → FUENTE, generated from the modules themselves. The
 * point of deriving it is that it cannot drift from the analysis; these tests
 * hold that property, plus the invariant the whole product rests on: a published
 * rule always has at least one verified source.
 */
import { describe, expect, it } from "vitest";

import { getProblemTrace, collectFactKeys } from "@/lib/trace";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { moduleCodeRules } from "@server/rules/publish-module-rules";
import { createProblemRegistry } from "@server/problems/registry";

describe("traceability catalog", () => {
  it("reads fact keys out of every condition shape without evaluating anything", () => {
    expect(collectFactKeys({ kind: "FACT_EXISTS", key: "x" as never })).toEqual(["x"]);
    expect(
      collectFactKeys({
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: "a" as never },
          { kind: "NOT", condition: { kind: "BOOLEAN_IS_TRUE", key: "b" as never } },
        ],
      }),
    ).toEqual(["a", "b"]);
    expect(
      collectFactKeys({
        kind: "DATE_DIFFERENCE",
        startFact: "from" as never,
        endFact: "to" as never,
      } as never),
    ).toEqual(["from", "to"]);
  });

  it("traces every published problem from its real rules and sources", () => {
    for (const problem of getAvailableProblems()) {
      const trace = getProblemTrace(problem.key, problem.title);

      expect(trace.rules.length, problem.key).toBeGreaterThan(0);
      expect(trace.sourceCount, problem.key).toBeGreaterThan(0);
      expect(trace.factCount, problem.key).toBeGreaterThan(0);

      for (const rule of trace.rules) {
        // The invariant: a rule with no source is never evaluated, so a rule
        // shown to the public always has one.
        expect(rule.sources.length, `${problem.key}/${rule.key}`).toBeGreaterThan(0);
        for (const source of rule.sources) {
          expect(source.url, source.id).toMatch(/^https:\/\//);
          expect(source.externalId.length, source.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only surfaces rules that are actually published", () => {
    for (const problem of getAvailableProblems()) {
      const published = moduleCodeRules(problem.key).filter((r) => r.status === "PUBLISHED");
      const trace = getProblemTrace(problem.key, problem.title);
      expect(trace.rules.map((r) => r.key).sort()).toEqual(published.map((r) => r.key).sort());
    }
  });

  it("labels facts from the module's own catalogue, never a raw key", () => {
    const problem = getAvailableProblems()[0]!;
    const trace = getProblemTrace(problem.key, problem.title);
    const registry = createProblemRegistry();
    const catalogue = new Map(
      registry.get(problem.key).factCatalogue.map((f) => [f.key as string, f]),
    );

    for (const rule of trace.rules) {
      for (const fact of rule.facts) {
        expect(fact.key.length).toBeGreaterThan(0);
        const declared = catalogue.get(fact.key);
        if (declared) {
          expect(fact.label, fact.key).not.toBe(fact.key);
          // A fact with no question is computed by the system, not asked.
          expect(fact.derived, fact.key).toBe(!declared.questionId);
        }
      }
    }
  });

  it("returns an empty trace for an unknown problem instead of throwing", () => {
    const trace = getProblemTrace("does-not-exist", "Nada");
    expect(trace.rules).toEqual([]);
    expect(trace.sourceCount).toBe(0);
  });
});
