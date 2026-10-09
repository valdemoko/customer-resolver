/**
 * Genera el modelo GLB propio de la Catedral de Málaga («La Manquita»).
 *
 *   node tools/build-landmark-glb.mjs
 *
 * QUÉ SALE DE UN DATO Y QUÉ NO (se repite en docs/verification/landmarks.md):
 *  · La HUELLA es la de OpenStreetMap (way/1015333951), la misma que dibuja el
 *    resto del mapa: el modelo no puede desalinearse del plano.
 *  · Alturas con fuente (es.wikipedia.org/wiki/Catedral_de_Málaga): torre norte
 *    84 m (92 m hasta el arpón) y bóvedas de 41,79 m. Las tres naves tienen la
 *    misma altura (iglesia de planta de salón), así que todo el cuerpo se modela
 *    a la altura de la bóveda.
 *  · POSICIONES leídas sobre la ortofoto PNOA del IGN (docs/verification/ortho):
 *    las dos torres y la retícula de cúpulas de la azotea. Son medidas a ojo
 *    sobre la imagen (±3 m), no un levantamiento.
 *  · SIN FUENTE (estimado y declarado como tal): el reparto de cuerpos de las
 *    torres, la altura de la torre sur inacabada y la altura de las cúpulas.
 *    No se inventa fachada: ni portadas, ni rosetones, ni imaginería.
 *
 * El modelo se escribe en un sistema NORMALIZADO por el rectángulo mínimo que
 * encierra la huella (x e z en [-0,5, 0,5], y en metros reales): el motor lo
 * estira a ese mismo rectángulo, así que las dimensiones en planta son las del
 * mapa y las alturas son las documentadas. La fachada (torres) queda en -x.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import earcut from "earcut";

const OSM_ID = "way/1015333951";
const BODY_HEIGHT = 41.79; // bóvedas, es.wikipedia.org/wiki/Catedral_de_Málaga
const NORTH_TOWER = 84; // altura de la torre norte (92 m con el arpón)
const NORTH_TOWER_WITH_VANE = 92;
const SOUTH_TOWER_STUMP = 56.4; // SIN FUENTE: estimada, torre sur inacabada
const DOME_RISE = 2.3; // SIN FUENTE: elevación estimada de las cúpulas sobre la azotea

const geo = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const [lon0, lat0] = geo.scene.center;
const buildings = JSON.parse(await readFile("data-pipeline/build/malaga.buildings.geojson", "utf8"));
const feature = buildings.features.find((f) => f.properties.osm_id === OSM_ID);
if (!feature) throw new Error(`No hay ${OSM_ID} en los datos`);

// Mismo sistema local que `src/lib/scene/geo.ts`.
const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const toLocal = ([lon, lat]) => [(lon - lon0) * mPerLon, -(lat - lat0) * 111132];
let ring = feature.geometry.coordinates[0].map(toLocal);
if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
const area = (r) => r.reduce((s, p, i) => s + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0) / 2;
if (area(ring) < 0) ring.reverse();

// Rectángulo mínimo, igual que `orientedBox` en landmarks.ts.
let best = null;
let bestArea = Infinity;
for (let deg = 0; deg < 180; deg += 1) {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of ring) {
    const u = x * ux + z * uz;
    const v = -x * uz + z * ux;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const ar = (maxU - minU) * (maxV - minV);
  if (ar < bestArea) {
    bestArea = ar;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const alongU = maxU - minU >= maxV - minV;
    best = {
      center: [cu * ux - cv * uz, cu * uz + cv * ux],
      axis: alongU ? [ux, uz] : [-uz, ux],
      length: Math.max(maxU - minU, maxV - minV),
      width: Math.min(maxU - minU, maxV - minV),
    };
  }
}
let [ux, uz] = best.axis;
if (ux < 0) { ux = -ux; uz = -uz; } // la fachada (extremo -x) mira al oeste
const vx = -uz;
const vz = ux;
const L = best.length;
const W = best.width;
// Huella en el sistema del rectángulo, en metros: (du, dv). +dv = sur.
const P0 = ring.map(([x, z]) => {
  const dx = x - best.center[0];
  const dz = z - best.center[1];
  return [dx * ux + dz * uz, dx * vx + dz * vz];
});
/**
 * Limpia la huella: quita vértices repetidos o casi repetidos y los que no
 * aportan forma (Douglas–Peucker, 0,25 m). La huella de OpenStreetMap tiene
 * vértices duplicados que hacen que `earcut` triangule solo una parte: se vio al
 * pinchar sobre el modelo (la mitad este no respondía).
 */
function simplifyRing(points, tolerance) {
  const dedup = points.filter((p, i) => {
    const q = points[(i + points.length - 1) % points.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05;
  });
  const distToSegment = (p, a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
  };
  const dp = (pts, from, to, keep) => {
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const d = distToSegment(pts[i], pts[from], pts[to]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) {
      keep.add(at);
      dp(pts, from, at, keep);
      dp(pts, at, to, keep);
    }
  };
  // Se parte el anillo por el vértice más lejano del primero.
  let far = 0;
  for (let i = 1; i < dedup.length; i += 1) {
    if (Math.hypot(dedup[i][0] - dedup[0][0], dedup[i][1] - dedup[0][1]) >
        Math.hypot(dedup[far][0] - dedup[0][0], dedup[far][1] - dedup[0][1])) far = i;
  }
  const keep = new Set([0, far]);
  const first = dedup.slice(0, far + 1);
  const second = [...dedup.slice(far), dedup[0]];
  const keepA = new Set();
  const keepB = new Set();
  dp(first, 0, first.length - 1, keepA);
  dp(second, 0, second.length - 1, keepB);
  const out = [dedup[0]];
  first.forEach((p, i) => { if (keepA.has(i)) out.push(p); });
  out.push(dedup[far]);
  second.forEach((p, i) => { if (keepB.has(i)) out.push(p); });
  return out;
}
const P = simplifyRing(P0, 0.25);
console.log(`huella: ${P0.length} vértices → ${P.length} tras limpiar`);
const minDu = Math.min(...P.map((p) => p[0]));
const maxDu = Math.max(...P.map((p) => p[0]));

/* ---------------------------------------------------------------- geometría */
const positions = [];
const colors = [];
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const tri = (a, b, c, color) => {
  for (const p of [a, b, c]) {
    positions.push(p[0] / L, p[1], p[2] / W); // (du, y, dv) normalizados
    colors.push(...color);
  }
};
const WALL = hex("#e6dabb");
const WALL_DARK = hex("#d8c9a4");
const ROOF = hex("#b3a99a");
const ROOF_RIDGE = hex("#9d9384");
const TOWER_CAP = hex("#8d8a84");
const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };

/** Pared vertical entre dos alturas a lo largo de un anillo (du, dv) CCW. */
function walls(poly, y0, y1, color) {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    // Mismo orden que `MeshBuilder.addWalls` (z = dv): abajo-a, arriba-a, arriba-b, abajo-b.
    quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], color);
  }
}
/** Tapa horizontal hacia arriba. */
function cap(poly, y, color) {
  const flat = poly.flat();
  const idx = earcut(flat);
  for (let i = 0; i < idx.length; i += 3) {
    const p = (k) => [poly[idx[i + k]][0], y, poly[idx[i + k]][1]];
    // earcut devuelve el orden del anillo; hacia arriba = invertir (como `addPolygon`).
    tri(p(0), p(2), p(1), color);
  }
}
const prism = (poly, y0, y1, wall, roof) => { walls(poly, y0, y1, wall); cap(poly, y1, roof); };
const box = (cu, cv, half, y0, y1, wall, roof) =>
  prism([[cu - half, cv - half], [cu + half, cv - half], [cu + half, cv + half], [cu - half, cv + half]], y0, y1, wall, roof);
const octagon = (cu, cv, r) =>
  Array.from({ length: 8 }, (_, i) => [cu + Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * r, cv + Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * r]);
function cone(cu, cv, r, y0, y1, color, sides = 8) {
  const ringPts = Array.from({ length: sides }, (_, i) => [cu + Math.cos((i / sides) * Math.PI * 2) * r, cv + Math.sin((i / sides) * Math.PI * 2) * r]);
  for (let i = 0; i < sides; i += 1) {
    const a = ringPts[i];
    const b = ringPts[(i + 1) % sides];
    tri([a[0], y0, a[1]], [cu, y1, cv], [b[0], y0, b[1]], color);
  }
}

// 1 · Cuerpo: la huella entera, a la altura de las bóvedas (planta de salón).
prism(P, 0, BODY_HEIGHT, WALL, ROOF);

// Posiciones medidas sobre la ortofoto (docs/verification/ortho/catedral-pnoa.jpg):
// BBOX lat 36.7192..36.7212, lon -4.4213..-4.4180, 1200 × 800 px, norte arriba.
const fromPixel = (px, py) => {
  const lon = -4.4213 + (px / 1200) * 0.0033;
  const lat = 36.7212 - (py / 800) * 0.0020;
  const [x, z] = toLocal([lon, lat]);
  const dx = x - best.center[0];
  const dz = z - best.center[1];
  return [dx * ux + dz * uz, dx * vx + dz * vz];
};

// 2 · Cúpulas de la azotea: retícula de 4 × 3 sobre las naves y cúpulas mayores
// sobre el crucero y la cabecera, tal como se ven en la ortofoto.
function dome(cu, cv, r, rise, wall) {
  const rings = [[1, 0], [0.84, 0.58], [0.42, 0.94], [0, 1]];
  const sides = 8;
  const at = (ringIndex, i) => {
    const [k, h] = rings[ringIndex];
    const a = (i / sides) * Math.PI * 2;
    return [cu + Math.cos(a) * r * k, BODY_HEIGHT + h * rise, cv + Math.sin(a) * r * k];
  };
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let i = 0; i < sides; i += 1) {
      const a = at(ring, i);
      const b = at(ring, (i + 1) % sides);
      const c = at(ring + 1, (i + 1) % sides);
      const d = at(ring + 1, i);
      if (ring === rings.length - 2) tri(a, d, b, wall);
      else quad(a, d, c, b, wall);
    }
  }
}
const DOME_COLOR = hex("#d9b894");
const domePixels = {
  small: [
    ...[358, 408, 460].flatMap((y) => [527, 572, 617, 662].map((x) => [x, y])),
    [812, 347], [845, 366], [858, 402], [849, 438],
  ],
  large: [[720, 352], [778, 347], [722, 396], [778, 392], [727, 443], [780, 440]],
};
for (const [px, py] of domePixels.small) {
  const [cu, cv] = fromPixel(px, py);
  dome(cu, cv, 3.3, DOME_RISE, DOME_COLOR);
}
for (const [px, py] of domePixels.large) {
  const [cu, cv] = fromPixel(px, py);
  dome(cu, cv, 5.6, DOME_RISE * 1.6, DOME_COLOR);
}

// 3 · Torres: centros leídos sobre la ortofoto (norte arriba-izquierda, sur
// abajo-izquierda). El lado es ESTIMADO a partir de su tamaño en la imagen.
const towerHalf = 9.6;
const [towerU, northV] = fromPixel(475, 305);
const [southU, southV] = fromPixel(497, 523);

// Torre norte, completa: cuatro cuerpos hasta 84 m y el arpón hasta 92 m.
box(towerU, northV, towerHalf, BODY_HEIGHT, 58, WALL, WALL);
box(towerU, northV, towerHalf * 0.86, 58, 71, WALL_DARK, WALL_DARK);
prism(octagon(towerU, northV, towerHalf * 0.62), 71, 79.5, WALL, TOWER_CAP);
cone(towerU, northV, towerHalf * 0.6, 79.5, NORTH_TOWER, TOWER_CAP);
{
  // Arpón: aguja fina hasta los 92 m documentados.
  const r = 0.35;
  cone(towerU, northV, r, NORTH_TOWER, NORTH_TOWER_WITH_VANE, TOWER_CAP, 4);
}

// Torre sur, inacabada: se queda en un muñón de dos cuerpos (altura estimada).
box(southU, southV, towerHalf, BODY_HEIGHT, 50, WALL, WALL);
box(southU, southV, towerHalf * 0.9, 50, SOUTH_TOWER_STUMP, WALL_DARK, ROOF_RIDGE);

/* --------------------------------------------------------------------- GLB */
const position = new Float32Array(positions);
const color = new Float32Array(colors);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < position.length; i += 3) {
  for (let k = 0; k < 3; k += 1) {
    min[k] = Math.min(min[k], position[i + k]);
    max[k] = Math.max(max[k], position[i + k]);
  }
}
const bin = Buffer.concat([Buffer.from(position.buffer), Buffer.from(color.buffer)]);
const json = {
  asset: { version: "2.0", generator: "alzado tools/build-landmark-glb.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "catedral-de-malaga" }],
  meshes: [{ name: "catedral", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, material: 0, mode: 4 }] }],
  materials: [{ name: "piedra", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: position.length / 3, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: color.length / 3, type: "VEC3" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: position.byteLength, target: 34962 },
    { buffer: 0, byteOffset: position.byteLength, byteLength: color.byteLength, target: 34962 },
  ],
  buffers: [{ byteLength: bin.length }],
  extras: {
    osmId: OSM_ID,
    footprintBox: { lengthM: +L.toFixed(1), widthM: +W.toFixed(1) },
    documentedHeightsM: { northTower: NORTH_TOWER, northTowerWithVane: NORTH_TOWER_WITH_VANE, vaults: BODY_HEIGHT },
    estimated: ["southTowerStump", "towerBodies", "domeHeight"],
    positionsFrom: "PNOA ortho (IGN), eyeballed ±3 m",
  },
};
let jsonBuffer = Buffer.from(JSON.stringify(json));
jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc((4 - (jsonBuffer.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const out = "public/models/malaga/catedral.glb";
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binPadded]));
console.log(
  `${out}: ${(positions.length / 9) | 0} triángulos, huella ${L.toFixed(1)} × ${W.toFixed(1)} m, ` +
    `cuerpo ${BODY_HEIGHT} m, torre norte ${NORTH_TOWER} m (${NORTH_TOWER_WITH_VANE} m con el arpón)`,
);
