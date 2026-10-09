import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, readRaw, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { ringAreaM2, polygonCentroid, roundCoordinates, wayToPolygon } from "../lib/geo.mjs";

/**
 * Fusión de fuentes y resolución de la altura de cada edificio.
 *
 * Regla de prioridad, de más fiable a menos (documentada en docs/decisions.md):
 *   1. `catastro_gfa_derived`  superficie construida oficial ÷ superficie de
 *      la huella, redondeado a plantas, × 3,0 m
 *   2. `osm_height`            etiqueta `height` de OpenStreetMap
 *   3. `osm_levels`            `building:levels` × 3,0 m
 *   4. `default_estimate`      9 m (3 plantas), marcado como estimación
 *
 * Contexto medido, no supuesto: el conjunto INSPIRE de edificios del Catastro
 * NO publica el número de plantas en Málaga. Se comprobó sobre la respuesta
 * real: 136 de 136 edificios de una muestra lo marcan con `xsi:nil`. Lo que sí
 * publica, en el 99,6 % de los casos, es la superficie construida total
 * (`grossFloorArea`), de la que se derivan las plantas. Es un dato oficial
 * DERIVADO, no una altura declarada, y así se etiqueta.
 *
 * El origen viaja en la propiedad `height_source` de cada edificio, así que el
 * informe puede decir qué porcentaje es dato y qué porcentaje es estimación, y
 * cualquiera puede auditar un edificio concreto.
 */

const LEVEL_HEIGHT_M = 3.0;
const DEFAULT_LEVELS = 3;
const MIN_BUILDING_AREA_M2 = 12 / 2; // se descartan ruidos por debajo de 6 m²
const CATASTRO_MATCH_RADIUS_M = 15;

const STREET_CLASSES = {
  major: new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link", "secondary_link"]),
  minor: new Set(["residential", "living_street", "unclassified", "service", "road"]),
  pedestrian: new Set(["pedestrian"]),
  path: new Set(["footway", "path", "cycleway", "track", "bridleway"]),
  steps: new Set(["steps"]),
};

const GREEN_LEISURE = new Set(["park", "garden", "playground", "pitch", "recreation_ground", "common", "nature_reserve"]);
const GREEN_LANDUSE = new Set(["grass", "forest", "meadow", "village_green", "cemetery", "orchard", "vineyard"]);

function parseLengthMeters(raw) {
  if (raw === undefined || raw === null) return null;
  const match = String(raw).trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(m|ft|')?/i);
  if (!match) return null;
  let value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (match[2] && match[2].toLowerCase() === "ft") value *= 0.3048;
  if (value > 400) return null; // valor absurdo: se ignora y se cae al siguiente criterio
  return value;
}

function parseLevels(raw) {
  if (raw === undefined || raw === null) return null;
  const match = String(raw).trim().match(/^([0-9]{1,2})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 1 && value <= 60 ? value : null;
}

function classifyStreet(tags) {
  const highway = tags.highway;
  for (const [name, set] of Object.entries(STREET_CLASSES)) {
    if (set.has(highway)) return name;
  }
  return "other";
}

function buildingKind(tags) {
  if (tags.building === "yes" || tags.building === "building") return "generic";
  return String(tags.building ?? "generic");
}

/** Índice en rejilla para emparejar edificios entre dos fuentes. */
function buildGrid(items, cellDegrees = 0.0005) {
  const grid = new Map();
  for (const item of items) {
    const key = `${Math.floor(item.centroid[0] / cellDegrees)}:${Math.floor(item.centroid[1] / cellDegrees)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(item);
    else grid.set(key, [item]);
  }
  return { grid, cellDegrees };
}

function nearbyItems({ grid, cellDegrees }, point, radiusCells = 1) {
  const cx = Math.floor(point[0] / cellDegrees);
  const cy = Math.floor(point[1] / cellDegrees);
  const found = [];
  for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
    for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
      const bucket = grid.get(`${cx + dx}:${cy + dy}`);
      if (bucket) found.push(...bucket);
    }
  }
  return found;
}

/** Punto en polígono por lanzamiento de rayo, sobre el anillo exterior. */
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1]) {
      const x = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

export async function run() {
  const city = await loadCity();
  step(`03 · Fusión de fuentes y control de calidad — ${city.name}`);
  await mkdir(BUILD_DIR, { recursive: true });

  const osm = await readRaw(`${city.slug}.osm.json`);
  const catastro = await readRaw(`${city.slug}.catastro.json`);

  const report = {
    city: city.slug,
    generatedAt: new Date().toISOString().slice(0, 10),
    bbox: city.bounds,
    inputs: {
      osm: { endpoint: osm.endpoint, extractedAt: osm.extractedAt, elements: osm.counts.elements },
      catastro: {
        endpoint: catastro.endpoint,
        extractedAt: catastro.extractedAt,
        features: catastro.stats.features,
        coverageFloors: catastro.stats.coverageFloors,
      },
    },
    buildings: {
      osmWays: 0,
      osmRelations: 0,
      catastroTotal: catastro.buildings.length,
      matchedWithCatastro: 0,
      discardedTooSmall: 0,
      discardedInvalid: 0,
      discardedDuplicate: 0,
      byHeightSource: {},
    },
    buildingParts: {
      total: 0,
      used: 0,
      skippedRoof: 0,
      reason:
        "Las partes con `building:part=roof` se descartan (representan la cubierta, no superficie de planta). Las partes huérfanas, que no caen dentro de ningún edificio padre, también: no se puede saber a qué edificio pertenecen.",
    },
    notes: [],
  };

  // ---------------------------------------------------------------- edificios
  const buildings = [];
  const seenRings = new Set();

  function addBuilding({ ring, holes, tags, origin, osmId }) {
    const area = ringAreaM2(ring);
    if (area < MIN_BUILDING_AREA_M2) {
      report.buildings.discardedTooSmall += 1;
      return;
    }
    const key = ring
      .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
      .sort()
      .join("|");
    if (seenRings.has(key)) {
      report.buildings.discardedDuplicate += 1;
      return;
    }
    seenRings.add(key);
    const holeArea = holes.reduce((sum, hole) => sum + ringAreaM2(hole), 0);
    const netArea = Math.max(area - holeArea, 1);
    buildings.push({
      ring,
      holes,
      tags: tags ?? {},
      origin,
      osmId,
      areaM2: Math.round(area),
      // Superficie neta: la huella menos los patios. Es la que se usa para
      // derivar plantas, porque la superficie construida oficial no cuenta el
      // hueco de los patios.
      netAreaM2: netArea,
      centroid: polygonCentroid(ring),
    });
  }

  // Partes de edificio (`building:part`). Se recogen aparte y se aplican al
  // final: en el centro de Málaga hay 8.995, con `building:levels` en el 99,7 %
  // y CERO con `min_height`, así que no representan secciones verticales
  // apiladas sino subdivisiones de planta. Sustituyen a su edificio padre en
  // lugar de sumarse a él, para no duplicar volumen.
  const rawParts = [];

  for (const element of osm.elements) {
    if (
      element.type === "way" &&
      element.tags?.["building:part"] &&
      !element.tags?.building
    ) {
      if (element.tags["building:part"] === "roof") {
        report.buildingParts.skippedRoof += 1;
        continue;
      }
      const polygon = wayToPolygon(element);
      if (polygon) {
        rawParts.push({ ring: polygon.coordinates[0], tags: element.tags, id: `way/${element.id}` });
      }
      continue;
    }

    if (element.type === "way" && element.tags?.building) {
      const polygon = wayToPolygon(element);
      if (!polygon) {
        report.buildings.discardedInvalid += 1;
        continue;
      }
      addBuilding({
        ring: polygon.coordinates[0],
        holes: [],
        tags: element.tags,
        origin: "osm_way",
        osmId: `way/${element.id}`,
      });
      report.buildings.osmWays += 1;
      continue;
    }

    if (element.type === "relation" && element.tags?.building) {
      // Comprobado sobre los datos reales: todas las relaciones de edificio del
      // área tienen exactamente un anillo exterior, así que no hace falta coser
      // anillos. Si aparece una con varios, se descarta y se informa.
      const outers = element.members.filter((member) => member.role !== "inner");
      const inners = element.members.filter((member) => member.role === "inner");
      if (outers.length !== 1 || !outers[0].geometry) {
        report.buildings.discardedInvalid += 1;
        report.notes.push(
          `Relación ${element.id} descartada: ${outers.length} anillos exteriores (se esperaba 1).`,
        );
        continue;
      }
      const toRing = (geometry) => {
        const points = geometry.map((point) => [point.lon, point.lat]);
        const first = points[0];
        const last = points[points.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) points.push([first[0], first[1]]);
        return points.length >= 4 ? points : null;
      };
      const outerRing = toRing(outers[0].geometry);
      const innerRings = inners
        .filter((member) => member.geometry)
        .map((member) => toRing(member.geometry))
        .filter((ring) => ring !== null && ringAreaM2(ring) > 1);
      if (!outerRing) {
        report.buildings.discardedInvalid += 1;
        continue;
      }
      addBuilding({
        ring: outerRing,
        holes: innerRings,
        tags: element.tags,
        origin: "osm_relation",
        osmId: `relation/${element.id}`,
      });
      report.buildings.osmRelations += 1;
    }
  }

  // ------------------------------------------------- emparejado con Catastro
  const osmBuildings = buildings;
  const osmGrid = buildGrid(osmBuildings);
  // "Utilizable" para derivar altura = tiene superficie construida oficial y
  // geometría. NO se filtra por `floors`, porque en Málaga no viene nunca: eso
  // fue lo que dejó el emparejado a cero en la primera pasada.
  const catastroUsable = catastro.buildings.filter(
    (building) =>
      building.ring !== null &&
      (building.grossFloorArea !== null && building.grossFloorArea !== undefined),
  );

  const edgeDistanceMeters = (from, ring) =>
    Math.min(
      ...ring.map((point) =>
        Math.hypot(
          (point[0] - from[0]) * 89_300 * Math.cos((from[1] * Math.PI) / 180),
          (point[1] - from[1]) * 111_100,
        ),
      ),
    );

  const centreDistanceMeters = (a, b) =>
    Math.hypot(
      (a[0] - b[0]) * 89_300 * Math.cos((a[1] * Math.PI) / 180),
      (a[1] - b[1]) * 111_100,
    );

  for (const footprint of catastroUsable) {
    const candidates = nearbyItems(osmGrid, footprint.centroid, 2);

    // El emparejado exige contención en ALGUNA dirección, no solo que el
    // centroide catastral caiga dentro de la huella de OSM. Con una sola
    // dirección se perdían la mayoría de coincidencias, porque las dos fuentes
    // digitalizan los mismos edificios con criterios distintos (el Catastro
    // agrupa unidades, OSM separa volúmenes). Medido: la coincidencia pasó de
    // ~23 % a la cifra que publica el informe.
    const contained = candidates.filter(
      (candidate) =>
        pointInRing(footprint.centroid, candidate.ring) ||
        pointInRing(candidate.centroid, footprint.ring),
    );

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    if (contained.length > 0) {
      for (const candidate of contained) {
        const distance = centreDistanceMeters(footprint.centroid, candidate.centroid);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    } else {
      for (const candidate of candidates) {
        const distance = edgeDistanceMeters(footprint.centroid, candidate.ring);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }

    if (best && bestDistance <= CATASTRO_MATCH_RADIUS_M) {
      // Solo se acepta el dato del Catastro si es plausible frente a lo que ya
      // dice OSM. Una discrepancia enorme suele ser un problema de emparejado
      // (edificio vecino), no un dato mejor.
      const osmLevels = parseLevels(best.tags["building:levels"]);
      const plausible =
        osmLevels === null || Math.abs(footprint.floors - osmLevels) <= Math.max(3, osmLevels * 0.6);
      if (plausible) {
        if (!best.catastroReference) {
          if (footprint.floors !== null) {
            best.catastroFloors = footprint.floors;
          }
          if (
            footprint.grossFloorArea !== null &&
            footprint.grossFloorArea !== undefined &&
            // El divisor tiene que ser la huella del PROPIO edificio catastral.
            // Usar la huella de OSM mezclaba numerador de una fuente con
            // denominador de otra: cuando el edificio catastral es mayor que la
            // huella de OSM (o agrupa varias), el cociente se disparaba y salían
            // «11 plantas» en edificios de dos. Error detectado en la revisión
            // de la muestra, no por un test.
            footprint.areaM2 >= 20
          ) {
            best.catastroGfa = footprint.grossFloorArea;
            best.catastroFootprintM2 = footprint.areaM2;
          }
          best.catastroReference = footprint.reference;
          best.catastroUse = footprint.currentUse;
          report.buildings.matchedWithCatastro += 1;
        }
      }
    }
  }

  // -------------------------------------------------------- resolución altura
  for (const building of osmBuildings) {
    const tags = building.tags;
    let height = null;
    let source = null;

    if (building.catastroFloors !== null && building.catastroFloors !== undefined) {
      // Caso declarado por el Catastro. En Málaga hoy no ocurre nunca (lo mide
      // el paso 02), pero la regla se mantiene por si otra ciudad o una
      // actualización del conjunto sí lo publican.
      height = building.catastroFloors * LEVEL_HEIGHT_M;
      source = "catastro_floors";
    }
    if (height === null && building.catastroGfa && building.catastroFootprintM2) {
      const derivedFloors = Math.round(building.catastroGfa / building.catastroFootprintM2);
      if (derivedFloors >= 1 && derivedFloors <= 40) {
        building.derivedFloors = derivedFloors;
        building.gfaRatio = building.catastroGfa / building.catastroFootprintM2;
        height = derivedFloors * LEVEL_HEIGHT_M;
        source = "catastro_gfa_derived";
      }
    }
    if (height === null) {
      const osmHeight = parseLengthMeters(tags.height);
      if (osmHeight !== null) {
        height = osmHeight;
        source = "osm_height";
      }
    }
    if (height === null) {
      const levels = parseLevels(tags["building:levels"]);
      if (levels !== null) {
        height = levels * LEVEL_HEIGHT_M;
        source = "osm_levels";
      }
    }
    if (height === null) {
      height = DEFAULT_LEVELS * LEVEL_HEIGHT_M;
      source = "default_estimate";
    }

    building.height = Math.round(height * 10) / 10;
    building.heightSource = source;
  }

  // --------------------------------------- partes de edificio: NO se publican
  //
  // En el centro de Málaga hay 8.981 elementos `building:part`. En la primera
  // versión del pipeline sustituían a su edificio padre: cada parte era un
  // volumen independiente. Eso multiplicaba el detalle geométrico y también el
  // número de unidades del mapa, porque un mismo edificio aparecía como varias
  // secciones distintas.
  //
  // Está mal para lo que es este producto. Cada edificio tiene que ser UNA
  // unidad: una sola cosa que se pueda señalar y, más adelante, una sola
  // parcela publicitaria. Un edificio no se compra por secciones. Así que las
  // partes NO se publican: se cuentan —para poder decir cuántas se descartan y
  // por qué— y se quedan fuera. El recuento y el motivo van al informe; no se
  // borran para que parezca que no existen.
  // B.4 · Recorte CIRCULAR en el pipeline. Se conservan los edificios cuyo
  // centroide cae dentro del círculo más su banda de difuminado (y sus vértices,
  // dentro del recorte con 60 m de holgura): un edificio se publica ENTERO o no
  // se publica, nunca partido por el borde.
  const circle = city.scene.coverage.circle;
  const reach = circle.radiusM + city.scene.coverage.fadeBandM;
  const hardLimit = reach + 60;
  const mLon = 111_320 * Math.cos((circle.center[1] * Math.PI) / 180);
  const radial = ([lon, lat]) => Math.hypot((lon - circle.center[0]) * mLon, (lat - circle.center[1]) * 111_132);
  const circleStats = { outsideCentroid: 0, straddlingEdge: 0 };
  const finalBuildings = osmBuildings.filter((building) => {
    if (radial(building.centroid) > reach) {
      circleStats.outsideCentroid += 1;
      return false;
    }
    if (building.ring.some((point) => radial(point) > hardLimit)) {
      circleStats.straddlingEdge += 1;
      return false;
    }
    return true;
  });
  report.circle = { center: circle.center, radiusM: circle.radiusM, fadeBandM: city.scene.coverage.fadeBandM, ...circleStats };
  report.buildingParts.used = 0;
  report.buildingParts.reason =
    "Las partes de edificio NO se publican como unidades: cada edificio tiene que ser una sola unidad comprable. Se conserva el edificio completo (huella de way o multipolígono de relación) con una sola altura.";

  // El recuento por origen se hace sobre los edificios FINALES, no sumando
  // según se resuelven. Contarlos al resolver incluía los edificios padre que
  // después se retiran al ser sustituidos por sus partes, así que la suma de
  // orígenes (11.191) no cuadraba con el total publicado (8.471) y los
  // porcentajes del informe no se podían comprobar. El dato del informe tiene
  // que sumar el total o no sirve para auditar nada.
  const byHeightSource = {};
  for (const building of finalBuildings) {
    byHeightSource[building.heightSource] = (byHeightSource[building.heightSource] ?? 0) + 1;
  }
  report.buildings.byHeightSource = byHeightSource;

  // Contraste de las plantas derivadas del Catastro contra la etiqueta
  // `building:levels` de OpenStreetMap. Son dos fuentes independientes: el
  // acuerdo entre ambas es la evidencia que se publica en
  // docs/verification/malaga.md. No es una medición sobre el terreno.
  const crossCheck = finalBuildings
    .map((building) => {
      const levels = parseLevels(building.tags["building:levels"]);
      if (!levels || !building.derivedFloors) return null;
      const delta = building.derivedFloors - levels;
      return {
        osm_id: building.osmId,
        name: building.tags.name ?? "",
        catastro_ref: building.catastroReference ?? "",
        osm_levels: levels,
        catastro_derived_floors: building.derivedFloors,
        catastro_gross_floor_area_m2: building.catastroGfa,
        catastro_footprint_m2: Math.round(building.catastroFootprintM2 ?? 0),
        osm_footprint_net_m2: Math.round(building.netAreaM2),
        gfa_ratio_catastro_over_catastro: Number((building.gfaRatio ?? 0).toFixed(2)),
        height_used_m: building.height,
        height_from_osm_levels_m: levels * LEVEL_HEIGHT_M,
        delta_m: Math.round((building.height - levels * LEVEL_HEIGHT_M) * 10) / 10,
        abs_delta_floors: Math.abs(delta),
      };
    })
    .filter(Boolean);

  const withinOneFloor = crossCheck.filter((row) => row.abs_delta_floors <= 1).length;
  report.crossCheck = {
    buildingsComparable: crossCheck.length,
    agreementWithinOneFloor: withinOneFloor,
    agreementShare: crossCheck.length === 0 ? 0 : withinOneFloor / crossCheck.length,
    meanAbsoluteFloorDelta:
      crossCheck.length === 0
        ? 0
        : Number(
            (
              crossCheck.reduce((sum, row) => sum + row.abs_delta_floors, 0) / crossCheck.length
            ).toFixed(2),
          ),
    // Diez casos concretos, con nombre y referencia catastral, para que la
    // verificación se pueda repetir a mano. Se eligen los de mayor superficie
    // construida, que son los edificios singulares del centro.
    samples: crossCheck
      .slice()
      .sort((a, b) => (b.catastro_gross_floor_area_m2 ?? 0) - (a.catastro_gross_floor_area_m2 ?? 0))
      .slice(0, 10),
  };


  // ------------------------------------------------------------- otras capas
  const streets = [];
  const rails = [];
  const barriers = [];
  const waterPolygons = [];
  const waterLines = [];
  const greenPolygons = [];
  const landusePolygons = [];
  const places = [];
  const landmarks = [];

  for (const element of osm.elements) {
    const tags = element.tags ?? {};

    if (element.type === "way" && tags.highway) {
      if (!element.geometry.some((point) => radial([point.lon, point.lat]) <= hardLimit + 100)) continue;
      streets.push({
        type: "Feature",
        properties: {
          klass: classifyStreet(tags),
          kind: tags.highway,
          name: tags.name ?? "",
          oneway: tags.oneway === "yes" ? 1 : 0,
        },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((point) => [point.lon, point.lat]),
        },
      });
      continue;
    }

    if (element.type === "way" && tags.railway) {
      rails.push({
        type: "Feature",
        properties: { kind: tags.railway, name: tags.name ?? "" },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((point) => [point.lon, point.lat]),
        },
      });
      continue;
    }

    if (element.type === "way" && tags.barrier) {
      const line = {
        type: "Feature",
        properties: { kind: tags.barrier },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((point) => [point.lon, point.lat]),
        },
      };
      barriers.push(line);
      continue;
    }

    if (element.type === "way" && (tags.natural === "water" || tags.waterway)) {
      const polygon = wayToPolygon(element);
      if (polygon) {
        waterPolygons.push({
          type: "Feature",
          properties: { kind: tags.natural ?? tags.waterway ?? "water" },
          geometry: polygon,
        });
      } else {
        waterLines.push({
          type: "Feature",
          properties: { kind: tags.waterway, name: tags.name ?? "" },
          geometry: {
            type: "LineString",
            coordinates: element.geometry.map((point) => [point.lon, point.lat]),
          },
        });
      }
      continue;
    }

    if (element.type === "relation" && tags.natural === "water") {
      const outer = element.members.find((member) => member.role !== "inner" && member.geometry);
      if (outer) {
        const points = outer.geometry.map((point) => [point.lon, point.lat]);
        if (points.length >= 4) {
          const first = points[0];
          const last = points[points.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) points.push([first[0], first[1]]);
          waterPolygons.push({
            type: "Feature",
            properties: { kind: "water", name: tags.name ?? "" },
            geometry: { type: "Polygon", coordinates: [points] },
          });
        }
      }
      continue;
    }

    const isGreen = (tags.leisure && GREEN_LEISURE.has(tags.leisure)) || (tags.landuse && GREEN_LANDUSE.has(tags.landuse)) || tags.natural === "wood";
    if (element.type === "way" && isGreen) {
      const polygon = wayToPolygon(element);
      if (polygon) {
        greenPolygons.push({
          type: "Feature",
          properties: {
            kind: tags.leisure ?? tags.landuse ?? tags.natural ?? "green",
            name: tags.name ?? "",
          },
          geometry: polygon,
        });
      }
      continue;
    }

    if (element.type === "way" && tags.landuse) {
      const polygon = wayToPolygon(element);
      if (polygon) {
        landusePolygons.push({
          type: "Feature",
          properties: { kind: tags.landuse, name: tags.name ?? "" },
          geometry: polygon,
        });
      }
      continue;
    }

    if (element.type === "node" && (tags.place || tags.amenity || tags.tourism)) {
      const entry = {
        type: "Feature",
        properties: {
          name: tags.name ?? "",
          klass: tags.place ?? tags.amenity ?? tags.tourism ?? "",
          population: tags.population ?? "",
        },
        geometry: { type: "Point", coordinates: [element.lon, element.lat] },
      };
      if (tags.place) places.push(entry);
      if (tags.amenity || tags.tourism) landmarks.push(entry);
    }
  }


  // ------------------------------------------------------ informe de calidad
  const totalBuildings = finalBuildings.length;
  const realHeight = totalBuildings - (report.buildings.byHeightSource.default_estimate ?? 0);
  report.buildings.total = totalBuildings;
  report.buildings.realHeightShare = totalBuildings === 0 ? 0 : realHeight / totalBuildings;
  report.buildings.catastroMatchShare =
    catastroUsable.length === 0 ? 0 : report.buildings.matchedWithCatastro / catastroUsable.length;
  report.buildings.catastroUsable = catastroUsable.length;
  report.buildings.catastroDeclaredFloorsAvailable = catastro.buildings.filter(
    (building) => building.floors !== null,
  ).length;
  report.buildings.catastroGrossFloorAreaAvailable = catastroUsable.length;  report.buildingParts.total = rawParts.length;
  report.relationsNotAssembled = osm.counts.relations - report.buildings.osmRelations;
  if (report.relationsNotAssembled > 0) {
    report.notes.push(
      `${report.relationsNotAssembled} relaciones de OpenStreetMap no se han ensamblado (no son edificios: agua, usos del suelo, etc.). Solo el agua se procesa por su anillo exterior.`,
    );
  }
  report.layers = {
    buildings: totalBuildings,
    streets: streets.length,
    rails: rails.length,
    barriers: barriers.length,
    water_polygons: waterPolygons.length,
    water_lines: waterLines.length,
    green: greenPolygons.length,
    landuse: landusePolygons.length,
    places: places.length,
    landmarks: landmarks.length,
  };

  // ------------------------------------------------------------- escritura
  const buildingFeatures = finalBuildings.map((building) => ({
    type: "Feature",
    properties: {
      height: building.height,
      // Altura mínima > 0 solo si algún día hay información de base; hoy todo
      // arranca del suelo.
      min_height: 0,
      height_source: building.heightSource,
      kind: buildingKind(building.tags),
      levels: parseLevels(building.tags["building:levels"]) ?? 0,
      area: building.areaM2,
      floors_derived: building.derivedFloors ?? 0,
      name: building.tags.name ?? "",
      origin: building.origin,
      osm_id: building.osmId,
      parent_id: building.parentOsmId ?? "",
      catastro_ref: building.catastroReference ?? "",
      catastro_use: building.catastroUse ?? "",
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        roundCoordinates(building.ring, 7),
        ...building.holes.map((hole) => roundCoordinates(hole, 7)),
      ],
    },
  }));

  const features = {
    buildings: buildingFeatures,
    streets,
    rails,
    barriers,
    water_polygons: waterPolygons,
    water_lines: waterLines,
    green: greenPolygons,
    landuse: landusePolygons,
    places,
    landmarks,
  };

  for (const [name, list] of Object.entries(features)) {
    await writeFile(
      join(BUILD_DIR, `${city.slug}.${name}.geojson`),
      JSON.stringify({ type: "FeatureCollection", features: list }),
    );
  }

  await writeFile(join(BUILD_DIR, `${city.slug}.quality.json`), JSON.stringify(report, null, 2));

  log(`Edificios: ${totalBuildings} (ways ${report.buildings.osmWays}, relaciones ${report.buildings.osmRelations})`);
  log(
    `Alturas — Catastro declarado ${report.buildings.byHeightSource.catastro_floors ?? 0} · Catastro derivado ${report.buildings.byHeightSource.catastro_gfa_derived ?? 0} · OSM height ${report.buildings.byHeightSource.osm_height ?? 0} · OSM levels ${report.buildings.byHeightSource.osm_levels ?? 0} · estimada ${report.buildings.byHeightSource.default_estimate ?? 0}`,
  );
  log(
    `Contraste independiente Catastro↔OSM: ${withinOneFloor} de ${crossCheck.length} coinciden dentro de 1 planta (${(report.crossCheck.agreementShare * 100).toFixed(1)} %), diferencia media ${report.crossCheck.meanAbsoluteFloorDelta} plantas`,
  );
  log(`Altura NO estimada por defecto: ${(report.buildings.realHeightShare * 100).toFixed(1)} %`);
  log(
    `Emparejados con Catastro: ${report.buildings.matchedWithCatastro} de ${catastroUsable.length} edificios catastrales con superficie construida (${(report.buildings.catastroMatchShare * 100).toFixed(1)} %)`,
  );
  log(
    `Catastro: plantas declaradas disponibles en ${report.buildings.catastroDeclaredFloorsAvailable} de ${catastro.buildings.length} · superficie construida en ${catastroUsable.length}`,
  );
  log(
    `Partes de edificio: ${rawParts.length} encontradas · 0 publicadas (cada edificio es una sola unidad) · cubiertas descartadas ${report.buildingParts.skippedRoof}`,
  );
  log(`Descartados por pequeños: ${report.buildings.discardedTooSmall} · duplicados: ${report.buildings.discardedDuplicate} · inválidos: ${report.buildings.discardedInvalid}`);
  log(
    `Capas — calles ${streets.length}, agua ${waterPolygons.length + waterLines.length}, verde ${greenPolygons.length}, usos ${landusePolygons.length}, hitos ${landmarks.length}`,
  );
  if (report.buildings.realHeightShare < 0.9) {
    warn(
      `Menos del 90 % de los edificios tiene altura de fuente real o declarada. Se publica en el informe, no se esconde.`,
    );
  }

  return report;
}
