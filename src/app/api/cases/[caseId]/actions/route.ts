/**
 * API Route: GET /api/cases/:caseId/actions
 *
 * Returns the ActionPlan for a case, derived from the Result.
 * No auth yet (deferred); typed error codes in every response.
 */
import { NextResponse } from "next/server";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems/analysis-service";
import { buildResult } from "@core/result/engine";
import { deriveActions } from "@core/actions/engine";
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
import { cases, physicalObjects } from "@server/db/schema";
import { eq } from "drizzle-orm";

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

    // Module questions + fact descriptions, so missing information is described
    // in user language — never as a raw fact key.
    const problemModule = services.registry.has(analysis.problemKey)
      ? services.registry.get(analysis.problemKey)
      : null;
    const questions = moduleIntakeQuestions(problemModule);
    const factLabels = moduleFactLabels(problemModule);

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
      factLabels,
      intakeComplete: analysis.intakeComplete,
    });

    // Derive actions
    const actionPlan = deriveActions(result);

    return NextResponse.json({ actionPlan }, { headers: PRIVATE_CACHE_HEADERS });
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

/**
 * DELETE /api/cases/:caseId/actions
 *
 * Soft-delete a case and all its associated data.
 * DB cascade handles: facts, contradictions, events, snapshots, evidence,
 * physical objects, processing runs, document locations, fact candidates,
 * ai_requests, ai_budgets.
 *
 * R2 objects are cleaned up asynchronously if storage is configured.
 */
export async function DELETE(
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

  // 1. Verify case exists
  const loaded = await services.repo.loadCase(caseId);
  if (!loaded) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  // 2. Collect storage keys for R2 cleanup (before cascade deletes the metadata)
  const storageKeys: string[] = [];
  try {
    const env = getServerEnv();
    if (!env.DATABASE_URL) throw new Error("No DB");
    const db = createNeonDb(env.DATABASE_URL);
    const physicalRows = await db
      .select({ storageKey: physicalObjects.storageKey })
      .from(physicalObjects)
      .where(eq(physicalObjects.caseId, caseId));
    storageKeys.push(...physicalRows.map((r) => r.storageKey));
  } catch {
    // Physical objects query failed — proceed with DB deletion
    // R2 cleanup can be handled by orphan cleanup later
  }

  // 3. Delete from DB (cascade handles all child tables)
  try {
    const env = getServerEnv();
    if (!env.DATABASE_URL) throw new Error("No DB");
    const db = createNeonDb(env.DATABASE_URL);
    await db.delete(cases).where(eq(cases.id, caseId));
  } catch {
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Could not delete case" } },
      { status: 500 },
    );
  }

  // 4. Clean up R2 objects (best-effort, non-blocking)
  if (storageKeys.length > 0) {
    try {
      const env = getServerEnv();
      if (
        env.R2_ACCOUNT_ID &&
        env.R2_BUCKET_DOCUMENTS &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY
      ) {
        const { R2ObjectStorage } = await import("@server/adapters/storage/r2-object-storage");
        const storage = new R2ObjectStorage({
          accountId: env.R2_ACCOUNT_ID,
          bucketName: env.R2_BUCKET_DOCUMENTS,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        });
        for (const key of storageKeys) {
          await storage.delete(key).catch(() => {}); // best-effort
        }
      }
    } catch {
      // R2 cleanup failed — objects are orphaned but DB is consistent
      // Orphan cleanup job will handle these
    }
  }

  return NextResponse.json({ success: true, caseId }, { headers: PRIVATE_CACHE_HEADERS });
}
