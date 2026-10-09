# Masas de agua tratadas (B.4)

Generado por `data-pipeline/steps/03c-surface.mjs` (informe `build/malaga.surface-report.json`) el 2026-10-09. Zona: círculo de 1400 m de radio centrado en -4.4185, 36.715 (lon, lat), más banda de difuminado de 250 m; recorte de geometría a 1710 m.

## Cómo se ha buscado el agua

Consulta Overpass (paso 01) con `natural=*` (way y relation), `water=*`, `waterway=*`, `amenity=fountain`, `man_made=*` (muelles, espigones, diques), `harbour=*`, `seamark:type=*`, `leisure=marina` y `natural=coastline`. Cada elemento se clasifica y se trata así:

| Origen en OpenStreetMap | Qué se hace |
| --- | --- |
| `natural=coastline` (7 ways encadenados) | Se construye **el mar** como UN polígono: costa recortada al cuadrado de trabajo, cierre en sentido horario (tierra a la izquierda, agua a la derecha). Puerto, dársenas y mar abierto son la misma superficie: **no hay costura**. |
| `man_made=pier|quay|breakwater|groyne` cerrado (20 polígonos) | Cubierta sólida que **se resta del mar** y se dibuja como muelle, espigón o dique a la cota del suelo. |
| `man_made=pier|quay` abierto (16 líneas; 15 sobre el agua) | Pantalanes: cinta de 2,2 m flotando sobre la lámina; sirven de amarres a los barcos pequeños. |
| `natural=water`, `water=*`, `waterway=riverbank|dock`, `amenity=fountain` (way cerrado o relation) | Masa propia, con el nivel de su tipo. |
| `waterway=*` abierto (22 líneas) | **Se trata pero no se dibuja**: no tiene anchura en OSM. El cauce ancho del Guadalmedina ya viene como polígono. |
| `man_made=reservoir_covered`, `man_made=water_well` | Excluidos: depósito cubierto o pozo, no son superficie visible. |
| `leisure=swimming_pool` | Excluidas (18 piscinas privadas): no son masas de agua de la ciudad. |

## Nivel de la lámina (visual)

La lámina queda por **debajo** del suelo de muelles y orillas (y = 0). Cifras de la configuración (`scene.water.levelsM`); OSM no publica cotas de lámina, así que son visuales:

| Tipo | Nivel |
| --- | --- |
| sea | -1,6 m |
| dock | -1,6 m |
| river | -1 m |
| stream | -0,5 m |
| pond | -0,5 m |
| reservoir | -0,6 m |
| basin | -0,4 m |
| fountain | -0,35 m |
| water | -0,5 m |

## Resumen

- **Masas dibujadas: 60** (1 mar + 59 menores): sea 1 · river 2 · pond 2 · fountain 39 · stream 3 · water 11 · basin 1 · reservoir 1.
- Estructuras portuarias que se restan del mar: 20.
- Descartadas por quedar cubiertas por otra masa o por el mar, o no ser visibles: 9.
- Líneas de agua tratadas y no dibujadas: 22.

## El mar

| Id | Nombre | Superficie |
| --- | --- | --- |
| sea | Mar y puerto de Málaga | 3.197.799 m² (3,20 km²) |

## Masas menores

| Id OSM | Tipo | Nombre | Superficie |
| --- | --- | --- | --- |
| relation/17601879 | river | — | 73.793 m² |
| way/183313268 | river | — | 21.747 m² |
| relation/1418373 | pond | — | 4898 m² |
| relation/13147418 | fountain | Fuente de la Solidaridad | 864 m² |
| way/667881670 | stream | — | 701 m² |
| way/98989979 | pond | — | 604 m² |
| relation/11107408 | fountain | Fuente de las Américas | 539 m² |
| way/1121660088 | fountain | Fuente de los Amorcillos | 375 m² |
| way/471077943 | stream | — | 246 m² |
| way/582972781 | fountain | Fuente de las Tres Gracias | 207 m² |
| way/669244504 | fountain | Fuente del Palmeral de las Sorpresas | 200 m² |
| way/582970078 | fountain | Fuente de la Plaza de la Marina | 192 m² |
| way/583188940 | fountain | Fuente de La Coracha | 131 m² |
| way/583189837 | water | — | 92 m² |
| way/667158728 | stream | — | 79 m² |
| way/461367702 | fountain | Fuente de la Malagueta | 71 m² |
| way/832977693 | fountain | Fuente de las Tres Gitanillas | 64 m² |
| way/583191069 | water | — | 59 m² |
| way/925749834 | fountain | Fuente de la Lex Flavia | 57 m² |
| way/582970789 | fountain | Fuente de Génova | 56 m² |
| way/1303742633 | fountain | — | 48 m² |
| way/665555088 | water | — | 47 m² |
| way/1163888515 | fountain | Fuente de la Plaza Legión Española | 44 m² |
| way/979385906 | fountain | Fuente del Monumento a Enrique Navarro | 40 m² |
| way/890963267 | water | — | 40 m² |
| way/566457000 | basin | Fuente de los Jardines de Picasso | 40 m² |
| way/492628451 | fountain | — | 34 m² |
| way/529677169 | fountain | Fuente de Bailén | 31 m² |
| way/193845514 | water | — | 25 m² |
| way/194708361 | water | — | 25 m² |
| way/490167717 | fountain | — | 24 m² |
| way/490167741 | fountain | — | 24 m² |
| way/668782041 | fountain | Fuente del Hotel Barceló Málaga | 22 m² |
| way/1062558994 | water | — | 22 m² |
| way/1562740558 | fountain | — | 19 m² |
| way/545002647 | fountain | — | 17 m² |
| way/1125895464 | water | — | 14 m² |
| way/582970077 | fountain | Fuente de Plaza del Obispo | 13 m² |
| way/1116025695 | fountain | Fuente de la Plaza de las Flores | 12 m² |
| way/1125897104 | water | — | 12 m² |
| way/583182604 | fountain | Fuente de la Glorieta de Narciso Díaz | 11 m² |
| relation/14333196 | fountain | El Baño de Diana y Acteón | 10 m² |
| way/583155679 | fountain | — | 8 m² |
| way/194708358 | water | — | 7 m² |
| way/194708359 | water | — | 7 m² |
| way/583210904 | fountain | Fuente de la Diosa Pomona | 6 m² |
| way/583471494 | fountain | — | 5 m² |
| way/665554341 | fountain | Fuente de los Jardines de Puerta Oscura | 5 m² |
| way/583153686 | fountain | Fuente de la Plaza de la Aurora | 5 m² |
| way/582970418 | fountain | Fuente del Jardín del Palo Borracho | 4 m² |
| way/1121166189 | fountain | Fuente de la Judería | 4 m² |
| way/583095872 | fountain | Fuente de la Ninfa del Cántaro | 4 m² |
| way/583095878 | fountain | Fuente de la Ninfa de la Caracola | 4 m² |
| relation/13218350 | fountain | Fuentes de la Plaza del Carbón | 3 m² |
| way/1148248495 | fountain | — | 3 m² |
| way/872312678 | fountain | — | 3 m² |
| way/468713376 | reservoir | — | 1 m² |
| way/1125771875 | fountain | Fuente de la Cruz de Lagunillas | 1 m² |
| way/583200597 | fountain | Fuente del Patio de Armas | 1 m² |

## Estructuras portuarias (restadas del mar)

| Id OSM | Tipo | Nombre | Superficie |
| --- | --- | --- | --- |
| way/183257786 | quay | Muelle 9 - Polivalente | 384.593 m² |
| way/1217537928 | quay | Muelle de Zona de Levante | 132.595 m² |
| way/1332128668 | quay | Muelle 6 y 7 - Romero Robledo | 96.270 m² |
| way/1217537932 | quay | Muelle 4 - Heredia | 68.634 m² |
| way/1217537929 | quay | Muelle 1 - Ricardo Gross | 57.541 m² |
| way/1217537936 | quay | Muelle Pesquero | 25.809 m² |
| way/808764812 | pier | Muelle de Levante | 19.271 m² |
| way/808776403 | breakwater | — | 11.376 m² |
| way/1228381346 | breakwater | — | 9228 m² |
| way/665300769 | breakwater | — | 9124 m² |
| way/1228381345 | breakwater | — | 8874 m² |
| way/191212440 | pier | — | 5240 m² |
| way/808776402 | breakwater | — | 4655 m² |
| way/667158766 | breakwater | — | 3807 m² |
| way/150968788 | pier | Muelle Adosado al Dique de Levante | 3151 m² |
| way/808776401 | pier | Dique de San Andrés | 1568 m² |
| way/1332128670 | breakwater | — | 1098 m² |
| way/1228381344 | breakwater | — | 192 m² |
| way/665300767 | breakwater | — | 133 m² |
| way/1339136365 | pier | — | 46 m² |

## Líneas de agua tratadas y no dibujadas

| Id OSM | Tipo | Nombre |
| --- | --- | --- |
| way/35770507 | stream | Arroyo Toquero |
| way/183857737 | river | Río Guadalmedina |
| way/352216426 | stream | — |
| way/352216427 | stream | — |
| way/516760335 | stream | — |
| way/516760337 | stream | — |
| way/516760345 | stream | — |
| way/516764653 | stream | — |
| way/536617352 | stream | Arroyo de los Ángeles |
| way/536617353 | stream | Arroyo de los Ángeles |
| way/978238194 | drain | — |
| way/978238195 | stream | — |
| way/978238196 | stream | — |
| way/978238197 | stream | — |
| way/978238200 | weir | — |
| way/978238202 | weir | — |
| way/978238204 | weir | — |
| way/992220117 | drain | Arroyo del Calvario |
| way/992220118 | stream | Arroyo del Calvario |
| way/1052763136 | drain | — |
| way/1332127545 | ditch | — |
| way/1332127546 | ditch | — |

## Excluidas

| Id OSM | Nombre | Motivo |
| --- | --- | --- |
| way/194709304 | Pozo Airón | water_well: depósito cubierto o pozo, no es una superficie visible |
| way/153212850 | — | queda cubierta por otra masa mayor o por el mar |
| way/664882453 | — | queda cubierta por otra masa mayor o por el mar |
| way/675723311 | — | queda cubierta por otra masa mayor o por el mar |
| way/668782046 | — | queda cubierta por otra masa mayor o por el mar |
| way/1076770659 | — | queda cubierta por otra masa mayor o por el mar |
| way/1138456286 | — | queda cubierta por otra masa mayor o por el mar |
| way/1138456287 | — | queda cubierta por otra masa mayor o por el mar |
| way/1138456288 | — | queda cubierta por otra masa mayor o por el mar |
