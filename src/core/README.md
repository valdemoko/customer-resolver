# core — Pure domain

Dominio puro de Resolveo: sin React, Next.js, base de datos, red ni SDKs.
Debe poder ejecutarse en Node puro (propiedad verificada por
`tests/unit/core/domain-independence.test.ts`).

## Contenido por fase

- Fase 0: `shared/` (money, dates — kernels compartidos deterministas).
- Fase 1+: `case/`, `workflow/`, `evidence/`, `rules/`, `result/`, `actions/`,
  `followup/`, `jurisdiction/` según `docs/ARCHITECTURE.md` §4.

## Reglas (impuestas por ESLint + test de boundaries)

- Nada de imports de `next`, `react`, `@server/*`, `@problems/*`, drivers de DB,
  SDKs de IA o storage.
- Sin `any` (ESLint: error). Sin `console` (usar logger solo en server/app).
- Todo aquí debe ser determinista y testable sin infraestructura.
