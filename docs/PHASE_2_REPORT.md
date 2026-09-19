# Phase 2 Report — Case + Evidence Foundation

**Fecha:** 2026-09-19 · **Estado:** completada · **Verificación:** todos los comandos ejecutados (§14).

## 1. What was implemented

Evidence Management como capa de dominio sobre el Case Engine de Fase 1, **sin** OCR, PDF, AI, R2 ni análisis jurídico: la evidencia se representa, se versiona y se vincula a hechos con semántica explícita.

## 2. Domain model (`src/core/evidence/`)

- **`Evidence`**: id, caseId, `type` (DOCUMENT | IMAGE | EMAIL | MESSAGE | URL | OTHER), `status`, `source` (USER | SYSTEM | FUTURE_IMPORT — actores anónimos first-class), `content` (unión cerrada), `label`, `checksum`, cadena de reemplazo (`replacesEvidenceId`/`replacedByEvidenceId`), timestamps.
- **`EvidenceContent`**: `text | url | file` — **tipo de evidencia ≠ representación física** (un email puede ser texto; una URL no necesita archivo; un documento será file-backed en Fase 5).
- **`EvidenceFactLink`** (N:N): evidenceId, factId, `relation` (SUPPORTS | CONTRADICTS | MENTIONS), `location` extensible (página/línea/timestamp/fragmento — sin parsers todavía), note, timestamp.
- `Evidence` y `EvidenceReference` (F1) se mantienen distintos: la entidad es el ítem; la referencia apunta a él.

## 3. Evidence lifecycle

```
PENDING → AVAILABLE → PROCESSING → PROCESSED
              ↓              ↓
           REJECTED        FAILED → (AVAILABLE retry | REJECTED)
```

Semántica documentada en `types.ts`: AVAILABLE ≠ interpretado; PROCESSED ≠ conclusiones verdaderas. Ciclo de vida de evidencia ≠ confianza/estado del fact. Transiciones validadas; REJECTED y PROCESSED terminales; el historial nunca se borra.

## 4. EvidenceReference semantics

`location` es un string extensible de posicionamiento futuro ("page 2", "t=00:31", bounding box…) — la abstracción existe, los parsers no (Fase 5+).

## 5. Fact relationship semantics

**Asociación ≠ demostración.** `E → SUPPORTS → F` significa "asociada como soporte", nunca "el sistema demostró F". Ningún campo o API implica que evidencia prueba un hecho; la verdad sigue perteneciendo a `Fact.provenance/status` y al futuro Rule Engine. Un fact conserva `0..N` referencias (F1) y ahora también `0..N` links semánticos N:N (F2).

## 6. Database changes (migración `0002_evidence_tables.sql`)

- **`evidence`**: metadata + descriptor de contenido JSONB (sin bytes), checksum, cadena de reemplazo, FK cascade a cases, índices `(case_id,status)` y `checksum`.
- **`evidence_fact_links`**: N:N con FKs cascade a evidence y case_facts, `UNIQUE(evidence_id, fact_id, relation)` (idempotencia estructural), índice por `fact_id` (consulta "¿qué evidencia respalda este hecho?").
- Campos consultables/invariantes son columnas explícitas, no JSONB (relación, estado, checksum).

## 7. Transaction boundaries

Toda mutación de evidencia pasa por `saveUnit` → **una transacción**: evidencia + links + reemplazos + eventos + bump de versión. Imposible "evidence created, link failed, event missing". Test de rollback incluido.

## 8. Locking / idempotency

- **Locking**: `addEvidence` usa la versión leída del caso; escritura obsoleta → conflicto tipado (Case G testeado).
- **Idempotencia**: `addEvidence(idempotencyKey)` reutiliza el store de Fase 1 (Case H); el link duplicado es no-op estructural por el UNIQUE constraint + guard en el servicio.

## 9. Snapshot behavior

`buildEvidenceView` + `evidenceViewHash` (SHA-256): qué evidencia existía (id, tipo, estado, fuente, contentKind, checksum, reemplazos) y qué relaciones con location — **sin blobs, sin labels/notes** (volátiles excluidos del hash semántico deliberadamente). Tests: hash determinista ante reordenación; cambia si cambia una relación o el estado; no cambia con metadatos volátiles. Casos I/J cubiertos (snapshot antes/después de evidencia).

## 10. Security decisions (documentadas, no implementadas — son de Fase 5+)

Los contenidos de documentos son **datos, nunca instrucciones** (prompt injection accounted); MIME reportado nunca prueba el contenido; los archivos tendrán límites de tamaño; filenames jamás se usan como paths (`storageKey` opaco); el checksum cubre solo lo que el sistema realmente tiene (texto/URL/declarado) — sin prometer integridad criptográfica no verificada; el almacenamiento físico será responsabilidad exclusiva de infraestructura.

## 11. Privacy decisions

Sin PII innecesaria (label opcional, notas no semánticas); sin contenido en snapshots (descriptor + checksum); sin contenido en domain events (solo ids/tipos); metadata separada de contenido por diseño; source SYSTEM disponible para imports futuros sin identidad real.

## 12. Tests

**12 archivos, 71 tests** (31 nuevos en F2):

- Unit: creación/validación, checksum (contenido sí, metadatos no), máquina de estados, reemplazo con historial, links N:N con las 3 relaciones, snapshot-view (determinismo, sensibilidad, exclusión de volátiles).
- Integración (SQL real, PGlite): persistencia/recarga, Casos A–J completos, locking (G), idempotencia (H), rollback, snapshot antes/después (I/J).
- Regresión F1: los 40 tests previos siguen en verde.

## 13. Architecture changes

Ninguna decisión arquitectónica cambió. Adiciones compatibles: `CaseUnitOfWork` extendido con `newEvidence/updatedEvidence/newEvidenceLinks/removedEvidenceLinks`; `LoadedCase` incluye evidence+links; 6 nuevos tipos de evento de dominio. Cero event sourcing.

## 14. Verification

| Comando             | Resultado                |
| ------------------- | ------------------------ |
| `pnpm lint`         | ✅                       |
| `pnpm format:check` | ✅                       |
| `pnpm typecheck`    | ✅ 0 errores             |
| `pnpm test`         | ✅ 12 archivos, 71/71    |
| `pnpm build`        | ✅ Compiled successfully |
| `pnpm test:e2e`     | ✅ 2/2                   |

Migración aplicada desde estado limpio en cada suite de persistencia (PGlite efímero en memoria — ninguna DB real tocada). Sin secretos ni artefactos en el diff.

## 15. Deliberately NOT implemented

AI/OCR/PDF/R2/S3/uploads/email ingestion, source registry, jurisdiction rules, result/action engines, auth completa, dashboard, billing, workers/queues/Redis, SEO público. Ninguna fuga de alcance detectada en la auditoría final.

## 16. Readiness for Phase 3

**Lista.** El Rule Engine (F3) puede preguntar "¿qué evidencia respalda este hecho?" (`evidence_fact_links` por factId) y usar checksums para anclar reglas a contenido inmutable. Los hechos ya pueden nacer con `evidenceRefs` trazables y el Rule Engine encontrará `blockedKeys()` para hechos contradichos.
