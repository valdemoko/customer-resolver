/**
 * API Route: POST /api/intake/confirm
 *
 * Confirms or rejects an AI fact candidate.
 * Confirmation creates a CONFIRMED Fact via confirmFactForCase().
 * Rejection discards the candidate — no Fact is created.
 *
 * All validation happens server-side. Client data is never trusted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntakeServices } from "@server/intake/composition";
import { factValueSchema } from "@core/intake/schemas";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import type { FactKey, FactValue } from "@core/types";

export const dynamic = "force-dynamic";

// ── Input validation ─────────────────────────────────────────────────

const confirmRequestSchema = z
  .object({
    caseId: z.string().min(1),
    candidateId: z.string().min(1),
    factKey: z.string().min(1),
    decision: z.enum(["confirm", "reject"]),
    // Value to confirm — only needed for "confirm" decision
    value: factValueSchema.optional(),
    // Corrected value — for "confirm" with modification
    correctedValue: factValueSchema.optional(),
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

  const parsed = confirmRequestSchema.safeParse(body);
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

  const { caseId, factKey, decision, value, correctedValue } = parsed.data;

  // 2. Validate caseId format
  if (!isValidCaseId(caseId)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid case ID format" } },
      { status: 400 },
    );
  }

  // 3. Validate decision-specific fields
  if (decision === "confirm" && !value && !correctedValue) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Value required for confirm decision" } },
      { status: 400 },
    );
  }

  // 3. Create services
  let services: ReturnType<typeof createIntakeServices>;
  try {
    services = createIntakeServices();
  } catch {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service not configured" } },
      { status: 503 },
    );
  }

  // 4. Load case — verify it exists and get its module
  let loadedCase;
  try {
    loadedCase = await services.caseService.loadCase(caseId);
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Case not found" } },
      { status: 404 },
    );
  }

  // 5. Validate factKey belongs to the case's assigned module
  const caseModule = loadedCase.case.problemSlug;
  if (caseModule && caseModule !== "unknown") {
    try {
      const mod = services.registry.get(caseModule);
      if (!mod.factCatalogue.some((f) => f.key === factKey)) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_INPUT",
              message: `Fact key '${factKey}' does not belong to module '${caseModule}'`,
            },
          },
          { status: 400 },
        );
      }
    } catch {
      // Module not found — fall through to global check
    }
  } else {
    // Case has no module assigned yet — validate against any module
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
  }

  // 6. Handle decision
  if (decision === "reject") {
    // Rejection: no Fact is created. Candidate remains unconfirmed.
    // Return success — the question selector will move to the next question.
    return NextResponse.json({
      success: true,
      decision: "rejected",
      factKey,
      message: "Candidate rejected. The system will ask another question.",
    });
  }

  // 7. Confirm: determine the value to use
  const finalValue = correctedValue ?? value;
  if (!finalValue) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "No value provided for confirmation" } },
      { status: 400 },
    );
  }

  // 8. Create confirmed fact via F1 invariants
  try {
    const result = await services.caseService.confirmFactForCase(caseId, {
      key: factKey as FactKey,
      value: finalValue as unknown as FactValue,
    });

    return NextResponse.json({
      success: true,
      decision: "confirmed",
      factKey,
      fact: {
        id: result.fact.id,
        key: result.fact.key,
        value: result.fact.value,
        status: result.fact.status,
        provenance: result.fact.provenance,
      },
      contradictionDetected: !!result.contradiction,
      contradictionId: result.contradiction?.id,
    });
  } catch (error) {
    const msg = sanitizeErrorMessage(error);

    if (msg.includes("CONCURRENT")) {
      return NextResponse.json(
        {
          error: {
            code: "CONCURRENT_UPDATE",
            message: "Case was modified concurrently. Please retry.",
          },
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: { code: "CONFIRMATION_FAILED", message: "Could not confirm fact" } },
      { status: 500 },
    );
  }
}
