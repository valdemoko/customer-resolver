# Verificación de la ciudad continua (Fase B.3)

Navegador real: Chrome 154 (Playwright sobre el Chrome instalado), GPU AMD Radeon
RX 6600, build de **producción** (`pnpm build && pnpm start -p 3210`), 2026-10-09.
Script: `tools/verify-viewer.mjs` (37 comprobaciones; 37 pasan en la última
ejecución, ver `docs/verification/shots/verify-results.json`). Las capturas están
en `docs/verification/shots/`. Lo que no se puede reducir a una cifra se mira en
la captura y se dice aquí.

| # | Punto | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | No hay isla ni base; bordes difuminados sin vacío ni borde duro desde ningún ángulo permitido | **Cumple** (a ojo) | `borde-norte-bajo`, `borde-sur-bajo`, `borde-este-bajo`, `borde-oeste-bajo`, `cenital-lejos`, `esquina-cercana`, `esquina-cercana-b`, `galeria-1-inicio-fijo`. Lejos, la inclinación mínima sube a 20° y el horizonte no entra en plano; a esa distancia la ciudad queda en una bruma lisa con nubes: es el efecto pedido, pero se lee como «ciudad en la niebla», no como terreno continuo hasta el horizonte |
| 2 | Zoom profundo hasta casi nivel de calle, hacia el cursor, sin atravesar edificios | **Cumple** | 28 m de distancia; el edificio bajo el cursor sigue bajo el cursor tras 22 pasos de rueda; 24 órbitas a 5° de inclinación sin que la cámara baje de su altura mínima ni quede dentro de un edificio (`zoom-1-profundo`, `zoom-2-ras-de-suelo`) |
| 3 | Hover resalta el edificio completo; clic muestra solo la ficha inferior izquierda; sin etiquetas | **Cumple** | `hover-edificio`, `hover-detalle` (contorno blanco + brillo), `seleccion-detalle` (contorno de acento + brillo), `seleccion-edificio`. Cursor `pointer` en hover. Ficha en x=12, base de la pantalla. Recorrido del DOM: 0 textos visibles fuera de ficha y controles |
| 4 | Sin pie de fuentes, leyenda ni bloques de texto; «i» muestra las atribuciones | **Cumple** | `atribuciones-abiertas`; `/atribuciones` con el detalle |
| 5 | Giro lento, pausa al interactuar, retorno completo **antes** de reanudar, también desde muy ampliado | **Cumple** | Medido con muestreo cada 80 ms: sin giro durante la espera (deriva 0°), retorno de 1.392 ms (de 28 m a 2.300 m), giro después; tocar durante el retorno lo cancela sin salto; con edificio seleccionado, 8,5 s sin giro ni retorno |
| 6 | Catedral más alta y reconocible con alturas documentadas; árboles variados que no tapan la selección | **Cumple, con límites** | `galeria-3/4-catedral`, `catedral-comparativa`, `galeria-2-paseo-del-parque`. Ver `landmarks.md` (fachada no modelada, torre sur estimada). Árboles ocultos en un radio alrededor del edificio seleccionado |
| 7 | Nubes que nunca tapan la ciudad; móvil táctil, pellizco, hoja inferior; `prefers-reduced-motion` | **Cumple** | `sky.test.ts` (lo que se acerca al rayo cámara→foco queda por debajo de 0,25 de visibilidad); `movil-*`; reduced-motion: sin giro, sin retorno animado, «Vista inicial» salta, sin botón de pausa |
| 8 | Sin errores de consola; mediciones guardadas | **Cumple** | 0 errores en todas las secciones; `docs/performance.md`, `docs/verification/perf-run.json` |

## Límites que conviene leer

- **Presupuesto móvil**: ≥ 30 fps en un móvil de gama media **no está medido**. Hay
  una emulación (CPU ×4) en una GPU de sobremesa. Hace falta un móvil real.
- **Sin mar**: OpenStreetMap solo da el litoral como línea, fuera del área salvo la
  esquina sureste. No hay polígono de mar y no se inventa; el puerto se ve como
  terreno claro.
- **Terreno plano**: sin elevación con licencia verificada. Gibralfaro y la
  Alcazaba no están elevados (ni existen como edificios en los datos).
- **Alturas**: las de OpenStreetMap/Catastro son declaradas, derivadas o
  estimadas, y la ficha lo dice. 55 edificios son estimación.
- **Árboles**: 2.462 de OSM; 3.932 estimados por regla (parques, jardines y
  paseos con palmeras). Declarado como «estimado».
- **Carga por zonas**: las teselas se leen por cercanía al centro y la geometría
  se agrupa por zonas (22), pero la ciudad se construye entera antes del primer
  fotograma; no hay carga progresiva por zonas.
- **«Parcelas publicitarias»**: todavía no existe el catálogo (Fase D). Hoy la
  unidad es el edificio completo; el resaltado se distingue por contorno y brillo
  además de por color, no solo por tono.
- **Verificación visual**: los puntos 1 y 6 dependen de mirar las capturas; no hay
  una métrica automática de «sin borde duro».
