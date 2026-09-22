/**
 * End-to-end flow, over real persistence (pglite + the real migrations):
 *
 *   publish module rules (as the routes do)
 *     → case created WITH the routed module and jurisdiction (as /api/intake/interpret now does)
 *     → facts confirmed with the DECLARED types (as the questionnaire sends them)
 *     → rule engine evaluates the module's PUBLISHED rules from the database
 *     → result claims cite real verified sources
 *
 * This is the flow that was broken in production: cases were created as
 * "unknown", the rules table was empty, and the analysis threw before producing
 * anything. Every assertion below fails if any of those three regressions return.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPersistenceHarness, type PersistenceHarness } from "../persistence/pglite-setup";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems";
import { ProblemRegistry } from "@core/problems";
import { buildResult } from "@core/result/engine";
import { warrantyRejectionModule } from "@problems/warranty-rejection";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { moduleIntakeRequirements, publishModuleRuleSets } from "@server/rules/publish-module-rules";
import { loadCitedSources } from "@server/rules/load-cited-sources";

const CURRENT_DATE = "2026-09-22";

function buildAnalysis(caseService: CaseService, harness: PersistenceHarness) {
  const rulesRepo = new RulesRepository(
    harness.db as unknown as ConstructorParameters<typeof RulesRepository>[0],
  );
  const repo = harness.repo;
  const registry = new ProblemRegistry();
  registry.register(warrantyRejectionModule);
  const analysis = new ProblemAnalysisService({
    repo,
    caseService,
    rules: {
      getPublishedRules: (keys) =>
        rulesRepo
          .listRules("PUBLISHED")
          .then((all) => all.filter((rule) => keys.includes(rule.key))),
    },
    evaluationRecorder: {
      recordEvaluation: (params) => rulesRepo.recordEvaluation(params),
    },
    registry,
  });
  return { analysis, rulesRepo, registry };
}

describe("intake → analysis → result over real persistence", () => {
  let harness: PersistenceHarness;
  let caseService: CaseService;
  let rulesRepo: RulesRepository;
  let analysis: ProblemAnalysisService;

  beforeAll(async () => {
    harness = await createPersistenceHarness();
    caseService = new CaseService(harness.repo);
    const built = buildAnalysis(caseService, harness);
    rulesRepo = built.rulesRepo;
    analysis = built.analysis;
  });

  afterAll(async () => {
    await harness.close();
  });

  it("publishes the module rule set into the database (and is idempotent)", async () => {
    const first = await publishModuleRuleSets(
      (() => {
        const registry = new ProblemRegistry();
        registry.register(warrantyRejectionModule);
        return registry;
      })(),
      rulesRepo,
    );

    expect(first.modulesWithoutRuleSet).toEqual([]);
    expect(first.rulesPublished).toBe(warrantyRejectionModule.ruleKeys.length);
    expect(first.sourcesPublished).toBeGreaterThan(0);

    const published = await rulesRepo.listRules("PUBLISHED");
    for (const ruleKey of warrantyRejectionModule.ruleKeys) {
      expect(published.some((rule) => rule.key === ruleKey)).toBe(true);
    }

    // Re-running must not rewrite published definitions.
    const second = await publishModuleRuleSets(
      (() => {
        const registry = new ProblemRegistry();
        registry.register(warrantyRejectionModule);
        return registry;
      })(),
      rulesRepo,
    );
    expect(second.rulesPublished).toBe(0);
    expect(second.rulesAlreadyPresent).toBe(warrantyRejectionModule.ruleKeys.length);
  });

  it("analyses a case that carries the routed module and produces sourced claims", async () => {
    // 1. Case created with the routed module + jurisdiction, as the interpret route does.
    const created = await caseService.createCase({
      problemSlug: "warranty-rejection" as never,
      jurisdiction: "ES" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "anonymous" as never,
    });

    // 2. Exactly what the questionnaire collects: every fact the rules read
    //    (the requirement set is what drives the form in production).
    const { neededFactKeys } = moduleIntakeRequirements(warrantyRejectionModule);
    const answerValue = (key: string): unknown => {
      if (key === "purchase.delivery_date") return { type: "date", value: "2026-05-01" };
      if (key === "nonconformity.description") {
        return { type: "string", value: "El portátil dejó de cargar a las tres semanas." };
      }
      return { type: "boolean", value: true };
    };
    const answers: Array<{ key: string; value: unknown }> = [...neededFactKeys].map((key) => ({
      key,
      value: answerValue(key),
    }));
    expect(answers.length).toBeGreaterThan(3);
    for (const answer of answers) {
      await caseService.confirmFactForCase(created.id, {
        key: answer.key as never,
        value: answer.value as never,
      });
    }

    // 3. Analysis uses the rules read back from the database (the production path).
    const analysisResult = await analysis.runProblemAnalysis(created.id, {
      currentDate: CURRENT_DATE,
    });

    expect(analysisResult.problemKey).toBe("warranty-rejection");
    expect(analysisResult.jurisdiction).toBe("ES");
    expect(analysisResult.evaluations.length).toBe(warrantyRejectionModule.ruleKeys.length);

    // Every evaluation must cite the sources it rests on.
    for (const evaluation of analysisResult.evaluations) {
      expect(evaluation.sourceIds.length).toBeGreaterThan(0);
    }

    // The seller rejected within the 3-year responsibility window → supported.
    const rejectedWithinPeriod = analysisResult.evaluations.find(
      (e) => e.ruleKey === "warranty-rejection.seller-rejected-within-period",
    );
    expect(rejectedWithinPeriod?.status).toBe("SUPPORTED");

    // 4. Result + cited sources (never invented references).
    const loaded = await caseService.loadCase(created.id);
    const sources = await loadCitedSources(rulesRepo, analysisResult.evaluations);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.url).toContain("boe.es");
      expect(source.title.length).toBeGreaterThan(0);
      // Each source states which analysis it backs.
      expect(source.claim.length).toBeGreaterThan(0);
    }

    const result = buildResult({
      caseId: created.id,
      problemKey: analysisResult.problemKey,
      evaluatedAt: analysisResult.evaluatedAt,
      engineVersion: analysisResult.engineVersion,
      facts: loaded.facts,
      evaluations: analysisResult.evaluations,
      sources,
      questions: warrantyRejectionModule.intake.map((q) => ({
        id: q.id,
        text: q.text,
        factKey: q.factKey as string,
        required: q.required,
      })),
      intakeComplete: analysisResult.intakeComplete,
    });

    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);

    const supportedClaims = result.claims.filter((c) => c.status === "SUPPORTED");
    expect(supportedClaims.length).toBeGreaterThan(0);
    // Traceability: a supported claim must show the sources backing it.
    expect(supportedClaims[0]?.supportingSources.length).toBeGreaterThan(0);
    expect(result.disclaimers.length).toBeGreaterThan(0);
    // The report must say where the user can actually act on it.
    expect(result.channels.length).toBeGreaterThan(0);
    // With every rule input confirmed, the analysis is complete — not
    // "INSUFFICIENT_DATA because the form stopped after three questions".
    expect(analysisResult.intakeComplete).toBe(true);
    expect(analysisResult.missingRequiredFacts).toEqual([]);
    expect(result.intakeComplete).toBe(true);
  });

  it("cannot analyse a case left as 'unknown' (why the module must be persisted)", async () => {
    const created = await caseService.createCase({
      problemSlug: "unknown" as never,
      jurisdiction: "UNKNOWN" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "anonymous" as never,
    });

    await expect(analysis.runProblemAnalysis(created.id)).rejects.toThrow(/unknown/i);
  });
});
