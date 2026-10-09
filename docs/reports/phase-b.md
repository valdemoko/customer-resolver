# Informe — Fase B: datos reales, visor y publicación de Málaga

Fecha: 2026-10-09 · Estado: **completa, con limitaciones declaradas** (sección 6)

Málaga está publicada (`available`) y la decisión **no** la ha tomado una persona
escribiendo `available` en un archivo: la ha tomado el paso 06 del pipeline
leyendo la evidencia real de disco (teselas verificadas, verificación geográfica
y mediciones de rendimiento). Si esa evidencia desaparece, la ciudad vuelve a
`in_preparation` sola.

---

## 1. Qué se ha implementado

### Pipeline de datos reproducible (`data-pipeline/`, Node, sin Java ni Docker)

| Archivo | Contenido |
| --- | --- |
| `data-pipeline/run.mjs` | Orquestador por pasos (`osm`, `catastro`, `layers`, `tiles`, `verify`, `publish`, `all`). |
| `data-pipeline/steps/01-osm.mjs` | Consulta Overpass del área declarada en el contrato geográfico. |
| `data-pipeline/steps/02-catastro.mjs` | WFS INSPIRE del Catastro por celdas, con subdivisión cuando la petición es demasiado grande. |
| `data-pipeline/steps/03-layers.mjs` | Fusión de fuentes, resolución y **etiquetado del origen de cada altura**, control de calidad. |
| `data-pipeline/steps/04-tiles.mjs` | Teselado (`geojson-vt` + `vt-pbf`), escritura PMTiles, verificación del paquete y módulo generado para la app. |
| `data-pipeline/steps/05-verify.mjs` | Verificación de fidelidad (10 puntos independientes) y contraste de alturas; genera el SVG de evidencia. |
| `data-pipeline/steps/06-publish.mjs` | Decide `available` / `in_preparation` con la evidencia en la mano y escribe el módulo de publicación. |
| `data-pipeline/lib/pmtiles-writer.mjs` | Escritor propio de PMTiles v3 (el paquete público trae lector, no escritor). |
| `data-pipeline/lib/pmtiles-source.mjs` | Fuente local para el lector oficial. |
| `data-pipeline/lib/mvt-read.mjs` | Decodificador MVT mínimo, para poder releer lo escrito. |
| `data-pipeline/lib/http.mjs` | Peticiones con reintentos, espera creciente y `User-Agent` identificativo. |
| `data-pipeline/lib/geo.mjs`, `lib/city.mjs`, `lib/log.mjs` | Geometría, contrato de ciudad y registro de pasos. |
| `data-pipeline/test/pmtiles.test.mjs` | **Test automático** del paquete publicado y del escritor, contra el lector oficial. |

### Aplicación

| Archivo | Contenido |
| --- | --- |
| `src/components/viewer/CityViewer.tsx` | Visor MapLibre: fases de carga reales, selección de edificio con su origen de altura, leyenda, controles, atribución completa. |
| `src/components/viewer/CityViewerLoader.tsx` | Import diferido en componente de cliente (`ssr: false` no es válido en un Server Component desde Next 16). |
| `src/components/viewer/mapStyle.ts` | Estilo construido en código: suelo acotado (la isla), sin capa `background`, rampa de color por altura y gris para lo estimado. |
| `src/app/city/[slug]/viewer/page.tsx` | Página del visor (solo si la ciudad está abierta). |
| `src/lib/cities/heights.ts` | Traduce `height_source` a «declarado / derivado / estimación». Única interpretación, compartida por visor y ficha. |
| `src/lib/bytes.ts`, `bytes.test.ts` | Formato de tamaños en español (el punto decimal inglés se colaba en la ficha). |
| `src/lib/cities/data/malaga.generated.ts`, `malaga.publish.generated.ts` | Escritos por los pasos 04 y 06. No se editan a mano. |
| `src/data/cities/malaga.geo.json` | Contrato geográfico único (mismo archivo para app y pipeline), incluida la vista inicial. |
| `tools/sync-maplibre-worker.mjs` | Copia el worker de MapLibre desde `node_modules` en cada build. |
| `next.config.ts` | Reescritura del worker a la ruta exacta que pide la librería, más cabeceras de seguridad. |
| `package.json` | `test` ejecuta ahora las pruebas unitarias **y** la del paquete: `pnpm run test:unit && pnpm run test:pipeline`. |

---

## 2. Pruebas ejecutadas

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Tipos | `pnpm exec tsc --noEmit` | **0 errores** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). |
| Pruebas unitarias | `pnpm run test:unit` | **41/41 en verde** (20 de dinero, 12 del esquema, 5 de alturas, 4 de formato de tamaños). |
| Test del paquete PMTiles | `pnpm run test:pipeline` | **5/5 en verde** contra el paquete real publicado. |
| Compilación de producción | `pnpm build` | Correcta: 13 rutas generadas. |
| Escritura PMTiles | `node run.mjs tiles` | 148 teselas, 1,57 MB, `sha256` estable. |
| Verificación geográfica | `node run.mjs verify` | 10/10 puntos con coordenada independiente. |
| Decisión de publicación | `node run.mjs publish` | `available`, sin bloqueos. |

### El test del paquete, en detalle

`data-pipeline/test/pmtiles.test.mjs` no comprueba que el archivo exista: lee el
paquete publicado y, para **cada una de las 148 teselas direccionadas**,
comprueba que el `TileID` es el que calcula el lector oficial (`tileIdToZxy` y
`zxyToTileId`), que el escritor propio numera igual que el estándar, que el
lector oficial relee la tesela y que esos bytes son idénticos al tramo que
declara el directorio (valida `offset` y `length`), y que el contenido es un MVT
decodificable con capas y elementos. Además comprueba que una tesela ausente
dentro del área no devuelve datos de una vecina, que la suma de longitudes del
directorio cubre todo el tramo de datos, que la raíz cabe en los primeros 16.384
bytes y que los metadatos llevan la atribución obligatoria.

### Defectos encontrados y corregidos durante la verificación

1. **La comprobación de PMTiles mentía.** Leía `header.addressedTilesCount`, campo
   que **no existe** en el lector oficial (el real es `numAddressedTiles`), así
   que el `undefined` hacía fallar un paquete correcto; y volvía a descomprimir
   una tesela que `getZxy` ya devuelve descomprimida. Corregido y fijado como
   test.
2. **Desbordamiento de enteros en el escritor.** `value & 0x7f` se corrompe a
   partir de 2³¹, y los identificadores de tesela lo superan dentro del zoom 16:
   partes del archivo se escribían mal **en silencio**. El test cubre a propósito
   los dos lados del límite.
3. **El proyecto no compilaba.** `ssr: false` en un Server Component: el primer
   build de producción falló. Hasta entonces solo se había usado el servidor de
   desarrollo. Se resolvió con el componente de cliente `CityViewerLoader`.
4. **El mapa no se dibujaba nunca.** MapLibre resuelve su worker con
   `import.meta.url`; con el empaquetador de Next eso apunta a
   `/_next/static/chunks/`, ruta que no existe: el navegador recibía un 404 en
   HTML, rechazaba el worker y el visor se quedaba en negro. Hicieron falta dos
   cosas: llamar a `setWorkerUrl` **siempre** justo antes de crear el mapa (con
   una guarda «solo la primera vez», el valor llegaba vacío y `new Worker("")`
   carga la propia página) y una reescritura `beforeFiles` a la ruta exacta que
   pide la librería.
5. **El recuento de orígenes de altura no cuadraba.** Se contaba al resolver la
   altura (11.191) en vez de sobre los edificios finales (3.836), así que los
   porcentajes del informe no se podían auditar: el dato sumaba más que el total
   publicado.
6. **Un edificio aparecía como varias cosas.** Las 8.981 `building:part` del
   centro sustituían a su edificio padre, así que un edificio salía como varias
   secciones independientes. Contradice el producto (una ubicación por edificio):
   ahora **no se publica ninguna parte** y se conserva el edificio completo con
   una sola altura. El descarte se cuenta y se explica en el informe, no se borra.
7. **La ciudad parecía estar sobre un terreno infinito.** La capa `background`
   pinta todo el lienzo, así que fuera de la cobertura había suelo donde no hay
   datos. Ahora el suelo es el rectángulo exacto del paquete, con canto, y el
   lienzo es transparente: detrás se ve el cielo.
8. **La ciudad figuró como publicada con la evidencia a medias.** El estado
   `available` se escribía en el módulo generado por el teselado. Ahora lo decide
   el paso 06 y exige verificación y rendimiento medidos; si falta algo, la ciudad
   vuelve a `in_preparation` con los motivos escritos.
9. **Método de verificación truncado.** `list=geosearch` devuelve como máximo 100
   artículos y el emparejamiento era por subcadena del título: **5 de los 10
   puntos «no tenían coordenada» cuando sí la tienen** y cualquier artículo con
   «marina» en el nombre podía pasar por Plaza de la Marina. Corregido pidiendo la
   coordenada del artículo exacto, con la búsqueda por área como contraste.
10. **La cifra de peso salía en inglés.** La ficha imprimía «1.57 MB» con el
    separador decimal inglés en una interfaz en español donde todo lo demás se
    escribe con coma. Un módulo único (`src/lib/bytes.ts`) y su test.
11. **El script de test del pipeline estaba roto.** `node --test test/` no
    acepta un directorio en esta versión de Node y fallaba con
    `MODULE_NOT_FOUND`. Ahora la prueba del paquete pública se ejecuta con
    `pnpm test`, no solo cuando alguien se acuerda.

---

## 3. Verificación de fidelidad

Documento completo: **[docs/verification/malaga.md](../verification/malaga.md)**

- **10 puntos de control**, todos con coordenada pedida a la Wikipedia en español
  por título exacto (con `pageid` guardado para poder abrir el artículo y ver la
  misma coordenada). La fuente **no alimenta el mapa en ningún punto**.
- **10 de 10** verificados, **10 de 10** dentro del área publicada, **10 de 10**
  confirmados también por la búsqueda por área (25 centros, radio 500 m, 285
  artículos únicos, **0 consultas truncadas**), **9 de 10** a menos de 40 m de la
  geometría publicada.
- El único punto que pasa de 40 m (Plaza de la Marina, 42,3 m) es el centro de una
  plaza abierta: no hay edificio a esa distancia porque no lo hay de verdad. La
  calle más cercana está a 8,4 m.
- Los tres puntos que caen **dentro** de una huella (Ayuntamiento, Mercado de
  Atarazanas, Alcazaba) son la señal más fuerte: no puede pasar por casualidad.
- **10 alturas contrastadas**: las plantas derivadas de la superficie construida
  oficial del Catastro frente a la etiqueta `building:levels` de OpenStreetMap en
  los diez edificios de mayor superficie construida. Acuerdo global: **994
  comparables, 939 dentro de una planta (94,5 %), diferencia media 0,49 plantas**.
  El documento explica que estos diez son **los peores casos**, no una muestra
  representativa, y analiza el peor (Mercado de El Carmen, 27 m de desviación) en
  lugar de esconderlo.
- **Evidencia gráfica**: [malaga-overlay.svg](../verification/malaga-overlay.svg),
  las huellas publicadas con los diez puntos encima, generado por el pipeline
  desde los datos reales.
- **Origen de cada altura**, publicado edificio a edificio en la propiedad
  `height_source` y resumido en la tabla del documento: 2.737 `osm_levels`
  (71,3 %), 1.036 `catastro_gfa_derived` (27,0 %), 56 `default_estimate` (1,5 %),
  7 `osm_height` (0,2 %). Altura con dato: **98,5 %**.

### Lo que dice y lo que no dice

Es una comprobación de **consistencia posicional**, no de exactitud absoluta. No
es una medición sobre el terreno ni una comparación contra cartografía oficial
certificada: sirve para detectar desplazamientos, proyecciones mal aplicadas y
geometrías invertidas, no para afirmar que cada fachada está en su sitio al
centímetro.

---

## 4. Rendimiento medido

Documento completo: **[docs/performance.md](../performance.md)**

Sobre **build de producción** (`pnpm build` + `next start`), medido por el propio
navegador. Cifras, no estimaciones:

| Métrica | Valor | Presupuesto |
| --- | --- | --- |
| LCP del catálogo | **209 ms** (424 ms en recarga) | ≤ 2.500 ms |
| CLS del catálogo | **0** | ≤ 0,1 |
| JavaScript inicial del catálogo | **205.294 B** en 11 archivos | — |
| Peticiones a terceros en el catálogo | **0** | 0 |
| Tiempo a primera vista útil del visor | **705 ms** | — |
| Descargado para la primera vista | **319.443 B** | — |
| Memoria JS del visor a los ~10 s | 15,8 MB | ≤ 512 MB |
| Memoria JS del visor a los **6 min 48 s** | **29,9 MB** | ≤ 512 MB |
| Paquete PMTiles | 1,57 MB (148 teselas) | ≤ 12 MB |

El visor **no comparte bundle con el catálogo**: MapLibre se importa de forma
diferida, así que la portada no paga ni un byte de la librería de mapas.

El «tiempo a primera vista útil» no es `load` ni el primer píxel: es cuando
MapLibre dispara `idle` por primera vez. El visor lo mide él mismo y lo publica
en `data-first-frame-ms` del contenedor, junto con `data-downloaded-bytes` y
`data-viewer-status`, para que se pueda leer desde fuera en lugar de creerse un
número de un informe.

**Dos cambios de producto pedidos durante la Fase B**

- **Cada edificio es una sola unidad.** Ninguna `building:part` se publica (8.981
  encontradas, 0 publicadas): un edificio no se contrata por secciones.
  Documentado en `docs/decisions.md#un-edificio-es-una-unidad`.
- **La zona es una isla flotante, no un mapa infinito.** El suelo es el
  rectángulo exacto del paquete, con canto, y la capa `background` desapareció:
  fuera de la cobertura se ve el cielo (`.alzado-sky`), no un terreno inventado.
  Documentado en `docs/decisions.md#la-zona-es-una-isla-no-un-mapa-infinito`.

---

## 5. Publicación

`node run.mjs publish` ha escrito
`src/lib/cities/data/malaga.publish.generated.ts` con `publishStatus =
"available"` y `publishBlockers = []`, apoyándose en:

- teselas: `2026.10.1`, 1.648.989 B, `sha256 2f869282…`, 148 teselas,
  **0 identificadores discrepantes** frente al lector oficial;
- verificación: 10/10 puntos, 10 dentro del área, 9 a menos de 40 m;
- rendimiento: medido el 2026-10-09 sobre build de producción.

La ficha de ciudad muestra el estado y el resumen de la verificación (10 de 10),
y el catálogo ofrece «Explorar en 3D». La miniatura sigue declarando «Vista 3D
disponible · miniatura pendiente»: **no hay captura de la escena**, así que no se
inventa una.

---

## 6. Lo que **no** está hecho, dicho sin rodeos

- **El terreno (relieve) no está verificado.** La fuente en uso (Terrain Tiles de
  Mapzen/AWS) tiene una licencia compuesta con componentes restrictivos y el
  Centro de Descargas del CNIG, que sería la fuente prevista, no responde desde
  este entorno. El relieve se carga y su atribución se muestra, pero está marcado
  `verified: false`. **Antes de facturar por esto hay que decidirlo.**
- **La licencia del Catastro sigue sin leerse literalmente.** El PDF usa fuentes
  con codificación propia y los extractores devuelven caracteres sin sentido. La
  atribución se muestra igualmente y la ficha avisa de que está pendiente.
- **No hay verificación contra ortofoto ni cartografía oficial certificada.**
- **Calle Larios no se dibuja**: el extracto de OSM no la etiqueta con `highway`
  en la zona consultada. La vista inicial cae sobre su coordenada independiente,
  pero el vial no aparece ni tiene nombre en el mapa.
- **69 relaciones de OpenStreetMap no se ensamblan** (multipolígonos que no son
  edificios: agua y usos del suelo). Solo el agua se procesa por su anillo
  exterior. Está contado en el informe de calidad, no disimulado.
- **Sin captura del visor persistida en el repositorio.** La evidencia gráfica de
  `docs/verification/` es el SVG que genera el pipeline desde los datos. La
  comprobación visual del visor se hizo en el navegador, y la isla con cielo se
  ha verificado en el resultado compilado (hoja de estilos y opciones del mapa),
  no con una imagen guardada.
- **Las mediciones de rendimiento son en `localhost`**, sin latencia de red ni
  CDN. El peso de los recursos (bytes) sí es representativo; los tiempos, no.
- **`pnpm lint` y `pnpm format` no funcionan**: los scripts existen en
  `package.json` pero `eslint` y `prettier` no están instalados como
  dependencias. La verificación de esta fase se ha apoyado en tipos, tests y
  compilación. O se instalan con su configuración (eslint 9, configuración plana)
  o se quitan los scripts para que no prometan lo que no hacen.
- **No hay parcelas, ni base de datos, ni autenticación, ni pagos.** Todo eso es
  Fase D. El visor lo dice en lugar de simularlo.
- **Una sola ciudad.** El catálogo está preparado para más (un archivo por ciudad
  y una línea en el registro) pero solo Málaga tiene datos.

---

## 7. Siguiente paso recomendado

Con los datos y el visor en pie, lo que desbloquea producto es la **capa de
parcelas** (Fase D): dónde se puede pinchar sobre una fachada, con qué precio y
con qué unidad contratable. El modelo actual ya lo permite sin tocar el pipeline:
cada edificio es una unidad con identificador estable (`osm_id`), altura y origen
de altura publicados en la tesela.

Antes de eso, dos decisiones que no son técnicas: **el terreno** y **la licencia
del Catastro**. Ninguna de las dos bloquea el desarrollo; las dos bloquean cobrar.
