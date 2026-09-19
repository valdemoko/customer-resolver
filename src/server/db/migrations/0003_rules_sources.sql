-- Fase 3: rules (declarative data, versioned) + sources (verified) + evaluations.

-- Rules are DATA: definition stored as validated JSON, never executed.
CREATE TABLE IF NOT EXISTS "rules" (
  "id" uuid PRIMARY KEY,
  "key" text NOT NULL,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "scope" jsonb NOT NULL,
  "root_condition" jsonb NOT NULL,
  "source_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "rules_key_version_unique" UNIQUE ("key", "version")
);
CREATE INDEX IF NOT EXISTS "rules_status_idx" ON "rules" ("status", "key");

-- Official sources with identity + version metadata and human verification.
CREATE TABLE IF NOT EXISTS "sources" (
  "id" uuid PRIMARY KEY,
  "external_id" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "publisher" text NOT NULL,
  "url" text NOT NULL,
  "jurisdiction" jsonb NOT NULL,
  "type" text NOT NULL,
  "published_on" text,
  "effective_from" text,
  "retrieved_at" timestamp with time zone NOT NULL,
  "version_identifier" text NOT NULL,
  "status" text NOT NULL,
  "verification" jsonb,
  "superseded_by_id" uuid,
  "relevant_section" text
);
CREATE INDEX IF NOT EXISTS "sources_status_idx" ON "sources" ("status");

-- Rule ↔ source traceability (explicit, queryable — not hidden in JSONB).
CREATE TABLE IF NOT EXISTS "rule_sources" (
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "source_id" uuid NOT NULL REFERENCES "sources"("id"),
  "rule_key" text NOT NULL,
  "rule_version" integer NOT NULL,
  "claim" text NOT NULL,
  CONSTRAINT "rule_sources_unique" UNIQUE ("rule_id", "source_id")
);
CREATE INDEX IF NOT EXISTS "rule_sources_source_idx" ON "rule_sources" ("source_id");

-- Persisted rule evaluations (append-only audit; reproducible per docs prompt §22).
CREATE TABLE IF NOT EXISTS "rule_evaluations" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "rule_key" text NOT NULL,
  "rule_version" integer NOT NULL,
  "status" text NOT NULL,
  "evaluation" jsonb NOT NULL,
  "ruleset_hash" text,
  "evaluated_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "rule_evaluations_case_idx" ON "rule_evaluations" ("case_id", "evaluated_at");
