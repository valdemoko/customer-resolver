/**
 * Inspecciona el paquete PMTiles publicado leyendo teselas reales con el lector
 * y el decodificador oficiales.
 *
 * POR QUÉ EXISTE: el visor de la isla construye su geometría decodificando estas
 * mismas teselas. Antes de escribir código contra ellas hace falta saber qué hay
 * de verdad dentro: qué capas, con qué extensión, qué tipos de geometría y qué
 * propiedades lleva cada elemento. Suponerlo es cómo se acaba pintando un mar
 * con la capa equivocada.
 *
 * Uso:  node tools/inspect-tiles.mjs [zoom] [ciudad]
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { LocalFileSource } from "../data-pipeline/lib/pmtiles-source.mjs";

const zoom = process.argv[2] === "--scan" ? 17 : Number(process.argv[2] ?? 17);
const slug = (process.argv[2] === "--scan" ? process.argv[3] : process.argv[3]) ?? "malaga";

const dir = join(process.cwd(), "public", "tiles", slug);
const file = (await readdir(dir)).find((name) => name.endsWith(".pmtiles"));
if (!file) throw new Error(`No hay paquete PMTiles en ${dir}`);

const archive = new PMTiles(new LocalFileSource(join(dir, file)));
const header = await archive.getHeader();

const toTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const toTileY = (lat, z) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

/**
 * Modo barrido: recorre TODAS las teselas del paquete y dice qué capas
 * aparecen en cada zoom y, para el agua, dónde. Sirve para saber si una capa
 * que falta en el centro del mapa existe en algún sitio o no existe en absoluto.
 */
if (process.argv[2] === "--scan") {
  const byZoom = new Map();
  for (let z = header.minZoom; z <= header.maxZoom; z += 1) {
    const count = 2 ** z;
    const perLayer = new Map();
    const waterBox = { west: 180, south: 90, east: -180, north: -90 };
    // Solo las teselas que tocan el rectángulo del paquete: iterar 2^17 × 2^17
    // posiciones sería absurdo y no aportaría nada.
    const x0 = Math.floor(toTileX(header.minLon, z));
    const x1 = Math.floor(toTileX(header.maxLon, z));
    const y0 = Math.floor(toTileY(header.maxLat, z));
    const y1 = Math.floor(toTileY(header.minLat, z));
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const tile = await archive.getZxy(z, x, y);
        if (!tile) continue;
        const vector = new VectorTile(new PbfReader(new Uint8Array(tile.data)));
        for (const [name, layer] of Object.entries(vector.layers)) {
          if (layer.length === 0) continue;
          perLayer.set(name, (perLayer.get(name) ?? 0) + 1);
          if (name !== "water") continue;
          const west = (x / count) * 360 - 180;
          const north = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / count))) * (180 / Math.PI);
          waterBox.west = Math.min(waterBox.west, west);
          waterBox.north = Math.max(waterBox.north, north);
          waterBox.east = Math.max(waterBox.east, ((x + 1) / count) * 360 - 180);
          waterBox.south = Math.min(waterBox.south, Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / count))) * (180 / Math.PI));
        }
      }
    }
    byZoom.set(z, { perLayer, waterBox });
  }
  for (const [z, { perLayer, waterBox }] of byZoom) {
    const summary = [...perLayer.entries()].map(([name, n]) => `${name}×${n}`).join(" ");
    console.log(`z${z}: ${summary}`);
    if (perLayer.has("water")) {
      console.log(
        `      agua en lon ${waterBox.west.toFixed(4)}..${waterBox.east.toFixed(4)} · lat ${waterBox.south.toFixed(4)}..${waterBox.north.toFixed(4)}`,
      );
    }
  }
  process.exit(0);
}
console.log(`Paquete: ${file}`);
console.log(
  `Cabecera: z${header.minZoom}-${header.maxZoom} · teselas ${header.numAddressedTiles} · centro ${header.centerLon.toFixed(5)}, ${header.centerLat.toFixed(5)}`,
);

const lon = Number(process.argv[4] ?? header.centerLon);
const lat = Number(process.argv[5] ?? header.centerLat);
const x = Math.floor(toTileX(lon, zoom));
const y = Math.floor(toTileY(lat, zoom));
const tile = await archive.getZxy(zoom, x, y);
if (!tile) throw new Error(`La tesela central ${zoom}/${x}/${y} no existe en el paquete`);

console.log(`Tesela inspeccionada: ${zoom}/${x}/${y} (${lon.toFixed(5)}, ${lat.toFixed(5)}) · ${tile.data.byteLength} B comprimida (ya descomprimida por el lector)`);
const vector = new VectorTile(new PbfReader(new Uint8Array(tile.data)));

for (const [name, layer] of Object.entries(vector.layers)) {
  if (layer.length === 0) continue;
  const kinds = new Map();
  const props = new Set();
  let rings = 0;
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    kinds.set(feature.type, (kinds.get(feature.type) ?? 0) + 1);
    for (const key of Object.keys(feature.properties)) props.add(key);
    rings += feature.loadGeometry().length;
  }
  const first = layer.feature(0);
  console.log(
    `\n${name}: ${layer.length} elementos · extent ${layer.extent} · tipos ${[...kinds].map(([t, n]) => `${["", "punto", "línea", "polígono"][t]}×${n}`).join(" ")} · anillos ${rings}`,
  );
  console.log(`  propiedades: ${[...props].join(", ")}`);
  console.log(`  primero: ${JSON.stringify(first.properties)}`);
}
