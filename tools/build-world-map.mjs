/**
 * Genera el contorno del mundo para el mapa de la portada.
 *
 * Fuente: Natural Earth 1:110m «land» (dominio público, sin atribución exigida).
 * Proyección equirrectangular recortada a 84° N – 58° S. Salida: una sola ruta
 * SVG (cadena) y las constantes para colocar marcadores con la misma proyección.
 *
 *   node tools/build-world-map.mjs
 */
import { writeFile } from "node:fs/promises";

const URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const W = 1000;
const LAT_MAX = 84;
const LAT_MIN = -58;
const H = Math.round((W * (LAT_MAX - LAT_MIN)) / 360 * 10) / 10;

const project = (lon, lat) => [((lon + 180) / 360) * W, ((LAT_MAX - Math.max(LAT_MIN, Math.min(LAT_MAX, lat))) / (LAT_MAX - LAT_MIN)) * H];

const geo = await (await fetch(URL)).json();
const rings = [];
for (const feature of geo.features) {
  const polys = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const poly of polys) {
    const outer = poly[0];
    if (outer.every(([, lat]) => lat < LAT_MIN)) continue; // Antártida
    rings.push(outer);
  }
}
// Trama hexagonal de puntos sobre tierra firme (punto en polígono, regla par-impar).
const STEP_LON = 1.5;
const STEP_LAT = 1.3;
const inside = (lon, lat) => {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
};
const dots = [];
let row = 0;
for (let lat = LAT_MAX - 0.6; lat > LAT_MIN; lat -= STEP_LAT, row += 1) {
  const shift = row % 2 ? STEP_LON / 2 : 0;
  for (let lon = -180 + shift + 0.4; lon < 180; lon += STEP_LON) {
    if (!inside(lon, lat)) continue;
    const [x, y] = project(lon, lat);
    dots.push([Math.round(x * 10), Math.round(y * 10)]);
  }
}
// Cada punto en 6 caracteres base 36 (x e y en décimas de unidad del viewBox).
const encoded = dots.map(([x, y]) => x.toString(36).padStart(3, "0") + y.toString(36).padStart(3, "0")).join("");
const file = `/* Generado por tools/build-world-map.mjs — Natural Earth 1:110m (dominio público). No editar a mano. */
export const WORLD_WIDTH = ${W};
export const WORLD_HEIGHT = ${H};
const LAT_MAX = ${LAT_MAX};
const LAT_MIN = ${LAT_MIN};

/** Misma proyección que los puntos: [longitud, latitud] → [x, y] del viewBox. */
export function projectLonLat(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * WORLD_WIDTH, ((LAT_MAX - Math.max(LAT_MIN, Math.min(LAT_MAX, lat))) / (LAT_MAX - LAT_MIN)) * WORLD_HEIGHT];
}

/** Puntos de tierra firme en unidades del viewBox: [x0, y0, x1, y1, ...]. */
export function worldDots(): Float32Array {
  const out = new Float32Array(WORLD_DOT_CODES.length / 3);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(WORLD_DOT_CODES.slice(i * 3, i * 3 + 3), 36) / 10;
  return out;
}

const WORLD_DOT_CODES =
  "${encoded}";
`;
await writeFile("src/components/marketing/world-dots.ts", file);
console.log(`ok · ${dots.length} puntos · ${(file.length / 1024).toFixed(1)} kB · alto ${H}`);
