/**
 * Guard: every module must be able to tell the report which company it is
 * against.
 *
 * The report names the company and shows its official customer service, so a
 * module without a company question (or one whose question the questionnaire
 * never reaches) silently loses that section. This fails if that happens.
 */
import { describe, expect, it } from "vitest";

import { computeIntakeRequirements } from "@core/problems/requirements";
import { COMPANY_FACT_KEYS } from "@core/result/company";
import { createProblemRegistry } from "@server/problems/registry";
import { moduleCodeRules } from "@server/rules/publish-module-rules";

const registry = createProblemRegistry();

describe("company question per module", () => {
  it("declares a company fact with its own question", () => {
    for (const problemModule of registry.list()) {
      const companyQuestions = problemModule.intake.filter((q) =>
        COMPANY_FACT_KEYS.includes(q.factKey as string),
      );
      expect(companyQuestions, problemModule.key).toHaveLength(1);

      const question = companyQuestions[0]!;
      expect(question.type, problemModule.key).toBe("string");
      expect(question.text.length, problemModule.key).toBeGreaterThan(10);
      expect(
        problemModule.factCatalogue.some((f) => f.key === question.factKey),
        `${problemModule.key}: el hecho de la empresa no está en el catálogo`,
      ).toBe(true);
    }
  });

  it("collects it even though no rule reads it", () => {
    for (const problemModule of registry.list()) {
      const companyKey = problemModule.intake.find((q) =>
        COMPANY_FACT_KEYS.includes(q.factKey as string),
      )!.factKey as string;

      const { neededFactKeys } = computeIntakeRequirements(
        problemModule,
        moduleCodeRules(problemModule.key),
      );

      expect(
        neededFactKeys.has(companyKey),
        `${problemModule.key}: la pregunta de la empresa no se llegaría a hacer`,
      ).toBe(true);
    }
  });
});
