# Verificación de Málaga

Qué se ha comprobado sobre los datos publicados de Málaga, con qué método y con
qué resultado. Todo lo que aparece aquí lo escribe el pipeline
(`data-pipeline/steps/05-verify.mjs` y `06-publish.mjs`), no una persona a mano:
si los datos cambian, este informe cambia con ellos.

Generado: 2026-10-09 · Versión del paquete: `2026.10.1` · 3.836 edificios

---

## Qué es esta verificación y qué no es

**No es una medición sobre el terreno** ni una comparación contra cartografía
oficial certificada. Es una comprobación de **consistencia posicional**: se toman
coordenadas de diez puntos de referencia de Málaga de una fuente que **no
alimenta el mapa en ningún punto** —Wikipedia en español— y se mide a qué
distancia caen de la geometría publicada. Si el mapa estuviera desplazado, mal
proyectado o con los ejes intercambiados, las distancias lo delatarían.

Sirve para detectar errores gruesos (desplazamientos de decenas o cientos de
metros, proyecciones mal aplicadas, geometrías invertidas). **No** sirve para
afirmar que cada fachada está en su sitio al centímetro: para eso haría falta
ortofoto o levantamiento, y no se ha hecho.

---

## Método

1. **Coordenada independiente por artículo exacto.** Cada punto de control nombra
   su artículo de Wikipedia y la coordenada se pide a
   `action=query&prop=coordinates` de la API de Wikipedia en español. Se guarda
   el `pageid` y el título resuelto, así que se puede abrir el artículo y ver la
   misma coordenada que usa este informe.

2. **Contraste por búsqueda de área.** Además se recorre una rejilla de 25 centros
   (radio 500 m) con `list=geosearch` y se comprueba si el punto aparece también
   por ahí. Son dos vías distintas del mismo servicio: si la coordenada fuera un
   error de un único endpoint, el contraste lo mostraría.

3. **Distancia medida.** Para cada punto se calcula, con distancia de Haversine, la
   distancia al vértice de edificio más cercano, si cae dentro de alguna huella,
   y la distancia al vértice de calle más cercano (con su nombre).

### Un error de método corregido

La primera versión buscaba artículos geolocalizados en un radio y **emparejaba
por subcadena del título** («marina» valía para cualquier cosa que contuviera esa
palabra). Salió mal de dos maneras medibles:

- `list=geosearch` con `gslimit=100` devuelve **como máximo 100 artículos**. En el
  centro de Málaga hay más de 100 artículos geolocalizados dentro de 350 m, así
  que la lista se truncaba a los más cercanos. Resultado: **cinco de los diez
  puntos «no tenían coordenada» cuando sí la tienen** (Teatro Romano, Alcazaba,
  Gibralfaro, Plaza de la Merced y Ayuntamiento).
- El emparejamiento por subcadena podía hacer pasar la coordenada de un artículo
  distinto como si fuera la del punto de control.

Se corrigió pidiendo la coordenada del artículo exacto y dejando la búsqueda por
área como contraste. Con la rejilla de 25 consultas: **285 artículos únicos, 0
consultas truncadas** (frente a la truncación sistemática de la versión anterior).

---

## Puntos de control

Diez puntos, todos con coordenada independiente y todos dentro del área
publicada.

| # | Punto | Artículo (Wikipedia es) | `pageid` | Longitud, latitud | Edificio más cercano | Calle más cercana | En búsqueda por área |
| - | ----- | ----------------------- | -------- | ----------------- | -------------------- | ----------------- | -------------------- |
| 1 | Plaza de la Constitución | Plaza de la Constitución (Málaga) | 2232723 | -4.422207, 36.721299 | 3,5 m (fuera) | 1,1 m — Calle Rodríguez Rubí | sí |
| 2 | Calle Larios | Calle Marqués de Larios | 881721 | -4.421622, 36.719828 | 9,6 m (fuera) | 10,0 m — Calle Strachan | sí |
| 3 | Plaza de la Marina | Plaza de la Marina | 2249350 | -4.420550, 36.717992 | 42,3 m (fuera) | 8,4 m — sin nombre | sí |
| 4 | Catedral de Málaga | Catedral de Málaga | 185733 | -4.420120, 36.720042 | 5,1 m (fuera) | 5,4 m — Calle Molina Lario | sí |
| 5 | Ayuntamiento de Málaga | Ayuntamiento de Málaga | 397712 | -4.414995, 36.720295 | 12,5 m (**dentro** de una huella: «Ayuntamiento de Málaga») | 23,9 m — sin nombre | sí |
| 6 | Mercado de Atarazanas | Mercado de Atarazanas | 1676833 | -4.424067, 36.718440 | 18,2 m (**dentro** de una huella) | 14,8 m — sin nombre | sí |
| 7 | Teatro romano de Málaga | Teatro romano de Málaga | 406218 | -4.416871, 36.721189 | 7,6 m (fuera) | 25,2 m — sin nombre | sí |
| 8 | Alcazaba de Málaga | Alcazaba de Málaga | 126137 | -4.415746, 36.721181 | 14,1 m (**dentro** de una huella: «Palacio Nazarí») | 2,5 m — sin nombre | sí |
| 9 | Castillo de Gibralfaro | Castillo de Gibralfaro | 38045 | -4.411637, 36.723223 | 3,9 m (fuera) | 12,9 m — sin nombre | sí |
| 10 | Plaza de la Merced | Plaza de la Merced (Málaga) | 2232490 | -4.417508, 36.723297 | 26,1 m (fuera) | 3,9 m — sin nombre | sí |

**Resultado: 10 de 10 puntos verificados, 10 de 10 dentro del área publicada,
10 de 10 confirmados también por la búsqueda por área, 9 de 10 a menos de 40 m de
la geometría publicada.**

### Cómo se leen estos números

- **Los tres puntos que caen «dentro» de una huella son la mejor señal**: la
  coordenada de Wikipedia del Ayuntamiento cae dentro de la huella de OSM del
  Ayuntamiento, la del Mercado de Atarazanas dentro de su mercado, y la de la
  Alcazaba dentro de un volumen del recinto. No puede pasar por casualidad.
- **Los puntos con coordenada en el centro de una plaza o calle no caen dentro de
  ninguna huella, y eso es correcto.** Una plaza es espacio abierto: no hay
  edificio debajo. Por eso la medida útil en esos casos es la distancia a la
  calle, que va de 1,1 m (Plaza de la Constitución → Calle Rodríguez Rubí) a
  10,0 m (Calle Larios → Calle Strachan).
- **El caso de 42,3 m (Plaza de la Marina) es el único que supera los 40 m y está
  explicado**: la coordenada de Wikipedia está en el centro de la plaza, que es un
  espacio abierto junto al puerto; lo más cercano es la calle, a 8,4 m. No hay
  edificio a esa distancia porque no lo hay de verdad.
- **Calle Larios aparece a 9,6 m del edificio más cercano y a 10,0 m de la calle
  más cercana (Calle Strachan).** La coordenada de Wikipedia de la calle es su
  punto medio; que la calle digitalizada más próxima sea *Strachan* y no *Larios*
  dice algo que conviene saber: la consulta de OSM pide `highway`, y **Calle
  Larios no tiene etiqueta `highway` en OpenStreetMap** en este extracto (es
  `highway=pedestrian` en algunas zonas, o directamente no está). La vista inicial
  del visor cae ahí igualmente, pero la calle no se dibuja con nombre propio. Es
  una limitación de la fuente, no del visor, y está anotada más abajo.

**Evidencia gráfica:** [malaga-overlay.svg](malaga-overlay.svg) — las huellas
publicadas con los diez puntos de control encima, generado desde los datos reales
por el pipeline.

---

## Contraste de alturas

Dos fuentes independientes para lo mismo: **plantas derivadas de la superficie
construida oficial del Catastro** frente a **la etiqueta `building:levels` de
OpenStreetMap**. No es una medición sobre el terreno: es el acuerdo entre dos
fuentes que se digitalizaron por separado.

- Edificios comparables: **994**
- Coinciden dentro de una planta: **939 → 94,5 %**
- Diferencia media absoluta: **0,49 plantas** (≈ 1,5 m)

### Los diez casos con mayor superficie construida

Se eligen los de mayor `grossFloorArea` del Catastro, que son los edificios
singulares del centro: son los más difíciles y, por eso, los más útiles como
prueba. **Estos diez casos NO son representativos del conjunto**: son los peores.

| Edificio | Ref. catastral | Plantas OSM | Plantas derivadas del Catastro | Superficie construida (m²) | Huella catastral (m²) | Cociente | Altura publicada | Desviación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mercado de El Carmen | 2442118UF7624S | 2 | 11 | 18.945 | 1.724 | 10,99 | 33,0 m | **+27,0 m** |
| Forus Trinidad | 2753122UF7625S | 2 | 3 | 10.402 | 4.109 | 2,53 | 9,0 m | +3,0 m |
| (sin nombre) | 3344101UF7634S | 3 | 3 | 9.947 | 3.771 | 2,64 | 9,0 m | 0,0 m |
| (sin nombre) | 4149101UF7644N | 3 | 1 | 9.421 | 7.222 | 1,30 | 3,0 m | −6,0 m |
| (sin nombre) | 3843102UF7634S | 3 | 6 | 8.518 | 1.520 | 5,60 | 18,0 m | +9,0 m |
| (sin nombre) | 2954201UF7625S | 2 | 9 | 7.789 | 855 | 9,11 | 27,0 m | **+21,0 m** |
| (sin nombre) | 2549109UF7624N | 3 | 5 | 7.362 | 1.520 | 4,84 | 15,0 m | +6,0 m |
| Antiguo Mercado de Mayoristas | 2842101UF7624S | 2 | 2 | 6.939 | 3.472 | 2,00 | 6,0 m | 0,0 m |
| (sin nombre) | 3454201UF7635S | 3 | 2 | 6.390 | 2.964 | 2,16 | 6,0 m | −3,0 m |
| Edificio de Servicios Múltiples | 3457101UF7635N | 3 | 2 | 6.379 | 2.968 | 2,15 | 6,0 m | −3,0 m |

**El caso de 27 m de desviación es un fallo conocido del método, no un dato
bueno.** El cociente entre superficie construida y huella da 10,99 «plantas»,
que es imposible para un mercado de dos alturas. La causa es que la referencia
catastral agrupa varias unidades construidas sobre una huella pequeña, así que el
numerador (superficie total de todas ellas) y el denominador (huella de una sola)
no hablan del mismo volumen. El pipeline ya descarta los cocientes absurdos por
otra vía (la comprobación de plausibilidad frente a OSM), pero **el mercado entra
en la media porque su cociente (10,99) no llega al umbral de descarte**. Se
publica tal cual: la media del 94,5 % incluye estos diez casos.

---

## Origen de las alturas publicadas

Ninguna altura del paquete es una medición. Todas son datos declarados por su
fuente, un dato oficial derivado, o el valor por defecto cuando no hay dato. El
origen viaja en cada edificio (propiedad `height_source`) y se resume así:

| Origen | Significado | Edificios | Proporción |
| --- | --- | --- | --- |
| `osm_levels` | Plantas declaradas en OpenStreetMap × 3 m | 2.737 | 71,3 % |
| `catastro_gfa_derived` | Superficie construida oficial ÷ huella del propio edificio catastral, redondeado a plantas × 3 m | 1.036 | 27,0 % |
| `default_estimate` | **Sin dato**: 3 plantas (9 m) por defecto | 56 | 1,5 % |
| `osm_height` | Etiqueta `height` de OpenStreetMap | 7 | 0,2 % |
| **Total** | | **3.836** | **100 %** |

- Altura con dato (declarado o derivado): **98,5 %**.
- Altura por defecto, marcada como estimación en el mapa y en la ficha del
  edificio: **56 edificios (1,5 %)**.
- El Catastro **no publica el número de plantas** de estos edificios: se midió
  sobre las respuestas reales del servicio y el campo viene vacío en todas
  (0 de 4.197). Lo que sí publica es la superficie construida total (4.179 de
  4.197). Por eso el origen derivado va separado del declarado en la interfaz.

### Cada edificio es una sola unidad

El pipeline encuentra 8.981 elementos `building:part` (secciones de edificio) y
**no publica ninguno**. Cada edificio es una única unidad: una sola huella con una
sola altura. Motivo: este producto vende ubicaciones sobre edificios, y un
edificio no se contrata por secciones. Un edificio dividido en cinco volúmenes
aparecía antes como cinco cosas distintas. El recuento de lo descartado se
publica igualmente (8.981 encontradas, 0 publicadas) en el informe de calidad.

---

## Limitaciones y pendientes

- **No hay verificación contra ortofoto ni contra cartografía oficial
  certificada.** Lo de arriba es consistencia posicional, no exactitud absoluta.
- **Calle Larios no aparece en la red viaria publicada** porque el extracto de OSM
  no la etiqueta con `highway` en la zona consultada. La vista inicial del visor
  cae sobre su coordenada independiente, pero el vial no se dibuja ni tiene
  nombre en el mapa.
- **El terreno (relieve) no está verificado.** La fuente de elevación (Terrain
  Tiles de Mapzen/AWS) exige una pila de atribuciones con componentes
  restrictivos cuya lectura literal está pendiente. Gibralfaro y la Alcazaba
  están a más de 100 m sobre el nivel del centro y sin relieve la ciudad queda
  plana; el relieve se carga, pero su licencia está marcada como **no
  verificada** en la ficha de la ciudad.
- **La licencia del Catastro sigue sin leerse literalmente.** El PDF usa fuentes
  con codificación propia y los extractores habituales devuelven caracteres sin
  sentido. La atribución se muestra igualmente (opción conservadora) y la fuente
  figura como pendiente de revisión.
- **Sin captura de la vista 3D persistida.** La evidencia gráfica de esta carpeta
  es el SVG generado por el pipeline desde los datos. La captura del visor en
  funcionamiento se tomó durante la revisión, pero la herramienta de navegador
  devuelve la imagen al asistente y no la escribe en el repositorio, así que aquí
  no hay un PNG del visor.
- **Sin medición sobre el terreno** de ninguna altura. Ver `docs/performance.md`
  para lo que sí se ha medido (y con qué instrumento).
