/**
 * Reanalysis API — F13 Case Management
 *
 * POST /api/cases/[caseId]/reanalyze — Trigger reanalysis with current confirmed facts
 */
import { NextResponse } from "next/server";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems/analysis-service";
import { ProblemRegistry } from "@core/problems";
import { buildResult } from "@core/result/engine";
import { deriveActions } from "@core/actions/engine";
import { createEvent } from "@core/case/events";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { getServerEnv } from "@/lib/env";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { cancellationChargeModule } from "@problems/cancellation-charge";
import { noDeliveryRefundModule } from "@problems/no-delivery-refund";
import { warrantyRejectionModule } from "@problems/warranty-rejection";
import { flightCancelModule } from "@problems/flight-cancel";
import { now as systemNow } from "@core/shared/temporal";

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

  return { repo, caseService, analysisService, registry };
}

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
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

  try {
    // Load current case state
    const loaded = await services.repo.loadCase(caseId);
    if (!loaded) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 },
      );
    }

    const previousSnapshotId = loaded.snapshots.length > 0
      ? loaded.snapshots[loaded.snapshots.length - 1]!.id
      : undefined;

    // Run analysis to get evaluations
    const analysis = await services.analysisService.runProblemAnalysis(caseId);

    // Build result
    const result = buildResult({
      caseId,
      problemKey: analysis.problemKey,
      evaluatedAt: analysis.evaluatedAt,
      engineVersion: analysis.engineVersion,
      facts: loaded.facts,
      evaluations: analysis.evaluations,
      sources: [],
      questions: [],
      intakeComplete: analysis.intakeComplete,
    });

    // Derive new actions
    const actionPlan = deriveActions(result);

    // Create timeline event
    const now = systemNow();
    const event = createEvent(
      caseId,
      "ANALYSIS_RECALCULATED",
      {
        previousSnapshotId: previousSnapshotId ?? null,
        newSnapshotId: analysis.snapshotId ?? null,
        claimsCount: result.claims.length,
        supportedClaims: result.claims.filter((c) => c.status === "SUPPORTED").length,
      },
      now,
    );

    // Save timeline event
    const env = getServerEnv();
    const db = createNeonDb(env.DATABASE_URL!);
    const { caseEvents } = await import("@server/db/schema");
    await db.insert(caseEvents).values({
      id: event.id,
      caseId: event.caseId,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });

    return NextResponse.json(
      {
        case: {
          id: caseId,
          status: loaded.case.status,
          version: loaded.case.version,
        },
        analysis: {
          snapshotId: analysis.snapshotId,
          overallStatus: result.overallStatus,
          summary: result.summary,
          claims: result.claims,
          missingInformation: result.missingInformation,
          contradictions: result.contradictions,
        },
        actionPlan,
        comparison: {
          previousSnapshotId,
          changedResult: previousSnapshotId !== undefined,
        },
      },
      { headers: PRIVATE_CACHE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "REANALYSIS_FAILED",
          message: sanitizeErrorMessage(error),
        },
      },
      { status: 500, headers: PRIVATE_CACHE_HEADERS },
    );
  }
}
