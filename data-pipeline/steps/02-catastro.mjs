import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { fetchText, isoDate } from "../lib/http.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { RAW_DIR, loadCity } from "../lib/city.mjs";
import { polygonCentroid, ringAreaM2, splitBBox } from "../lib/geo.mjs";

const WFS = "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx";

/**
 * LÍMITES REALES DEL SERVICIO, medidos sobre él (no supuestos):
 *
 *   1. `startIndex` SE IGNORA por completo. La página 0 y la página 200
 *      devuelven exactamente los mismos edificios, así que paginar es inútil:
 *      o duplica datos o —como ocurría— trunca en silencio.
 *   2. El número de miembros por respuesta está limitado por el servidor. Con
 *      `count=200` devolvía 199 sobre celdas que en realidad tienen 705
 *      edificios: la primera pasada capturó el 28 % de los datos sin avisar.
 *   3. Una petición demasiado grande (el bbox completo) devuelve una página de
 *      error de ASP.NET en lugar de un resultado.
 *
 * Conclusión: hay que pedir CELDAS PEQUEÑAS y no paginar. La estrategia es
 * adaptativa y se autoverifica: si una celda devuelve tantos miembros como se
 * pidieron, se considera posiblemente truncada y se subdivide en cuatro. Así el
 * pipeline detecta el truncamiento en lugar de confiar en que no ocurra.
 */
const REQUEST_COUNT = 1500;
const SUBDIVIDE_THRESHOLD = REQUEST_COUNT - 1;
/**
 * Rejilla de 8 × 6 celdas (unos 130 × 130 m cada una). Se empezó con 5 × 4 y
 * las celdas del centro histórico eran lo bastante grandes como para que el
 * servidor tardara minutos o devolviera error: 21 minutos sin avanzar. Celdas
 * más pequeñas significan respuestas más rápidas y menos subdivisiones.
 */
const CELL_GRID = { columns: 8, rows: 6 };
const MAX_SUBDIVISIONS = 3;
const CELL_TIMEOUT_MS = 90_000;

/**
 * Parser del GML del Catastro.
 *
 * `removeNSPrefix` deja los nombres sin prefijo (`Building`, `posList`,
 * `numberOfFloorsAboveGround`…), así que el código no depende de que el
 * Catastro mantenga los mismos prefijos de espacio de nombres.
 */
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseAttributeValue: false,
  trimValues: true,
  // El servicio devuelve `featureMember` (estilo GML 3.1), no `member`: se
  // comprobó sobre la respuesta real. Se aceptan ambos nombres para no depender
  // de un detalle del servidor.
  isArray: (name) =>
    name === "Building" ||
    name === "featureMember" ||
    name === "member" ||
    name === "PolygonPatch" ||
    name === "OfficialArea",
});

/** Los `posList` del Catastro vienen como "lat lon lat lon" (es decir, y x). */
function parsePosList(text) {
  const numbers = String(text).trim().split(/\s+/).map(Number);
  if (numbers.length < 8 || numbers.length % 2 !== 0) return null;
  const ring = [];
  for (let i = 0; i < numbers.length; i += 2) {
    ring.push([numbers[i + 1], numbers[i]]);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring.length >= 4 ? ring : null;
}

function valueOf(node) {
  if (node === undefined || node === null) return null;
  if (typeof node === "object") {
    if (node["@nilReason"] || node["@xsi:nil"] === "true") return null;
    if ("#text" in node) return node["#text"];
    return null;
  }
  return String(node);
}

/** Recorre el árbol buscando la primera clave con el nombre dado. */
function findFirst(node, key, depth = 0) {
  if (depth > 12 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirst(item, key, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (key in node) return node[key];
  for (const child of Object.values(node)) {
    const found = findFirst(child, key, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function collectBuildings(featureCollection) {
  const members = featureCollection?.featureMember ?? featureCollection?.member ?? [];
  const list = Array.isArray(members) ? members : [members];
  const buildings = [];
  for (const member of list) {
    const building = member?.Building ?? member;
    if (!building) continue;
    if (Array.isArray(building)) buildings.push(...building);
    else buildings.push(building);
  }
  return buildings;
}

function buildUrl(cell, count = REQUEST_COUNT) {
  const bbox = `${cell.south},${cell.west},${cell.north},${cell.east},urn:ogc:def:crs:EPSG::4326`;
  const params = new URLSearchParams({
    service: "wfs",
    version: "2.0.0",
    request: "GetFeature",
    typenames: "bu:Building",
    srsName: "EPSG::4326",
    bbox,
    count: String(count),
  });
  return `${WFS}?${params.toString()}`;
}

/** Subdivide una celda en cuatro, para reducir el número de miembros por respuesta. */
function quarter(cell) {
  const midLon = (cell.west + cell.east) / 2;
  const midLat = (cell.south + cell.north) / 2;
  return [
    { west: cell.west, south: cell.south, east: midLon, north: midLat },
    { west: midLon, south: cell.south, east: cell.east, north: midLat },
    { west: cell.west, south: midLat, east: midLon, north: cell.north },
    { west: midLon, south: midLat, east: cell.east, north: cell.north },
  ];
}

export async function run() {
  const city = await loadCity();
  step(`02 · Catastro INSPIRE (edificios) — ${city.name}`);

  await mkdir(RAW_DIR, { recursive: true });

  // Rejilla inicial. Cada celda se subdivide sola si la respuesta llega al
  // límite del servidor.
  const cells = splitBBox(city.bounds, CELL_GRID.columns, CELL_GRID.rows);

  const buildings = [];
  const stats = {
    initialCells: cells.length,
    cellsFetched: 0,
    emptyCells: 0,
    subdivisions: 0,
    maxMembersSeen: 0,
    requests: 0,
    features: 0,
    withFloors: 0,
    withFloorsNil: 0,
    withBuildingUnits: 0,
    withCurrentUse: 0,
    withReference: 0,
    withGrossFloorArea: 0,
    withOfficialFootprintArea: 0,
    withoutGeometry: 0,
    byUse: {},
  };

  /** Cola de trabajo: cada entrada lleva su profundidad de subdivisión. */
  const queue = cells.map((cell) => ({ cell, depth: 0 }));
  let processed = 0;

  while (queue.length > 0) {
    const { cell, depth } = queue.shift();
    processed += 1;
    const url = buildUrl(cell);
    let text;
    try {
      ({ text } = await fetchText(url, {
        timeoutMs: CELL_TIMEOUT_MS,
        // Sin reintentos: si el servidor rechaza la celda, lo correcto es
        // subdividirla, no insistir doce minutos con la misma petición.
        retries: 1,
        returnServerErrors: true,
      }));
    } catch (error) {
      // B.4: una celda densa que agota el tiempo se subdivide, igual que una
      // que el servidor rechaza; solo se aborta si ya no se puede subdividir.
      if (depth < MAX_SUBDIVISIONS) {
        warn(`Celda ${processed} sin respuesta a tiempo (${String(error.message).slice(0, 60)}). Se subdivide (nivel ${depth + 1}).`);
        stats.subdivisions += 1;
        queue.push(...quarter(cell).map((child) => ({ cell: child, depth: depth + 1 })));
        continue;
      }
      throw error;
    }
    stats.requests += 1;

    let parsed;
    try {
      parsed = parser.parse(text);
    } catch (error) {
      throw new Error(`GML ilegible en la celda ${processed}: ${error.message}`);
    }

    // B.4: al ampliar la zona hacia el mar, hay celdas sin ningún edificio que el
    // servicio contesta con un ExceptionReport «No records founded for BBOX».
    // Es una celda vacía legítima (agua), no un fallo.
    if (parsed?.ExceptionReport && text.includes("No records")) {
      stats.emptyCells += 1;
      continue;
    }

    const collection = parsed?.FeatureCollection;
    if (!collection) {
      const isServerError =
        text.includes("Runtime Error") || text.includes("Server Error") || text.includes("<html");
      if (isServerError && depth < MAX_SUBDIVISIONS) {
        warn(
          `Celda ${processed} rechazada por el servidor (error de runtime). Se subdivide (nivel ${depth + 1}).`,
        );
        stats.subdivisions += 1;
        queue.push(...quarter(cell).map((child) => ({ cell: child, depth: depth + 1 })));
        continue;
      }
      throw new Error(
        `Respuesta inesperada del WFS en la celda ${processed}. Claves raíz: ${Object.keys(parsed ?? {}).join(", ")}. Inicio: ${text.slice(0, 300)}`,
      );
    }
    // Una celda sin edificios devuelve un FeatureCollection vacío (solo `@id` y
    // `@schemaLocation`). Eso es un resultado válido —ocurre en el puerto y en
    // el mar—, no un error. Se contabiliza como cero y se sigue.
    const hasMembers = "featureMember" in collection || "member" in collection;
    const page = hasMembers ? collectBuildings(collection) : [];
    if (!hasMembers) {
      stats.emptyCells += 1;
    }
    if (!hasMembers && Object.keys(collection).length <= 2 && !text.includes("FeatureCollection")) {
      throw new Error(
        `Respuesta ininteligible del WFS en la celda ${processed}. Claves: ${Object.keys(collection).join(", ")}`,
      );
    }
    stats.maxMembersSeen = Math.max(stats.maxMembersSeen, page.length);

    // Autoverificación del truncamiento: si la respuesta llega al límite, esta
    // celda puede estar incompleta y se subdivide.
    if (page.length >= SUBDIVIDE_THRESHOLD && depth < MAX_SUBDIVISIONS) {
      warn(
        `Celda en el límite del servidor (${page.length} miembros). Se subdivide para no truncar datos (nivel ${depth + 1}).`,
      );
      stats.subdivisions += 1;
      queue.push(...quarter(cell).map((child) => ({ cell: child, depth: depth + 1 })));
      continue;
    }

    stats.cellsFetched += 1;

    for (const building of page) {
        const referenceNode = findFirst(building, "referenceGeometry");
        const reference = valueOf(findFirst(building, "reference"));
        const posListNode = findFirst(building, "posList");
        const floorsRaw = findFirst(building, "numberOfFloorsAboveGround");
        const floors = valueOf(floorsRaw);
        const units = valueOf(findFirst(building, "numberOfBuildingUnits"));
        const use = valueOf(findFirst(building, "currentUse"));
        const lifespan = valueOf(findFirst(building, "beginLifespanVersion"));

        // Superficie oficial. El conjunto INSPIRE de edificios NO publica el
        // número de plantas en Málaga (todas las respuestas lo marcan como
        // `xsi:nil`, medido en el paso), pero SÍ la superficie construida
        // total con su referencia (`grossFloorArea`). Es la base de la
        // estimación de plantas derivada.
        const areas = [findFirst(building, "OfficialArea")]
          .flat(Infinity)
          .filter(Boolean)
          .map((area) => ({
            reference: valueOf(findFirst(area, "officialAreaReference")),
            value: Number(valueOf(findFirst(area, "value"))),
          }))
          .filter((area) => Number.isFinite(area.value) && area.value > 0);

        const grossFloorArea =
          areas.find((area) => area.reference === "grossFloorArea")?.value ??
          areas.find((area) => area.reference === "totalFloorArea")?.value ??
          null;
        const footprintOfficialArea =
          areas.find((area) => area.reference === "buildingFootprintArea")?.value ?? null;

        const ring = posListNode ? parsePosList(typeof posListNode === "string" ? posListNode : posListNode["#text"]) : null;

        stats.features += 1;
        if (reference !== null) stats.withReference += 1;
        if (use !== null) stats.withCurrentUse += 1;
          if (units !== null) stats.withBuildingUnits += 1;
        if (grossFloorArea !== null) stats.withGrossFloorArea += 1;
        if (footprintOfficialArea !== null) stats.withOfficialFootprintArea += 1;
        if (floors === null) {
          stats.withFloorsNil += 1;
        } else if (Number.isFinite(Number(floors)) && Number(floors) > 0) {
          stats.withFloors += 1;
        } else {
          stats.withFloorsNil += 1;
        }
        if (use !== null) stats.byUse[use] = (stats.byUse[use] ?? 0) + 1;

        if (!ring) {
          stats.withoutGeometry += 1;
          continue;
        }

        buildings.push({
          reference,
          floors: floors !== null && Number.isFinite(Number(floors)) ? Number(floors) : null,
          buildingUnits: units !== null && Number.isFinite(Number(units)) ? Number(units) : null,
          currentUse: use,
          beginLifespanVersion: lifespan,
          referenceGeometry: referenceNode !== null,
          grossFloorArea,
          footprintOfficialArea,
          ring,
          areaM2: Math.round(ringAreaM2(ring)),
        centroid: polygonCentroid(ring),
      });
    }

    log(
      `Celda ${processed} resuelta · edificios ${stats.features} · pendientes ${queue.length}`,
    );
  }

  log(
    `Celdas iniciales ${stats.initialCells} → celdas resueltas ${stats.cellsFetched} (${stats.subdivisions} subdivisiones, ${stats.emptyCells} vacías) · máximo de miembros en una respuesta: ${stats.maxMembersSeen}`,
  );
  if (stats.maxMembersSeen >= SUBDIVIDE_THRESHOLD) {
    warn(
      `Alguna respuesta llegó al límite del servidor incluso tras subdividir: los datos pueden estar incompletos. El informe de calidad lo declara.`,
    );
  }

  const coverage = stats.features === 0 ? 0 : stats.withFloors / stats.features;

  const record = {
    city: city.slug,
    source: "Dirección General del Catastro — conjunto INSPIRE de edificios (BU)",
    sourceId: "catastro-bu",
    endpoint: WFS,
    extractedAt: isoDate(),
    crs: "EPSG:4326 (solicitado por srsName); origen publicado en EPSG:25830",
    stats: { ...stats, coverageFloors: coverage },
    buildings,
  };

  const out = join(RAW_DIR, `${city.slug}.catastro.json`);
  await writeFile(out, JSON.stringify(record));
  log(`Guardado ${out}`);

  // Medición explícita: es la pregunta que decidía si se puede prometer altura
  // real. No se redondea ni se maquilla.
  log(
    `COBERTURA DE ALTURAS REALES: ${stats.withFloors} de ${stats.features} edificios traen número de plantas = ${(coverage * 100).toFixed(1)} %`,
  );
  log(
    `  sin dato (xsi:nil o ausente): ${stats.withFloorsNil} · sin geometría: ${stats.withoutGeometry} · sin referencia: ${stats.features - stats.withReference}`,
  );
  log(`  peticiones WFS: ${stats.requests}`);
  log(
    `  superficie construida oficial (grossFloorArea) disponible en ${stats.withGrossFloorArea} de ${stats.features} edificios = ${((stats.withGrossFloorArea / Math.max(1, stats.features)) * 100).toFixed(1)} %`,
  );

  return record;
}
