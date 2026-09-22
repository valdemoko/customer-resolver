# F9 — FINAL REPORT

## 1. Auditoría inicial

### Situación encontrada

- **Home page**: Bien diseñada, sin SEO metadata específico. Solo listaba 3 de 4 módulos (faltaba `flight-cancel`).
- **Sitemap**: Contenía 5 URLs. No incluía páginas de problemas ni nuevas páginas SEO.
- **Robots**: Correcto, bloqueaba `/api/` y `/case/`. No bloqueaba `/casos/`.
- **Metadata**: Genérica en root layout. Sin metadata específica por página.
- **Canonical**: Ausente en todas las páginas.
- **Structured data**: Ninguna.
- **Páginas problemáticas**: No existían `/problemas`, `/como-funciona`, `/fuentes`, `/autor`.
- **Búsqueda**: SearchBar duplicaba definición de problemas (no consumía fuente única).
- **Case pages**: Sin protección noindex explícita (dependían solo de robots.ts).
- **Footer**: Enlaces incompletos, sin `/problemas`, `/fuentes`, `/como-funciona`.

## 2. Problemas detectados

| Severity     | Issue                                                          | Status    |
| ------------ | -------------------------------------------------------------- | --------- |
| **CRITICAL** | `flight-cancel` no aparecía en homepage ni SearchBar           | **FIXED** |
| **HIGH**     | Sin canonical URLs en ninguna página                           | **FIXED** |
| **HIGH**     | Sin metadata específica por página (title, description, OG)    | **FIXED** |
| **HIGH**     | Case pages sin noindex explícita                               | **FIXED** |
| **HIGH**     | Sin sitemap para páginas de problemas                          | **FIXED** |
| **HIGH**     | Duplicación de definición de problemas (SearchBar vs homepage) | **FIXED** |
| **MEDIUM**   | Sin structured data (Organization, WebSite)                    | **FIXED** |
| **MEDIUM**   | Sin páginas /problemas, /como-funciona, /fuentes, /autor       | **FIXED** |
| **MEDIUM**   | robots.ts no bloqueaba /casos/                                 | **FIXED** |
| **LOW**      | Footer sin enlaces a nuevas páginas                            | **FIXED** |
| **LOW**      | problema-libre sin noindex explícita                           | **FIXED** |

## 3. Arquitectura SEO final — Rutas públicas

| Route               | Type      | Purpose                                  |
| ------------------- | --------- | ---------------------------------------- |
| `/`                 | SSG       | Homepage — intake-first, problem listing |
| `/problemas`        | SSG       | Problem index — all available modules    |
| `/problemas/[slug]` | SSG       | Individual problem landing (4 pages)     |
| `/como-funciona`    | SSG       | How it works — process explanation       |
| `/fuentes`          | SSG       | Sources — official legal sources         |
| `/autor`            | SSG       | Author page                              |
| `/sobre`            | SSG       | About page (existing)                    |
| `/contacto`         | SSG       | Contact page (existing)                  |
| `/privacidad`       | SSG       | Privacy policy (existing)                |
| `/terminos`         | SSG       | Terms of use (existing)                  |
| `/sitemap.xml`      | Generated | Dynamic sitemap from catalogue           |
| `/robots.txt`       | Generated | Robots configuration                     |

### Problem landing pages (SSG)

| URL                                      | Problem                           |
| ---------------------------------------- | --------------------------------- |
| `/problemas/cancelacion-cargo-posterior` | Cancelación y cargo posterior     |
| `/problemas/pedido-no-llega`             | Pedido no llega o no se reembolsa |
| `/problemas/garantia-rechazada`          | Garantía rechazada                |
| `/problemas/vuelo-cancelado`             | Vuelo cancelado por la aerolínea  |

## 4. Rutas no indexables

| Route                   | Protection                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `/case/[caseId]`        | `robots: { index: false, follow: false, noarchive: true, nosnippet: true }` + robots.ts disallow |
| `/case/[caseId]/intake` | Same as above (inherits layout)                                                                  |
| `/case/new`             | Same as above (inherits layout)                                                                  |
| `/casos`                | `robots: { index: false, follow: false }` + robots.ts disallow                                   |
| `/problema-libre`       | `robots: { index: false, follow: false }`                                                        |
| `/api/*`                | robots.ts disallow                                                                               |

## 5. Metadata

### Root layout

- Title template: `%s · Resolveo`
- Title default: `Resolveo`
- description: Descriptive, not generic
- OG: locale es_ES, type website
- robots: noindex in non-production

### Per-page metadata

| Page              | Title                                         | Canonical           | OG  |
| ----------------- | --------------------------------------------- | ------------------- | --- |
| Home              | Resolveo — Resolución de problemas de consumo | `/`                 | ✓   |
| /problemas        | Problemas de consumo                          | `/problemas`        | ✓   |
| /problemas/[slug] | [Problem title] — Resolveo                    | `/problemas/[slug]` | ✓   |
| /como-funciona    | Cómo funciona                                 | `/como-funciona`    | ✓   |
| /fuentes          | Fuentes normativas                            | `/fuentes`          | ✓   |
| /autor            | Autor                                         | `/autor`            | ✓   |
| /sobre            | Sobre Resolveo                                | `/sobre`            | ✓   |
| /contacto         | Contacto                                      | `/contacto`         | ✓   |
| /privacidad       | Privacidad                                    | `/privacidad`       | ✓   |
| /terminos         | Términos de uso                               | `/terminos`         | ✓   |

## 6. Sitemap

El sitemap se genera dinámicamente desde `PROBLEM_CATALOGUE` (fuente única de verdad).

**Contenido:**

- 9 páginas estáticas (home, /problemas, /como-funciona, /fuentes, /autor, /sobre, /contacto, /privacidad, /terminos)
- 4 páginas de problemas (generadas desde catálogo)
- **Total: 13 URLs**

**No incluye:**

- `/case/*` (privadas)
- `/casos` (utility, noindex)
- `/problema-libre` (utility, noindex)
- `/api/*` (endpoints)
- `/health` (internal)

## 7. Robots

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /case/
Disallow: /casos/
Sitemap: [production URL]/sitemap.xml
```

Non-production: disallow all.

## 8. Structured data

| Schema       | Location    | Content                        |
| ------------ | ----------- | ------------------------------ |
| Organization | Root layout | name, url, description, sameAs |
| WebSite      | Root layout | name, url, SearchAction        |

Las landing pages de problemas no incluyen JSON-LD adicional porque no representan artículos, FAQs ni eventos — son páginas de producto/servicio.

## 9. Internal linking

```
Home (/)
 ├── /problemas (index)
 │    ├── /problemas/cancelacion-cargo-posterior
 │    ├── /problemas/pedido-no-llega
 │    ├── /problemas/garantia-rechazada
 │    └── /problemas/vuelo-cancelado
 ├── /como-funciona
 ├── /fuentes
 ├── /autor
 ├── /sobre
 ├── /contacto
 ├── /privacidad
 └── /terminos
```

**Footer links:**

- Producto: Resolver un problema, Problemas, Cómo funciona, Fuentes
- Información: Autor, Sobre, Contacto, Privacidad, Términos

**Nav links:** Resolver un problema, Cómo funciona, Contacto

**Breadcrumbs:** Cada landing de problema incluye breadcrumb: Inicio → Problemas → [Problem]

## 10. Performance

- No se añadieron dependencias nuevas
- No se añadieron scripts externos
- JSON-LD inline (sin fetch adicional)
- Páginas de problemas son SSG (generadas en build, servidas como estático)
- SearchBar usa catálogo compartido (sin duplicación de datos)
- No se modificó el diseño visual existente

## 11. Seguridad

- Case pages: noindex + noarchive + nosnippet + robots disallow
- No se exponen case IDs en metadata pública
- No se exponen detalles internos del Rule Engine en páginas públicas
- Catálogo de problemas no contiene IDs internos ni lógica de reglas

## 12. Tests

```
unit:          634 (32 test files)
  - seo.test.ts: 38 tests (new)
  - search.test.ts: 28 tests (existing, passing)
  - problems: flight-cancel (116), etc.
integration:   existing
e2e:           existing
total:         634 unit + integration + e2e
```

### New test coverage (seo.test.ts — 38 tests):

- Problem catalogue integrity (11 tests)
- Search functionality (7 tests)
- Sitemap consistency (2 tests)
- Private route protection (3 tests)
- Public page metadata (9 tests)
- Root layout metadata (2 tests)
- Structured data (1 test)
- Internal linking structure (1 test)
- Security: no private data leakage (2 tests)

## 13. Validation

```
typecheck:  PASS
lint:       PASS (1 pre-existing warning)
tests:      634/634 unit — 0 regressions
build:      PASS
```

## 14. Files changed

### New files (12)

| File                                | Purpose                     |
| ----------------------------------- | --------------------------- |
| `src/lib/problem-catalogue.ts`      | Shared problem data source  |
| `src/app/problemas/page.tsx`        | Problem index page          |
| `src/app/problemas/[slug]/page.tsx` | Dynamic problem landing     |
| `src/app/como-funciona/page.tsx`    | How it works page           |
| `src/app/fuentes/page.tsx`          | Sources page                |
| `src/app/autor/page.tsx`            | Author page                 |
| `src/app/case/layout.tsx`           | noindex for /case/*         |
| `src/app/casos/layout.tsx`          | noindex for /casos          |
| `src/app/problema-libre/layout.tsx` | noindex for /problema-libre |
| `tests/unit/seo/seo.test.ts`        | SEO/security/routing tests  |

### Modified files (6)

| File                           | Change                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `src/app/page.tsx`             | Added metadata, uses shared catalogue, added flight-cancel, added "Saber más" links |
| `src/app/layout.tsx`           | Added JSON-LD (Organization, WebSite), updated footer links                         |
| `src/app/sitemap.ts`           | Dynamic generation from catalogue, 13 URLs                                          |
| `src/app/robots.ts`            | Added /casos/ to disallow                                                           |
| `src/components/SearchBar.tsx` | Refactored to use shared catalogue                                                  |

## 15. Deferred items

- **FAQ schema** on individual problem landings (requires FAQ content per problem)
- **BreadcrumbList** JSON-LD (requires careful implementation with dynamic params)
- **Hreflang** tags (not needed until i18n is implemented)
- **Performance audit** with Lighthouse (requires running server)
- **Accessibility audit** with automated tools (manual review recommended)

## 16. Final status

```
APPROVED
```

All critical and high findings resolved. No regressions. Architecture is clean — single source of truth for problem data, no duplication, all pages have proper metadata and canonical URLs, private routes are protected.
