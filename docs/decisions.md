# Registro de decisiones

Cada decisión técnica relevante con su motivo, su coste y su licencia. Si una
decisión está abierta, se dice; no se disfraza de cerrada.

Última actualización: 2026-10-09 (fase B: datos, visor y publicación).

---

## Marca

### Nombres propuestos

Se valoraron tres nombres, con comprobación informal de colisiones por búsqueda
web. **Ninguna de las tres comprobaciones es un estudio de marca**: hay que
pedir una búsqueda en la Oficina Española de Patentes y Marcas y en la EUIPO
antes de invertir en identidad.

| Nombre | Idea | Riesgo de colisión observado |
| --- | --- | --- |
| **Alzado** *(elegido)* | En arquitectura, el *alzado* es el dibujo de la fachada visto de frente: exactamente la superficie que se alquila. También significa «levantado». | Ninguno reseñable en software, cartografía ni publicidad. Es una palabra común del español, lo que limita el registro como marca denominativa pero no en la práctica para un servicio. |
| Tramoya | Maquinaria escénica: lo que se mueve por detrás para que la escena funcione. | Sin colisiones relevantes. Descartado por menos legible para un público no hispanohablante. |
| Plinto | Pedestal sobre el que se apoya lo que se exhibe. | Existen marcas de mobiliario y diseño con este nombre. Descartado por riesgo. |

**Decisión:** `Alzado`, con wordmark tipográfico propio. Nombre, variante
compacta y descripciones viven en un único módulo (`src/lib/brand.ts`), así que
cambiar de marca no obliga a tocar componentes.

**Pendiente:**
- [ ] Búsqueda formal de marcas (OEPM / EUIPO) antes de registrar dominio y redes.
- [ ] Convertir el wordmark a trazados SVG para uso offline e impresión. Hoy se
      compone en tiempo de ejecución con la fuente display; funciona en web y en
      las imágenes OG, pero no es un archivo de logotipo independiente.

### Tipografía

| Uso | Fuente | Licencia | Coste |
| --- | --- | --- | --- |
| Interfaz | Geist Sans / Geist Mono | SIL Open Font License 1.1 | 0 € |
| Display (nombres de ciudad, wordmark) | Fraunces | SIL Open Font License 1.1 | 0 € |

Geist se sirve desde el paquete `geist` (autoalojado, sin peticiones a Google
en tiempo de ejecución). Fraunces se descarga **en tiempo de compilación** vía
`next/font/google` y se autoaloja en el build; no hay petición a Google en el
navegador del usuario. Si se quiere eliminar esa dependencia de red en el build,
se puede sustituir por el paquete `@fontsource-variable/fraunces`.

### Acento cromático

**Albero quemado `#B4522A`.** Terracota apagada. Motivo: la paleta del mapa es
arena y piedra cálidas, así que el acento tenía que leerse como señalización sin
competir con los edificios, y no debía ser un azul genérico de SaaS. Contraste
≈ 6,2:1 sobre el fondo marfil (`#F3F2EE`), suficiente para texto normal en
WCAG 2.2 AA. Semánticos: verde apagado `#2F6B4F` (disponible), gris `#6F7278`
(ocupado), ocre `#8A6A1F` (premium). Los tres estados se distinguen además por
forma (círculo lleno / semicírculo / anillo), no solo por color.

---

## Honestidad de datos

Decisión estructural, no de estilo: **el esquema de configuración de ciudad
impide publicar afirmaciones falsas**, en lugar de confiar en la disciplina de
quien programa.

- Una ciudad no puede estar `available` si no tiene paquete de teselas
  publicado (`tiles` no nulo y `dataStatus: "ready"`).
- Un paquete no puede declararse `ready` sin teselas.
- Si hay paquete publicado, **todas** las fuentes deben tener fecha de
  extracción real: la procedencia no se rellena a mano.
- No se puede prometer un recuento de parcelas en una ciudad no disponible.
- La portada no muestra cifras de parcelas: la configuración declara
  `parcelCountSource: "none"` y la tarjeta omite el dato en lugar de inventarlo.
- No hay imágenes de stock. La miniatura de una ciudad es un render de la
  propia escena 3D; mientras no exista, se muestra un marco cartográfico que
  declara «Vista 3D sin publicar».

Estas reglas están cubiertas por tests (`src/lib/cities/schema.test.ts`,
12 casos).

---

## Aplicación

| Decisión | Elección | Motivo | Coste |
| --- | --- | --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript 5.9 estricto | Server Components para catálogo y SEO; el visor 3D es un componente de cliente cargado aparte. | 0 € |
| TypeScript | 5.9.3, **no** 7.0 | La 7.0 (compilador en Go) acaba de salir; no se asume compatibilidad con Next 16 sin probarla. | 0 € |
| Estilos | Tailwind CSS 4 con `@theme inline` sobre variables CSS propias | Los tokens viven en CSS, no repartidos en clases. Un componente nunca usa un color en crudo. | 0 € |
| Estado de interfaz | Zustand con `persist` | Separado del estado del mapa: cambiar un filtro no debe re-renderizar la escena. | 0 € |
| Validación | Zod 4 | Mismo esquema en cliente y servidor; el archivo de seed y la base de datos comparten validación. | 0 € |
| Iconos | Lucide | Un solo set, trazo uniforme, sin emojis como iconos. | ISC |
| Dinero | Enteros de céntimos + redondeo half-up entero | Nunca coma flotante. `nextPriceCents` usa `floor((a + b/2) / b)` con denominador par. | — |

### Dos decisiones dentro del cálculo de precios

1. **Suelo de +1 céntimo.** La regla del pliego es
   `siguiente = round_half_up(actual × 125 / 100)`. Aplicada literalmente, con
   precios muy bajos el redondeo devuelve el mismo valor (`1 → 1,25 → 1`), el
   precio se congela y la reventa no sube. Se añade
   `max(escalado, actual + 1)`. En el rango real de precios el término dominante
   sigue siendo el 25 %. Cubierto por test de regresión.
2. **Desbordamiento explícito.** Al encadenar reventas el importe crece de forma
   exponencial. Cuando supera el rango entero seguro de JavaScript, el módulo
   **lanza** en lugar de devolver un número impreciso.

### Correcciones encontradas durante la verificación

- **`◐ ● ○` como glifos de estado:** no existen en todas las fuentes del sistema
  y se pintaban como cajas. Sustituidos por SVG en línea.
- **El bloque de texto de la miniatura cubría el botón de guardar:** con
  `z-index` superior y sin `pointer-events-none`, el clic con puntero real nunca
  llegaba al botón. El `click()` programático sí funcionaba, por lo que no lo
  detectaba ni la compilación ni un test. Se encontró verificando en el navegador
  de verdad.
- **Carrera en la rehidratación de favoritos:** al rehidratar desde un
  `useEffect`, si el usuario marcaba un favorito antes de que terminara la
  lectura del almacenamiento, el estado persistido (vacío) pisaba su acción. La
  rehidratación se lanza ahora al evaluar el módulo del store.

---

## Fuentes de datos geográficos

Cadena de prioridad prevista para la altura de un edificio, de más fiable a
menos: **plantas del Catastro → `height` de OSM → `building:levels × 3 m` →
valor por defecto**. El origen de cada altura se conserva en el propio dato y el
informe de calidad publica el porcentaje de alturas reales frente a estimadas.

| Fuente | Capas que aporta | Licencia | Atribución obligatoria | Verificada |
| --- | --- | --- | --- | --- |
| OpenStreetMap (extracto de Geofabrik, Andalucía) | Red viaria, agua, verde, usos del suelo, toponimia, huellas | ODbL 1.0 | «© OpenStreetMap contributors» | Sí |
| Catastro, edificios INSPIRE (WFS) | Huellas y número de plantas sobre rasante | Licencia de acceso y uso de los servicios y conjuntos de datos INSPIRE de la DGC | «© Dirección General del Catastro» | **No** |
| Overture Maps (edificios) | Contraste de alturas | Por confirmar (ODbL / CDLA) | Por confirmar | **No** |
| MDT del IGN/CNIG | Terreno | CC BY 4.0 | «© Instituto Geográfico Nacional» | Pendiente de descarga |

### Comprobaciones de acceso ya hechas

| Servicio | Resultado |
| --- | --- |
| Overpass API (`overpass-api.de`) | Responde 200 con `User-Agent` identificativo. Consulta de conteo de edificios en el bbox de Málaga correcta. |
| Catastro WFS de edificios INSPIRE | Responde 200. Devuelve GML en EPSG:4326 con `numberOfBuildingUnits`, `currentUse`, referencia catastral y `numberOfFloorsAboveGround`. **Aviso:** en la muestra consultada el número de plantas venía con `xsi:nil` (*unpopulated*), así que la cobertura real de ese campo hay que medirla sobre el municipio completo antes de prometer «alturas reales». |
| Geofabrik | Extracto de Andalucía disponible (`andalucia-latest.osm.pbf`). No hay extractos por provincia: se descarga la comunidad y se recorta al bbox. |
| Centro de descargas del CNIG | **Fallo de conexión** (`schannel: server closed abruptly`). La vía para el terreno queda por resolver: alternativa a evaluar, el WCS de la IDEE. |

### Aviso sobre Google Photorealistic 3D Tiles

No se usa ni se va a usar como base sin aprobación escrita: sus condiciones
restringen la caché y los derivados, exigen atribución y chocan con un estilo
propio y autoalojado.

---

## Reproducibilidad del pipeline

Decisión: el pipeline vive en `data-pipeline/`, con scripts versionados y un
único comando de entrada. Los datos crudos y los artefactos generados están en
`.gitignore`: se regeneran, no se versionan. Los manifiestos (procedencia,
fechas, checksums) sí se versionan.

Herramientas evaluadas y **descartadas** por el entorno disponible:

| Herramienta | Requisito | Estado |
| --- | --- | --- |
| Planetiler | Java 21+ | No hay JRE en la máquina |
| Tippecanoe | Compilación nativa / WSL | No disponible |
| Docker | — | No instalado |
| `ogr2ogr` (GDAL) | — | No instalado |
| `psql` / PostGIS local | — | No instalado |

Esto **condiciona la Fase B**: o se instala un JRE, o el pipeline se construye
en Node con `geojson-vt` + `vt-pbf` + `pmtiles`. La segunda opción no necesita
nada que no haya ya en el proyecto. La decisión está abierta y condiciona el
plan de la Fase B.

---

## Alojamiento y base de datos

**Sin decidir.** Depende de la respuesta a las preguntas abiertas. Lo que sí está
decidido:

- No se asume que código de Node.js funcione en Workers sin verificarlo. Next.js
  con App Router y renderizado en servidor necesita un adaptador verificado
  (OpenNext) y que la salida coincida con el manifiesto de despliegue; no se
  sube un `.next` normal.
- El origen público **nunca** se deriva de la cabecera `Host`: se lee de
  `APP_ORIGIN`. Las rutas sensibles usarán `requireAppOrigin()`, que falla en
  producción si falta, en lugar del valor por defecto silencioso.
- PostgreSQL con PostGIS, sea cual sea el proveedor, con migraciones versionadas.

---

## Pagos

**Decidido:** toda la capa de Stripe se construye con un proveedor de pago
intercambiable y un interruptor `PURCHASES_ENABLED`. Con el interruptor en
`false`, la API rechaza crear pedidos y la interfaz muestra «Compras próximamente».

**Prohibido explícitamente:** cualquier modo «simulado» que aparente una compra
real. No existe y no se va a implementar.

**Aviso de viabilidad:** con la tarifa de Stripe del EEE (1,5 % + 0,25 €), un
precio de entrada de 1,00 € deja una comisión de 0,40 €, es decir el 40 % del
importe. Ver la tabla de comisiones frente a precio inicial recomendado en el
informe de pagos (pendiente).

---

## Licencias: tareas abiertas

- [ ] **Catastro INSPIRE.** La licencia se cita en la interfaz con su enlace,
      pero su texto no se ha podido leer literalmente: el PDF usa fuentes con
      codificación propia y los extractores habituales devuelven caracteres
      sin sentido. Queda pendiente la lectura manual del documento y confirmar
      la obligación exacta de atribución. Mientras tanto la atribución se
      muestra igualmente, que es la opción conservadora.
- [ ] **Overture Maps.** Confirmar licencia por capa si se usa como contraste de
      alturas.
- [ ] **MDT del IGN.** Confirmar la vía de descarga y la atribución exacta.
- [ ] **Terreno.** Ver la sección «Terreno» de este documento: la fuente que se
      usa hoy (Terrain Tiles de Mapzen/AWS) arrastra una pila de atribuciones con
      componentes restrictivos que no se ha leído literalmente.
- [ ] **Calle Larios sin `highway`.** El extracto de OpenStreetMap no etiqueta la
      calle como viaria, así que no se dibuja ni tiene nombre en el mapa, aunque
      la vista inicial del visor caiga sobre su coordenada independiente.
- [ ] **Memoria a los 5 minutos del visor.** Medida a los 10 s (15,8 MB) y a los
      3 min (29,9 MB), pero sin la lectura a los 5 minutos. Bloquea la
      publicación hasta que exista.

---

# Fase B — datos, visor y publicación

## Pipeline reproducible en Node

**Decidido:** el pipeline vive en `data-pipeline/` y solo necesita Node. Pasos:
`osm` → `catastro` → `layers` → `tiles` → `verify` → `publish`, con
`node run.mjs <paso>` para reanudar sin repetir descargas.

Se descartaron Planetiler (necesita JRE), Tippecanoe (compilación nativa) y
Docker: no están en el entorno. `geojson-vt` + `vt-pbf` + un escritor propio de
PMTiles cubren lo mismo.

### Escritor propio de PMTiles v3, verificado con el lector oficial

La versión pública del paquete `pmtiles` (4.5.0) trae **lector pero no
escritor**. Se implementó uno (`lib/pmtiles-writer.mjs`). No se pide confianza:
el paso 04 relee el archivo con el lector OFICIAL, compara la numeración de
teselas tesela a tesela y extrae teselas reales comparándolas byte a byte. Si
algo no cuadra, el pipeline **falla y no publica**.

Tres errores reales que ese control destapó (ninguna tesela era legible en las
primeras versiones):

1. El identificador de tesela no es `y·2^z + x`, sino la posición en una curva de
   **Hilbert**, como exige la especificación.
2. El directorio no se escribe intercalando (delta, runLength) por entrada: son
   **cinco secciones en serie**.
3. Los desplazamientos se codifican como `offset + 1`, y como `0` solo si la
   entrada es contigua a la anterior (nunca en la primera).

Y dos errores en la propia verificación, que acusaban al escritor de un archivo
correcto:

1. Leía `header.addressedTilesCount`, campo que **no existe** en el lector real
   (el nombre correcto es `numAddressedTiles`). El `undefined` hacía fallar la
   comprobación siempre.
2. Volvía a descomprimir la tesela que `getZxy` **ya devuelve descomprimida**.

La comprobación quedó como test automático (`data-pipeline/test/pmtiles.test.mjs`,
`node --test`): enumera el directorio del paquete publicado con el `readVarint`
oficial, comprueba **todos** los TileID contra el lector oficial, relee **todas**
las teselas, valida que los bytes coinciden con el tramo que declara el
directorio y decodifica cada una como MVT. Incluye un caso de ida y vuelta con
identificadores por encima de 2^31 (zoom 16), que es donde la aritmética de 32
bits de JavaScript se rompía en silencio.

## Un edificio es una unidad

**Decidido:** las 8.981 secciones `building:part` del centro de Málaga **no se
publican**. Cada edificio es una sola huella con una sola altura.

Motivo: el producto vende ubicaciones sobre edificios, y un edificio no se
contrata por secciones. La primera versión sustituía cada edificio padre por sus
partes —más detalle geométrico, pero un mismo edificio aparecía como cinco cosas
distintas—. Consecuencia medida: el paquete bajó de 2,19 MB a 1,57 MB y el número
de unidades de 8.471 a **3.836**. El recuento de lo descartado se sigue
publicando en el informe de calidad.

## La zona es una isla, no un mapa infinito

> **Sustituida en la Fase B.3** (ver «Ciudad continua con bordes difuminados» más
> abajo): la isla flotante, su losa y su base rocosa ya no existen. Se conserva
> el texto como historia de la decisión.

**Decidido:** el estilo del mapa **no pinta capa `background`**. En su lugar hay
una capa `island` con el rectángulo exacto de la cobertura y un borde
(`island-edge`). El lienzo queda transparente y detrás se ve el cielo del
contenedor (`.alzado-sky`: degradados suaves y tres manchas difusas a modo de
nubes, sin imágenes que cargar ni licenciar).

Motivo: una capa `background` pinta todo el lienzo, así que la ciudad parecía
asentada sobre un terreno sin fin que no existe. Fuera de la cobertura no hay
datos; lo honesto es que se vea que no hay nada. Además, la cámara ya está
limitada (`maxBounds` más amplio que la cobertura, para poder ver el canto).

## La publicación es un paso del pipeline, no un campo a mano

**Decidido:** `data-pipeline/steps/06-publish.mjs` decide el estado `available`
leyendo la evidencia de disco: paquete verificado con el lector oficial,
verificación geográfica con los diez puntos y mediciones de rendimiento dentro de
presupuesto. Si algo falta, la ciudad se queda en `in_preparation` y los motivos
se publican literalmente (manifiesto `publish.blockers`, visibles en la ficha).

**Por qué:** durante la fase B el pipeline escribía `status: "available"` al
generar las teselas. Eso dejó la aplicación afirmando que Málaga estaba publicada
antes de que existieran la verificación geográfica y las mediciones. El estado no
se escribe a mano: se deduce.

## Integración del visor: dos fallos que solo aparecían en producción

1. **`ssr: false` en un componente de servidor.** El build de producción fallaba
   con `next/dynamic` y `ssr: false` dentro de un Server Component (Next 16).
   Hasta entonces solo se había usado el servidor de desarrollo, así que el
   proyecto **nunca había compilado en producción**. Se resolvió con un
   componente de cliente mínimo (`CityViewerLoader`) que hace el import diferido.
2. **El worker de MapLibre.** MapLibre crea su worker con
   `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Con Turbopack,
   `import.meta.url` es una URL `file:///ROOT/src/...`, así que la librería
   descarta la ruta y acaba en `new Worker("")`, que carga la propia página HTML
   y el navegador rechaza («non-JavaScript MIME type text/html»). El visor
   mostraba «Worker failed to load». Se resolvió sirviendo el worker desde
   `public/maplibre/` (copiado de `node_modules` en cada build por
   `tools/sync-maplibre-worker.mjs`, sin versionarlo para que no se
desincronice), fijando `maplibregl.setWorkerUrl()` **siempre** justo antes de
   crear el mapa, y con una reescritura en `next.config.ts` que sirve el worker
   también en la ruta que la librería calcula por su cuenta.

## Verificación geográfica: método corregido

La primera versión emparejaba puntos de control por **subcadena del título** de
resultados de `list=geosearch`. Dos fallos medibles: `gslimit=100` **trunca** la
lista (en el centro de Málaga hay más de 100 artículos geolocalizados en 350 m,
por lo que cinco de los diez puntos «no tenían coordenada» cuando sí la tienen),
y una subcadena puede casar el artículo equivocado.

Ahora cada punto nombra su **artículo exacto** y la coordenada se pide a
`prop=coordinates`; la búsqueda por área (rejilla de 25 consultas de 500 m) queda
como contraste. Resultado: 10 de 10 verificados y 10 de 10 confirmados por las dos
vías. Detalle en `docs/verification/malaga.md`.

## Terreno

**Uso actual, con reservas:** Terrain Tiles (Mapzen / AWS Open Data), codificación
terrarium. Es la única fuente de elevación accesible desde este entorno: el Centro
de Descargas del CNIG, que sería la prevista, no responde.

**Problema:** su licencia es una pila de atribuciones con componentes
restrictivos. La atribución completa se muestra en el mapa y la fuente queda
marcada como **no verificada** en la ficha de la ciudad. No se ha usado en
silencio ni se ha presentado como propia.

**Pendiente:** leer la licencia literalmente y decidir si se mantiene, o
sustituirla por el MDT del IGN/CNIG cuando su descarga sea viable.


# Fase B.3 — ciudad continua con bordes difuminados

## Ciudad continua con bordes difuminados (sustituye a la isla)

**Decidido:** Málaga es una ciudad sobre terreno continuo. Sin losa, sin base
rocosa, sin estratos, sin sombra bajo la ciudad. La zona cubierta es un
**polígono convexo en la configuración de la ciudad** (`scene.coverage.polygon`
en `src/data/cities/malaga.geo.json`) y más allá de él, a lo largo de una banda
(`fadeBandM`, 200 m), todo (terreno, edificios, calles, mar, árboles) se mezcla
con el color de la niebla.

- **No hay transparencia.** El shader mezcla el color con el de la niebla según la
  distancia con signo al polígono (`src/lib/scene/materials.ts`). Es opaco, no
  necesita ordenar objetos y no cuesta nada en móvil.
- **Polígono y banda caben en los datos.** El polígono es el área con datos
  recortada 200 m por cada lado; polígono + banda = el área del paquete.
  `sceneFitsCoverage` lo comprueba al importar la ciudad y falla la compilación
  si no cabe. La banda necesita datos reales debajo: se difumina lo que existe, no
  se rellena lo que no.
- **El color de la niebla y el del horizonte son casi el mismo** (el horizonte,
  algo más claro) y el terreno de fondo se extiende hasta el horizonte con ese
  color: no hay borde que ver ni vacío.
- **La cámara no puede ver el borde del mundo.** Lejos, la inclinación mínima sube
  hasta 20° (a 3,6 km), de modo que el horizonte queda fuera de plano; cerca, la
  cámara no baja de 2,5 m y sube sobre los tejados.
- **Se oculta, no se inventa.** El mar de OpenStreetMap solo existe como línea de
  costa fuera del área (esquina SE); no hay polígono de mar y no se sintetiza.

## Cada edificio es una entidad, sin una malla por edificio

La geometría se fusiona **por zona** (cuadrícula de 520 m, 22 mallas) y cada
vértice lleva `bid`, el índice del edificio. El hover y la selección son dos
uniformes (`uHover`, `uSelected`) que elevan el brillo de ese `bid`, más un
contorno fino (`LineSegments`) reconstruido solo al cambiar. La selección usa
**BVH** (`three-mesh-bvh`, modo indirecto para conservar el orden de los
triángulos) sobre una malla de selección sin color ni normales. Medido: 387 de
400 rayos verticales devuelven su propio edificio (los demás son centroides
fuera de una huella cóncava).

## Edificios partidos entre teselas: se unen

Un edificio que cruza el borde de dos teselas llega en dos trozos con el mismo
`osm_id`. El visor anterior dibujaba todos los trozos pero registraba solo el
primero (el panel, el resaltado y la selección veían medio edificio). Ahora los
trozos se **unen** (`polygon-clipping`) al decodificar. Ver
`docs/verification/landmarks.md`.

## `earcut` y los vértices duplicados

`earcut` no falla con vértices repetidos: triangula **solo una parte** del
polígono. Los tejados a medias no avisan. Se limpian los vértices a menos de 8 cm
antes de triangular. Si en el futuro aparece un tejado con un trozo sin cubrir,
este es el primer sospechoso.

## Nubes: baratas y fuera del camino

4 variantes de 40 a 100 triángulos, mallas instanciadas, **un solo material**,
sin transparencia (tramado en el shader, ver `src/lib/scene/sky.ts`), bancos
bajos en el perímetro y nubes altas lejanas con las variantes más simples.
Medido durante el desarrollo: **actualizar sus búferes de instancia en cada
fotograma costaba más CPU que las otras 54 llamadas de dibujo juntas** (el
controlador espera a que la GPU suelte el búfer del fotograma anterior). A 20 Hz
el coste medido es indistinguible de no tener nubes y el salto es de menos de un
metro. Lección: en WebGL, el número de llamadas no es el único coste; subir
datos cada fotograma también lo es.

## Arbolado

OpenStreetMap aporta 2.646 árboles y 25 hileras en la zona (paso nuevo del
pipeline, `03b-trees.mjs`, que **no toca** edificios ni alturas). En parques y
jardines sin árboles mapeados, y en el Paseo del Parque y la Alameda Principal, se
rellena con una regla determinista (semilla fija) y se declara «estimado» en el
informe y en esta documentación. Cinco especies (palmera, naranjo, arbolado de
calle, copa redonda y pino piñonero) con una malla instanciada por especie y por
nivel de detalle; cerca del edificio seleccionado se ocultan para no taparlo.

## Cámara propia, otra vez

Sigue sin usarse `OrbitControls`. Los comportamientos exigidos (zoom anclado al
cursor o al edificio, desplazamiento solo dentro del polígono y solo con zoom,
retorno a la vista inicial antes de reanudar el giro, cámara que sube sobre los
tejados) son más código si se fuerzan desde fuera. Cobertura en
`src/lib/scene/camera.test.ts` (24 pruebas con reloj inyectado).


# Fase B.4 — agua real, zona circular, puerto, Alcazaba, locales y barcos

## La zona es un círculo en la configuración, no en el motor

`scene.coverage.circle` (centro y radio) y `fadeBandM` viven en `malaga.geo.json`. Círculo de 1.400 m centrado en (−4,4185; 36,7150): incluye el centro histórico, el puerto, Muelle Uno, la Alcazaba y Gibralfaro. El pipeline extrae círculo + banda (250 m) + margen (120 m) y **recorta al círculo en el pipeline** (edificios enteros o ninguno; suelo y agua a R + banda + 60 m). El difuminado del shader es `length(p − c) − R` (radial y uniforme); la cámara se limita con un polígono inscrito de 128 lados (0,03 % de diferencia con el círculo). Las nubes bajas se reparten con ángulo estratificado.

## Causa del z-fighting y solución, en el orden pedido

**Diagnóstico medido** (`tools/diagnose-zfighting.mjs` → `docs/verification/zfighting-b3.json`): la B.3 dibujaba usos del suelo (0,08 m), verde (0,30 m) y cintas de calle/plaza/senda (0,50 m) como polígonos de OSM **independientes y solapados en el mismo plano con colores distintos**. Dentro del círculo había **88.898 m² (1,44 % del suelo) de solape coplanar de distinto color**: 27.148 m² de verde×verde (116 pares; 687 jardines dentro de parques), 1.130 m² de usos×usos, y 60.620 m² de cintas (calzada×senda 34.225, calzada×peatonal 14.865, peatonal×senda 11.530). Cuando dos planos coplanares de distinto color se disputan un píxel, el ganador cambia con la cámara: parpadeo.

1. **Pipeline** (`03c-surface.mjs`): diferencia booleana celda a celda (250 m) con prioridad puentes › calles › ferrocarril › plazas › sendas › muelles › playa › verde › usos; edificios y agua se restan de todo. Resultado: clases **disjuntas**. Validación sobre 13.967 pares: 41 restos > 0,05 m², **18,2 m² en total (0,0005 %)**, peor 2,66 m² (restos numéricos de `polygon-clipping`).
2. **Escena** (`ground.ts`, `palette.ts#SURFACE_LAYERS`): cada clase tiene altura propia (de −0,10 a 0,34 m, saltos de 2 a 6 cm) y `renderOrder`; la de mayor prioridad es la más alta. Sin `polygonOffset`: no hizo falta. Las teselas de suelo/agua se generan sin simplificar y **sin margen** (`buffer: 0`), porque con margen cada tesela invadía ~1 m a la clase vecina.
3. **Cámara**: `near = 0,03·distancia` (0,4–90 m) y `far` dinámico (21–36 km). Resolución de profundidad a 3.300 m: d²/(near·2²⁴) ≈ 7 mm, tres veces menor que el salto mínimo entre capas.

`logarithmicDepthBuffer`: **no se activa** (con lo anterior el ruido en zonas planas medido es ≤ 0,3 %). Existe la bandera de diagnóstico `?logdepth=1` (los shaders propios llevan los chunks necesarios) pero su coste **no se ha medido en esta fase**.

## Agua con profundidad

Un solo mar (costa de OSM, algoritmo de poligonización de costa con cierre horario, restando 20 muelles/diques) y 59 masas menores, todas con **el mismo material**. La lámina está por debajo de muelles y orillas (`scene.water.levelsM`: mar −1,6 m, río −1,0 m, fuentes −0,35 m…), el suelo tiene el hueco del agua y los bordes llevan paredes (arena donde hay playa; las aristas que son corte de teselado no llevan pared). Shader propio sin transparencia: color por distancia a la orilla (campo de distancia 2048², 126 ms al cargar), oleaje de fragmento de baja amplitud con sombreado plano por facetas triangulares, Fresnel barato y espuma leve. Con `prefers-reduced-motion` el tiempo de la escena está parado.

## Exageración vertical ×1,25

`scene.verticalExaggeration.factor`. Solo se aplica al **dibujo** (`renderHeightM`); `heightM` y su origen no se tocan y son lo que muestra la ficha, que además declara «×1,25 (solo visual)». Los emblemáticos (catedral, GLB) y las fortalezas llevan el mismo factor.

## Fortalezas compuestas, sin inventar

Alcazaba y Gibralfaro se construyen con la planta de OSM (26 lienzos, 14 torres, 3 puertas, edificios interiores) y alturas **declaradas como estimación** (salvo la Torre Mayor, 17 m, con fuente). Cada una es UN elemento seleccionable. Ver `docs/verification/landmarks.md`.

## Locales

Una parcela es un tramo de fachada de planta baja con id estable (`L-xxxxxxx`, hash de edificio + geometría) y estado «disponible». Origen: `catastro_unit` (**0**: el conjunto INSPIRE de edificios no publica locales con geometría), `osm_poi` (1.175) y `estimated` (4.013, solo en zonas comerciales declaradas, tramos de ≈ 6 m). El resaltado se distingue por patrón (marco / rayado / damero), no solo por color. Los árboles se apartan de las fachadas con local.

## Barcos

Tres cruceros genéricos (sin nombres ni librea) en los frentes de atraque que **salen de los datos** (muelles que tocan `seaway=cruise_port` o `cargo=passengers`), y 90 embarcaciones pequeñas instanciadas junto a los pantalanes. No entran en la selección; la cámara no los atraviesa.

## Carga: coste asumido y recortes

Primer fotograma de escritorio 1,1 s → ≈ 2,7 s; en móvil emulado (CPU ×4) 4,1 s → 10–14 s. Recortes ya hechos: conversión afín por tesela (−30 % de decodificación), margen de 23 m en las teselas de edificios para no calcular uniones (321 → 69 ms), un solo triangulado del tejado para dibujo y selección, peticiones de teselas por delante. Pendiente: decodificación en Web Worker.

---

# Fase C — Compra de espacios publicitarios, tráfico animado y carreteras

## Qué se vende y a qué precio

Unidades con id estable: edificios (`b:way/…`), locales (`p:L-…`), tramos de muralla de ≈ 30 m de la Alcazaba y Gibralfaro (`w:gibralfaro:05`), 8 paneles por crucero (`s:cruise-N:0-7`), velas (`v:N`) y 3 carteles de avioneta (`a:plane-N`). La lista permitida sale de `src/data/market/units-malaga.json` (paso `03g-units`) y de la configuración: el servidor rechaza cualquier otro id. Primera compra 1,00 €; **cada compra posterior sube el precio un 25 %** (`src/lib/money.ts`: 100 → 125 → 156 → 195 → 244 céntimos…, tope 99.999.999 por el máximo de Stripe). El enunciado decía «0,25 %» y «incrementalmente»: se ha interpretado como +25 %; con 0,25 % la subida sería de 0,0025 € y el precio no cambiaría al redondear a céntimos. Cambiarlo es una constante.

## Pago: solo Stripe real

No existe modo «compra simulada». `PURCHASES_ENABLED` apagado → la API responde 403 y la interfaz dice «Compras próximamente». El servidor calcula el precio; el navegador solo lo enseña. Flujo: estudio 3D → `POST /api/market/checkout` (Checkout en modo `payment`, importe en línea con `price_data`, así que **no hay productos que crear en Stripe**) → Stripe → vuelta con `?checkout=success&session_id=…` → `GET /api/market/confirm` y, por el otro lado, el webhook `checkout.session.completed`. Ambos son idempotentes por id de sesión: una unidad no se aplica dos veces. Si dos personas pagan a la vez el mismo espacio, gana el primer webhook que se procese y el contenido anterior se sustituye (el estudio advierte de que otra persona puede comprarlo después).

Variables de entorno (nunca en el repositorio; en Cloudflare como secretos):

| Variable | Para qué |
| --- | --- |
| `PURCHASES_ENABLED=true` | enciende las compras |
| `STRIPE_SECRET_KEY` | clave secreta (`sk_test_…` para probar, restringida en producción) |
| `STRIPE_WEBHOOK_SECRET` | firma del webhook `POST /api/market/webhook` |
| `DATABASE_URL` | Neon (Postgres). Sin ella el estado es de solo lectura y las compras quedan apagadas; en desarrollo hay un fichero local |
| `APP_ORIGIN` | origen público exacto para las URLs de retorno |

## Edificios: patios con pared

Los tejados mostraban el interior porque los **patios** (huecos del polígono) no tenían paredes: se veía por el agujero hasta el suelo. Ahora cada anillo interior lleva sus paredes invertidas (`city.ts`, con test).

## Tráfico

Todo en `traffic.ts`/`seamap.ts`, con reloj de escena (con `prefers-reduced-motion` el tiempo está parado y todo queda en su posición inicial).
- **Cruceros**: ciclo `cruiseCycleSeconds` (900 s): amarrado 50 % → sale → da la vuelta en mar abierto → regresa → se amarra. Ruta por A* sobre una rejilla de mar de 25 m con distancia a tierra; las celdas con poca agua libre cuestan más. Se aparta del muelle con el rumbo del atraque antes de girar. A t = 0 están donde los dejó la B.4.
- **Veleros y lanchas** (14 escritorio / 6 móvil): bucles circulares sobre mar con ≥ 130 m de agua libre.
- **Avionetas**: 3 órbitas de 1.050–1.320 m de radio a 210–340 m, con cartel ondulante legible por las dos caras.
- **Anuncios móviles**: planos colgados del casco, la vela o el cartel. Libres: «Anuncia aquí» y el precio (las velas libres no se dibujan, pero se pueden pinchar). Comprados: la foto o, si no hay, el nombre.
- Corrección de robustez: el lado del agua de un atraque se comprueba contra el mar y se invierte si hace falta. Al regenerar las teselas el orden de los trozos del frente cambió y los cruceros habían quedado en tierra.

## Carreteras

Asfalto oscuro por clase (principal/secundaria/otras), bordillo claro de 0,55 m sobre el contorno de calzadas principales y secundarias (sin aristas de corte de tesela) y línea central discontinua en las principales, omitida en los cruces. Dos mallas, a 0,30 m (entre calles y puentes).

## Interfaz

Pasar el ratón por un espacio enseña su nombre y precio (libre) o su anunciante (comprado); el clic abre la ficha con el estudio de compra. El estudio dibuja el edificio en WebGL propio, deja elegir una foto por cara o «la misma en todas», y reduce las imágenes a ≈ 150 kB en el navegador. La regla «ninguna etiqueta sobre el mapa» se mantiene salvo esta ventana emergente, que se pidió expresamente.

## Coste asumido

Vista inicial: 0,72 → ≈ 2,4 ms de CPU por fotograma y 100 → 152 llamadas de dibujo (paneles de crucero y avionetas son mallas sueltas). Sigue en ≈ 380 FPS sin vsync. Mejora posible: fundir los paneles libres en una sola malla.

## Visor: ficha mínima, una foto de fachada y foto de techo

- **Ficha**: título (nombre del edificio o «Edificio sin nombre») y bloque de compra. Alturas, orígenes de datos y metodología salieron del mapa: viven en `/city/[slug]/datos`.
- **Una foto de fachada** que se repite en todas las caras (`images.all`, `sameForAll`): ahorra espacio en la base de datos. **Foto de techo** opcional (`images.roof`) en edificios y tramos de muralla, para los edificios bajos y planos que no se ven de lado.
- **Compresión en el navegador** antes de subir: WebP (JPEG si no hay soporte), lado máximo 1024 px (384 el logo), calidad y tamaño por pasos hasta ≈ 70 kB (24 kB el logo). Una foto de 4 MB queda en ≈ 60 kB. El servidor sigue validando tipo y tope (160 kB por imagen).
- **Encuadre «cover»**: la foto cubre cada cara, panel o techo sin deformarse; se recorta lo que sobra, centrado. Una foto apaisada en una cara alta pierde los lados.
- **Barcos**: la borda del crucero sube de ≈ 17 % a ≈ 30 % de su altura (mín. 12 m) y los paneles son más altos (≈ 12 × 36 m); los veleros crecen un 25 % y su vela es más alta, con un panel un 70 % mayor.
- Comprobaciones: `tools/verify-studio.mjs` (estudio y compresión; el pago se intercepta, no crea sesiones de Stripe) y `tools/verify-photos.mjs` (fotos en el visor).

## Visor: ranking de los más caros y una sola foto

- **Ranking a la izquierda del visor** (`RankingDock`): los 8 espacios con mayor pago, con un botón «Ir a» por fila que vuela hasta el edificio (animación de 1,5 s, o salto con «reducir movimiento»), lo selecciona y se acerca. Arranca recogido en móvil. Si aún no hay compras, lo dice.
- **Una sola foto por espacio**: la casilla «Cargar foto» es logo, fachada (repetida en todas las caras) y techo a la vez. Se guarda UNA vez (`images.all`) y el servidor/visor la reutilizan: `logo` y `roof` caen a `all` si no hay uno propio. Los datos con `roof`/`logo` propios (formato anterior) siguen leyéndose.
- **Botones**: los primarios y secundarios llevan el mismo barrido de relleno al pasar el ratón que el resto de la web (`btn-sweep`), incluidos «Comprar por 1,00 €» y «Pagar con Stripe».

## Visor: zoom limitado y fondo de la web

- **Zoom**: el máximo de alejamiento baja de 5.200 a 3.500 m (la vista inicial es de 3.300 m); el mínimo sigue en 28 m, necesario para alcanzar los locales a pie de calle. Con el límite nuevo el círculo no cabe entero en una ventana de 900 px a máxima distancia; la verificación de la silueta se mide en una ventana alta y admite un 12 % de perspectiva.
- **Fondo**: el cielo del visor pasa de azul claro a azul pizarra, el color de la web (`SKY` en `palette.ts`). `SKY.light` conserva el color claro que ILUMINA la escena y se refleja en el agua, para que la ciudad no se oscurezca. El borde difuminado del mapa salía más oscuro que el fondo porque `fog_fragment` va después de la conversión de color de salida; ahora el color de difuminado se convierte igual (`linearToOutputTexel`).
- **Ranking de los más caros**: los avisos flotantes del ratón pasan por detrás (`z-10`) y ya no lo tapan.

## Despliegue en Cloudflare (preparado, sin desplegar)

- **Adaptador**: `@opennextjs/cloudflare` (1.20) sobre Next 16.4; `wrangler.jsonc` con el Worker `customer-resolver` (el que ya existe en la cuenta) y los activos en `.open-next/assets`.
- **Parche** (`patches/@opennextjs__cloudflare.patch`): el adaptador no reconocía `preview-props.json`, un archivo que Next 16.4 genera, y toda página daba 500. Se añade a la lista de manifiestos. Revisar al actualizar el adaptador.
- **`.npmrc` con `node-linker=hoisted`**: con la estructura de enlaces por defecto de pnpm, esbuild no puede leer los paquetes en Windows. En Linux (Workers Builds) también funciona.
- **PMTiles entero**: el visor descarga el paquete (3,4 MB, cacheable para siempre) una vez y sirve los trozos desde memoria. Los activos de Workers no garantizan peticiones «Range» y el lector fallaba. (`WholeFileSource` en `tiles.ts`.)
- **Comprobado en el entorno local de Cloudflare** (`opennextjs-cloudflare preview`): todas las páginas, la API, el visor y sus 4 baterías de pruebas; Neon desde Workers; sesión de Stripe Checkout; y el webhook (firma, idempotencia) con `tools/check-webhook.mjs`.
- **Secretos del Worker**: `DATABASE_URL` (ya existe en el Worker, de la web antigua), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_ORIGIN`, `PURCHASES_ENABLED`.

## Espacios gratis, vida urbana y monumentos (2026-10-10)

- **Gratis.** 100 edificios sin nombre y 20 locales (`src/data/market/free-units-malaga.json`, elegidos al azar con semilla 20261010, repartidos por el centro: sin nombre, 150–2500 m², ≥ 9 m, excluidos casas y monumentos). El primer anuncio cuesta 0 €: se reclama con cuenta de Google y **máximo 3 por cuenta** (sin identidad, una persona se llevaría los 100). Tras reclamarlo rige lo normal: protección de cinco días y el siguiente comprador paga 1,00 € (la escalera se desplaza un peldaño: `priceFor`). Las reclamaciones gratis no cuentan como «pago más alto». En el mapa se tiñen de amarillo (valor 40 en la textura de propiedad). En el shader de los locales, la rama del amarillo va DESPUÉS de la de «comprado»: con `owned > 0.1 && owned < 0.2` primero el shader no compilaba en ANGLE.
- **Vida urbana (`life.ts`).** 80 coches (34 en móvil) y 64 peatones (26) por calles reales de la capa `streets`, una malla instanciada cada uno. Ida y vuelta por su calle con cambio de sentido lento (sin saltos). Peatones: cápsulas de 6 lados por las aceras. Coste medido: 1,4 ms por fotograma.
- **Camiones con anuncio.** 12 camiones de carga (`t:1`…`t:12`), caja de 6,1 × 2,35 m con panel por ambas caras; son unidades comprables como las demás. Prefieren las calles largas cercanas al centro.
- **Catedral.** Las torres se modelaban como cajas que empezaban a 41,8 m (sin base), así que donde sobresalían de la huella se veía el hueco. Ahora arrancan en el suelo (`tools/build-landmark-glb.mjs`).
- **La Farola.** Modelo propio (`tools/build-farola-glb.mjs`): casa del farero, torre troncocónica con moldura, balcón, linterna acristalada y cúpula. Altura total 33 m (estimada: el IAPH da 21,64 m para la torre, la Real Academia de Bellas Artes 33 m, alguna guía 37 m).

## Cruceros, seguimiento y nombres (2026-10-10)

- **Cruceros.** Cada crucero zarpa escalonado (el primero a los ~50 s, los demás cada ~2 min), visita hasta tres puntos de mar abierto elegidos al azar (distintos para cada barco y separados entre sí) por A* sobre agua libre, y vuelve a amarrarse. Velocidad de crucero 2,6 m/s (≈ 5 nudos) con 45 s de aceleración y de frenada; espera ~5 min en el atraque entre viajes. A t = 0 todos siguen amarrados. `cruiseCycleSeconds` pasa a fijar solo la espera (35 % del valor).
- **Seguimiento.** Al pinchar (o abrir con `?unit=`) un objeto móvil —cartel de crucero, vela, camión, avioneta— la cámara lo sigue: el foco lo persigue con suavidad, también en altura (`setFollow`). Se puede orbitar y acercar; se suelta con «Dejar de seguir», Escape, cerrar la ficha, elegir otro edificio o desplazar la vista con el botón derecho.
- **Nombre del anunciante.** Al editar un anuncio, la última compra del espacio recibe el nombre nuevo: «Últimas compras» y «Mayores propietarios» enseñan el nombre actual. Una compra ya sustituida conserva el nombre con el que se hizo.

## Cámara: zoom al pinchar anuncios y «Vista inicial» a la primera (2026-10-10)

- **Zoom al pinchar.** Si el edificio o local pinchado tiene anuncio y la cámara está a más de 450 m, la cámara se acerca a él (misma distancia que al abrir un enlace `?unit=`). Más cerca, ya se está mirando de cerca y no se mueve. Los espacios sin anuncio no acercan.
- **«Vista inicial» a la primera.** El retorno se cancelaba solo: el motor lo arrancaba y DESPUÉS soltaba la selección, y `setHold` marcaba una interacción que cancelaba el retorno (también un vuelo en curso o el hover mientras volvía). Ahora se suelta primero todo (vuelo, seguimiento, selección) y `setHold` no cancela un retorno ya iniciado. Quien toca el mapa sigue cancelándolo. Cubierto por tests de cámara (fallan con la regla antigua).

## Fondo de contornos a todo el ancho
- Los SVG de contornos se pintaban con la proporcion 1920x3000 y en pantallas anchas solo cubrian una banda central. Ahora el lienzo es `-1920 0 5760 3000` con `slice`, y el dibujo original se repite en espejo a izquierda y derecha (`<use>`), sin costuras. `tools/build-contours.mjs` genera ya este formato.

## Modo "Explorar a pie"
- Solo escritorio (ratón y teclado): el boton no se ofrece en movil. Personaje low poly con camara en tercera persona; WASD/flechas, Mayus corre, Espacio salta (con margen antes y despues de pisar), arrastrar mira, rueda acerca la camara, Esc sale.
- Logica pura en `src/lib/scene/walker.ts` (probada en `walker.test.ts`): suelo plano, edificios de mas de 1 m como muros (rejilla de 48 m, el personaje se desliza), agua profunda y borde de la zona cubierta no se cruzan. La camara orbital se suspende (`setSuspended`) mientras se camina y vuelve donde estaba el personaje al salir.
- No se sube a tejados ni hay coche: se descarto por coste frente a lo que aporta en un mapa low poly.

## Primera persona, super velocidad y salto al mapa del mundo
- En el modo a pie: V alterna primera/tercera persona y F la super velocidad (42 m/s, salto de 3,4 m, campo de vision que se abre, camara que se retira y rayas de velocidad en un lienzo superpuesto). El avance va en pasos de 0,3 m para no atravesar muros finos.
- Alejar el zoom con la camara ya en el maximo (`onZoomOutPast` en `camera.ts`, rueda o pellizco) encoge toda la vista hacia el punto de Malaga del mapa de puntos de la portada (`WorldTransition.tsx`); con un empujon mas queda el mapa a pantalla completa. Acercar el zoom o pulsar el punto lleva a la ciudad. Todo depende de un unico valor `p` (0 ciudad, 1 mapa), asi que ida y vuelta son la misma animacion y soltar a medias la deshace. Con la ciudad oculta el motor deja de dibujar (`setRenderPaused`).

## Modo a pie: solo primera persona, mas suave, y puentes
- Se elimina el personaje y la tercera persona: se camina siempre en primera persona (FOV 90, ojos a 1,65 m). La super velocidad pasa a 30 m/s con aceleracion progresiva, FOV +11, sin temblor de camara y rayas mas lentas y tenues.
- Puentes, muelles, escolleras, muelles de carga y escaleras (capa `surface`) se pueden cruzar aunque esten sobre el agua (`overWater` en `WalkWorld`).

## Puntos de compartido y actividad en directo
- Cada vez que alguien que NO es el dueno copia el enlace de un anuncio, el anuncio suma un punto (`market_shares`, `lib/shares.ts`). Una persona (huella sin cookies: conexion + navegador) suma como maximo un punto por anuncio y dia; el dueno (por cuenta, por correo de invitado o por enlace privado de edicion), los administradores y los robots no suman; solo puntuan espacios con anunciante. Es una estimacion: copiar el enlace no prueba que se envie, pero el limite por persona y dia quita el incentivo a inflarlo. POST con limite de 20/min por IP y cuerpo de 4 kB.
- Ranking publico "Anuncios mas compartidos" en la pagina de la ciudad y pestanas Mas caros / Compartidos / Actividad en el visor; "Actividad en directo" sustituye a "Ultimas compras" y un aviso en el visor ensena lo que ocurre mientras se mira el mapa.
- Las altas de cuenta (`recordLogin`) deben ESPERARSE en el Worker: una promesa suelta se corta al devolver la respuesta y las cuentas nuevas no llegaban al panel. `/api/auth/me` anota tambien a quien ya tenia sesion.
- El formulario de compra solo enfoca el primer campo al abrirse: antes volvia a hacerlo en cada redibujado del padre.

## Fotos por lados del edificio, sin espejo
- Una cara de un edificio es ahora un LADO: paredes seguidas que miran hacia el mismo sitio (fachada curva, con quiebros o con escalones de menos de 5 m) forman una sola cara y la foto se reparte entera a lo largo de ella por la proyeccion sobre el lado (`buildingFaces`, `faceStrip` en `market/faces.ts`). Las paredes de los escalones no llevan foto. Las caras de anuncios existentes usaban `all`, asi que no se rompe ningun anuncio.
- Espejo: con huellas antihorarias u crecia hacia la izquierda visto desde fuera, asi que toda foto de fachada salia invertida (`faceFlipsU` lo corrige para cualquier cara). En el techo, v iba al reves que z (`roofUVs`). Mapa y estudio de compra usan la misma geometria.

## Bordillos solo donde hay orilla de calzada
- Aparecian lineas rectas finas cruzando calles y suelo: bordillos dibujados en aristas que no son orilla (cortes entre teselas con buffer, empalmes entre dos trozos de la misma calle y espinas degeneradas del recorte). Ahora una arista (revisada cada 10 m) solo lleva bordillo si hay calzada a un lado y nada al otro (`isKerb` en `scene/roads.ts`); se descartaron unos 17.500 trozos de 55.000. Se comprobo apagando el grupo `marcas-viales`: las lineas desaparecian con el.

## Contador de visitas en el visor
- Un circulo con un ojo y el total de personas distintas que han entrado en la web (el mismo dato del panel de admin) arriba en el centro del visor, solo en pantallas desde 640 px (en movil se solapa con los botones). `GET /api/visits` es publico, solo devuelve el total, y se cachea un minuto en el borde y otro en la instancia (`visitTotal`). Si no se puede leer, no se muestra nada.
