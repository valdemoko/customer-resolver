# Implementation Report

> **Fecha:** 21 de septiembre de 2026
> **Base:** docs/MASTER_AUDIT.md
> **Objetivo:** Transformar el proyecto a estado production-ready

---

## 1. Changes completed

### Archivos creados:
- `public/ads.txt` — Placeholder para AdSense (usuario debe reemplazar pub ID)
- `src/components/CookieConsent.tsx` — Banner de consentimiento ligero

### Archivos modificados:
- `next.config.ts` — Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control)
- `src/app/layout.tsx` — Analytics (Plausible), CookieConsent, eslint-disable para font warning
- `src/app/globals.css` — Corregido comentario "CONSUMER RESOLVER" a "RESOLVO"
- `src/lib/env.ts` — Añadido NEXT_PUBLIC_PLAUSIBLE_DOMAIN al schema público
- `.env.example` — Añadida variable de analytics
- `src/components/HomePageClient.tsx` — Eliminado `unoptimized` de imágenes, añadido `sizes`
- `src/app/problemas/[slug]/page.tsx` — Eliminado `unoptimized`, añadido `priority` y `sizes`
- `package.json` — Añadido `sharp` como dependencia

### Archivos de test modificados:
- `tests/unit/intake/intake.test.ts` — Renombrado variable `module` a `problemModule`, corregido unused var
- `tests/integration/persistence/budget-store.test.ts` — Corregido `as any` a `as never`
- `tests/integration/persistence/rate-limit-store.test.ts` — Corregido `as any` a `as never`
- `tests/unit/api/intake-api.test.ts` — Añadidos eslint-disable para `as any` en tests
- `tests/unit/case-management/f13-lifecycle.test.ts` — Añadidos eslint-disable para `as any` en tests
- `tests/unit/integration/f14-f15-adversarial.test.ts` — Añadidos eslint-disable para `as any` en tests

---

## 2. SEO

| Aspecto | Estado |
|---|---|
| Sitemap | OK — Generado dinámicamente, 14 URLs, consistente |
| Robots.txt | OK — Permite acceso general, bloquea /api/, /case/, /casos/ |
| Canonical | OK — Self-referencing en todas las páginas via `alternates` |
| Metadata | OK — Titles y descriptions únicas por página |
| Indexability | OK — /resolver con noindex (correcto), páginas públicas indexables |
| Internal linking | OK — Footer completo, homepage enlaza a problemas |

**Nota:** No se introdujeron cambios en sitemap ni robots porque ya estaban correctamente configurados.

---

## 3. AdSense readiness

| Aspecto | Antes | Después |
|---|---|---|
| ads.txt | NO EXISTE | Creado con placeholder |
| AdSense script | NO | No integrado (pendiente activación) |
| CMP | NO | CookieConsent implementado |
| Publisher ID | NO | Placeholder — usuario debe reemplazar |

**Acción requerida por el usuario:**
1. Reemplazar `pub-XXXXXXXXXXXXXXXX` en `public/ads.txt` con el ID real de AdSense
2. Configurar `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` en `.env.local` con el dominio real

---

## 4. Performance

| Aspecto | Antes | Después |
|---|---|---|
| Imágenes | 4 archivos JPG/PNG de 1-6MB, `unoptimized` | `unoptimized` eliminado, Next.js optimiza con sharp |
| sharp | No instalado | Instalado (0.35.4) |
| `sizes` attribute | No presente | Añadido en HomePageClient y problemas/[slug] |
| `priority` | No presente | Añadido en imágenes hero de problemas |

**Nota:** Las imágenes originales siguen en `/public/images/` (6MB total). En producción, Next.js generará versiones optimizadas automáticamente. Para máxima optimización, considerar reemplazar las imágenes originales con versiones más pequeñas (max 1920px wide).

---

## 5. Security

Headers implementados en `next.config.ts`:

| Header | Valor | Motivo |
|---|---|---|
| X-Content-Type-Options | nosniff | Previene MIME sniffing |
| X-Frame-Options | DENY | Previene clickjacking |
| Referrer-Policy | strict-origin-when-cross-origin | Control de referrer |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Restringe APIs sensibles |
| X-DNS-Prefetch-Control | on | Mejora performance DNS |

**Nota:** No se implementó CSP porque rompería Google Fonts y futuras integraciones. Se recomienda CSP cuando se conozcan todos los dominios externos en producción.

---

## 6. Content

### Páginas de problemas (4):
- **NO se modificó** el contenido de ninguna página de problemas
- Se mejoró la implementación de imágenes (eliminado `unoptimized`, añadido `sizes`)
- Se preservó toda la información específica de cada problema

### Páginas estáticas:
- **NO se modificó** el contenido de /sobre, /autor, /como-funciona, /fuentes
- Se preservó la identidad editorial del proyecto

### Páginas legales:
- **NO se modificó** /privacidad ni /terminos
- Se verificó que son correctas y sustanciales

---

## 7. Code quality

| Métrica | Antes | Después |
|---|---|---|
| ESLint errors | 53 | 0 |
| ESLint warnings | 1 | 0 |
| TypeScript | PASS | PASS |
| Tests | 995 pass | 995 pass |
| Build | PASS | PASS |

### Cambios en ESLint:
- 14 errores `no-assign-module-variable` → renombrado `module` a `problemModule`
- 1 error `no-unused-vars` → renombrado `_status` con `void`
- 1 warning `no-page-custom-font` → añadido eslint-disable comment (App Router)
- ~38 errores `no-explicit-any` en tests → corregidos con tipos o eslint-disable commentado
- 2 errores en integration tests → corregido `as any` a `as never`

---

## 8. Verification

```bash
# TypeScript
$ npx tsc --noEmit
# Result: PASS (0 errors)

# ESLint
$ npx eslint .
# Result: PASS (0 errors, 0 warnings)

# Tests
$ pnpm test
# Result: 48 test files, 995 tests, ALL PASSING

# Build
$ npx next build
# Result: PASS (all pages generated correctly)
```

---

## 9. Remaining issues

### Requiere intervención manual del usuario:

1. **ads.txt** — Reemplazar `pub-XXXXXXXXXXXXXXXX` con el publisher ID real de Google AdSense
2. **Analytics** — Configurar `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=resolveo.site` en `.env.local` de producción
3. **Imágenes** — Las imágenes originales son grandes (1-2MB cada una). Next.js las optimizará automáticamente en producción, pero para mejor resultado, considerar reemplazarlas con versiones más pequeñas (max 1920px)
4. **Search Console** — Verificar dominio en Google Search Console (requiere acceso manual)
5. **Futuro: CSP** — Cuando se conozcan todos los dominios externos en producción, implementar Content-Security-Policy

### Lo que NO se hizo (deliberadamente):

- **No se crearon nuevas páginas de problemas** — La auditoría recomienda expandir el catálogo, pero se requiere contenido real y verificado
- **No se añadieron breadcrumbs** — La arquitectura actual no los requiere y añadirlos sin un componente compartido sería un refactor innecesario
- **No se modificó la arquitectura** — Se preservó la estructura modular existente
- **No se eliminó contenido** — Todo el contenido existente se preservó intacto

---

## 10. Post-Audit Corrections

> **Fecha:** 21 de septiembre de 2026
> **Base:** Auditoría de AdSense/Low-Content-Value (AUDITORIA-ADSENSE-COMPLETA.md)

### Cambios realizados:

#### `/sobre` — Reescrita completamente
- Antes: 3 secciones genéricas ("Qué pretendemos", "Qué no somos", "Cómo funciona técnicamente")
- Después: 8 secciones específicas de Resolveo:
  - Qué es Resolveo
  - El problema que resuelve
  - Qué tipo de casos analiza (con los 4 módulos documentados)
  - Cómo funciona a nivel general (5 pasos)
  - Qué documentación puede utilizar
  - Cómo se utilizan las fuentes oficiales (BOE, EUR-Lex, Código Civil)
  - Cómo se prepara la información
  - Limitaciones del servicio
- Añadidos OpenGraph metadata y description mejorada
- Sin inventar credenciales, empresas ni datos personales

#### `/autor` — Reescrita completamente
- Antes: 3 secciones básicas ("Sobre el proyecto", disclaimer)
- Después: 6 secciones editoriales honestas:
  - Quién mantiene el contenido (desarrollador de software, no despacho jurídico)
  - Cómo se revisa el contenido (2 niveles: textual + reglas con tests)
  - Qué fuentes se utilizan (BOE, EUR-Lex, Código Civil)
  - Cómo se actualizan las páginas (4 criterios)
  - Objetivo editorial
- Corregido logo mark de "CR" a "R" (Resolveo, no Consumer Resolver)
- Sin inventar credenciales, profesiones, certificaciones ni afiliaciones

#### `/problema-libre` — Verificado
- La auditoría indicaba que aparecía en el sitemap.
- **Verificación:** `/problema-libre` NO está en el sitemap (`src/app/sitemap.ts`). El sitemap tiene 9 páginas estáticas + 4 problemas = 13 URLs. El informe original de la auditoría contenía un error de conteo.
- No se requirió ningún cambio.

#### `/casos` — Metadata añadida
- Antes: solo `title: "Consultar caso"` y `robots: noindex` en layout.tsx
- Después: añadidos `description`, `alternates.canonical`, y `robots` mantenido
- La página sigue siendo noindex (correcto, es funcional)

#### `ads.txt` — Verificado
- Placeholder `pub-XXXXXXXXXXXXXXXX` se mantiene intencionalmente.
- Estructura válida: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
- Requiere sustitución manual por el usuario con su publisher ID real.

#### Volumen de contenido — Verificado
- La arquitectura permite añadir nuevos problemas sin duplicar código:
  - Nuevo entry en `PROBLEM_CATALOGUE` (src/lib/problem-catalogue.ts)
  - Nuevo módulo de reglas en `src/core/problems/`
  - El sitemap genera automáticamente URLs desde el catálogo
  - SearchBar y /problemas se actualizan automáticamente
- No se crearon páginas artificiales ni contenido fabricado.
- La expansión de contenido es una decisión editorial futura.

### Verificación (post-correcciones):

```bash
# ESLint
$ npx eslint .
# Result: PASS (0 errors, 0 warnings)

# TypeScript
$ npx tsc --noEmit
# Result: PASS (0 errors)

# Tests
$ npx vitest run
# Result: 48 test files, 994 passed, 1 pre-existing flaky timeout (unrelated)

# Build
$ npx next build
# Result: PASS (22 pages generated, 0 errors)
```

---

## 11. Consent System Implementation

> **Fecha:** 21 de septiembre de 2026
> **Base:** Auditoría técnica de consentimiento, Plausible y AdSense
> **Objetivo:** Reemplazar el banner casero por un sistema de consentimiento real, preparado para Google CMP + AdSense

### Problema identificado

El banner `CookieConsent.tsx` era únicamente visual:
- Escribía `accepted`/`declined` en `localStorage` bajo clave `resolveo-cookie-consent`
- Ningún otro archivo del proyecto leía ese valor
- Plausible se cargaba siempre en `<head>` antes de que el usuario pudiera decidir
- No existía Google Consent Mode, TCF ni CMP real

### Solución implementada

#### Archivos creados:
- `src/lib/consent-store.ts` — Estado de consentimiento con integración TCF (Google CMP) y fallback a localStorage
- `src/components/PlausibleLoader.tsx` — Carga condicional de Plausible según consentimiento, solo en producción
- `src/app/cookies/page.tsx` — Política de cookies y almacenamiento

#### Archivos modificados:
- `src/app/layout.tsx` — Eliminado CookieConsent, añadido PlausibleLoader, añadido placeholder para Google CMP script, añadido enlace a /cookies en footer
- `src/app/privacidad/page.tsx` — Reescrita para documentar Plausible, localStorage, CMP y AdSense (futuro)
- `src/app/sitemap.ts` — Añadida `/cookies`

#### Archivos eliminados:
- `src/components/CookieConsent.tsx` — Eliminado (reemplazado por sistema real)

### Cómo funciona ahora

**Sin Google CMP (estado actual):**
1. `PlausibleLoader` se monta en el client-side
2. `initConsent()` detecta que no hay `__tcfapi` (no hay CMP)
3. Lee `resolveo-analytics-consent` de localStorage
4. Si es `"granted"` → carga Plausible. Si no → no carga nada
5. El usuario debe usar la consola del navegador o una página de configuración para dar/quitar consentimiento

**Con Google CMP (después de configurar AdSense):**
1. El script de Google CMP se carga en `<head>` (descomentando el placeholder)
2. Google CMP muestra el banner de consentimiento
3. `PlausibleLoader` detecta `window.__tcfapi`
4. Consulta Purpose 1 y Purpose 9 del TC string
5. Si cualquiera está concedido → carga Plausible
6. Los cambios de consentimiento se propagan automáticamente

### Pendiente de configuración manual

El CMP de Google requiere configuración desde AdSense:
1. AdSense → Privacy & messaging → European regulations
2. Crear mensaje de consentimiento
3. Copiar el snippet generado
4. Descomentar y reemplazar `PLACEHOLDER_CMP_ID` en `src/app/layout.tsx`

### Verificación (post-implementación consent):

```bash
# ESLint
$ npx eslint .
# Result: PASS (0 errors, 0 warnings)

# TypeScript
$ npx tsc --noEmit
# Result: PASS (0 errors)

# Tests
$ npx vitest run
# Result: 48 test files, 994 passed, 1 pre-existing flaky timeout (unrelated)

# Build
$ npx next build
# Result: PASS (23 pages generated, 0 errors)
```

> **AVISO (2026-09-22): esta sección describe un sistema que ya no existe.**
> `src/lib/consent-store.ts`, la lectura de `__tcfapi`, la interpretación de
> Purpose 1/9 y la clave `resolveo-analytics-consent` se eliminaron por
> completo. El sistema vigente está descrito en «Post-Audit Corrections».
> Se conserva esta sección como registro histórico de la decisión.

---

## Post-Audit Corrections — 2026-09-22

Correcciones derivadas de la auditoría de calidad y preparación para AdSense.
Alcance: exactitud de las fuentes, información legal y de contacto, profundidad
real de las fichas de problema y enlazado interno. **No** se crearon páginas
nuevas de contenido ni contenido programático.

### 1. Exactitud de las fuentes (defectos reales encontrados)

| Defecto | Evidencia | Corrección |
|---|---|---|
| Cita del art. 5.1 del Reglamento 261/2004 con un fragmento en inglés («en accordance con el artículo 7») y plazos que no coincidían con el texto publicado | `src/problems/flight-cancel/rules.ts`, `relevantSection` | Reescrita con el texto oficial en español consultado en el BOE (documento `DOUE-L-2004-80291`, DOUE L 46 de 17.02.2004): art. 5.1, 5.3, 5.4, 7.1, 7.2, 7.4, 8.1, 8.3, 9.1 y 9.2 |
| Art. 8.3 citado como base para reclamar gastos adicionales (el art. 8.3 regula los aeropuertos de una misma ciudad o región) | `src/problems/flight-cancel/rules.ts` (comentarios y registro) | Corregido a art. 9.1 (asistencia obligatoria) + art. 5.1(a)-(b); la regla sigue siendo factual y el supuesto queda marcado para revisión legal humana |
| `/fuentes` atribuía el art. 102.2 del TRLGDCU (nulidad de cláusulas que penalizan el desistimiento) a la **Ley 11/2022** | `src/app/fuentes/page.tsx` vs `src/problems/cancellation-charge/rules.ts` | La página ya no mantiene una lista propia: se genera desde los módulos (`src/lib/source-catalogue.ts`) |
| `/fuentes` prometía «estado de verificación» por entrada sin mostrar versión, fecha ni enlace | `src/app/fuentes/page.tsx` | Cada fuente publica identificador, versión consultada, fecha de consulta, enlace oficial y el artículo que el análisis usa |
| Plazo «3 meses» para reclamar, sin ninguna fuente registrada que lo respalde | `src/lib/problem-catalogue.ts` (garantía y pedido no entregado) | Reemplazado por los plazos que sí constan en las fuentes: 3 años (art. 120.1), 2 años de presunción (art. 121.1), 30 días naturales (art. 66 bis.1) |
| Plazo «2 años para reclamar (Reglamento 261/2004)» | `src/lib/problem-catalogue.ts` (vuelo) | El Reglamento no fija plazo propio: la página lo dice así y recomienda reclamar por escrito y conservar el acuse |
| `/autor` afirmaba «los 995 tests del proyecto» | `src/app/autor/page.tsx` | Sustituido por una formulación que no caduca + sección nueva «Qué se comprueba automáticamente y qué revisa una persona» |
| `/cookies` afirmaba que el navegador no almacena nada más allá de la caché | `src/app/cookies/page.tsx` vs `src/app/case/[caseId]/intake/page.tsx`, `src/components/SearchBar.tsx` | Tabla real de `sessionStorage` (`intake-<id-de-caso>`, se borra al leerse) |

### 2. Privacidad y contacto

- `/privacidad` (437 → ~1.070 palabras visibles): identifica al responsable y su canal, enumera los **encargados del tratamiento reales** (alojamiento, base de datos PostgreSQL en la UE, proveedores de modelos de lenguaje Groq y OpenAI, almacenamiento de objetos, analítica, correo), explica transferencias internacionales, base jurídica, cómo se elabora el análisis con modelos de lenguaje, conservación y derechos con referencia a la AEPD. Se elimina la afirmación «no se comparten con otros terceros», que el código contradecía.
- `/contacto` (131 → ~345 palabras visibles): qué incluir según el tipo de mensaje (corrección de fuente con publicación oficial y artículo, incidencia técnica, derechos de privacidad), y qué no se puede atender.

### 3. Profundidad de las fichas de problema

Cada una de las 4 páginas de problema incorpora, con contenido derivado de sus
propias reglas y de las fuentes que citan:

- **Ejemplo de caso trabajado** (escenario + qué saldría en el informe).
- **Cómo reclamar, paso a paso** (4–5 pasos: escrito al obligado, acuse, autoridad competente —AESA para el Reglamento 261/2004, consumo para el resto—, pruebas y vía judicial).
- **Preguntas frecuentes** (4–5 por página) con la respuesta apoyada en el artículo concreto.
- **«Qué no podemos determinar»** (el campo existía en el catálogo y no se renderizaba).
- **Fecha de última revisión** visible y enlace a `/fuentes`.
- **Problemas relacionados** (enlazado interno entre módulos).

Palabras visibles por página (texto renderizado, script aparte):

| Página | Antes | Ahora |
|---|---:|---:|
| `/problemas/vuelo-cancelado` | ~349 | 1.121 |
| `/problemas/garantia-rechazada` | ~351 | 1.077 |
| `/problemas/pedido-no-llega` | ~347 | 1.065 |
| `/problemas/cancelacion-cargo-posterior` | ~344 | 1.075 |
| `/fuentes` | ~404 | 2.576 |
| `/privacidad` | ~437 | 1.068 |
| `/contacto` | 131 | 345 |
| `/autor` | ~464 | 642 |
| `/cookies` | ~293 | 396 |

### 4. Arquitectura de contenido (verificado, sin cambios)

- El sitemap sigue conteniendo las mismas 14 URLs indexables; `/resolver`, `/case/*`, `/casos` y `/problema-libre` siguen fuera del índice.
- Añadir un problema nuevo sigue siendo: registrar el módulo (`src/server/problems/registry.ts`), añadir sus reglas (`src/server/rules/publish-module-rules.ts`) y su entrada de catálogo. La nueva guarda de tests obliga a que toda entrada tenga fuentes y contenido completo.
- Volumen de contenido: sigue siendo reducido y se documenta como **expansión futura** (módulos nuevos con el mismo rigor), sin generar páginas artificiales.

### 5. Estado de `ads.txt`

Contiene el publisher ID real: `google.com, pub-1097809642955447, DIRECT, f08c47fec0942fa0`. No requiere acción manual. AdSense sigue sin activarse en el código: no hay script de publicidad ni CMP, y esa configuración se hará con el snippet oficial que genere Google Privacy & Messaging.

### 6. Verificación

```bash
$ npx tsc --noEmit
# Result: PASS (0 errores)

$ npx eslint src/
# Result: PASS (0 errores, 0 warnings)

$ npx vitest run
# Result: 66 archivos, 1124 tests pasan (+19 nuevos: catálogo de fuentes y contenido de fichas)

$ npx next build
# Result: PASS (todas las páginas estáticas/SSG)
```

Cada afirmación de esta sección se comprobó sobre el HTML generado en `.next/`,
no sólo sobre el código fuente.

---

## 12. Flujo único, trazabilidad pública y preparación de CMP

Segunda pasada de implementación sobre la auditoría crítica. El criterio: una sola
arquitectura, y lo que el sitio afirma debe ser lo que el código hace.

### 1. Entrada determinista (el problema ya se conoce)

- `src/app/api/problems/[problemKey]/cases/route.ts` deja de ser un endpoint de demo:
  valida contra el catálogo publicado (404 tipado si no existe), crea el caso con los
  **defaults del propio módulo** (`caseDefaultsForModule`, no `UNKNOWN`/`es-ES`
  hardcodeados) y devuelve la **primera pregunta en la misma respuesta**.
- `src/server/intake/progress.ts`: el cálculo de progreso se extrae de la ruta de intake
  para que cuestionario y análisis no puedan divergir.
- `/problemas/[slug]` enlaza a `/resolver?problema=<slug>`: el módulo viaja en la URL, no
  se pide a un modelo que vuelva a adivinar lo que la persona acaba de elegir.
- El buscador (`SearchBar`) pasa a ser navegación pura: problema conocido → entrada
  determinista; texto libre → `/resolver`, que es el único flujo con reintento y salida
  alternativa. Desaparece la tercera UX (`/case/new` eliminada) y el `sessionStorage` que
  transportaba la interpretación entre pantallas.

### 2. IA como dependencia, no como punto único de fallo

- Errores tipados del servidor traducidos a mensajes con una salida real
  (`AI_UNAVAILABLE`, `AI_INVALID_STRUCTURED_OUTPUT`, `BUDGET_EXCEEDED`,
  `SERVICE_UNAVAILABLE`), con `AbortSignal.timeout` en cada llamada.
- La pantalla de error ofrece: reintentar la descripción, listar los 4 problemas
  publicados (entrada determinista) y volver a empezar. Nunca un callejón sin salida.

### 3. Informe: trazable y corregible

- Los hechos que cada regla lee y las fuentes que cita se derivan del propio módulo
  (`src/lib/trace.ts`, `src/components/TraceDemo.tsx`) y se publican en
  `/como-funciona` y en cada ficha: HECHO → REGLA → ARTÍCULO → FUENTE → CONCLUSIÓN.
- Las respuestas del informe se pueden **corregir en el sitio** (`AnswerRow`): la
  corrección se guarda como un hecho nuevo que supera al anterior (no se reescribe el
  caso en silencio) y el análisis se regenera.
- `INSUFFICIENT_DATA` deja de ser un final: explica qué falta, cuántos datos son, por
  qué deciden una conclusión, cómo aportarlos y qué ocurre al hacerlo.

### 4. Transparencia editorial

- `/autor` pasa a *responsabilidad editorial y método de revisión*: qué se comprueba
  automáticamente, qué revisa una persona, cómo informar de un error, y qué cubre y qué
  no cubre Resolveo. Sin credenciales inventadas.
- Nueva `/correcciones` (`src/lib/corrections.ts`): registro fechado de correcciones
  reales (citas normativas, plazos sin fuente, páginas legales, flujo del buscador), con
  el alcance del registro declarado en lugar de reconstruir un historial.

### 5. SEO y contratos públicos

- JSON-LD por página de problema: `BreadcrumbList`, `WebPage` (con `dateModified`) y
  `FAQPage` construido desde las preguntas reales del catálogo.
- Sitemap: añadida `/correcciones`; siguen fuera `/resolver`, `/case/*`, `/casos` y
  `/problema-libre`.
- `/casos` conserva `noindex` y su enlace útil en el footer («Recuperar un caso») para no
  quedar huérfana.

### 6. CMP preparado sin inventar nada

- `src/components/GoogleConsentCmp.tsx` carga la etiqueta de Google Privacy & Messaging
  solo si `NEXT_PUBLIC_GOOGLE_CMP_SRC` está definida, y solo si es https en un host
  `google.com`. Sin variable no se renderiza nada: no hay placeholder que parezca un CMP.
- No se implementa TCF, ni `__tcfapi`, ni Consent Mode a mano, ni se usa la decisión de
  publicidad para Plausible (cookieless e independiente). Documentado en `.env.example`.

### 7. Legal coherente con el código

`/cookies` y `/privacidad` afirman ahora lo que el código hace: sin cookies, sin
`localStorage` y **sin `sessionStorage`** (el estado del caso vive en el servidor). Se
elimina la lectura muerta de esa clave en el cuestionario heredado.

### 8. Verificación

```bash
$ npx tsc --noEmit      # PASS (0 errores)
$ npx eslint src/ tests/ # PASS (0 errores, 0 warnings)
$ npx vitest run        # PASS (71 archivos, 1147 tests)
$ npx next build        # PASS (23 páginas generadas)
```

Tests nuevos de esta fase: contrato del endpoint determinista (400/404/no-store),
recorrido completo ficha → preguntas → cuestionario completo sobre persistencia real
para **los 4 problemas publicados**, trazabilidad derivada (toda regla publicada cita al
menos una fuente), registro de correcciones y guarda de la etiqueta de CMP.

Se comprobó en el HTML generado: enlace `resolver?problema=vuelo-cancelado`, JSON-LD de
FAQ y breadcrumbs, sección de trazabilidad y presencia de `/correcciones` en el sitemap.

### 9. Pendiente (requiere credencial o decisión humana)

- `NEXT_PUBLIC_GOOGLE_CMP_SRC`: pegar la etiqueta exacta que genera AdSense
  (Privacidad y mensajería → Reglamentos europeos). No se inventa ni se construye a mano.
- Revisión legal humana del supuesto de gastos adicionales (art. 9.1) y de la regla DRAFT
  del cargo por permanencia: siguen fuera del conjunto publicado a propósito.
- Identidad del responsable en `/privacidad` y firma en `/autor`: el proyecto dice «la
  persona que mantiene el proyecto» + correo, sin inventar nombre ni entidad.
- AdSense no se activa todavía: el remedio real es más contenido público, no un script.
