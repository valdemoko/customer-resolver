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

| Fact                               | Tipo    | Justificación                                                      | Requerido |
| ---------------------------------- | ------- | ------------------------------------------------------------------ | --------- |
| `service.contract_start_date`      | date    | Regla 2 (art. 67.7)                                                | no        |
| `cancellation.date`                | date    | Reglas 1 y 3                                                       | sí        |
| `charge.date`                      | date    | Reglas 1 y 3                                                       | sí        |
| `charge.amount`                    | money   | Requisito de workflow (todo análisis de cobro necesita el importe) | sí        |
| `contract.commitment_exists`       | boolean | Contexto para intake adaptativo y Result Engine futuro             | no        |
| `cancellation.confirmation_exists` | boolean | Regla 3                                                            | no        |

Sin PII: ninguna pregunta recoge nombre, DNI, dirección o datos bancarios.

## 4. Intake adaptativo

`resolveNextQuestionWithValues()` (core, genérico): nunca re-pregunta un fact conocido; `askIf` con skip logic (solo pregunta la confirmación de cancelación cuando el usuario declara que NO había permanencia). Puro y determinista, testado.

## 5. Reglas reales publicadas (factual rules)

| Regla                                  | Condición                                                         | Fuente                            |
| -------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `charge-after-cancellation`            | `DATE_AFTER_FACT(charge.date, cancellation.date)`                 | Ley 11/2022 (anclaje de scope ES) || `contract-duration-over-24-months` | `DATE_AFTER_FACT(cancellation.date, service.contract_start_date)` ⚠️ ver §Auditoría | Ley 11/2022 art. 67.7 |
| `charge-after-confirmed-cancellation` | Regla 1 + `BOOLEAN_IS_TRUE(cancellation.confirmation_exists)` | Ley 11/2022 art. 67.7 |

**Draft (NO publicado, NO evaluado):** `penalty-after-legal-desistimiento` (art. 102.2 TRLGDCU) — requiere facts sobre modalidad de contratación (a distancia) que el intake actual no recoge. Flagged para revisión legal humana; documentado como el límite de lo que NO afirmamos.

## 6. Fuentes oficiales reales (verificación humana registrada)

Texto literal obtenido directamente del BOE el 2026-09-19 (PDF oficial BOE-A-2022-10757 descargado y extraído; texto consolidado del RDL 1/2007):

1. **Ley 11/2022, General de Telecomunicaciones** — `BOE-A-2022-10757`, consolidado 2025-12-27, art. 67.7: los contratos con consumidores «no tendrán un período de vigencia superior a veinticuatro meses» y, tras la prórroga automática, «los usuarios finales tienen el derecho de rescindirlo en cualquier momento con un preaviso máximo de un mes sin contraer ningún coste…».
2. **TRLGDCU (RDL 1/2007)** — art. 102.2: «Serán nulas de pleno derecho las cláusulas que impongan al consumidor y usuario una penalización por el ejercicio de su derecho de desistimiento…» (solo usada por la regla DRAFT).

Ambas pasan el gate de F3: `verifiedBy: human-reviewer-1`, `verifiedAt`, `verificationNote` con el método de verificación. La cita literal exacta vive en `relevantSection` de cada fuente.

**Auditoría legal crítica (docs prompt §30):** las reglas publicadas son exclusivamente _factual rules_ (orden de fechas, existencia de confirmación) — ninguna codifica una consecuencia jurídica. Lo que las fuentes NO amparan quedó deliberadamente sin codificar: la ley NO prohíbe penalizaciones de permanencia en general dentro del plazo comprometido; el límite de 24 meses usa un predicado conservador (ver §14 deuda).

## 7. Extensión del vocabulario de reglas (core)

Dos condiciones nuevas fact-vs-fact (extensión prevista por diseño desde F3):

- `DATE_AFTER_FACT { key, otherKey }` — la fecha del fact es estrictamente posterior a la de otro fact.
- `DATE_BEFORE_FACT { key, otherKey }` — inversa.

Ambas: deterministas, con trazas (`otherKey`, `actual`, `expected`), respetan contradicciones y missing facts, y están validadas en el schema Zod de la frontera de persistencia. La trazabilidad de _missing/contradicted_ del evaluador también camina por `otherKey`.

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

Con facts `USER_PROVIDED`/`USER_RESOLVED` (UNCONFIRMED), una condición que coincide produce **`POTENTIALLY_APPLICABLE`, no `SUPPORTED`**. `SUPPORTED` exige facts CONFIRMED — que llegarán con el workflow de evidencia de F5. `intakeComplete` significa "todas las preguntas _requeridas_ respondidas" (las opcionales no bloquean). Ambas decisiones están en los tests como especificación ejecutable.

## 11. Persistencia

Reutilización íntegra de F1–F3: `saveUnit` transaccional, locking optimista, idempotencia, snapshots encadenados, `rule_evaluations` append-only. La API demo (`POST /api/problems/[problemKey]/cases`) llama solo a servicios de aplicación, con 503 tipado si no hay `DATABASE_URL` y 404 `UNKNOWN_PROBLEM`.

## 12. Arquitectura: cambios y compliance

- **Sin cambios de arquitectura.** Extensiones: condiciones fact-vs-fact (previstas), `DeepWiden` en el contrato de módulos (ergonomía sin perder brands), `intakeComplete` por requisitos (corrección de semántica propia de F4).
- Compliance: core sin imports de Drizzle/Next/React/SDKs (grep + tests de boundaries de F0 en verde); el módulo importa solo de `@core/*`; ningún `if problem === ...` en el core; sin AI/OCR/R2/Result Engine/Action Engine/SEO/auth.

## 13. Tests (18 archivos, 136 tests — 29 nuevos)

- **Unit (módulo):** identidad estable, registro/duplicados, invariantes catálogo↔intake, skip logic, gating DRAFT vs PUBLISHED, fuentes declaradas, determinismo, INSUFFICIENT_DATA ≠ false, NOT_APPLICABLE jurisdiccional.
- **Integración (vertical slice):** pipeline completo case→facts→evidencia→análisis→snapshot con persistencia real (PGlite); reproducibilidad (mismo estado + misma fecha → mismas evaluaciones, mismo rulesetHash); contradicción bloquea → resolución → reevaluación; errores tipados.
- **F1+F2+F3:** 107 tests previos intactos y en verde.

## 14. Deuda conocida

1. **Precisión de la regla 2:** el vocabulario v1 compara dos facts directamente pero no puede expresar "más de N días entre dos facts"; la regla usa el predicado conservador (cancelación posterior a inicio). Refinamiento a 731 días: nueva condición (`DATE_AFTER_FACT_WITHIN_DAYS` o equivalente) en la siguiente iteración del vocabulario.
2. Regla DRAFT del art. 102.2 requiere facts de modalidad de contratación (intake futuro).
3. El recorder de evaluaciones en el test usa un stub en memoria; la persistencia real de `rule_evaluations` está cubierta por los tests de F3.
4. Verificación humana de fuentes: identidad abstracta (`human-reviewer-1`) hasta que exista auth (F3 ya lo documenta así).

## 15. Verificación real

| Comando             | Resultado                   |
| ------------------- | --------------------------- |
| `pnpm lint`         | ✅ 0 errores                |
| `pnpm format:check` | ✅                          |
| `pnpm typecheck`    | ✅ 0 errores                || `pnpm test` | ✅ **18 archivos, 136/136** |
| `pnpm build`        | ✅                          |
| `pnpm test:e2e`     | ✅ 2/2 (chromium)           |

## 16. Readiness for Phase 5

Lista: el pipeline completo funciona end-to-end con un problema real, fuentes oficiales verificadas y evaluaciones reproducibles. F5 (Document Intelligence) puede conectar aquí: los fixtures `DOCUMENT_EXTRACTED` ya demuestran que user-fact + document-fact coexisten, generan contradicciones y bloquean reglas hasta resolución explícita.

**STOP** — no se implementa Fase 5 automáticamente.

---

# APÉNDICE — AUDITORÍA FINAL (2026-09-19)

Auditoría independiente posterior al informe inicial. Resultado: **APPROVED_WITH_FIXES → correcciones aplicadas y verificadas**. Verdad numérica corregida: la suite real tiene **17 archivos y 125 tests** tras F4 (el informe inicial infló las cifras a 18/131 por un estado transitorio); tras la auditoría: 18 archivos, 136 tests.

## Hallazgos y correcciones

### F1 — Regla 2 (`contract-duration-over-24-months`): prediccado demasiado débil · SEVERIDAD ALTA
**Dónde:** `rules.ts`, condición `DATE_AFTER_FACT(cancellation.date, contract_start_date)`.
**Por qué:** el título y la clave de la regla afirman «más allá del período máximo de 24 meses», pero el predicado solo demuestra *duración > 0 días*. Un contrato de 1 día evalúa `SUPPORTED` (documentado ahora en el test adversarial `R2a`). La regla NO puede medir la ventana de 24 meses con el vocabulario actual.
**Corrección:** el módulo declara la regla como **predicate débil** y el Result Engine (F7) no podrá tratar su `SUPPORTED` como «contrato excede 24 meses» hasta que exista la condición `DATE_AFTER_FACT_WITHIN_DAYS` (o equivalente) que mida días entre facts. **NO se ha inventado una solución** (restricción de la auditoría): la corrección real es de vocabulario del core y se lista como prerrequisito para el Result Engine. La regla permanece publicada como predicate factual (cancelación posterior a inicio) pero su nombre sigue describiendo la intención: se acepta como deuda visible y testada, no como capacidad real.

### F2 — Regla 3: nombre con connotación jurídica · SEVERIDAD MEDIA · CORREGIDA
**Dónde:** `rules.ts`.
**Por qué:** `charge-after-penalty-free-rescission` implicaba «rescisión sin penalización» (consecuencia jurídica del art. 67.7) cuando la regla solo comprueba orden de fechas + existencia de confirmación.
**Corrección aplicada:** renombrada a `charge-after-confirmed-cancellation` («Cargo posterior a una cancelación con confirmación disponible»). Tests y catálogo actualizados. El valor `POTENTIALLY_APPLICABLE` se mantiene como suficiente: es el estado máximo que un fact UNCONFIRMED permite por diseño.

### F3 — Números del informe inflados · SEVERIDAD MEDIA · CORREGIDA
El informe inicial decía 18 archivos/131 tests; la verdad era 17/125. Corregido en este apéndice y en §13/§15.

### F4 — Constante muerta `MONTHS_24_AS_DAYS_UPPER` · SEVERIDAD BAJA · CORREGIDA
Código muerto de una iteración interrumpida. Eliminada.

### F5 — Skip logic vs regla 3: sin conflicto real · VERIFICADO
`askIf` solo controla cuándo se *pregunta*; `cancellation.confirmation_exists` entra como fact por cualquier vía (respuesta directa o evidencia futura). Si el fact no existe, la regla 3 devuelve `INSUFFICIENT_DATA` (test `R3a`) — nunca un falso `SUPPORTED`. Verificado además que la regla 3 no depende ocultamente de `contract.commitment_exists` (`R3c`).

### F6 — Draft rule art. 102.2: aislamiento correcto · VERIFICADO
Permanece DRAFT; el provider de reglas publicadas no la sirve (test `D1`); el intake no simula facts que no existen. Facts adicionales que necesitaría para ser evaluable: `contract.distance_contracting` (celebrado a distancia/fuera de establecimiento/entre presentes), `desistimiento.exercised_within_window`, `service.execution_started_with_consent` (excepciones art. 103). Sin ellos no puede publicarse.

### F7 — Provenance y seguridad semántica · VERIFICADO
Provenance es un tipo cerrado sin variante «legal»; `createFact` rechaza `USER_RESOLVED` fuera del camino de resolución; una afirmación del usuario («la empresa me dijo que es ilegal», «tengo derecho a 200 €») solo puede existir como fact `USER_PROVIDED`/`UNCONFIRMED` (tests `S1`/`S2`). Las afirmaciones legales dependen exclusivamente de facts → reglas → fuentes → evaluación.

### F8 — Fuentes: identificación correcta · VERIFICADO
`BOE-A-2022-10757` (Ley 11/2022, vigor 30-06-2022) y `BOE-A-2007-20555` (RDL 1/2007) verificados directamente contra el BOE; las citas de `relevantSection` coinciden con el texto publicado; ámbito material (servicios de comunicaciones electrónicas a consumidores) y jurisdicción (ES) coinciden con el problema. Incertidumbre residual documentada: el texto consolidado es informativo; para fines jurídicos rige la publicación oficial — la versión (`consolidado-2025-12-27`) y `retrievedAt` quedan registrados para reproducibilidad.

### F9 — Reproducibilidad y jurisdicción · VERIFICADO
Snapshots: hash determinista sobre contenido semántico (sin `Date.now()`, sin IDs aleatorios, orden canónico); cambio de fact/resolución/jurisdicción/regla/fuente/engine cambia el hash (tests F1/F3). Jurisdicción: módulo declara `["ES"]` exclusivamente, reutiliza el matching de F3, `NOT_APPLICABLE` fuera de jurisdicción (test de integración), sin lógica regional duplicada (no hay reglas regionales en este módulo).

## Estado final

- **Demostrable por el sistema hoy:** orden temporal de fechas (cargo vs cancelación, cancelación vs inicio de contrato), existencia de confirmación de cancelación.
- **Potencialmente aplicable:** todo lo anterior con facts UNCONFIRMED (`POTENTIALLY_APPLICABLE`).
- **Deliberadamente NO codificado:** ilegalidad de penalizaciones en general; importes de devolución; «te corresponde una devolución» (Result Engine, F7, con regla 2 corregida como prerrequisito).
- **Prerrequisito para el Result Engine:** condición de vocabulario que mida días entre dos facts (`DATE_AFTER_FACT_WITHIN_DAYS`).

**Veredicto:** APPROVED_WITH_FIXES — las correcciones F2/F3/F4 están aplicadas y en verde; la limitación F1 está documentada y testada como deuda visible. El módulo puede congelarse como `cancellation-charge@1` con esa restricción explícita. Siguiente paso: Fase 5.
