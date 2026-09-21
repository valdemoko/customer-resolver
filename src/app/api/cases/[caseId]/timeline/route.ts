/**
 * Case Timeline API — F13 Case Management
 *
 * GET /api/cases/[caseId]/timeline — Returns chronological case events
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createNeonDb } from "@/server/db/client";
import { cases, caseEvents } from "@/server/db/schema";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
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
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    // Parse pagination
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100"), 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

    // Load events
    const events = await db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId))
      .orderBy(sql`${caseEvents.occurredAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId));

    // Generate human-readable descriptions
    const EVENT_DESCRIPTIONS: Record<string, string> = {
      CASE_CREATED: "Caso creado",
      CASE_STATUS_CHANGED: "Estado del caso actualizado",
      FACT_ADDED: "Nuevo dato confirmado",
      FACT_UPDATED: "Dato actualizado",
      FACT_SUPERSEDED: "Dato reemplazado por información más reciente",
      CONTRADICTION_DETECTED: "Información contradictoria detectada",
      CONTRADICTION_RESOLVED: "Contradicción resuelta",
      EVIDENCE_CREATED: "Nueva evidencia añadida",
      EVIDENCE_STATUS_CHANGED: "Estado de evidencia actualizado",
      EVIDENCE_REPLACED: "Evidencia reemplazada",
      EVIDENCE_LINKED_TO_FACT: "Evidencia vinculada a un dato",
      EVIDENCE_UNLINKED_FROM_FACT: "Evidencia desvinculada de un dato",
      SNAPSHOT_CREATED: "Análisis del caso actualizado",
      CASE_UPDATED: "Caso actualizado",
      DOCUMENT_UPLOADED: "Documento subido",
      ANALYSIS_RECALCULATED: "Análisis recalculado con nueva información",
      DOCUMENT_GENERATED: "Documento generado",
      DOCUMENT_FINALIZED: "Documento finalizado",
      COMMUNICATION_RECORDED: "Comunicación registrada",
      FOLLOW_UP_CREATED: "Seguimiento creado",
      CASE_ESCALATED: "Caso escalado",
      CASE_REOPENED: "Caso reabierto",
      CASE_CLOSED: "Caso cerrado",
    };

    return NextResponse.json(
      {
        caseId,
        totalEvents: countResult?.count ?? 0,
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          occurredAt: e.occurredAt,
          payload: e.payload,
          description: EVENT_DESCRIPTIONS[e.type] ?? e.type,
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
