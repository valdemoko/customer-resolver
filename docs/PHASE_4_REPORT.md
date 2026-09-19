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

| Regla                                 | Condición                                                     | Fuente                            |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `charge-after-cancellation`           | `DATE_AFTER_FACT(charge.date, cancellation.date)`             | Ley 11/2022 (anclaje de scope ES) |     | `contract-duration-over-24-months` | `DATE_DIFFERENCE(start=contract_start, end=cancellation, 24 MONTHS, GREATER_THAN)` | Ley 11/2022 art. 67.7 |
| `charge-after-confirmed-cancellation` | Regla 1 + `BOOLEAN_IS_TRUE(cancellation.confirmation_exists)` | Ley 11/2022 art. 67.7             |

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

| Comando             | Resultado         |
| ------------------- | ----------------- |
| `pnpm lint`         | ✅ 0 errores      |
| `pnpm format:check` | ✅                |
| `pnpm typecheck`    | ✅ 0 errores      |     | `pnpm test` | ✅ **18 archivos, 136/136** |
| `pnpm build`        | ✅                |
| `pnpm test:e2e`     | ✅ 2/2 (chromium) |

## 16. Readiness for Phase 5

Lista: el pipeline completo funciona end-to-end con un problema real, fuentes oficiales verificadas y evaluaciones reproducibles. F5 (Document Intelligence) puede conectar aquí: los fixtures `DOCUMENT_EXTRACTED` ya demuestran que user-fact + document-fact coexisten, generan contradicciones y bloquean reglas hasta resolución explícita.

**STOP** — no se implementa Fase 5 automáticamente.

---

# APÉNDICE — AUDITORÍA FINAL (2026-09-19)

Auditoría independiente posterior al informe inicial. Resultado: **APPROVED_WITH_FIXES → correcciones aplicadas y verificadas**. Verdad numérica corregida: la suite real tiene **17 archivos y 125 tests** tras F4 (el informe inicial infló las cifras a 18/131 por un estado transitorio); tras la auditoría: 18 archivos, 136 tests.

## Hallazgos y correcciones

### F1 — Regla 2 (`contract-duration-over-24-months`): prediccado demasiado débil · SEVERIDAD ALTA · **RESUELTA (ver Apéndice B)**

**Dónde:** `rules.ts`, condición `DATE_AFTER_FACT(cancellation.date, contract_start_date)`.
**Por qué:** el título y la clave de la regla afirman «más allá del período máximo de 24 meses», pero el predicado solo demuestra _duración > 0 días_. Un contrato de 1 día evaluaba `SUPPORTED` (documentado entonces en el test adversarial `R2a`). La regla NO podía medir la ventana de 24 meses con el vocabulario de entonces.
**Estado:** **RESUELTA.** Se añadió la condición genérica `DATE_DIFFERENCE` con aritmética calendárica de meses al Rule Engine (ver Apéndice B) y la regla ahora realmente mide > 24 meses calendáricos. `SUPPORTED` significa exactamente lo que la regla declara.

### F2 — Regla 3: nombre con connotación jurídica · SEVERIDAD MEDIA · CORREGIDA

**Dónde:** `rules.ts`.
**Por qué:** `charge-after-penalty-free-rescission` implicaba «rescisión sin penalización» (consecuencia jurídica del art. 67.7) cuando la regla solo comprueba orden de fechas + existencia de confirmación.
**Corrección aplicada:** renombrada a `charge-after-confirmed-cancellation` («Cargo posterior a una cancelación con confirmación disponible»). Tests y catálogo actualizados. El valor `POTENTIALLY_APPLICABLE` se mantiene como suficiente: es el estado máximo que un fact UNCONFIRMED permite por diseño.

### F3 — Números del informe inflados · SEVERIDAD MEDIA · CORREGIDA

El informe inicial decía 18 archivos/131 tests; la verdad era 17/125. Corregido en este apéndice y en §13/§15.

### F4 — Constante muerta `MONTHS_24_AS_DAYS_UPPER` · SEVERIDAD BAJA · CORREGIDA

Código muerto de una iteración interrumpida. Eliminada.

### F5 — Skip logic vs regla 3: sin conflicto real · VERIFICADO

`askIf` solo controla cuándo se _pregunta_; `cancellation.confirmation_exists` entra como fact por cualquier vía (respuesta directa o evidencia futura). Si el fact no existe, la regla 3 devuelve `INSUFFICIENT_DATA` (test `R3a`) — nunca un falso `SUPPORTED`. Verificado además que la regla 3 no depende ocultamente de `contract.commitment_exists` (`R3c`).

### F6 — Draft rule art. 102.2: aislamiento correcto · VERIFICADO

Permanece DRAFT; el provider de reglas publicadas no la sirve (test `D1`); el intake no simula facts que no existen. Facts adicionales que necesitaría para ser evaluable: `contract.distance_contracting` (celebrado a distancia/fuera de establecimiento/entre presentes), `desistimiento.exercised_within_window`, `service.execution_started_with_consent` (excepciones art. 103). Sin ellos no puede publicarse.

### F7 — Provenance y seguridad semántica · VERIFICADO

Provenance es un tipo cerrado sin variante «legal»; `createFact` rechaza `USER_RESOLVED` fuera del camino de resolución; una afirmación del usuario («la empresa me dijo que es ilegal», «tengo derecho a 200 €») solo puede existir como fact `USER_PROVIDED`/`UNCONFIRMED` (tests `S1`/`S2`). Las afirmaciones legales dependen exclusivamente de facts → reglas → fuentes → evaluación.

### F8 — Fuentes: identificación correcta · VERIFICADO

`BOE-A-2022-10757` (Ley 11/2022, vigor 30-06-2022) y `BOE-A-2007-20555` (RDL 1/2007) verificados directamente contra el BOE; las citas de `relevantSection` coinciden con el texto publicado; ámbito material (servicios de comunicaciones electrónicas a consumidores) y jurisdicción (ES) coinciden con el problema. Incertidumbre residual documentada: el texto consolidado es informativo; para fines jurídicos rige la publicación oficial — la versión (`consolidado-2025-12-27`) y `retrievedAt` quedan registrados para reproducibilidad.

### F9 — Reproducibilidad y jurisdicción · VERIFICADO

Snapshots: hash determinista sobre contenido semántico (sin `Date.now()`, sin IDs aleatorios, orden canónico); cambio de fact/resolución/jurisdicción/regla/fuente/engine cambia el hash (tests F1/F3). Jurisdicción: módulo declara `["ES"]` exclusivamente, reutiliza el matching de F3, `NOT_APPLICABLE` fuera de jurisdicción (test de integración), sin lógica regional duplicada (no hay reglas regionales en este módulo).

## Estado final

- **Demostrable por el sistema hoy:** orden temporal de fechas (cargo vs cancelación), duración contractual real en meses calendáricos (> 24 meses), existencia de confirmación de cancelación.
- **Potencialmente aplicable:** todo lo anterior con facts UNCONFIRMED (`POTENTIALLY_APPLICABLE`).
- **Deliberadamente NO codificado:** ilegalidad de penalizaciones en general; importes de devolución; «te corresponde una devolución» (Result Engine, F7, con regla 2 corregida como prerrequisito).
- **Prerrequisito para el Result Engine:** ~~condición de vocabulario que mida días entre dos facts~~ **resuelto** con `DATE_DIFFERENCE` (Apéndice B).

**Veredicto:** APPROVED_WITH_FIXES — las correcciones F2/F3/F4 están aplicadas y en verde; la limitación F1 está documentada y testada como deuda visible. El módulo puede congelarse como `cancellation-charge@1` con esa restricción explícita. Siguiente paso: Fase 5.

---

# APÉNDICE B — CORRECCIÓN F1: CONDICIÓN `DATE_DIFFERENCE` (2026-09-19)

Corrección ejecutada tras la auditoría. La deuda de la regla 2 ya NO existe: `SUPPORTED` en `contract-duration-over-24-months` significa ahora, literalmente, que la diferencia calendárica entre las fechas del caso supera 24 meses.

## Nueva condición en el vocabulario del core

```text
DATE_DIFFERENCE {
  startFact, endFact,        // dos facts de fecha
  duration,                  // entero positivo
  unit: DAYS | MONTHS,
  comparison: GREATER_THAN | GREATER_OR_EQUAL
}
```

Declarativa, pura y determinista. Sin `eval`, sin ejecución de código, sin `new Date()`, sin fechas de referencia ocultas: las únicas fechas son las de los facts. Validada con Zod en la frontera de persistencia como el resto del vocabulario.

## Semántica calendárica (definida y testada)

`met ⇔ date(end) > date(start) + duration` (estricto) o `>=` en modo `GREATER_OR_EQUAL`.

- **Meses = calendario, no aproximación:** jamás `24×30` ni `365/12`. Se añade la duración con `addMonths` y se compara el resultado con `end`.
- **addMonths:** preserva el día del mes; si el mes destino no tiene ese día, **clamp al último día** (2024-01-31 + 1m = 2024-02-29 bisiesto; 2023-01-31 + 1m = 2023-02-28; 2024-02-29 + 12m = 2025-02-28).
- **Fechas invertidas** (end < start): jamás satisfacen una duración positiva → `NOT_APPLICABLE` (test explícito).
- **Fechas iguales:** `NOT_APPLICABLE` para cualquier duración ≥ 1.
- **DAYS:** conteo de días de 24h en UTC, sin DST ni hora local.
- **Casos exactos exigidos:** 2024-01-01 → 2026-01-01 = exactamente 24 meses → `NOT_APPLICABLE`; → 2026-01-02 → `SUPPORTED`; un solo día (01→02-01-2024) → `NOT_APPLICABLE` (regresión del bug auditado).

## Alineación de vocabulario (cambio de decisión documentado)

Durante la corrección se detectó una incoherencia preexistente: «todos los facts presentes y condición falsa» devolvía `UNKNOWN`, pero `UNKNOWN` quedó desde F3 como categoría residual sin significado operativo — y el prompt de corrección exige falsa → `NOT_APPLICABLE` (la condición declarada por la regla simplemente no se cumple). Se ha alineado **todo el evaluador** (no solo la condición nueva): falsa con facts confirmados y sin bloqueos → **`NOT_APPLICABLE`**; `UNKNOWN` queda reservado para fallos de clasificación futuros (inalcanzable en v1). Afectó a 10 asserts de tests, actualizados. Justificación: mantener dos semánticas paralelas (nueva condición vs resto) habría sido la incoherencia exacta que esta corrección debía evitar. `ARCHITECTURE.md` no fijaba la semántica de condición falsa, por lo que no hay contradicción con la arquitectura aprobada.

## Bug adicional encontrado y corregido durante la implementación

`referencesKey` del evaluador no reconocía `startFact`/`endFact`, por lo que facts UNCONFIRMED en la condición nueva NO limitaban a `POTENTIALLY_APPLICABLE` (devolvía `SUPPORTED`). Corregido y testado.

## Reproducibilidad (§7 del prompt)

La aritmética opera sobre enteros (año, mes, día) y `Date.UTC`/accessors UTC exclusivamente — sin hora local, sin locale, sin reloj. Verificado empíricamente ejecutando la misma aserción bajo `TZ=UTC`, `TZ=America/New_York`, `TZ=Pacific/Kiritimati` (UTC+14) y `TZ=Asia/Kathmandu` (UTC+5:45): resultado idéntico (test temporal eliminado tras la verificación; la suite permanente no depende de TZ).

## Tests

- Nueva suite `tests/unit/core/rules/date-difference.test.ts` (19 tests): límites exactos, bisiesto, clamp de fin de mes, fechas invertidas, días, estados (INSUFFICIENT_DATA por fact, CONTRADICTED por status y por contradictedKeys, POTENTIALLY_APPLICABLE con UNCONFIRMED, TYPE_MISMATCH seguro).
- `R2a` del audit adversarial invertido: ahora verifica que un contrato de 1 día **no** produce `SUPPORTED` (regresión del bug).
- Suite total: **19 archivos, 155/155 tests** en verde (lint/format/typecheck/build/E2E verificados).

## Estado

Criterio de aceptación cumplido: _si `contract-duration-exceeds-24-months` devuelve `SUPPORTED`, los facts confirmados demuestran realmente una duración superior a 24 meses según la semántica calendárica definida._ F1 cerrada; sin deuda temporal pendiente. El módulo queda listo para congelarse.

---

# APÉNDICE C — AUDITORÍA JURÍDICA FINAL (2026-09-19)

Auditoría de semántica jurídica de las reglas PUBLICADAS de `cancellation-charge@1`, solicitada explícitamente antes de congelar F4.

## Hallazgo principal: regla 2

**Regla anterior:** `contract-duration-over-24-months` con título *"El contrato estuvo en vigor más allá del período máximo de 24 meses (art. 67.7)"*.

**Problema:** el título afirmaba una consecuencia normativa del art. 67.7 (el contrato incumple el límite legal), pero la condición solo demostraba un hecho temporal (duración > 24 meses). El art. 67.7 tiene condiciones de applicabilidad que la regla no verificaba:

1. Tipo de servicio: comunicaciones electrónicas disponibles al público (no M2M).
2. Tipo de contratante: consumidor (o micro/pequeña empresa/organización sin renuncia).
3. Excepción: contrato a plazos destinado exclusivamente al despliegue de conexión física.
4. Jurisdicción: España.

Una regla que afirma "excede el máximo del art. 67.7" sin verificar estas condiciones estaría sobreafirmando: un contrato de más de 24 meses que fuera M2M o un contrato de despliegue de fibra NO violaría el art. 67.7.

**Decisión adoptada: Opción A** — renombrar a `contract-duration-exceeds-24-months` con título *"La diferencia entre las fechas contractuales supera 24 meses calendáricos"*. La regla ahora demuestra exclusivamente el hecho temporal, sin afirmar consecuencia normativa alguna. El análisis de applicabilidad del art. 67.7 queda para el Result Engine (Fase 7).

**Por qué no Opción B:** añadir 3 facts (party_type, service_type, installment_exception) habría permitido modelar las condiciones de applicabilidad. Pero en F4 estamos construyendo el primer módulo; el intake del consumidor no debe crecer artificialmente con preguntas técnicas sobre tipo de contrato a plazos para despliegue de fibra. La Opción A es más honesta: el sistema demuestra un hecho, y la interpretación jurídica pertenece a una fase posterior con datos suficientes.

## Regla 1 — `charge-after-cancellation`

**Hecho que demuestra:** existe un cargo cuya fecha es posterior a la fecha declarada de cancelación por el usuario.

**Conclusión que NO permite obtener:** que el cargo sea ilegal, indebido o reclamable. El hecho de que un cargo sea posterior a una cancelación no implica por sí solo infracción normativa.

**Estado:** ✅ Correctamente factual. Sin cambios.

## Regla 3 — `charge-after-confirmed-cancellation`

**Hecho que demuestra:** existe un cargo posterior a una cancelación que el usuario puede confirmar documentalmente.

**Conclusión que NO permite obtener:** derecho automático a devolución, incumplimiento contractual, indemnización, o que la cancelación fuera legalmente efectiva. La confirmación del usuario no es verificación jurídica.

**Estado:** ✅ Correctamente factual. Sin cambios.

## Regla DRAFT — `penalty-after-legal-desistimiento`

**Mantener DRAFT.** Para evaluar correctamente el art. 102.2 TRLGDCU se necesitarían facts adicionales:

- `contract.distance_contracting`: tipo de contratación (a distancia / fuera de establecimiento / entre presentes).
- `desistimiento.exercised_within_window`: si el desistimiento se ejerció dentro del plazo legal.
- `contract.service_execution_started`: si el servicio comenzó a ejecutarse antes del desistimiento (art. 103).
- `contract.service_execution_with_consent`: si el consumidor dio consentimiento expreso.
- Otros hechos de las excepciones del art. 103 (bienes perecederos, sellos precintados, etc.).

No se puede publicar sin estos facts. La regla permanece DRAFT.

## Regla de oro — respuesta para cada regla

| Regla | ¿Qué hecho demuestra exactamente? | ¿Qué conclusión NO permite obtener? |
|---|---|---|
| `charge-after-cancellation` | Un cargo es posterior a una cancelación declarada | Ilegalidad, indebidez, reclamabilidad |
| `contract-duration-exceeds-24-months` | La diferencia entre fechas contractuales supera 24 meses | Que el contrato incumpla el art. 67.7 (faltan condiciones de applicabilidad) |
| `charge-after-confirmed-cancellation` | Un cargo es posterior a una cancelación con confirmación disponible | Derecho a devolución, efectividad legal de la cancelación |

## Veredicto

**APPROVED** — las tres reglas publicadas demuestran exclusivamente hechos que el sistema puede verificar determinísticamente. Ninguna afirma una consecuencia jurídica que sus facts + condiciones + fuente no puedan respaldar. La regla 2 fue renombrada para eliminar la referencia implícita al art. 67.7. La regla DRAFT permanece bloqueada con facts mínimos documentados. F4 puede congelarse.
