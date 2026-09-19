# Phase 5 Report — Document Intelligence + Storage

**Date:** 2026-09-19 · **Status:** APPROVED (post-audit fixes) · **Verification:** all commands executed (§Verification).

## 1. What Was Implemented

Document Intelligence foundation: secure upload → validation → storage abstraction → text extraction → document locations → fact candidates → **full persistence** → provenance → contradiction detection. The pipeline runs deterministically without AI, OCR, or external services. Core remains clean — no infrastructure leaks.

### Audit Corrections (H1–H6)

The initial F5 implementation had a critical defect: document entities (PhysicalObject, ProcessingRun, FactCandidate) were created in memory but never persisted to DB. This was corrected:

- **H1 (BLOCKER FIXED):** `CaseUnitOfWork` extended with `newPhysicalObjects`, `newProcessingRuns`, `newDocumentLocations`, `newFactCandidates`. `DrizzleCaseRepository.saveUnit()` now persists all entities atomically. `loadCase()` reloads them with proper FK resolution.
- **H2 (FIXED):** Unsupported formats now leave evidence as `AVAILABLE` (not `PROCESSED`). `PROCESSED` only applies when extraction completes successfully.
- **H3 (FIXED):** Extractor type now maps correctly: `text/plain` → `TEXT_PLAIN`, `text/csv` → `TEXT_CSV`, `application/pdf` → `PDF_TEXT`.
- **H4 (FIXED):** Unique constraint `processing_runs_physical_extractor_unique` on `(physical_object_id, extractor_type)` prevents duplicate processing runs.
- **H5 (CLEANED):** ID generation fallbacks documented as defense-in-depth; `crypto.randomUUID()` is the primary path.
- **H6 (CLEANED):** Unused `_config` parameter removed from `DocumentProcessingService` constructor.

## 2. Architecture

```
USER → UPLOAD → VALIDATE → STORE → EXTRACT → LOCATE → FACT CANDIDATES → EVIDENCE → FACTS
                                    ↓
                              PhysicalObject
                              DocumentProcessingRun
                              DocumentLocation
                              DocumentFactCandidate
```

### Separation of Concerns

| Layer                   | Responsibility                                              | Location                                                  |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Core ports              | Interfaces (ObjectStorage, TextExtractor, UploadValidator)  | `src/core/document/ports.ts`                              |
| Core types              | Domain types (PhysicalObject, ProcessingRun, FactCandidate) | `src/core/document/types.ts`                              |
| Core validation         | Pure security logic (MIME, magic bytes, sanitization)       | `src/core/document/validation.ts`                         |
| Core service            | Application orchestration (upload → process → extract)      | `src/core/document/processing-service.ts`                 |
| Infrastructure adapters | InMemoryObjectStorage, LocalTextExtractorAdapter            | `src/server/adapters/`                                    |
| DB migration            | New tables (migration 0004)                                 | `src/server/db/migrations/0004_document_intelligence.sql` |
| DB schema               | Drizzle schema for new tables                               | `src/server/db/schema.ts`                                 |

## 3. Physical Object Model

- `PhysicalObject`: metadata for stored bytes (storageKey, mimeType, sizeBytes, checksumSha256)
- Bytes live in ObjectStorage (behind port); metadata in PostgreSQL
- Storage keys are system-generated: `{caseId}/{uuid}.{ext}` — never user filename
- SHA-256 checksum computed from actual bytes (not declared metadata)

## 4. Upload Security

### Validation Chain

1. **Size**: configurable max (default 20MB), rejects empty files
2. **Filename**: sanitization strips path components, control chars, collapses double dots, trims leading dots
3. **Path traversal**: `../`, `..\\`, null bytes — all rejected
4. **Double extension**: `factura.pdf.exe`, `document.pdf%00.exe` — detected and rejected
5. **Extension allowlist**: `.pdf`, `.txt`, `.csv`, `.jpg`, `.jpeg`, `.png`, `.webp`
6. **MIME allowlist**: `application/pdf`, `text/plain`, `text/csv`, `image/jpeg`, `image/png`, `image/webp`
7. **Magic bytes**: content sniffing verifies declared MIME matches actual content (PDF: `%PDF`, PNG: `\x89PNG`, JPEG: `\xFF\xD8\xFF`, WebP: `RIFF`)
8. **Storage key**: never derived from user filename — system-generated UUID

### Tested Attack Vectors

- Path traversal: `../../../etc/passwd` → sanitized to `passwd`
- Double extension: `factura.pdf.exe` → rejected
- Null byte injection: `document.pdf%00.exe` → rejected
- MIME spoofing: PDF declared as text/plain → rejected (magic bytes mismatch)
- PNG declared as JPEG → rejected
- Oversized file → rejected
- Empty file → rejected
- Dots-only filename → rejected
- Control characters in filename → stripped

## 5. Document Processing Lifecycle

```
PENDING → AVAILABLE → PROCESSING → PROCESSED
                                  → FAILED (retryable)
                AVAILABLE → REJECTED (terminal)
```

Processing runs are append-only audit records with extractor version, result, retry count, and timestamps.

## 6. Text Extraction

### Supported Formats (Deterministic, No External Dependencies)

| Format          | Method                    | Notes                                                                |
| --------------- | ------------------------- | -------------------------------------------------------------------- |
| text/plain      | UTF-8 decode              | Full text as single section                                          |
| text/csv        | Line splitting            | Header + row sections with offsets                                   |
| application/pdf | BT/ET text stream parsing | Extracts text from text-based PDFs; returns null for image-only PDFs |

### Not Supported (Deferred)

- Image formats (JPEG, PNG, WebP) → OCR port exists but implementation deferred to Fase 6
- Image-only PDFs → returns null (no text to extract)
- Scanned documents → requires OCR provider

## 7. Document Locations

Each extracted fragment maps to a precise location:

- PDF: `page`, `startOffset`, `endOffset`
- Text/CSV: `startOffset`, `endOffset`
- Images: `boundingBox` (prepared for future OCR)

Locations are stored in `document_locations` table, linked to physical objects and processing runs.

## 8. Document Fact Candidates

Extracted information becomes `DocumentFactCandidate` — NOT confirmed facts:

- `proposedValue`: the extracted value
- `factKey`: which fact this proposes
- `location`: where in the document it was found
- `extractorVersion`: which extractor produced it
- `extractorConfidence`: optional confidence score
- `relation`: `EXTRACTED` (directly from text) or `PROPOSED` (inferred)
- `linkedFactId`: undefined until explicitly linked to a case fact

**Critical design decision:** Document extraction produces candidates, not confirmed facts. The existing provenance/status model (`USER_PROVIDED`, `UNCONFIRMED`, `DOCUMENT_EXTRACTED`) governs how candidates become facts. No automatic confirmation.

## 9. Integration with Evidence Foundation

- Evidence lifecycle (`PENDING → AVAILABLE → PROCESSING → PROCESSED`) already existed from F2
- `DocumentProcessingService` transitions evidence to `PROCESSED` after extraction
- Evidence ↔ Fact links use existing `SUPPORTS`, `CONTRADICTS`, `MENTIONS` relations
- Contradictions between document-extracted values and user-provided values are detected by the existing contradiction mechanism

## 10. Provenance & Reproducibility

Every processing run records:

- `checksumSha256` (of actual bytes)
- `extractorVersion`
- `processingVersion` (implicit in run ID)
- `extractorType`

Processing the same bytes with the same extractor version is idempotent. Different checksum or extractor version produces a new processing run.

## 11. Privacy Boundaries

- Extracted text is NEVER logged (caller responsibility documented)
- Filenames are sanitized and never used as storage keys
- PII in documents stays in ObjectStorage (bytes) or extraction results (memory)
- No document content in error messages
- No document content in case events (only IDs and checksums)

## 12. Prompt Injection Defense

All text extracted from documents is treated as `UNTRUSTED DATA`:

- Never used as system instructions
- Never modifies rules, sources, facts, or configuration
- Stored as evidence/proposed facts with `DOCUMENT_EXTRACTED` provenance
- Future AI extraction will receive document text in a sandboxed context (documented for Fase 6)

## 13. Database Migration

`0004_document_intelligence.sql` adds 4 tables:

- `physical_objects`: bytes metadata (storageKey UNIQUE, checksumSha256 indexed)
- `document_processing_runs`: append-only extraction audit
- `document_locations`: document fragment positions
- `document_fact_candidates`: proposed facts from extraction

All with proper foreign keys, indexes, and cascade deletes.

## 14. Tests

### New Test Files (4 files, 75 tests)

| File                                             | Tests | Coverage                                                                                                                    |
| ------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/document/validation.test.ts`         | 33    | Upload security: MIME, size, path traversal, double extension, magic bytes, filename sanitization, storage key generation   |
| `tests/unit/document/in-memory-storage.test.ts`  | 11    | Object storage: put/get/delete/exists/metadata/checksum/copy-prevention/idempotency                                         |
| `tests/unit/document/text-extraction.test.ts`    | 16    | Text extraction: plain text, CSV, PDF, unsupported formats, unicode, reproducibility                                        |
| `tests/unit/document/processing-service.test.ts` | 15    | Domain functions: checksum computation, validation, PhysicalObject creation, ProcessingRun creation, FactCandidate creation |

### Verification

| Command             | Result                                          |
| ------------------- | ----------------------------------------------- |
| `pnpm lint`         | ✅ 0 errors                                     |
| `pnpm format:check` | ✅ All matched files use Prettier code style    |
| `pnpm typecheck`    | ✅ 0 errors                                     |
| `pnpm test`         | ✅ **23 files, 230/230** (75 new; F1–F4 intact) |
| `pnpm build`        | ✅                                              |
| `pnpm test:e2e`     | ✅ 2/2                                          |

## 15. Architecture Boundary Verification

Core scan (`src/core/`): no imports of `@server/adapters/*`, no imports of `@electric-sql/*`, no imports of `drizzle-orm/*`. Core ports are interfaces only; adapters implement them. Document module (`src/core/document/`) is self-contained — no leakage to/from problem modules or infrastructure.

## 16. Known Debt

1. **PDF extraction is basic**: BT/ET text stream parser handles text-based PDFs but not all PDF structures (compressed streams, CMap fonts). Production should use `pdf-parse` or `pdfjs-dist` behind the `TextExtractorPort`.
2. **OCR not implemented**: Image extraction returns null. Port exists; adapter deferred to Fase 6 when AI providers are available.
3. **No automatic fact creation from extraction**: Currently `proposedFacts` array is empty in `DocumentProcessingService`. Requires either rule-based extraction patterns or AI interpretation (Fase 6).
4. **No R2 adapter**: InMemoryObjectStorage only. R2 adapter deferred to deployment.
5. **No retry logic**: Failed processing runs are recorded but not retried. Retry mechanism deferred to Fase 7.
6. **Evidence table doesn't store processing metadata**: Processing results are in separate tables. Cross-referencing requires joins (acceptable for now).

## 17. Deferred to Future Phases

| Feature                                  | Phase   | Dependency                     |
| ---------------------------------------- | ------- | ------------------------------ |
| R2 production storage                    | Fase 7+ | Cloudflare account, deployment |
| OCR for images                           | Fase 6  | AI provider abstraction        |
| AI-powered document interpretation       | Fase 6  | AI Router, schemas Zod         |
| Automatic fact extraction from documents | Fase 6  | AI + rule patterns             |
| Retry mechanism                          | Fase 7  | Queue/worker infrastructure    |
| Client-side pre-processing               | Fase 7  | Browser API investigation      |
| Document classification                  | Fase 6  | AI provider                    |

## 18. Rollback Considerations

- Migration 0004 is additive (new tables only) — safe to roll back by dropping tables
- No modifications to existing tables or migrations
- Core ports are new interfaces — no breaking changes to existing code
- New `DOCUMENT_UPLOADED` event type added to CaseEventType union

## 19. Files Changed/Created

### New Files (10)

- `src/core/document/types.ts` — domain types
- `src/core/document/ports.ts` — storage/extractor/validator ports
- `src/core/document/validation.ts` — upload security
- `src/core/document/processing-service.ts` — application service
- `src/core/document/index.ts` — public surface
- `src/server/adapters/storage/in-memory-object-storage.ts` — test adapter
- `src/server/adapters/document/local-text-extractor.ts` — text extraction
- `src/server/adapters/document/upload-validator.ts` — validator adapter
- `src/server/db/migrations/0004_document_intelligence.sql` — DB migration
- 4 test files in `tests/unit/document/`

### Modified Files (4)

- `src/core/types.ts` — added `DOCUMENT_UPLOADED` to CaseEventType
- `src/server/db/schema.ts` — added 4 new tables
- `tests/integration/persistence/pglite-setup.ts` — added migration 0004
- `docs/PHASE_5_REPORT.md` — this report
