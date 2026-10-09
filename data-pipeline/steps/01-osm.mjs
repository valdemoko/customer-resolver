import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fetchText, isoDate } from "../lib/http.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { RAW_DIR, loadCity } from "../lib/city.mjs";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/**
 * Consulta Overpass para el rectángulo de la ciudad.
 *
 * Se usa Overpass y no el extracto completo de Andalucía (250 MB) porque el
 * área de interés es de 2,1 × 1,6 km. `out geom` devuelve la geometría de cada
 * way en línea, así que no hace falta resolver nodos ni ensamblar anillos.
 *
 * Limitación declarada: las relaciones (multipolígonos) se solicitan pero no se
 * ensamblan. Se cuentan y se informa de cuántas quedan fuera.
 */
function buildQuery(bounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  // FASE B.4: la consulta cubre el CÍRCULO de la escena más la banda de
  // difuminado más un margen (ver `bounds` en malaga.geo.json) e incorpora lo que
  // hace falta para el agua real (costa, muelles, espigones, dársenas), los
  // locales (tiendas, hostelería, oficinas, artesanía) y la Alcazaba (murallas,
  // torres, recinto histórico).
  return `[out:json][timeout:300];
(
  way["building"](${bbox});
  way["building:part"](${bbox});
  relation["building"](${bbox});
  way["highway"](${bbox});
  way["area:highway"](${bbox});
  way["railway"](${bbox});
  way["waterway"](${bbox});
  way["natural"](${bbox});
  relation["natural"](${bbox});
  relation["water"](${bbox});
  way["landuse"](${bbox});
  relation["landuse"](${bbox});
  way["leisure"](${bbox});
  relation["leisure"](${bbox});
  way["barrier"~"^(city_wall|wall|retaining_wall)$"](${bbox});
  way["historic"](${bbox});
  relation["historic"](${bbox});
  way["man_made"](${bbox});
  way["harbour"](${bbox});
  way["seamark:type"](${bbox});
  way["place"](${bbox});
  relation["place"="square"](${bbox});
  node["place"](${bbox});
  node["man_made"~"^(tower|lighthouse|pier|mooring)$"](${bbox});
  node["amenity"](${bbox});
  way["amenity"](${bbox});
  relation["amenity"](${bbox});
  node["shop"](${bbox});
  way["shop"](${bbox});
  node["craft"](${bbox});
  way["craft"](${bbox});
  node["office"](${bbox});
  way["office"](${bbox});
  node["tourism"](${bbox});
  way["tourism"](${bbox});
  relation["tourism"](${bbox});
  node["historic"](${bbox});
);
out geom;`;
}

export async function run() {
  const city = await loadCity();
  step(`01 · OpenStreetMap — ${city.name}`);

  const query = buildQuery(city.bounds);
  await mkdir(RAW_DIR, { recursive: true });

  let payload = null;
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      log(`Consultando ${endpoint} …`);
      const { text } = await fetchText(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
        timeoutMs: 300_000,
      });
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.elements)) {
        throw new Error("Respuesta sin array `elements`");
      }
      payload = { endpoint, parsed };
      break;
    } catch (error) {
      warn(`${endpoint} falló: ${error.message.slice(0, 160)}`);
      errors.push(`${endpoint}: ${error.message.slice(0, 160)}`);
    }
  }

  if (!payload) {
    throw new Error(`Ningún servidor Overpass respondió.\n${errors.join("\n")}`);
  }

  const { parsed, endpoint } = payload;
  const elements = parsed.elements;
  const byType = elements.reduce((accumulator, element) => {
    const key = `${element.type}/${element.tags?.building ? "building" : element.tags?.highway ? "highway" : element.tags?.landuse ? "landuse" : element.tags?.natural ?? element.tags?.leisure ?? "other"}`;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const relations = elements.filter((element) => element.type === "relation");
  const ways = elements.filter((element) => element.type === "way");
  const nodes = elements.filter((element) => element.type === "node");

  const record = {
    city: city.slug,
    source: "OpenStreetMap",
    sourceId: "osm",
    endpoint,
    extractedAt: isoDate(),
    query,
    bbox: city.bounds,
    counts: { elements: elements.length, ways: ways.length, nodes: nodes.length, relations: relations.length },
    countsByTag: byType,
    generator: parsed.generator ?? null,
    elements,
  };

  const out = join(RAW_DIR, `${city.slug}.osm.json`);
  await writeFile(out, JSON.stringify(record));
  log(`Guardado ${out}`);
  log(
    `Elementos: ${elements.length} (ways ${ways.length}, nodes ${nodes.length}, relations ${relations.length})`,
  );
  if (relations.length > 0) {
    warn(
      `${relations.length} relaciones (multipolígonos) NO se han ensamblado. Quedan fuera del paquete y se declaran en el informe.`,
    );
  }
  return record;
}
