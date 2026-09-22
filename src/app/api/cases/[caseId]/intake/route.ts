/**
 * API Route: GET/POST /api/cases/:caseId/intake
 *
 * GET: Returns current case status, confirmed facts, and next question.
 * POST: Submits user answer to a question (creates confirmed fact).
 *
 * Deterministic question selection — AI does NOT choose questions.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntakeServices } from "@server/intake/composition";
import { moduleIntakeRequirements } from "@server/rules/publish-module-rules";
import { factValueSchema } from "@core/intake/schemas";
import type { KnownFact } from "@core/problems";
import { factValueMap } from "@core/problems/intake";
import type { QuestionSelection } from "@core/intake/types";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import type { FactKey, FactValue } from "@core/types";

export const dynamic = "force-dynamic";

// ── Intake progress ──────────────────────────────────────────────────

interface LoadedFactsView {
  readonly facts: readonly { key: FactKey; value: unknown; status: string }[];
}

interface IntakeProgressView {
  readonly nextQuestion: QuestionSelection | null;
  readonly allRequiredConfirmed: boolean;
}

/**
 * Deterministic progress for a case: the next fact the analysis still needs, and
 * whether the questionnaire is finished.
 *
 * "Finished" means every fact the module's rules read is confirmed — not "the
 * module's three required facts are present". Using the latter ended the form
 * after three questions, so the rules ran with half their inputs missing and
 * every claim came back INSUFFICIENT_DATA.
 */
function resolveIntakeProgress(
  services: ReturnType<typeof createIntakeServices>,
  loaded: LoadedFactsView,
  problemKey: string,
): IntakeProgressView {
  try {
    const problemModule = services.registry.get(problemKey);
    const requirements = moduleIntakeRequirements(problemModule);
    const knownFacts: KnownFact[] = loaded.facts.map((f) => ({
      key: f.key,
      status: f.status as KnownFact["status"],
    }));
    const factValues = factValueMap(loaded.facts);

    return {
      nextQuestion: services.intakeService.selectNextQuestion(
        problemModule,
        knownFacts,
        factValues,
        requirements.neededFactKeys,
      ),
      allRequiredConfirmed: services.intakeService.intakeRequirementsSatisfied(
        problemModule,
        knownFacts,
        factValues,
        requirements.neededFactKeys,
      ),
    };
  } catch {
    // Unknown module — the case simply has no next question.
    return { nextQuestion: null, allRequiredConfirmed: false };
  }
}

// ── POST input validation ────────────────────────────────────────────

const answerRequestSchema = z
  .object({
    factKey: z.string().min(1),
    value: factValueSchema.optional(),
    decision: z.enum(["confirm", "skip"]).default("confirm"),
  })
  .strict();

// ── GET handler ──────────────────────────────────────────────────────

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

  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // Load case
  let loaded;
  try {
    loaded = await services.caseService.loadCase(caseId);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  // Get confirmed facts
  const confirmedFacts = loaded.facts
    .filter((f) => f.status === "CONFIRMED")
    .map((f) => ({
      key: f.key,
      value: f.value,
      status: f.status,
      provenance: f.provenance,
    }));

  // Get next question if module is known
  const problemKey = loaded.case.problemSlug;
  const progress = problemKey
    ? resolveIntakeProgress(services, loaded, problemKey)
    : { nextQuestion: null, allRequiredConfirmed: false };
  const { nextQuestion, allRequiredConfirmed } = progress;

  return NextResponse.json({
    caseId,
    status: loaded.case.status,
    problemKey,
    confirmedFacts,
    nextQuestion,
    allRequiredConfirmed,
    factCount: loaded.facts.length,
  }, { headers: PRIVATE_CACHE_HEADERS });
}

// ── POST handler ─────────────────────────────────────────────────────

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

  const parsed = answerRequestSchema.safeParse(body);
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

  const { factKey, value, decision } = parsed.data;

  // Create services
  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // Load case
  try {
    await services.caseService.loadCase(caseId);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  // Handle skip — no fact created
  if (decision === "skip") {
    return NextResponse.json({
      success: true,
      decision: "skipped",
      factKey,
      message: "Question skipped.",
    });
  }

  // Confirm — require value
  if (!value) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Value required for confirm" } },
      { status: 400 },
    );
  }

  // Validate factKey
  let factKeyValid = false;
  for (const mod of services.registry.list()) {
    if (mod.factCatalogue.some((f) => f.key === factKey)) {
      factKeyValid = true;
      break;
    }
  }
  if (!factKeyValid) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: `Unknown fact key: ${factKey}` } },
      { status: 400 },
    );
  }

  // Create confirmed fact
  try {
    const result = await services.caseService.confirmFactForCase(caseId, {
      key: factKey as FactKey,
      value: value as unknown as FactValue,
    });

    // Get next question after confirmation
    const loaded = await services.caseService.loadCase(caseId);
    const problemKey = loaded.case.problemSlug;
    const progress = problemKey
      ? resolveIntakeProgress(services, loaded, problemKey)
      : { nextQuestion: null, allRequiredConfirmed: false };
    const { nextQuestion, allRequiredConfirmed } = progress;

    return NextResponse.json({
      success: true,
      decision: "confirmed",
      factKey,
      fact: {
        id: result.fact.id,
        key: result.fact.key,
        value: result.fact.value,
        status: result.fact.status,
      },
      contradictionDetected: !!result.contradiction,
      nextQuestion,
      allRequiredConfirmed,
    });
  } catch (error) {
    const msg = sanitizeErrorMessage(error);

    if (msg.includes("CONCURRENT")) {
      return NextResponse.json(
        { error: { code: "CONCURRENT_UPDATE", message: "Case was modified concurrently" } },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: { code: "CONFIRMATION_FAILED", message: "Could not confirm fact" } },
      { status: 500 },
    );
  }
}
