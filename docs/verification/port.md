# Verificación de la Fase B.4

Navegador real (Chrome 154, GPU AMD RX 6600) sobre el build de producción, con `tools/verify-port.mjs` (comprobaciones con cifra) y `tools/verify-viewer.mjs` (regresión de la B.3). Capturas en `docs/verification/shots/port/`. Fecha: 2026-10-09.

| # | Requisito | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Zona circular perfecta, difuminado radial, sin esquinas | **Cumple** | Polígono de cámara de 128 lados sobre R = 1.400 m; silueta vista desde arriba: radio medio 370 px, desviación 3,6 % (efecto de perspectiva) en 60 direcciones; `circulo-cenital.png`, `circulo-borde-az*.png`. Test de pipeline: ningún vértice de suelo/agua/tierra pasa del recorte (1.710 m) y ningún edificio queda partido. |
| 2 | Agua real, sin parpadeo | **Cumple** | 1 mar + 59 masas menores con un solo material, paredes de muelle (1.338 segmentos), campo de costa 126 ms. Lista: `docs/verification/water.md`. |
| 3 | Césped sin solapes ni texturas que «bugueen» | **Cumple** | Solape coplanar 88.898 m² (B.3) → 18,2 m² (B.4). Ruido en zonas planas entre fotogramas (5 zonas × 4 zooms/ángulos, tiempo congelado): peor caso 0,26 %. Antes/después: `antes-*.png` / `despues-*.png`. |
| 4 | Exageración ×1,25 con altura real en la ficha | **Cumple** | 400/400 edificios a ×1,25; catedral 84 m → dibujada 105 m, ficha «84,0 m» y «×1,25 (solo visual)». |
| 5 | Alcazaba mejorada y documentada | **Cumple con límites** | 27 lienzos (2,4 km), 10 torres, 3 puertas, 12 edificios interiores; Gibralfaro 30 lienzos, 4 torres. Alturas estimadas (declarado); terreno plano. `landmarks.md`. |
| 6 | Muelle Uno completo, con agua y atraques | **Cumple** | Superposición con ortofoto PNOA: distancia a la orilla visible, mediana 1,19 m, p90 7,9 m, 10 puntos de control (`muelle-uno-contraste.json`, `muelle-uno-superposicion.png`). Peor punto: 14,4 m sobre la playa abierta (la línea de costa de OSM en una playa es aproximada). |
| 7 | Locales divididos y seleccionables, sin marcas ni etiquetas | **Cumple** | 5.184 parcelas (1.171 OSM, 4.013 estimadas, 0 catastrales). Hover y clic verificados en 3 parcelas (OSM y estimada; Larios y Muelle Uno); el nombre de un negocio solo sale en la ficha; 0 etiquetas flotantes. |
| 8 | Cruceros y barcos bien situados | **Cumple** | 3 cruceros (330, 215, 180 m) con el casco 100 % en el agua y ≥ 3 m del muelle; 90 barcos pequeños solo sobre agua; no entran en selección ni hover. |
| 9 | Sin errores de consola; móvil y reduced-motion | **Cumple** | 0 errores en todas las secciones; móvil emulado: 30 barcos máx. y fps estables; con `prefers-reduced-motion` el tiempo de la escena (oleaje, nubes, barcos) está parado. |

Regresión B.3: 37/37 comprobaciones superadas. Pruebas: 144 unitarias + 21 de pipeline (16 geométricas sobre los artefactos reales).

## Límites

- Sin relieve: la Alcazaba y Gibralfaro están sobre suelo plano.
- Alturas de murallas y torres: estimaciones (la Torre Mayor, 17 m, tiene fuente).
- Locales: no hay datos de unidades catastrales con geometría; las parcelas estimadas son una hipótesis geométrica.
- Rendimiento en móvil real y carga inicial en móvil emulado (10–14 s) **sin cumplir** el presupuesto de 6 s.
- La sesión de memoria de 5 min no se repitió en B.4.
