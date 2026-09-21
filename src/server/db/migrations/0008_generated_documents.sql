-- Migration 0008: Generated documents (Fase 12)
--
-- generated_documents: versioned, traceable documents generated from case analysis.
-- Each version is a separate row. Content stored as JSONB (sections, statements, citations).
-- Files exported to R2 and referenced by storage_key.

CREATE TABLE IF NOT EXISTS "generated_documents" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "version" integer NOT NULL DEFAULT 1,
  "format" text NOT NULL DEFAULT 'txt',
  "title" text NOT NULL,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "content" jsonb NOT NULL,
  "analysis_snapshot_id" uuid,
  "ai_request_id" uuid,
  "prompt_id" text,
  "prompt_version" integer,
  "storage_key" text,
  "file_size" integer,
  "previous_version_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "generated_documents_case_idx" ON "generated_documents" ("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "generated_documents_status_idx" ON "generated_documents" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_case_version_idx" ON "generated_documents" ("case_id", "version");
