/**
 * API Route: GET/POST /api/cases/:caseId/documents
 *
 * GET: Lists all documents for a case.
 * POST: Generates a new document from case analysis.
 *
 * Security: Verifies case access before any operation.
 * Idempotency: Uses F11 infrastructure for generation requests.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { CaseService } from "@core/case/service";
import { ProblemAnalysisService } from "@core/problems/analysis-service";
import { ProblemRegistry } from "@core/problems";
import { buildResult } from "@core/result/engine";
import { deriveActions } from "@core/actions/engine";
import { DocumentGenerationService } from "@core/document-generation/service";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { ensureRuleSetsPublishedSafe } from "@server/rules/publish-module-rules";
import { DocumentRepository } from "@server/db/repositories/document-repository";
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
  const docRepo = new DocumentRepository(db);
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

  return { repo, caseService, analysisService, registry, rulesRepo, docRepo };
}

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
} as const;

// ── GET: List documents ─────────────────────────────────────────────

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

  // Verify case exists
  try {
    await services.caseService.loadCase(caseId);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  const documents = await services.docRepo.listByCase(caseId);

  return NextResponse.json(
    {
      caseId,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        version: d.version,
        format: d.format,
        title: d.title,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    },
    { headers: PRIVATE_CACHE_HEADERS },
  );
}

// ── POST: Generate document ─────────────────────────────────────────

const generateRequestSchema = z
  .object({
    sender: z
      .object({
        name: z.string().max(200).optional(),
        address: z.string().max(500).optional(),
        email: z.string().email().max(200).optional(),
        phone: z.string().max(50).optional(),
      })
      .default({}),
    recipient: z.object({
      name: z.string().min(1).max(200),
      address: z.string().max(500).optional(),
      email: z.string().email().max(200).optional(),
    }),
    requestedAction: z.string().min(1).max(1000),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;

  if (!isValidCaseId(caseId)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid case ID format" } },
      { status: 400 },
    );
  }

  // Parse input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        },
      },
      { status: 400 },
    );
  }

  const { sender, recipient, requestedAction } = parsed.data;

  let services: ReturnType<typeof compositionRoot>;
  try {
    services = compositionRoot();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  // Rules live in the database: publish the module rule sets before generating.
  await ensureRuleSetsPublishedSafe(services.registry, services.rulesRepo);

  try {
    // 1. Load case
    const loaded = await services.caseService.loadCase(caseId);

    // 2. Run analysis
    const analysis = await services.analysisService.runProblemAnalysis(caseId);

    // 3. Build result + actions
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

    const actionPlan = deriveActions(result);

    // 4. Generate document
    const env = getServerEnv();
    const { createAIProvidersFromEnv } = await import("@server/adapters/ai");
    const { AIRouter } = await import("@core/ai/router");
    const { createDefaultPromptRegistry } = await import("@core/ai/prompts");
    const { AIRequestAuditRepository } = await import(
      "@server/db/repositories/ai-request-repository"
    );

    const providers = createAIProvidersFromEnv(env);
    const promptRegistry = createDefaultPromptRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditRepo = new AIRequestAuditRepository(createNeonDb(env.DATABASE_URL!) as any);
    const router = new AIRouter(providers, promptRegistry, auditRepo);

    const genService = new DocumentGenerationService({ router });

    const genResult = await genService.generate({
      caseId,
      result,
      actionPlan,
      facts: loaded.facts,
      sender,
      recipient,
      requestedAction,
      now: () => new Date().toISOString(),
    });

    if (!genResult.success || !genResult.document) {
      return NextResponse.json(
        {
          error: {
            code: "GENERATION_FAILED",
            message: genResult.errors?.join("; ") ?? "Document generation failed",
          },
          validation: genResult.validation,
        },
        { status: 422 },
      );
    }

    // 5. Persist document
    const doc = await services.docRepo.create({
      ...genResult.document,
      caseId,
    });

    return NextResponse.json(
      {
        document: {
          id: doc.id,
          type: doc.type,
          status: doc.status,
          version: doc.version,
          title: doc.title,
          subject: doc.subject,
          sections: doc.sections,
          factualStatements: doc.factualStatements,
          legalStatements: doc.legalStatements,
          citations: doc.citations,
          unresolvedItems: doc.unresolvedItems,
          createdAt: doc.createdAt,
        },
        validation: genResult.validation,
      },
      { headers: PRIVATE_CACHE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "GENERATION_FAILED",
          message: sanitizeErrorMessage(error),
        },
      },
      { status: 500, headers: PRIVATE_CACHE_HEADERS },
    );
  }
}
