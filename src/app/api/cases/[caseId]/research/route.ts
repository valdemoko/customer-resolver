/**
 * Research API — F14 Research Resolver
 *
 * POST /api/cases/[caseId]/research — Start research for unsupported problem
 * GET  /api/cases/[caseId]/research — List research sessions for case
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createNeonDb } from "@/server/db/client";
import {
  cases,
  researchSessions,
  researchFindings,
  researchSources,
  researchConflicts,
  caseEvents,
} from "@/server/db/schema";
import { isValidCaseId, sanitizeErrorMessage } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";
import { ResearchService } from "@/core/research/service";
import { createEvent } from "@/core/case/events";
import { now as systemNow } from "@/core/shared/temporal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const StartResearchSchema = z.object({
  problemDescription: z.string().min(10).max(5000),
  jurisdiction: z.string().min(2).max(10),
  entities: z.array(z.string()).optional(),
  facts: z.record(z.string(), z.unknown()).optional(),
});

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

    // Verify case exists
    const [caseRow] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    // Load research sessions
    const sessions = await db
      .select()
      .from(researchSessions)
      .where(eq(researchSessions.caseId, caseId))
      .orderBy(sql`${researchSessions.createdAt} DESC`);

    // Load findings for each session
    const sessionsWithFindings = await Promise.all(
      sessions.map(async (session) => {
        const findings = await db
          .select()
          .from(researchFindings)
          .where(eq(researchFindings.researchId, session.id));

        const sources = await db
          .select()
          .from(researchSources)
          .where(eq(researchSources.researchId, session.id));

        const conflicts = await db
          .select()
          .from(researchConflicts)
          .where(eq(researchConflicts.researchId, session.id));

        return {
          id: session.id,
          status: session.status,
          jurisdiction: session.jurisdiction,
          problemDescription: session.problemDescription,
          legalDomain: session.legalDomain,
          researchVersion: session.researchVersion,
          createdAt: session.createdAt,
          completedAt: session.completedAt,
          findings: findings.map((f) => ({
            id: f.id,
            proposition: f.proposition,
            status: f.status,
            reasoningSummary: f.reasoningSummary,
          })),
          sources: sources.map((s) => ({
            id: s.id,
            title: s.title,
            url: s.url,
            authority: s.authority,
            validationStatus: s.validationStatus,
          })),
          conflicts: conflicts.map((c) => ({
            id: c.id,
            conflictType: c.conflictType,
            description: c.description,
            resolutionStatus: c.resolutionStatus,
          })),
        };
      }),
    );

    return NextResponse.json(
      {
        caseId,
        researchSessions: sessionsWithFindings,
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
    const parsed = StartResearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid research data", details: parsed.error.flatten() },
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
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const data = parsed.data;

    // Create research service
    const researchService = new ResearchService();

    // Start research
    const result = await researchService.startResearch({
      caseId,
      problemDescription: data.problemDescription,
      jurisdiction: data.jurisdiction,
      entities: data.entities ?? [],
      facts: new Map(Object.entries(data.facts ?? {})),
    });

    // Persist research session
    const sessionId = crypto.randomUUID();
    await db.insert(researchSessions).values({
      id: sessionId,
      caseId,
      status: result.status,
      jurisdiction: result.jurisdiction,
      problemDescription: data.problemDescription,
      legalDomain: result.plan.legalDomain,
      researchVersion: result.researchVersion,
      previousResearchId: result.previousResearchId ?? null,
      plan: result.plan,
      aiRequestIds: result.aiRequestIds,
      createdAt: result.createdAt,
      completedAt: result.completedAt ?? null,
    });

    // Persist findings
    for (const finding of result.findings) {
      const findingId = crypto.randomUUID();
      await db.insert(researchFindings).values({
        id: findingId,
        researchId: sessionId,
        proposition: finding.proposition,
        status: finding.status,
        jurisdiction: finding.jurisdiction,
        reasoningSummary: finding.reasoningSummary,
        uncertainty: finding.uncertainty ?? null,
        researchVersion: finding.researchVersion,
        createdAt: result.createdAt,
      });

      // Persist sources for this finding
      for (const source of finding.supportingSources) {
        await db.insert(researchSources).values({
          researchId: sessionId,
          findingId,
          url: source.url,
          title: source.title,
          publisher: source.publisher,
          jurisdiction: source.jurisdiction,
          sourceType: source.sourceType,
          authority: source.authority,
          publicationDate: source.publicationDate ?? null,
          effectiveDate: source.effectiveDate ?? null,
          retrievedAt: source.retrievedAt,
          versionIdentifier: source.versionIdentifier ?? null,
          relevantSection: source.relevantSection ?? null,
          contentHash: source.contentHash ?? null,
          validationStatus: source.validationStatus,
          validationNotes: source.validationNotes ?? null,
          createdAt: result.createdAt,
        });
      }
    }

    // Persist standalone sources
    for (const source of result.sources) {
      // Check if already persisted (from findings)
      const alreadyPersisted = result.findings.some((f) =>
        f.supportingSources.some((s) => s.sourceId === source.sourceId),
      );
      if (!alreadyPersisted) {
        await db.insert(researchSources).values({
          researchId: sessionId,
          findingId: null,
          url: source.url,
          title: source.title,
          publisher: source.publisher,
          jurisdiction: source.jurisdiction,
          sourceType: source.sourceType,
          authority: source.authority,
          publicationDate: source.publicationDate ?? null,
          effectiveDate: source.effectiveDate ?? null,
          retrievedAt: source.retrievedAt,
          versionIdentifier: source.versionIdentifier ?? null,
          relevantSection: source.relevantSection ?? null,
          contentHash: source.contentHash ?? null,
          validationStatus: source.validationStatus,
          validationNotes: source.validationNotes ?? null,
          createdAt: result.createdAt,
        });
      }
    }

    // Persist conflicts
    for (const conflict of result.conflicts) {
      await db.insert(researchConflicts).values({
        researchId: sessionId,
        conflictType: conflict.conflictType,
        sourceAId: conflict.sourceA.sourceId,
        sourceBId: conflict.sourceB.sourceId,
        description: conflict.description,
        resolutionStatus: conflict.resolutionStatus,
        resolutionNotes: conflict.resolutionNotes ?? null,
        createdAt: result.createdAt,
      });
    }

    // Create timeline event
    const now = systemNow();
    const event = createEvent(
      caseId,
      "ANALYSIS_RECALCULATED",
      {
        researchId: sessionId,
        status: result.status,
        findingsCount: result.findings.length,
        sourcesCount: result.sources.length,
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
        research: {
          id: sessionId,
          status: result.status,
          jurisdiction: result.jurisdiction,
          findingsCount: result.findings.length,
          sourcesCount: result.sources.length,
          conflictsCount: result.conflicts.length,
          createdAt: result.createdAt,
        },
        result: {
          status: result.status,
          findings: result.findings,
          sources: result.sources,
          conflicts: result.conflicts,
          missingInformation: result.missingInformation,
          disclaimers: result.disclaimers,
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
