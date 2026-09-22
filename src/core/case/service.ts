/**
 * Case application service (Fase 1) — orchestration over pure domain logic.
 *
 * This is the only stateful entry point the future API layer needs. It depends
 * exclusively on the CaseRepository port and pure domain functions: no Drizzle,
 * no HTTP, no AI (ARCHITECTURE.md §4/§24).
 */
import { DomainError } from "@lib/errors";
import type { CaseRepository } from "../ports";
import type {
  Case,
  CaseStatus,
  Contradiction,
  EvidenceReference,
  Fact,
  FactKey,
  FactProvenance,
  FactValue,
  ProblemSlug,
  JurisdictionCode,
  Locale,
  CurrencyCode,
  OwnerId,
  RulesetHash,
  SnapshotId,
} from "../types";
import { now as systemNow, type IsoDateTime } from "../shared/temporal";
import { applyResolution, confirmFact, createFact, type CreateFactInput } from "./facts";
import { detectContradiction, resolveContradiction } from "./contradictions";
import { createSnapshot } from "./snapshots";
import { createEvent } from "./events";
import { transition } from "./state-machine";

export class ConcurrentCaseUpdateError extends Error {
  readonly code = "CONCURRENT_CASE_UPDATE";
  constructor(
    readonly caseId: string,
    readonly expectedVersion: number,
  ) {
    super(`Case ${caseId} was modified concurrently (expected version ${expectedVersion})`);
    this.name = "ConcurrentCaseUpdateError";
  }
}

export class CaseNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";
  constructor(readonly caseId: string) {
    super(`Case not found: ${caseId}`);
    this.name = "CaseNotFoundError";
  }
}

export interface CreateCaseInput {
  readonly problemSlug: ProblemSlug;
  readonly jurisdiction: JurisdictionCode;
  readonly locale: Locale;
  readonly currency: CurrencyCode;
  readonly ownerId: OwnerId;
}

export interface AddFactResult {
  case: Case;
  fact: Fact;
  contradiction?: Contradiction;
  supersededFact?: Fact;
}

export interface ResolveResult {
  case: Case;
  resolvedFact: Fact;
}

export class CaseService {
  constructor(
    private readonly repo: CaseRepository,
    private readonly engineVersion: string = "1.0.0",
  ) {}

  async createCase(input: CreateCaseInput): Promise<Case> {
    return this.repo.createCase({
      problemSlug: input.problemSlug,
      jurisdiction: input.jurisdiction,
      locale: input.locale,
      currency: input.currency,
      ownerId: input.ownerId,
    });
  }

  /** Create-and-record idempotent case creation: same key → same stored response. */
  async createCaseIdempotent(idempotencyKey: string, input: CreateCaseInput): Promise<Case> {
    const existing = await this.repo.findIdempotencyResponse(idempotencyKey);
    if (existing !== null) return existing as Case;
    const created = await this.createCase(input);
    await this.repo.recordIdempotency(idempotencyKey, created);
    return created;
  }

  async loadCase(caseId: string) {
    const loaded = await this.repo.loadCase(caseId);
    if (!loaded) throw new CaseNotFoundError(caseId);
    return loaded;
  }

  /**
   * Add a fact with automatic reconciliation (ARCHITECTURE.md §10):
   *  - same value → no-op returning the existing fact
   *  - conflicting value on same key → fact kept + Contradiction detected, status HAS_CONTRADICTIONS
   *  - new key → FACT_ADDED, status moves DRAFT → COLLECTING_INFORMATION
   */
  async addFact(
    caseId: string,
    input: {
      key: FactKey;
      value: FactValue;
      provenance: FactProvenance;
      evidenceRefs?: readonly EvidenceReference[];
      supersedesId?: string;
    },
    options?: { at?: IsoDateTime },
  ): Promise<AddFactResult> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();
    const events = [];
    const newFacts: Fact[] = [];
    const updatedFacts: Fact[] = [];
    const newContradictions: Contradiction[] = [];
    let nextStatus: CaseStatus | undefined = loaded.case.status;

    const fresh = createFact({
      caseId,
      key: input.key,
      value: input.value,
      provenance: input.provenance,
      now: at,
      evidenceRefs: input.evidenceRefs,
      supersedesId: input.supersedesId,
    } satisfies CreateFactInput);
    newFacts.push(fresh);
    events.push(
      createEvent(caseId, "FACT_ADDED", { factKey: input.key, provenance: input.provenance }, at),
    );

    const current = loaded.facts.find((f) => f.key === input.key && f.status !== "SUPERSEDED");
    if (current) {
      const { valuesConflict } = await import("./fact-value");
      if (valuesConflict(current.value, fresh.value)) {
        const contradiction = detectContradiction({
          caseId,
          factA: current,
          factB: fresh,
          now: at,
        });
        newContradictions.push(contradiction);
        events.push(createEvent(caseId, "CONTRADICTION_DETECTED", { factKey: input.key }, at));
        nextStatus = "HAS_CONTRADICTIONS";
      } else {
        // same value → keep existing fact, mark the new one superseded to preserve history
        updatedFacts.push({
          ...fresh,
          status: "SUPERSEDED",
          supersededById: current.id,
          updatedAt: at,
        });
        newFacts.pop();
        events.push(
          createEvent(caseId, "FACT_UPDATED", { factKey: input.key, result: "duplicate" }, at),
        );
        return {
          case: loaded.case,
          fact: current,
          supersededFact: undefined,
        };
      }
    }

    if (nextStatus === "DRAFT" || nextStatus === "NEEDS_INFORMATION") {
      nextStatus = "COLLECTING_INFORMATION";
    }

    const statusAfter = nextStatus !== loaded.case.status ? nextStatus : loaded.case.status;
    if (statusAfter !== loaded.case.status) {
      events.push(
        createEvent(
          caseId,
          "CASE_STATUS_CHANGED",
          { from: loaded.case.status, to: statusAfter },
          at,
        ),
      );
    }

    const savedCase = await this.repo.saveUnit(
      {
        caseId,
        newFacts,
        updatedFacts,
        newContradictions,
        updatedContradictions: [],
        newEvents: events,
        nextStatus: statusAfter,
      },
      loaded.case.version,
    );

    return {
      case: savedCase,
      fact: fresh,
      contradiction: newContradictions[0],
      supersededFact: undefined,
    };
  }

  /**
   * Confirm a user-confirmed fact (F8.3 intake flow).
   * Creates a CONFIRMED fact with USER_PROVIDED provenance.
   * If a fact with the same key exists and conflicts, a contradiction is detected.
   * If a fact with the same key exists with the same value, it's a no-op (idempotent).
   */
  async confirmFactForCase(
    caseId: string,
    input: {
      key: FactKey;
      value: FactValue;
      evidenceRefs?: readonly EvidenceReference[];
    },
    options?: { at?: IsoDateTime },
  ): Promise<AddFactResult> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();

    // Check for existing fact with same key
    const existing = loaded.facts.find((f) => f.key === input.key && f.status !== "SUPERSEDED");

    if (existing && existing.status === "CONFIRMED") {
      const { valuesEqual } = await import("./fact-value");
      if (valuesEqual(existing.value, input.value)) {
        // Same key, same value, already confirmed — idempotent no-op
        return { case: loaded.case, fact: existing };
      }
      // Same key, different value, already confirmed — contradiction
      const fact = confirmFact({
        caseId,
        key: input.key,
        value: input.value,
        evidenceRefs: input.evidenceRefs,
        now: at,
      });
      const contradiction = detectContradiction({
        caseId,
        factA: existing,
        factB: fact,
        now: at,
      });
      const events = [
        createEvent(caseId, "FACT_ADDED", { factKey: input.key, provenance: "USER_PROVIDED" }, at),
        createEvent(caseId, "CONTRADICTION_DETECTED", { factKey: input.key }, at),
      ];
      const savedCase = await this.repo.saveUnit(
        {
          caseId,
          newFacts: [fact],
          updatedFacts: [],
          newContradictions: [contradiction],
          updatedContradictions: [],
          newEvents: events,
          nextStatus: "HAS_CONTRADICTIONS",
        },
        loaded.case.version,
      );
      return { case: savedCase, fact, contradiction };
    }

    // No existing confirmed fact — create new confirmed fact
    const fact = confirmFact({
      caseId,
      key: input.key,
      value: input.value,
      evidenceRefs: input.evidenceRefs,
      now: at,
    });

    const events = [
      createEvent(caseId, "FACT_ADDED", { factKey: input.key, provenance: "USER_PROVIDED" }, at),
    ];

    let nextStatus = loaded.case.status;
    if (nextStatus === "DRAFT" || nextStatus === "NEEDS_INFORMATION") {
      nextStatus = "COLLECTING_INFORMATION";
    }
    if (nextStatus !== loaded.case.status) {
      events.push(
        createEvent(
          caseId,
          "CASE_STATUS_CHANGED",
          { from: loaded.case.status, to: nextStatus },
          at,
        ),
      );
    }

    const savedCase = await this.repo.saveUnit(
      {
        caseId,
        newFacts: [fact],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvents: events,
        nextStatus,
      },
      loaded.case.version,
    );

    return { case: savedCase, fact };
  }

  /**
   * Resolve a contradiction explicitly: winner value becomes a new USER_RESOLVED
   * CONFIRMED fact; original candidates are SUPERSEDED (history intact).
   */
  async resolveContradictionForCase(
    caseId: string,
    contradictionId: string,
    winnerId: string,
    reason: string,
    options?: { at?: IsoDateTime },
  ): Promise<ResolveResult> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();

    const contradiction = loaded.contradictions.find((c) => c.id === contradictionId);
    if (!contradiction) throw new DomainError(`Contradiction not found: ${contradictionId}`);
    if (contradiction.status !== "UNRESOLVED") {
      throw new DomainError(`Contradiction ${contradictionId} already resolved`);
    }

    const candidates = loaded.facts.filter(
      (f) => f.id === contradiction.factIdA || f.id === contradiction.factIdB,
    );
    if (candidates.length !== 2) {
      throw new DomainError(`Contradiction ${contradictionId} candidates missing from case facts`);
    }

    const winner = candidates.find((c) => c.id === winnerId);
    if (!winner)
      throw new DomainError(`Winner ${winnerId} is not a candidate of this contradiction`);

    const {
      contradiction: resolvedContradiction,
      resolution,
      supersededCandidates,
    } = resolveContradiction({
      contradiction,
      candidates,
      winnerId,
      resolvedBy: "USER",
      reason,
      now: at,
    });

    const resolvedFact = applyResolution({
      newFact: createFact({
        caseId,
        key: contradiction.factKey,
        value: winner.value,
        provenance: "USER_RESOLVED",
        now: at,
        allowUserResolved: true,
      }),
      resolution,
      now: at,
    });

    const events = [
      createEvent(
        caseId,
        "CONTRADICTION_RESOLVED",
        { factKey: contradiction.factKey, resolvedBy: "USER" },
        at,
      ),
      createEvent(
        caseId,
        "FACT_ADDED",
        { factKey: contradiction.factKey, provenance: "USER_RESOLVED" },
        at,
      ),
    ];

    const remainingUnresolved = loaded.contradictions.filter(
      (c) => c.status === "UNRESOLVED" && c.id !== contradictionId,
    );

    const t = transition({
      current: loaded.case.status,
      event: "CONTRADICTION_RESOLVED",
      hasUnresolvedContradictions: remainingUnresolved.length > 0,
    });
    const statusAfter = t.changed ? t.next : loaded.case.status;
    if (t.changed) {
      events.push(
        createEvent(
          caseId,
          "CASE_STATUS_CHANGED",
          { from: loaded.case.status, to: statusAfter },
          at,
        ),
      );
    }

    const savedCase = await this.repo.saveUnit(
      {
        caseId,
        newFacts: [resolvedFact],
        updatedFacts: supersededCandidates,
        newContradictions: [],
        updatedContradictions: [resolvedContradiction],
        newEvents: events,
        nextStatus: statusAfter,
      },
      loaded.case.version,
    );

    return { case: savedCase, resolvedFact };
  }

  /** Freeze the current semantic state into an immutable snapshot. */
  async createSnapshotForCase(
    caseId: string,
    options?: {
      rulesetHash?: RulesetHash;
      sourceVersions?: Readonly<Record<string, string>>;
      aiRequestIds?: readonly string[];
      at?: IsoDateTime;
    },
  ): Promise<{ case: Case; snapshotId: SnapshotId }> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();

    const previousId = loaded.snapshots.at(-1)?.id;
    const snapshot = createSnapshot({
      case: loaded.case,
      currentFacts: loaded.facts,
      contradictions: loaded.contradictions,
      engineVersion: this.engineVersion,
      rulesetHash: options?.rulesetHash,
      sourceVersions: options?.sourceVersions,
      aiRequestIds: options?.aiRequestIds,
      previousSnapshotId: previousId,
      now: at,
    });

    const statusAfter = ["READY_FOR_ANALYSIS", "ANALYZING_X"].includes(loaded.case.status)
      ? transition({ current: loaded.case.status, event: "ANALYSIS_COMPLETED" }).next
      : loaded.case.status;

    const events = [createEvent(caseId, "SNAPSHOT_CREATED", { snapshotId: snapshot.id }, at)];
    if (statusAfter !== loaded.case.status) {
      events.push(
        createEvent(
          caseId,
          "CASE_STATUS_CHANGED",
          { from: loaded.case.status, to: statusAfter },
          at,
        ),
      );
    }

    const savedCase = await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvents: events,
        newSnapshot: snapshot,
        nextStatus: statusAfter,
      },
      loaded.case.version,
    );

    return { case: savedCase, snapshotId: snapshot.id };
  }

  /** Transition helper for explicit lifecycle moves (e.g. CLOSE_CASE). */
  async applyTransition(
    caseId: string,
    event: Parameters<typeof transition>[0]["event"],
    options?: { at?: IsoDateTime; hasUnresolvedContradictions?: boolean },
  ): Promise<Case> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();
    const t = transition({
      current: loaded.case.status,
      event,
      hasUnresolvedContradictions: options?.hasUnresolvedContradictions,
    });
    const events = t.changed
      ? [createEvent(caseId, "CASE_STATUS_CHANGED", { from: loaded.case.status, to: t.next }, at)]
      : [];
    return this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvents: events,
        nextStatus: t.next,
      },
      loaded.case.version,
    );
  }
}
