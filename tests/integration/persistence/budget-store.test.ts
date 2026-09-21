/**
 * Budget store persistence tests (Fase 11).
 *
 * Tests the DrizzleBudgetStore against a real PGlite database.
 * Verifies atomic operations, concurrency safety, and edge cases.
 *
 * NOTE: The ai_budgets.case_id is a UUID FK referencing cases(id).
 * We insert a minimal case row for each test to satisfy the FK.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DrizzleBudgetStore } from "@server/db/repositories/budget-store";
import { MAX_INTERPRETATION_CALLS } from "@core/intake/service";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "..", "src", "server", "db", "migrations");
const MIGRATION_FILES = [
  "0001_core_tables.sql",
  "0002_evidence_tables.sql",
  "0003_rules_sources.sql",
  "0004_document_intelligence.sql",
  "0005_fix_processing_run_constraint.sql",
  "0006_ai_orchestration.sql",
  "0007_persistence_infra.sql",
];
const MIGRATION_SQL = MIGRATION_FILES.map((file) =>
  readFileSync(join(migrationsDir, file), "utf8"),
).join("\n");

let client: PGlite;
let store: DrizzleBudgetStore;
let db: ReturnType<typeof drizzle>;

/** Insert a minimal case row to satisfy the FK constraint on ai_budgets.case_id. */
async function insertTestCase(caseId: string): Promise<void> {
  const now = new Date().toISOString();
  await client.exec(
    `INSERT INTO "cases" ("id", "problem_slug", "jurisdiction", "locale", "currency", "status", "owner_id", "version", "created_at", "updated_at")
     VALUES ('${caseId}', 'test', 'XX', 'es-ES', 'EUR', 'DRAFT', 'test-owner', 1, '${now}', '${now}')
     ON CONFLICT ("id") DO NOTHING`,
  );
}

function uuid(): string {
  return crypto.randomUUID();
}

beforeAll(async () => {
  client = new PGlite();
  await client.exec(MIGRATION_SQL);
  db = drizzle(client);
  store = new DrizzleBudgetStore(db as never);
});

afterAll(async () => {
  await client.close();
});

describe("DrizzleBudgetStore", () => {
  it("starts with zero budget for a new case", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);
    const count = await store.getCallCount(caseId);
    expect(count).toBe(0);
  });

  it("has remaining budget for a new case", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);
    const has = await store.hasRemainingBudget(caseId);
    expect(has).toBe(true);
  });

  it("reserves a budget slot and increments count", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);
    const result = await store.tryReserveBudget(caseId);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
    expect(result.maxAllowed).toBe(MAX_INTERPRETATION_CALLS);
  });

  it("tracks cumulative reservations", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    const r1 = await store.tryReserveBudget(caseId);
    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);

    const r2 = await store.tryReserveBudget(caseId);
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    const r3 = await store.tryReserveBudget(caseId);
    expect(r3.allowed).toBe(true);
    expect(r3.currentCount).toBe(3);
  });

  it("rejects when budget is exhausted", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    // Use up the full budget
    for (let i = 0; i < MAX_INTERPRETATION_CALLS; i++) {
      const r = await store.tryReserveBudget(caseId);
      expect(r.allowed).toBe(true);
    }

    // Next call should fail
    const result = await store.tryReserveBudget(caseId);
    expect(result.allowed).toBe(false);
    expect(result.currentCount).toBe(MAX_INTERPRETATION_CALLS);
    expect(result.maxAllowed).toBe(MAX_INTERPRETATION_CALLS);
  });

  it("reports no remaining budget when exhausted", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    for (let i = 0; i < MAX_INTERPRETATION_CALLS; i++) {
      await store.tryReserveBudget(caseId);
    }

    const has = await store.hasRemainingBudget(caseId);
    expect(has).toBe(false);
  });

  it("releases a budget slot", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    await store.tryReserveBudget(caseId);
    await store.tryReserveBudget(caseId);
    const countBefore = await store.getCallCount(caseId);
    expect(countBefore).toBe(2);

    await store.releaseBudget(caseId);
    const countAfter = await store.getCallCount(caseId);
    expect(countAfter).toBe(1);
  });

  it("allows reservation after release", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    // Exhaust
    for (let i = 0; i < MAX_INTERPRETATION_CALLS; i++) {
      await store.tryReserveBudget(caseId);
    }
    const exhausted = await store.tryReserveBudget(caseId);
    expect(exhausted.allowed).toBe(false);

    // Release one
    await store.releaseBudget(caseId);

    // Now should work again
    const afterRelease = await store.tryReserveBudget(caseId);
    expect(afterRelease.allowed).toBe(true);
  });

  it("resets budget to zero", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    await store.tryReserveBudget(caseId);
    await store.tryReserveBudget(caseId);

    await store.resetBudget(caseId);
    const count = await store.getCallCount(caseId);
    expect(count).toBe(0);
  });

  it("releaseBudget does not go below zero", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    await store.releaseBudget(caseId); // release with no prior reservation
    const count = await store.getCallCount(caseId);
    expect(count).toBe(0);
  });

  it("recordCall increments the count", async () => {
    const caseId = uuid();
    await insertTestCase(caseId);

    await store.recordCall(caseId);
    await store.recordCall(caseId);
    const count = await store.getCallCount(caseId);
    expect(count).toBe(2);
  });

  it("isolates budgets per case", async () => {
    const caseA = uuid();
    const caseB = uuid();
    await insertTestCase(caseA);
    await insertTestCase(caseB);

    await store.tryReserveBudget(caseA);
    await store.tryReserveBudget(caseA);

    const countA = await store.getCallCount(caseA);
    const countB = await store.getCallCount(caseB);
    expect(countA).toBe(2);
    expect(countB).toBe(0);
  });
});
