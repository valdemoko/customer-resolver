-- Fase 2: evidence tables (metadata + content representation, no bytes).

CREATE TABLE IF NOT EXISTS "evidence" (
  "id" uuid PRIMARY KEY,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "content" jsonb NOT NULL,
  "label" text,
  "checksum" text,
  "replaces_evidence_id" uuid,
  "replaced_by_evidence_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "evidence_case_idx" ON "evidence" ("case_id", "status");
CREATE INDEX IF NOT EXISTS "evidence_checksum_idx" ON "evidence" ("checksum");

-- N:N evidence ↔ fact. DELETE cascade on both sides keeps the graph coherent.
CREATE TABLE IF NOT EXISTS "evidence_fact_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "evidence_id" uuid NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
  "fact_id" uuid NOT NULL REFERENCES "case_facts"("id") ON DELETE CASCADE,
  "relation" text NOT NULL,
  "location" text,
  "note" text,
  "created_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_fact_unique_idx"
  ON "evidence_fact_links" ("evidence_id", "fact_id", "relation");
CREATE INDEX IF NOT EXISTS "evidence_fact_fact_idx" ON "evidence_fact_links" ("fact_id");
