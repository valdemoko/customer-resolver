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
import type { CaseRepository, CaseUnitOfWork, CreateCaseData, LoadedCase } from "@core/ports";
import { now as systemNow } from "@core/shared/temporal";

import {
  caseContradictions,
  caseEvents,
  caseFacts,
  caseSnapshots,
  cases,
  idempotencyKeys,
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

    const [factRows, contradictionRows, eventRows, snapshotRows] = await Promise.all([
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
    ]);

    return {
      case: mapCase(caseRow),
      facts: factRows.map(mapFact),
      contradictions: contradictionRows.map(mapContradiction),
      events: eventRows.map(mapEvent),
      snapshots: snapshotRows.map(mapSnapshot),
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
