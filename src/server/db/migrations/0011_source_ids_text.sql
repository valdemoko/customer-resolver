-- Fase 8.4 fix: official source identifiers are DOMAIN ids, not UUIDs.
--
-- Sources are authored with stable, readable identifiers such as
-- "src-es-trlgdcu-art-117" (see src/problems/*/rules.ts). The column was `uuid`,
-- so every insert failed with "invalid input syntax for type uuid" — which meant
-- no source could be stored, no rule could be published (publication requires its
-- sources to be VERIFIED), and every case analysis aborted with
-- "rules not available as PUBLISHED".
--
-- The table is empty in every environment at the time of this migration (nothing
-- could ever be inserted), so this is a pure type widening.

ALTER TABLE "rule_sources" DROP CONSTRAINT IF EXISTS "rule_sources_source_id_fkey";

ALTER TABLE "sources" ALTER COLUMN "id" TYPE text USING "id"::text;
ALTER TABLE "sources" ALTER COLUMN "superseded_by_id" TYPE text USING "superseded_by_id"::text;

ALTER TABLE "rule_sources" ALTER COLUMN "source_id" TYPE text USING "source_id"::text;

ALTER TABLE "rule_sources"
  ADD CONSTRAINT "rule_sources_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE;
