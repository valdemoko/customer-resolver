/**
 * Internal demo API (Fase 4): create a case for a registered problem module.
 * Calls application services only — never the Drizzle adapter directly.
 * No auth yet (deferred by plan); typed error codes in every response.
 *
 * Requires DATABASE_URL (Neon) — the demo API is server-side only and never
 * touches a test DB. Returns 503 with a typed error when unset.
 */
import { NextResponse } from "next/server";

import { CaseService } from "@core/case/service";
import { ProblemRegistry } from "@core/problems";
import { createNeonDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { getServerEnv } from "@/lib/env";
import { cancellationChargeModule } from "@problems/cancellation-charge";

export const dynamic = "force-dynamic";

type Repo = ConstructorParameters<typeof DrizzleCaseRepository>[0];

/** Composition root for API routes: registry + services over the real adapter. */
function compositionRoot(): { registry: ProblemRegistry; caseService: CaseService } {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the problems API (503 until configured)");
  }
  const registry = new ProblemRegistry();
  registry.register(cancellationChargeModule);
  const repo = new DrizzleCaseRepository(createNeonDb(DATABASE_URL) as unknown as Repo);
  return { registry, caseService: new CaseService(repo) };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ problemKey: string }> },
) {
  const { problemKey } = await params;
  let body: { ownerId?: string };
  try {
    body = (await request.json()) as { ownerId?: string };
  } catch {
    body = {};
  }

  let services: ReturnType<typeof compositionRoot>;
  try {
    services = compositionRoot();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not configured (DATABASE_URL missing)",
        },
      },
      { status: 503 },
    );
  }

  if (!services.registry.has(problemKey)) {
    return NextResponse.json(
      { error: { code: "UNKNOWN_PROBLEM", message: `Unknown problem: ${problemKey}` } },
      { status: 404 },
    );
  }

  try {
    const created = await services.caseService.createCase({
      problemSlug: problemKey,
      jurisdiction: "ES",
      locale: "es-ES",
      currency: "EUR",
      ownerId: body.ownerId ?? "anonymous",
    } as never);
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CASE_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Unexpected error",
        },
      },
      { status: 500 },
    );
  }
}
