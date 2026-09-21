# Development Guide

Guía para que cualquier desarrollador clone, ejecute y contribuya en menos de 10 minutos.

## Requisitos

| Herramienta | Versión | Fijación                                                              |
| ----------- | ------- | --------------------------------------------------------------------- |
| Node        | 24 LTS  | `.nvmrc` (`nvm use`) + `engines` en `package.json`                    |
| pnpm        | 10.x    | `packageManager` en `package.json` (Corepack: `corepack enable pnpm`) |

## Setup

```bash
git clone <repo-url> resolveo
cd resolveo
nvm use
corepack enable pnpm
pnpm install
cp .env.example .env.local
pnpm dev
```

## Variables de entorno

- `.env.example` documenta **todas** las variables esperadas con placeholders (sin secretos).
- `.env.local` está en `.gitignore` — nunca se commitea.
- Validación en runtime: `src/lib/env.ts` (Zod). Server-only vs public está separado;
  nada sensible usa el prefijo `NEXT_PUBLIC_`.
- En Fase 0 solo `NEXT_PUBLIC_SITE_URL` es relevante; el resto se activa por fase
  (DB en Fase 1, R2 en Fase 5, claves de IA en Fase 6).

## Comandos

| Comando                             | Descripción                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                          | Dev server (Turbopack)                                       |
| `pnpm build` / `pnpm start`         | Build de producción / servirlo                               |
| `pnpm lint`                         | ESLint + boundaries arquitectónicas                          |
| `pnpm typecheck`                    | `tsc --noEmit` (strict)                                      |
| `pnpm test` / `pnpm test:watch`     | Vitest                                                       |     | `pnpm test:e2e` | Playwright (levanta su propio dev server en :3100) |
| `pnpm test:persistence`             | Tests de persistencia (PGlite, Postgres embebido en memoria) |
| `pnpm db:generate`                  | Genera migración Drizzle desde `schema.ts`                   |
| `pnpm db:migrate`                   | Aplica migraciones (requiere `DATABASE_URL`)                 |
| `pnpm format` / `pnpm format:check` | Prettier                                                     |

## Arquitectura básica

Fuente de verdad: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Resumen de capas:

```
app (composición, RSC, route handlers)
 → server (infraestructura: db, storage, auth, security)
   → domain (docintel, ai, sources)         [fases posteriores]
     → core (dominio puro, sin I/O)
problems (Problem Modules) → core + domain  [Fase 4+]
```

## Boundaries

Impuestas en dos niveles complementarios:

1. **ESLint** (`eslint-plugin-boundaries` + `no-restricted-imports`): falla en CI.
2. **Test filesystem scan** (`tests/unit/boundaries/architecture-boundaries.test.ts`):
   escanea imports prohibidos aunque alguien bypasee la config de ESLint.

Prohibiciones clave: `core` no importa React/Next/Drizzle/proveedores; `problems` no
importa infraestructura de servidor; `domain` no importa UI ni `app`.

## Testing

- **Unit** (`tests/unit/`): dominio puro (state machine, facts, contradicciones, snapshots) + propiedad de independencia del core.
- **Integración/persistencia** (`tests/integration/`): vertical slice completo contra Postgres embebido (PGlite, en memoria, con la migración SQL real). Sin Docker ni DB externa.
- **Boundaries**: test arquitectónico + reglas ESLint.
- **E2E** (`tests/e2e/`): smoke mínimo en Fase 0.
- Rule tests, contract tests de IA y regression jurídica llegan en fases 3–7.

## CI

`.github/workflows/ci.yml` en cada push/PR a `main`:

install → lint → format:check → typecheck → unit tests → build → E2E (chromium).

La CI es bloqueante: si falla cualquier paso, el PR no se mergea.

## Errores y logging (base)

- Errores tipados con código estable: `src/lib/errors.ts` (`AppError`,
  `DomainError`, `ValidationError`, `toUserSafeError` — nunca se filtran internals).
- Logging estructurado JSON con redacción de claves: `src/lib/logger.ts`
  (`createLogger(scope)`, `securityLog`). Prohibido `console.log` directo (ESLint).
- Audit events vivirán en tablas append-only de DB (no en logs) — Fase 1+.
