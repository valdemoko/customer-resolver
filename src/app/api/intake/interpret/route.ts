/**
 * API Route: POST /api/intake/interpret
 *
 * Interprets a user's problem description using AI.
 * Creates a case ONLY after successful interpretation (no orphan cases).
 * Budget: server enforces MAX 3 calls per case.
 * Client NEVER sends callCount — server is the only authority.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntakeServices } from "@server/intake/composition";
import { tryReserveBudget, releaseBudget } from "@server/intake/budget-store";

export const dynamic = "force-dynamic";

// ── Input validation ─────────────────────────────────────────────────

const interpretRequestSchema = z
  .object({
    message: z.string().min(10).max(5000),
    caseId: z.string().optional(),
  })
  .strict();

// ── Route handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = interpretRequestSchema.safeParse(body);
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

  const { message, caseId: providedCaseId } = parsed.data;

  // 2. Create services
  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // 3. Budget enforcement — use provided caseId or a temporary key
  //    If no caseId: use a temp key so budget is tracked before case creation
  const budgetKey =
    providedCaseId ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const budget = tryReserveBudget(budgetKey);
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "BUDGET_EXCEEDED",
          message: `AI interpretation budget exceeded (${budget.maxAllowed} calls max)`,
        },
        budget: {
          current: budget.currentCount,
          max: budget.maxAllowed,
        },
      },
      { status: 429 },
    );
  }

  // 4. Call AI interpretation
  try {
    const { interpretation, aiRequestId } = await services.intakeService.interpretUserMessage(
      message,
      {
        caseId: providedCaseId,
        interpretationCount: budget.currentCount - 1, // 0-indexed for the service
        now: () => new Date().toISOString(),
      },
    );

    // 5. Route the interpretation
    const routing = services.intakeService.routeInterpretation(interpretation);

    // 6. Create case AFTER AI success (spec §8.1: no orphan cases on failure)
    //
    // The routed module IS persisted here: the questionnaire, the rule engine and
    // the result all resolve through the case's problem slug + jurisdiction. A
    // case created as "unknown" can never ask its questions nor be analysed, so
    // the routing decision must not stay in memory only.
    // A module is usable when routing produced a candidate AND its jurisdiction
    // is supported: only then can questions be asked and rules be evaluated.
    const routedKey = routing.moduleCandidate?.problemKey;
    const moduleIsUsable =
      routing.status !== "UNSUPPORTED" &&
      routing.status !== "UNSUPPORTED_JURISDICTION" &&
      !!routedKey &&
      services.registry.has(routedKey);
    const routedModule = routedKey && moduleIsUsable ? services.registry.get(routedKey) : null;
    const caseProblemSlug = routedModule ? routedModule.key : "unknown";
    const caseJurisdiction = routedModule ? (routedModule.jurisdictions[0] ?? "UNKNOWN") : "UNKNOWN";

    let caseId = providedCaseId;
    if (!caseId) {
      try {
        const created = await services.caseService.createCase({
          problemSlug: caseProblemSlug,
          jurisdiction: caseJurisdiction,
          locale: "es-ES",
          currency: "EUR",
          ownerId: "anonymous",
        } as never);
        caseId = created.id;
        // Transfer budget tracking from temp key to real caseId
        releaseBudget(budgetKey);
      } catch (caseErr) {
        console.error("[interpret] Case creation failed:", JSON.stringify({
          message: caseErr instanceof Error ? caseErr.message : String(caseErr),
          name: caseErr instanceof Error ? caseErr.name : typeof caseErr,
          stack: caseErr instanceof Error ? caseErr.stack?.slice(0, 300) : undefined,
        }));
        releaseBudget(budgetKey);
        return NextResponse.json(
          { error: { code: "CASE_CREATE_FAILED", message: "Could not create case" } },
          { status: 500 },
        );
      }
    }

    // 7. Select the first question whenever a module is usable.
    //    Questions are how the required facts get collected, so they must be
    //    offered as soon as the module is known — not only on a perfect route.
    let nextQuestion = null;
    if (routedModule) {
      const loaded = await services.caseService.loadCase(caseId);
      const confirmedFacts = loaded.facts
        .filter((f) => f.status === "CONFIRMED")
        .map((f) => ({ key: f.key, status: f.status }));
      nextQuestion = services.intakeService.selectNextQuestion(
        routedModule,
        confirmedFacts,
        new Map(),
      );
    }

    // 8. Return structured response (no internal scores/thresholds)
    return NextResponse.json({
      caseId,
      interpretation: {
        summary: interpretation.summary,
        candidateModules: interpretation.candidateModules,
        factCandidates: interpretation.factCandidates,
        missingInformation: interpretation.missingInformation,
        ambiguities: interpretation.ambiguities,
        entities: interpretation.entities,
        jurisdictionHints: interpretation.jurisdictionHints,
      },
      routing: {
        status: routing.status,
        moduleKey: routedModule?.key,
        moduleTitle: routedModule?.title,
        userExplanation: routing.userExplanation,
      },
      nextQuestion,
      budget: {
        current: budget.currentCount,
        max: budget.maxAllowed,
      },
      aiRequestId,
    });
  } catch (error) {
    // Release budget slot on failure
    releaseBudget(budgetKey);

    const errorMsg = error instanceof Error ? error.message : "Unexpected error";

    // Log ALL errors for debugging (never expose internals to client)
    console.error("[interpret] Error:", JSON.stringify({
      name: error instanceof Error ? error.name : typeof error,
      message: errorMsg,
      detail: error instanceof Error && "detail" in error ? String((error as Record<string, unknown>).detail) : undefined,
      code: error instanceof Error && "aiCode" in error ? String((error as Record<string, unknown>).aiCode) : undefined,
      causeMessage: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
      causeDetail: error instanceof Error && error.cause && typeof error.cause === "object" && "detail" in error.cause ? String((error.cause as Record<string, unknown>).detail) : undefined,
    }, null, 0));

    // Map known error types
    if (errorMsg.includes("budget exceeded")) {
      return NextResponse.json(
        {
          error: { code: "BUDGET_EXCEEDED", message: errorMsg },
          budget: { current: budget.currentCount, max: budget.maxAllowed },
        },
        { status: 429 },
      );
    }

    if (errorMsg.includes("AI") || errorMsg.includes("provider")) {
      return NextResponse.json(
        { error: { code: "AI_UNAVAILABLE", message: "AI service temporarily unavailable" } },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: { code: "INTERPRETATION_FAILED", message: "Could not interpret your message" } },
      { status: 500 },
    );
  }
}
