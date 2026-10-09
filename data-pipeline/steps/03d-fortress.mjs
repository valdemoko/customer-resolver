import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, readRaw, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { distanceToSegment, makeFrame, pointInRing } from "../lib/surface.mjs";

/**
 * FASE B.4 · Alcazaba y castillo de Gibralfaro a partir de OpenStreetMap.
 *
 * OSM cartografía los dos recintos amurallados (`barrier=city_wall` /
 * `historic=citywalls`), las torres con nombre (Homenaje, Armadura Mudéjar,
 * Maldonado, Cristo, Albarranas…) y las puertas (Bóveda, Columnas, Cuartos de
 * Granada). El paso NO inventa nada: reúne esas geometrías en la capa
 * `fortress`, repartidas por conjunto (`alcazaba`, `coracha`, `gibralfaro`).
 * Las alturas no vienen en OSM; las fija la configuración de la ciudad, con su
 * fuente o marcadas como estimación.
 */

const REGION = { west: -4.4185, east: -4.4095, south: 36.7195, north: 36.7255 };
const ENCLOSURES = [
  { osmId: 436786724, part: "alcazaba" },
  { osmId: 403541689, part: "gibralfaro" },
];

export async function run() {
  const city = await loadCity();
  step(`03d · Alcazaba y Gibralfaro (OpenStreetMap) — ${city.name}`);
  const osm = await readRaw(`${city.slug}.osm.json`);
  const frame = makeFrame(city.scene.coverage.circle.center);
  const toXY = (p) => frame.toLocal(p.lon, p.lat);

  const enclosures = [];
  for (const spec of ENCLOSURES) {
    const element = osm.elements.find((e) => e.type === "way" && e.id === spec.osmId);
    if (!element) {
      warn(`No se encuentra el recinto way/${spec.osmId}`);
      continue;
    }
    enclosures.push({ ...spec, element, ring: element.geometry.map(toXY) });
  }

  const inRegion = (geometry) =>
    geometry.some((p) => p.lon >= REGION.west && p.lon <= REGION.east && p.lat >= REGION.south && p.lat <= REGION.north);

  const distanceToEnclosure = (point, enclosure) => {
    if (pointInRing(point[0], point[1], enclosure.ring)) return 0;
    let best = Infinity;
    for (let i = 0; i < enclosure.ring.length - 1; i += 1) {
      const a = enclosure.ring[i];
      const b = enclosure.ring[i + 1];
      best = Math.min(best, distanceToSegment(point[0], point[1], a[0], a[1], b[0], b[1]).distance);
    }
    return best;
  };
  const partOf = (geometry) => {
    const mid = toXY(geometry[Math.floor(geometry.length / 2)]);
    let best = { part: "coracha", distance: Infinity };
    for (const enclosure of enclosures) {
      const distance = distanceToEnclosure(mid, enclosure);
      if (distance < best.distance) best = { part: enclosure.part, distance };
    }
    return best.distance <= 25 ? best.part : "coracha";
  };

  const features = [];
  const walls = [];
  const counts = { enclosure: 0, wall: 0, tower: 0, gate: 0 };
  const lonLat = (geometry) => geometry.map((p) => [p.lon, p.lat]);
  const asPolygon = (geometry) => ({ type: "Polygon", coordinates: [lonLat(geometry)] });

  for (const enclosure of enclosures) {
    features.push({
      type: "Feature",
      properties: { kind: "enclosure", part: enclosure.part, name: enclosure.element.tags?.name ?? "", osm_id: `way/${enclosure.osmId}` },
      geometry: asPolygon(enclosure.element.geometry),
    });
    counts.enclosure += 1;
  }

  for (const element of osm.elements) {
    if (element.type !== "way" || !element.geometry || !inRegion(element.geometry)) continue;
    const tags = element.tags ?? {};
    const id = `way/${element.id}`;
    const closed =
      element.geometry.length > 3 &&
      element.geometry[0].lat === element.geometry.at(-1).lat &&
      element.geometry[0].lon === element.geometry.at(-1).lon;

    if (tags.barrier === "city_wall" || (tags.barrier === "wall" && tags.historic === "citywalls")) {
      walls.push({ element, id, closed, part: partOf(element.geometry), name: tags.name ?? "" });
      counts.wall += 1;
      continue;
    }
    if (!closed) continue;
    const isTower = tags.man_made === "tower" && (tags["tower:type"] === "defensive" || /^Torre/i.test(tags.name ?? ""));
    const isGate = /^Puerta|^Arco/i.test(tags.name ?? "") && Boolean(tags.building);
    if (isTower || isGate) {
      features.push({
        type: "Feature",
        properties: {
          kind: isTower ? "tower" : "gate",
          part: partOf(element.geometry),
          name: tags.name ?? "",
          osm_id: id,
          tower_type: tags["tower:type"] ?? "",
        },
        geometry: asPolygon(element.geometry),
      });
      counts[isTower ? "tower" : "gate"] += 1;
    }
  }

  // TRAMOS PUBLICITARIOS (Fase C). Cada lienzo se corta en tramos de ≈ 30 m y cada
  // tramo es una unidad comprable con identificador estable `w:<conjunto>:<nn>`
  // (la coracha cuenta como parte de la Alcazaba). El número sale del orden por
  // identificador OSM y posición a lo largo del lienzo: no cambia mientras los
  // datos de OSM no cambien.
  const PIECE_M = 30;
  const counters = { alcazaba: 0, gibralfaro: 0 };
  walls.sort((a, b) => a.element.id - b.element.id);
  const wallUnits = [];
  for (const wall of walls) {
    const group = wall.part === "gibralfaro" ? "gibralfaro" : "alcazaba";
    const pts = wall.element.geometry.map((p) => frame.toLocal(p.lon, p.lat));
    let total = 0;
    for (let i = 1; i < pts.length; i += 1) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const n = Math.max(1, Math.round(total / PIECE_M));
    const step = total / n;
    // Recorre la polilínea cortando cada `step` metros (con vértice interpolado).
    let piece = [pts[0]];
    let boundary = step;
    let walked = 0;
    const flush = () => {
      if (piece.length < 2) return;
      counters[group] += 1;
      const unit = `w:${group}:${String(counters[group]).padStart(2, "0")}`;
      wallUnits.push(unit);
      features.push({
        type: "Feature",
        properties: { kind: "wall", part: wall.part, name: wall.name, osm_id: wall.id, closed: 0, unit },
        geometry: { type: "LineString", coordinates: piece.map(([x, y]) => frame.toLonLat(x, y)) },
      });
    };
    for (let i = 1; i < pts.length; i += 1) {
      let a = pts[i - 1];
      const b = pts[i];
      let segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (walked + segment >= boundary - 1e-6 && piece.length > 0 && boundary < total - 1e-6) {
        const t = (boundary - walked) / segment;
        const cut = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        piece.push(cut);
        flush();
        piece = [cut];
        walked = boundary;
        boundary += step;
        a = cut;
        segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      piece.push(b);
      walked += segment;
    }
    flush();
  }
  const unitCounts = { alcazaba: counters.alcazaba, gibralfaro: counters.gibralfaro };

  const parts = {};
  for (const f of features) parts[`${f.properties.kind}:${f.properties.part}`] = (parts[`${f.properties.kind}:${f.properties.part}`] ?? 0) + 1;
  await writeFile(join(BUILD_DIR, `${city.slug}.fortress.geojson`), JSON.stringify({ type: "FeatureCollection", features }));
  log(`Tramos de muralla (unidades): ${JSON.stringify(unitCounts)}`);
  log(`Fortificaciones: ${JSON.stringify(counts)} · reparto ${JSON.stringify(parts)}`);
  await writeFile(join(BUILD_DIR, `${city.slug}.wall-units.json`), JSON.stringify(wallUnits));
  return { counts, parts, unitCounts };
}
