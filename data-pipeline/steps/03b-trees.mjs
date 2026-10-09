import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fetchText, isoDate } from "../lib/http.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { BUILD_DIR, RAW_DIR, loadCity } from "../lib/city.mjs";

/**
 * Arbolado de OpenStreetMap: puntos `natural=tree` y líneas `natural=tree_row`.
 *
 * Es un paso APARTE del 01 a propósito: volver a extraer todo OpenStreetMap
 * cambiaría edificios y alturas que ya están verificados. Aquí solo se añade una
 * capa, `trees`, sin tocar las demás.
 *
 * Lo que OSM no mapea (parques y bulevares sin árboles individuales) NO se
 * inventa aquí: lo rellena el visor con reglas deterministas y lo declara como
 * «estimado». En el paquete solo viaja lo que alguien mapeó.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildQuery(bounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:120];
(
  node["natural"="tree"](${bbox});
  way["natural"="tree_row"](${bbox});
);
out geom;`;
}

export async function run() {
  const city = await loadCity();
  step(`03b · Arbolado (OpenStreetMap) — ${city.name}`);
  await mkdir(RAW_DIR, { recursive: true });

  const query = buildQuery(city.bounds);
  let payload = null;
  for (const endpoint of ENDPOINTS) {
    try {
      log(`Consultando ${endpoint} …`);
      const { text } = await fetchText(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
        timeoutMs: 150_000,
      });
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.elements)) throw new Error("Respuesta sin `elements`");
      payload = { endpoint, parsed };
      break;
    } catch (error) {
      warn(`${endpoint} falló: ${error.message.slice(0, 160)}`);
    }
  }
  if (!payload) throw new Error("Ningún servidor Overpass respondió para el arbolado.");

  const elements = payload.parsed.elements;
  await writeFile(
    join(RAW_DIR, `${city.slug}.trees.json`),
    JSON.stringify({
      city: city.slug,
      source: "OpenStreetMap",
      endpoint: payload.endpoint,
      extractedAt: isoDate(),
      query,
      elements,
    }),
  );

  const features = [];
  let points = 0;
  let rows = 0;
  for (const element of elements) {
    const tags = element.tags ?? {};
    if (element.type === "node" && tags.natural === "tree") {
      points += 1;
      features.push({
        type: "Feature",
        properties: {
          kind: "tree",
          genus: tags.genus ?? "",
          species: tags.species ?? "",
          leaf_type: tags.leaf_type ?? "",
          height: Number.parseFloat(tags.height ?? "") || 0,
          osm_id: `node/${element.id}`,
        },
        geometry: { type: "Point", coordinates: [element.lon, element.lat] },
      });
    } else if (element.type === "way" && tags.natural === "tree_row" && element.geometry) {
      rows += 1;
      features.push({
        type: "Feature",
        properties: {
          kind: "tree_row",
          genus: tags.genus ?? "",
          species: tags.species ?? "",
          leaf_type: tags.leaf_type ?? "",
          height: Number.parseFloat(tags.height ?? "") || 0,
          osm_id: `way/${element.id}`,
        },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((node) => [node.lon, node.lat]),
        },
      });
    }
  }

  await writeFile(
    join(BUILD_DIR, `${city.slug}.trees.geojson`),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  log(`Arbolado: ${points} árboles puntuales y ${rows} hileras de árboles (OSM, ${isoDate()}).`);
  return { points, rows };
}
