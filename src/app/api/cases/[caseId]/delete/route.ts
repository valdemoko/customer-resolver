/**
 * Case Deletion API — F16 Privacy/GDPR Compliance
 *
 * DELETE /api/cases/[caseId]/delete — Permanently deletes a case and all associated data
 *
 * This endpoint provides technical functionality supporting the right to erasure.
 * Since we don't have authentication, deletion is based on caseId only.
 *
 * WARNING: This is a destructive operation. Once deleted, the case cannot be recovered.
 *
 * Cleanup includes:
 * - Database records (cascade handles most child tables)
 * - R2/object storage files (best-effort)
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createNeonDb } from "@/server/db/client";
import {
  cases,
  caseFacts,
  caseContradictions,
  evidenceFactLinks,
  caseSnapshots,
  ruleEvaluations,
  caseEvents,
  generatedDocuments,
  researchSessions,
  researchFindings,
  researchSources,
  researchConflicts,
  caseCommunications,
} from "@/server/db/schema";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * DELETE /api/cases/[caseId]/delete
 *
 * Deletes a case and all associated data:
 * - Case record
 * - Facts
 * - Contradictions
 * - Evidence links
 * - Snapshots
 * - Rule evaluations
 * - Timeline events
 * - Documents
 * - Research sessions and related data
 * - Communications
 *
 * Uses foreign key cascades where available, explicit deletion where not.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;

    if (!isValidCaseId(caseId)) {
      return NextResponse.json(
        { error: "Invalid case ID" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const env = getServerEnv();
    if (!env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    const db = createNeonDb(env.DATABASE_URL);

    // Check if case exists
    const [existingCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!existingCase) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Load facts first (needed for evidence links deletion)
    const caseFactsData = await db
      .select({ id: caseFacts.id })
      .from(caseFacts)
      .where(eq(caseFacts.caseId, caseId));
    const caseFactIds = caseFactsData.map((f) => f.id);

    // Collect R2 storage keys before cascade delete (best-effort)
    const storageKeys: string[] = [];
    try {
      const { physicalObjects } = await import("@/server/db/schema");
      const physicalRows = await db
        .select({ storageKey: physicalObjects.storageKey })
        .from(physicalObjects)
        .where(eq(physicalObjects.caseId, caseId));
      storageKeys.push(...physicalRows.map((r) => r.storageKey));
    } catch {
      // Physical objects query failed — proceed with DB deletion
    }

    // Delete in reverse dependency order
    // Note: Many tables have ON DELETE CASCADE, but we delete explicitly
    // for clarity and to ensure complete cleanup

    // 1. Research-related data (depends on research_sessions)
    // Research conflicts → sources → findings → sessions
    const researchSessionIds = await db
      .select({ id: researchSessions.id })
      .from(researchSessions)
      .where(eq(researchSessions.caseId, caseId));

    for (const session of researchSessionIds) {
      await db.delete(researchConflicts).where(
        eq(researchConflicts.researchId, session.id),
      );
      await db.delete(researchSources).where(
        eq(researchSources.researchId, session.id),
      );
      await db.delete(researchFindings).where(
        eq(researchFindings.researchId, session.id),
      );
    }
    await db.delete(researchSessions).where(
      eq(researchSessions.caseId, caseId),
    );

    // 2. Communications
    await db.delete(caseCommunications).where(
      eq(caseCommunications.caseId, caseId),
    );

    // 3. Documents
    await db.delete(generatedDocuments).where(
      eq(generatedDocuments.caseId, caseId),
    );

    // 4. Rule evaluations
    await db.delete(ruleEvaluations).where(
      eq(ruleEvaluations.caseId, caseId),
    );

    // 5. Case events (timeline)
    await db.delete(caseEvents).where(
      eq(caseEvents.caseId, caseId),
    );

    // 6. Case snapshots
    await db.delete(caseSnapshots).where(
      eq(caseSnapshots.caseId, caseId),
    );

    // 7. Evidence links (via fact IDs)
    if (caseFactIds.length > 0) {
      await db
        .delete(evidenceFactLinks)
        .where(
          sql`${evidenceFactLinks.factId} IN ${caseFactIds}`,
        );
    }

    // 8. Contradictions
    await db.delete(caseContradictions).where(
      eq(caseContradictions.caseId, caseId),
    );

    // 9. Facts
    await db.delete(caseFacts).where(
      eq(caseFacts.caseId, caseId),
    );

    // 10. Case itself
    await db.delete(cases).where(
      eq(cases.id, caseId),
    );

    // 11. Clean up R2 objects (best-effort, after DB deletion)
    if (storageKeys.length > 0) {
      try {
        const env = getServerEnv();
        if (env.R2_ACCOUNT_ID && env.R2_BUCKET_DOCUMENTS && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
          const { R2ObjectStorage } = await import("@server/adapters/storage/r2-object-storage");
          const storage = new R2ObjectStorage({
            accountId: env.R2_ACCOUNT_ID,
            bucketName: env.R2_BUCKET_DOCUMENTS,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          });
          for (const key of storageKeys) {
            await storage.delete(key).catch(() => {}); // best-effort
          }
        }
      } catch {
        // R2 cleanup failed — objects are orphaned but DB is consistent
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Caso eliminado permanentemente",
        deletedAt: new Date().toISOString(),
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
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
