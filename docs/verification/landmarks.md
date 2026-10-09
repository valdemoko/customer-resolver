# Edificios emblemáticos de Málaga

Qué se ha identificado, qué altura tiene cada uno y **de dónde sale esa cifra**.
Fecha de la comprobación: 2026-10-09. Las fuentes se consultaron ese día.

Regla que se ha seguido: **una altura solo se publica con fuente**. Donde no hay
fuente independiente se deja la del paquete de datos (plantas declaradas en
OpenStreetMap) y se dice. No se ha inventado ningún detalle de fachada.

## Resumen

| Emblemático | En los datos | Altura que muestra el visor | Fuente de la altura | Fidelidad |
| --- | --- | --- | --- | --- |
| **Catedral de Málaga** («La Manquita») | `way/1015333951` · huella de 7.515 m² | 84 m (torre norte) · bóvedas 41,79 m · 92 m con el arpón | es.wikipedia.org/wiki/Catedral_de_Málaga | **Modelo propio GLB** (`public/models/malaga/catedral.glb`) |
| Ayuntamiento | `way/183870930` | 12 m (4 plantas declaradas en OSM) | Sin fuente independiente: se mantiene la del paquete | Volumen simplificado, tono propio |
| Palacio Episcopal | `relation/12349070` | 12 m (4 plantas declaradas en OSM) | Sin fuente independiente: se mantiene la del paquete | Volumen simplificado, tono propio |
| **Alcazaba de Málaga** (B.4) | `way/436786724` (recinto `historic=castle`) + murallas, torres y puertas | Estimadas: lienzo exterior 7 m, interior 9 m, torres 13 m, Homenaje 17 m, puertas 8 m | **Sin fuente técnica** (ver «Alcazaba y Gibralfaro» más abajo) | **Geometría compuesta**, «simplificado» |
| **Castillo de Gibralfaro** (B.4) | `way/403541689` + murallas y torres | Torre Mayor 17 m (**con fuente**); lienzos 8 m y torres 12 m estimados | es.wikipedia.org/wiki/Castillo_de_Gibralfaro | **Geometría compuesta**, «simplificado» |
| Teatro Romano | **no hay polígono**: solo el «Centro de Interpretación del Teatro Romano» (`way/68341499`, 3 m) | — | — | No se dibuja |

El Teatro Romano **no está como edificio en el paquete**: son ruinas que
OpenStreetMap no cartografía como `building`. Dibujar un volumen donde los datos
no lo tienen sería inventar geografía, así que no se hace. **La Alcazaba y
Gibralfaro sí tienen ahora planta cartografiada** (murallas, torres, puertas) y se
construyen a partir de ella; lo que no tienen es altura publicada ni relieve.

## Catedral: qué viene de una fuente y qué no

**Con fuente** (es.wikipedia.org/wiki/Catedral_de_Málaga):

- «La torre norte se eleva hasta los 84 metros de altura y 92 metros si medimos
  hasta el arpón.»
- Bóvedas de **41,79 m**, «las bóvedas de catedral más altas de toda
  Andalucía».
- Planta rectangular de tres naves, la central más ancha que las laterales, **las
  tres a la misma altura** (iglesia de planta de salón). Por eso el cuerpo
  entero se modela a la altura de la bóveda.
- Torre sur sin construir: la catedral nunca recibió su segunda torre completa.

Otras fuentes consultadas dan 87 m para la torre norte; se ha tomado la cifra de
la Wikipedia en español porque es la única que distingue la torre del arpón (84 m
frente a 92 m) y es consistente con las dos. **No se ha podido confirmar contra
una fuente del Cabildo ni un levantamiento.**

**Medido sobre la ortofoto PNOA** (IGN, `docs/verification/ortho/catedral-pnoa.jpg`):

- Huella: la de OpenStreetMap (119,2 × 89,6 m en su rectángulo mínimo).
- Posición de las dos torres y de la retícula de cúpulas de la azotea (4 × 3 sobre
  las naves, seis mayores sobre el crucero y cuatro pequeñas en la cabecera).
  Medidas a ojo sobre la imagen, con ±3 m de incertidumbre.

**Estimado, sin fuente** (se marca como tal en la ficha del edificio):

- La altura de la **torre sur inacabada** (56,4 m) y el reparto en cuerpos de las
  dos torres.
- El lado de las torres (19,2 m) y la elevación de las cúpulas (2,3 m, las
  mayores 3,7 m).
- La altura de la cubierta de las naves: se usa la de la bóveda (41,79 m) porque
  no hay otra cifra. La real, por fuera, será algo mayor.

**No se modela**: portadas, rosetones, imaginería, contrafuertes, ventanas.

## Qué se corrigió en los datos

- El paquete da a la catedral **3 m de altura** (`catastro_gfa_derived`): la
  superficie construida del Catastro dividida por la huella da un resultado
  absurdo para un edificio de ese tamaño. Es el dato más claramente erróneo que
  se ha encontrado en la capa de edificios. El visor lo sustituye por la altura
  documentada y lo declara como «altura de un edificio emblemático, con fuente».
  El pipeline **no** se ha tocado.
- «Garaje Catedral» se pintaba con el tono de hito porque el reconocimiento era
  por nombre. Ahora solo llevan tono propio los emblemáticos de la configuración.

## Verificación: ortofoto y diez puntos de control

Capturas comparativas en `docs/verification/shots/`:

- `catedral-ortofoto.jpg` (copia en `ortho/`): ortofoto PNOA, norte arriba.
- `catedral-cenital.png`: el modelo visto desde arriba, norte arriba.
- `catedral-comparativa.png`: las dos juntas.
- `galeria-3-catedral.png`, `galeria-4-catedral-desde-el-este.png`: vistas
  oblicuas.

Diez puntos de control: vértices de la huella de OpenStreetMap repartidos por el
contorno y superpuestos sobre la ortofoto PNOA (`catedral-superposicion.png`,
generada por `tools/landmark-overlay.mjs`). Resultado, **leído a ojo sobre la
superposición** (no hay un detector automático de bordes): los 10 puntos caen
sobre el muro visible del edificio o a menos de ~8 píxeles de él (1 px ≈ 0,25 m,
es decir, ≲ 2 m). La excepción es la **torre norte**: la huella de OpenStreetMap
no la incluye entera (queda fuera, al noroeste de la esquina de la huella), por
eso las torres se han colocado midiendo sobre la ortofoto y no sobre la huella.

## Cómo se regenera el modelo

```bash
node tools/build-landmark-glb.mjs
```

Lee la huella de `data-pipeline/build/malaga.buildings.geojson`, la limpia
(96 → 66 vértices) y escribe `public/models/malaga/catedral.glb` (~84 KB, 1.150
triángulos). El modelo se estira a su rectángulo mínimo, así que sigue la huella
de OpenStreetMap aunque los datos se regeneren.

## Fallos reales encontrados al hacerlo

1. **Edificios partidos entre teselas.** Un edificio que cruza el borde de dos
   teselas llega en dos trozos con el mismo `osm_id`. El código antiguo dibujaba
   cada trozo pero solo registraba el primero; el nuevo los **une** (polygon-
   clipping) en un solo polígono. La catedral estaba partida: la mitad este no
   tenía volumen en el modelo ni respondía al ratón.
2. **`earcut` triangula solo una parte si hay vértices duplicados**, sin avisar. Se
   limpian los vértices repetidos antes de triangular (`dedupeRing`).


## Alcazaba y Gibralfaro (B.4)

Fecha de las consultas: 2026-10-09.

### Qué sale de fuentes y qué es estimación

**De los datos (OpenStreetMap, ODbL)** — la planta, toda cartografiada por la
comunidad, sin tocar:

| Elemento | Identificadores OSM | Cuántos |
| --- | --- | --- |
| Recinto de la Alcazaba | `way/436786724` (`historic=castle`, «Alcazaba de Málaga»), con `way/255882631` como solar | 1 |
| Recinto del castillo | `way/403541689` (`historic=castle`, «Castillo de Gibralfaro») | 1 |
| Lienzos de muralla | `barrier=city_wall` / `historic=citywalls`: p. ej. `way/183832022`, `way/907013705`, `way/436786721`, `way/675767211` (Alcazaba, doble recinto); `way/403542644` y `way/403542997` (**la coracha**: dos lienzos paralelos de ~300 m que suben a Gibralfaro); `way/404808711`, `way/1226684017`, `way/1226684007` (Gibralfaro) | 26 tramos |
| Torres con nombre | Torre del Homenaje `way/194708337`, Torre de la Armadura Mudéjar `way/194708336`, Torre de Maldonado `way/194708335`, Torre del Cristo `way/194549765`, dos Torres Albarranas `way/194549764` y `way/193845448`, más torres defensivas sin nombre | 14 |
| Puertas | Puerta de la Bóveda `way/68342863`, Puerta de las Columnas `way/194549763`, Puerta de los Cuartos de Granada `way/194708334` | 3 |
| Edificios del interior del recinto | los de la capa de edificios cuyo centroide cae dentro del recinto | los que haya |

**De fuentes escritas** (es.wikipedia.org, consultadas el 2026-10-09):

- *Alcazaba de Málaga*: «su doble recinto amurallado» (cita a Torres Balbás); «tres
  recintos concéntricos amurallados y alargados, y ocho puertas fortificadas» hasta
  el palacio; Torre del Homenaje del siglo XIV; la Puerta de los Siete Arcos, único
  acceso al recinto superior, en la Torre de los Cuartos de Granada; superficie
  actual 15.000 m². **No publica alturas** de muros ni torres.
- *Castillo de Gibralfaro*: **altura de la colina 130 m s. n. m.**; **Torre Mayor,
  17 m**; «dos líneas de murallas y ocho torreones»; la coracha, un pasillo
  amurallado en zigzag que lo une con la Alcazaba. **No publica la altura de los
  muros.**
- Una página divulgativa (merca2.es) cita muros de «más de 3 m» (exterior) y «más
  de 10 m» (interior). **No se usa**: no cita fuente y las demás no la respaldan.

**Estimado, sin fuente** (declarado en `scene.fortresses[].heightSource` y en la
ficha del edificio):

| Pieza | Alcazaba | Gibralfaro |
| --- | --- | --- |
| Lienzo exterior | 7 m | 8 m |
| Lienzo interior (a menos de 75 m del Homenaje) | 9 m | 8 m |
| Torres | 13 m | 12 m |
| Torre del Homenaje | 17 m | — |
| Torre Mayor | — | **17 m (con fuente)** |
| Puertas | 8 m | 8 m |
| Edificios interiores sin altura de fuente | 6 m | 6 m |
| Almenas (genéricas) | 1 m | 1 m |
| Grosor de los lienzos | 2,2 m / 2,8 m | 2,2 m / 2,8 m |

Todo se dibuja con la exageración vertical ×1,25 y la ficha muestra la cifra real.
El reparto «interior / exterior» es una regla geométrica (distancia al Homenaje),
no un dato: es una **estimación**.

### Qué NO se modela (y se dice)

- **El relieve.** La Alcazaba está en la ladera del Gibralfaro y el castillo a
  130 m s. n. m.; el visor dibuja el terreno **plano**. Un castillo sobre suelo
  plano **pierde fidelidad**: no se ven los desniveles entre recintos ni la subida
  real de la coracha. La planta (ubicación en el plano) sí es la de los datos.
- Los interiores (salas del palacio nazarí), las bóvedas, los arcos, las cubiertas
  y los patios con sus jardines. El suelo del recinto se pinta de un tono arena
  (el «patio»), sin más detalle.
- La Puerta de los Siete Arcos y las demás puertas como tales: solo las tres con
  polígono propio en OSM se dibujan como bloque bajo.
- Las almenas son un detalle **genérico** (cubos de 1 m cada ~3 m): la Alcazaba las
  tiene, pero su forma real no se reproduce.

### Solución propuesta para el relieve

Un modelo digital de elevaciones con **licencia clara** y resolución suficiente.
Candidatos, a verificar uno a uno antes de usarlos (no se ha descargado ni
comprobado ninguno en esta fase):

1. **MDT05/MDT02 del CNIG-IGN** (malla de 5 m / 2 m). Los productos del CNIG se
   distribuyen bajo CC BY 4.0 según su centro de descargas: **hay que confirmar la
   licencia vigente del producto concreto** y citar la atribución.
2. **Copernicus DEM GLO-30** (30 m): licencia abierta, pero 30 m es poco para una
   ladera de 60 m de desnivel en 250 m.
3. Teselas ráster «terrarium» abiertas: mezclan fuentes con licencias distintas; no
   se aconsejan para un producto comercial sin revisar cada una.

Pasos: convertir el MDT a una textura de alturas por tesela en el pipeline,
muestrearla en cada vértice del suelo y de las bases de edificio, y subir la
cámara y el agua en consecuencia. Es una fase propia: toca el suelo, las bases, los
árboles, la cámara y el campo de costa del agua.
