/**
 * API Route: GET /api/cases/:caseId/export?format=pdf
 *
 * Exports the case as a document: what the person answered, the analysis, the
 * pending data, the next steps, where to complain and the cited sources.
 * No auth yet (deferred); typed error codes in every response.
 */
import { NextResponse } from "next/server";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems/analysis-service";
import { buildResult } from "@core/result/engine";
import { deriveActions } from "@core/actions/engine";
import { buildExportAnswers } from "@core/export/answers";
import { buildCaseHighlights } from "@core/export/highlights";
import { TxtExportAdapter } from "@core/export/txt-adapter";
import { ExportService } from "@core/export/service";
import { PdfExportAdapter } from "@server/adapters/export/pdf-adapter";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { ensureRuleSetsPublishedSafe } from "@server/rules/publish-module-rules";
import { loadCitedSources } from "@server/rules/load-cited-sources";
import { getServerEnv } from "@/lib/env";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import {
  createProblemRegistry,
  moduleFactLabels,
  moduleIntakeQuestions,
} from "@server/problems/registry";

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
  const registry = createProblemRegistry();

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
  Pragma: "no-cache",
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;

  if (!isValidCaseId(caseId)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid case ID format" } },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  // PDF by default: the report is meant to be sent to the company or an
  // official body, and that is the format they accept.
  const format = (url.searchParams.get("format") ?? "pdf") as "txt" | "pdf" | "docx";

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
  await ensureRuleSetsPublishedSafe(services.registry, services.rulesRepo);

  try {
    // Run analysis
    const analysis = await services.analysisService.runProblemAnalysis(caseId);

    // Load case
    const loaded = await services.repo.loadCase(caseId);
    if (!loaded) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 },
      );
    }

    // The report must name the case's real problem, describe missing data with
    // the questions the person actually saw, and cite the official sources the
    // analysis used — otherwise the document is not checkable.
    const problemModule = services.registry.has(analysis.problemKey)
      ? services.registry.get(analysis.problemKey)
      : null;
    const questions = moduleIntakeQuestions(problemModule);
    const factLabels = moduleFactLabels(problemModule);
    const sources = await loadCitedSources(services.rulesRepo, analysis.evaluations);

    // Build result + actions
    const result = buildResult({
      caseId,
      problemKey: analysis.problemKey,
      evaluatedAt: analysis.evaluatedAt,
      engineVersion: analysis.engineVersion,
      facts: loaded.facts,
      evaluations: analysis.evaluations,
      sources,
      questions,
      factLabels,
      intakeComplete: analysis.intakeComplete,
    });

    const actionPlan = deriveActions(result);

    // What the person answered, in readable form (see `buildExportAnswers`),
    // plus the amounts and dates the claim turns on.
    const labels = {
      questions: Object.fromEntries(questions.map((q) => [q.factKey, q.text])),
      factLabels,
    };
    const answers = buildExportAnswers(loaded.facts, labels);
    const highlights = buildCaseHighlights(loaded.facts, labels);

    // Export
    const exportService = new ExportService([new PdfExportAdapter(), new TxtExportAdapter()]);
    const exported = await exportService.exportCase(
      {
        result,
        actionPlan,
        answers,
        highlights,
        caseMetadata: {
          problemTitle: problemModule?.title ?? "Caso de consumo",
          jurisdiction: loaded.case.jurisdiction,
          createdAt: loaded.case.createdAt,
        },
      },
      format,
    );

    // Binary formats are returned as bytes: decoding them as text corrupted PDFs.
    const body: BodyInit =
      typeof exported.content === "string" ? exported.content : new Uint8Array(exported.content);

    return new NextResponse(body, {
      headers: {
        "Content-Type": exported.mimeType,
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        ...PRIVATE_CACHE_HEADERS,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "EXPORT_FAILED",
          message: sanitizeErrorMessage(error),
        },
      },
      { status: 500, headers: PRIVATE_CACHE_HEADERS },
    );
  }
}
