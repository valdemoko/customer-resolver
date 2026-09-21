/**
 * Persistent AI budget store (Fase 11).
 *
 * Replaces the in-memory Map with PostgreSQL-backed durable storage.
 * Uses atomic SQL operations to guarantee correctness under concurrency:
 *
 *   reserve → INSERT ... ON CONFLICT ... WHERE count < max ... RETURNING *
 *   release → UPDATE SET count = count - 1 WHERE count > 0
 *
 * The DB is the single source of truth for budget counts across all instances.
 * No instance-local state is used — concurrent requests to different instances
 * all see the same budget.
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { aiBudgets } from "@server/db/schema";
import { MAX_INTERPRETATION_CALLS } from "@core/intake/service";

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

type Db = NodePgDatabase<Record<string, never>>;

/**
 * PostgreSQL-backed budget store.
 *
 * The core operation `tryReserveBudget` uses a single atomic SQL statement:
 *   INSERT ... ON CONFLICT ... SET count = CASE WHEN count < max THEN count+1 ...
 *   RETURNING count, max_allowed
 *
 * If the WHERE clause on onConflictDoUpdate blocks the update (budget exhausted),
 * RETURNING returns no row → request is rejected.
 */
export class DrizzleBudgetStore implements BudgetStore {
  constructor(private readonly db: Db) {}

  async tryReserveBudget(caseId: string): Promise<{
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
  }> {
    const now = new Date().toISOString();

    // Atomic: INSERT new row (count=1) OR UPDATE existing row only if count < max.
    // If WHERE blocks the UPDATE, RETURNING returns no row → budget exhausted.
    const [row] = await this.db
      .insert(aiBudgets)
      .values({
        caseId,
        task: "PROBLEM_INTERPRETATION",
        count: 1,
        maxAllowed: MAX_INTERPRETATION_CALLS,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiBudgets.caseId],
        set: {
          count: sql`${aiBudgets.count} + 1`,
          updatedAt: now,
        },
        where: sql`${aiBudgets.count} < ${aiBudgets.maxAllowed}`,
      })
      .returning({
        count: aiBudgets.count,
        maxAllowed: aiBudgets.maxAllowed,
      });

    if (!row) {
      // WHERE blocked the update — budget exhausted
      const [existing] = await this.db
        .select({ count: aiBudgets.count, maxAllowed: aiBudgets.maxAllowed })
        .from(aiBudgets)
        .where(eq(aiBudgets.caseId, caseId))
        .limit(1);
      return {
        allowed: false,
        currentCount: existing?.count ?? 0,
        maxAllowed: existing?.maxAllowed ?? MAX_INTERPRETATION_CALLS,
      };
    }

    // Row was inserted or updated — check result
    return {
      allowed: row.count <= row.maxAllowed,
      currentCount: row.count,
      maxAllowed: row.maxAllowed,
    };
  }

  async releaseBudget(caseId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(aiBudgets)
      .set({
        count: sql`GREATEST(${aiBudgets.count} - 1, 0)`,
        updatedAt: now,
      })
      .where(eq(aiBudgets.caseId, caseId));
  }

  async hasRemainingBudget(caseId: string): Promise<boolean> {
    const count = await this.getCallCount(caseId);
    return count < MAX_INTERPRETATION_CALLS;
  }

  async getCallCount(caseId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: aiBudgets.count })
      .from(aiBudgets)
      .where(eq(aiBudgets.caseId, caseId))
      .limit(1);
    return row?.count ?? 0;
  }

  async recordCall(caseId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(aiBudgets)
      .values({
        caseId,
        task: "PROBLEM_INTERPRETATION",
        count: 1,
        maxAllowed: MAX_INTERPRETATION_CALLS,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiBudgets.caseId],
        set: {
          count: sql`${aiBudgets.count} + 1`,
          updatedAt: now,
        },
      });
  }

  async resetBudget(caseId: string): Promise<void> {
    await this.db.delete(aiBudgets).where(eq(aiBudgets.caseId, caseId));
  }
}
