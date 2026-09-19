# Phase 1 Report — Core Foundations

**Fecha:** 2026-09-19 · **Estado:** completada · **Verificación:** todos los comandos ejecutados realmente (§Verification).

## Implemented

Motor genérico de casos, sin conocimiento jurídico ni de producto:

- **Domain model** (`src/core/types.ts`): Case, Fact, FactValue, FactProvenance, FactStatus, Contradiction, ContradictionResolution, EvidenceReference, CaseSnapshot, CaseEvent, CaseVersion — ids y códigos con brands, unión de valores de hechos cerrada y práctica.
- **State machine** (`src/core/case/state-machine.ts`): transiciones explícitas validadas; estados informativos `ANALYZING_X` como contexto (la base siempre es recuperable); `allowedEvents` para UI futura.
- **Facts** (`src/core/case/facts.ts`, `fact-value.ts`): creación con invariantes, actualización = supersesión con punteros bidireccionales, procedencia→bucket de confianza por defecto, comparación semántica de valores (nunca por string crudo).
- **Contradictions** (`src/core/case/contradictions.ts`): detección (valida mismo caso+clave+conflicto real), resolución explícita con razón obligatoria, doble resolución rechazada, `blockedKeys` para reglas futuras.
- **Snapshots** (`src/core/case/snapshots.ts`): anclas inmutables con provenance completa (engineVersion, rulesetHash, sourceVersions, aiRequestIds, previousSnapshotId) y hash SHA-256 determinista.
- **Domain events** (`src/core/case/events.ts`): trazabilidad sin event sourcing; el estado actual sigue siendo el modelo primario.
- **CaseService** (`src/core/case/service.ts`): orquestación — crear (idempotente), añadir fact con reconciliación automática (duplicado → no-op; conflicto → contradicción + estado), resolver, snapshottar, transicionar.
- **Puerto + adapter** (`src/core/ports.ts`, `src/server/db/repositories/case-repository.ts`): CaseRepository con unidad de trabajo atómica; adapter Drizzle con locking optimista condicional.
- **Esquema + migración** (`src/server/db/schema.ts`, `migrations/0001_core_tables.sql`): 6 tablas.

## Domain Model

Alineado 1:1 con `ARCHITECTURE.md` §5. Decisiones:

- `FactValue`: unión cerrada `string | number | boolean | date | datetime | money | enum | object`. Las fechas usan `IsoDate`/`IsoDateTime` brandeados (nada de strings sueltos); el dinero usa el valor `Money` de Fase 0.
- `FactProvenance`: `USER_PROVIDED | DOCUMENT_EXTRACTED | AI_INTERPRETED | DERIVED | SYSTEM | USER_RESOLVED`.
- `FactStatus`: `CONFIRMED | UNCONFIRMED | CONTRADICTED | SUPERSEDED` — taxonomía documentada (los hechos solo se crean como UNCONFIRMED; la confirmación llega con verificación de evidencia en fases posteriores).
- `EvidenceReference`: puntero estable (`evidenceId`, `documentId?`, `location?`) — prepara Fase 5 sin crear almacenamiento.
- No se crearon entidades sin uso en Fase 1 (sin actions, sources, users, ai_usage).

## Database

| Tabla                 | Propósito                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cases`               | agregado raíz con `version` (locking optimista) y `current_snapshot_id`                                                        |
| `case_facts`          | hechos con value/provenance/status/confidence/evidenceRefs/resolution JSONB tipados, cadena `supersedes_id`/`superseded_by_id` |
| `case_contradictions` | contradicciones con candidatas, estado y resolución                                                                            |
| `case_snapshots`      | snapshots inmutables con provenance                                                                                            |
| `case_events`         | eventos de dominio append-only (payload sin PII)                                                                               |
| `idempotency_keys`    | respuestas almacenadas por clave (creación de casos)                                                                           |

Índices: `(case_id, key)`, `(case_id, status)`, `(case_id, occurred_at)`, `(case_id, created_at)`, owner/problem. FKs con `ON DELETE CASCADE`. La migración 0001 está escrita a mano y revisada (equivale al output de drizzle-kit para este esquema).

## State Machine

```
DRAFT → COLLECTING_INFORMATION → READY_FOR_ANALYSIS → ANALYZING_X → RESULT_AVAILABLE
  → ACTION_IN_PROGRESS → AWAITING_RESPONSE → …                     ↓
NEEDS_INFORMATION ←(ANALYSIS_NEEDS_MORE_INFO / ANALYSIS_TIMED_OUT)─┘
HAS_CONTRADICTIONS ⇄ COLLECTING_INFORMATION (al resolver la última contradicción)
CLOSED desde casi cualquier estado; REOPEN solo desde CLOSED
```

Pura y determinista: `transition({current, event, hasUnresolvedContradictions?}) → {next, changed, eventType}`. Transición inválida lanza `InvalidCaseStateTransition` (nunca cambia silenciosamente).

## Facts

- Creación: clave namespaced obligatoria (`domain.field`), invariantes por tipo (dinero entero, enum en opciones, número finito).
- Duplicado (mismo valor): no crea fact nuevo ni contradicción — devuelve el existente y registra el evento.
- Actualización: siempre supersesión (el anterior queda SUPERSEDED con puntero; el nuevo referencia al anterior). El historial nunca se sobrescribe.
- `USER_RESOLVED` solo puede crearse desde el flujo de resolución (`allowUserResolved` interno).

## Contradictions

Detección → estado del caso `HAS_CONTRADICTIONS` → resolución explícita del usuario (ganador + razón, registrada en `ContradictionResolution` con quién/cuándo/por qué) → candidatos SUPERSEDED → nuevo fact `USER_RESOLVED` CONFIRMED → regreso a `COLLECTING_INFORMATION` (si no quedan sin resolver). Doble resolución lanza `DomainError`.

## Snapshots

Congelan: facts activos (sin SUPERSEDED), contradicciones, motor, ruleset hash, versiones de fuentes, ai request ids y snapshot anterior (cadena). `snapshotHash` produce el mismo digest para contenido semántico idéntico (ids/tiempo excluidos) y distinto si cambia reglas/motor/fuentes — la propiedad de reproducibilidad está testada.

## Persistence

- **Puerto** `CaseRepository` en el core: `createCase`, `loadCase`, `saveUnit(CaseUnitOfWork, expectedVersion)`, idempotencia. El core no importa Drizzle (ESLint + FS scan lo bloquean).
- **Adapter** Drizzle: `saveUnit` ejecuta TODO (facts nuevos/actualizados, contradicciones, snapshot, eventos, cambio de estado, bump de versión) en **una transacción** — imposible un estado parcialmente persistido.
- **Locking optimista**: `UPDATE … WHERE id = ? AND version = ?` → 0 filas = `ConcurrentCaseUpdateDbError` tipado (testeado con el escenario de dos pestañas).

## Tests

9 archivos, 40 tests:

- State machine: camino feliz, rutas alternativas, inválidas (con propiedad "una transición inválida nunca produce estado"), no-ops, allowedEvents.
- Facts: defaults por procedencia, invariantes de valor, supersesión, inmutabilidad del hecho previo, resolución.
- Contradictions: detección y sus guardas, resolución, doble resolución, razón obligatoria, winner válido, blockedKeys.
- Snapshots: exclusión de SUPERSEDED, hash determinista, sensibilidad del hash a reglas/motor.
- Independencia del core (Fase 0, sigue pasando).
- **Vertical slice con persistencia real** (PGlite): crear → fact → contradicción → duplicado → resolver → snapshot → persistir → recargar → verificar estado, hechos, cadena de supersesión, contradicción resuelta y secuencia exacta de eventos. Más locking optimista, idempotencia y persistencia de estados.

## Architecture Compliance

- Core sin imports de drizzle/next/react/SDKs (grep + boundaries + test FS).
- `ports & adapters`: infraestructura implementa el puerto del dominio, no al revés.
- Cero lógica legal: ninguna regla, plazo, derecho o fuente en el código (los tests usan `"test-problem"` y jurisdicción `"XX"` marcados como TEST FIXTURE).
- Desvío menor: el adapter depende del _tipo_ `NodePgDatabase` de Drizzle; PGlite (tests) es runtime-compatible y el cast está confinado al harness de test, documentado.

## Deferred

- Reglas y su evaluación (Fase 3); Problem Modules (Fase 4); confirmación de facts por evidencia (Fase 5); AI request ids reales (Fase 6); API HTTP sobre CaseService + ownership real (Fase 2/7); contraste CONTRADICTED como estado de fact (la infraestructura de contradicciones existe; el marcado automático de facts candidatos llega con el evidence engine).

## Known Issues

1. El test de locking optimista usa el adapter directamente (no el servicio) para simular la escritura obsoleta — intencional y documentado en el test.
2. PGlite no ejercita el driver Neon de producción; la primera conexión real contra Neon se valida en Fase 2 (riesgo bajo: mismo Drizzle, misma sintaxis SQL).
3. `case_versions` retirada del esquema final: el locking usa la columna `version` de `cases` (más simple, mismo efecto).

## Verification

| Comando             | Resultado                  |
| ------------------- | -------------------------- |
| `pnpm lint`         | ✅ 0 errores               |
| `pnpm format:check` | ✅                         |
| `pnpm typecheck`    | ✅ sin errores             |
| `pnpm test`         | ✅ 9 archivos, 40/40 tests |
| `pnpm build`        | ✅ producción OK (5 rutas) |
| `pnpm test:e2e`     | ✅ 2/2 (chromium)          |

## Architecture Decision Changes

| Decisión original                                 | Problema                                                        | Nueva decisión                                          | Motivo                                                    |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Estados de caso como lista plana (STRESS_TEST §7) | `ANALYZING` como estado real complica el retorno desde análisis | Sufijo `_X` para contextos informativos (`ANALYZING_X`) | La base siempre es recuperable; la UI muestra el contexto |
| `case_versions` como tabla aparte para locking    | Complejidad extra sin beneficio en Fase 1                       | Columna `version` en `cases` con UPDATE condicional     | Mismo control de concurrencia, menos tablas               |
| Taxonomía de eventos del stress test              | Faltaba `CASE_UPDATED` para no-ops informativos                 | Añadido `CASE_UPDATED`                                  | Trazabilidad sin mezclar con audit                        |
