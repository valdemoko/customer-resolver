/**
 * Drizzle adapter for the CaseRepository port (Fase 1).
 * Infrastructure-only: implements the core's port; the core never imports this.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  Case,
  CaseEvent,
  CaseEventType,
  CaseSnapshot,
  CaseStatus,
  Contradiction,
  ContradictionStatus,
  CurrencyCode,
  Fact,
  FactStatus,
  JurisdictionCode,
  Locale,
  OwnerId,
  ProblemSlug,
} from "@core/types";
import type {
  Evidence,
  EvidenceFactLink,
  EvidenceFactRelation,
  EvidenceId,
  EvidenceStatus,
  EvidenceType,
} from "@core/evidence/types";
import type {
  DocumentFactCandidate,
  DocumentFactCandidateId,
  DocumentLocation,
  DocumentProcessingRun,
  PhysicalObject,
  PhysicalObjectId,
  ProcessingRunId,
} from "@core/document/types";
import type { CaseRepository, CaseUnitOfWork, CreateCaseData, LoadedCase } from "@core/ports";
import { now as systemNow } from "@core/shared/temporal";

import {
  caseContradictions,
  caseEvents,
  caseFacts,
  caseSnapshots,
  cases,
  documentFactCandidates,
  documentLocations,
  documentProcessingRuns,
  evidence,
  evidenceFactLinks,
  idempotencyKeys,
  physicalObjects,
} from "../schema";

/**
 * The adapter is infrastructure and MAY depend on Drizzle (ARCHITECTURE.md §4).
 * It targets the node-postgres database type; other drivers (Neon HTTP,
 * PGlite in tests) are structurally compatible at runtime.
 */
type Db = NodePgDatabase<Record<string, never>>;

function mapCase(row: typeof cases.$inferSelect): Case {
  return {
    id: row.id,
    problemSlug: row.problemSlug as ProblemSlug,
    jurisdiction: row.jurisdiction as JurisdictionCode,
    locale: row.locale as Locale,
    currency: row.currency as CurrencyCode,
    status: row.status as CaseStatus,
    ownerId: row.ownerId as OwnerId,
    version: row.version as Case["version"],
    currentSnapshotId:
      row.currentSnapshotId === null
        ? undefined
        : (row.currentSnapshotId as Case["currentSnapshotId"]),
    createdAt: row.createdAt as Case["createdAt"],
    updatedAt: row.updatedAt as Case["updatedAt"],
  };
}

function mapFact(row: typeof caseFacts.$inferSelect): Fact {
  return {
    id: row.id as Fact["id"],
    caseId: row.caseId,
    key: row.key as Fact["key"],
    value: row.value as Fact["value"],
    provenance: row.provenance as Fact["provenance"],
    status: row.status as FactStatus,
    confidence: row.confidence as Fact["confidence"],
    evidenceRefs: (row.evidenceRefs ?? []) as Fact["evidenceRefs"],
    resolution: (row.resolution ?? undefined) as Fact["resolution"],
    supersedesId: (row.supersedesId ?? undefined) as Fact["supersedesId"],
    supersededById: (row.supersededById ?? undefined) as Fact["supersededById"],
    createdAt: row.createdAt as Fact["createdAt"],
    updatedAt: row.updatedAt as Fact["updatedAt"],
  };
}

function mapContradiction(row: typeof caseContradictions.$inferSelect): Contradiction {
  return {
    id: row.id as Contradiction["id"],
    caseId: row.caseId,
    factIdA: row.factIdA as Contradiction["factIdA"],
    factIdB: row.factIdB as Contradiction["factIdB"],
    factKey: row.factKey as Contradiction["factKey"],
    status: row.status as ContradictionStatus,
    resolution: (row.resolution ?? undefined) as Contradiction["resolution"],
    detectedAt: row.detectedAt as Contradiction["detectedAt"],
    resolvedAt: (row.resolvedAt ?? undefined) as Contradiction["resolvedAt"],
  };
}

function mapSnapshot(row: typeof caseSnapshots.$inferSelect): CaseSnapshot {
  return {
    id: row.id as CaseSnapshot["id"],
    caseId: row.caseId,
    previousSnapshotId:
      row.previousSnapshotId === null
        ? undefined
        : (row.previousSnapshotId as CaseSnapshot["previousSnapshotId"]),
    engineVersion: row.engineVersion,
    rulesetHash: (row.rulesetHash ?? undefined) as CaseSnapshot["rulesetHash"],
    sourceVersions: (row.sourceVersions ?? {}) as CaseSnapshot["sourceVersions"],
    aiRequestIds: (row.aiRequestIds ?? []) as CaseSnapshot["aiRequestIds"],
    factIds: (row.factIds ?? []) as CaseSnapshot["factIds"],
    contradictionIds: (row.contradictionIds ?? []) as CaseSnapshot["contradictionIds"],
    createdAt: row.createdAt as CaseSnapshot["createdAt"],
  };
}

function mapEvent(row: typeof caseEvents.$inferSelect): CaseEvent {
  return {
    id: row.id,
    caseId: row.caseId,
    type: row.type as CaseEventType,
    occurredAt: row.occurredAt as CaseEvent["occurredAt"],
    payload: (row.payload ?? {}) as CaseEvent["payload"],
  };
}

function mapEvidence(row: typeof evidence.$inferSelect): Evidence {
  return {
    id: row.id as EvidenceId,
    caseId: row.caseId,
    type: row.type as EvidenceType,
    status: row.status as EvidenceStatus,
    source: row.source as Evidence["source"],
    content: row.content as Evidence["content"],
    label: row.label ?? undefined,
    checksum: row.checksum ?? undefined,
    replacesEvidenceId: (row.replacesEvidenceId ?? undefined) as Evidence["replacesEvidenceId"],
    replacedByEvidenceId: (row.replacedByEvidenceId ??
      undefined) as Evidence["replacedByEvidenceId"],
    createdAt: row.createdAt as Evidence["createdAt"],
    updatedAt: row.updatedAt as Evidence["updatedAt"],
  };
}

function mapEvidenceLink(row: typeof evidenceFactLinks.$inferSelect): EvidenceFactLink {
  return {
    evidenceId: row.evidenceId as EvidenceId,
    factId: row.factId,
    relation: row.relation as EvidenceFactRelation,
    location: row.location ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.createdAt as EvidenceFactLink["createdAt"],
  };
}

function mapPhysicalObject(row: typeof physicalObjects.$inferSelect): PhysicalObject {
  return {
    id: row.id as PhysicalObjectId,
    caseId: row.caseId,
    evidenceId: row.evidenceId,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    originalFilename: row.originalFilename ?? undefined,
    status: row.status as PhysicalObject["status"],
    createdAt: row.createdAt as PhysicalObject["createdAt"],
  };
}

function mapProcessingRun(row: typeof documentProcessingRuns.$inferSelect): DocumentProcessingRun {
  return {
    id: row.id as ProcessingRunId,
    caseId: row.caseId,
    physicalObjectId: row.physicalObjectId,
    evidenceId: row.evidenceId,
    status: row.status as DocumentProcessingRun["status"],
    extractorType: row.extractorType as DocumentProcessingRun["extractorType"],
    extractorVersion: row.extractorVersion,
    result: (row.result ?? undefined) as DocumentProcessingRun["result"],
    retryCount: row.retryCount,
    createdAt: row.createdAt as DocumentProcessingRun["createdAt"],
    completedAt: (row.completedAt ?? undefined) as DocumentProcessingRun["completedAt"],
  };
}

function mapDocumentLocation(row: Record<string, unknown>): DocumentLocation {
  return {
    physicalObjectId: row.physicalObjectId as string,
    page: (row.page as number | null) ?? undefined,
    startOffset: row.startOffset as number,
    endOffset: row.endOffset as number,
    boundingBox: (row.boundingBox as DocumentLocation["boundingBox"]) ?? undefined,
  };
}

function mapFactCandidate(
  row: typeof documentFactCandidates.$inferSelect,
  locationMap: Map<string, DocumentLocation>,
): DocumentFactCandidate {
  const resolvedLocation = row.locationId ? locationMap.get(row.locationId) : undefined;
  return {
    id: row.id as DocumentFactCandidateId,
    caseId: row.caseId,
    evidenceId: row.evidenceId,
    physicalObjectId: row.physicalObjectId,
    processingRunId: row.processingRunId,
    factKey: row.factKey,
    proposedValue: row.proposedValue,
    location: resolvedLocation ?? null,
    extractorVersion: row.extractorVersion,
    extractorConfidence: row.extractorConfidence ?? undefined,
    relation: row.relation as DocumentFactCandidate["relation"],
    linkedFactId: row.linkedFactId ?? undefined,
    createdAt: row.createdAt as DocumentFactCandidate["createdAt"],
  };
}

export class DrizzleCaseRepository implements CaseRepository {
  constructor(private readonly db: Db) {}

  async createCase(data: CreateCaseData): Promise<Case> {
    const at = systemNow();
    const id = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(cases)
        .values({
          id,
          problemSlug: data.problemSlug,
          jurisdiction: data.jurisdiction,
          locale: data.locale,
          currency: data.currency,
          status: "DRAFT",
          ownerId: data.ownerId,
          version: 1,
          createdAt: at,
          updatedAt: at,
        })
        .returning();

      await tx.insert(caseEvents).values({
        id: eventId,
        caseId: id,
        type: "CASE_CREATED",
        payload: { problemSlug: data.problemSlug, jurisdiction: data.jurisdiction },
        occurredAt: at,
      });

      return mapCase(row!);
    });
  }
  async loadCase(caseId: string): Promise<LoadedCase | null> {
    const [caseRow] = await this.db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!caseRow) return null;

    const [
      factRows,
      contradictionRows,
      eventRows,
      snapshotRows,
      evidenceRows,
      linkRows,
      physicalObjectRows,
      processingRunRows,
      locationRows,
      candidateRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(caseFacts)
        .where(eq(caseFacts.caseId, caseId))
        .orderBy(asc(caseFacts.createdAt)),
      this.db
        .select()
        .from(caseContradictions)
        .where(eq(caseContradictions.caseId, caseId))
        .orderBy(asc(caseContradictions.detectedAt)),
      this.db
        .select()
        .from(caseEvents)
        .where(eq(caseEvents.caseId, caseId))
        .orderBy(asc(caseEvents.occurredAt)),
      this.db
        .select()
        .from(caseSnapshots)
        .where(eq(caseSnapshots.caseId, caseId))
        .orderBy(asc(caseSnapshots.createdAt)),
      this.db
        .select()
        .from(evidence)
        .where(eq(evidence.caseId, caseId))
        .orderBy(asc(evidence.createdAt)),
      this.db
        .select({
          id: evidenceFactLinks.id,
          evidenceId: evidenceFactLinks.evidenceId,
          factId: evidenceFactLinks.factId,
          relation: evidenceFactLinks.relation,
          location: evidenceFactLinks.location,
          note: evidenceFactLinks.note,
          createdAt: evidenceFactLinks.createdAt,
        })
        .from(evidenceFactLinks)
        .innerJoin(evidence, eq(evidenceFactLinks.evidenceId, evidence.id))
        .where(eq(evidence.caseId, caseId))
        .orderBy(asc(evidenceFactLinks.createdAt)),
      // Fase 5: document intelligence entities
      this.db
        .select()
        .from(physicalObjects)
        .where(eq(physicalObjects.caseId, caseId))
        .orderBy(asc(physicalObjects.createdAt)),
      this.db
        .select()
        .from(documentProcessingRuns)
        .where(eq(documentProcessingRuns.caseId, caseId))
        .orderBy(asc(documentProcessingRuns.createdAt)),
      this.db
        .select()
        .from(documentLocations)
        .innerJoin(physicalObjects, eq(documentLocations.physicalObjectId, physicalObjects.id))
        .where(eq(physicalObjects.caseId, caseId))
        .orderBy(asc(documentLocations.createdAt)),
      this.db
        .select()
        .from(documentFactCandidates)
        .where(eq(documentFactCandidates.caseId, caseId))
        .orderBy(asc(documentFactCandidates.createdAt)),
    ]);

    const locations = locationRows.map(mapDocumentLocation);
    const locationMap = new Map<string, DocumentLocation>();
    // Build a lookup for candidates: each candidate references a location by physicalObjectId
    // Since multiple locations can exist per physical object, we use the most recent one
    for (const loc of locations) {
      locationMap.set(loc.physicalObjectId, loc);
    }

    return {
      case: mapCase(caseRow),
      facts: factRows.map(mapFact),
      contradictions: contradictionRows.map(mapContradiction),
      events: eventRows.map(mapEvent),
      snapshots: snapshotRows.map(mapSnapshot),
      evidence: evidenceRows.map(mapEvidence),
      evidenceLinks: linkRows.map(mapEvidenceLink),
      physicalObjects: physicalObjectRows.map(mapPhysicalObject),
      processingRuns: processingRunRows.map(mapProcessingRun),
      documentLocations: locations,
      factCandidates: candidateRows.map((r) => mapFactCandidate(r, locationMap)),
    };
  }

  async saveUnit(unit: CaseUnitOfWork, expectedVersion: number): Promise<Case> {
    return this.db.transaction(async (tx) => {
      // Optimistic locking: conditional UPDATE on the expected version.
      const updated = await tx
        .update(cases)
        .set({
          version: expectedVersion + 1,
          status: unit.nextStatus ?? sql`${cases.status}`,
          currentSnapshotId: unit.newSnapshot
            ? unit.newSnapshot.id
            : sql`${cases.currentSnapshotId}`,
          updatedAt: systemNow(),
        })
        .where(and(eq(cases.id, unit.caseId), eq(cases.version, expectedVersion)))
        .returning({ id: cases.id });

      if (updated.length === 0) {
        throw new ConcurrentCaseUpdateDbError(unit.caseId, expectedVersion);
      }

      if (unit.newFacts.length > 0) {
        await tx.insert(caseFacts).values(
          unit.newFacts.map((f) => ({
            id: f.id,
            caseId: f.caseId,
            key: f.key,
            value: f.value,
            provenance: f.provenance,
            status: f.status,
            confidence: f.confidence,
            evidenceRefs: f.evidenceRefs,
            resolution: f.resolution ?? null,
            supersedesId: f.supersedesId ?? null,
            supersededById: f.supersededById ?? null,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          })),
        );
      }

      for (const fact of unit.updatedFacts) {
        await tx
          .update(caseFacts)
          .set({
            status: fact.status,
            supersededById: fact.supersededById ?? null,
            updatedAt: fact.updatedAt,
          })
          .where(eq(caseFacts.id, fact.id));
      }

      if (unit.newContradictions.length > 0) {
        await tx.insert(caseContradictions).values(
          unit.newContradictions.map((c) => ({
            id: c.id,
            caseId: c.caseId,
            factIdA: c.factIdA,
            factIdB: c.factIdB,
            factKey: c.factKey,
            status: c.status,
            resolution: c.resolution ?? null,
            detectedAt: c.detectedAt,
            resolvedAt: c.resolvedAt ?? null,
          })),
        );
      }

      for (const c of unit.updatedContradictions) {
        await tx
          .update(caseContradictions)
          .set({
            status: c.status,
            resolution: c.resolution ?? null,
            resolvedAt: c.resolvedAt ?? null,
          })
          .where(eq(caseContradictions.id, c.id));
      }

      // ── Evidence (Fase 2) ────────────────────────────────────────────
      if (unit.newEvidence && unit.newEvidence.length > 0) {
        await tx.insert(evidence).values(
          unit.newEvidence.map((e) => ({
            id: e.id,
            caseId: e.caseId,
            type: e.type,
            status: e.status,
            source: e.source,
            content: e.content,
            label: e.label ?? null,
            checksum: e.checksum ?? null,
            replacesEvidenceId: e.replacesEvidenceId ?? null,
            replacedByEvidenceId: e.replacedByEvidenceId ?? null,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          })),
        );
      }

      for (const e of unit.updatedEvidence ?? []) {
        await tx
          .update(evidence)
          .set({
            status: e.status,
            checksum: e.checksum ?? null,
            replacedByEvidenceId: e.replacedByEvidenceId ?? null,
            updatedAt: e.updatedAt,
          })
          .where(eq(evidence.id, e.id));
      }

      if (unit.newEvidenceLinks && unit.newEvidenceLinks.length > 0) {
        await tx.insert(evidenceFactLinks).values(
          unit.newEvidenceLinks.map((l) => ({
            evidenceId: l.evidenceId,
            factId: l.factId,
            relation: l.relation,
            location: l.location ?? null,
            note: l.note ?? null,
            createdAt: l.createdAt,
          })),
        );
      }

      for (const l of unit.removedEvidenceLinks ?? []) {
        await tx
          .delete(evidenceFactLinks)
          .where(
            and(
              eq(evidenceFactLinks.evidenceId, l.evidenceId),
              eq(evidenceFactLinks.factId, l.factId),
              eq(evidenceFactLinks.relation, l.relation),
            ),
          );
      }

      if (unit.newSnapshot) {
        const s = unit.newSnapshot;
        await tx.insert(caseSnapshots).values({
          id: s.id,
          caseId: s.caseId,
          previousSnapshotId: s.previousSnapshotId ?? null,
          engineVersion: s.engineVersion,
          rulesetHash: s.rulesetHash ?? null,
          sourceVersions: s.sourceVersions,
          aiRequestIds: s.aiRequestIds,
          factIds: s.factIds,
          contradictionIds: s.contradictionIds,
          createdAt: s.createdAt,
        });
      }

      // ── Fase 5: Document Intelligence entities ──────────────────────
      if (unit.newPhysicalObjects && unit.newPhysicalObjects.length > 0) {
        await tx.insert(physicalObjects).values(
          unit.newPhysicalObjects.map((po) => ({
            id: po.id,
            caseId: po.caseId,
            evidenceId: po.evidenceId,
            storageKey: po.storageKey,
            mimeType: po.mimeType,
            sizeBytes: po.sizeBytes,
            checksumSha256: po.checksumSha256,
            originalFilename: po.originalFilename ?? null,
            status: po.status,
            createdAt: po.createdAt,
          })),
        );
      }

      if (unit.newProcessingRuns && unit.newProcessingRuns.length > 0) {
        await tx.insert(documentProcessingRuns).values(
          unit.newProcessingRuns.map((pr) => ({
            id: pr.id,
            caseId: pr.caseId,
            physicalObjectId: pr.physicalObjectId,
            evidenceId: pr.evidenceId,
            status: pr.status,
            extractorType: pr.extractorType,
            extractorVersion: pr.extractorVersion,
            result: pr.result ?? null,
            retryCount: pr.retryCount,
            createdAt: pr.createdAt,
            completedAt: pr.completedAt ?? null,
          })),
        );
      }

      if (unit.newDocumentLocations && unit.newDocumentLocations.length > 0) {
        await tx.insert(documentLocations).values(
          unit.newDocumentLocations.map((loc) => ({
            physicalObjectId: loc.physicalObjectId,
            processingRunId: loc.processingRunId ?? "",
            page: loc.page ?? null,
            startOffset: loc.startOffset ?? 0,
            endOffset: loc.endOffset ?? 0,
            boundingBox: loc.boundingBox ?? null,
            createdAt: systemNow(),
          })),
        );
      }

      if (unit.newFactCandidates && unit.newFactCandidates.length > 0) {
        await tx.insert(documentFactCandidates).values(
          unit.newFactCandidates.map((fc) => ({
            id: fc.id,
            caseId: fc.caseId,
            evidenceId: fc.evidenceId,
            physicalObjectId: fc.physicalObjectId,
            processingRunId: fc.processingRunId,
            factKey: fc.factKey,
            proposedValue: fc.proposedValue,
            locationId: null, // resolved separately if needed
            extractorVersion: fc.extractorVersion,
            extractorConfidence: fc.extractorConfidence ?? null,
            relation: fc.relation,
            certainty: fc.certainty ?? null,
            aiRequestId: fc.aiRequestId ?? null,
            linkedFactId: fc.linkedFactId ?? null,
            createdAt: fc.createdAt,
          })),
        );
      }

      if (unit.newEvents.length > 0) {
        await tx.insert(caseEvents).values(
          unit.newEvents.map((e) => ({
            id: e.id,
            caseId: e.caseId,
            type: e.type,
            payload: e.payload,
            occurredAt: e.occurredAt,
          })),
        );
      }

      const [finalRow] = await tx.select().from(cases).where(eq(cases.id, unit.caseId)).limit(1);
      return mapCase(finalRow!);
    });
  }

  async findIdempotencyResponse(key: string): Promise<unknown | null> {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    return row?.response ?? null;
  }

  async recordIdempotency(key: string, response: unknown): Promise<void> {
    await this.db.insert(idempotencyKeys).values({ key, response, createdAt: systemNow() });
  }
}

export class ConcurrentCaseUpdateDbError extends Error {
  readonly code = "CONCURRENT_CASE_UPDATE";
  constructor(
    readonly caseId: string,
    readonly expectedVersion: number,
  ) {
    super(`Case ${caseId} version conflict (expected ${expectedVersion})`);
    this.name = "ConcurrentCaseUpdateDbError";
  }
}
