/**
 * API Route: GET /api/cases/:caseId/result
 *
 * Returns the Result for a case, built from rule evaluations + facts + sources.
 * No auth yet (deferred); typed error codes in every response.
 */
import { NextResponse } from "next/server";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems/analysis-service";
import { ProblemRegistry } from "@core/problems";
import { buildResult } from "@core/result/engine";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { ensureRuleSetsPublishedSafe } from "@server/rules/publish-module-rules";
import { loadCitedSources } from "@server/rules/load-cited-sources";
import { getServerEnv } from "@/lib/env";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { cancellationChargeModule } from "@problems/cancellation-charge";
import { noDeliveryRefundModule } from "@problems/no-delivery-refund";
import { warrantyRejectionModule } from "@problems/warranty-rejection";
import { flightCancelModule } from "@problems/flight-cancel";

export const dynamic = "force-dynamic";

type Repo = ConstructorParameters<typeof DrizzleCaseRepository>[0];

function compositionRoot() {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required (503 until configured)");
  }
  const db = createNeonDb(DATABASE_URL) as unknown as Repo;
  const repo = new DrizzleCaseRepository(db);
  const caseService = new CaseService(repo);
  const rulesRepo = new RulesRepository(db);
  const registry = new ProblemRegistry();
  registry.register(cancellationChargeModule);
  registry.register(noDeliveryRefundModule);
  registry.register(warrantyRejectionModule);
  registry.register(flightCancelModule);

  const analysisService = new ProblemAnalysisService({
    repo,
    caseService,
    rules: {
      getPublishedRules: (keys) =>
        rulesRepo.listRules("PUBLISHED").then((all) => all.filter((r) => keys.includes(r.key))),
    },
    evaluationRecorder: {
      recordEvaluation: (params) => rulesRepo.recordEvaluation(params),
    },
    registry,
  });

  return { repo, caseService, analysisService, registry, rulesRepo };
}

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;

  if (!isValidCaseId(caseId)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid case ID format" } },
      { status: 400 },
    );
  }

  let services: ReturnType<typeof compositionRoot>;
  try {
    services = compositionRoot();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  // Rules live in the database: publish the module rule sets before analysing.
  // Idempotent, cached per instance, and never fatal (failure is logged).
  await ensureRuleSetsPublishedSafe(services.registry, services.rulesRepo);

  try {
    // Run analysis to get evaluations
    const analysis = await services.analysisService.runProblemAnalysis(caseId);

    // Load case for facts
    const loaded = await services.repo.loadCase(caseId);
    if (!loaded) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 },
      );
    }

    // Official sources cited by the evaluated rules (never invented references).
    const sources = await loadCitedSources(services.rulesRepo, analysis.evaluations);

    // Module questions, so missing information is described in user language.
    const problemModule = services.registry.has(analysis.problemKey)
      ? services.registry.get(analysis.problemKey)
      : null;
    const questions = (problemModule?.intake ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      factKey: q.factKey as string,
      required: q.required,
    }));

    // Build result
    const result = buildResult({
      caseId,
      problemKey: analysis.problemKey,
      evaluatedAt: analysis.evaluatedAt,
      engineVersion: analysis.engineVersion,
      facts: loaded.facts,
      evaluations: analysis.evaluations,
      sources,
      questions,
      intakeComplete: analysis.intakeComplete,
    });

    return NextResponse.json({ result }, { headers: PRIVATE_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "ANALYSIS_FAILED",
          message: sanitizeErrorMessage(error),
        },
      },
      { status: 500, headers: PRIVATE_CACHE_HEADERS },
    );
  }
}
