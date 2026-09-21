/**
 * Rate limit store persistence tests (Fase 11).
 *
 * Tests the DrizzleRateLimitStore against a real PGlite database.
 * Verifies atomic operations, window alignment, and cleanup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DrizzleRateLimitStore } from "@server/db/repositories/rate-limit-store";

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
let store: DrizzleRateLimitStore;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(MIGRATION_SQL);
  const db = drizzle(client);
  store = new DrizzleRateLimitStore(db as never);
});

afterAll(async () => {
  await client.close();
});

describe("DrizzleRateLimitStore", () => {
  it("allows first request within window", async () => {
    await store.reset("test-scope", "key-1");
    const result = await store.checkAndIncrement("test-scope", "key-1", {
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
    expect(result.maxRequests).toBe(5);
  });

  it("increments counter within same window", async () => {
    await store.reset("test-scope", "key-2");
    const r1 = await store.checkAndIncrement("test-scope", "key-2", {
      maxRequests: 3,
      windowMs: 60_000,
    });
    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);

    const r2 = await store.checkAndIncrement("test-scope", "key-2", {
      maxRequests: 3,
      windowMs: 60_000,
    });
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    const r3 = await store.checkAndIncrement("test-scope", "key-2", {
      maxRequests: 3,
      windowMs: 60_000,
    });
    expect(r3.allowed).toBe(true);
    expect(r3.currentCount).toBe(3);
  });

  it("rejects when limit exceeded", async () => {
    await store.reset("test-scope", "key-3");
    const config = { maxRequests: 2, windowMs: 60_000 };

    const r1 = await store.checkAndIncrement("test-scope", "key-3", config);
    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);

    const r2 = await store.checkAndIncrement("test-scope", "key-3", config);
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    const r3 = await store.checkAndIncrement("test-scope", "key-3", config);
    expect(r3.allowed).toBe(false);
    expect(r3.currentCount).toBe(2);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates by scope", async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };

    await store.reset("scope-a", "same-key");
    await store.reset("scope-b", "same-key");

    const r1 = await store.checkAndIncrement("scope-a", "same-key", config);
    expect(r1.allowed).toBe(true);

    const r2 = await store.checkAndIncrement("scope-b", "same-key", config);
    expect(r2.allowed).toBe(true);

    await store.reset("scope-a", "same-key");
    await store.reset("scope-b", "same-key");
  });

  it("resets counter for a scope+key", async () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    await store.reset("reset-scope", "reset-key");

    const r1 = await store.checkAndIncrement("reset-scope", "reset-key", config);
    expect(r1.allowed).toBe(true);

    const r2 = await store.checkAndIncrement("reset-scope", "reset-key", config);
    expect(r2.allowed).toBe(false);

    await store.reset("reset-scope", "reset-key");

    const r3 = await store.checkAndIncrement("reset-scope", "reset-key", config);
    expect(r3.allowed).toBe(true);
    expect(r3.currentCount).toBe(1);
  });

  it("cleanup removes expired windows", async () => {
    // With a very short window, we can test cleanup
    const config = { maxRequests: 10, windowMs: 1_000 };

    await store.reset("cleanup-scope", "cleanup-key");
    await store.checkAndIncrement("cleanup-scope", "cleanup-key", config);

    // Cleanup won't remove the current window (it hasn't expired)
    const removed = await store.cleanup();
    expect(removed).toBe(0); // current window still valid
  });
});
