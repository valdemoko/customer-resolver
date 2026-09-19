/**
 * Database client factory (Fase 1).
 *
 * Single infrastructure boundary for DB drivers:
 *  - production/dev:  Neon serverless driver via DATABASE_URL
 *  - tests:           pglite (embedded Postgres) — no external DB, no network
 *
 * The core never imports this module.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon, NeonDbError } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type AppDb = NodePgDatabase<typeof schema> | ReturnType<typeof drizzleNeon<typeof schema>>;

/** Create a Neon-backed Drizzle instance from a connection string. */
export function createNeonDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzleNeon(sql, { schema });
}

export { NeonDbError };
