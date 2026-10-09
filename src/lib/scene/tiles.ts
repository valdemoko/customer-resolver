/**
 * Lectura de la ciudad desde el paquete PMTiles PUBLICADO.
 *
 * El visor no lee los GeoJSON intermedios del pipeline ni un archivo paralelo:
 * decodifica las MISMAS teselas que sirve el sitio. Eso tiene una consecuencia
 * que importa: lo que se ve en pantalla es exactamente lo que el pipeline
 * verificó, y si alguien publica un paquete distinto, cambia lo que se ve. Un
 * visor que se construye desde otra fuente acaba enseñando algo que nadie ha
 * comprobado.
 *
 * Los nombres de capa son los que hay DENTRO de las teselas, que no coinciden
 * con los del informe de calidad: el agua se llama `water` (no
 * `water_polygons`). Se comprobó leyendo el paquete real con
 * `node tools/inspect-tiles.mjs`, no suponiéndolo.
 */

import { PMTiles } from "pmtiles";
import type { RangeResponse, Source } from "pmtiles";
import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import polygonClipping from "polygon-clipping";
import { localFrame, tilePointToLonLat, tilesForBounds, METERS_PER_DEG_LAT } from "./geo";
import type { LonLat } from "./geo";
import type { Ring } from "./polygon";
import { ensureCounterClockwise, polygonArea } from "./polygon";

/**
 * Capas del paquete (B.4). `land`, `water` y `surface` son CLASES DISJUNTAS: el
 * pipeline ya restó edificios, agua y las clases de mayor prioridad, así que el
 * visor no resuelve solapes. `streets` solo sirve para el arbolado (las calles
 * se dibujan desde `surface`).
 */
export const TILE_LAYERS = [
  "buildings",
  "streets",
  "trees",
  "land",
  "water",
  "surface",
  "fortress",
  "berths",
  "moorings",
  "parcels",
] as const;

export type TileLayerName = (typeof TILE_LAYERS)[number];

/**
 * Tipo de los puntos que devuelve el decodificador: son instancias de la clase
 * `Point` de `@mapbox/point-geometry`, que no es dependencia directa de este
 * proyecto. En lugar de añadir un paquete solo por un tipo, se toma el tipo de
 * la propia firma de `classifyRings`: así es exactamente el que espera y no hace
 * falta ni un `any` ni un cast.
 */
type TilePoints = Parameters<typeof classifyRings>[0];

/**
 * Polígono con sus huecos (patios interiores, por ejemplo).
 *
 * `outerBorder` / `holesBorder` (B.4): por cada VÉRTICE, en qué bordes de su
 * tesela está (1 = x 0, 2 = x máx., 4 = y 0, 8 = y máx.). Una arista cuyos dos
 * extremos comparten borde es un CORTE de teselado, no una orilla: sin esto, las
 * paredes de muelle dibujaban una raya por cada borde de tesela cruzando el mar.
 */
export type Polymesh = {
  outer: Ring;
  holes: Ring[];
  outerBorder?: number[];
  holesBorder?: number[][];
};

/** ¿La arista i→i+1 de un anillo es un corte de teselado? */
export function isTileCut(flags: number[] | undefined, index: number): boolean {
  if (!flags || flags.length === 0) return false;
  const a = flags[index] ?? 0;
  const b = flags[(index + 1) % flags.length] ?? 0;
  return (a & b) !== 0;
}

export type CityFeature = {
  layer: TileLayerName;
  /** `klass` en las calles, `kind` en el resto. Vacío si no aplica. */
  kind: string;
  name: string;
  polygons: Polymesh[];
  lines: Ring[];
  points: Array<[number, number]>;
  heightM: number;
  heightSource: string;
  levels: number;
  areaM2: number;
  osmId: string;
  catastroRef: string;
  /** Árboles: género, especie y tipo de hoja tal cual los etiquetó OSM (o vacío). */
  genus: string;
  species: string;
  leafType: string;
  /** Tesela de la que salió, para poder depurar un elemento concreto. */
  tile: string;
  /** Todas las propiedades de la tesela, tal cual (subclases, orígenes, anchos…). */
  props: Record<string, string | number>;
};

export type LoadedCity = {
  features: CityFeature[];
  tilesLoaded: number;
  tilesMissing: number;
  bytes: number;
  /** Tiempo de decodificación en ms, medido, no estimado. */
  decodeMs: number;
};

export type LoadOptions = {
  /** URL del paquete, tal cual la publica el manifiesto. */
  url: string;
  /** Centro del recorte en grados: define el sistema local y el área a leer. */
  center: LonLat;
  /** Zoom de detalle. Es el zoom máximo del paquete. */
  zoom: number;
  /** Rectángulo a leer (el del recorte, en grados). */
  bounds: { west: number; south: number; east: number; north: number };
  /** Se llama por cada tesela decodificada, para poder mostrar progreso real. */
  onTile?: (loaded: number, total: number, features: number) => void;
  /** Permite abortar (salir de la página a media carga). */
  signal?: AbortSignal;
};

function numberFrom(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

/**
 * Convierte la geometría de un elemento MVT a anillos en metros locales.
 *
 * `loadGeometry()` devuelve anillos de puntos en coordenadas de tesela. La
 * conversión pasa por longitud/latitud y de ahí al sistema local en metros. Se
 * hace por punto y no por tesela completa porque los elementos se recortan en
 * los bordes: cada vértice puede estar en una posición distinta y no hay ninguna
 * transformación afín que valga para todos a la vez.
 */
function geometryToWorld(
  geometry: TilePoints,
  /** Tipo MVT: 1 punto, 2 línea, 3 polígono. */
  type: number,
  z: number,
  x: number,
  y: number,
  extent: number,
  toWorld: (lon: number, lat: number) => [number, number],
): { polygons: Polymesh[]; lines: Ring[]; points: Array<[number, number]> } {
  // CONVERSIÓN AFÍN POR TESELA (B.4). Convertir cada vértice con la inversa de
  // Mercator (`atan`, `sinh`) costaba más de la mitad de la decodificación. Dentro
  // de una tesela de zoom 17 (≈ 190 m) la latitud es lineal con el píxel con un
  // error < 0,1 mm, y la proyección local es lineal: basta con convertir las dos
  // esquinas de la tesela y interpolar. Lo comprueba `tiles.test.ts`.
  const [x0, z0] = toWorld(...tilePointToLonLat(z, x, y, extent, 0, 0));
  const [x1, z1] = toWorld(...tilePointToLonLat(z, x, y, extent, extent, extent));
  const scaleX = (x1 - x0) / extent;
  const scaleZ = (z1 - z0) / extent;
  const worldOf = (px: number, py: number): [number, number] => [x0 + px * scaleX, z0 + py * scaleZ];

  /** Anillo en metros + banderas de borde de tesela por vértice (mismo orden). */
  const toRingWithFlags = (raw: TilePoints[number]): { ring: Ring; flags: number[] } => {
    const ring: Ring = [];
    const flags: number[] = [];
    for (const point of raw) {
      ring.push(worldOf(point.x, point.y));
      flags.push(
        (point.x <= 0 ? 1 : 0) |
          (point.x >= extent ? 2 : 0) |
          (point.y <= 0 ? 4 : 0) |
          (point.y >= extent ? 8 : 0),
      );
    }
    const oriented = ensureCounterClockwise(ring);
    return { ring: oriented, flags: oriented === ring ? flags : flags.slice().reverse() };
  };
  const toRing = (raw: TilePoints[number]): Ring => toRingWithFlags(raw).ring;

  const polygons: Polymesh[] = [];
  const lines: Ring[] = [];
  const points: Array<[number, number]> = [];

  // El TIPO viene en la propia tesela; no se adivina a partir del número de
  // vértices. Los puntos van PRIMERO y sin filtrar: un punto es un anillo de UN
  // solo vértice, y el filtro de «al menos dos» que se aplica al resto los
  // descartaba todos (el arbolado entero desaparecía sin ningún aviso).
  if (type === 1) {
    for (const raw of geometry) {
      const first = raw[0];
      if (!first) continue;
      points.push(worldOf(first.x, first.y));
    }
    return { polygons, lines, points };
  }

  const rings = geometry.map(toRing).filter((ring) => ring.length >= 2);
  if (rings.length === 0) return { polygons, lines, points };

  if (type === 2) {
    lines.push(...rings);
    return { polygons, lines, points };
  }

  // Clasificación de anillos en polígonos con huecos: agrupa cada anillo
  // exterior con sus huecos. Se hace sobre los puntos CRUDOS del decodificador
  // (instancias de `Point`), que es lo que espera `classifyRings`; convertirlos
  // antes a objetos sueltos no vale, y el signo del área no cambia al pasar a
  // metros porque la proyección local no invierte los ejes.
  const classified = classifyRings(geometry);
  for (const group of classified) {
    const [outerRaw, ...holesRaw] = group;
    if (!outerRaw) continue;
    const outer = toRingWithFlags(outerRaw);
    if (outer.ring.length < 3) continue;
    const holes = holesRaw.map(toRingWithFlags).filter((entry) => entry.ring.length >= 3);
    polygons.push({
      outer: outer.ring,
      holes: holes.map((entry) => entry.ring),
      outerBorder: outer.flags,
      holesBorder: holes.map((entry) => entry.flags),
    });
  }
  // Si la clasificación no encontró ningún polígono válido, se usan los anillos
  // tal cual: mejor un polígono de más que un edificio que desaparece.
  if (polygons.length === 0) {
    for (const ring of rings) {
      if (ring.length >= 3) polygons.push({ outer: ring, holes: [] });
    }
  }
  return { polygons, lines, points };
}

/**
 * Fuente de PMTiles que descarga el archivo ENTERO una vez (≈ 3,4 MB, versionado por
 * nombre y cacheable para siempre) y sirve los trozos desde memoria.
 *
 * Por qué no peticiones «Range» (lo normal en PMTiles): Cloudflare Workers sirve los
 * activos estáticos sin garantizar «byte serving» y el lector falla con «Server
 * returned no content-length…». El paquete es pequeño y el visor lee casi todo de
 * todas formas (76–225 teselas), así que una sola descarga es más simple, más
 * robusta y menos peticiones que cientos de rangos.
 */
class WholeFileSource implements Source {
  private buffer: Promise<ArrayBuffer> | null = null;

  constructor(private readonly url: string) {}

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    this.buffer ??= fetch(this.url, signal ? { signal } : undefined).then((response) => {
      if (!response.ok) throw new Error(`No se pudo leer el paquete de datos (${response.status}).`);
      return response.arrayBuffer();
    });
    try {
      const whole = await this.buffer;
      return { data: whole.slice(offset, offset + length) };
    } catch (error) {
      this.buffer = null; // un fallo no se cachea: el siguiente intento vuelve a pedir
      throw error;
    }
  }
}

/** Decodifica una tesela ya descomprimida por el lector de PMTiles. */
export function decodeTile(
  data: ArrayBuffer | Uint8Array,
  z: number,
  x: number,
  y: number,
  toWorld: (lon: number, lat: number) => [number, number],
): CityFeature[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const vector = new VectorTile(new PbfReader(bytes));
  const features: CityFeature[] = [];
  const tileKey = `${z}/${x}/${y}`;

  for (const layerName of TILE_LAYERS) {
    const layer = vector.layers[layerName];
    if (!layer) continue;
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      const properties = feature.properties;
      const geometry = geometryToWorld(
        feature.loadGeometry(),
        feature.type,
        z,
        x,
        y,
        layer.extent,
        toWorld,
      );
      features.push({
        layer: layerName,
        kind: stringFrom(properties.klass ?? properties.kind),
        name: stringFrom(properties.name),
        polygons: geometry.polygons,
        lines: geometry.lines,
        points: geometry.points,
        heightM: numberFrom(properties.height),
        heightSource: stringFrom(properties.height_source),
        levels: numberFrom(properties.levels),
        areaM2: numberFrom(properties.area),
        osmId: stringFrom(properties.osm_id),
        catastroRef: stringFrom(properties.catastro_ref),
        genus: stringFrom(properties.genus),
        species: stringFrom(properties.species),
        leafType: stringFrom(properties.leaf_type),
        tile: tileKey,
        props: properties as Record<string, string | number>,
      });
    }
  }

  return features;
}

/**
 * Un edificio que cruza el borde entre teselas llega PARTIDO: cada tesela trae
 * su trozo, con el mismo `osm_id`. Dibujar solo uno deja el edificio a medias y
 * hacerlo con todos lo dibuja con costuras, así que los trozos se UNEN en un
 * solo polígono por edificio. Sin esto la catedral, que cruza una tesela, tenía
 * la mitad este sin volumen ni respuesta al ratón.
 */
export function mergeFragments(features: CityFeature[]): CityFeature[] {
  const groups = new Map<string, CityFeature[]>();
  const rest: CityFeature[] = [];
  for (const feature of features) {
    // Edificios y polígonos de fortaleza (recintos, torres): los trozos de un
    // mismo elemento se unen. Las líneas (murallas) pasan tal cual: cada trozo
    // ya es un tramo independiente.
    const mergeable =
      (feature.layer === "buildings" || (feature.layer === "fortress" && feature.polygons.length > 0)) &&
      Boolean(feature.osmId);
    if (!mergeable) {
      rest.push(feature);
      continue;
    }
    const key = `${feature.layer}:${feature.osmId}`;
    const list = groups.get(key);
    if (list) list.push(feature);
    else groups.set(key, [feature]);
  }

  const merged: CityFeature[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length === 1) {
      merged.push(first);
      continue;
    }
    // ATAJO (B.4): las teselas de edificios llevan un margen de 23 m (`buffer` 512
    // en el paso 04), así que casi todo edificio llega ENTERO en cada tesela que
    // toca. Si un trozo ya tiene el área completa del edificio (la propiedad
    // `area` de la tesela, 98,5 %), se usa ese y NO se calcula la unión, que era
    // la parte más cara de la decodificación (≈ 320 ms de 580). Solo los
    // edificios más grandes que el margen (naves, la catedral) siguen uniéndose.
    if (first.areaM2 > 0) {
      let best: CityFeature | null = null;
      let bestArea = 0;
      for (const fragment of group) {
        const polygon = fragment.polygons[0];
        if (!polygon || fragment.polygons.length !== 1) continue;
        const area = polygonArea(polygon.outer);
        if (area > bestArea) {
          bestArea = area;
          best = fragment;
        }
      }
      if (best && bestArea >= first.areaM2 * 0.985) {
        merged.push(best);
        continue;
      }
    }
    const geometries = group.flatMap((feature) =>
      feature.polygons.map(
        (polygon) =>
          [polygon.outer, ...polygon.holes].map((ring) => [
            ...ring.map((point) => [point[0], point[1]] as [number, number]),
            [ring[0]?.[0] ?? 0, ring[0]?.[1] ?? 0] as [number, number],
          ]) as Array<Array<[number, number]>>,
      ),
    );
    let union: ReturnType<typeof polygonClipping.union>;
    try {
      const [head, ...tail] = geometries;
      union = head ? polygonClipping.union(head, ...tail) : [];
    } catch {
      // Si la unión falla por geometría degenerada, se queda el trozo más grande:
      // un edificio incompleto es mejor que ninguno.
      merged.push(first);
      continue;
    }
    const polygons: Polymesh[] = [];
    for (const polygon of union) {
      const [outerClosed, ...holesClosed] = polygon;
      if (!outerClosed) continue;
      const open = (ring: Array<[number, number]>): Ring => ring.slice(0, -1).map((p) => [p[0], p[1]]);
      polygons.push({
        outer: ensureCounterClockwise(open(outerClosed)),
        holes: holesClosed.map((hole) => open(hole)).filter((ring) => ring.length >= 3),
      });
    }
    merged.push({ ...first, polygons: polygons.length > 0 ? polygons : first.polygons });
  }
  return [...rest, ...merged];
}

/**
 * Lee todas las teselas que tocan el recorte y devuelve los elementos en metros.
 *
 * Se leen EN ORDEN de cercanía al centro: la primera tesela que llega es la del
 * centro histórico, así que el visor puede empezar a construir la ciudad por
 * donde el usuario está mirando en lugar de esperar al borde del recorte. Es la
 * «carga por zonas»: no hay zonas distintas de datos, hay un orden de llegada
 * que hace útil lo que ya está.
 */
export async function loadCity(options: LoadOptions): Promise<LoadedCity> {
  const started = performance.now();
  const archive = new PMTiles(new WholeFileSource(options.url));
  const frame = localFrame(options.center);
  const toWorld = (lon: number, lat: number): [number, number] => [
    (lon - frame.lon) * frame.metersPerDegLon,
    -(lat - frame.lat) * METERS_PER_DEG_LAT,
  ];

  const tiles = tilesForBounds(options.zoom, options.bounds);
  const centerTile = tilesForBounds(options.zoom, {
    west: options.center[0],
    south: options.center[1],
    east: options.center[0],
    north: options.center[1],
  })[0];
  const centerX = centerTile?.x ?? 0;
  const centerY = centerTile?.y ?? 0;
  tiles.sort(
    (a, b) =>
      Math.abs(a.x - centerX) +
      Math.abs(a.y - centerY) -
      (Math.abs(b.x - centerX) + Math.abs(b.y - centerY)),
  );

  const features: CityFeature[] = [];
  let loaded = 0;
  let missing = 0;
  let bytes = 0;

  // Las peticiones van POR DELANTE de la decodificación (8 teselas): mientras se
  // decodifica una, las siguientes ya viajan, así que la red no espera a la CPU.
  const AHEAD = 8;
  const inflight = new Map<number, ReturnType<typeof archive.getZxy>>();
  const request = (index: number) => {
    const tile = tiles[index];
    if (!tile || inflight.has(index)) return;
    inflight.set(index, archive.getZxy(tile.z, tile.x, tile.y));
  };
  for (let index = 0; index < Math.min(AHEAD, tiles.length); index += 1) request(index);

  for (const [index, tile] of tiles.entries()) {
    if (options.signal?.aborted) break;
    request(index + AHEAD);
    const result = await inflight.get(index);
    inflight.delete(index);
    loaded += 1;
    if (!result) {
      missing += 1;
      options.onTile?.(loaded, tiles.length, features.length);
      continue;
    }
    bytes += result.data.byteLength;
    features.push(...decodeTile(result.data, tile.z, tile.x, tile.y, toWorld));
    options.onTile?.(loaded, tiles.length, features.length);
  }

  return {
    features: mergeFragments(features),
    tilesLoaded: loaded - missing,
    tilesMissing: missing,
    bytes,
    decodeMs: Math.round(performance.now() - started),
  };
}

/** Caja en grados que contiene un anillo en metros locales (para pedir teselas). */
export function boundsOfLocalRing(
  center: LonLat,
  ring: Ring,
): { west: number; south: number; east: number; north: number } {
  const frame = localFrame(center);
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [x, z] of ring) {
    const lon = center[0] + x / frame.metersPerDegLon;
    const lat = center[1] - z / METERS_PER_DEG_LAT;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}
