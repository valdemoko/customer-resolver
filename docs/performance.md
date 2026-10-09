# Rendimiento medido

Mediciones reales sobre un **build de producción** (`pnpm build` + `next start`),
no sobre el servidor de desarrollo. Todas las cifras salen del propio navegador
—`performance` y el informe de recursos de Chrome— y no de una estimación ni de
un Lighthouse puntual con la caché caliente. Cuando una cifra no se ha podido
medir, se dice; no se rellena con un valor razonable.

Medido: 2026-10-09 · Build: Next.js 16.4.0 (Turbopack) · Paquete de datos
`2026.10.1` (1,65 MB con la capa de arbolado, 3.836 edificios en el paquete) · Servidor: `next start -p 3210` en la
misma máquina que el navegador (Windows, Chrome, red local).

**Advertencia de contexto:** las mediciones son en `localhost`, sin latencia de
red ni CDN. Sirven para comparar cambios entre sí y para detectar problemas
graves, **no** para predecir el tiempo de carga de un usuario real con 4G. El
peso de los recursos (bytes) sí es representativo; los tiempos no.

---

## Catálogo (`/`)

| Métrica | Valor | Presupuesto |
| --- | --- | --- |
| LCP (carga inicial) | **272 ms** | ≤ 2.500 ms |
| LCP (recarga) | 68 ms | ≤ 2.500 ms |
| CLS | **0** (0 desplazamientos registrados) | ≤ 0,1 |
| TTFB | 19 ms / 17 ms | — |
| DOMContentLoaded | 117 ms | — |
| `load` | 171 ms / 377 ms | — |
| HTML | 9.102 B | — |
| JavaScript inicial (codificado) | **205.294 B** en 11 archivos | — |
| JavaScript inicial (transferido) | 208.594 B | — |
| Peticiones totales | 38 | — |
| Peticiones a terceros | **0** | 0 |

Dos lecturas, la primera con la caché vacía y la segunda tras recargar. El LCP
varía entre 209 y 424 ms y esa variación es normal en local: la primera lectura
aprovecha que el servidor ya tiene todo en memoria. El elemento LCP es un párrafo
de texto (el título y la entradilla), no una imagen: la miniatura de ciudad es un
SVG en línea, no un archivo que descargar.

**Cero peticiones a terceros** en el catálogo: fuentes, estilos y scripts se
sirven desde el propio origen. Es una decisión, no un accidente, y es la que hace
que la página no dependa de que un CDN ajeno responda.

CLS 0 no es suerte: la miniatura ocupa un `aspect-[4/3]` declarado, así que el
espacio está reservado antes de que se pinte nada.

---

## Visor de Málaga (`/city/malaga/viewer`) — Fase B.3

Escena Three.js: ciudad continua con bordes difuminados. Medido el 2026-10-09 con
`tools/measure-perf.mjs` sobre `next start` (producción) en **Chrome 154 con la GPU
de la máquina (AMD Radeon RX 6600, ANGLE D3D11)**, 1440×900, `localhost`. Los
fotogramas por segundo se miden **sin límite de vsync** (`--disable-gpu-vsync
--disable-frame-rate-limit`): con límite, la máquina marca siempre los 180 Hz del
monitor y no se distingue nada. El coste por fotograma es CPU dentro del bucle
(actualización + llamada a `render`), en ms.

### Antes y después

«Antes» es el visor de la isla flotante (Fase B.2), medido el mismo día, en
producción y sin límite de vsync (`docs/verification/baseline/uncapped.json`).

| | Antes (isla) | Ahora (ciudad continua) |
| --- | --- | --- |
| FPS medios / p5 (vista inicial) | 713 / 556 | 4,733 / 256 | 
| Coste por fotograma (CPU) | ~1,40 ms (derivado de los FPS) | 0.44 ms |
| Llamadas de dibujo | 22 | 58 |
| Triángulos | 374.470 | 497,715 |
| Primer fotograma | 1.032 ms | 1,123 ms (mediana de 3 cargas en frío) |
| Edificios | 2.175 (recorte circular) | 3.791 (zona completa) |
| Árboles dibujables | 738 | 6,394 (2.462 de OSM + 3.932 estimados) |

La ciudad ahora es **más grande** (3.791 edificios frente a 2.175, sin recorte
circular) y tiene 8 veces más árboles, y aun así el coste por fotograma baja.
Los p5 no son comparables entre sí con fiabilidad a miles de FPS: a esas
frecuencias un solo parón del navegador domina el percentil. Sirven los ms por
fotograma.

Los números de FPS de aquí son **de una GPU de sobremesa**: demuestran que el
presupuesto de 60 fps en escritorio se cumple con mucho margen, no que un portátil
modesto vaya igual.

### Coste de las nubes

| Variante | Coste CPU por fotograma |
| --- | --- |
| Nubes nuevas, actualizando búferes cada fotograma (primera versión) | +0,4 a +1,1 ms sobre «sin nubes» (más que las otras 54 llamadas juntas) |
| Nubes nuevas, a 20 Hz (versión final) | 0.44 ms frente a 0.44 ms sin nubes: **indistinguible** |

**No se midió el coste aislado de las nubes antiguas**: el motor anterior no tenía
interruptor y su código ya no existe. Lo que sí está medido es el fotograma
completo antiguo (arriba). Las nubes actuales son 4 mallas instanciadas de 40 a
100 triángulos, un solo material y sin transparencia; la variante más simple se
usa para las lejanas.

### Escenarios (producción, sin vsync)

| Escenario | FPS medios | FPS p5 | CPU/fotograma (ms) | Llamadas | Triángulos |
| --- | --- | --- | --- | --- | --- |
| vista inicial (todo activo) | 4.733 | 256 | 0.44 | 58 | 497.715 |
| vista inicial · sin nubes | 5.381 | 238 | 0.44 | 54 | 495.355 |
| vista inicial · sin árboles | 5.214 | 263 | 0.43 | 58 | 435.395 |
| Paseo del Parque (zoom medio. muchos árboles) | 5.584 | 526 | 0.22 | 33 | 272.022 |
| calle (zoom máximo) | 5.964 | 385 | 0.29 | 30 | 267.106 |

«Sin árboles» deja 309 dibujados (el 10 % del presupuesto) y baja 62.000
triángulos; el coste de CPU casi no cambia porque los árboles son hasta 10 llamadas
instanciadas: el coste está en la GPU, no en el número de objetos.

### Carga

| Métrica | Valor |
| --- | --- |
| Primer fotograma, escritorio (mediana de 3 cargas en frío) | **1,123 ms** (presupuesto < 4.000) |
| Primer fotograma, móvil emulado (CPU ×4, 390×780 a 2×) | **4,069 ms** (presupuesto < 6.000) — *emulación, no un móvil* |
| JavaScript del visor | 407,900 B en 14 archivos |
| Paquete PMTiles | 597,606 B (1,67 MB en disco; se descargan solo las teselas leídas) |
| Modelo GLB de la catedral | 9,336 B |
| Peticiones a terceros | 0 |
| Decodificación de teselas | 390 ms (66 teselas) |

Móvil emulado, en régimen: 816 FPS medios y 385 de p5 con el
reloj de CPU limitado ×4 — pero con la GPU de sobremesa. **El objetivo de ≥ 30 fps
en un móvil de gama media NO está medido**: no hay un móvil real en este entorno.
Lo que está medido es que la parte de CPU cabe con holgura (≈ 0.55 ms por
fotograma incluso con ×4), y que la calidad adaptativa existe (baja el
`pixelRatio`, apaga sombras y reduce nubes y árboles si los FPS bajan de forma
sostenida durante tres ventanas seguidas).

### Memoria tras 5 minutos

Sesión de 310 s con auto-rotación, movimiento del ratón y zoom cada 30 s,
leyendo el heap de JS cada 10 s (31 lecturas):

- Heap de JS: entre **53.2 y 78 MB**, sin tendencia (es un diente de sierra de
  recolección de basura: primera lectura 75.7 MB, última 75.1 MB).
- Geometrías en la GPU: **42 durante toda la sesión**; texturas 2; programas 7.
- FPS sostenidos 4.000–5.300 sin vsync.
- Sin errores de consola.

Entrar y salir 10 veces (`tools/verify-viewer.mjs`, sección `leaks`), con
recolección forzada: heap 63 → 55 MB, geometrías 41 → 41, texturas 2 → 2, un solo
motor vivo.

### Fallos de rendimiento y de corrección que se encontraron midiendo

1. Subir los búferes de las nubes cada fotograma (ver arriba).
2. La calidad adaptativa del visor anterior comparaba un **tiempo** con un
   umbral de **FPS** (ya corregido en B.2; se mantiene la corrección).
3. `earcut` con vértices duplicados deja tejados a medias (ver
   `docs/decisions.md`).

---

## Presupuesto de datos

| Concepto | Real | Presupuesto |
| --- | --- | --- |
| Paquete PMTiles | 1,57 MB | 12 MB |
| Edificios | 3.836 | — |
| Teselas | 148 (13: 3 · 14: 7 · 15: 15 · 16: 32 · 17: 91) | — |

El paquete bajó de 2,19 MB a 1,57 MB al dejar de publicar las 8.981 secciones de
edificio como volúmenes independientes. Menos bytes y menos polígonos que
extruir, con la misma cobertura.

---

## Reproducir estas mediciones

```bash
pnpm build
pnpm start -- -p 3210
# el servidor debe responder antes de medir
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3210/
```

Y en el navegador, sobre `/` y `/city/malaga/viewer`, leer
`performance.getEntriesByType('resource')` para el peso y
`[data-first-frame-ms]` para la primera vista útil.


---

## Visor de Málaga — Fase B.4 (círculo, agua, puerto, locales, barcos)

Medido el 2026-10-09 con `tools/measure-perf.mjs` sobre `next start` (producción), Chrome 154, GPU AMD Radeon RX 6600 (ANGLE D3D11), 1440×900, `localhost`, sin límite de vsync. **Cada escenario se mide 3 veces y se publica la mediana** (las lecturas sueltas variaron hasta 3× por carga de la máquina). Datos: paquete `2026.10.1`, 5,371 edificios, 5,184 parcelas, 176 fragmentos de agua, 3 cruceros, 90 barcos pequeños. Bruto en `docs/verification/perf-run.json` (B.3 conservada en `perf-run-b3.json`).

| Escenario | FPS medios | FPS p5 | CPU/fotograma (ms) | Llamadas | Triángulos |
| --- | --- | --- | --- | --- | --- |
| vista inicial (todo activo) | 1.156 | 476 | 0.72 | 100 | 742.701 |
| vista inicial · sin nubes | 1.240 | 385 | 0.83 | 96 | 740.341 |
| vista inicial · sin árboles | 1.310 | 625 | 0.68 | 95 | 734.493 |
| Paseo del Parque (zoom medio. muchos árboles) | 1.153 | 667 | 0.62 | 63 | 489.048 |
| calle (zoom máximo) | 1.747 | 714 | 0.45 | 51 | 389.205 |
| puerto: dársena. agua y cruceros (zoom medio) | 1.293 | 667 | 0.60 | 50 | 281.715 |
| puerto · sin barcos pequeños | 1.419 | 769 | 0.55 | 48 | 276.357 |
| Muelle Uno (locales de planta baja a 60 m) | 2.007 | 909 | 0.36 | 41 | 261.207 |
| Alcazaba (murallas. torres y almenas) | 1.135 | 588 | 0.71 | 62 | 572.140 |

### B.3 → B.4 (vista inicial)

| | B.3 | B.4 |
| --- | --- | --- |
| CPU por fotograma | 0.44 ms | 0.72 ms |
| FPS medios / p5 | 4,733 / 256 | 1,156 / 476 |
| Llamadas de dibujo | 58 | 100 |
| Triángulos | 497,715 | 742,701 |
| Primer fotograma, escritorio (mediana de 5 cargas en frío: [2567, 2605, 2688, 2696, 2989]) | 1.123 ms | **2,688 ms** (presupuesto 4.000) |
| Primer fotograma, móvil emulado (CPU ×4) | 4.069 ms | **14,303 ms** (presupuesto 6.000 — **NO se cumple**) |
| JavaScript del visor | 407.900 B | 419,211 B |
| Paquete PMTiles | 597.606 B | 1,737,205 B (3,2 MB en disco) |
| Zona | rectángulo 3,7 km² | círculo 6,2 km² |

El coste por fotograma sube (más ciudad: 5.371 edificios frente a 3.791, agua con shader propio, 14 mallas de suelo, parcelas y barcos) pero sigue en **< 1 ms de CPU** y cientos de FPS sin vsync: el presupuesto de 60 fps en escritorio se cumple con holgura. Los barcos pequeños cuestan ≈ 0,05–0,15 ms. Móvil emulado: 176 FPS (p5 137) con la GPU de sobremesa; **el objetivo de ≥ 30 fps en un móvil real sigue sin medirse** (no hay uno).

**Regresión declarada:** la carga inicial empeora (círculo 2,6× más grande; 12.700 polígonos de suelo; 5.200 parcelas). Reparto en escritorio: teselas 0,7 s · edificios 0,4 s · suelo 0,15 s · agua 0,12 s · barcos y selección 0,2 s · primer dibujo 0,4 s. Ya recortado: decodificación afín (−30 %), margen en teselas de edificios (unión 321 → 69 ms), triangulado único del tejado. Pendiente (no hecho): Web Worker para decodificar, teselas de zoom 16, BVH diferido.

Memoria: 73 geometrías, 3 texturas, 13 programas en la GPU. La sesión larga de 5 minutos **no se ha vuelto a medir** en B.4 (la de B.3 dio 53–78 MB sin tendencia).
