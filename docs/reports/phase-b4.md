# Informe Fase B.4

Resumen, archivos y mediciones en `docs/decisions.md` (sección B.4), `docs/verification/port.md`, `docs/verification/water.md`, `docs/verification/landmarks.md` y `docs/performance.md`.

**Nuevo:** `data-pipeline/lib/surface.mjs`, `steps/03c-surface.mjs` (agua y superficies disjuntas), `03d-fortress.mjs`, `03e-berths.mjs`, `03f-parcels.mjs`, `test/b4.test.mjs`; `src/lib/scene/{ground,water,fortress,parcels,ships}.ts` (+ tests); `components/viewer/{PanelShell,ParcelPanel}.tsx`; `tools/{capture-views,render-data,port-overlay,diagnose-zfighting,verify-port,compose-shots,restart-prod}`.
**Modificado:** esquema y configuración de la ciudad (círculo, exageración, agua, locales, barcos, fortalezas), `engine.ts`, `city.ts`, `tiles.ts`, `materials.ts`, `camera.ts`, `trees.ts`, `sky.ts`, pipeline (01, 02, 03, 04), `CityViewer`, `BuildingPanel`.
