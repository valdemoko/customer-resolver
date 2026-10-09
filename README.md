# Alzado

Plataforma de publicidad en ciudades 3D. El usuario explora ciudades reales en un
mapa tridimensional y elige la fachada donde anunciarse.

**Estado: fase A terminada.** El catálogo funciona. El visor 3D, la base de
datos, la autenticación y los pagos no están implementados todavía. El detalle
exacto de lo que hay y de lo que no, en
[docs/reports/phase-a.md](docs/reports/phase-a.md).

---

## Arrancar

```bash
pnpm install
cp .env.example .env.local   # opcional en desarrollo
pnpm dev                     # http://localhost:3000
```

Sin `.env.local` el proyecto funciona: `APP_ORIGIN` tiene un valor por defecto de
desarrollo. En producción sí es obligatorio para las rutas sensibles.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compilación de producción |
| `pnpm start` | Sirve la compilación |
| `pnpm typecheck` | TypeScript en modo estricto, sin emitir |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm lint` | ESLint |

## Estructura

```
src/
  app/                  rutas (App Router)
    page.tsx            portada = catálogo
    city/[slug]/        ficha de ciudad
    design/             taller de diseño (solo desarrollo)
    legal/[slug]/       borradores legales marcados
  components/
    brand/              wordmark
    catalog/            tarjeta, miniatura, catálogo
    layout/             barra superior, buscador
    ui/                 botones, estados vacíos, esqueletos, píldoras de estado
  lib/
    cities/             esquema, registro y datos por ciudad
    money.ts            precios en céntimos con enteros
    legal.ts            borradores legales
  stores/               estado de interfaz (Zustand)
data-pipeline/          (pendiente) generación reproducible de datos por ciudad
docs/
  decisions.md          registro de decisiones con motivo, coste y licencia
  reports/              informes por fase
```

## Añadir una ciudad

1. Crea `src/lib/cities/data/<slug>.ts` con la configuración.
2. Añádela al array de `src/lib/cities/registry.ts`.

No hay que tocar el motor. La configuración se valida con Zod **al importar**:
si promete algo imposible —por ejemplo, marcar una ciudad como disponible sin
paquete de datos publicado— la compilación falla. Es deliberado.

## Reglas del proyecto

Recogidas en [docs/decisions.md](docs/decisions.md):

- Ningún dato ficticio en la interfaz. Si un dato no existe, se omite o se
  muestra un estado vacío diseñado.
- Nada de imágenes de stock: las miniaturas son renders de la propia escena.
- Nada de afirmar «optimizado» sin números medidos.
- El dinero siempre en enteros de céntimos.
- Ninguna fuente de datos sin su licencia y su atribución documentadas.
- No existe ningún modo de compra simulado que aparente una compra real.

## Atribución

Los datos geográficos de las ciudades son de sus respectivas fuentes y se
atribuyen en la propia interfaz, en el mapa y en la ficha de cada ciudad. Ver la
tabla completa de fuentes y licencias en
[docs/decisions.md](docs/decisions.md#fuentes-de-datos-geográficos).


## Visor 3D de la ciudad (Fase B.3)

Escena Three.js en `src/lib/scene/` (ciudad continua con bordes difuminados; ver
`docs/decisions.md`). Herramientas de verificación, que usan el Chrome instalado
(`playwright-core`, sin descargar navegadores):

| Comando | Qué hace |
| --- | --- |
| `node tools/verify-viewer.mjs --url http://localhost:3210` | Comprobaciones de comportamiento y capturas en `docs/verification/shots/` |
| `node tools/measure-perf.mjs --url http://localhost:3210 [--long]` | FPS sin vsync, coste por fotograma, carga en frío, móvil emulado y memoria a 5 min |
| `node tools/measure-catalog.mjs --url http://localhost:3210` | LCP, CLS y peso del catálogo |
| `node tools/build-landmark-glb.mjs` | Regenera el modelo GLB de la catedral |
| `node tools/landmark-overlay.mjs` | Superpone la huella sobre la ortofoto PNOA |

Se miden sobre `pnpm build && pnpm start -p 3210`, nunca sobre `pnpm dev`.

## Compras y Stripe

Las compras están apagadas por defecto («Compras próximamente»); no hay modo simulado. Para encenderlas hacen falta `PURCHASES_ENABLED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL` (Neon) y `APP_ORIGIN`, siempre como secretos del entorno y nunca en el repositorio. El webhook de Stripe es `POST /api/market/webhook` (evento `checkout.session.completed`). Detalle y decisiones en `docs/decisions.md` (Fase C). Comprobaciones del navegador: `node tools/verify-market.mjs` y `node tools/verify-studio.mjs`.
