/**
 * Proyección local de la escena.
 *
 * La ciudad vive en un sistema de coordenadas en METROS, no en grados: modelar en
 * grados obliga a arrastrar factores de escala por todas partes y a que las
 * distancias y los tamaños dejen de ser comparables. El error de una proyección
 * equirectangular a esta escala (menos de 1 km) es de centímetros, así que es
 * suficiente y además reversible sin ambigüedad.
 *
 * Convenio de ejes, el de three.js: x = este, y = arriba, z = SUR. Es decir, el
 * norte es -z. Se elige así para que la cámara, que por defecto mira hacia -z,
 * mire hacia el norte sin tener que girar la escena.
 */

export type LonLat = readonly [number, number];
export type LocalPoint = [number, number];

export const METERS_PER_DEG_LAT = 111_132.0;
const METERS_PER_DEG_LON_EQ = 111_320.0;

export type LocalFrame = {
  readonly lon: number;
  readonly lat: number;
  readonly metersPerDegLon: number;
};

export function localFrame(center: LonLat): LocalFrame {
  return {
    lon: center[0],
    lat: center[1],
    metersPerDegLon: METERS_PER_DEG_LON_EQ * Math.cos((center[1] * Math.PI) / 180),
  };
}

/** Grados → metros locales [este, sur]. */
export function toLocal(frame: LocalFrame, lon: number, lat: number): LocalPoint {
  return [(lon - frame.lon) * frame.metersPerDegLon, -(lat - frame.lat) * METERS_PER_DEG_LAT];
}

/** Metros locales → grados. Inversa exacta de `toLocal`. */
export function toLonLat(frame: LocalFrame, point: LocalPoint): LonLat {
  return [
    frame.lon + point[0] / frame.metersPerDegLon,
    frame.lat - point[1] / METERS_PER_DEG_LAT,
  ];
}

/**
 * Coordenada de píxel dentro de una tesela MVT → longitud y latitud.
 *
 * Las teselas que sirve el pipeline se generan con `geojson-vt`, cuyo sistema de
 * coordenadas internas va de (0,0) arriba a la izquierda a (extent, extent)
 * abajo a la derecha, con el eje Y hacia abajo. Si se olvida esa inversión, la
 * ciudad sale reflejada y no hay forma de saberlo mirando el código: hay que
 * comprobarlo contra un punto conocido (lo hace `geo.test.ts`).
 */
export function tilePointToLonLat(
  z: number,
  x: number,
  y: number,
  extent: number,
  px: number,
  py: number,
): LonLat {
  const n = 2 ** z;
  const lon = ((x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

/** Rectángulo de una tesela, en grados, para decidir qué teselas hacen falta. */
export function tileLonLatBounds(
  z: number,
  x: number,
  y: number,
): { west: number; south: number; east: number; north: number } {
  const n = 2 ** z;
  const lonFor = (value: number) => (value / n) * 360 - 180;
  const latFor = (value: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * value) / n))) * 180) / Math.PI;
  return {
    west: lonFor(x),
    east: lonFor(x + 1),
    north: latFor(y),
    south: latFor(y + 1),
  };
}

/** Teselas (z, x, y) que tocan un rectángulo en grados. */
export function tilesForBounds(
  z: number,
  bounds: { west: number; south: number; east: number; north: number },
): Array<{ z: number; x: number; y: number }> {
  const n = 2 ** z;
  const xFor = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const yFor = (lat: number) => {
    const radians = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n,
    );
  };
  const x0 = Math.max(0, xFor(bounds.west));
  const x1 = Math.min(n - 1, xFor(bounds.east));
  const y0 = Math.max(0, yFor(bounds.north));
  const y1 = Math.min(n - 1, yFor(bounds.south));
  const tiles: Array<{ z: number; x: number; y: number }> = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}
