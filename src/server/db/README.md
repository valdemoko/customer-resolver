# server/db — Database module boundary (placeholder)

Fase 1 define e implementa el esquema completo (`schema.ts` + migraciones en `migrations/`).

Convenciones fijadas ya por la arquitectura (docs/ARCHITECTURE.md §5/§29):

- PostgreSQL (Neon) + Drizzle ORM.
- Schema en `src/server/db/schema.ts`; migraciones versionadas en `src/server/db/migrations/`.
- Drizzle Kit: `pnpm db:generate` / `pnpm db:migrate` (config en `drizzle.config.ts`).
- Los JSONB llevan schema Zod validado en código; nada de JSONB anárquico.
- Credenciales solo vía `DATABASE_URL` (ver `.env.example`).

Este directorio está deliberadamente vacío de código en Fase 0: no se inventan tablas.
