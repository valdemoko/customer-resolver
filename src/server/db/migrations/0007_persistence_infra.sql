-- Migration 0007: Production persistence infrastructure (Fase 11)
--
-- ai_budgets: durable, atomic AI interpretation budget per case.
--   Replaces the in-memory Map in budget-store.ts.
--   Atomic UPDATE ... SET count = count + 1 WHERE count < max
--   ensures concurrent requests cannot exceed the global limit.
--
-- rate_limits: distributed rate limiting per scope (IP, caseId, endpoint).
--   Uses a sliding-window counter with automatic expiry cleanup.
--   Atomic INSERT + UPDATE ensures concurrent requests are counted correctly.

CREATE TABLE IF NOT EXISTS "ai_budgets" (
  "case_id" uuid PRIMARY KEY REFERENCES "cases"("id") ON DELETE CASCADE,
  "task" text NOT NULL DEFAULT 'PROBLEM_INTERPRETATION',
  "count" integer NOT NULL DEFAULT 0,
  "max_allowed" integer NOT NULL DEFAULT 3,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_budgets_task_idx" ON "ai_budgets" ("task", "count");

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "max_requests" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_scope_key_window_idx" ON "rate_limits" ("scope", "key", "window_start");
CREATE INDEX IF NOT EXISTS "rate_limits_expires_idx" ON "rate_limits" ("expires_at");
