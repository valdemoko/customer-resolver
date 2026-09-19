-- Migration 0004: Document Intelligence (Fase 5)
-- Physical objects (stored bytes), processing runs, document locations, fact candidates.

-- Physical objects: stored bytes metadata (actual bytes live in ObjectStorage).
CREATE TABLE IF NOT EXISTS "physical_objects" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id"               UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "evidence_id"           UUID NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
  "storage_key"           TEXT NOT NULL UNIQUE,
  "mime_type"             TEXT NOT NULL,
  "size_bytes"            INTEGER NOT NULL,
  "checksum_sha256"       TEXT NOT NULL,
  "original_filename"     TEXT,
  "status"                TEXT NOT NULL DEFAULT 'STORED',
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "physical_objects_case_idx" ON "physical_objects" ("case_id", "status");
CREATE INDEX IF NOT EXISTS "physical_objects_evidence_idx" ON "physical_objects" ("evidence_id");
CREATE INDEX IF NOT EXISTS "physical_objects_checksum_idx" ON "physical_objects" ("checksum_sha256");

-- Document processing runs: append-only audit of extraction attempts.
CREATE TABLE IF NOT EXISTS "document_processing_runs" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id"               UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "physical_object_id"    UUID NOT NULL REFERENCES "physical_objects"("id") ON DELETE CASCADE,
  "evidence_id"           UUID NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
  "status"                TEXT NOT NULL DEFAULT 'PENDING',
  "extractor_type"        TEXT NOT NULL,
  "extractor_version"     TEXT NOT NULL,
  "result"                JSONB,
  "retry_count"           INTEGER NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at"          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "processing_runs_case_idx" ON "document_processing_runs" ("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "processing_runs_physical_idx" ON "document_processing_runs" ("physical_object_id");

-- Document locations: where in a document a piece of content was found.
CREATE TABLE IF NOT EXISTS "document_locations" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "physical_object_id"    UUID NOT NULL REFERENCES "physical_objects"("id") ON DELETE CASCADE,
  "processing_run_id"     UUID NOT NULL REFERENCES "document_processing_runs"("id") ON DELETE CASCADE,
  "page"                  INTEGER,
  "start_offset"          INTEGER NOT NULL,
  "end_offset"            INTEGER NOT NULL,
  "bounding_box"          JSONB,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "document_locations_physical_idx" ON "document_locations" ("physical_object_id");

-- Document fact candidates: proposed facts from document extraction.
-- NOT confirmed facts — provenance = DOCUMENT_EXTRACTED, status = UNCONFIRMED.
CREATE TABLE IF NOT EXISTS "document_fact_candidates" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id"               UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "evidence_id"           UUID NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
  "physical_object_id"    UUID NOT NULL REFERENCES "physical_objects"("id") ON DELETE CASCADE,
  "processing_run_id"     UUID NOT NULL REFERENCES "document_processing_runs"("id") ON DELETE CASCADE,
  "fact_key"              TEXT NOT NULL,
  "proposed_value"        JSONB NOT NULL,
  "location_id"           UUID REFERENCES "document_locations"("id"),
  "extractor_version"     TEXT NOT NULL,
  "extractor_confidence"  REAL,
  "relation"              TEXT NOT NULL DEFAULT 'EXTRACTED',
  "linked_fact_id"        UUID REFERENCES "case_facts"("id"),
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fact_candidates_case_idx" ON "document_fact_candidates" ("case_id", "fact_key");
CREATE INDEX IF NOT EXISTS "fact_candidates_evidence_idx" ON "document_fact_candidates" ("evidence_id");
CREATE INDEX IF NOT EXISTS "fact_candidates_run_idx" ON "document_fact_candidates" ("processing_run_id");
