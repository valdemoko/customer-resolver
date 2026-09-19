# Phase 0 Report — Production-Grade Scaffold

**Fecha:** 2026-09-19 · **Estado:** completada · **Verificación:** todos los comandos ejecutados realmente (ver §Verification).

## Implemented

- Proyecto Next.js 15 (App Router, RSC) con TypeScript estricto y pnpm fijado.
- Estructura de carpetas según `ARCHITECTURE.md` §4 (`app/core/server/problems/docintel/ai/sources/lib`).
- Boundaries arquitectónicas en **dos niveles**: ESLint (`eslint-plugin-boundaries` + `no-restricted-imports`) y test de escaneo de imports.
- Homepage mínima accesible, `/health`, `robots.txt` con noindex fuera de producción, `sitemap.xml` placeholder, middleware de headers de seguridad.
- Base de env tipado con Zod (server-only vs public), logging estructurado con redacción de secretos, taxonomía de errores tipada.
- Kernels compartidos del core: `money` (minor units sin float) y `dates` (ISO calendar determinista).
- Vitest (13 tests), Playwright (2 E2E con servidor propio), CI de GitHub Actions completa.
- `drizzle.config.ts` y `src/server/db/` preparados **sin esquema** (Fase 1 decide las entidades).

## Files

Principales:

- Config: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.nvmrc`, `.gitignore`, `.env.example`
- App: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/health/route.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/middleware.ts`
- Lib: `src/lib/env.ts`, `src/lib/logger.ts`, `src/lib/errors.ts`
- Core: `src/core/shared/money.ts`, `src/core/shared/dates.ts` (+ READMEs de `core/` y `server/db/`)
- Tests: `tests/unit/core/shared/*.test.ts`, `tests/unit/core/domain-independence.test.ts`, `tests/unit/boundaries/architecture-boundaries.test.ts`, `tests/e2e/homepage.spec.ts`
- CI: `.github/workflows/ci.yml`
- Docs: `README.md`, `docs/DEVELOPMENT.md`, `docs/PHASE_0_REPORT.md`

## Dependencies

Producción: `next`, `react`, `react-dom`, `zod` (aprobados en arquitectura).

Desarrollo: `typescript`, `typescript-eslint`, `eslint`, `@next/eslint-plugin-next`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `prettier`, `vitest`, `@playwright/test`, `tailwindcss` (v3 + `postcss`/`autoprefixer`), `drizzle-kit`, `vite-tsconfig-paths`, tipos de React/Node.

**Nota sobre `eslint-config-next`:** eliminado por incompatibilidad real (parche rushstack roto con ESLint 9 en flat config; error `Failed to patch ESLint`). Sustituido por `@next/eslint-plugin-next` con sus presets `recommended` + `core-web-vitals`. No es un cambio de arquitectura: misma cobertura de reglas Next, sin el wrapper roto.

**Nota sobre Tailwind v3 (no v4):** v4 requiere su tooling own (`@tailwindcss/postcss`) y su import CSS específico; v3.4 LTS es equivalente para esta fase y estable con Next 15 en Windows. Revisión prevista en Fase 1 (no bloquea nada: el sistema de diseño llega en Fase 7).

## Architecture

- Dirección de dependencias impuesta: `app → server → domain → core ← problems` (lib compartida).
- `core` no importa framework, infraestructura ni proveedores (ESLint + test FS).
- `core` se ejecuta sin DOM/Next/React/DB/red — demostrado por `domain-independence.test.ts`.
- La prueba de boundaries se realizó con dos violaciones deliberadas (`core → @lib` fuera de lo permitido y `core → react` vía require): ambas fueron detectadas; los archivos se eliminaron y el repo quedó limpio.
- Único desvío menor documentado: `middleware.ts` vive en `src/` (requisito de Next) pero es framework-side, no domain.

## Tests

| Suite                  | Archivos                | Tests | Qué verifica                                                   |
| ---------------------- | ----------------------- | ----- | -------------------------------------------------------------- |
| Unit core              | money, dates            | 8     | determinismo, validación, sin drift decimal, fechas imposibles |
| Independencia del core | domain-independence     | 3     | core corre sin infra; errores user-safe sin filtrar internals  |
| Boundaries             | architecture-boundaries | 1     | ninguna capa importa direcciones prohibidas (escaneo FS)       |
| E2E                    | homepage                | 2     | homepage carga con heading esperado; `/health` responde        |

## CI

`.github/workflows/ci.yml` (push/PR a `main`): pnpm con cache → install `--frozen-lockfile` → **lint** (incluye boundaries) → **format:check** → **typecheck** → **unit tests** → **build** → **Playwright E2E** (chromium con deps). Artefacto de reporte E2E en fallo. Bloqueante: si falla cualquier paso, no se mergea.

## Security

- `.env*` en `.gitignore` (verificado antes del primer commit); `.env.example` solo placeholders, cero secretos.
- Env validada con Zod; nada sensible usa `NEXT_PUBLIC_`.
- Headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS en producción, `X-Robots-Tag: noindex` fuera de producción.
- Logging: JSON estructurado, redacción de claves por patrón, `no-console` impuesto por ESLint; prohibido loguear PII/contenido de documentos (convención documentada).
- Errores: `toUserSafeError` nunca expone internals (testeado).
- CSP estricta con nonces: diferida a Fase 7/Fase 10 junto con rate limiting y Turnstile (no hay auth ni uploads todavía — hardening proporcional).

## Deferred (y por qué)

- Todo lo prohibido por el prompt: motores de dominio, IA, OCR, auth, uploads, Problem Modules, SEO de producto, analytics, monetización.
- DB sin conectar (Fase 1), R2 sin cliente (Fase 5), IA sin SDK (Fase 6).
- Redis/rate limiting (Fase 6–10), Sentry (Fase 7), Turnstile (DEFER según stress test).

## Verification

Resultados reales (Windows, Node 24.14.1, pnpm 10.17.0):

| Comando             | Resultado                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm lint`         | ✅ 0 errores (tras 2 violaciones deliberadas detectadas y eliminadas)                                  |
| `pnpm format:check` | ✅ All matched files use Prettier code style!                                                          |
| `pnpm typecheck`    | ✅ sin errores                                                                                         |
| `pnpm test`         | ✅ 4 archivos, 13 tests pasados                                                                        |
| `pnpm build`        | ✅ producción OK — 5 rutas (/, /_not-found, /health, /robots.txt, /sitemap.xml), First Load JS ~103 kB |
| `pnpm test:e2e`     | ✅ 2 E2E pasados (chromium, servidor propio :3100)                                                     |

## Known Issues

1. **Advertencia de Next dev server** durante E2E: `Cross origin request detected from 127.0.0.1 to /_next/*` — inofensiva en esta fase; se añadirá `allowedDevOrigins` cuando haya deploys de preview reales.
2. **Tailwind v3 vs v4**: decisión consciente, revisión en Fase 1 (ver Dependencies).
3. **Windows/CI**: verificado localmente en Windows; la CI de GitHub Actions corre en `ubuntu-latest` — primer push validará el matiz POSIX (no se prevé divergencia: rutas con `node:path` en todo el código).
4. Playwright `install --with-deps` en CI requiere permisos de sistema en el runner de GitHub — es el flujo estándar soportado por la action.

## Acceptance Criteria

Code: Next.js OK · TS strict OK · sin `any` (regla ESLint + revisión) · estructura según arquitectura · boundaries activas y probadas.
Quality: ESLint ✅ · Prettier ✅ · typecheck ✅.
Testing: Vitest ✅ · test significativo (independencia del core + boundaries) ✅ · Playwright ✅ · E2E ✅.
Build: producción ✅.
CI: Actions configurado con lint/typecheck/tests/build/E2E ✅.
Security: secrets ignorados ✅ · `.env.example` ✅ · sin secretos ✅ · sin credenciales en Git ✅.
Documentation: README ✅ · DEVELOPMENT.md ✅ · este informe ✅.
Scope: sin Problem Modules, sin IA, sin OCR, sin auth, sin producto final ✅.
