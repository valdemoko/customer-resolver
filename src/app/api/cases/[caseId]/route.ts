/**
 * Case Summary API — F13 Case Management
 *
 * GET /api/cases/[caseId] — Returns case with status, latest snapshot, timeline summary
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createNeonDb } from "@/server/db/client";
import { cases, caseSnapshots, caseEvents } from "@/server/db/schema";
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

    // Load case
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store", ...CORS_HEADERS } },
      );
    }

    // Load latest snapshot if exists
    let latestSnapshot = null;
    if (caseRow.currentSnapshotId) {
      const [snapRow] = await db
        .select()
        .from(caseSnapshots)
        .where(eq(caseSnapshots.id, caseRow.currentSnapshotId))
        .limit(1);
      latestSnapshot = snapRow ?? null;
    }

    // Load recent timeline events (last 50)
    const recentEvents = await db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId))
      .orderBy(sql`${caseEvents.occurredAt} DESC`)
      .limit(50);

    // Count total events
    const [eventCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caseEvents)
      .where(eq(caseEvents.caseId, caseId));

    return NextResponse.json(
      {
        case: {
          id: caseRow.id,
          problemSlug: caseRow.problemSlug,
          jurisdiction: caseRow.jurisdiction,
          locale: caseRow.locale,
          currency: caseRow.currency,
          status: caseRow.status,
          version: caseRow.version,
          createdAt: caseRow.createdAt,
          updatedAt: caseRow.updatedAt,
        },
        latestSnapshot: latestSnapshot
          ? {
              id: latestSnapshot.id,
              engineVersion: latestSnapshot.engineVersion,
              rulesetHash: latestSnapshot.rulesetHash,
              factIds: latestSnapshot.factIds,
              contradictionIds: latestSnapshot.contradictionIds,
              createdAt: latestSnapshot.createdAt,
            }
          : null,
        timeline: {
          totalEvents: eventCount?.count ?? 0,
          recentEvents: recentEvents.map((e) => ({
            id: e.id,
            type: e.type,
            occurredAt: e.occurredAt,
            payload: e.payload,
          })),
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
