/**
 * API Route: POST /api/intake/guidance
 *
 * General orientation for a problem that matches NO registered module.
 *
 * Why a separate route instead of appending it to /api/intake/interpret:
 *   - The interpretation is shown to the user immediately; the guidance is
 *     generated afterwards, so a slow or failed guidance call can never
 *     destroy a successful interpretation.
 *   - Each function stays inside its own execution budget.
 *
 * Budget: one reserved AI call per case (server-authoritative, same store as
 * the interpretation budget). No client-supplied counts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntakeServices } from "@server/intake/composition";
import { getBudgetStore } from "@server/intake/budget-store";
import { GENERAL_GUIDANCE_DISCLAIMER } from "@core/intake/service";

export const dynamic = "force-dynamic";

// ── Input validation ─────────────────────────────────────────────────

const guidanceRequestSchema = z
  .object({
    message: z.string().min(10).max(5000),
    caseId: z.string().min(1),
  })
  .strict();

// ── Route handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = guidanceRequestSchema.safeParse(body);
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

  const { message, caseId } = parsed.data;

  // 1. Services
  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // 2. Server-authoritative budget (one guidance call per case slot)
  const budgetStore = getBudgetStore();
  const reservation = await budgetStore.tryReserveBudget(caseId);
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "BUDGET_EXCEEDED",
          message: `AI budget exceeded (${reservation.maxAllowed} calls max)`,
        },
        budget: { current: reservation.currentCount, max: reservation.maxAllowed },
      },
      { status: 429 },
    );
  }

  // 3. Generate guidance
  try {
    const { guidance, aiRequestId } = await services.intakeService.generateGeneralGuidance(
      message,
      { caseId, now: () => new Date().toISOString() },
    );

    return NextResponse.json({
      guidance,
      // Deterministic wording — never model-generated.
      disclaimer: GENERAL_GUIDANCE_DISCLAIMER,
      aiRequestId,
      budget: { current: reservation.currentCount, max: reservation.maxAllowed },
    });
  } catch (error) {
    // Release the slot: nothing was produced for the user.
    await budgetStore.releaseBudget(caseId);

    console.error(
      "[guidance] Error:",
      JSON.stringify(
        {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          detail:
            error instanceof Error && "detail" in error
              ? String((error as Record<string, unknown>).detail)
              : undefined,
          code:
            error instanceof Error && "aiCode" in error
              ? String((error as Record<string, unknown>).aiCode)
              : undefined,
        },
        null,
        0,
      ),
    );

    return NextResponse.json(
      { error: { code: "GUIDANCE_UNAVAILABLE", message: "Could not generate guidance" } },
      { status: 503 },
    );
  }
}
