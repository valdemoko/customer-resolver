# Phase 3 Report — Rule Engine + Source Registry + Jurisdiction

**Fecha:** 2026-09-19 · **Estado:** completada · **Verificación:** todos los comandos ejecutados (§14).

## 1. Rule model

Declarativo y deliberadamente pequeño (`src/core/rules/types.ts`): `key` namespaced + `version`, título, `scope` jurisdiccional, `root` condition (árbol), `sourceIds` obligatorios, `status`. Las reglas son **datos**, no código: validadas con Zod en la frontera de persistencia y jamás ejecutadas (sin eval/Function/SQL dinámico).

## 2. Rule lifecycle

`DRAFT → REVIEWED → VERIFIED → PUBLISHED → DEPRECATED` con transiciones validadas (sin atajos DRAFT→PUBLISHED; testeado). `DEPRECATED` terminal. `PUBLISHED` exige pasar el gate (§8).

## 3. Rule versioning

Una regla publicada es **inmutable** (`assertPublishedRuleImmutable`): cualquier cambio de condición/threshold/fuente/scope exige `nextRuleVersion()` → nueva versión DRAFT que repite el ciclo completo. `(key, version)` es UNIQUE en DB. Versiones antiguas coexisten y son consultables (testeado en persistencia).

## 4. Condition system

Vocabulario cerrado de 12 atómicas (EXISTS, EQUALS/NOT_EQUALS, 4 comparaciones numéricas, DATE_BEFORE/AFTER/WITHIN_DAYS, BOOLEAN true/false) + composición `ALL/ANY/NOT`. Sin DSL, sin expresiones arbitrarias. Reutiliza `IsoDate`/money de Fase 0 — sin floats, sin conversiones de zona.

## 5. Evaluation statuses

`SUPPORTED | POTENTIALLY_APPLICABLE | INSUFFICIENT_DATA | CONTRADICTED | NOT_APPLICABLE | UNKNOWN` — vocabulario de claim_status de ARCHITECTURE.md §18, sin sistemas paralelos. Semántica: condición que evalúa falsa con todos los datos = `UNKNOWN`; falta un fact = `INSUFFICIENT_DATA` (**nunca false**, §7 del prompt); hecho sin confirmar = `POTENTIALLY_APPLICABLE` (máximo alcanzable sin hechos CONFIRMED).

## 6. Contradiction behavior

Un fact bloqueado por contradicción sin resolver → la condición no lee su valor: estado `CONTRADICTED` con `contradictedFacts` listados y trace `CONTRADICTED_FACT`. Jamás se adivina (testeado, adversarial C).

## 7. Source Registry

Fuente con identidad propia: `externalId` estable, publisher, URL (dato, nunca fetch), jurisdicción, `type` (taxonomía de 7), fechas de publicación/vigor, `retrievedAt`, `versionIdentifier`, `relevantSection`, verificación humana y `supersededById`. Lifecycle propio con el mismo patrón de estados.

## 8. Human verification gate (obligatorio)

`publishRule` **lanza** salvo que toda fuente requerida exista, esté VERIFIED/PUBLISHED, tenga registro `verifiedBy + verifiedAt + verificationNote` y `versionIdentifier`. `verifiedBy` es identidad abstracta en esta fase (sin auth aún). Testeado con los 4 modos de bloqueo + publicación limpia.

## 9. Source versioning

Las fuentes nunca se sobrescriben destructivamente; `versionIdentifier` + `retrievedAt` + `supersededById` permiten reproducibilidad histórica. Los `rule_evaluations` persistidos registran rule key+version y ruleset hash.

## 10–11. Jurisdiction model & matching

`{country, region?}` (soporta ES y ES-AN sin construir base mundial). Matching determinista con precedencia `EXACT > REGIONAL > COUNTRY_WIDE > NOT_APPLICABLE`; regla regional solo aplica a su par exacto; el mismatch produce `NOT_APPLICABLE` con razón y **sin evaluar condiciones** (adversarial K).

## 12. Determinism

`evaluateRule` es puro: tiempo inyectado (`context.currentDate`, adversarial J testea que cambiarlo cambia el resultado determinísticamente), sin red, sin IA, sin `new Date()` oculto. Test de igualdad estructural: misma entrada → mismo objeto evaluación (I).

## 13. Persistence

Migración `0003_rules_sources.sql`: `rules` (UNIQUE key+version), `sources` (externalId UNIQUE), `rule_sources` (trazabilidad explícita queryable, no escondida en JSONB), `rule_evaluations` (append-only por caso). Adapter `RulesRepository` con validación Zod en frontera (defensa en profundidad contra JSONB anárquico) y `rulesetHash` FNV-1a determinista (documentado: hash de identidad, no criptográfico).

## 14. Security

Reglas = datos validados con Zod (discriminated union recursiva de condiciones); sin eval/Function/dynamic import; sin SQL generado de expresiones; URLs de fuentes tratadas como datos sin fetch automático. Core verificado sin imports de drizzle/next/react ni `eval(`.

## 15. Tests

**15 archivos, 107 tests** (36 nuevos en F3): condiciones atómicas y composiciones (con actual/expected en traces), missing≠false, contradicciones, evidencia como trazabilidad (no como verdad), jurisdicción con precedencia, gate de publicación (F/G/M), inmutabilidad de publicadas (H), versionado, determinismo (I/J), persistencia de reglas versionadas/fuentes/verificaciones/links/evaluaciones append-only/hash de ruleset. Regresión F1+F2 intacta (71 tests previos).

## 16. Architecture changes

Menores y documentados: (1) `POTENTIALLY_APPLICABLE` se asigna a nivel de regla cuando hay hechos UNCONFIRMED involucrados — la definición del stress test era de Result Engine; moverla al evaluador evita duplicar lógica. (2) `rulesetHash` FNV-1a no criptográfico para identidad de ruleset (suficiente y documentado). Ningún otro cambio.

## 17. Known debt

El evaluador compara primitivas: facts money/enum/object requieren condiciones específicas futuras (se añadirán como nuevos kinds, el vocabulario es extensible por diseño). La selección "mejor fuente" ante múltiples reglas aplicables es tarea del Result Engine (F7).

## 18. Deliberately NOT implemented

AI, OCR, R2, SEO público, auth completa, dashboard, billing, Action Engine, Result Engine completo, decenas de reglas legales, fetch de URLs. Reglas reales: **cero** — solo fixtures marcados TEST FIXTURE (§25/§33: fuentes reales requieren verificación humana que llega en Fase 4).

## 19. Readiness for Phase 4

Lista. El primer Problem Module (`cancellation-charge`) declara reglas como datos + fuentes; el gate impide publicar sin revisión humana; el workflow conecta CaseService + EvidenceService + evaluateRule. El Result Engine (F7) consumirá `RuleEvaluation.traces` para explicaciones.
