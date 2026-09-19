/**
 * CaseRepository port (Fase 1).
 *
 * The core defines WHAT persistence it needs; infrastructure (Drizzle/Postgres)
 * implements HOW (ports & adapters, ARCHITECTURE.md §4). The core never imports
 * Drizzle — enforced by ESLint boundaries + FS scan test.
 */
import type { Case, CaseEvent, CaseSnapshot, Contradiction, Fact } from "./types";

export interface CreateCaseData {
  readonly problemSlug: string;
  readonly jurisdiction: string;
  readonly locale: string;
  readonly currency: string;
  readonly ownerId: string;
}

export interface LoadedCase {
  readonly case: Case;
  readonly facts: readonly Fact[];
  readonly contradictions: readonly Contradiction[];
  readonly events: readonly CaseEvent[];
  readonly snapshots: readonly CaseSnapshot[];
}

export interface CaseRepository {
  /** Create a case atomically with its CASE_CREATED event. Returns the persisted aggregate. */
  createCase(data: CreateCaseData): Promise<Case>;

  /** Load the full aggregate in one round-trip (case + facts + contradictions + events + snapshots). */
  loadCase(caseId: string): Promise<LoadedCase | null>;

  /**
   * Persist a unit of work atomically: fact mutations (supersedes), contradiction
   * updates, status change, version bump, new events and optional snapshot —
   * all in one transaction. Throws ConcurrentCaseUpdateError on version conflict.
   */
  saveUnit(unit: CaseUnitOfWork, expectedVersion: number): Promise<Case>;

  /** Idempotency: returns the stored response payload for this key, if any. */
  findIdempotencyResponse(key: string): Promise<unknown | null>;
  /** Idempotency: record a response for a key. Fails if the key already exists. */
  recordIdempotency(key: string, response: unknown): Promise<void>;
}

/** Everything a single domain operation wants to persist, applied atomically. */
export interface CaseUnitOfWork {
  readonly caseId: string;
  readonly newFacts: readonly Fact[];
  readonly updatedFacts: readonly Fact[]; // e.g. SUPERSEDED candidates
  readonly newContradictions: readonly Contradiction[];
  readonly updatedContradictions: readonly Contradiction[]; // resolutions
  readonly newEvents: readonly CaseEvent[];
  readonly newSnapshot?: CaseSnapshot;
  readonly nextStatus?: Case["status"];
}
