# Fase B.3 — Málaga como ciudad continua con bordes difuminados

Fecha: 2026-10-09. Estado: **los puntos 1 a 8 verificados** (ver
`docs/verification/city.md`); Málaga queda `available` en el manifiesto
(`malaga.publish.generated.ts`, 0 bloqueos), con los límites que se listan abajo.

## Qué se implementó
- Isla, losa, base y sombra eliminadas. Terreno continuo; zona = polígono convexo
  de la configuración + banda de 200 m que se mezcla con la niebla en el shader
  (sin transparencia). `src/lib/scene/{materials,city,polygon}.ts`.
- Edificios individuales (`bid` por vértice, geometría por zonas, BVH, hover con
  brillo + contorno, selección, Escape, táctil). Solo queda la ficha inferior
  izquierda (hoja arrastrable en móvil); sin etiquetas, leyenda ni pie. Icono «i»
  y `/atribuciones`.
- Cámara propia: zoom de 28 m a 3,6 km anclado al cursor o al edificio, órbita e
  inclinación con inercia, desplazamiento solo dentro del polígono y con zoom,
  cámara que sube sobre los tejados, giro de 105 s, retorno de 1,5 s a la vista
  inicial antes de reanudar, pausa por hover/selección, `prefers-reduced-motion`.
- Nubes (4 variantes, instanciadas, un material, tramado, bancos del perímetro) que
  se apartan del rayo cámara→foco.
- Árboles: capa nueva de OSM en el pipeline (`03b-trees.mjs`, paquete regenerado)
  + relleno determinista declarado «estimado»; 5 especies, LOD, culling, ocultos
  junto a la selección.
- Catedral con modelo GLB propio (`tools/build-landmark-glb.mjs`), alturas con
  fuente; Ayuntamiento y Palacio Episcopal como volúmenes simplificados.

## Fallos reales encontrados y corregidos
Edificios partidos entre teselas (la catedral perdía media huella); `earcut` con
vértices duplicados; búferes de nubes subidos cada fotograma; el atajo `Home`
cancelaba su propia animación; el evento de pérdida de contexto WebGL nunca
llegaba (no burbujea); los puntos de una tesela se descartaban por un filtro de
«≥ 2 vértices».

## Archivos
Nuevos: `src/lib/scene/{materials,trees,landmarks}.ts`, `BuildingPanel.tsx`,
`AttributionButton.tsx`, `CityViewer.tsx`, `app/atribuciones/page.tsx`,
`data-pipeline/steps/03b-trees.mjs`, `tools/*.mjs`, `public/models/malaga/catedral.glb`,
pruebas (`sky`, `tiles`, `landmarks`, `camera`, `config`, `polygon`).
Reescritos: `engine.ts`, `city.ts`, `camera.ts`, `sky.ts`, esquema y configuración.
Eliminados (sustituidos por lo pedido): leyenda, `structure.ts` (losa y roca).
Carpeta renombrada `lib/island` → `lib/scene`.

## Pruebas
`pnpm typecheck` limpio · 113 pruebas unitarias · 5 del pipeline · 37/37
comprobaciones en Chrome real (producción). `pnpm lint` no existe (eslint no está
instalado, deuda anterior).

## Mediciones
`docs/performance.md`: 4.700+ FPS sin vsync en GPU de sobremesa, 0,44 ms de CPU por
fotograma (antes 1,40), primer fotograma 1.123 ms (antes 1.032 ms con una ciudad
mucho menor), memoria estable 5 min.

## Limitaciones
- ≥ 30 fps en móvil real **no medido** (solo emulación CPU ×4).
- Sin mar (no hay polígono en OSM), terreno plano, Alcazaba/Teatro Romano/Gibralfaro
  sin polígono de edificio en los datos.
- Torre sur y reparto de cuerpos de la catedral estimados; fachada no modelada.
- 3.932 árboles estimados por regla; 55 alturas estimadas.
- No hay carga progresiva por zonas; no hay métrica automática de «sin borde duro».
- Licencia del Catastro sigue sin leerse literalmente.
