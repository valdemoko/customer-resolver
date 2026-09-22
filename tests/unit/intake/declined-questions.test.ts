/**
 * "No lo sé" must move the form forward.
 *
 * The selector returns the first unanswered fact, so right after a skip it
 * returned the same question: the person saw a form that never advanced and a
 * report full of missing data they had never refused. A declined fact is now an
 * answer for the *questionnaire* (stop asking) while staying missing for the
 * *analysis* (the rule still reports insufficient data).
 */
import { describe, expect, it } from "vitest";

import {
  intakeRequirementsSatisfied,
  selectNextQuestion,
} from "@core/intake/question-selector";
import type { ProblemModuleDefinition } from "@core/problems/contract";
import type { FactKey } from "@core/types";

const testModule = {
  key: "test-testModule",
  title: "Test",
  intake: [
    { id: "q1", text: "¿A?", type: "boolean", factKey: "a", required: true },
    { id: "q2", text: "¿B?", type: "boolean", factKey: "b", required: true },
    { id: "q3", text: "¿C?", type: "boolean", factKey: "c", required: false },
  ],
  factCatalogue: [
    { key: "a", type: "boolean", description: "A", required: true },
    { key: "b", type: "boolean", description: "B", required: true },
    { key: "c", type: "boolean", description: "C", required: false },
  ],
} as unknown as ProblemModuleDefinition;

const needed = new Set(["a", "b", "c"]);
const valuesOf = (facts: Record<string, unknown>) =>
  new Map<FactKey, unknown>(Object.entries(facts) as [FactKey, unknown][]);

describe("declined questions", () => {
  it("returns the same question while it stays unanswered", () => {
    const next = selectNextQuestion(testModule, [], valuesOf({}), needed);
    expect(next?.factKey).toBe("a");
  });

  it("moves on to the next question once one is declined", () => {
    const next = selectNextQuestion(testModule, [], valuesOf({}), needed, new Set(["a"]));
    expect(next?.factKey).toBe("b");
  });

  it("finishes the questionnaire when everything left is declined", () => {
    const declined = new Set(["a", "b", "c"]);
    expect(selectNextQuestion(testModule, [], valuesOf({}), needed, declined)).toBeNull();
    expect(intakeRequirementsSatisfied(testModule, [], valuesOf({}), needed, declined)).toBe(true);
  });

  it("does not treat a declined fact as confirmed data", () => {
    // The rules still miss it: declining only stops the question.
    expect(
      intakeRequirementsSatisfied(testModule, [], valuesOf({}), needed, new Set(["a"])),
    ).toBe(false);
  });

  it("still asks a question whose fact was not declined", () => {
    const next = selectNextQuestion(testModule, [], valuesOf({}), needed, new Set(["c"]));
    expect(next?.factKey).toBe("a");
  });
});
