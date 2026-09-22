/**
 * Communications API — F13 Case Management
 *
 * POST /api/cases/[caseId]/communications — Record external communication
 * GET  /api/cases/[caseId]/communications — List communications
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createNeonDb } from "@/server/db/client";
import { cases, caseCommunications, caseEvents } from "@/server/db/schema";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";
import { createEvent } from "@/core/case/events";
import { now as systemNow } from "@/core/shared/temporal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CommunicationSchema = z.object({
  direction: z.enum(["SENT", "RECEIVED", "PHONE_CALL", "IN_PERSON", "OTHER"]),
  channel: z.enum(["EMAIL", "LETTER", "PHONE", "ONLINE_FORM", "IN_PERSON", "OTHER"]),
  counterparty: z.string().min(1).max(200),
  subject: z.string().max(500).optional(),
  summary: z.string().min(1).max(5000),
  linkedEvidenceIds: z.array(z.string()).optional(),
  linkedDocumentId: z.string().optional(),
  relatedActionId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await params;

    if (!isValidCaseId(caseId)) {
      return NextResponse.json(
        { error: "Invalid case ID" },
        { status: 400, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const env = getServerEnv();
    const db = createNeonDb(env.DATABASE_URL!);

    // Verify case exists
    const [caseRow] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: PRIVATE_CACHE_HEADERS },
      );
    }

    // Load communications
    const comms = await db
      .select()
      .from(caseCommunications)
      .where(eq(caseCommunications.caseId, caseId))
      .orderBy(sql`${caseCommunications.occurredAt} DESC`);

    return NextResponse.json(
      {
        caseId,
        communications: comms.map((c) => ({
          id: c.id,
          direction: c.direction,
          channel: c.channel,
          counterparty: c.counterparty,
          subject: c.subject,
          summary: c.summary,
          linkedEvidenceIds: c.linkedEvidenceIds,
          linkedDocumentId: c.linkedDocumentId,
          relatedActionId: c.relatedActionId,
          occurredAt: c.occurredAt,
          createdAt: c.createdAt,
        })),
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

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await params;

    if (!isValidCaseId(caseId)) {
      return NextResponse.json(
        { error: "Invalid case ID" },
        { status: 400, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const body = await request.json();
    const parsed = CommunicationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid communication data", details: parsed.error.flatten() },
        { status: 400, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    const env = getServerEnv();
    const db = createNeonDb(env.DATABASE_URL!);

    // Verify case exists
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: PRIVATE_CACHE_HEADERS },
      );
    }

    const now = systemNow();
    const commId = crypto.randomUUID();
    const data = parsed.data;

    // Insert communication
    await db.insert(caseCommunications).values({
      id: commId,
      caseId,
      direction: data.direction,
      channel: data.channel,
      counterparty: data.counterparty,
      subject: data.subject ?? null,
      summary: data.summary,
      linkedEvidenceIds: data.linkedEvidenceIds ?? [],
      linkedDocumentId: data.linkedDocumentId ?? null,
      relatedActionId: data.relatedActionId ?? null,
      occurredAt: data.occurredAt ?? now,
      createdAt: now,
    });

    // Create timeline event
    const event = createEvent(
      caseId,
      "COMMUNICATION_RECORDED",
      {
        communicationId: commId,
        direction: data.direction,
        channel: data.channel,
        counterparty: data.counterparty,
      },
      now,
    );

    await db.insert(caseEvents).values({
      id: event.id,
      caseId: event.caseId,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });

    return NextResponse.json(
      {
        communication: {
          id: commId,
          direction: data.direction,
          channel: data.channel,
          counterparty: data.counterparty,
          subject: data.subject,
          summary: data.summary,
          occurredAt: data.occurredAt ?? now,
        },
      },
      {
        status: 201,
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
