/**
 * Persistence test harness (Fase 1).
 *
 * PGlite = embedded Postgres (WASM) — no external DB, no network, no Docker.
 * Uses PGlite's own Drizzle driver. Each suite creates its own in-memory DB,
 * applies the real SQL migration and disposes it afterwards (docs prompt §32:
 * tests never touch a real DB).
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import * as schema from "@server/db/schema";
import type { CaseRepository } from "@core/ports";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "..", "src", "server", "db", "migrations");
const MIGRATION_FILES = ["0001_core_tables.sql", "0002_evidence_tables.sql"];
const MIGRATION_SQL = MIGRATION_FILES.map((file) =>
  readFileSync(join(migrationsDir, file), "utf8"),
).join("\n");

export interface PersistenceHarness {
  db: NodePgDatabase<Record<string, never>>;
  repo: CaseRepository;
  close(): Promise<void>;
}

export async function createPersistenceHarness(): Promise<PersistenceHarness> {
  const client = new PGlite();
  await client.exec(MIGRATION_SQL);
  const pgliteDb = drizzle(client, { schema });
  // PGlite's Drizzle driver is runtime-compatible with the node-postgres
  // surface the repository uses; the cast is confined to this test harness.
  const db = pgliteDb as unknown as NodePgDatabase<Record<string, never>>;
  return { db, repo: new DrizzleCaseRepository(db), close: () => client.close() };
}
