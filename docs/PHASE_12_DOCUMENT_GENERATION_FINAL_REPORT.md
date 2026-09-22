# F12 — DOCUMENT & RECLAMATION GENERATION — FINAL REPORT

## 1. Executive summary

F12 implements a complete document generation pipeline that transforms case analysis into formal, traceable, legally-prudent documents. The system ensures:

- **AI drafts only** — the AI generates text from confirmed facts and supported claims
- **Deterministic validation** — every assertion is verified against input data before showing to the user
- **Full traceability** — every factual statement traces to a confirmed fact, every legal statement to a supported claim
- **Hallucination protection** — invented numbers, facts, claims, and sources are blocked
- **Versioning** — documents are versioned and historical versions are preserved
- **No automatic FINAL** — documents start as DRAFT and require user review

## 2. Architecture

```
Case Data (Facts, Claims, Sources)
        ↓
Input Builder (only CONFIRMED + SUPPORTED)
        ↓
AI Drafting (structured output, Zod-validated)
        ↓
Deterministic Validation (hallucination guard)
        ↓
Document (DRAFT status)
        ↓
User Review / Edit
        ↓
Finalization
```

## 3. Document Domain

### Document Types

- `CONSUMER_COMPLAINT` — general consumer complaint
- `REFUND_REQUEST` — refund/refund request
- `WARRANTY_CLAIM` — warranty claim
- `FLIGHT_CANCELLATION_CLAIM` — EU261 flight cancellation
- `GENERAL_FORMAL_REQUEST` — generic formal request

### Document Status Lifecycle

```
DRAFT → VALIDATED → USER_EDITED → FINAL → EXPORTED
                                    ↓
                                  REVOKED
```

### Versioning

Each document version is a separate DB row linked by `previous_version_id`. Historical versions are never overwritten.

## 4. Generation Pipeline

### Input Builder

- Filters to only CONFIRMED facts
- Filters to only SUPPORTED claims
- Builds citations from verified sources
- Identifies unresolved items (contradictions, missing info)
- Deterministic: same input → same output

### AI Drafting

- Structured Zod schema output (never raw text)
- Prompt explicitly constrains AI behavior:
  - "USA SOLO los hechos confirmados"
  - "NO inventes artículos ni leyes"
  - "NO inventes cantidades"
- Low temperature (0.1) for formal drafting

### Deterministic Validation

Seven validation checks:

1. **Factual traceability** — every statement traces to a confirmed fact
2. **Legal traceability** — every claim traces to a supported claim
3. **Source citation** — legal basis sections reference real sources
4. **Contradiction visibility** — contradictions cannot be hidden
5. **Numeric hallucination detection** — invented numbers flagged
6. **Section completeness** — required sections present
7. **Content safety** — absolute legal claims qualified

## 5. Files Created

| File                                                    | Purpose                      |
| ------------------------------------------------------- | ---------------------------- |
| `src/core/document-generation/types.ts`                 | Domain types                 |
| `src/core/document-generation/schemas.ts`               | Zod validation schemas       |
| `src/core/document-generation/input-builder.ts`         | Case data → structured input |
| `src/core/document-generation/validator.ts`             | Deterministic validation     |
| `src/core/document-generation/service.ts`               | Generation orchestrator      |
| `src/server/db/repositories/document-repository.ts`     | DB persistence               |
| `src/app/api/cases/[caseId]/documents/route.ts`         | API routes                   |
| `src/server/db/migrations/0008_generated_documents.sql` | DB migration                 |
| `tests/unit/document-generation/generation.test.ts`     | 23 tests                     |

## 6. Tests

```
unit:              685 (662 existing + 23 new)
integration:        43 (unchanged)
total:             728
```

### Test Categories

- **Input builder**: document type determination, fact filtering, claim filtering
- **Validator**: traceability, hallucination detection, contradiction visibility
- **Adversarial**: untraceable facts blocked, untraceable claims blocked, invented numbers warned
- **Schema**: valid drafts accepted, empty sections rejected, strict mode enforced

## 7. Validation

```
typecheck:  PASS
lint:       PASS (1 pre-existing warning)
build:      PASS
tests:      728/728
```

## 8. Security

- Case access verified before document operations
- Input validation via Zod at API boundary
- AI output validated against structured schema
- No PII sent to AI beyond necessary document data
- Storage keys system-generated (never user-provided)
- Private cache headers on all document endpoints

## 9. Deferred Work

- **PDF/DOCX adapters** — extend ExportPort with PDF/DOCX support
- **Document download endpoint** — GET /download with signed URLs
- **Document edit endpoint** — POST /finalize
- **UI components** — document preview, edit, download
- **AI budget for generation** — separate budget tracking
- **Stale document detection** — mark documents when case changes

## 10. Final Status

```
APPROVED
```
