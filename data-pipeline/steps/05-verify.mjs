import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchJson } from "../lib/http.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { BUILD_DIR, PIPELINE_DIR, loadCity } from "../lib/city.mjs";
import { distanceMeters } from "../lib/geo.mjs";

/**
 * Verificación de fidelidad geográfica y de alturas.
 *
 * QUÉ ES Y QUÉ NO ES. Esto NO es una medición sobre el terreno ni una
 * comparación contra cartografía oficial certificada. Es una comprobación de
 * consistencia posicional: las coordenadas de los puntos de control salen de
 * Wikipedia —una fuente que NO alimenta el mapa en ningún punto— y se mide a qué
 * distancia caen de la geometría publicada. Si el mapa estuviera desplazado o
 * mal proyectado, las distancias lo delatarían. Se escribe con estas palabras
 * porque es lo que es.
 *
 * POR QUÉ POR TÍTULO EXACTO Y NO POR BÚSQUEDA POR ÁREA. La primera versión
 * buscaba artículos geolocalizados en un radio y emparejaba por subcadena del
 * título («marina» incluía cualquier cosa con esa palabra). Salió mal de dos
 * maneras medibles:
 *
 *  · `list=geosearch` con `gslimit=100` devuelve como máximo 100 artículos: en
 *    el centro de Málaga hay más de 100 geolocalizados en 350 m, así que la
 *    lista se truncaba y solo aparecían los 4 más cercanos. Cuatro de los diez
 *    puntos «no tenían coordenada» cuando sí la tienen.
 *  · El emparejamiento por subcadena podía casar el artículo equivocado y dar
 *    por buena una coordenada que no era la del punto de control.
 *
 * Ahora cada punto de control nombra su artículo exacto y la coordenada se pide
 * a `prop=coordinates`, que devuelve la del artículo (no la de un resultado
 * parecido). La búsqueda por área se conserva solo como CONTRASTE: se recorre
 * una rejilla de centros y se comprueba si el punto aparece también por ahí, que
 * es una segunda vía de la misma fuente. Se publica cuántos aparecen y si alguna
 * consulta se truncó.
 */

/** Los diez puntos de control, cada uno con su artículo exacto de Wikipedia. */
const CONTROL_POINTS = [
  { id: "plaza-constitucion", label: "Plaza de la Constitución", article: "Plaza de la Constitución (Málaga)" },
  { id: "calle-larios", label: "Calle Larios", article: "Calle Marqués de Larios" },
  { id: "plaza-marina", label: "Plaza de la Marina", article: "Plaza de la Marina" },
  { id: "catedral", label: "Catedral de Málaga", article: "Catedral de Málaga" },
  { id: "ayuntamiento", label: "Ayuntamiento de Málaga", article: "Ayuntamiento de Málaga" },
  { id: "atarazanas", label: "Mercado de Atarazanas", article: "Mercado de Atarazanas" },
  { id: "teatro-romano", label: "Teatro romano de Málaga", article: "Teatro romano de Málaga" },
  { id: "alcazaba", label: "Alcazaba de Málaga", article: "Alcazaba de Málaga" },
  { id: "gibralfaro", label: "Castillo de Gibralfaro", article: "Castillo de Gibralfaro" },
  { id: "plaza-merced", label: "Plaza de la Merced", article: "Plaza de la Merced (Málaga)" },
];

const WIKI_API = "https://es.wikipedia.org/w/api.php";

/**
 * Coordenadas exactas de una lista de artículos. Se pide el `pageid` y el título
 * resuelto (tras redirecciones) para que la trazabilidad sea completa: se puede
 * abrir el artículo y ver la misma coordenada.
 */
async function wikipediaCoordinates(titles) {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "coordinates",
    format: "json",
    origin: "*",
    redirects: "1",
  });
  const payload = await fetchJson(`${WIKI_API}?${params.toString()}`, { timeoutMs: 60_000 });

  // Con `redirects=1` la respuesta trae, además de las páginas finales, las
  // páginas de redirección sin coordenada. Se indexan por título resuelto.
  const forward = new Map();
  for (const redirect of payload?.query?.redirects ?? []) {
    forward.set(redirect.from, redirect.to);
  }

  const byTitle = new Map();
  for (const page of Object.values(payload?.query?.pages ?? {})) {
    const coordinate = page.coordinates?.[0];
    byTitle.set(page.title, {
      pageId: page.pageid ?? null,
      title: page.title,
      coordinates:
        coordinate && typeof coordinate.lat === "number"
          ? [coordinate.lon, coordinate.lat]
          : null,
    });
  }

  const resolved = new Map();
  for (const title of titles) {
    const target = forward.get(title) ?? title;
    resolved.set(title, byTitle.get(target) ?? null);
  }
  return resolved;
}

/**
 * Rejilla de centros para la búsqueda por área. El radio de cada consulta es
 * menor que el hueco entre centros para que no queden zonas sin cubrir, y así la
 * truncación de `gslimit` afecta a menos artículos por consulta.
 */
function searchCenters(bounds, radiusMeters = 500) {
  const stepMeters = radiusMeters * 1.2;
  const latStep = stepMeters / 111_100;
  const lonStep = stepMeters / (89_300 * Math.cos((((bounds.south + bounds.north) / 2) * Math.PI) / 180));
  const centers = [];
  for (let lat = bounds.south - latStep; lat <= bounds.north + latStep; lat += latStep) {
    for (let lon = bounds.west - lonStep; lon <= bounds.east + lonStep; lon += lonStep) {
      centers.push([lon, lat]);
    }
  }
  return centers;
}

async function wikipediaGeoSearchGrid(bounds, radiusMeters = 500) {
  const centers = searchCenters(bounds, radiusMeters);
  const found = new Map();
  let truncatedQueries = 0;

  for (const center of centers) {
    const params = new URLSearchParams({
      action: "query",
      list: "geosearch",
      gscoord: `${center[1]}|${center[0]}`,
      gsradius: String(radiusMeters),
      gslimit: "100",
      format: "json",
      origin: "*",
    });
    const payload = await fetchJson(`${WIKI_API}?${params.toString()}`, { timeoutMs: 60_000 });
    const rows = payload?.query?.geosearch ?? [];
    if (rows.length >= 100) truncatedQueries += 1;
    for (const row of rows) {
      if (typeof row.lat !== "number" || typeof row.lon !== "number") continue;
      found.set(row.pageid, { title: row.title, coordinates: [row.lon, row.lat] });
    }
  }

  return { found, queriedCenters: centers.length, radiusMeters, truncatedQueries };
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

function nearestVertex(point, rings) {
  let best = { distance: Number.POSITIVE_INFINITY, feature: null };
  for (const entry of rings) {
    for (const vertex of entry.ring) {
      const distance = distanceMeters(point, vertex);
      if (distance < best.distance) best = { distance, feature: entry };
    }
  }
  return best;
}

export async function run() {
  const city = await loadCity();
  step(`05 · Verificación geográfica — ${city.name}`);

  const buildings = JSON.parse(
    await readFile(join(BUILD_DIR, `${city.slug}.buildings.geojson`), "utf8"),
  ).features;
  const streets = JSON.parse(
    await readFile(join(BUILD_DIR, `${city.slug}.streets.geojson`), "utf8"),
  ).features;
  const quality = JSON.parse(
    await readFile(join(BUILD_DIR, `${city.slug}.quality.json`), "utf8"),
  );

  const rings = buildings.map((feature) => ({
    ring: feature.geometry.coordinates[0],
    properties: feature.properties,
  }));

  // ------------------------------------------------- 1. coordenadas exactas
  log("Pidiendo coordenadas exactas de los puntos de control a Wikipedia (es)...");
  const coordinates = await wikipediaCoordinates(CONTROL_POINTS.map((point) => point.article));
  const missing = [...coordinates.entries()].filter(([, value]) => !value?.coordinates);
  for (const [title] of missing) {
    warn(`El artículo «${title}» no devolvió coordenada. Se declara, no se inventa.`);
  }

  // --------------------------------------------- 2. contraste por área
  log("Contrastando con la búsqueda por área (rejilla de centros)…");
  const geosearch = await wikipediaGeoSearchGrid(city.bounds, 500);
  log(
    `Búsqueda por área: ${geosearch.queriedCenters} consultas de ${geosearch.radiusMeters} m, ${geosearch.found.size} artículos únicos, ${geosearch.truncatedQueries} consulta(s) truncada(s) por el límite de 100.`,
  );

  const results = [];
  for (const control of CONTROL_POINTS) {
    const wiki = coordinates.get(control.article);
    if (!wiki?.coordinates) {
      results.push({
        ...control,
        status: "sin_coordenada_independiente",
        reason: `El artículo «${control.article}» existe pero no publica coordenadas.`,
      });
      continue;
    }

    const point = wiki.coordinates;
    const insideBounds =
      point[0] >= city.bounds.west &&
      point[0] <= city.bounds.east &&
      point[1] >= city.bounds.south &&
      point[1] <= city.bounds.north;

    const nearestBuilding = nearestVertex(point, rings);
    const insideBuilding = rings.find((entry) => pointInRing(point, entry.ring)) ?? null;

    let nearestStreet = { distance: Number.POSITIVE_INFINITY, name: "" };
    for (const street of streets) {
      const coordinatesOfStreet =
        street.geometry.type === "LineString"
          ? street.geometry.coordinates
          : street.geometry.coordinates.flat();
      for (const vertex of coordinatesOfStreet) {
        const distance = distanceMeters(point, vertex);
        if (distance < nearestStreet.distance) {
          nearestStreet = { distance, name: street.properties.name || "" };
        }
      }
    }

    const inGeosearch = [...geosearch.found.values()].some(
      (entry) => entry.title === wiki.title && distanceMeters(entry.coordinates, point) < 25,
    );

    results.push({
      ...control,
      status: "verificado",
      source: `Wikipedia (es): «${wiki.title}»`,
      article: wiki.title,
      pageId: wiki.pageId,
      coordinates: point,
      insideBounds,
      inGeosearch,
      distanceToNearestBuildingVertexM: Number(nearestBuilding.distance.toFixed(1)),
      insideMappedBuilding: Boolean(insideBuilding),
      insideBuildingName: insideBuilding?.properties.name || null,
      nearestBuildingOsmId: insideBuilding?.properties.osm_id ?? null,
      distanceToNearestStreetVertexM: Number(nearestStreet.distance.toFixed(1)),
      nearestStreetName: nearestStreet.name,
    });

    log(
      `«${control.label}» → ${point[0].toFixed(6)}, ${point[1].toFixed(6)} · edificio a ${nearestBuilding.distance.toFixed(1)} m (${insideBuilding ? "dentro de la huella" : "fuera"}) · calle más cercana a ${nearestStreet.distance.toFixed(1)} m${nearestStreet.name ? ` (${nearestStreet.name})` : ""}`,
    );
  }

  const verified = results.filter((row) => row.status === "verificado");
  const withinBounds = verified.filter((row) => row.insideBounds);
  const closeToGeometry = verified.filter((row) => row.distanceToNearestBuildingVertexM <= 40);
  const inGeosearch = verified.filter((row) => row.inGeosearch);

  // ---------------------------------------------------- evidencia gráfica
  const overlay = renderOverlaySvg(city, rings, verified);
  await mkdir(BUILD_DIR, { recursive: true });
  await writeFile(join(BUILD_DIR, `${city.slug}.verification-overlay.svg`), overlay);

  const report = {
    city: city.slug,
    generatedAt: new Date().toISOString().slice(0, 10),
    method:
      "Consistencia posicional contra coordenadas de una fuente independiente (Wikipedia en español), no medición sobre el terreno.",
    independentSource: "es.wikipedia.org — action=query&prop=coordinates (título exacto) y list=geosearch (contraste por área)",
    totalControlPoints: CONTROL_POINTS.length,
    verifiedPoints: verified.length,
    pointsInsideCoverage: withinBounds.length,
    pointsWithin40mOfPublishedGeometry: closeToGeometry.length,
    pointsConfirmedByAreaSearch: inGeosearch.length,
    areaSearch: {
      centersQueried: geosearch.queriedCenters,
      radiusMeters: geosearch.radiusMeters,
      uniqueArticles: geosearch.found.size,
      truncatedQueries: geosearch.truncatedQueries,
    },
    controlPoints: results,
    heightCrossCheck: {
      method:
        "Contraste entre dos fuentes independientes: plantas derivadas de la superficie construida oficial del Catastro frente a la etiqueta building:levels de OpenStreetMap. No es una medición sobre el terreno.",
      comparableBuildings: quality.crossCheck?.buildingsComparable ?? 0,
      agreementWithinOneFloorShare: quality.crossCheck?.agreementShare ?? 0,
      meanAbsoluteFloorDelta: quality.crossCheck?.meanAbsoluteFloorDelta ?? null,
      samples: quality.crossCheck?.samples ?? [],
    },
    qualitySummary: {
      buildings: quality.buildings.total,
      heightSources: quality.buildings.byHeightSource,
      realHeightShare: quality.buildings.realHeightShare,
      catastroDeclaredFloorsAvailable: quality.buildings.catastroDeclaredFloorsAvailable,
      catastroGrossFloorAreaAvailable: quality.buildings.catastroGrossFloorAreaAvailable,
      relationsNotAssembled: quality.relationsNotAssembled,
      discardedTooSmall: quality.buildings.discardedTooSmall,
    },
    overlayFile: `${city.slug}.verification-overlay.svg`,
  };

  await writeFile(join(BUILD_DIR, `${city.slug}.verification.json`), JSON.stringify(report, null, 2));

  log(
    `Puntos verificados: ${verified.length}/${CONTROL_POINTS.length} · dentro de la cobertura: ${withinBounds.length} · a menos de 40 m de la geometría publicada: ${closeToGeometry.length} · confirmados por la búsqueda por área: ${inGeosearch.length}`,
  );
  log(`Evidencia gráfica: ${report.overlayFile}`);
  return report;
}

/**
 * Vista SVG superpuesta: huellas publicadas + puntos de control independientes.
 * Es la evidencia visual de la verificación, generada desde los datos reales.
 */
function renderOverlaySvg(city, rings, points) {
  const width = 1000;
  const lonSpan = city.bounds.east - city.bounds.west;
  const latSpan = city.bounds.north - city.bounds.south;
  // Se corrige la relación de aspecto por la latitud para que el dibujo no
  // salga estirado: a 36,7° un grado de longitud es ~0,8 de uno de latitud.
  const latCorrection = Math.cos((city.center[1] * Math.PI) / 180);
  const height = Math.round((width * latSpan) / (lonSpan * latCorrection));

  const project = ([lon, lat]) => [
    ((lon - city.bounds.west) / lonSpan) * width,
    height - ((lat - city.bounds.south) / latSpan) * height,
  ];

  const paths = rings
    .map((entry) => {
      const points2d = entry.ring.map((point) => project(point).map((n) => n.toFixed(1)).join(","));
      return `<polygon points="${points2d.join(" ")}" fill="#e6ddcd" stroke="#c2b6a0" stroke-width="0.4"/>`;
    })
    .join("\n");

  const markers = points
    .map((row) => {
      const [x, y] = project(row.coordinates);
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#b4522a" stroke="#fbfaf8" stroke-width="1.5"/>
      <text x="${(x + 8).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" font-family="sans-serif" font-size="11" fill="#15171c">${escapeXml(row.label)} (${row.distanceToNearestBuildingVertexM} m)</text></g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#efebe2"/>
  ${paths}
  ${markers}
  <text x="10" y="20" font-family="sans-serif" font-size="12" fill="#5c6068">Puntos de control de Wikipedia sobre las huellas publicadas · ${city.name} · ${city.bounds.west},${city.bounds.south} → ${city.bounds.east},${city.bounds.north}</text>
</svg>
`;
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (character) => {
    const map = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" };
    return map[character];
  });
}
