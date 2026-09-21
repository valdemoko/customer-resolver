/**
 * Case Data Export API — F16 Privacy/GDPR Compliance
 *
 * GET /api/cases/[caseId]/data — Returns all case data in JSON format
 *
 * This endpoint provides technical functionality supporting data portability.
 * Returns case data including facts, evidence, timeline, and results.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createNeonDb } from "@/server/db/client";
import {
  cases,
  caseFacts,
  caseContradictions,
  evidence,
  evidenceFactLinks,
  caseSnapshots,
  ruleEvaluations,
  caseEvents,
  physicalObjects,
  generatedDocuments,
  aiRequests,
  aiBudgets,
  caseCommunications,
} from "@/server/db/schema";
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

/**
 * GET /api/cases/[caseId]/data
 *
 * Returns complete case data for data portability.
 * Format: JSON with all case information.
 */
export async function GET(
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

    // Load case
    const [caseRow] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Load all related data in parallel
    const [
      factsData,
      contradictionsData,
      evidenceData,
      evidenceLinksData,
      snapshotsData,
      evaluationsData,
      eventsData,
      physicalObjectsData,
      documentsData,
      aiRequestsData,
      aiBudgetsData,
      communicationsData,
    ] = await Promise.all([
      // Facts
      db.select().from(caseFacts).where(eq(caseFacts.caseId, caseId)),

      // Contradictions
      db.select().from(caseContradictions).where(eq(caseContradictions.caseId, caseId)),

      // Evidence
      db.select().from(evidence).where(eq(evidence.caseId, caseId)),

      // Evidence links (joined through facts)
      db
        .select({
          id: evidenceFactLinks.id,
          evidenceId: evidenceFactLinks.evidenceId,
          factId: evidenceFactLinks.factId,
          relation: evidenceFactLinks.relation,
          createdAt: evidenceFactLinks.createdAt,
        })
        .from(evidenceFactLinks)
        .innerJoin(caseFacts, eq(evidenceFactLinks.factId, caseFacts.id))
        .where(eq(caseFacts.caseId, caseId)),

      // Snapshots
      db.select().from(caseSnapshots).where(eq(caseSnapshots.caseId, caseId)),

      // Rule evaluations
      db.select().from(ruleEvaluations).where(eq(ruleEvaluations.caseId, caseId)),

      // Timeline events
      db
        .select()
        .from(caseEvents)
        .where(eq(caseEvents.caseId, caseId))
        .orderBy(sql`${caseEvents.occurredAt} ASC`),

      // Physical objects
      db.select().from(physicalObjects).where(eq(physicalObjects.caseId, caseId)),

      // Generated documents
      db.select().from(generatedDocuments).where(eq(generatedDocuments.caseId, caseId)),

      // AI requests
      db.select().from(aiRequests).where(eq(aiRequests.caseId, caseId)),

      // AI budgets
      db.select().from(aiBudgets).where(eq(aiBudgets.caseId, caseId)),

      // Communications
      db.select().from(caseCommunications).where(eq(caseCommunications.caseId, caseId)),
    ]);

    // Build complete data export
    const exportData = {
      _exportMetadata: {
        exportedAt: new Date().toISOString(),
        formatVersion: "1.0",
        caseId: caseId,
        dataSubjectRequest: "GDPR Art. 20 - Data Portability",
      },
      case: {
        id: caseRow.id,
        problemSlug: caseRow.problemSlug,
        jurisdiction: caseRow.jurisdiction,
        locale: caseRow.locale,
        currency: caseRow.currency,
        status: caseRow.status,
        version: caseRow.version,
        ownerId: caseRow.ownerId,
        createdAt: caseRow.createdAt,
        updatedAt: caseRow.updatedAt,
      },
      facts: factsData.map((f) => ({
        id: f.id,
        key: f.key,
        value: f.value,
        status: f.status,
        provenance: f.provenance,
        evidenceRefs: f.evidenceRefs,
        createdAt: f.createdAt,
      })),
      contradictions: contradictionsData.map((c) => ({
        id: c.id,
        factIdA: c.factIdA,
        factIdB: c.factIdB,
        factKey: c.factKey,
        status: c.status,
        detectedAt: c.detectedAt,
        resolvedAt: c.resolvedAt,
      })),
      evidence: evidenceData.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        source: e.source,
        content: e.content,
        label: e.label,
        checksum: e.checksum,
        createdAt: e.createdAt,
      })),
      evidenceLinks: evidenceLinksData.map((el) => ({
        id: el.id,
        factId: el.factId,
        evidenceId: el.evidenceId,
        relation: el.relation,
        createdAt: el.createdAt,
      })),
      snapshots: snapshotsData.map((s) => ({
        id: s.id,
        engineVersion: s.engineVersion,
        rulesetHash: s.rulesetHash,
        factIds: s.factIds,
        contradictionIds: s.contradictionIds,
        createdAt: s.createdAt,
      })),
      ruleEvaluations: evaluationsData.map((e) => ({
        ruleKey: e.ruleKey,
        ruleVersion: e.ruleVersion,
        status: e.status,
        evaluatedAt: e.evaluatedAt,
      })),
      timeline: eventsData.map((ev) => ({
        id: ev.id,
        type: ev.type,
        occurredAt: ev.occurredAt,
        payload: ev.payload,
      })),
      physicalObjects: physicalObjectsData.map((po) => ({
        id: po.id,
        storageKey: po.storageKey,
        mimeType: po.mimeType,
        sizeBytes: po.sizeBytes,
        checksumSha256: po.checksumSha256,
        originalFilename: po.originalFilename,
        status: po.status,
        createdAt: po.createdAt,
      })),
      generatedDocuments: documentsData.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        version: d.version,
        format: d.format,
        title: d.title,
        recipient: d.recipient,
        subject: d.subject,
        createdAt: d.createdAt,
      })),
      aiRequests: aiRequestsData.map((ar) => ({
        id: ar.id,
        task: ar.task,
        provider: ar.provider,
        model: ar.model,
        status: ar.status,
        usage: ar.usage,
        durationMs: ar.durationMs,
        createdAt: ar.createdAt,
      })),
      aiBudgets: aiBudgetsData.map((ab) => ({
        task: ab.task,
        count: ab.count,
        maxAllowed: ab.maxAllowed,
      })),
      communications: communicationsData.map((c) => ({
        id: c.id,
        direction: c.direction,
        channel: c.channel,
        counterparty: c.counterparty,
        subject: c.subject,
        summary: c.summary,
        linkedEvidenceIds: c.linkedEvidenceIds,
        occurredAt: c.occurredAt,
        createdAt: c.createdAt,
      })),
    };

    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="resolveo-case-${caseId}.json"`,
        "Cache-Control": "private, no-store",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
