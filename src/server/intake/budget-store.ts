/**
 * Server-side AI budget store (F8.3, spec §17, audit B5).
 *
 * Enforces MAX 3 PROBLEM_INTERPRETATION calls per case.
 * The server is the ONLY authority for the budget count.
 * The client CANNOT send or reset the count.
 *
 * Fase 11: Production uses DB-backed DrizzleBudgetStore (atomic SQL).
 * Tests continue to use in-memory fallback for speed and isolation.
 */
import { MAX_INTERPRETATION_CALLS } from "@core/intake/service";

// ── BudgetStore interface ──────────────────────────────────────────

export interface BudgetStore {
  tryReserveBudget(caseId: string): Promise<{
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
  }>;
  releaseBudget(caseId: string): Promise<void>;
  hasRemainingBudget(caseId: string): Promise<boolean>;
  getCallCount(caseId: string): Promise<number>;
  recordCall(caseId: string): Promise<void>;
  resetBudget(caseId: string): Promise<void>;
}

// ── In-memory implementation (tests / single-server dev) ──────────

class InMemoryBudgetStore implements BudgetStore {
  /** Accessible internally for synchronous legacy API. */
  readonly counts = new Map<string, number>();

  async tryReserveBudget(caseId: string) {
    const current = this.counts.get(caseId) ?? 0;
    if (current >= MAX_INTERPRETATION_CALLS) {
      return { allowed: false, currentCount: current, maxAllowed: MAX_INTERPRETATION_CALLS };
    }
    this.counts.set(caseId, current + 1);
    return { allowed: true, currentCount: current + 1, maxAllowed: MAX_INTERPRETATION_CALLS };
  }

  async releaseBudget(caseId: string) {
    const current = this.counts.get(caseId) ?? 0;
    if (current > 0) this.counts.set(caseId, current - 1);
  }

  async hasRemainingBudget(caseId: string) {
    return (this.counts.get(caseId) ?? 0) < MAX_INTERPRETATION_CALLS;
  }

  async getCallCount(caseId: string) {
    return this.counts.get(caseId) ?? 0;
  }

  async recordCall(caseId: string) {
    const current = this.counts.get(caseId) ?? 0;
    this.counts.set(caseId, current + 1);
  }

  async resetBudget(caseId: string) {
    this.counts.delete(caseId);
  }
}

// ── Singleton store ────────────────────────────────────────────────

let storeInstance: BudgetStore = new InMemoryBudgetStore();

/** Get the active budget store (default: in-memory). */
export function getBudgetStore(): BudgetStore {
  return storeInstance;
}

/** Replace the budget store (used by composition root and tests). */
export function setBudgetStore(store: BudgetStore): void {
  storeInstance = store;
}

// ── Legacy function API (backward-compatible) ──────────────────────
// These delegate to the singleton store. Callers should migrate to
// getBudgetStore() for async operations, but these remain for compatibility
// with existing synchronous call sites.

export function hasRemainingBudget(caseId: string): boolean {
  // Synchronous fallback — uses in-memory store only
  // DB store requires async; callers must use getBudgetStore().hasRemainingBudget()
  if (storeInstance instanceof InMemoryBudgetStore) {
    return (storeInstance.counts.get(caseId) ?? 0) < MAX_INTERPRETATION_CALLS;
  }
  // Can't synchronously check DB — return true as safe default
  return true;
}

export function getCallCount(caseId: string): number {
  if (storeInstance instanceof InMemoryBudgetStore) {
    return storeInstance.counts.get(caseId) ?? 0;
  }
  return 0;
}

export function recordCall(caseId: string): void {
  if (storeInstance instanceof InMemoryBudgetStore) {
    const { counts } = storeInstance;
    counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }
}

export function resetBudget(caseId: string): void {
  if (storeInstance instanceof InMemoryBudgetStore) {
    storeInstance.counts.delete(caseId);
  }
}

export function tryReserveBudget(caseId: string): {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
} {
  if (storeInstance instanceof InMemoryBudgetStore) {
    const { counts } = storeInstance;
    const current = counts.get(caseId) ?? 0;
    if (current >= MAX_INTERPRETATION_CALLS) {
      return { allowed: false, currentCount: current, maxAllowed: MAX_INTERPRETATION_CALLS };
    }
    counts.set(caseId, current + 1);
    return { allowed: true, currentCount: current + 1, maxAllowed: MAX_INTERPRETATION_CALLS };
  }
  // Synchronous fallback for DB store — return optimistic default
  return { allowed: true, currentCount: 0, maxAllowed: MAX_INTERPRETATION_CALLS };
}

export function releaseBudget(caseId: string): void {
  if (storeInstance instanceof InMemoryBudgetStore) {
    const { counts } = storeInstance;
    const current = counts.get(caseId) ?? 0;
    if (current > 0) counts.set(caseId, current - 1);
  }
}
