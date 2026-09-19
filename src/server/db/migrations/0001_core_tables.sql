-- Fase 1: core tables (cases, facts, contradictions, snapshots, events, idempotency).
-- Hand-reviewed DDL equivalent to drizzle-kit generate output for src/server/db/schema.ts.

CREATE TABLE IF NOT EXISTS "cases" (
  "id" uuid PRIMARY KEY,
  "problem_slug" text NOT NULL,
  "jurisdiction" text NOT NULL,
  "locale" text NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "owner_id" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "current_snapshot_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "cases_owner_idx" ON "cases" ("owner_id");
CREATE INDEX IF NOT EXISTS "cases_problem_idx" ON "cases" ("problem_slug");

CREATE TABLE IF NOT EXISTS "case_facts" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "provenance" text NOT NULL,
  "status" text NOT NULL,
  "confidence" text NOT NULL,
  "evidence_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "resolution" jsonb,
  "supersedes_id" uuid,
  "superseded_by_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "case_facts_case_key_idx" ON "case_facts" ("case_id", "key");
CREATE INDEX IF NOT EXISTS "case_facts_case_status_idx" ON "case_facts" ("case_id", "status");

CREATE TABLE IF NOT EXISTS "case_contradictions" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "fact_id_a" uuid NOT NULL,
  "fact_id_b" uuid NOT NULL,
  "fact_key" text NOT NULL,
  "status" text NOT NULL,
  "resolution" jsonb,
  "detected_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "case_contradictions_case_idx" ON "case_contradictions" ("case_id", "status");

CREATE TABLE IF NOT EXISTS "case_snapshots" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "previous_snapshot_id" uuid,
  "engine_version" text NOT NULL,
  "ruleset_hash" text,
  "source_versions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ai_request_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fact_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "contradiction_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "case_snapshots_case_idx" ON "case_snapshots" ("case_id", "created_at");

CREATE TABLE IF NOT EXISTS "case_events" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "case_events_case_idx" ON "case_events" ("case_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "key" text PRIMARY KEY,
  "response" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "scope" text
);
