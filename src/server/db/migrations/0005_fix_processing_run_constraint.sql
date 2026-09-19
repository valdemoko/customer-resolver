-- Migration 0005: Fix processing run unique constraint (H4 audit fix)
-- The constraint must be on (physical_object_id, extractor_version), not (physical_object_id, extractor_type).
-- Same physical object + same extractor type + different extractor version = legitimate re-processing.
-- Same physical object + same extractor version = idempotent (no duplicate).

DROP INDEX IF EXISTS "processing_runs_physical_extractor_unique";

-- Correct constraint: same document + same extractor version = idempotent
CREATE UNIQUE INDEX IF NOT EXISTS "processing_runs_physical_version_unique"
  ON "document_processing_runs" ("physical_object_id", "extractor_version");
