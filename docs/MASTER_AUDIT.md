# MASTER WEBSITE AUDIT — Resolveo (resolveo.site)

> **Fecha:** 21 de septiembre de 2026
> **Auditor:** Buffy (Codebuff)
> **Proyecto:** Resolveo — Plataforma de resolución de problemas de consumo
> **Stack:** Next.js 15 + React 19 + TypeScript + Tailwind CSS + Drizzle ORM + PostgreSQL
> **Dominio declarado:** resolveo.site (en .env.example, metadata, sitemap, robots)
> **Nota:** NO se modificó ningún archivo durante esta auditoría.

---

## 🚨 CRITICAL ISSUES

| # | Problema | Evidencia | Severidad |
|---|---|---|---|
| 1 | **NO hay `ads.txt`** | `public/ads.txt` no existe. Sin esto, AdSense no puede aprobarse. | CRITICAL |
| 2 | **NO hay analytics de ningún tipo** | No se detectó GA, Plausible, PostHog, ni ningún tracking. Imposible medir tráfico. | CRITICAL |
| 3 | **NO hay Search Console verification** | No hay meta tag de verificación, no hay `google-site-verification`. | CRITICAL |
| 4 | **Imágenes enormes sin optimizar** | 4 imágenes en `/public/images/`: 1.1MB, 1.5MB, 1.6MB, 1.9MB. Total ~6MB. JPG sin compresión agresiva, PNG de 1.9MB. | HIGH |
| 5 | **NO hay Cookie Consent / CMP** | Sin banner de cookies, sin gestión de consentimiento. Requisito GDPR para usuarios europeos. | HIGH |
| 6 | **`/resolver` tiene `robots: noindex`** | La página principal de interacción está bloqueada para indexación. | MEDIUM |
| 7 | **Solo 4 problemas indexables** | Elcatálogo tiene 4 entries. Contenido programático mínimo. | MEDIUM |
| 8 | **53 errores ESLint** | `no-explicit-any` en múltiples archivos. Code quality deteriorada. | MEDIUM |
| 9 | **Páginas de `/case/` y `/casos/` bloqueadas en robots** | Funcionalidad bloqueada correctamente, pero sin explicación enrobots.txt. | LOW |
| 10 | **globals.css referencia "CONSUMER RESOLVER" en comentario** | Comentario en línea 2 del CSS aún dice el nombre antiguo. | LOW |

---

## TOP 10 ACCIONES (ordenadas por Impact/Effort)

| # | Acción | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Crear `/ads.txt` con publisher ID de AdSense | CRITICAL | Bajo |
| 2 | Integrar Google Analytics o Plausible (cookieless) | CRITICAL | Bajo |
| 3 | Verificar dominio en Google Search Console | CRITICAL | Bajo |
| 4 | Comprimir imágenes (WebP/AVIF, max 200KB cada una) | HIGH | Bajo |
| 5 | Añadir CMP/cookie consent (Cookiebot, osano, etc.) | HIGH | Medio |
| 6 | Quitar `noindex` de `/resolver` o crear landing indexable | MEDIUM | Bajo |
| 7 | Añadir más contenido de problemas (expandir catálogo) | MEDIUM | Alto |
| 8 | Corregir 53 errores ESLint | MEDIUM | Medio |
| 9 | Añadir `security headers` en `next.config.ts` | MEDIUM | Bajo |
| 10 | Actualizar comentario "CONSUMER RESOLVER" en globals.css | LOW | Bajo |

---

## DO NOT TOUCH

- **Arquitectura modular de problemas** — Bien diseñada, escalable, separada del UI.
- **Sistema de reglas deterministas** — Cada módulo tiene trazabilidad completa a fuentes oficiales. Esto es una ventaja competitiva real.
- **Flujo de intake con AI** — El patrón SearchBar → intake → questioning → evidence → analysis está bien implementado.
- **Páginas legales** — Privacidad, términos, contacto, autor: todas existen y son sustanciales.
- **Política de fuentes** — La filosofía de usar solo legislación oficial (BOE, EUR-Lex) es sólida.
- **Testing** — 995 tests pasan. La cobertura de tests es notable para un proyecto de esta escala.
- **TypeScript strict mode** — Configuración estricta, sin `any` en la configuración (aunque el código lousa).
- **Diseño visual** — La paleta cálida editorial es distintiva y profesional. No parece un template genérico.

---

## 1. EXECUTIVE SUMMARY

Resolveo es un proyecto técnicamente sólido con una arquitectura interna notable: módulos de problemas con reglas deterministas, trazabilidad a fuentes oficiales, sistema de intake con IA, y 995 tests. Sin embargo, tiene carencias significativas para producción y AdSense:

- **Sin analytics** → no se puede medir nada.
- **Sin Search Console** → no se puede monitorear indexación.
- **Sin ads.txt** → AdSense no se puede aprobar.
- **Sin CMP** → riesgo GDPR.
- **Imágenes enormes** → performance impactada.
- **Contenido limitado** → solo 4 problemas + páginas estáticas.
- **53 errores ESLint** → code quality deteriorada.

El proyecto tiene una base arquitectónica fuerte pero necesita trabajo significativo en superficie pública antes de ser competitivo en SEO y listo para AdSense.

---

## 2. OVERALL SCORE

### 52/100 — NEEDS MAJOR WORK

| Categoría | Puntuación |
|---|---:|
| SEO técnico | 55/100 |
| SEO on-page | 60/100 |
| Contenido | 40/100 |
| Indexación | 50/100 |
| Arquitectura / Internal Linking | 65/100 |
| Topical Authority | 30/100 |
| E-E-A-T / Trust | 55/100 |
| Structured Data | 40/100 |
| Performance | 35/100 |
| Mobile | 70/100 |
| Accessibility | 60/100 |
| UX | 65/100 |
| AdSense Readiness | 20/100 |
| Security / Code Quality | 55/100 |
| Legal / Trust | 70/100 |

---

## 3. SEO SCORE

### SEO Score: 45/100

| Subcategoría | Nota |
|---|---:|
| Technical SEO | 55/100 |
| On-page SEO | 60/100 |
| Content SEO | 35/100 |
| Internal Linking | 60/100 |
| Topical Authority | 25/100 |
| Indexability | 50/100 |
| Structured Data | 40/100 |
| Performance | 35/100 |

---

## 4. ADSENSE READINESS

### AdSense Readiness: 20/100

**Nivel de preparación estimado: BAJO**

| Factor | Estado |
|---|---|
| Contenido original | ✅ Sí — contenido propio, no copiado |
| Contenido suficiente | ❌ Muy limitado (4 problemas + ~10 páginas estáticas) |
| Navegación | ✅ Clara y funcional |
| Experiencia de usuario | ✅ Buena |
| Páginas legales | ✅ Privacidad, términos, contacto |
| Transparencia del creador | ✅ Página /autor existe |
| ads.txt | ❌ NO EXISTE |
| AdSense script | ❌ No integrado |
| ad slots | ❌ No configurados |
| CMP / Cookie consent | ❌ No existe |
| Analytics | ❌ No existe |
| Contenido thin/low-value | ⚠️ Riesgo medio — pocas páginas, poco volumen |
| Contenido engañoso | ✅ No detectado |
| Contenido copiado | ✅ No detectado |

**Riesgo principal:** Google puede rechazar AdSense por "contenido insuficiente" o "contenido de bajo valor" dado el volumen extremadamente bajo de páginas indexables (~14 páginas públicas).

---

## 5. SEARCH CONSOLE READINESS

### Search Console Readiness: 30/100

| Factor | Estado |
|---|---|
| Sitemap | ✅ Generado dinámicamente, correcto |
| Robots.txt | ✅ Configurado correctamente |
| Canonicals | ✅ Self-referencing en todas las páginas |
| Indexability | ⚠️ `/resolver` tiene noindex |
| URL structure | ✅ Limpia, descriptivas |
| Structured data | ⚠️ Solo Organization + WebSite |
| Mobile | ✅ Responsive |
| Core Web Vitals | ❌ NO VERIFICABLE (sin métricas de producción) |
| Redirects | ✅ `/problema-libre` → `/resolver` |
| Dominio consistency | ⚠️ .env.example usa localhost como default |

---

## 6. INDEXATION READINESS

### Indexation Readiness: 45/100

**Páginas del proyecto:**
- Páginas públicas indexables: ~14
- Páginas bloqueadas (robots): /api/*, /case/*, /casos/*
- Páginas con noindex: /resolver
- Páginas en sitemap: 14 (9 estáticas + 4 problema + 1 problema-libre redirect)
- Páginas que deberían estar: 14

**Problemas:**
- `/resolver` no está en sitemap y tiene noindex — correcto si es funcional, pero pierde tráfico de búsqueda.
- Solo 4 páginas de contenido real (problemas). Las demás son estáticas informativas.
- `/problema-libre` redirige a `/resolver` pero no está en sitemap (correcto).

---

## 7. CONTENT QUALITY

### Content Quality: 40/100

### Low-value risk: MEDIUM
### Thin-content risk: HIGH
### Scaled-content risk: LOW

**Análisis:**

El sitio tiene ~14 páginas públicas:
- 1 Homepage
- 1 /resolver (noindex)
- 1 /problemas (índice)
- 4 /problemas/[slug] (contenido sustancial)
- 1 /como-funciona
- 1 /fuentes
- 1 /sobre
- 1 /autor
- 1 /contacto
- 1 /privacidad
- 1 /terminos
- 1 /casos (lookup funcional)

**Fortalezas:**
- Las 4 páginas de problemas son SÓLIDAS: descripción, qué analizan, qué obtienes, datos importantes, fechas, evidencia, errores comunes, limitaciones, base legal.
- La página /fuentes es única y diferente: lista fuentes oficiales reales con artículos específicos.
- /como-funciona explica bien el proceso.

**Debilidades:**
- **Volumen extremadamente bajo.** 4 problemas no son suficientes para topical authority.
- No hay artículos, guías, FAQ, comparaciones, ni contenido de soporte.
- No hay blog ni sección de recursos.
- Las páginas legales son correctas pero breves.
- /sobre es genérica — no hay credenciales, experiencia, ni backstory concreto.

---

## 8. TECHNICAL SEO

### Technical SEO: 55/100

**Bien:**
- ✅ Canonical self-referencing en todas las páginas
- ✅ Robots.txt correcto (bloquea /api/, /case/, /casos/)
- ✅ Sitemap dinámico con prioridades
- ✅ Redirect de /problema-libre → /resolver
- ✅ HTTPS (asumido por Next.js/Vercel)
- ✅ MetadataBase configurado
- ✅ Open Graph en páginas principales
- ✅ `lang="es"` en HTML

**Mal:**
- ❌ No hay `security headers` configurados en `next.config.ts`
- ❌ No hay `x-content-type-options`, `x-frame-options`, `referrer-policy`
- ❌ `eslint: { ignoreDuringBuilds: true }` — lint no se ejecuta en build
- ⚠️ `NEXT_PUBLIC_SITE_URL` default a localhost — si se deploya sin configurar, el sitemap apunta a localhost
- ⚠️ No hay `<link rel="canonical">` explícito (Next.js lo genera via `alternates`, pero verificar)
- ⚠️ No hay hreflang (irrelevante si solo opera en España)

**Falta:**
- ❌ No hay 301 redirects configurados en `next.config.ts`
- ❌ No hay `headers()` en `next.config.ts` para security

---

## 9. CONTENT AUDIT

### Páginas por página:

| URL | Tipo | SEO | Contenido | Indexación | AdSense | Problemas | Prioridad |
|---|---|---:|---:|---:|---:|---|---|
| `/` | Homepage | 70 | 65 | 80 | 40 | Contenido denso, SearchBar como CTA principal | P1 |
| `/resolver` | Tool | 30 | 60 | 0 | 30 | noindex, no está en sitemap | P2 |
| `/problemas` | Index | 65 | 55 | 80 | 40 | Solo 4 problemas, thin para un índice | P2 |
| `/problemas/cancelacion-cargo-posterior` | Article | 80 | 85 | 80 | 70 | Contenido sólido, buena estructura | P0 |
| `/problemas/pedido-no-llega` | Article | 80 | 85 | 80 | 70 | Contenido sólido | P0 |
| `/problemas/garantia-rechazada` | Article | 80 | 85 | 80 | 70 | Contenido sólido | P0 |
| `/problemas/vuelo-cancelado` | Article | 80 | 85 | 80 | 70 | Contenido sólido | P0 |
| `/como-funciona` | Guide | 70 | 70 | 80 | 50 | Correcta pero sin profundidad | P2 |
| `/fuentes` | Reference | 75 | 80 | 80 | 50 | Única, buena diferenciación | P1 |
| `/sobre` | About | 60 | 50 | 80 | 40 | Genérica, falta personalidad | P2 |
| `/autor` | Author | 65 | 55 | 80 | 40 | Sin credenciales reales | P2 |
| `/contacto` | Contact | 70 | 60 | 80 | 50 | Funcional | P3 |
| `/privacidad` | Legal | 65 | 65 | 80 | 60 | Correcta | P3 |
| `/terminos` | Legal | 65 | 65 | 80 | 60 | Correcta | P3 |
| `/casos` | Utility | 40 | 30 | 0 | 20 | Lookup funcional, bloqueada en robots | P3 |

---

## 10. PAGE-BY-PAGE AUDIT (Detalle)

### Homepage (`/`)
- **Title:** "Resolveo — Resolución de problemas" ✅
- **Meta description:** "Describe tu problema. Analizamos tu caso con normativa vigente y te mostramos qué puedes hacer." ✅
- **H1:** "Entiende tu problema. Resuélvelo." ✅
- **Contenido:** SearchBar + lista de problemas + sección "Cómo funciona" + CTA
- **Problema:** La homepage depende del SearchBar como interacción principal. Sin JavaScript, no hay contenido visible más allá del hero.
- **Internal links:** 4 problemas destacados, footer con enlaces
- **Structured data:** Organization + WebSite ✅
- **AdSense:** Riesgo — contenido visual, poco texto indexable

### Páginas de problemas (`/problemas/[slug]`)
- **SEO:** Buenas. Titles con "— Análisis", canonical correcto, OG configurado.
- **Contenido:** SÓLIDO. Cada página tiene: qué analizan, qué obtienes, datos importantes, fechas relevantes, tipos de evidencia, errores comunes, qué verifican, base legal, limitaciones.
- **Imágenes:** 4 imágenes de hero, pero son decorativas (opacity 7%).
- **Problema:** Las imágenes son enormes (1.1-1.9MB) y solo se usan como fondo decorativo.
- **Internal linking:** Enlazan desde /problemas y homepage. Bueno.

### /fuentes
- **Única y diferenciadora.** Lista 4 fuentes oficiales reales con artículos específicos.
- **Contenido sustancial** — no es una página genérica.
- **SEO:** Buen title, canonical, OG.

### /como-funciona
- **Contenido bueno** — explica el proceso en 5 pasos, dos tipos de problemas, filosofía de fuentes.
- **Internal link a /fuentes** ✅
- **CTA a homepage** ✅

---

## 11. TOOL/CALCULATOR AUDIT

### /resolver (AI Intake Tool)
- **Función:** Permite al usuario describir un problema y lo analiza con IA.
- **UX:** Limpia, bien diseñada. Textarea + botón "Analizar".
- **SEO:** Tiene `robots: { index: false, follow: false }` — correcto si es funcional, pero pierde tráfico.
- **Problema:** No hay landing page indexable que explique qué hace la herramienta.
- **Recomendación:** Crear una página indexable tipo "Analiza tu problema" que enlace a /resolver.

### SearchBar (Homepage)
- **Función:** Búsqueda de problemas + análisis con IA.
- **UX:** Buena — dropdown con resultados + opción IA.
- **SEO:** No indexable (componente client-side).

---

## 12. INTERNAL LINKING

### Mapa de enlaces internos:

```
Homepage
├── /problemas (4 problemas)
│   ├── /problemas/cancelacion-cargo-posterior
│   ├── /problemas/pedido-no-llega
│   ├── /problemas/garantia-rechazada
│   └── /problemas/vuelo-cancelado
├── /como-funciona
│   └── /fuentes
├── /resolver (noindex)
├── /contacto
├── /sobre
├── /autor
├── /privacidad
└── /terminos
```

**Fortalezas:**
- Footer con enlaces a todas las páginas principales
- Homepage enlaza a los 4 problemas
- /problemas enlaza a cada problema individual
- /como-funciona enlaza a /fuentes

**Debilidades:**
- No hay breadcrumbs
- No hay sección de "problemas relacionados" en cada página de problema
- No hay enlaces contextuales entre problemas relacionados
- /fuentes no enlaza de vuelta a los problemas que usa cada fuente
- No hay cluster temático claro (problemas de compras juntos, transportejuntos)

---

## 13. TOPICAL AUTHORITY

### Evaluación: D. Aleatorio / sin autoridad temática clara

**Temas principales detectados:**
1. Cancelación y cobros indebidos (telecomunicaciones)
2. Pedidos no entregados / reembolsos
3. Garantías rechazadas
4. Vuelos cancelados

**Problema:** Son 4 nichos dentro del consumo, pero no hay profundidad temática. No hay:
- Artículos explicativos
- Guías paso a paso
- FAQ por problema
- Comparativas
- Calculadoras de compensación
- Contenido de soporte

**Lo que tiene:**
- 4 módulos de análisis con reglas deterministas (excelente internamente, invisible para SEO)
- Fuentes oficiales documentadas

**Veredicto:** La autoridad temática es BAJA para SEO. La arquitectura interna es sólida pero el contenido público no la refleja.

---

## 14. E-E-A-T / TRUST

### E-E-A-T: 55/100

| Factor | Estado |
|---|---|
| Autor | ⚠️ Página /autor existe pero sin credenciales reales, nombre, ni foto |
| Experiencia | ⚠️ No hay testimonios, casos de éxito, ni evidencia de uso |
| Fuentes | ✅ EXCELENTE — fuentes oficiales documentadas con artículos |
| Referencias | ✅ BOE, EUR-Lex, Código Civil |
| Metodología | ✅ Explicada en /como-funciona |
| Transparencia | ✅ Disclaimer claro en todas las páginas |
| Contacto | ✅ Email funcional |
| About | ✅ /sobre y /autor existen |
| Actualización | ⚠️ No hay fechas de "última actualización" visibles en contenido |
| Credenciales | ❌ No hay credenciales de experto en consumo |

**Nota:** Para un proyecto de herramienta de consumo (no blog), el E-E-A-T es ACEPTABLE. La transparencia sobre las limitaciones es una fortaleza.

---

## 15. STRUCTURED DATA

### Structured Data: 40/100

**Detectado:**
1. **Organization** (layout.tsx) — ✅ Válido
2. **WebSite** (layout.tsx) — ✅ Válido

**Falta:**
- ❌ No hay **BreadcrumbList** para /problemas/[slug]
- ❌ No hay **Article** o **WebPage** schema en páginas de problemas
- ❌ No hay **FAQPage** (aunque no hay FAQ)
- ❌ No hay **HowTo** en /como-funciona
- ❌ No hay **WebApplication** para /resolver

**Nota:** No implementar schema "simplemente porque ayuda al SEO". El Organization y WebSite son apropiados. BreadcrumbList sería útil para /problemas/[slug].

---

## 16. SITEMAP

### Sitemap: 70/100

**URLs en sitemap:** 14
- 9 páginas estáticas
- 4 páginas de problemas
- 1 /problema-libre (redirige — correcto incluirlo)

**Calidad del sitemap:**
- ✅ URLs correctas
- ✅ Prioridades asignadas
- ✅ changeFrequency
- ✅ lastModified dinámico
- ✅ Consistente con robots.txt
- ⚠️ `lastModified` es siempre `new Date()` — no refleja cambios reales
- ⚠️ No incluye /resolver (correcto, tiene noindex)

**Sitemap Quality: 85%**

---

## 17. ROBOTS.TXT

### Robots.txt: 75/100

**Contenido generado dinámicamente por `src/app/robots.ts`:**
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /case/
Disallow: /casos/

Sitemap: [SITE_URL]/sitemap.xml
```

**Análisis:**
- ✅ Permite acceso general
- ✅ Bloquea APIs y rutas privadas
- ✅ Declara sitemap
- ✅ En producción, bloquea todo en desarrollo
- ⚠️ No bloquea explícitamente /_next/ (Next.js lo maneja)
- ⚠️ No hay reglas específicas para bots de IA (opcional)

---

## 18. ADS.TXT

### Ads.txt: 0/100

**❌ NO EXISTE.**

Crear `/public/ads.txt` con:
```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

Requisito ABSOLUTO para AdSense.

---

## 19. ADSENSE

### AdSense Readiness: 20/100

**Nivel de preparación estimado: BAJO**

**Requisitos cumplidos:**
- ✅ Contenido original
- ✅ Navegación clara
- ✅ Páginas legales
- ✅ Contacto
- ✅ Transparencia del servicio
- ✅ Sin contenido engañoso

**Requisitos NO cumplidos:**
- ❌ Sin ads.txt
- ❌ Sin AdSense script
- ❌ Sin ad slots
- ❌ Sin CMP
- ❌ Sin analytics
- ❌ Contenido insuficiente (~14 páginas)
- ❌ Volumen de tráfico desconocido (sin analytics)

**Riesgo de rechazo: ALTO** — Google probablemente rechazaría por "contenido insuficiente" o "sitio en construcción".

---

## 20. GDPR / CONSENT

### GDPR: 40/100

**Implementado:**
- ✅ Política de privacidad
- ✅ Términos de uso
- ✅ Derechos ARCO (acceso, rectificación, eliminación)
- ✅ API de eliminación de casos
- ✅ API de exportación de datos

**FALTA:**
- ❌ Cookie consent / CMP
- ❌ Banner de cookies
- ❌ Gestión de consentimiento para analytics (cuando se implemente)
- ❌ Base legal explícita para procesamiento IA
- ⚠️ La privacy policy no menciona cookies (correcto si no las usa)

**Nota:** "Revisión legal recomendada" — la.privacy policy es técnica pero puede necesitar revisión jurídica profesional.

---

## 21. LEGAL PAGES

### Legal: 70/100

| Página | Estado | Calidad |
|---|---|---|
| /privacidad | ✅ Existe | Aceptable — describe datos, uso, derechos |
| /terminos | ✅ Existe | Aceptable — disclaimer, limitaciones |
| /contacto | ✅ Existe | Funcional — email directo |
| /autor | ✅ Existe | Básica — sin credenciales reales |

**Problemas:**
- No hay Cookie Policy (aunque no usa cookies)
- No hay disclaimer específico sobre IA
- Las páginas son breves pero sustanciales
- /autor no tiene nombre real del creador

---

## 22. PERFORMANCE

### Performance: 35/100

**Problemas detectados:**
- ❌ Imágenes enormes: 1.1MB, 1.5MB, 1.6MB, 1.9MB (total ~6MB)
- ❌ PNG de 1.9MB (vuelo-cancelado.png) — debería ser WebP
- ❌ JPG sin optimización visible
- ⚠️ Google Fonts cargadas externamente (3 fuentes)
- ⚠️ `next/image` con `unoptimized` en imágenes de problema
- ⚠️ No hay lazy loading explícito en imágenes below-the-fold
- ⚠️ JS bundle: ~103KB shared + ~5KB por página (aceptable)

**Fortalezas:**
- ✅ Next.js SSG para páginas estáticas
- ✅ Turbopack en desarrollo
- ✅ CSS purge con Tailwind

---

## 23. CORE WEB VITALS

### NO VERIFICABLE

Sin acceso a PageSpeed Insights, Lighthouse en producción, o Chrome UX Report.

**Estimación técnica:**
- **LCP:** Probablemente MALO — imágenes de 1-2MB como hero
- **INP:** Probablemente BUENO — poca interactividad client-side
- **CLS:** Probablemente BUENO — layout estable, sin ads

---

## 24. MOBILE

### Mobile: 70/100

**Bien:**
- ✅ Viewport meta tag configurado
- ✅ Responsive design con Tailwind
- ✅ Mobile menu funcional
- ✅ Touch targets adecuados
- ✅ Typography escalable (clamp)

**Mal:**
- ⚠️ Imágenes enormes impactan carga en móvil
- ⚠️ Tablas no verificadas (no hay tablas complejas)
- ⚠️ SearchBar puede ser difícil de usar en pantallas pequeñas

---

## 25. ACCESSIBILITY

### Accessibility: 60/100

**Bien:**
- ✅ `aria-label` en textarea del intake
- ✅ `aria-expanded` en menú mobile
- ✅ `aria-hidden="true"` en decorativos
- ✅ `role="combobox"` en SearchBar
- ✅ `role="listbox"` en resultados
- ✅ Focus visible con `:focus-visible`
- ✅ `prefers-reduced-motion` soportado
- ✅ Labels en inputs

**Mal:**
- ⚠️ No hay skip-to-content link
- ⚠️ No hay landmark roles explícitos (main, nav, footer)
- ⚠️ Headings pueden tener saltos (h1 → h2 → h3 sin h2 intermedio)
- ⚠️ No hay aria-live para errores dinámicos
- ⚠️ Color contrast no verificado (probablemente OK dado el diseño)

---

## 26. UX

### UX: 65/100

**Fortalezas:**
- ✅ Diseño limpio y profesional
- ✅ Navegación simple y clara
- ✅ SearchBar como entry point intuitivo
- ✅ Flujo de intake paso a paso
- ✅ Feedback visual durante análisis
- ✅ Disclaimer claro en todas las páginas

**Debilidades:**
- ⚠️ Sin breadcrumbs
- ⚠️ Sin search interna (solo SearchBar en homepage)
- ⚠️ Sin "problemas relacionados"
- ⚠️ Sin testimonials ni social proof
- ⚠️ Sin FAQ
- ⚠️ /resolver no tiene feedback de error claro cuando falla la IA

---

## 27. SECURITY

### Security: 60/100

**Implementado:**
- ✅ TypeScript strict mode
- ✅ Input validation con Zod
- ✅ Rate limiting distribuido (PostgreSQL)
- ✅ Error sanitization
- ✅ Secrets en env de servidor
- ✅ Drizzle ORM (parametrizado, no SQL injection)
- ✅ CORS configurado
- ✅ Sanitización de URLs en research module

**Falta:**
- ❌ No hay `security headers` en `next.config.ts`
- ❌ No hay CSP (Content Security Policy)
- ❌ No hay `X-Content-Type-Options`
- ❌ No hay `X-Frame-Options`
- ❌ No hay `Referrer-Policy`
- ⚠️ 53 errores ESLint (no-explicit-any) — potencial type safety issue

---

## 28. CODE QUALITY

### Code Quality: 55/100

**TypeScript:**
- ✅ `strict: true`
- ✅ `noUncheckedIndexedAccess: true`
- ✅ `noUnusedLocals: true`
- ✅ Build pasa sin errores
- ✅ 995 tests pasan

**ESLint:**
- ❌ 53 errores (53 `no-explicit-any`, 1 warning)
- ⚠️ `ignoreDuringBuilds: true` — lint no bloquea builds

**Arquitectura:**
- ✅ Separación clara: core (dominio) / server / app / components
- ✅ Módulos de problemas independientes
- ✅ Ports pattern para testabilidad
- ✅ Design system consistente

**Problemas:**
- `any` types en código de reglas y evaluadores
- Archivos grandes (flight-cancel rules > 1500 líneas)

---

## 29. PROGRAMMATIC SEO

### Programmatic SEO: 30/100

**Evaluación:**

El sitio tiene 4 páginas generadas programáticamente desde `PROBLEM_CATALOGUE`:

| Template | Variantes | Contenido único | Utilidad |
|---|---|---|---|
| `/problemas/[slug]` | 4 | ✅ Sí — datos específicos por problema | ALTA |

**Veredicto:**
- Las 4 páginas son ÚTILES — cada una tiene contenido específico y sustancial.
- No hay thin content en las páginas de problemas.
- El problema es el VOLÚMEN: 4 páginas no son suficientes.
- Las páginas no son doorway pages — aportan valor real.

---

## 30. AI / SCALED CONTENT RISK

### AI Content Risk: LOW

**Análisis:**
- No se detecta contenido generado masivamente
- No hay patrones de repetición
- Las páginas de problemas tienen contenido específico y detallado
- La IA se usa internamente (intake, routing), no como contenido público
- Las páginas estáticas parecen escritas manualmente

**Riesgo de Google penalización: BAJO**

---

## 31. COMPETITIVE ANALYSIS

### NO VERIFICABLE (sin acceso a Internet desde esta sesión)

**Análisis cualitativo:**

Resolveo se posiciona como herramienta de análisis de problemas de consumo en España. Competidores potenciales:
- Reclamador.es
- ConsumidorApp
- Hablamos.de (consumo)
- Páginas de asociaciones de consumidores

**Ventaja competitiva de Resolveo:**
- Arquitectura modular con reglas deterministas (no solo "opinión de IA")
- Trazabilidad completa a fuentes oficiales
- Disclaimer honesto sobre limitaciones

**Desventaja:**
- Volumen de contenido extremadamente bajo
- Sin blog ni contenido de soporte
- Sin presencia en buscadores (sin analytics ni Search Console)

---

## 32. CONTENT GAPS

### Temas faltantes IMPORTANTES:

1. **Calculadora de compensación por vuelo** — Herramienta que calcule 250/400/600 EUR
2. **Guía: "Cómo reclamar ante una aerolínea"** — Contenido evergreen
3. **Guía: "Tus derechos como consumidor en España"** — Pilar page
4. **FAQ** — Preguntas frecuentes por tipo de problema
5. **Blog / Noticias** — Actualizaciones normativas, sentencias relevantes
6. **Más problemas** — Facturas incorrectas, servicios digitales, seguros, etc.
7. **Comparativas** — "Reclamar vs demandar", "Garantía legal vs comercial"
8. **Plantillas** — Cartas de reclamación descargables

---

## 33. COMPLETE ISSUES TABLE

| ID | Área | Problema | Evidencia | Severidad | Impacto | Esfuerzo | Prioridad | Solución |
|---|---|---|---|---|---|---|---|---|
| A01 | AdSense | Falta ads.txt | `public/ads.txt` no existe | CRITICAL | HIGH | Bajo | P0 | Crear archivo con publisher ID |
| A02 | Analytics | Sin analytics | No hay GA, Plausible ni tracking | CRITICAL | HIGH | Bajo | P0 | Integrar Plausible o GA4 |
| A03 | SEO | Sin Search Console | No hay verificación | CRITICAL | HIGH | Bajo | P0 | Verificar dominio |
| A04 | Performance | Imágenes enormes | 4 imágenes totales ~6MB | HIGH | HIGH | Bajo | P1 | Comprimir a WebP, max 200KB |
| A05 | GDPR | Sin CMP | No hay cookie consent | HIGH | MEDIUM | Medio | P1 | Integrar CMP |
| A06 | SEO | /resolver noindex | `robots: noindex` | MEDIUM | MEDIUM | Bajo | P2 | Crear landing indexable |
| A07 | Contenido | Solo 4 problemas | Catálogo mínimo | MEDIUM | HIGH | Alto | P2 | Expandir catálogo |
| A08 | Code | 53 errores ESLint | `no-explicit-any` | MEDIUM | LOW | Medio | P2 | Corregir types |
| A09 | Security | Sin security headers | `next.config.ts` vacío | MEDIUM | MEDIUM | Bajo | P2 | Añadir headers |
| A10 | CSS | Comentario nombre antiguo | globals.css línea 2 | LOW | LOW | Bajo | P3 | Actualizar comentario |
| A11 | SEO | Sin breadcrumbs | No hay BreadcrumbList | LOW | LOW | Medio | P3 | Añadir schema + componente |
| A12 | SEO | lastModified siempre `now` | sitemap.ts | LOW | LOW | Bajo | P3 | Usar fecha real de cambio |
| A13 | Content | /sobre genérica | Sin credenciales ni backstory | LOW | LOW | Bajo | P3 | Enriquecer contenido |
| A14 | UX | Sin FAQ | No hay preguntas frecuentes | LOW | LOW | Medio | P3 | Añadir FAQ por problema |
| A15 | SEO | Sin hreflang | Irrelevante si solo España | INFO | NONE | N/A | N/A | No necesario actualmente |

---

## 34. FINAL VERDICT

### Overall: 52/100 — NEEDS MAJOR WORK

### Scores finales:

| Categoría | Nota | Estado |
|---|---:|---|
| **SEO técnico** | 55/100 | NEEDS WORK |
| **SEO on-page** | 60/100 | NEEDS WORK |
| **Contenido** | 40/100 | POOR |
| **Indexación** | 45/100 | NEEDS WORK |
| **Arquitectura** | 65/100 | GOOD |
| **Internal Linking** | 60/100 | NEEDS WORK |
| **Topical Authority** | 30/100 | POOR |
| **Search Intent** | 70/100 | GOOD |
| **E-E-A-T / Trust** | 55/100 | NEEDS WORK |
| **Structured Data** | 40/100 | POOR |
| **Performance** | 35/100 | POOR |
| **Core Web Vitals** | N/A | NOT VERIFIABLE |
| **Mobile** | 70/100 | GOOD |
| **Accessibility** | 60/100 | NEEDS WORK |
| **UX** | 65/100 | GOOD |
| **AdSense Readiness** | 20/100 | CRITICAL |
| **Legal / Trust** | 70/100 | GOOD |
| **Security** | 60/100 | NEEDS WORK |
| **Code Quality** | 55/100 | NEEDS WORK |

### Low-value risk: **MEDIUM**
### Thin-content risk: **HIGH**
### Scaled-content risk: **LOW**

### Current state: **NEEDS MAJOR WORK**

---

## RESPUESTAS FINALES

### 1. ¿Está preparada para intentar indexarse?
**PARCIALMENTE.** El sitemap y robots.txt están correctos. Las 4 páginas de problemas y ~10 estáticas son indexables. Pero sin Search Console configurado, no se puede monitorear. Y sin analytics, no se puede medir.

### 2. ¿Está preparada para solicitar AdSense?
**NO.** Faltan ads.txt, CMP, analytics, y el volumen de contenido es insuficiente. Google probablemente rechazaría.

### 3. ¿Qué 5 cosas arreglarías primero?
1. Crear ads.txt
2. Integrar analytics (Plausible cookieless)
3. Verificar Search Console
4. Comprimir imágenes a WebP
5. Añadir security headers

### 4. ¿Qué cosas NO tocarías?
- Arquitectura modular de problemas
- Sistema de reglas deterministas
- Flujo de intake con AI
- Testing (995 tests)
- Diseño visual editorial
- Política de fuentes oficiales
- Páginas legales existentes

### 5. ¿Qué riesgo principal tiene actualmente?
**Contenido insuficiente para SEO y AdSense.** Con solo 4 problemas y ~10 páginas estáticas, el sitio no tiene masa crítica de contenido para competir en buscadores o para la aprobación de AdSense.

### 6. ¿Cuál es su mayor ventaja?
**La arquitectura interna.** Módulos de problemas con reglas deterministas, trazabilidad a fuentes oficiales, y un sistema de intake con IA que es genuinamente funcional. Esto es una ventaja competitiva real frente a sitios que solo ofrecen artículos genéricos.

### 7. ¿Cuál es su mayor debilidad?
**Volumen de contenido público.** La arquitectura es excelente pero el contenido visible para Google y los usuarios es mínimo.

### 8. ¿Cuál es su mayor oportunidad SEO?
**Expandir el catálogo de problemas y añadir contenido de soporte.** Cada nuevo problema es una nueva página indexable con contenido único y valioso. Añadir guías, FAQ, y calculadoras multiplicaría el contenido indexable.

### 9. ¿Cuál es su mayor riesgo de AdSense?
**Rechazo por "contenido insuficiente" o "sitio en construcción".** Con ~14 páginas, Google puede considerar que el sitio no tiene suficiente contenido para monetizar.

### 10. ¿La arquitectura permite escalar el proyecto?
**SÍ, EXCELENTEMENTE.** La arquitectura modular permite añadir nuevos problemas con un nuevo archivo de catálogo + módulo de reglas. El sistema de intake universal ya funciona. Escalar de 4 a 20+ problemas sería relativamente directo.

---

*Informe generado el 21 de septiembre de 2026. Sin modificación de código.*
