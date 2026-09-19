# Phase 4 Report — First Real Problem Module: cancellation-charge

**Fecha:** 2026-09-19 · **Estado:** completada · **Verificación:** todos los comandos ejecutados realmente (§15).

---

## 1. Problem Module contract

`src/core/problems/contract.ts` — contrato genérico, declarativo:

- `ProblemModuleDefinition`: `key`, `version`, `title`, `description`, `jurisdictions`, `locales`, `factCatalogue`, `intake`, `ruleKeys`, `relatedProblems`.
- Validación Zod en la definición + invariantes cruzadas que el schema no puede expresar (cada pregunta mapea a un fact del catálogo; cada fact requerido tiene pregunta; cada `askIf` referencia un fact existente).
- `ProblemRegistry`: registro único por clave, error tipado en duplicados y desconocidos.
- `DeepWiden<T>`: permite a los módulos escribir literales (`"cancellation.date"`) preservando los branded types del dominio.

## 2. cancellation-charge module

`src/problems/cancellation-charge/` (3 archivos): `definition.ts` (catálogo + intake), `rules.ts` (fuentes + reglas), `index.ts`. **Cero conocimiento del problema dentro de `src/core/`** — verificado con scan de imports (solo menciones en comentarios doc).

Identidad estable: `cancellation-charge@1` (clave de dominio, nunca una ruta web).

## 3. Fact catalogue (cada fact justificado)

| Fact | Tipo | Justificación | Requerido |
|---|---|---|---|
| `service.contract_start_date` | date | Regla 2 (art. 67.7) | no |
| `cancellation.date` | date | Reglas 1 y 3 | sí |
| `charge.date` | date | Reglas 1 y 3 | sí |
| `charge.amount` | money | Requisito de workflow (todo análisis de cobro necesita el importe) | sí |
| `contract.commitment_exists` | boolean | Contexto para intake adaptativo y Result Engine futuro | no |
| `cancellation.confirmation_exists` | boolean | Regla 3 | no |

Sin PII: ninguna pregunta recoge nombre, DNI, dirección o datos bancarios.

## 4. Intake adaptativo

`resolveNextQuestionWithValues()` (core, genérico): nunca re-pregunta un fact conocido; `askIf` con skip logic (solo pregunta la confirmación de cancelación cuando el usuario declara que NO había permanencia). Puro y determinista, testado.

## 5. Reglas reales publicadas (factual rules)

| Regla | Condición | Fuente |
|---|---|---|
| `charge-after-cancellation` | `DATE_AFTER_FACT(charge.date, cancellation.date)` | Ley 11/2022 (anclaje de scope ES) |
| `contract-duration-over-24-months` | `DATE_AFTER_FACT(cancellation.date, service.contract_start_date)` | Ley 11/2022 art. 67.7 |
| `charge-after-penalty-free-rescission` | Regla 1 + `BOOLEAN_IS_TRUE(cancellation.confirmation_exists)` | Ley 11/2022 art. 67.7 |

**Draft (NO publicado, NO evaluado):** `penalty-after-legal-desistimiento` (art. 102.2 TRLGDCU) — requiere facts sobre modalidad de contratación (a distancia) que el intake actual no recoge. Flagged para revisión legal humana; documentado como el límite de lo que NO afirmamos.

## 6. Fuentes oficiales reales (verificación humana registrada)

Texto literal obtenido directamente del BOE el 2026-09-19 (PDF oficial BOE-A-2022-10757 descargado y extraído; texto consolidado del RDL 1/2007):

1. **Ley 11/2022, General de Telecomunicaciones** — `BOE-A-2022-10757`, consolidado 2025-12-27, art. 67.7: los contratos con consumidores «no tendrán un período de vigencia superior a veinticuatro meses» y, tras la prórroga automática, «los usuarios finales tienen el derecho de rescindirlo en cualquier momento con un preaviso máximo de un mes sin contraer ningún coste…».
2. **TRLGDCU (RDL 1/2007)** — art. 102.2: «Serán nulas de pleno derecho las cláusulas que impongan al consumidor y usuario una penalización por el ejercicio de su derecho de desistimiento…» (solo usada por la regla DRAFT).

Ambas pasan el gate de F3: `verifiedBy: human-reviewer-1`, `verifiedAt`, `verificationNote` con el método de verificación. La cita literal exacta vive en `relevantSection` de cada fuente.

**Auditoría legal crítica (docs prompt §30):** las reglas publicadas son exclusivamente *factual rules* (orden de fechas, existencia de confirmación) — ninguna codifica una consecuencia jurídica. Lo que las fuentes NO amparan quedó deliberadamente sin codificar: la ley NO prohíbe penalizaciones de permanencia en general dentro del plazo comprometido; el límite de 24 meses usa un predicado conservador (ver §14 deuda).

## 7. Extensión del vocabulario de reglas (core)

Dos condiciones nuevas fact-vs-fact (extensión prevista por diseño desde F3):

- `DATE_AFTER_FACT { key, otherKey }` — la fecha del fact es estrictamente posterior a la de otro fact.
- `DATE_BEFORE_FACT { key, otherKey }` — inversa.

Ambas: deterministas, con trazas (`otherKey`, `actual`, `expected`), respetan contradicciones y missing facts, y están validadas en el schema Zod de la frontera de persistencia. La trazabilidad de *missing/contradicted* del evaluador también camina por `otherKey`.

## 8. Analysis execution

`ProblemAnalysisService` (core, genérico):

1. Carga el aggregate completo (case + facts + contradicciones + evidencia + links) por el puerto.
2. Valida módulo registrado y jurisdicción soportada (errores tipados `UnknownProblemError`, `UnsupportedJurisdictionError`).
3. Construye el contexto puro de evaluación: facts no SUPERSEDED, claves bloqueadas por contradicciones UNRESOLVED, evidence refs de los links N:N, jurisdicción parseada (`ES`, `ES-AN`), `currentDate` inyectado.
4. Exige que TODAS las reglas del módulo estén PUBLISHED (error si falta una).
5. Pre-filtro jurisdiccional + `evaluateRule` puro por regla.
6. Persiste evaluaciones (append-only, `rulesetHash` FNV-1a determinista) + snapshot de análisis vía `CaseService.createSnapshotForCase` con hash de ruleset y versiones de fuente.

## 9. Evidence integration y contradicciones

- La evidencia (metadata EMAIL de test, sin OCR) se vincula SUPPORTS al fact de cargo; los refs llegan a la evaluación vía `evidenceRefs`.
- **Contradicción = bloqueo:** usuario dice 10-01, "documento" (fixture marcado TEST FIXTURE) dice 15-01 → la regla devuelve `CONTRADICTED`, nunca adivina. Tras resolución explícita del usuario (ganador + razón), la reevaluación produce `POTENTIALLY_APPLICABLE`.

## 10. Semántica de estados (decisión clave, testada)

Con facts `USER_PROVIDED`/`USER_RESOLVED` (UNCONFIRMED), una condición que coincide produce **`POTENTIALLY_APPLICABLE`, no `SUPPORTED`**. `SUPPORTED` exige facts CONFIRMED — que llegarán con el workflow de evidencia de F5. `intakeComplete` significa "todas las preguntas *requeridas* respondidas" (las opcionales no bloquean). Ambas decisiones están en los tests como especificación ejecutable.

## 11. Persistencia

Reutilización íntegra de F1–F3: `saveUnit` transaccional, locking optimista, idempotencia, snapshots encadenados, `rule_evaluations` append-only. La API demo (`POST /api/problems/[problemKey]/cases`) llama solo a servicios de aplicación, con 503 tipado si no hay `DATABASE_URL` y 404 `UNKNOWN_PROBLEM`.

## 12. Arquitectura: cambios y compliance

- **Sin cambios de arquitectura.** Extensiones: condiciones fact-vs-fact (previstas), `DeepWiden` en el contrato de módulos (ergonomía sin perder brands), `intakeComplete` por requisitos (corrección de semántica propia de F4).
- Compliance: core sin imports de Drizzle/Next/React/SDKs (grep + tests de boundaries de F0 en verde); el módulo importa solo de `@core/*`; ningún `if problem === ...` en el core; sin AI/OCR/R2/Result Engine/Action Engine/SEO/auth.

## 13. Tests (18 archivos, 131 tests — 24 nuevos)

- **Unit (módulo):** identidad estable, registro/duplicados, invariantes catálogo↔intake, skip logic, gating DRAFT vs PUBLISHED, fuentes declaradas, determinismo, INSUFFICIENT_DATA ≠ false, NOT_APPLICABLE jurisdiccional.
- **Integración (vertical slice):** pipeline completo case→facts→evidencia→análisis→snapshot con persistencia real (PGlite); reproducibilidad (mismo estado + misma fecha → mismas evaluaciones, mismo rulesetHash); contradicción bloquea → resolución → reevaluación; errores tipados.
- **F1+F2+F3:** 107 tests previos intactos y en verde.

## 14. Deuda conocida

1. **Precisión de la regla 2:** el vocabulario v1 compara dos facts directamente pero no puede expresar "más de N días entre dos facts"; la regla usa el predicado conservador (cancelación posterior a inicio). Refinamiento a 731 días: nueva condición (`DATE_AFTER_FACT_WITHIN_DAYS` o equivalente) en la siguiente iteración del vocabulario.
2. Regla DRAFT del art. 102.2 requiere facts de modalidad de contratación (intake futuro).
3. El recorder de evaluaciones en el test usa un stub en memoria; la persistencia real de `rule_evaluations` está cubierta por los tests de F3.
4. Verificación humana de fuentes: identidad abstracta (`human-reviewer-1`) hasta que exista auth (F3 ya lo documenta así).

## 15. Verificación real

| Comando | Resultado |
|---|---|
| `pnpm lint` | ✅ 0 errores |
| `pnpm format:check` | ✅ |
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm test` | ✅ **18 archivos, 131/131** |
| `pnpm build` | ✅ |
| `pnpm test:e2e` | ✅ 2/2 (chromium) |

## 16. Readiness for Phase 5

Lista: el pipeline completo funciona end-to-end con un problema real, fuentes oficiales verificadas y evaluaciones reproducibles. F5 (Document Intelligence) puede conectar aquí: los fixtures `DOCUMENT_EXTRACTED` ya demuestran que user-fact + document-fact coexisten, generan contradicciones y bloquean reglas hasta resolución explícita.

**STOP** — no se implementa Fase 5 automáticamente.
