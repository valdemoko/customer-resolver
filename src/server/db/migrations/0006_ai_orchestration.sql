-- Migration 0006: AI orchestration provenance (Fase 6)
--
-- ai_requests: append-only audit of every AI request (ids, versions, hashes,
-- attempts, usage, timing). NO prompts, NO document content, NO PII.
-- Attempts live in a JSONB column: the per-request trace is small, bounded
-- and always read with its request — a separate ai_attempts table would
-- duplicate that without benefit (spec §26: only tables that are needed).

CREATE TABLE IF NOT EXISTS "ai_requests" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid REFERENCES "cases"("id") ON DELETE CASCADE,
  "task" text NOT NULL,
  "provider" text,
  "model" text,
  "prompt_id" text NOT NULL,
  "prompt_version" integer NOT NULL,
  "schema_version" text NOT NULL,
  "input_hash" text NOT NULL,
  "status" text NOT NULL,
  "usage" jsonb,
  "attempts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "error_code" text,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_requests_case_idx" ON "ai_requests" ("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_requests_task_idx" ON "ai_requests" ("task", "status");
CREATE INDEX IF NOT EXISTS "ai_requests_input_hash_idx" ON "ai_requests" ("input_hash");

-- Fase 6: AI-originated fact candidates carry their provenance.
-- ai_request_id is an identifier (no FK by design: candidates may outlive
-- audit retention); certainty preserves the model's declared certainty
-- (EXPLICIT/INFERRED/AMBIGUOUS) and is never upgraded by the system.

ALTER TABLE "document_fact_candidates"
  ADD COLUMN IF NOT EXISTS "certainty" text;
ALTER TABLE "document_fact_candidates"
  ADD COLUMN IF NOT EXISTS "ai_request_id" uuid;
