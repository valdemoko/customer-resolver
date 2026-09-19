# Consumer Resolver

> **Consumer Problem Resolution Engine** — convierte "me ha pasado esto" en un caso
> estructurado: datos, evidencia, reglas deterministas, fuentes verificables y acciones
> concretas. No es un chatbot: la IA es una herramienta interna, no el producto.

**Estado actual:** Fase 0 (scaffold de producción). Los motores de dominio (Case,
Evidence, Rules, Document Intelligence, AI orchestration) se implementan en fases
posteriores. Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) y
[`docs/STRESS_TEST.md`](docs/STRESS_TEST.md).

## Stack

- **Next.js 15** (App Router, RSC) + **TypeScript estricto**
- **Tailwind CSS** + (Radix/react-aria en fases posteriores)
- **Zod** para validación (env, contratos, entrada de API)
- **PostgreSQL + Drizzle** (preparado; se conecta en Fase 1)
- **Vitest** + **Playwright** · **ESLint** con boundaries arquitectónicas · **Prettier**
- **pnpm** como package manager · Node 24 LTS

## Requisitos

- Node 24 (ver `.nvmrc`; usa `nvm use`)
- pnpm 10 (Corepack: `corepack enable pnpm`)

## Instalación

```bash
pnpm install
cp .env.example .env.local   # placeholders; no hay secretos reales en el repo
pnpm dev                     # http://localhost:3000
```

## Comandos

| Comando             | Descripción                                 |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | Servidor de desarrollo                      |
| `pnpm build`        | Build de producción                         |
| `pnpm start`        | Sirve el build de producción                |
| `pnpm lint`         | ESLint (incluye boundaries arquitectónicas) |
| `pnpm typecheck`    | TypeScript estricto, sin emitir             |
| `pnpm test`         | Tests unitarios/integración (Vitest)        |
| `pnpm test:watch`   | Tests en modo watch                         |
| `pnpm test:e2e`     | Tests E2E (Playwright)                      |
| `pnpm format`       | Formatea todo (Prettier)                    |
| `pnpm format:check` | Verifica el formato                         |

## Estructura

```
docs/            Arquitectura, stress test, guías de desarrollo
src/
  app/           App Router (páginas, route handlers) — capa de composición
  core/          Dominio puro: sin React/Next/DB/red. Testeable aislado
  problems/      Problem Modules (Fase 4+) — no modifican el core
  server/        Infraestructura: db, storage, auth (por fases)
  lib/           env (Zod), logging, errores — base compartida
tests/
  unit/          Unit + tests arquitectónicos (boundaries, independencia del core)
  e2e/           Playwright (smoke en Fase 0)
```

**Regla de dependencias** (impuesta por ESLint + test): `app → server → domain → core ← problems`.
El core nunca importa frameworks, infraestructura ni proveedores.

## Testing

```bash
pnpm test        # unit + integración (incluye tests de boundaries)
pnpm test:e2e    # E2E con servidor propio en :3100
```

## Contribuir

1. Crea una rama desde `main`.
2. `pnpm lint && pnpm typecheck && pnpm test` deben pasar antes del PR.
3. CI ejecuta lint, format, typecheck, tests, build y E2E en cada PR.
4. Los cambios de arquitectura se documentan en `docs/ARCHITECTURE.md`
   (sección _Architecture Decision Changes_).

No se aceptan secretos en el repositorio. Todas las claves viven en variables de
entorno de servidor (ver `.env.example`).
