/**
 * Case Transition API — F13 Case Management
 *
 * POST /api/cases/[caseId]/transition — Explicit state transition (escalate, close, reopen)
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createNeonDb } from "@/server/db/client";
import { cases } from "@/server/db/schema";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";
import {
  transition,
  InvalidCaseStateTransition,
} from "@/core/case/state-machine";
import { createEvent } from "@/core/case/events";
import { now as systemNow } from "@/core/shared/temporal";
import { DrizzleCaseRepository } from "@/server/db/repositories/case-repository";
import type { CaseStatus } from "@/core/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TransitionSchema = z.object({
  event: z.enum([
    "ESCALATE",
    "CLOSE_CASE",
    "REOPEN",
    "START_COLLECTING",
    "SUBMIT_FOR_ANALYSIS",
    "RESPONSE_RECEIVED",
  ]),
  reason: z.string().max(1000).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;

    if (!isValidCaseId(caseId)) {
      return NextResponse.json(
        { error: "Invalid case ID" },
        { status: 400, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const body = await request.json();
    const parsed = TransitionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transition data", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const env = getServerEnv();
    const db = createNeonDb(env.DATABASE_URL!) as unknown as ConstructorParameters<typeof DrizzleCaseRepository>[0];
    const repo = new DrizzleCaseRepository(db);

    // Load case
    const [caseRow] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const currentStatus = caseRow.status as CaseStatus;
    const now = systemNow();

    // Apply state transition
    let transitionResult;
    try {
      transitionResult = transition({
        current: currentStatus,
        event: parsed.data.event,
      });
    } catch (error) {
      if (error instanceof InvalidCaseStateTransition) {
        return NextResponse.json(
          {
            error: "Invalid state transition",
            currentStatus,
            attemptedEvent: parsed.data.event,
            message: error.message,
          },
          {
            status: 409,
            headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS },
          },
        );
      }
      throw error;
    }

    if (!transitionResult.changed) {
      return NextResponse.json(
        {
          message: "Case already in target state",
          currentStatus,
          newStatus: transitionResult.next,
        },
        {
          status: 200,
          headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS },
        },
      );
    }

    // Create event
    const event = createEvent(
      caseId,
      "CASE_STATUS_CHANGED",
      {
        from: currentStatus,
        to: transitionResult.next,
        event: parsed.data.event,
        reason: parsed.data.reason ?? null,
      },
      now,
    );

    // Save
    const unit = {
      caseId,
      nextStatus: transitionResult.next,
      newFacts: [],
      updatedFacts: [],
      newContradictions: [],
      updatedContradictions: [],
      newEvidence: [],
      updatedEvidence: [],
      newEvidenceLinks: [],
      removedEvidenceLinks: [],
      newSnapshot: undefined,
      newEvents: [event],
      newPhysicalObjects: [],
      newProcessingRuns: [],
      newDocumentLocations: [],
      newFactCandidates: [],
    };

    const updatedCase = await repo.saveUnit(unit, caseRow.version);

    return NextResponse.json(
      {
        case: {
          id: updatedCase.id,
          previousStatus: currentStatus,
          newStatus: updatedCase.status,
          version: updatedCase.version,
        },
        transition: {
          event: parsed.data.event,
          reason: parsed.data.reason,
          timestamp: now,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          ...CORS_HEADERS,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
    );
  }
}
