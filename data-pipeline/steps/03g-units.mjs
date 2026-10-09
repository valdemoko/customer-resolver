import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, REPO_DIR, loadCity } from "../lib/city.mjs";
import { log, step } from "../lib/log.mjs";

/**
 * FASE C · Catálogo de unidades comprables.
 *
 * La API de compra solo acepta identificadores que EXISTEN en el paquete de datos:
 * edificios (`b:`), locales (`p:`) y tramos de muralla (`w:`). Este paso los
 * recoge de las capas ya generadas y escribe `src/data/market/units-<ciudad>.json`
 * (lo importa el servidor). Los carteles de avioneta, los paneles de crucero y las
 * velas son unidades fijas que declara la configuración de la ciudad.
 */
export async function run() {
  const city = await loadCity();
  step(`03g · Unidades comprables — ${city.name}`);
  const read = async (name) => JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.${name}.geojson`), "utf8")).features;
  const buildings = (await read("buildings")).map((f) => f.properties.osm_id).filter(Boolean);
  const parcels = (await read("parcels")).map((f) => f.properties.id);
  const walls = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.wall-units.json`), "utf8"));
  // Nombres públicos de edificios (OSM `name`), para rotular rankings y listados
  // sin tener que cargar teselas en el servidor. Solo los que tienen nombre.
  const names = {};
  for (const feature of await read("buildings")) {
    const { osm_id: id, name } = feature.properties;
    if (id && name && !names[id]) names[id] = String(name).slice(0, 80);
  }
  const out = {
    city: city.slug,
    generatedAt: new Date().toISOString().slice(0, 10),
    buildings: [...new Set(buildings)].sort(),
    parcels: [...new Set(parcels)].sort(),
    walls: [...new Set(walls)].sort(),
    names,
  };
  const dir = join(REPO_DIR, "src", "data", "market");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `units-${city.slug}.json`), JSON.stringify(out));
  log(`Unidades: ${out.buildings.length} edificios · ${out.parcels.length} locales · ${out.walls.length} tramos de muralla · ${Object.keys(names).length} con nombre`);
  return out;
}
