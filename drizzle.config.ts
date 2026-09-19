import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Phase 0: no schema exists yet — Fase 1 defines entities.
 * This file only fixes locations and the driver, per docs/ARCHITECTURE.md §5/§29.
 * No credentials are hardcoded: everything comes from environment.
 */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
