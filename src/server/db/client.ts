/**
 * Database client factory (Fase 1).
 *
 * Single infrastructure boundary for DB drivers:
 *  - production/dev:  Neon serverless driver (WebSocket) via DATABASE_URL
 *  - tests:           pglite (embedded Postgres) — no external DB, no network
 *
 * Uses neon-serverless (WebSocket) instead of neon-http to support
 * transactions — neon-http does not support db.transaction().
 *
 * The core never imports this module.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

export type AppDb =
  NodePgDatabase<typeof schema> | ReturnType<typeof drizzleNeonServerless<typeof schema>>;

/** Create a Neon-backed Drizzle instance from a connection string. */
export function createNeonDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzleNeonServerless(pool, { schema });
}

export { Pool as NeonPool };
