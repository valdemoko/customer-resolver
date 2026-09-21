# Resolveo — Architecture Stress Test (Fase 0.5)

> **Estado:** auditoría completada sobre `docs/ARCHITECTURE.md` (releído íntegro).
> **Veredicto:** ver §48 del informe. Los fallos detectados se han corregido EN el documento de arquitectura (ver "Architecture Decision Changes" al final de ese archivo); no se ha escrito código.

---

## 1. Test de Problem Modules (extensibilidad)

Simulación conceptual de los 8 problemas pedidos. Para cada uno, qué aporta el módulo y qué usa del core:

| #   | Módulo                          | Preguntas clave                                        | Fact keys típicos                                                    | Documentos                                      | Reglas típicas                                                          | Fuente (tipo, a verificar)                | Particularidad estructural                                                                                                                                                                                                                                      |
| --- | ------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | cobro-despues-cancelar          | fechas contrato/baja, importe, permanencia             | `cancellation.*`, `charge.*`                                         | contrato, factura final, email de baja          | posterioridad cobro vs baja; penalización proporcional                  | ley consumidores + guía regulador telecom | referencia                                                                                                                                                                                                                                                      |
| B   | pedido-no-recibido              | fecha pedido, plazo, contactos previos                 | `order.date`, `delivery.promise_date`, `refund.state`                | pedido, tracking, email vendedor                | plazo máx. entrega; reembolso 14 días desde desistimiento               | ley consumidores (plazos)                 | referencia                                                                                                                                                                                                                                                      |
| C   | garantia-rechazada              | fecha compra, tipo garantía legal vs comercial, avería | `purchase.date`, `defect.reported_date`, `warranty.rejection_reason` | factura, comunicación de rechazo                | garantía legal ≥3 años (ES, a verificar); carga de la prueba            | ley consumidores                          | referencia                                                                                                                                                                                                                                                      |
| D   | factura-electrica-incorrecta    | CUPS, periodo, lectura estimada vs real                | `bill.period`, `meter.reading_*`, `tariff.change_date`               | factura, contrato suministro, foto contador     | lectura estimada vs real; cambio de tarifa no consentido                | normativa energía ES                      | ⚠️ primera vez que un dato se puede **auto-obtener de una foto del contador** → nuevo tipo de evidencia, pero solo configuration del módulo                                                                                                                     |
| E   | vuelo-cancelado                 | vuelo, fecha, aviso previo, distancia                  | `flight.*`, `notice.days`                                            | reserva, comunicado aerolínea, tarjeta embarque | compensación por distancia/aviso previo                                 | reglamento UE 261/2004                    | tabla de importes por distancia + distancias en km (unidad nueva: `distance`)                                                                                                                                                                                   |
| F   | seguro-rechaza-cobertura        | póliza, exclusión invocada                             | `policy.*`, `claim.rejection_clause`                                 | póliza, carta de rechazo, siniestro             | exclusión no comunicada / ambigua → contra proferentem (interpretación) | ley contrato seguro                       | **muchas reglas dependen de interpretación de cláusula → mayor uso de `ai_interpreted` con trust 0.5**; el resultado más frecuente será POTENTIALLY_APPLICABLE                                                                                                  |
| G   | salario-impagado                | nómina, fechas                                         | `payroll.*`                                                          | nómina, contrato                                | —                                                                       | —                                         | **FUERA DE ÁMBITO**: disputa laboral ≠ consumo (otro régimen jurídico, otros organismos, mayor sensibilidad). La arquitectura lo soporta (es solo otro módulo) pero **se excluye del roadmap cercano** por product realism y riesgo. Documentado como decisión. |
| H   | suscripcion-cobra-tras-cancelar | idéntico a A con dominio distinto                      | mismos que A                                                         | misma evidencia                                 | mismas reglas reutilizadas                                              | misma familia normativa                   | **candidato a alias/vista del módulo A** con keywords propios de SEO, en vez de módulo nuevo — demuestra que el registry debe soportar `extends`                                                                                                                |

**Veredicto de extensibilidad:** no se necesita ningún `if problem === ...` en el core. Los únicos cambios de core que reveló la simulación son (a) el enum cerrado `documents.kind` y (b) la unidad `distance`, resueltos así:

- `documents.kind` → enum base reducido (`invoice|contract|letter|email|photo|screenshot|other`) + `subtype: string` libre definida por el módulo. Corregido en ARCHITECTURE.md §5.
- valores de facts: `value jsonb` con Zod por módulo ya admite cualquier tipo, incluido `distance_km`. Sin cambio.
- `extends` de módulos añadido al contrato del registry (H no duplica a A).

## 2. Test de jurisdicciones

Modelo jerárquico verificado contra los tres ejemplos del prompt:

```
Jurisdiction("ES") ── sector "telecom" ── reglas de módulo versionadas por jurisdicción
Jurisdiction("UK") ── sector "telecom" ── ...
Jurisdiction("US-CA") ── sector "telecom" ── ...   (estado como parte del code)
```

- La **selección de reglas** es: intersección de `module.rulesByJurisdiction[j]` con `case.jurisdiction`, con fallback explícito a un ruleset "general" solo si el módulo lo declara. Nunca `if country === "Spain"` en el core: el core solo ejecuta el ruleset que el registry le entrega para esa jurisdicción.
- `US-CA` demuestra que el `code` de jurisdicción debe admitir subdivisiones (`country` + `region`) — se añade `region` opcional a la entidad Jurisdiction en la corrección.
- Fuentes y organismos ya cuelgan de jurisdicción (`sources.jurisdiction`, `regulators`). Procedimientos (hoja de reclamación vs. ombudsman UK vs. small claims) viven en `jurisdiction.procedures`.
- **Fuga detectada y corregida:** el contrato de módulo original declaraba `jurisdictions: ["ES"]` plano; ahora las reglas viven en `problems/<slug>/jurisdictions/<code>/rules.ts` y el intake se declara común + overrides por jurisdicción (ver §31 de este informe).

## 3. Test de versionado (2026 → 2030)

Reconstrucción de un caso antiguo: `analysis_snapshots` (inmutable, con `engine_version`, `ruleset_hash`, `result jsonb`) + `rule_evals` (append-only, con `inputs` que registran **qué facts con qué versión**) + `facts.superseded_by`. **Hueco detectado:** el snapshot no registraba las **versiones de fuentes** vigentes al evaluar. Corregido: el snapshot ahora incluye `source_versions[]` y los `ai_request_ids` que intervinieron (§5 y §18 de ARCHITECTURE.md). Resultado: en 2030 se puede reconstruir exactamente qué dijo el usuario, qué documentos, qué hechos, qué reglas (versión), qué fuentes (versión), qué motor, qué IA (modelo + request) y qué resultado se mostró. Un cambio legislativo futuro no muta análisis históricos porque nada es mutable salvo `facts` (con cadena de supersesión) y `cases` (con estados).

## 4. Test de contradicciones (y reconciliación usuario↔documento, §41 del prompt)

Protocolo definido (corregido en §10 de ARCHITECTURE.md):

1. Tres evidencias (usuario: día 10; PDF: día 14; email: día 11) → `cancellation.request_date` obtiene **tres candidatas**, no un valor.
2. El Evidence Engine detecta conflicto → fact en estado `contradicted` con las tres candidatas referenciadas.
3. Las reglas que requieren ese fact devuelven `unknown(missing: conflicted facts)`.
4. El Result Engine lo presenta como bloque de conflicto explícito y el workflow genera un paso `clarification` (pregunta de resolución) **solo para ese fact**.
5. El usuario elige (p. ej. "el email es el correcto porque la empresa confirmó recepción") → se registra una **resolución explícita**: nueva evidencia con `origin: user, provenance: user_resolved`, nota del motivo, y el fact pasa a `confirmed` apuntando por `superseded_by` al histórico. Nunca sobrescritura silenciosa: la resolución es en sí un evento de timeline.

Esto se añadió al modelo (campo `resolution` en facts) porque el diseño original solo marcaba el conflicto pero no modelaba su resolución explícita.

## 5. Test de Document Intelligence (8 casos)

| Caso                                               | Comportamiento arquitectónico                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. PDF con texto                                   | extracción client-side pdf.js → segmentación → extractores deterministas. 0 coste, 0 subida.                                                                                                                                                                                                                                                                        |
| 2. PDF escaneado                                   | sin text layer → OCR tesseract WASM en cliente → trust 0.7 → servidor solo si el dispositivo no puede.                                                                                                                                                                                                                                                              |
| 3. Foto de factura                                 | OCR + detección de baja calidad (blur/confianza baja) → pedir mejor foto o pregunta manual. EXIF stripped en cliente.                                                                                                                                                                                                                                               |
| 4. PDF con tablas                                  | extractores por anchors de tabla; si falla → tarea IA sobre **solo el segmento de tabla** (no el documento).                                                                                                                                                                                                                                                        |
| 5. Parcialmente ilegible                           | extractor devuelve `confidence < umbral` por campo → campo en `provisional`, workflow pregunta el dato concreto (nunca adivina).                                                                                                                                                                                                                                    |
| 6. Contradicciones internas                        | dos importes distintos en el mismo PDF → dos evidencias → contradicción first-class (protocolo §4).                                                                                                                                                                                                                                                                 |
| 7. PDF malicioso ("ignore previous instructions…") | es DATA: delimitadores + sanitización Unicode + instrucciones-privilegio en system prompt + output schema sin campos de acción + aislamiento (la IA no tiene herramientas). Además `untrusted` flag si heurística de instructions-density dispara. El peor outcome posible es una interpretación `ai_interpreted` con trust 0.5 que ninguna regla trata como hecho. |
| 8. Documento gigantesco                            | límite 10 MB + límite de páginas + ratio de descompresión + timeout de parsing + worker aislado; rechazo claro con mensaje accionable.                                                                                                                                                                                                                              |

PII/eliminación/coste/timeouts/MIME: cubiertos en ARCHITECTURE.md §§11, 26–28. **Veredicto: PASS**, con el riesgo honesto ya documentado del OCR de mala calidad.

## 6. Test de IA (nunca autoridad final)

Cadena verificada: `User → AI → extraction/interpretation → schema validation → semantic validation → evidence validation → deterministic rules → result`. La IA solo produce `ai_interpreted`/`document_extracted(ia)` con trust ≤0.7/0.5, nunca `confirmed`; sus salidas se convierten en **candidatas** de fact, y las reglas deciden.

Modos de fallo de Groq verificados:

| Fallo                            | Comportamiento                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caída / timeout                  | circuit breaker abre → router pasa al siguiente proveedor; si todos caen → `fallbackBehavior: "degrade"`: el paso funciona sin IA (pregunta manual, plantilla determinista) |
| JSON inválido                    | validator rechaza → 1 retry con feedback del error → si persiste, degrade                                                                                                   |
| Respuesta incompleta             | schema exige campos → rechazada, degrade                                                                                                                                    |
| Inventa una fuente               | imposible por construcción: los schemas de salida no tienen campo de fuente; fuentes solo entran por Source Registry humano. Si menciona una, se ignora                     |
| Baja confianza                   | output en `provisional` con trust reducido; nunca bloquea                                                                                                                   |
| Rate limit / presupuesto agotado | router marca proveedor no disponible por ventana; presupuesto por tarea impide pasarse; degrade                                                                             |
| Todos caídos                     | el producto sigue: intake, reglas, resultados y plantillas son 100% deterministas                                                                                           |

**PASS.**

## 7. Test multi-provider

`AIProvider` + router verificado: selección por (adecuación de tarea, coste, latencia, disponibilidad), retry solo en errores transitorios, breaker por proveedor, fallback ordenado Groq→Gemini→OpenAI con claves independientes, uso registrado en `ai_usage`. Rotación de cuentas para evadir límites: explícitamente prohibida en el diseño. Core no importa ningún SDK de proveedor (los providers viven en `ai/providers/`). **PASS.**

## 8. Test de token optimization

20 páginas de factura → client-side extraction → segmentación por relevancia → solo el segmento relevante llega a IA si hace falta (≤2–4k tokens). Deduplicación por `sha256` del extracto; cache de clasificación; modelos baratos por tarea (router soporta modelo por tarea, no solo por proveedor). **PASS.** Nota honesta: la segmentación "por plantillas de documentos conocidos" es la parte más frágil con documentos atípicos; el fallback es IA de localización, presupuestada.

## 9. Test del evidence graph + explainability

`RESULT → RULE(version) → FACT(version) → EVIDENCE → DOCUMENT(extracto/página)` y `RESULT → RULE → SOURCE(sección)` son navegables con referencias en DB, sin neo4j. La explicación humana se genera **por plantilla desde los findings**, no por IA:

```
Resultado: POTENTIALLY_APPLICABLE — penalización tras baja
¿Por qué?
1. Has indicado que cancelaste el 10/09 (aportado por ti).
2. La factura final contiene un cargo de 150 € el 15/09 (extraído del documento).
3. Hemos aplicado la regla cc-01 v2 (cargo posterior a la cancelación) → PASS.
4. Fuente: [ley aplicable, sección] — verificada el [fecha].
5. Falta confirmar: si la baja fue aceptada en esa fecha (contradicted: email dice 11/09).
```

Cada línea con badge de procedencia. **PASS** tras añadir la enumeración de estados de claim (§13 de este informe).

## 10. Test del Source Registry

Campos auditados: autoridad (jerarquía), jurisdicción, sector, tipo, publicación, entrada en vigor, revisión, expiración, estado, URL, sección, sustitución (campo `superseded_by` añadido en corrección) y relaciones (`related_sources`). Ciclo de estados `unverified → verified → outdated → superseded` verificado. **Una fuente propuesta por IA jamás entra automáticamente**: solo via issue de revisión humana. **PASS.**

## 11. Test de legal correctness (crítico)

**Fuga detectada:** el diseño original tenía PASS/FAIL/UNKNOWN/NA por regla, pero el **resultado final agregado** no tenía vocabulario controlado — se podría derivar un "te corresponde X" por composición de findings. Corregido: el Result Engine emite un `claim_status` por conclusión:

```
UNKNOWN | INSUFFICIENT_DATA | CONTRADICTED | POTENTIALLY_APPLICABLE | SUPPORTED | NOT_APPLICABLE
```

- `SUPPORTED` exige: regla PASS + hechos `confirmed` + fuente `verified` vigente + jurisdicción correcta.
- `POTENTIALLY_APPLICABLE` es el estado por defecto honesto cuando hay interpretación IA o hechos provisionales.
- Nunca se emiten importes exactos como "derecho": los importes que calculan reglas se presentan como "importe que la regla X calcula si los hechos confirmados son correctos".
- "Esto es ilegal" está prohibido como formato de salida: solo se afirma la regla aplicable con fuente.

## 12. Test de privacidad (inventario de minimización)

| Dato                                      | ¿Se almacena?                                                                                                                                           | Decisión                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Documento original (PDF/foto)             | 30 días por defecto, luego purga; o **nunca** si el procesamiento fue 100% client-side y el usuario no pide conservarlo                                 | procesar → extraer → eliminar |
| Email/teléfono/dirección/IBAN del usuario | solo campos que el caso necesita; IBAN **no** se pide en ningún workflow de los 3 primeros                                                              | no almacenar                  |
| Números de contrato de terceros           | dentro de facts si son necesarios para el caso                                                                                                          | sí, con retención de caso     |
| Emails completos (.eml)                   | se extraen campos relevantes; el original purga                                                                                                         | extracción → eliminación      |
| Backups                                   | PITR de Neon (contiene PII histórica limitada; documentado en RUNBOOK pendiente)                                                                        | documentar                    |
| Proveedores IA                            | solo segmentos relevantes sin identificadores (sanitización pre-envío: strip de emails/teléfonos/IBAN del segmento cuando no son el objeto de la tarea) | **corrección añadida**        |
| Logs                                      | sin contenido de documentos ni emails                                                                                                                   | ya cubierto                   |
| Analytics                                 | sin PII, cookieless                                                                                                                                     | ya cubierto                   |

Respuesta a "¿qué procesamos y eliminamos inmediatamente?": todos los binarios cuando la extracción termina; los campos no usados por reglas no se modelan siquiera.

## 13. Test de casos anónimos

Flujo: caso sin cuenta → `anon_owner_hash` (cookie httpOnly de sesión anónima) → al cerrar el navegador, recuperación **solo** por magic link al email o por case-link guardado. Auditoría:

- **Nunca confiar en un caseId del cliente como ownership** (lo exige el prompt): todo endpoint valida session **o** token de case-link (hash en DB, expiración, revocación).
- Enumeración: IDs UUIDv7 no secuenciales + tokens de alta entropía + respuestas idénticas ante token válido/inválido (timing-safe comparison).
- Brute force en magic links: rate limit por email+IP, tokens de un solo uso con expiración corta.
- Transferencia anon→cuenta al crear cuenta: merge de `user_id` en el caso (posible porque ownership está en la fila del caso, no en la sesión).

**PASS** (diseño ya estaba; se ha verificado contra cada requisito del test).

## 14. Test de timeline y taxonomía de eventos

**Fuga detectada:** `case_events` mezclaba todo. Corregido — taxonomía explícita:

- **Domain events** (timeline del usuario): `case_created, question_answered, document_added, fact_resolved, result_generated, action_started, document_generated, response_received, followup_deadline_passed, case_updated`. Solo estos se muestran en la timeline.
- **Audit events** (no timeline): `rule_evaluated, analysis_created, fact_superseded, ai_request_performed` — viven en sus tablas append-only específicas (`rule_evals`, `analysis_snapshots`, `ai_usage`), **no** en case_events.
- **Internal logs**: solo en el sistema de logs, con redaction de PII, jamás en DB de caso.

## 15. Test de re-evaluación

Simulación: resultado → usuario sube contrato → nuevos facts → re-evaluación.

**Corrección de sobreingeniería detectada:** el diseño original especificaba "evaluación incremental por grafo de dependencias". Para un caso real (<100 reglas), la re-evaluación completa es <10 ms y elimina toda una clase de bugs de invalidación. **Decisión: re-evaluación completa y determinista en MVP; el grafo de dependencias queda como optimización documentada (DEFER)** para cuando haya reglas con evaluación cara (IA). Qué se conserva: snapshots anteriores (append-only); el nuevo snapshot referencia al anterior (`previous_snapshot_id` añadido) y el diff de checks se muestra al usuario ("este cambio ha modificado 2 comprobaciones"). Acciones anteriores emitidas no se retractan: se marcan como basadas en snapshot anterior si el resultado relevante cambió.

## 16–17. Action Engine y Document Generation

Acciones: estructura verificada contra el test (title, objective, required_evidence, steps, deadline, recipient, generated_document, status, dependencies). **Regla endurecida en corrección:** destinatarios y plazos provienen **solo** de `jurisdiction.procedures` y `sources` — el módulo no puede hardcodear un plazo sin fuente que lo respalde (el validator del módulo lo rechaza en CI).

Generación de documentos: composición determinista (plantilla sobre facts) **con render estricto**: si un placeholder no se resuelve desde facts confirmados, la plantilla falla en build/test — jamás se genera con huecos ni con texto de IA rellenando datos. La IA solo redacta párrafos libres marcados y su output pasa por la lista de placeholders permitidos. Paquete de evidencia y resumen: derivan del mismo modelo (ver portabilidad, §18).

## 18. Test de portabilidad del caso

**Hueco detectado y corregido:** añadir a la arquitectura el requisito de **export estructurado**: `GET /api/cases/:id/export` produce un JSON versionado (`case-export/v1`) con facts+procedencia+evidencias+checks+fuentes+timeline+documentos generados, y un resumen PDF. Diseñado como vista de solo lectura sobre el modelo; ninguna información vive en estructuras no exportables. Permite migración futura y "paquete de evidencia" para el usuario.

## 19. Test de SEO y page quality

Cada módulo controla URL, title, meta, canonical, schema, breadcrumbs, FAQ, contenido, metodología, fuentes, herramienta y enlazado — ya cubierto. Anti-thin-content endurecido:

- **Prohibido el SEO programático por combinación** (compañía × ciudad × producto × variante): las páginas se generan solo desde módulos reales, con contenido sustantivo ≥300 palabras, FAQ ≥3 y ≥1 fuente verificada verificado en CI. No hay plantillas que solo sustituyen keywords.
- Page quality: la página debe explicar qué resuelve, cuándo usarlo, qué información necesita, cómo funciona (metodología), qué fuentes usa, limitaciones, resultados posibles y qué hacer después — checklist de sección exigible por CI, no aspiracional.

## 20. Accesibilidad y rendimiento

A11y: verificada como requisito del design system (Radix/react-aria: focus management en wizard, `aria-live` para progreso/errores, labels, contraste, dialogs, uploads con alternativa de teclado, estados de carga anunciados). No es "añadida al final": los componentes base la traen de serie.

Performance: RSC/SSG para público, client components solo en wizard/upload/docintel; bundles mínimos en páginas SEO; lazy loading de pdf.js/tesseract solo cuando el usuario llega al paso de documento; DB queries indexadas; R2 con signed URLs (0 ancho de banda por origin); IA asíncrona con estados de espera; paralelismo en extractores independientes. **PASS.**

## 21. Test de seguridad (puntos clave verificados)

Autorización en cada endpoint por session/case-link (nunca caseId como prueba), CSRF SameSite+token, CSP, magic links timing-safe de un solo uso, uploads con magic bytes+re-encode+worker aislado, signed URLs de corta vida, R2 privado sin acceso público, Drizzle parametrizado, rate limiting distribuido, secrets solo en env de servidor + scan en CI, errores sin filtrar internals, **IDOR explícitamente testeado por endpoint**. **PASS.**

## 22. Test de failure modes

| Fallo                     | Comportamiento                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| DB caída                  | error 503 con estado conservado en cliente; wizard permite reintentar sin perder respuestas locales |
| R2 caída                  | upload rechazado con mensaje claro; flujo continúa vía preguntas manuales                           |
| IA caída / rate limit     | degrade total (ver §6)                                                                              |
| OCR falla                 | pedir mejor foto o dato manual                                                                      |
| Extracción PDF falla      | estado `rejected` con motivo; flujo manual                                                          |
| Fuente desactualizada     | reglas dependientes marcadas `needs_review`; resultado con limitación visible                       |
| Regla lanza excepción     | capturada → resultado `unknown` para esa regla + alerta (nunca rompe el caso)                       |
| Input inválido            | Zod rechaza con mensaje accionable                                                                  |
| Navegador cerrado         | estado en servidor; recuperación por link                                                           |
| Archivo enorme            | límites pre-upload (client) + server                                                                |
| Caso duplicado            | **corrección**: idempotency-key en creación de casos (client genera UUID; server deduplica)         |
| Doble submit de respuesta | idempotency en mutaciones con estado                                                                |

## 23. Test de coste

Coste variable real: tokens IA (minimizado por diseño), OCR server (casi 0 por client-first), email transaccional, DB/storage (despreciable en MVP). Casi todo el MVP cabe en free tiers + dominio. La regla operativa: **si una función determinista puede hacerlo, no hay IA** — está codificada en el orquestador (keywords antes de clasificador, extractores antes de interpretación). **PASS.**

## 24. Test de escalabilidad (camino de evolución, no hipoteca)

- 10–1.000 casos/día: síncrono, sin colas, free tiers.
- 10.000: Neon scale + Vercel Pro; docintel sigue client-side (el coste no escala con nosotros).
- 100.000: **aquí sí** cola (Inngest/QStash) para pipeline de documentos server-side y análisis pesados; particionado de append-only por fecha.
- 1M+: read replicas, más proveedores IA, cache de clasificación.
  El punto de inserción de la cola es el límite `docintel`/`ai` (servicios con interfaz propia); el core no cambia. **PASS.**

## 25. Test de observability

Separación corregida y explícita: **metrics** (latencia, tasas, coste) / **logs** (redacted) / **traces** (request IDs encadenados cliente→API→IA) / **audit events** (append-only DB) / **ai_usage** (tokens, modelo, coste) / **security events** (rate limits, auth failures). Se puede responder qué pasó, por qué, cuánto tardó, cuánto costó, qué proveedor, qué regla, qué versión — sin PII.

## 26. Test de testing

Estrategia verificada y ampliada con lo que pedía el test: **regression suite de casos jurídicos previamente validados** (fixtures de casos reales revisados que deben producir claim_status esperado — es la red de seguridad ante cambios de reglas) y **SEO tests** (metadata, canonical, sitemap, JSON-LD, umbral de contenido). Rule tests documentan casos límite como especificación. **PASS.**

## 27. Test: añadir un cuarto problema (`electricity-bill-dispute`)

Archivos a crear: `src/problems/electricity-bill-dispute/` (definition.ts, jurisdictions/es/rules.ts, intake.ts, content/{es}.md, faq, seo) + `src/sources/` (fuentes verificadas) + tests (`tests/rules/electricity-bill-dispute/`, regression fixtures) + entrada en `_registry.ts`. **A modificar: nada en `core/`, `server/`, `ai/`, `app/`** (las rutas y páginas son dinámicas por slug). Si algún día hay que tocar el core para un problema nuevo, es una señal de abstracción incorrecta y se documenta como ADR.

## 28. Test: segunda jurisdicción (ES → UK) sobre módulo existente

- **Reutilizado:** intake base, clasificación, docintel, plantillas de flujo, formato de resultados, core entero.
- **Nuevo:** `jurisdictions/uk/rules.ts`, fuentes UK verificadas, `jurisdiction` UK (reguladores, procedimientos, moneda GBP, formatos), contenido SEO UK-EN revisado por humano, overrides de intake solo para preguntas jurisdiccionales (p. ej. procedimiento de escalamiento).
- **No se duplica el módulo:** el definition es común; solo rules/content/fuentes son por jurisdicción. La página SEO se genera por (locale × jurisdicción) solo con contenido completo.

## 29. Clasificación de capas

| Capa           | Contenido                                                                                                                           | Ejemplos de fuga prohibida                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| CORE           | máquinas, motores, tipos genéricos (case, workflow, evidence, rules evaluator, result, actions, followup, jurisdiction, i18n types) | conocer un slug de problema; formatos de país concretos |
| DOMAIN         | docintel, source registry, AI orchestration, governance                                                                             | conocer UI; conocer proveedor concreto desde el core    |
| PROBLEM MODULE | definiciones, intake, reglas, contenido, plantillas                                                                                 | tocar infraestructura directamente                      |
| JURISDICTION   | datos por país dentro de módulos + `core/jurisdiction`                                                                              | reglas ES dentro de código genérico                     |
| SOURCE         | datos de fuentes + validador de vigencia                                                                                            | contenido legal embebido en reglas sin referencia       |
| PRESENTATION   | app/, components/, i18n runtime                                                                                                     | acceso directo a DB o proveedores IA                    |

Dirección de dependencias: `app → server → domain → core ← problems/jurisdictions/sources`. `core` no importa React ni Next ni SDKs. ESLint `eslint-plugin-boundaries` puede imponer esto por patrones de ruta (verificado que soporta este caso); el CI lo bloquea.

## 30. Test de overengineering — veredictos KEEP/SIMPLIFY/REMOVE/DEFER

| Elemento                                  | Veredicto                         | Motivo                                                                                                                            |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Reglas como TS puro (no DSL)              | KEEP                              | fiable, testeable, versionable por git                                                                                            |
| Evaluación incremental por grafo          | **DEFER**                         | re-evaluación completa basta a cualquier escala razonable                                                                         |
| Evidence graph con referencias (no neo4j) | KEEP                              | trazabilidad sin nueva infra                                                                                                      |
| Trust numérico (0–1)                      | SIMPLIFY                          | 5 buckets nominales (user/document-parser/document-ocr/ai/derived) en vez de aritmética fina de confianza; menos pseudo-precisión |
| append-only (events, evals, snapshots)    | KEEP                              | es la base del versionado y la auditoría                                                                                          |
| Redis (Upstash) día 1                     | SIMPLIFY                          | solo para rate limiting; alternativa in-memory+middleware si MVP en una región; no meter cache general                            |
| Problem Registry en DB (problem_defs)     | SIMPLIFY                          | solo feature flags; catálogo vive en código                                                                                       |
| Circuit breaker + fallback multi-provider | KEEP                              | barato y crítico                                                                                                                  |
| case_links + magic links                  | KEEP                              | es el modelo de identidad del MVP                                                                                                 |
| Purge job + retention                     | KEEP                              | requisito RGPD, no lujo                                                                                                           |
| event sourcing completo                   | REMOVE                            | append-only por tabla específica basta; no reconstrucción de estado desde eventos                                                 |
| Export v1                                 | KEEP (diseño, implementar Fase 7) | barato de diseñar ahora, imposible de retrofit limpio                                                                             |
| Jurisdiction.procedures                   | KEEP                              | carga el escalado sin hardcode                                                                                                    |
| Turnstile/honeypot                        | DEFER                             | activar solo con evidencia de abuso                                                                                               |
| i18n runtime multi-idioma                 | DEFER                             | arquitectura lista, un solo idioma contenido                                                                                      |
| Colas                                     | DEFER                             | explicitado arriba                                                                                                                |
| Snapshot con diff anterior                | KEEP                              | barato, resuelve re-evaluación explicable                                                                                         |

## 31. Test de underengineering — huecos encontrados

1. **Resolución explícita de contradicciones no estaba modelada** → corregida (§4).
2. **claim_status del resultado no existía** → añadido (§11).
3. **Idempotencia de creación/mutaciones** ausente → añadida.
4. **Concurrencia del caso** (dos pestañas) ausente → columna `version` en `cases` con optimistic locking.
5. **Versiones de fuente en snapshots** ausentes → añadidas.
6. **Sanitización pre-envío a IA** (strip de identificadores del segmento) no explícita → añadida.
7. **Governance lifecycle de reglas/fuentes/módulos** ausente → añadido (§32).
8. **Export/portabilidad** ausente → añadida (§18).
9. `documents.kind` enum cerrado → abierto con subtype.
10. destinatarios/plazos de acciones sin exigencia de fuente → endurecido.

## 32. Test de human oversight (governance lifecycle)

Ciclo de estados para **reglas, fuentes y problem modules**:

```
draft → reviewed → verified → published → deprecated
```

- En reposo: cada cambio de regla/fuente abre PR; `published` exige checklist de revisión (fuente verificada con URL oficial + fecha, tests actualizados, claim_status del caso límite). Etiquetas de issue `source-review`, `rule-review`.
- En runtime: solo `published` afecta a usuarios; `deprecated` sigue evaluable para snapshots históricos pero no para casos nuevos.
- Cambios legislativos: el cron de vigencias abre issues automáticos; la transición de fuente → PR de reglas afectadas (el mapping `rule_sources` lo calcula el CI).
- No hace falta CMS: git + PRs + checklist **es** el sistema de revisión profesional, con trazabilidad nativa.

## 33. Test de cambios de fuente

Fuente A vigente → B la sustituye: se marca `A.superseded_by = B`, CI calcula reglas afectadas vía `rule_sources`, abre issue; nueva versión de regla publicada apuntando a B; snapshots antiguos intactos (registraron versión de fuente); tests de las reglas afectadas actualizados en el mismo PR; análisis nuevos citan B. **PASS.**

## 34. Test de Result Engine (extensibilidad)

Modelo final (con las correcciones):

```
Result
├── status: claim_status[]        (UNKNOWN…SUPPORTED por conclusión)
├── summary                        (por plantilla desde findings)
├── facts[]                        (con procedencia + conflicto/resolución)
├── checks[]                       (rule_evals + explicación)
├── evidence[]                     (referencias navegables)
├── rules_applied[]                (id+version)
├── sources[]                      (versión + sección)
├── missing_information[]
├── contradictions[]               (con resolución si existe)
├── uncertainties[]
├── next_steps / actions[]
├── generated_documents[]
├── limitations[]
└── provenance: { engine_version, ruleset_hash, source_versions[], ai_request_ids[] }
```

Extensible: los bloques son arrays de tipos versionados; añadir un bloque no rompe snapshots anteriores (JSONB versionado con `schema_version`).

## 35. Product realism + UX del caso

Verificado: la IA es interna; lo visible son pasos, tarjetas, checks, timeline, acciones. Progressive disclosure: solo se pregunta lo que falta y los documentos prevalecen sobre preguntas. El wizard nunca llega a 40 preguntas: los 3 módulos de arranque estiman 5–9 pasos típicos. **PASS.**

## 36. Test de features futuras (no bloqueadas)

Cuentas (merge anon→cuenta ya diseñado), dashboard multi-caso (query por user_id ya modelada), colaboración (extensión natural de case_links con roles — espacio en modelo), notificaciones email (Resend + cron ya en stack), APIs/B2B (export JSON versionado = semilla de API pública), móvil (la web es PWA-capable al ser RSC+cliente ligero), i18n (arquitectura lista). Ninguna decisión actual bloquea ninguna de estas rutas.

---

## 44. Decisión final por componente

| Componente              | Estado                                                         | Acción                |
| ----------------------- | -------------------------------------------------------------- | --------------------- |
| Case Engine             | correcto, faltaba concurrencia+idempotencia                    | MODIFY (hecho en doc) |
| Problem Engine          | extensible; `extends` y jurisdictions/ añadidos                | MODIFY (hecho)        |
| Workflow Engine         | correcto                                                       | KEEP                  |
| Evidence Engine         | conflicto no resoluble → protocolo añadido; trust simplificado | MODIFY (hecho)        |
| Document Intelligence   | correcto; sanitización pre-IA explícita                        | MODIFY (hecho)        |
| Rule Engine             | correcto; incremental→DEFER; governance lifecycle              | MODIFY (hecho)        |
| Source Registry         | correcto; `superseded_by` añadido                              | MODIFY (hecho)        |
| Jurisdiction Engine     | jerarquía region añadida; selección de ruleset clarificada     | MODIFY (hecho)        |
| AI Provider abstraction | correcto                                                       | KEEP                  |
| AI Router               | correcto                                                       | KEEP                  |
| Result Engine           | claim_status + provenance añadidos                             | MODIFY (hecho)        |
| Action Engine           | exigencia de fuente en plazos/destinatarios                    | MODIFY (hecho)        |
| Follow-up               | correcto                                                       | KEEP                  |
| Timeline                | taxonomía de eventos clarificada                               | MODIFY (hecho)        |
| Document Generation     | render estricto de placeholders                                | MODIFY (hecho)        |
| SEO architecture        | anti-thin-content endurecido; sin SEO programático             | MODIFY (hecho)        |
| Auth/magic links        | correcto                                                       | KEEP                  |
| Storage                 | correcto                                                       | KEEP                  |
| Database                | concurrencia, idempotencia, snapshot provenance                | MODIFY (hecho)        |
| Testing                 | +regression jurídica, +SEO tests                               | MODIFY (hecho)        |
| Security                | correcto                                                       | KEEP                  |
| Observability           | separación metrics/logs/traces/audit                           | MODIFY (hecho)        |

## 45. Scorecard (diagnóstico interno, no marketing)

| Dimensión         | Nota | Por qué no es 10                                                                              |
| ----------------- | ---- | --------------------------------------------------------------------------------------------- |
| Extensibilidad    | 9.5  | riesgo residual: patrones imprevistos de evidencia (p. ej. foto de contador)                  |
| Mantenibilidad    | 9    | reglas legales requieren disciplina de revisión humana constante                              |
| Seguridad         | 9    | client-side processing implica confiar parcialmente en código cliente para privacidad         |
| Privacidad        | 8.5  | backups/PITR contienen PII histórica; proveedor IA recibe segmentos (sanitizados, pero salen) |
| Trazabilidad      | 9.5  | —                                                                                             |
| Legal correctness | 8.5  | depende de carga de fuentes verificada por humanos; es el riesgo del producto                 |
| AI safety         | 9.5  | IA sin privilegios, output limitado a candidatas                                              |
| SEO               | 9    | crecimiento depende de contenido humano, no automatizable                                     |
| Performance       | 9    | OCR in-browser en dispositivos antiguos                                                       |
| Scalability       | 9    | camino de colas definido pero no probado                                                      |
| Testing           | 9.5  | —                                                                                             |
| DevX              | 9    | monorepo único, CI completo                                                                   |
| Cost efficiency   | 9.5  | client-first casi elimina coste variable                                                      |
| UX architecture   | 9    | wizard de N pasos sigue siendo wizard; medir abandono real                                    |

## 46. Lista de correcciones

**CRITICAL (resueltas en el documento, condición de arranque de código):**

1. claim_status controlado en Result Engine (anti-falsas-certeza).
2. Protocolo de resolución explícita de contradicciones.
3. Provenance completo en snapshots (versiones de regla **y fuente**, requests de IA).
4. Governance lifecycle draft→published para reglas/fuentes/módulos.
5. Autorización nunca por caseId del cliente + idempotencia + concurrencia optimista.

**IMPORTANT (antes del scaffold, ya en doc):** documents.kind+subtype; extends de módulos; sanitización pre-envío a IA; taxonomía de eventos; export v1 diseñado; exigencia de fuente en acciones.

**LATER:** cola para docintel server; i18n runtime; Turnstile; grafo de dependencias incremental; cache de AI determinista.

**OPTIONAL:** collaboration en casos; paquete de evidencia PDF; API pública B2B; PWA.

## 47. Correcciones aplicadas a ARCHITECTURE.md

Todas las anteriores están incorporadas a `docs/ARCHITECTURE.md` con una sección "Architecture Decision Changes" que registra decisión original → problema → decisión nueva → motivo. Ninguna decisión se borró silenciosamente.

## 48. FINAL APPROVAL GATE

**ARCHITECTURE STATUS: APPROVED FOR IMPLEMENTATION**

Demostraciones exigidas, cumplidas en diseño:

- ✅ Problem Modules extensibles (8 módulos simulados, 0 cambios de core; G excluido del roadmap con justificación).
- ✅ Jurisdicciones extensibles (ES/UK/US-CA simuladas, selección de ruleset sin condicionales en core).
- ✅ IA subordinada a evidencia/reglas (solo produce candidatas con trust limitado; sin privilegios; sin campo de fuente).
- ✅ Documentos = datos no confiables (protocolo DATA-only + corpus adversarial en CI).
- ✅ Resultados reproducibles (snapshots inmutables con provenance completo).
- ✅ Contradicciones first-class (estado, visualización, resolución explícita registrada).
- ✅ Fuentes verificables/versionables (lifecycle + superseded_by + revisión humana).
- ✅ Core sin lógica de problemas (regla de dependencias impuesta por ESLint + CI).
- ✅ Seguridad y privacidad cubiertas (§§21, 12 del informe).
- ✅ Sin sobreingeniería grave (8 elementos DEFER/REMOVE/SIMPLIFY identificados).
- ✅ Sin carencias críticas (las 5 CRITICAL resueltas en el documento).

**Condición no negociable al iniciar Fase 4 (primer módulo):** ninguna regla entra en `published` sin fuente real verificada por humano con URL oficial y fecha de revisión. Mientras no existan, las reglas viven en `draft` y el producto no se expone al público.

## 49. Roadmap final de implementación (sin ejecutar)

| Fase | Objetivo                       | Dependencias | Entregables                                                                                              | Tests                                                              | Criterio de aceptación                                                                                             |
| ---- | ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0    | Repo/CI/scaffold               | —            | monorepo, ESLint boundaries, CI verde, README, .env.example, ADRs                                        | CI corre lint+typecheck+build                                      | clonar→`pnpm i`→`pnpm test` funciona en <10 min                                                                    |
| 1    | Core foundations               | F0           | tipos core, shared (money/dates), esqueleto de motores sin I/O                                           | unit de shared y tipos                                             | CI verde; core sin imports de app/server                                                                           |
| 2    | Case + evidence                | F1           | Case state machine, DB schema, evidence/facts con conflictos y resolución, events taxonomy, repositories | integration con DB de test                                         | crear caso, responder, generar contradicción y resolverla, todo persistido y consultable                           |
| 3    | Rules + sources + jurisdiction | F2           | Rule evaluator (full re-eval), Source Registry con lifecycle, Jurisdiction selector, governance states   | rule tests tabla-driven + regression fixtures vacía pero operativa | regla dummy ES con unknown/pass/fail/NA + trazabilidad a fuente, snapshot con provenance                           |
| 4    | First Problem Module           | F3           | cancellation-charge (intake, reglas draft, acciones, plantilla, workflow adaptativo)                     | rule + workflow + module validator                                 | flujo completo con reglas draft; fuentes reales verificadas = gate de published                                    |
| 5    | Document Intelligence          | F4           | pipeline client-first (pdf.js, OCR WASM), extractores deterministas, upload R2, purge job                | document tests con corpus (incl. adversarial)                      | factura de ejemplo → facts con procedencia; corpus adversarial no produce instrucciones ejecutadas                 |
| 6    | AI abstraction                 | F5           | AIProvider + router + tareas con schema + budgets + ai_usage + sanitización pre-envío                    | contract tests con fixtures; live smoke manual                     | clasificación e interpretación funcionando; métricas de coste por workflow visibles; IA caída → degrade verificado |
| 7    | Result + actions               | F6           | Result Engine (claim_status), Action Engine, Follow-up, Timeline, Document Generation, export v1         | integration + E2E del flujo completo                               | caso completo: intake→documento→reglas→resultado→acción→seguimiento; export JSON válido                            |
| 8    | Modules 2–3                    | F7           | pedido-no-recibido, garantia-rechazada (+extends suscripcion-cobra-tras-cancelar si procede)             | igual que F4 + regression                                          | 3 flujos con el mismo core, sin duplicación                                                                        |
| 9    | SEO/public                     | F8           | homepage, landings de problema con QA de contenido, JSON-LD, sitemap, metodología                        | SEO tests                                                          | páginas indexables con umbral de contenido en CI                                                                   |
| 10   | Hardening                      | F9           | rate limiting final, CSP, security tests E2E, observability (traces, dashboards), performance pass       | security suite completa                                            | audit interno de autorización por endpoint; p95 y coste/caso medidos                                               |
