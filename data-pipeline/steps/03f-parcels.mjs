import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { BUILD_DIR, readRaw, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { distanceToSegment, makeFrame, pointInRing, ringArea } from "../lib/surface.mjs";

/**
 * FASE B.4 · Locales como parcelas publicitarias individuales.
 *
 * Una PARCELA es un tramo de fachada de planta baja: un segmento sobre el borde
 * de la huella de un edificio, con identificador estable y estado inicial
 * «disponible». Origen, por orden de preferencia:
 *
 *   1. `catastro_unit`  unidad catastral con geometría propia. El conjunto INSPIRE
 *      de edificios que usa este proyecto publica edificios, no locales: NO hay
 *      unidades con geometría, y se informa de que son 0. No se simulan.
 *   2. `osm_poi`        punto de interés de OpenStreetMap (`shop`, `amenity`
 *      comercial, `craft`, `office`) asignado a la fachada de su edificio que da
 *      a la calle; el ancho lo reparten los vecinos del mismo frente.
 *   3. `estimated`      donde faltan datos, y SOLO dentro de las zonas
 *      comerciales declaradas, se subdivide la fachada libre en tramos regulares
 *      de ~6 m. Siempre se marca como estimada.
 *
 * Nada se pre-asigna a ninguna marca. El nombre de un POI de OSM viaja como dato
 * secundario («local identificado en OpenStreetMap»), no como rótulo.
 */

const COMMERCIAL_AMENITY = new Set([
  "restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "ice_cream", "biergarten", "nightclub",
  "bank", "bureau_de_change", "pharmacy", "cinema", "car_rental", "bicycle_rental", "marketplace", "casino",
]);
const SKIP_BUILDING_KINDS = new Set([
  "church", "cathedral", "chapel", "monastery", "temple", "mosque", "synagogue", "school", "kindergarten",
  "hospital", "university", "college", "civic", "government", "ruins", "construction", "roof", "garage", "garages",
]);
const WALKABLE = new Set(["plaza", "path", "road_major", "road_minor", "road_other", "quay", "pier", "bridge", "steps"]);
const PEDESTRIAN = new Set(["plaza", "path", "steps"]);

const MIN_WIDTH = 2.2;
const MAX_POI_WIDTH = 7.5;
const EDGE_INSET = 0.25;
const OFFSET_PROBE = 1.4;

const hash = (text) => createHash("sha1").update(text).digest("hex");
const stableId = (building, a, b) =>
  `L-${parseInt(hash(`${building}|${a.map((v) => Math.round(v * 100)).join(",")}|${b.map((v) => Math.round(v * 100)).join(",")}`).slice(0, 9), 16).toString(36).padStart(7, "0")}`;

/** Rejilla espacial de polígonos (caja) para consultas de punto. */
function makeIndex(items, cell = 60) {
  const map = new Map();
  items.forEach((item, index) => {
    const x0 = Math.floor(item.bbox.minX / cell);
    const x1 = Math.floor(item.bbox.maxX / cell);
    const y0 = Math.floor(item.bbox.minY / cell);
    const y1 = Math.floor(item.bbox.maxY / cell);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = `${x}:${y}`;
        const list = map.get(key);
        if (list) list.push(index);
        else map.set(key, [index]);
      }
    }
  });
  return {
    near(x, y, pad = 0) {
      const found = new Set();
      for (let gx = Math.floor((x - pad) / cell); gx <= Math.floor((x + pad) / cell); gx += 1) {
        for (let gy = Math.floor((y - pad) / cell); gy <= Math.floor((y + pad) / cell); gy += 1) {
          for (const index of map.get(`${gx}:${gy}`) ?? []) found.add(index);
        }
      }
      return [...found].map((index) => items[index]);
    },
  };
}

function bboxOfRing(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function polygonsOf(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export async function run() {
  const city = await loadCity();
  step(`03f · Parcelas publicitarias (locales) — ${city.name}`);
  const config = city.scene.locales;
  if (!config) throw new Error("scene.locales no está definido en la configuración de la ciudad.");
  const frame = makeFrame(city.scene.coverage.circle.center);
  const radial = ([x, y]) => Math.hypot(x, y);
  const reach = city.scene.coverage.circle.radiusM;

  const osm = await readRaw(`${city.slug}.osm.json`);
  const buildingsFile = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.buildings.geojson`), "utf8"));
  const surfaceFile = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.surface.geojson`), "utf8"));
  const waterFile = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.water.geojson`), "utf8"));

  /* ---------------------------------------------------------- edificios */
  const buildings = [];
  for (const feature of buildingsFile.features) {
    const rings = feature.geometry.coordinates.map((ring) => ring.map(([lon, lat]) => frame.toLocal(lon, lat)));
    let outer = rings[0].slice(0, -1);
    if (outer.length < 3) continue;
    if (ringArea(outer) < 0) outer = outer.reverse(); // antihorario: normal hacia fuera = (dy, -dx)
    buildings.push({
      id: feature.properties.osm_id,
      name: feature.properties.name,
      kind: feature.properties.kind,
      height: feature.properties.height,
      outer,
      holes: rings.slice(1),
      bbox: bboxOfRing(outer),
      centroid: [outer.reduce((s, p) => s + p[0], 0) / outer.length, outer.reduce((s, p) => s + p[1], 0) / outer.length],
    });
  }
  const buildingIndex = makeIndex(buildings);
  const insideBuilding = (x, y) =>
    buildingIndex.near(x, y).some((b) => b.bbox.minX <= x && x <= b.bbox.maxX && b.bbox.minY <= y && y <= b.bbox.maxY && pointInRing(x, y, b.outer) && !b.holes.some((h) => pointInRing(x, y, h)));

  /* ----------------------------------------------- superficies caminables */
  const walkable = [];
  for (const feature of surfaceFile.features) {
    if (!WALKABLE.has(feature.properties.kind)) continue;
    for (const poly of polygonsOf(feature.geometry)) {
      const rings = poly.map((ring) => ring.map(([lon, lat]) => frame.toLocal(lon, lat)));
      walkable.push({ kind: feature.properties.kind, name: feature.properties.name, outer: rings[0], holes: rings.slice(1), bbox: bboxOfRing(rings[0]) });
    }
  }
  const walkableIndex = makeIndex(walkable);
  const surfaceAt = (x, y) => {
    for (const s of walkableIndex.near(x, y)) {
      if (s.bbox.minX <= x && x <= s.bbox.maxX && s.bbox.minY <= y && y <= s.bbox.maxY && pointInRing(x, y, s.outer) && !s.holes.some((h) => pointInRing(x, y, h))) return s;
    }
    return null;
  };
  const waterPolys = [];
  for (const feature of waterFile.features) {
    for (const poly of polygonsOf(feature.geometry)) {
      const rings = poly.map((ring) => ring.map(([lon, lat]) => frame.toLocal(lon, lat)));
      waterPolys.push({ outer: rings[0], holes: rings.slice(1), bbox: bboxOfRing(rings[0]) });
    }
  }
  const waterIndex = makeIndex(waterPolys, 120);
  const inWater = (x, y) =>
    waterIndex.near(x, y).some((w) => pointInRing(x, y, w.outer) && !w.holes.some((h) => pointInRing(x, y, h)));

  /* ------------------------------------------------------ zonas comerciales */
  const zones = (config.zones ?? []).map((zone) => {
    if (zone.osmPolygon) {
      const [type, id] = zone.osmPolygon.split("/");
      const element = osm.elements.find((e) => e.type === type && String(e.id) === id);
      if (!element?.geometry) throw new Error(`Zona ${zone.id}: no existe ${zone.osmPolygon}`);
      const ring = element.geometry.map((p) => frame.toLocal(p.lon, p.lat));
      return { ...zone, ring, bbox: bboxOfRing(ring), pad: zone.paddingM ?? 0 };
    }
    const [cx, cy] = frame.toLocal(zone.center[0], zone.center[1]);
    return { ...zone, cx, cy };
  });
  const zoneOf = (x, y) => {
    for (const zone of zones) {
      if (zone.ring) {
        if (pointInRing(x, y, zone.ring)) return zone;
        for (let i = 0; i < zone.ring.length - 1; i += 1) {
          if (distanceToSegment(x, y, zone.ring[i][0], zone.ring[i][1], zone.ring[i + 1][0], zone.ring[i + 1][1]).distance <= zone.pad) return zone;
        }
      } else if (Math.hypot(x - zone.cx, y - zone.cy) <= zone.radiusM) return zone;
    }
    return null;
  };

  /* --------------------------------------------------------- aristas */
  // Una arista de fachada es ELEGIBLE si hay suelo caminable justo delante y
  // nada de edificio ni de agua. El punto de sondeo está a 1,4 m de la pared.
  const edges = [];
  for (const building of buildings) {
    if (radial(building.centroid) > reach - 4) continue;
    const ring = building.outer;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < MIN_WIDTH + 2 * EDGE_INSET) continue;
      const tx = (b[0] - a[0]) / length;
      const ty = (b[1] - a[1]) / length;
      const nx = ty;
      const ny = -tx;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const probe = [mid[0] + nx * OFFSET_PROBE, mid[1] + ny * OFFSET_PROBE];
      if (insideBuilding(probe[0], probe[1]) || inWater(probe[0], probe[1])) continue;
      const surface = surfaceAt(probe[0], probe[1]);
      edges.push({
        building,
        index: i,
        a,
        b,
        length,
        tx,
        ty,
        nx,
        ny,
        surface: surface?.kind ?? null,
        street: surface?.name ?? "",
        intervals: [],
      });
    }
  }
  const edgesByBuilding = new Map();
  for (const edge of edges) {
    const list = edgesByBuilding.get(edge.building.id) ?? [];
    list.push(edge);
    edgesByBuilding.set(edge.building.id, list);
  }
  log(`Aristas de fachada candidatas: ${edges.length} (con suelo caminable delante: ${edges.filter((e) => e.surface).length})`);

  /* -------------------------------------------------------------- POIs */
  const pois = [];
  const rejected = { upperLevel: 0, disused: 0, outsideCircle: 0, noBuilding: 0, noFacade: 0, tooDense: 0 };
  for (const element of osm.elements) {
    const tags = element.tags ?? {};
    const isShop = tags.shop || tags.craft || tags.office;
    const isAmenity = tags.amenity && COMMERCIAL_AMENITY.has(tags.amenity);
    if (!isShop && !isAmenity) continue;
    if (tags.disused || tags.abandoned || tags["disused:shop"] || tags.shop === "vacant") {
      rejected.disused += 1;
      continue;
    }
    if (tags.level !== undefined && !String(tags.level).split(";").includes("0")) {
      rejected.upperLevel += 1;
      continue;
    }
    let point = null;
    if (element.type === "node") point = frame.toLocal(element.lon, element.lat);
    else if (element.geometry?.length) {
      const g = element.geometry;
      point = frame.toLocal(g.reduce((s, p) => s + p.lon, 0) / g.length, g.reduce((s, p) => s + p.lat, 0) / g.length);
    } else if (element.members) {
      const g = element.members.flatMap((m) => m.geometry ?? []);
      if (g.length) point = frame.toLocal(g.reduce((s, p) => s + p.lon, 0) / g.length, g.reduce((s, p) => s + p.lat, 0) / g.length);
    }
    if (!point) continue;
    if (radial(point) > reach - 6) {
      rejected.outsideCircle += 1;
      continue;
    }
    const category = tags.shop ? `shop=${tags.shop}` : tags.craft ? `craft=${tags.craft}` : tags.office ? `office=${tags.office}` : `amenity=${tags.amenity}`;
    pois.push({ id: `${element.type}/${element.id}`, point, name: tags.name ?? "", category, ownBuilding: element.type !== "node" && tags.building ? `${element.type}/${element.id}` : null });
  }
  log(`POIs candidatos (shop/amenity comercial/craft/office a nivel de calle): ${pois.length}`);

  /* ------------------------------------------- POI → fachada del edificio */
  const nearestBuilding = (x, y) => {
    let best = null;
    let bestDistance = Infinity;
    for (const b of buildingIndex.near(x, y, 30)) {
      const inside = pointInRing(x, y, b.outer);
      let distance = 0;
      if (!inside) {
        distance = Infinity;
        for (let i = 0; i < b.outer.length; i += 1) {
          const p = b.outer[i];
          const q = b.outer[(i + 1) % b.outer.length];
          distance = Math.min(distance, distanceToSegment(x, y, p[0], p[1], q[0], q[1]).distance);
        }
      }
      // Un POI dentro de la huella manda sobre uno cercano a otra.
      const score = inside ? -1 : distance;
      if (score < bestDistance) {
        bestDistance = score;
        best = b;
      }
    }
    return bestDistance <= 12 ? best : null;
  };

  for (const poi of pois) {
    const building = poi.ownBuilding ? buildings.find((b) => b.id === poi.ownBuilding) ?? nearestBuilding(...poi.point) : nearestBuilding(...poi.point);
    if (!building) {
      rejected.noBuilding += 1;
      continue;
    }
    const candidates = (edgesByBuilding.get(building.id) ?? []).filter((e) => e.surface);
    if (candidates.length === 0) {
      rejected.noFacade += 1;
      continue;
    }
    let best = null;
    let bestScore = Infinity;
    for (const edge of candidates) {
      const { distance, t } = distanceToSegment(poi.point[0], poi.point[1], edge.a[0], edge.a[1], edge.b[0], edge.b[1]);
      const score = distance - (PEDESTRIAN.has(edge.surface) ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { edge, t: t * edge.length };
      }
    }
    if (!best || bestScore > 40) {
      rejected.noFacade += 1;
      continue;
    }
    best.edge.pois = best.edge.pois ?? [];
    best.edge.pois.push({ poi, t: best.t });
  }

  /* ------------------------------------------------------------ parcelas */
  const parcels = [];
  const push = (edge, from, to, source, poi = null) => {
    const width = to - from;
    if (width < MIN_WIDTH - 1e-6) return false;
    const A = [edge.a[0] + edge.tx * from, edge.a[1] + edge.ty * from];
    const B = [edge.a[0] + edge.tx * to, edge.a[1] + edge.ty * to];
    const zone = zoneOf((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
    parcels.push({
      id: stableId(edge.building.id, A, B),
      source,
      building: edge.building.id,
      buildingName: edge.building.name,
      poiId: poi?.id ?? "",
      poiName: poi?.name ?? "",
      category: poi?.category ?? "",
      width: Math.round(width * 100) / 100,
      A,
      B,
      nx: edge.nx,
      ny: edge.ny,
      surface: edge.surface,
      street: edge.street,
      zone: zone?.id ?? "",
    });
    edge.intervals.push([from, to]);
    return true;
  };

  for (const edge of edges) {
    if (!edge.pois) continue;
    const usable = [EDGE_INSET, edge.length - EDGE_INSET];
    edge.pois.sort((p, q) => p.t - q.t);
    // Frontera entre vecinos = punto medio; extremos = ±MAX_POI_WIDTH/2.
    for (let i = 0; i < edge.pois.length; i += 1) {
      const { poi, t } = edge.pois[i];
      const left = i === 0 ? t - MAX_POI_WIDTH / 2 : (edge.pois[i - 1].t + t) / 2;
      const right = i === edge.pois.length - 1 ? t + MAX_POI_WIDTH / 2 : (t + edge.pois[i + 1].t) / 2;
      let from = Math.max(usable[0], left);
      let to = Math.min(usable[1], right);
      if (to - from > MAX_POI_WIDTH) {
        const centre = Math.min(Math.max(t, from + MAX_POI_WIDTH / 2), to - MAX_POI_WIDTH / 2);
        from = centre - MAX_POI_WIDTH / 2;
        to = centre + MAX_POI_WIDTH / 2;
      }
      if (!push(edge, from, to, "osm_poi", poi)) rejected.tooDense += 1;
    }
  }
  const poiParcels = parcels.length;

  // Estimadas: solo en zonas comerciales, sobre el frente que queda libre.
  const targetWidth = config.estimatedTargetWidthM ?? 6;
  let estimatedEdges = 0;
  for (const edge of edges) {
    if (!edge.surface) continue;
    const kind = edge.building.kind;
    if (SKIP_BUILDING_KINDS.has(kind)) continue;
    const mid = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2];
    const zone = zoneOf(mid[0], mid[1]);
    if (!zone) continue;
    if (zone.frontage === "pedestrian" && !PEDESTRIAN.has(edge.surface)) continue;
    // Intervalos libres del borde.
    const taken = edge.intervals.slice().sort((p, q) => p[0] - q[0]);
    const free = [];
    let cursor = EDGE_INSET;
    for (const [from, to] of taken) {
      if (from - cursor >= MIN_WIDTH) free.push([cursor, from - 0.15]);
      cursor = Math.max(cursor, to + 0.15);
    }
    if (edge.length - EDGE_INSET - cursor >= MIN_WIDTH) free.push([cursor, edge.length - EDGE_INSET]);
    let any = false;
    for (const [from, to] of free) {
      const span = to - from;
      let n = Math.max(1, Math.round(span / targetWidth));
      // Nunca más ancho que un local grande (7,5 m): un frente largo se divide más.
      while (span / n > MAX_POI_WIDTH) n += 1;
      const width = span / n;
      if (width < MIN_WIDTH) continue;
      for (let k = 0; k < n; k += 1) any = push(edge, from + k * width, from + (k + 1) * width, "estimated") || any;
    }
    if (any) estimatedEdges += 1;
  }
  log(`Parcelas: ${poiParcels} de OSM · ${parcels.length - poiParcels} estimadas (${estimatedEdges} fachadas)`);

  /* ----------------------------------------------------- escritura y datos */
  const bySource = {};
  const byZone = {};
  for (const p of parcels) {
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    byZone[p.zone || "(fuera de zona)"] = (byZone[p.zone || "(fuera de zona)"] ?? 0) + 1;
  }
  const features = parcels.map((p) => ({
    type: "Feature",
    properties: {
      id: p.id,
      source: p.source,
      building: p.building,
      building_name: p.buildingName,
      poi_id: p.poiId,
      poi_name: p.poiName,
      category: p.category,
      width: p.width,
      nx: Math.round(p.nx * 1000) / 1000,
      ny: Math.round(p.ny * 1000) / 1000,
      surface: p.surface,
      street: p.street,
      zone: p.zone,
    },
    geometry: { type: "LineString", coordinates: [p.A, p.B].map(([x, y]) => frame.toLonLat(x, y).map((v) => Math.round(v * 1e8) / 1e8)) },
  }));
  await writeFile(join(BUILD_DIR, `${city.slug}.parcels.geojson`), JSON.stringify({ type: "FeatureCollection", features }));

  const ids = new Set(parcels.map((p) => p.id));
  if (ids.size !== parcels.length) warn(`Identificadores repetidos: ${parcels.length - ids.size}`);
  const summary = {
    generatedAt: new Date().toISOString().slice(0, 10),
    total: parcels.length,
    bySource: { catastro_unit: 0, osm_poi: 0, estimated: 0, ...bySource },
    byZone,
    uniqueIds: ids.size,
    poiCandidates: pois.length,
    poiRejected: rejected,
    note: "El conjunto INSPIRE de edificios del Catastro no publica unidades/locales con geometría: 0 parcelas de origen catastral. Las parcelas «estimadas» solo existen en las zonas comerciales declaradas.",
    zones: zones.map((z) => ({ id: z.id, name: z.name, frontage: z.frontage ?? "any" })),
  };
  await writeFile(join(BUILD_DIR, `${city.slug}.parcels-report.json`), JSON.stringify(summary, null, 2));
  log(`Por origen: ${JSON.stringify(summary.bySource)} · por zona: ${JSON.stringify(byZone)}`);
  log(`POIs descartados: ${JSON.stringify(rejected)}`);
  return summary;
}
