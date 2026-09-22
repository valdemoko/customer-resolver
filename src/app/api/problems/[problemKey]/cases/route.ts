/**
 * POST /api/problems/[problemKey]/cases
 *
 * Deterministic case entry. When the person already chose a problem (from
 * `/problemas/[slug]`, the problem index or the fallback screen), there is
 * nothing to interpret: the module is known, so the case is created directly
 * with that problem key and the first question comes back in the same response.
 *
 * Why this exists: the problem page used to send the person to
 * `/resolver?q=<title>`, which re-entered through the AI interpretation. That
 * asked an LLM to guess something the site already knew, consumed budget, and
 * turned every provider outage into a dead end (503) for a flow that needs no
 * model at all.
 *
 * Rules:
 *  - Only published problems (catalogue `available` + registered module) are
 *    accepted; anything else is a 404, never a silent empty case.
 *  - The case is created with the module's own jurisdiction/locale, never a
 *    hardcoded value, so rules can actually be evaluated against it.
 *  - No AI call happens here.
 */
import { NextResponse } from "next/server";

import { createIntakeServices } from "@server/intake/composition";
import { caseDefaultsForModule, resolveIntakeProgress } from "@server/intake/progress";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { isValidProblemKey, sanitizeErrorMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: PRIVATE_CACHE_HEADERS },
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ problemKey: string }> },
) {
  const { problemKey } = await params;

  if (!isValidProblemKey(problemKey)) {
    return errorResponse("INVALID_INPUT", "Invalid problem key format", 400);
  }

  const catalogueEntry = getAvailableProblems().find((p) => p.key === problemKey);
  if (!catalogueEntry) {
    return errorResponse(
      "UNKNOWN_PROBLEM",
      "Ese problema no tiene un análisis disponible todavía.",
      404,
    );
  }

  // No request body is read on purpose. The old version accepted an `ownerId`
  // from the caller, which let anyone attribute a case to someone else; with no
  // authentication to bind an owner to, every case is created as anonymous —
  // exactly as the interpretation route does.
  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "El servicio de análisis no está configurado en este entorno.",
      503,
    );
  }

  if (!services.registry.has(problemKey)) {
    return errorResponse(
      "UNKNOWN_PROBLEM",
      "Ese problema no tiene un análisis disponible todavía.",
      404,
    );
  }

  const problemModule = services.registry.get(problemKey);
  const defaults = caseDefaultsForModule(problemModule);

  let caseId: string;
  try {
    const created = await services.caseService.createCase({
      ...defaults,
      ownerId: "anonymous",
    } as never);
    caseId = created.id;
  } catch (error) {
    console.error(
      "[problems/cases] Case creation failed:",
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        problemKey,
      }),
    );
    return errorResponse(
      "CASE_CREATE_FAILED",
      sanitizeErrorMessage(error),
      500,
    );
  }

  // First question in the same round trip: no waterfall, no intermediate screen.
  const loaded = await services.caseService.loadCase(caseId);
  const { nextQuestion, allRequiredConfirmed } = resolveIntakeProgress(
    services,
    loaded,
    problemKey,
  );

  return NextResponse.json(
    {
      caseId,
      problemKey,
      problemTitle: catalogueEntry.title,
      status: loaded.case.status,
      nextQuestion,
      allRequiredConfirmed,
    },
    { status: 201, headers: PRIVATE_CACHE_HEADERS },
  );
}
