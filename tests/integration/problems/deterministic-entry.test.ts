/**
 * Deterministic entry, end to end, over real persistence.
 *
 *   ficha de problema → problemKey → caso creado con los defaults del módulo
 *     → preguntas del selector → respuestas confirmadas → cuestionario completo
 *
 * This is the flow a problem page now starts (no AI anywhere in it). The test
 * drives it for EVERY published problem, so a module that needs a fact its rules
 * read — but that no question ever asks — fails here instead of in production,
 * where it showed up as "faltan datos" with the analysis half-run.
 *
 * It also pins the defaults the route used to hardcode: creating the case with
 * `UNKNOWN`/`es-ES` made the analysis reject the case outright.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPersistenceHarness, type PersistenceHarness } from "../persistence/pglite-setup";
import { CaseService } from "@core/case/service";
import { selectNextQuestion, intakeRequirementsSatisfied } from "@core/intake/question-selector";
import type { QuestionSelection } from "@core/intake/types";
import type { KnownFact } from "@core/problems";
import { factValueMap } from "@core/problems/intake";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { createProblemRegistry } from "@server/problems/registry";
import { caseDefaultsForModule } from "@server/intake/progress";
import { moduleIntakeRequirements } from "@server/rules/publish-module-rules";

/** A value the rule engine can actually compare, built from the declared type. */
function answerFor(question: QuestionSelection): unknown {
  switch (question.questionType) {
    case "boolean":
      return { type: "boolean", value: true };
    case "date":
      return { type: "date", value: "2026-05-01" };
    case "money":
      return { type: "money", value: { amountMinor: 5000, currency: "EUR" } };
    case "number":
      return { type: "number", value: 2 };
    case "enum": {
      const option = question.options[0];
      expect(option, `enum question without options: ${question.factKey}`).toBeDefined();
      return { type: "enum", value: option, options: [...question.options] };
    }
    default:
      return { type: "string", value: "Descripción de ejemplo aportada por la persona." };
  }
}

describe("deterministic entry: ficha → preguntas → cuestionario completo", () => {
  let harness: PersistenceHarness;
  let caseService: CaseService;
  const registry = createProblemRegistry();

  beforeAll(async () => {
    harness = await createPersistenceHarness();
    caseService = new CaseService(harness.repo);
  });

  afterAll(async () => {
    await harness.close();
  });

  it.each(getAvailableProblems().map((p) => [p.key, p.title] as const))(
    "%s: crea el caso con sus propios defaults y completa el cuestionario",
    async (problemKey) => {
      const problemModule = registry.get(problemKey);
      const defaults = caseDefaultsForModule(problemModule);

      // The defaults must be values the module actually declares, or the
      // analysis refuses the case (the production bug this replaces).
      expect(problemModule.jurisdictions).toContain(defaults.jurisdiction);
      expect(problemModule.locales).toContain(defaults.locale);

      const created = await caseService.createCase({
        ...defaults,
        ownerId: "anonymous" as never,
      } as never);

      const { neededFactKeys } = moduleIntakeRequirements(problemModule);
      expect(neededFactKeys.size).toBeGreaterThan(0);

      const declined = new Set<string>();
      let questionsAsked = 0;

      // Answer whatever the selector asks for, exactly as the client does:
      // confirm the fact, reload from persistence, ask again.
      for (let step = 0; step < 60; step += 1) {
        const loaded = await caseService.loadCase(created.id);
        const knownFacts: KnownFact[] = loaded.facts.map((f) => ({
          key: f.key as KnownFact["key"],
          status: f.status as KnownFact["status"],
        }));
        const values = factValueMap(
          loaded.facts.map((f) => ({
            key: f.key as KnownFact["key"],
            value: f.value,
            status: f.status,
          })),
        );

        const question = selectNextQuestion(
          problemModule,
          knownFacts,
          values,
          neededFactKeys,
          declined,
        );

        if (!question) break;

        questionsAsked += 1;
        const answer = answerFor(question);
        await caseService.confirmFactForCase(created.id, {
          key: question.factKey,
          value: answer as never,
        });
      }

      expect(questionsAsked, `${problemKey}: no questions were asked`).toBeGreaterThan(0);

      // The questionnaire is done when every fact the rules read is confirmed.
      const loaded = await caseService.loadCase(created.id);
      const knownFacts: KnownFact[] = loaded.facts.map((f) => ({
        key: f.key as KnownFact["key"],
        status: f.status as KnownFact["status"],
      }));
      const values = factValueMap(
        loaded.facts.map((f) => ({
          key: f.key as KnownFact["key"],
          value: f.value,
          status: f.status,
        })),
      );

      expect(
        intakeRequirementsSatisfied(problemModule, knownFacts, values, neededFactKeys, declined),
        `${problemKey}: el cuestionario no llega a completarse`,
      ).toBe(true);
      expect(
        selectNextQuestion(problemModule, knownFacts, values, neededFactKeys, declined),
        `${problemKey}: queda una pregunta pendiente al terminar`,
      ).toBeNull();

      // The case carries the module: this is what `problemSlug` was for, and the
      // reason a "deterministic" case is analysable at all.
      expect(loaded.case.problemSlug).toBe(problemKey);
    },
  );
});
