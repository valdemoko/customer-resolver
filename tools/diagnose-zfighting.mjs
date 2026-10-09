/**
 * Diagnóstico del z-fighting de la B.3, MEDIDO sobre los datos que consumía el
 * visor (no supuesto).
 *
 * El visor de la B.3 dibujaba el suelo como polígonos independientes de OSM, cada
 * clase a UNA altura fija: usos del suelo a 0,08 m, verde a 0,30 m, calles,
 * plazas y sendas (cintas) a 0,50 m. Dos superficies de colores distintos que
 * comparten plano y se solapan se disputan cada píxel. Este script mide, con las
 * capas heredadas que escribe el paso 03 (`green`, `landuse`, `streets`):
 *
 *   · verde × verde con tono distinto (mismo plano, 0,30 m)
 *   · usos × usos de distinto tipo (mismo plano, 0,08 m)
 *   · cintas de calle: peatonal × senda × calzada (mismo plano, 0,50 m)
 *
 * Uso:  node tools/diagnose-zfighting.mjs   → escribe docs/verification/zfighting-b3.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bufferLine,
  intersection,
  makeFrame,
  multiArea,
  normalize,
  toMulti,
  unionMany,
} from "../data-pipeline/lib/surface.mjs";

const BUILD = "data-pipeline/build";
const city = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const { circle } = city.scene.coverage;
const frame = makeFrame(circle.center);
const R = circle.radiusM;
const read = async (name) => JSON.parse(await readFile(join(BUILD, `malaga.${name}.geojson`), "utf8")).features;

const inCircle = (pts) => pts.some(([x, y]) => Math.hypot(x, y) < R);
const bbox = (pts) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return { a, b, c, d };
};
const overlapBox = (p, q) => p.a <= q.c && p.c >= q.a && p.b <= q.d && p.d >= q.b;
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

function polygonsOf(features, keyFn) {
  const out = [];
  for (const f of features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const rings = poly.map((ring) => ring.map(([lon, lat]) => frame.toLocal(lon, lat)));
      if (!inCircle(rings[0])) continue;
      const multi = normalize(toMulti([rings]));
      if (multi.length === 0) continue;
      out.push({ multi, box: bbox(rings[0]), key: keyFn(f) });
    }
  }
  return out;
}

function pairOverlaps(items, differ) {
  let area = 0;
  let pairs = 0;
  let worst = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (!overlapBox(items[i].box, items[j].box)) continue;
      if (!differ(items[i], items[j])) continue;
      const a = multiArea(intersection(items[i].multi, items[j].multi));
      if (a > 0.5) {
        area += a;
        pairs += 1;
        worst = Math.max(worst, a);
      }
    }
  }
  return { areaM2: Math.round(area), pairs, worstM2: Math.round(worst) };
}

const green = polygonsOf(await read("green"), (f) => `${hash(f.properties.name || f.properties.kind) % 3}`);
const landuse = polygonsOf(await read("landuse"), (f) => f.properties.kind);
console.log(`verde ${green.length} polígonos · usos ${landuse.length}`);

const greenResult = pairOverlaps(green, (p, q) => p.key !== q.key);
const landuseResult = pairOverlaps(landuse, (p, q) => p.key !== q.key);

// Cintas de calle de la B.3, por grupo de color.
const WIDTH = { major: 11, minor: 7, pedestrian: 9, path: 3.2, steps: 2.6, other: 4 };
const groups = { peatonal: [], senda: [], calzada: [] };
for (const f of await read("streets")) {
  const pts = f.geometry.coordinates.map(([lon, lat]) => frame.toLocal(lon, lat));
  if (!inCircle(pts)) continue;
  const klass = f.properties.klass;
  const group = klass === "pedestrian" ? "peatonal" : klass === "path" || klass === "steps" ? "senda" : "calzada";
  groups[group].push({ pts, width: WIDTH[klass] ?? 4 });
}
// Por celdas de 400 m para acotar el coste.
const CELL = 400;
let streets = { "peatonal×calzada": 0, "senda×calzada": 0, "peatonal×senda": 0 };
for (let cx = Math.floor(-R / CELL); cx < Math.ceil(R / CELL); cx += 1) {
  for (let cy = Math.floor(-R / CELL); cy < Math.ceil(R / CELL); cy += 1) {
    const box = { a: cx * CELL, b: cy * CELL, c: (cx + 1) * CELL, d: (cy + 1) * CELL };
    const cell = toMulti([[[[box.a, box.b], [box.c, box.b], [box.c, box.d], [box.a, box.d]]]]);
    const union = {};
    for (const [name, list] of Object.entries(groups)) {
      const parts = list.filter((l) => overlapBox(bbox(l.pts), box)).map((l) => bufferLine(l.pts, l.width));
      union[name] = intersection(unionMany(parts, 100), cell);
    }
    streets["peatonal×calzada"] += multiArea(intersection(union.peatonal, union.calzada));
    streets["senda×calzada"] += multiArea(intersection(union.senda, union.calzada));
    streets["peatonal×senda"] += multiArea(intersection(union.peatonal, union.senda));
  }
}
for (const k of Object.keys(streets)) streets[k] = Math.round(streets[k]);

const groundM2 = Math.PI * R * R;
const total = greenResult.areaM2 + landuseResult.areaM2 + streets["peatonal×calzada"] + streets["senda×calzada"] + streets["peatonal×senda"];
const result = {
  generatedAt: new Date().toISOString().slice(0, 10),
  method: "Sobre las capas heredadas del paso 03 (las que dibujaba la B.3), dentro del círculo de la escena. Se suman áreas de solape entre polígonos de la MISMA altura y COLOR distinto.",
  circleAreaM2: Math.round(groundM2),
  verdeConTonoDistinto_0_30m: greenResult,
  usosDeDistintoTipo_0_08m: landuseResult,
  cintasDeCalle_0_50m: streets,
  totalCoplanarOverlapM2: total,
  shareOfGround: total / groundM2,
};
await writeFile("docs/verification/zfighting-b3.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
