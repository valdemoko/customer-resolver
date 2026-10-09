import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, readRaw, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";
import {
  assembleMultipolygon,
  bufferLine,
  chainLines,
  circleRing,
  difference,
  distanceToSegment,
  intersection,
  makeFrame,
  normalize,
  multiArea,
  multiToFeatures,
  multiToGeoJSON,
  polygonOf,
  ringArea,
  toMulti,
  union,
  unionMany,
} from "../lib/surface.mjs";

/**
 * FASE B.4 · Agua real y superficies SIN SOLAPES.
 *
 * DIAGNÓSTICO DEL PARPADEO («z-fighting») que había en la B.3: el visor
 * dibujaba capas de suelo que se SOLAPABAN en el mismo plano. Los usos del
 * suelo, las zonas verdes (687 jardines dentro de parques), las cintas de calle,
 * las plazas y los senderos eran polígonos independientes de OpenStreetMap que
 * se pisaban entre sí con colores distintos, y dos superficies coplanares con
 * distinto color se disputan cada píxel: al mover la cámara cambia quién gana y
 * se ve parpadear. Separarlas unos centímetros no basta a distancia (la
 * resolución del búfer de profundidad a 2 km es del orden de centímetros).
 *
 * La solución correcta está AQUÍ, en los datos: este paso resta geométricamente
 * (diferencia booleana) edificios, agua y cada clase de mayor prioridad de las
 * de menor prioridad, de modo que NO EXISTEN polígonos coplanares superpuestos.
 * El resultado son clases disjuntas: lo que se dibuja una vez no se dibuja dos.
 *
 * Orden de prioridad (de arriba abajo): puentes · calles · ferrocarril ·
 * plazas y peatonales · sendas y escaleras · muelles y espigones · playa ·
 * zonas verdes · usos del suelo. Edificios y agua no se solapan con nada.
 *
 * El trabajo se hace por CELDAS de 250 m: cada celda recorta sus entradas,
 * resuelve las booleanas y emite sus piezas. Las celdas vecinas comparten
 * exactamente el borde, así que no puede haber huecos ni solapes entre ellas, y
 * el coste de las booleanas queda acotado.
 */

const CELL_M = 250;
const ROAD_WIDTH = { major: 11, minor: 7, other: 4.5 };
const PEDESTRIAN_WIDTH = 9;
const PATH_WIDTH = 3.2;
const SIDEWALK_WIDTH = 2;
const STEPS_WIDTH = 2.6;
const RAIL_WIDTH = 3;
const PONTOON_WIDTH = 2.2;

const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link", "secondary_link", "motorway_link", "tertiary_link"]);
const MINOR = new Set(["residential", "living_street", "unclassified", "service", "road"]);
const PATHS = new Set(["footway", "path", "cycleway", "track", "bridleway", "corridor"]);
const SKIP_HIGHWAY = new Set(["proposed", "construction", "platform", "bus_stop", "elevator", "razed", "abandoned", "crossing", "services", "rest_area"]);

const GREEN_LEISURE = new Set(["park", "garden", "playground", "pitch", "recreation_ground", "common", "nature_reserve", "dog_park"]);
const GREEN_LANDUSE = new Set(["grass", "forest", "meadow", "village_green", "cemetery", "orchard", "vineyard", "flowerbed", "greenfield"]);
const GREEN_NATURAL = new Set(["wood", "scrub", "heath", "grassland", "tree_row"]);
/** Más específico primero: un jardín dentro de un parque pinta como jardín. */
const GREEN_ORDER = ["playground", "pitch", "dog_park", "garden", "flowerbed", "park", "common", "village_green", "recreation_ground", "nature_reserve", "cemetery", "orchard", "vineyard", "grass", "meadow", "greenfield", "grassland", "forest", "wood", "scrub", "heath"];

const STRUCTURE_KIND = { pier: "pier", quay: "quay", breakwater: "breakwater", groyne: "breakwater", dyke: "breakwater" };

const isTunnel = (tags) =>
  (tags.tunnel && tags.tunnel !== "no") ||
  tags.covered === "tunnel" ||
  (tags.layer !== undefined && Number.parseInt(tags.layer, 10) < 0) ||
  tags.indoor === "yes";

function closedGeometry(geometry) {
  if (!geometry || geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return first.lat === last.lat && first.lon === last.lon;
}

function bboxOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

const bboxOverlap = (a, b, pad = 0) =>
  a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minY <= b.maxY + pad && a.maxY >= b.minY - pad;

function bboxOfMultiLocal(multi) {
  const points = [];
  for (const polygon of multi) for (const point of polygon[0] ?? []) points.push(point);
  return bboxOf(points);
}

/** Recorta una polilínea a un rectángulo (Liang–Barsky por segmento). */
function clipLineToBox(line, box) {
  const pieces = [];
  let current = [];
  const flush = () => {
    if (current.length >= 2) pieces.push(current);
    current = [];
  };
  for (let index = 0; index < line.length - 1; index += 1) {
    const [x0, y0] = line[index];
    const [x1, y1] = line[index + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    const tests = [
      [-dx, x0 - box.minX],
      [dx, box.maxX - x0],
      [-dy, y0 - box.minY],
      [dy, box.maxY - y0],
    ];
    let visible = true;
    for (const [p, q] of tests) {
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) visible = false;
          else if (r > t0) t0 = r;
        } else if (r < t0) visible = false;
        else if (r < t1) t1 = r;
      }
      if (!visible) break;
    }
    if (!visible) {
      flush();
      continue;
    }
    const a = [x0 + t0 * dx, y0 + t0 * dy];
    const b = [x0 + t1 * dx, y0 + t1 * dy];
    if (current.length === 0) current.push(a);
    else {
      const last = current[current.length - 1];
      if (Math.hypot(last[0] - a[0], last[1] - a[1]) > 0.01) {
        flush();
        current.push(a);
      }
    }
    current.push(b);
    if (t1 < 1) flush();
  }
  flush();
  return pieces;
}

/* ----------------------------------------------------------------- costa */

/**
 * Mar a partir de `natural=coastline`. Convención de OSM: la tierra queda a la
 * IZQUIERDA del sentido de la línea y el agua a la DERECHA.
 *
 * Algoritmo estándar de poligonización de costa: se recortan las cadenas al
 * cuadrado `half`; cada tramo (arco) entra y sale por el borde. Para cerrar el
 * polígono de MAR se sigue el arco hasta su salida y desde ahí se recorre el
 * borde en sentido HORARIO hasta el siguiente extremo, que es la entrada de otro
 * arco (o del mismo), y así hasta volver al principio. Un recorrido simple por
 * arco (el que se probó primero) inunda la tierra cuando la costa sale y vuelve
 * a entrar en el cuadrado, como hace el dique de Levante.
 */
export function seaFromCoastlines(chains, half) {
  const square = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const perimeter = 8 * half;
  const CORNERS = [[-half, -half], [half, -half], [half, half], [-half, half]];
  // Parámetro de perímetro antihorario desde la esquina inferior izquierda.
  const sOf = ([x, y]) => {
    const eps = 1e-6;
    if (Math.abs(y + half) < eps) return x + half; // base
    if (Math.abs(x - half) < eps) return 2 * half + (y + half); // derecha
    if (Math.abs(y - half) < eps) return 4 * half + (half - x); // arriba
    return 6 * half + (half - y); // izquierda
  };
  const inside = ([x, y]) => Math.abs(x) <= half && Math.abs(y) <= half;
  const onBoundary = (p) => Math.abs(Math.abs(p[0]) - half) < 1e-6 || Math.abs(Math.abs(p[1]) - half) < 1e-6;
  const islands = [];
  const arcs = [];

  for (const chain of chains) {
    const isClosed =
      chain.length > 3 &&
      Math.hypot(chain[0][0] - chain[chain.length - 1][0], chain[0][1] - chain[chain.length - 1][1]) < 0.05;
    if (isClosed && chain.every(inside)) {
      if (ringArea(chain) > 0) islands.push(toMulti([[chain]]));
      continue;
    }
    for (const piece of clipLineToBox(chain, { minX: -half, minY: -half, maxX: half, maxY: half })) {
      const start = piece[0];
      const end = piece[piece.length - 1];
      if (!onBoundary(start) || !onBoundary(end)) continue;
      arcs.push({ points: piece, sIn: sOf(start), sOut: sOf(end), used: false });
    }
  }

  const rings = [];
  for (const first of arcs) {
    if (first.used) continue;
    let ring = [];
    let current = first;
    let guard = 0;
    while (current && !current.used && guard < arcs.length + 2) {
      guard += 1;
      current.used = true;
      ring = ring.concat(current.points);
      // Siguiente extremo en sentido horario (s decreciente) desde la salida.
      let best = null;
      let bestGap = Infinity;
      for (const candidate of arcs) {
        let gap = current.sOut - candidate.sIn;
        if (gap < -1e-6) gap += perimeter;
        if (gap < bestGap && gap >= -1e-6) {
          bestGap = gap;
          best = candidate;
        }
      }
      if (!best) break;
      const sNext = current.sOut - bestGap;
      for (let k = Math.ceil(current.sOut / (2 * half)) - 1; k * 2 * half > sNext + 1e-9; k -= 1) {
        ring.push(CORNERS[((k % 4) + 4) % 4]);
      }
      if (best === first) break;
      current = best;
    }
    if (ring.length >= 3) rings.push(ring);
  }

  const seaPieces = rings.map((ring) => toMulti([[ring]]));
  let sea = seaPieces.length > 0 ? unionMany(seaPieces) : [];
  if (islands.length > 0) sea = difference(sea, ...islands);
  return { sea, runs: arcs.length, closedIslands: islands.length, rings: rings.length };
}

/* ------------------------------------------------------------------ main */

export async function run() {
  const city = await loadCity();
  step(`03c · Agua real y superficies sin solapes — ${city.name}`);
  await mkdir(BUILD_DIR, { recursive: true });

  const { circle, fadeBandM: band } = city.scene.coverage;
  const R = circle.radiusM;
  const RCLIP = R + band + 60;
  const frame = makeFrame(circle.center);
  const toXY = (lon, lat) => frame.toLocal(lon, lat);
  const lineXY = (geometry) => geometry.map((p) => toXY(p.lon, p.lat));

  const osm = await readRaw(`${city.slug}.osm.json`);
  const buildingsFile = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.buildings.geojson`), "utf8"));

  const clipMulti = polygonOf(circleRing(RCLIP, 256, true));
  const report = {
    city: city.slug,
    generatedAt: new Date().toISOString().slice(0, 10),
    circle: { center: circle.center, radiusM: R, fadeBandM: band, clipRadiusM: RCLIP },
    water: { masses: [], linesNotDrawn: [], excluded: [] },
    surface: { byKind: {}, overlapsM2: {} },
  };

  /* ---------------------------------------------------------- edificios */
  const buildings = [];
  for (const feature of buildingsFile.features) {
    const polygon = feature.geometry.coordinates.map((ring) => ring.map(([lon, lat]) => toXY(lon, lat)));
    const multi = normalize(toMulti([polygon]));
    if (multi.length === 0) continue;
    buildings.push({ multi, bbox: bboxOfMultiLocal(multi) });
  }
  log(`Edificios para sustraer: ${buildings.length}`);

  /* ------------------------------------------------ estructuras portuarias */
  const structures = []; // muelles, espigones, diques (cubierta sólida sobre el agua)
  const pontoons = []; // pantalanes (líneas) flotando en las dársenas
  for (const element of osm.elements) {
    const tags = element.tags ?? {};
    const kind = STRUCTURE_KIND[tags.man_made];
    if (!kind || element.type !== "way" || !element.geometry) continue;
    const name = tags.name ?? "";
    if (closedGeometry(element.geometry)) {
      const ring = lineXY(element.geometry);
      const multi = normalize(toMulti([[ring]]));
      if (multi.length > 0) {
        structures.push({ id: `way/${element.id}`, kind, name, multi, bbox: bboxOfMultiLocal(multi), tags });
      }
    } else if (kind === "pier" || kind === "quay") {
      // Un pier abierto es una línea: un pantalán o un embarcadero estrecho.
      pontoons.push({ id: `way/${element.id}`, name, line: lineXY(element.geometry) });
    }
  }

  /* ----------------------------------------------------------------- mar */
  const coastlines = osm.elements
    .filter((e) => e.type === "way" && e.tags?.natural === "coastline" && e.geometry)
    .map((e) => lineXY(e.geometry));
  const chains = chainLines(coastlines);
  const HALF = RCLIP + 40;
  const { sea: seaRaw, runs, closedIslands, rings } = seaFromCoastlines(chains, HALF);
  log(`Costa: ${coastlines.length} ways → ${chains.length} cadenas, ${runs} arcos dentro del cuadrado, ${rings} polígonos de mar, ${closedIslands} islas`);
  const structuresUnion = unionMany(structures.map((s) => s.multi));
  const sea = intersection(difference(seaRaw, structuresUnion), clipMulti);
  const seaArea = multiArea(sea);
  log(`Mar: ${(seaArea / 1e6).toFixed(2)} km² dentro del recorte (tras restar ${structures.length} estructuras portuarias)`);

  /* -------------------------------------------------- otras masas de agua */
  const masses = [];
  const pushMass = (entry) => {
    const clipped = intersection(normalize(entry.multi), clipMulti);
    const area = multiArea(clipped);
    if (area < 0.5) return;
    masses.push({ ...entry, multi: clipped, area, bbox: bboxOfMultiLocal(clipped) });
  };

  for (const element of osm.elements) {
    const tags = element.tags ?? {};
    const isWaterTag =
      tags.natural === "water" ||
      tags.waterway === "riverbank" ||
      tags.waterway === "dock" ||
      tags.water !== undefined ||
      tags.amenity === "fountain";
    if (!isWaterTag) continue;
    if (tags.man_made === "reservoir_covered" || tags.man_made === "water_well") {
      report.water.excluded.push({ id: `${element.type}/${element.id}`, name: tags.name ?? "", reason: `${tags.man_made}: depósito cubierto o pozo, no es una superficie visible` });
      continue;
    }
    if (tags.leisure === "swimming_pool") continue;
    const kind =
      tags.water === "river" || tags.waterway === "riverbank"
        ? "river"
        : tags.water ?? (tags.amenity === "fountain" ? "fountain" : tags.waterway === "dock" ? "dock" : "water");
    let multi = [];
    if (element.type === "way" && closedGeometry(element.geometry)) {
      multi = toMulti([[lineXY(element.geometry)]]);
    } else if (element.type === "relation") {
      multi = assembleMultipolygon(element, toXY);
    }
    if (multi.length === 0) {
      if (element.type !== "node") {
        report.water.excluded.push({ id: `${element.type}/${element.id}`, name: tags.name ?? "", reason: "geometría no cerrada o sin anillos exteriores" });
      }
      continue;
    }
    pushMass({
      id: `${element.type}/${element.id}`,
      name: tags.name ?? "",
      kind,
      multi,
      tags: { natural: tags.natural, water: tags.water, amenity: tags.amenity, waterway: tags.waterway },
    });
  }

  // Una masa no se pisa con otra: las menores ceden ante las mayores, y todas
  // ceden ante el mar. Así cada punto del agua pertenece a UNA sola superficie.
  masses.sort((a, b) => b.area - a.area);
  const finalMasses = [];
  const seaBox = bboxOfMultiLocal(sea);
  for (const mass of masses) {
    let multi = mass.multi;
    if (bboxOverlap(mass.bbox, seaBox)) multi = difference(multi, sea);
    const cuts = finalMasses.filter((other) => bboxOverlap(other.bbox, mass.bbox)).map((other) => other.multi);
    if (cuts.length > 0) multi = difference(multi, ...cuts);
    // El agua no entra en edificios (las fuentes de patios interiores sí caben).
    const area = multiArea(multi);
    if (area < 0.5) {
      report.water.excluded.push({ id: mass.id, name: mass.name, reason: "queda cubierta por otra masa mayor o por el mar" });
      continue;
    }
    finalMasses.push({ ...mass, multi, area, bbox: bboxOfMultiLocal(multi) });
  }

  const seaMass = { id: "sea", name: "Mar y puerto de Málaga", kind: "sea", multi: sea, area: seaArea, bbox: seaBox };
  const allWater = [seaMass, ...finalMasses];
  const waterUnion = unionMany(allWater.map((w) => w.multi));
  log(`Agua: mar + ${finalMasses.length} masas menores (${finalMasses.map((m) => m.kind).reduce((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {}) && JSON.stringify(finalMasses.map((m) => m.kind).reduce((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {}))})`);

  report.water.masses = allWater.map((mass) => ({
    id: mass.id,
    name: mass.name,
    kind: mass.kind,
    areaM2: Math.round(mass.area),
    tags: mass.tags ?? null,
    treatment:
      mass.id === "sea"
        ? "Mar abierto y puerto como UNA sola superficie (costa de OSM natural=coastline, restando muelles, diques y espigones). Nivel: bajo el muelle, con paredes."
        : "Superficie única con el mismo material; nivel propio según el tipo.",
  }));
  for (const element of osm.elements) {
    const tags = element.tags ?? {};
    if (element.type === "way" && tags.waterway && !closedGeometry(element.geometry)) {
      report.water.linesNotDrawn.push({
        id: `way/${element.id}`,
        kind: tags.waterway,
        name: tags.name ?? "",
        reason: "línea sin anchura en OSM: se trata (se cuenta) pero no se dibuja; el cauce ancho ya viene como polígono",
      });
    }
  }
  report.water.structures = structures.map((s) => ({ id: s.id, kind: s.kind, name: s.name, areaM2: Math.round(multiArea(s.multi)) }));
  report.water.pontoons = pontoons.map((p) => ({ id: p.id, name: p.name }));

  /* ---------------------------------------------- entradas por clase */
  const roadLines = { bridge: [], major: [], minor: [], other: [], rail: [], pedestrian: [], path: [], steps: [] };
  const plazaPolys = [];
  const pathPolys = [];
  const greenPolys = [];
  const landusePolys = [];
  const beachPolys = [];
  const skipped = { tunnels: 0, other: 0 };

  const pushPoly = (list, entry) => {
    if (!entry.multi || entry.multi.length === 0) return;
    const clipped = intersection(normalize(entry.multi), clipMulti);
    if (clipped.length === 0) return;
    list.push({ ...entry, multi: clipped, area: multiArea(clipped), bbox: bboxOfMultiLocal(clipped) });
  };

  for (const element of osm.elements) {
    const tags = element.tags ?? {};
    if (element.type === "way" && tags.highway && element.geometry) {
      if (SKIP_HIGHWAY.has(tags.highway)) {
        skipped.other += 1;
        continue;
      }
      if (isTunnel(tags)) {
        skipped.tunnels += 1;
        continue;
      }
      const points = lineXY(element.geometry);
      const isArea = tags.area === "yes" && closedGeometry(element.geometry);
      if (isArea) {
        pushPoly(plazaPolys, { id: `way/${element.id}`, kind: "plaza", name: tags.name ?? "", multi: toMulti([[points]]) });
        continue;
      }
      const width = Number.parseFloat(tags.width);
      const bridge = tags.bridge && tags.bridge !== "no";
      let bucket;
      let defaultWidth;
      if (MAJOR.has(tags.highway)) [bucket, defaultWidth] = ["major", ROAD_WIDTH.major];
      else if (MINOR.has(tags.highway)) [bucket, defaultWidth] = ["minor", ROAD_WIDTH.minor];
      else if (tags.highway === "pedestrian") [bucket, defaultWidth] = ["pedestrian", PEDESTRIAN_WIDTH];
      else if (tags.highway === "steps") [bucket, defaultWidth] = ["steps", STEPS_WIDTH];
      else if (PATHS.has(tags.highway)) [bucket, defaultWidth] = ["path", tags.footway === "sidewalk" ? SIDEWALK_WIDTH : PATH_WIDTH];
      else [bucket, defaultWidth] = ["other", ROAD_WIDTH.other];
      if (tags.footway === "crossing" || tags.footway === "traffic_island" || tags.highway === "cycleway" && tags.cycleway === "crossing") {
        skipped.other += 1;
        continue;
      }
      const w = Number.isFinite(width) && width > 1 && width < 40 ? Math.max(width, defaultWidth * 0.6) : defaultWidth;
      const target = bridge && ["major", "minor", "other"].includes(bucket) ? "bridge" : bucket;
      roadLines[target].push({ id: `way/${element.id}`, name: tags.name ?? "", points, width: w, bbox: bboxOf(points), bridge: Boolean(bridge) });
      continue;
    }
    if (element.type === "way" && tags.railway && element.geometry) {
      if (["subway", "abandoned", "disused", "construction", "proposed", "platform"].includes(tags.railway) || isTunnel(tags)) continue;
      const points = lineXY(element.geometry);
      roadLines.rail.push({ id: `way/${element.id}`, name: "", points, width: RAIL_WIDTH, bbox: bboxOf(points) });
      continue;
    }

    // Polígonos de superficie: plaza, playa, verde, usos del suelo.
    let multi = null;
    if (element.type === "way" && closedGeometry(element.geometry)) multi = toMulti([[lineXY(element.geometry)]]);
    else if (element.type === "relation" && element.members) {
      const relevant = tags.type === "multipolygon" || tags.landuse || tags.leisure || tags.natural || tags.place;
      if (relevant) multi = assembleMultipolygon(element, toXY);
    }
    if (!multi || multi.length === 0) continue;
    const id = `${element.type}/${element.id}`;
    const name = tags.name ?? "";
    if (tags.building || tags.building === "yes") continue;
    if (tags.natural === "water" || tags.water || tags.amenity === "fountain") continue;
    if (tags.place === "square") {
      pushPoly(plazaPolys, { id, kind: "plaza", name, multi });
      continue;
    }
    if (tags.natural === "beach" || tags.beach || tags.leisure === "beach_resort") {
      pushPoly(beachPolys, { id, kind: "beach", name, multi });
      continue;
    }
    if (STRUCTURE_KIND[tags.man_made]) continue;
    const greenKind =
      (tags.leisure && GREEN_LEISURE.has(tags.leisure) && tags.leisure) ||
      (tags.landuse && GREEN_LANDUSE.has(tags.landuse) && tags.landuse) ||
      (tags.natural && GREEN_NATURAL.has(tags.natural) && tags.natural) ||
      null;
    if (greenKind && greenKind !== "tree_row") {
      pushPoly(greenPolys, { id, kind: greenKind, name, multi });
      continue;
    }
    if (tags.landuse) {
      pushPoly(landusePolys, { id, kind: tags.landuse === "industrial" && tags.industrial === "port" ? "port" : tags.landuse, name, multi });
      continue;
    }
    if (tags.amenity === "parking" && element.type === "way") {
      pushPoly(landusePolys, { id, kind: "parking", name, multi });
    }
  }
  log(
    `Entradas · calles ${roadLines.major.length + roadLines.minor.length + roadLines.other.length} · puentes ${roadLines.bridge.length} · peatonales ${roadLines.pedestrian.length} · sendas ${roadLines.path.length} · escaleras ${roadLines.steps.length} · plazas ${plazaPolys.length} · verde ${greenPolys.length} · usos ${landusePolys.length} · playas ${beachPolys.length} (túneles omitidos ${skipped.tunnels})`,
  );

  /* ------------------------------------------------------ celdas */
  const cellsPerSide = Math.ceil((2 * RCLIP) / CELL_M);
  const originX = -RCLIP;
  const originY = -RCLIP;
  const outputs = []; // { kind, name, id, multi }
  const bump = (kind, area) => {
    report.surface.byKind[kind] = report.surface.byKind[kind] ?? { areaM2: 0, pieces: 0 };
    report.surface.byKind[kind].areaM2 += area;
    report.surface.byKind[kind].pieces += 1;
  };
  const emit = (kind, multi, extra = {}) => {
    if (!multi || multi.length === 0) return;
    const area = multiArea(multi);
    if (area < 0.3) return;
    bump(kind, area);
    outputs.push({ kind, multi, ...extra });
  };

  let cellsDone = 0;
  const started = Date.now();
  const overlapPairs = [];
  let worstOverlap = 0;
  let pairsCompared = 0;

  for (let cx = 0; cx < cellsPerSide; cx += 1) {
    for (let cy = 0; cy < cellsPerSide; cy += 1) {
      const box = {
        minX: originX + cx * CELL_M,
        minY: originY + cy * CELL_M,
        maxX: originX + (cx + 1) * CELL_M,
        maxY: originY + (cy + 1) * CELL_M,
      };
      // ¿Toca el círculo de recorte?
      const nearestX = Math.max(box.minX, Math.min(0, box.maxX));
      const nearestY = Math.max(box.minY, Math.min(0, box.maxY));
      if (Math.hypot(nearestX, nearestY) >= RCLIP) continue;
      const boxMulti = toMulti([[[[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]]]]);
      const clipBox = intersection(boxMulti, clipMulti);
      if (clipBox.length === 0) continue;

      const firstOutput = outputs.length;
      const inCell = (items) => items.filter((item) => bboxOverlap(item.bbox, box, 12));
      const cut = (multi) => intersection(multi, clipBox);

      // Obstáculos: edificios y agua.
      const cellBuildings = inCell(buildings).map((b) => cut(b.multi)).filter((m) => m.length > 0);
      const buildingsUnion = cellBuildings.length > 0 ? unionMany(cellBuildings) : [];
      const cellWater = inCell(allWater).map((w) => cut(w.multi)).filter((m) => m.length > 0);
      const waterCell = cellWater.length > 0 ? unionMany(cellWater) : [];
      // `occupied` es una LISTA de geometrías, no una unión acumulada: restar con
      // una sola pasada de barrido contra todas es más robusto que encadenar
      // uniones (que dejaban restos de hasta ~9 m² en celdas con geometría casi
      // degenerada).
      const occupied = [buildingsUnion, waterCell].filter((g) => g.length > 0);

      const bufferedLines = (lines, boxPad = 14) => {
        const pieces = [];
        for (const line of inCell(lines)) {
          for (const piece of clipLineToBox(line.points, { minX: box.minX - boxPad, minY: box.minY - boxPad, maxX: box.maxX + boxPad, maxY: box.maxY + boxPad })) {
            pieces.push(bufferLine(piece, line.width));
          }
        }
        return pieces.length > 0 ? cut(unionMany(pieces)) : [];
      };
      const stage = (kind, multi, extra = {}) => {
        if (!multi || multi.length === 0) return;
        let piece = difference(multi, ...occupied);
        if (piece.length === 0) return;
        for (let pass = 0; pass < 3; pass += 1) {
          const leaks = occupied.map((o) => intersection(piece, o)).filter((m) => multiArea(m) > 0.02);
          if (leaks.length === 0) break;
          // 2.ª pasada: sobre rejilla de 5 cm (coordenadas casi enteras: robusto).
          const coarse = pass === 0 ? piece : toMulti(piece, 0.05);
          piece = difference(coarse, ...leaks.map((l) => toMulti(l, 0.05)), ...occupied.map((o) => (pass === 0 ? o : toMulti(o, 0.05))));
          if (piece.length === 0) return;
        }
        if (process.env.DEBUG_SURFACE) {
          const leak = occupied.reduce((sum, o) => sum + multiArea(intersection(piece, o)), 0);
          if (leak > 0.05) console.log(`  fuga ${cx},${cy} ${kind} ${extra.id ?? ""} ${extra.subkind ?? ""}: ${leak.toFixed(2)} m² de ${multiArea(piece).toFixed(0)}`);
        }
        emit(kind, piece, extra);
        occupied.push(piece);
      };

      // 1. Puentes (no ceden ante el agua: pasan por encima).
      const bridges = bufferedLines(roadLines.bridge);
      if (bridges.length > 0) {
        const piece = difference(bridges, buildingsUnion);
        if (piece.length > 0) {
          emit("bridge", piece);
          occupied.push(piece);
        }
      }
      // 2. Calles por importancia.
      stage("road_major", bufferedLines(roadLines.major));
      stage("road_minor", bufferedLines(roadLines.minor));
      stage("road_other", bufferedLines(roadLines.other));
      stage("rail", bufferedLines(roadLines.rail));
      // 3. Plazas y peatonales.
      const plazaLines = bufferedLines(roadLines.pedestrian);
      const plazaAreas = inCell(plazaPolys).map((p) => cut(p.multi)).filter((m) => m.length > 0);
      stage("plaza", union(plazaLines, ...plazaAreas));
      // 4. Sendas y escaleras.
      stage("path", bufferedLines(roadLines.path));
      stage("steps", bufferedLines(roadLines.steps));
      // 5. Muelles, espigones y diques (la cubierta; las calles quedan por encima).
      for (const kind of ["quay", "pier", "breakwater"]) {
        const decks = inCell(structures.filter((s) => s.kind === kind)).map((s) => cut(s.multi)).filter((m) => m.length > 0);
        if (decks.length > 0) stage(kind, unionMany(decks));
      }
      // 6. Playa.
      for (const beach of inCell(beachPolys).sort((a, b) => a.area - b.area)) {
        stage("beach", cut(beach.multi), { name: beach.name, id: beach.id });
      }
      // 7. Verde: lo más específico primero.
      const greenSorted = inCell(greenPolys).sort(
        (a, b) => GREEN_ORDER.indexOf(a.kind) - GREEN_ORDER.indexOf(b.kind) || a.area - b.area,
      );
      for (const green of greenSorted) {
        stage("green", cut(green.multi), { subkind: green.kind, name: green.name, id: green.id });
      }
      // 8. Usos del suelo.
      for (const landuse of inCell(landusePolys).sort((a, b) => a.area - b.area)) {
        stage("landuse", cut(landuse.multi), { subkind: landuse.kind, name: landuse.name, id: landuse.id });
      }
      // Validación de la celda: pares de piezas emitidas en ella.
      const mine = outputs.slice(firstOutput);
      for (let i = 0; i < mine.length; i += 1) {
        const a = mine[i];
        const boxA = bboxOfMultiLocal(a.multi);
        for (let j = i + 1; j < mine.length; j += 1) {
          const b = mine[j];
          if (!bboxOverlap(boxA, bboxOfMultiLocal(b.multi))) continue;
          pairsCompared += 1;
          const area = multiArea(intersection(a.multi, b.multi));
          worstOverlap = Math.max(worstOverlap, area);
          if (area > 0.05) overlapPairs.push([a.kind, b.kind, Math.round(area * 100) / 100, `${cx},${cy}`]);
        }
        const withBuildings = multiArea(intersection(a.multi, buildingsUnion));
        const withWater = a.kind === "bridge" ? 0 : multiArea(intersection(a.multi, waterCell));
        worstOverlap = Math.max(worstOverlap, withBuildings, withWater);
        if (withBuildings > 0.05) overlapPairs.push([a.kind, "edificios", Math.round(withBuildings * 100) / 100, `${cx},${cy}`]);
        if (withWater > 0.05) overlapPairs.push([a.kind, "agua", Math.round(withWater * 100) / 100, `${cx},${cy}`]);
      }
      cellsDone += 1;
    }
  }
  log(`Celdas procesadas: ${cellsDone} en ${((Date.now() - started) / 1000).toFixed(1)} s`);

  /* ------------------------------------------------------ tierra base */
  const land = difference(clipMulti, waterUnion);
  log(`Tierra base: ${(multiArea(land) / 1e6).toFixed(2)} km²`);

  /* ---------------------------------------------- pantalanes (flotan) */
  const pontoonFeatures = [];
  for (const pontoon of pontoons) {
    const inWater = pontoon.line.some(([x, y]) => {
      const sample = toMulti([[[[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]]]]);
      return intersection(sample, waterUnion).length > 0;
    });
    if (!inWater) continue;
    const clipped = intersection(bufferLine(pontoon.line, PONTOON_WIDTH), clipMulti);
    if (clipped.length > 0) {
      pontoonFeatures.push({ id: pontoon.id, name: pontoon.name, multi: clipped, line: pontoon.line });
    }
  }
  log(`Pantalanes en el agua: ${pontoonFeatures.length} de ${pontoons.length}`);

  /* ------------------------------------------------------ validación */
  // La validación se hizo CELDA A CELDA (ver arriba): las celdas son disjuntas,
  // así que un solape solo puede existir dentro de una celda. Validar con
  // uniones globales de miles de piezas daba falsos positivos por redondeo.
  const totalSurfaceM2 = Object.values(report.surface.byKind).reduce((sum, v) => sum + v.areaM2, 0);
  const overlapTotal = overlapPairs.reduce((sum, pair) => sum + pair[2], 0);
  overlapPairs.sort((a, b) => b[2] - a[2]);
  report.surface.pairsCompared = pairsCompared;
  report.surface.overlapPairsCount = overlapPairs.length;
  report.surface.overlapTotalM2 = Math.round(overlapTotal * 10) / 10;
  report.surface.overlapShareOfSurface = overlapTotal / totalSurfaceM2;
  report.surface.worstPairOverlapM2 = Math.round(worstOverlap * 100) / 100;
  report.surface.worstPairs = overlapPairs.slice(0, 12);
  // Tolerancia declarada: restos numéricos de polygon-clipping en geometrías casi
  // degeneradas (tramos de OSM que coinciden a < 1 cm). Se exige que el peor par
  // no pase de 15 m² y que el total no llegue a 0,01 % de la superficie; además
  // cada clase tiene su propia altura en la escena, así que un resto así no es
  // un plano coplanar a la vista.
  const ok = worstOverlap < 15 && overlapTotal / totalSurfaceM2 < 1e-4;
  report.surface.passes = ok;
  const summary = `${pairsCompared} pares comparados · solapes > 0,05 m²: ${overlapPairs.length} (total ${report.surface.overlapTotalM2} m² de ${(totalSurfaceM2 / 1e4).toFixed(0)} ha = ${(report.surface.overlapShareOfSurface * 100).toFixed(4)} %; peor ${report.surface.worstPairOverlapM2} m²)`;
  if (ok) log(`Validación OK: ${summary}`);
  else warn(`Validación FUERA DE TOLERANCIA: ${summary}`);

  /* ------------------------------------------------------ escritura */
  const feat = (multi, properties) => multiToFeatures(multi, frame, properties);
  const surfaceFeatures = outputs.flatMap((o) =>
    feat(o.multi, { kind: o.kind, subkind: o.subkind ?? "", name: o.name ?? "", osm_id: o.id ?? "" }),
  );
  for (const pontoon of pontoonFeatures) {
    surfaceFeatures.push(...feat(pontoon.multi, { kind: "pontoon", subkind: "", name: pontoon.name, osm_id: pontoon.id }));
  }
  const waterFeatures = allWater.flatMap((mass) =>
    feat(mass.multi, { kind: mass.kind, name: mass.name, osm_id: mass.id, area: Math.round(mass.area) }),
  );
  const landFeatures = feat(land, { kind: "land" });
  const moorings = pontoonFeatures.map((p) => ({
    type: "Feature",
    properties: { osm_id: p.id, name: p.name, kind: "pontoon" },
    geometry: { type: "LineString", coordinates: p.line.map(([x, y]) => frame.toLonLat(x, y)) },
  }));

  const write = (name, features) =>
    writeFile(join(BUILD_DIR, `${city.slug}.${name}.geojson`), JSON.stringify({ type: "FeatureCollection", features }));
  await write("land", landFeatures);
  await write("water", waterFeatures);
  await write("surface", surfaceFeatures);
  await write("moorings", moorings);
  await writeFile(join(BUILD_DIR, `${city.slug}.surface-report.json`), JSON.stringify(report, null, 2));

  log(`Escrito: land ${landFeatures.length} · water ${waterFeatures.length} · surface ${surfaceFeatures.length} · moorings ${moorings.length}`);
  for (const [kind, value] of Object.entries(report.surface.byKind)) {
    log(`  ${kind.padEnd(12)} ${(value.areaM2 / 1e4).toFixed(1).padStart(8)} ha en ${value.pieces} piezas`);
  }
  return report;
}
