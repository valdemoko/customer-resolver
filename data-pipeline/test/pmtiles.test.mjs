import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  PMTiles,
  readVarint as officialReadVarint,
  tileIdToZxy,
  zxyToTileId as officialZxyToTileId,
} from "pmtiles";
import { readTileLayers } from "../lib/mvt-read.mjs";
import { LocalFileSource } from "../lib/pmtiles-source.mjs";
import { writePmtiles, zxyToTileId as writerZxyToTileId } from "../lib/pmtiles-writer.mjs";

/**
 * Verificación del PAQUETE PUBLICADO y del ESCRITOR, con el lector OFICIAL.
 *
 * POR QUÉ ESTE ARCHIVO. El escritor de PMTiles es propio (`lib/pmtiles-writer.mjs`)
 * porque la versión pública del paquete `pmtiles` trae lector pero no escritor y
 * este entorno no tiene Java ni Docker para Planetiler/Tippecanoe. Un escritor
 * propio sin verificación independiente es una promesa, no un dato: el archivo
 * puede escribirse entero y no poderse leer.
 *
 * Comprobado con este test (y antes con el paso 04) que la comprobación previa
 * mentía en dos puntos:
 *
 *  1. Leía `header.addressedTilesCount`, campo que NO existe en el lector
 *     oficial (el real es `numAddressedTiles`). El `undefined` resultante hacía
 *     fallar la verificación de un paquete correcto.
 *  2. Volvía a descomprimir la tesela que `getZxy` ya devuelve descomprimida.
 *
 * Lo que aquí se comprueba, y con qué:
 *
 *  · El ARCHIVO PUBLICADO (`public/tiles/<slug>/<slug>-<versión>.pmtiles`) se
 *    enumera leyendo su propio directorio raíz, decodificado con el
 *    `readVarint` OFICIAL. Después, para CADA tesela direccionada:
 *      - su `tileId` vuelve a z/x/y con `tileIdToZxy` oficial y se re-codifica:
 *        tiene que dar exactamente el mismo identificador (numeración canónica);
 *      - el mismo z/x/y se re-codifica con MI `zxyToTileId`: tiene que coincidir
 *        con el oficial (mi escritor numera como el estándar);
 *      - `getZxy` del lector oficial tiene que devolver datos, y esos datos
 *        tienen que ser idénticos a los bytes que hay en el archivo en el
 *        desplazamiento que declara el directorio (esto valida offset/length);
 *      - el contenido tiene que ser un MVT decodificable con al menos una capa
 *        y al menos un elemento.
 *  · Una tesela ausente dentro del área no puede devolver datos de una vecina.
 *  · Los metadatos se leen y contienen la atribución obligatoria.
 *  · El ESCRITOR, en un archivo temporal, se comprueba de ida y vuelta con
 *    identificadores por encima de 2^31 (zoom 16), que es donde la aritmética
 *    32 bits de JavaScript se rompía en silencio.
 */
 
const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = join(HERE, "..");
const REPO_DIR = join(PIPELINE_DIR, "..");
const TILES_ROOT = join(REPO_DIR, "public", "tiles");

/** Localiza el paquete publicado de la única ciudad del catálogo. */
async function findPublishedPackage() {
  let slugs;
  try {
    slugs = await readdir(TILES_ROOT, { withFileTypes: true });
  } catch {
    throw new Error(
      `No existe ${TILES_ROOT}. Este test comprueba el paquete REALMENTE publicado: ejecuta antes \`node run.mjs tiles\`.`,
    );
  }
  for (const entry of slugs) {
    if (!entry.isDirectory()) continue;
    const dir = join(TILES_ROOT, entry.name);
    const files = (await readdir(dir)).filter((name) => name.endsWith(".pmtiles"));
    if (files.length > 0) {
      files.sort(); // determinista si hubiera varias versiones
      return { slug: entry.name, path: join(dir, files[files.length - 1]), file: files[files.length - 1] };
    }
  }
  throw new Error(
    `No hay ningún .pmtiles en ${TILES_ROOT}. Ejecuta \`node run.mjs tiles\` antes de este test.`,
  );
}

/**
 * Decodifica un directorio (raíz u hoja) EXACTAMENTE como lo hace el lector
 * oficial. La decodificación de enteros se delega en el `readVarint` oficial;
 * aquí solo se fija el orden de las cinco secciones que exige la especificación
 * (recuento, deltas de tileId, runLength, length, offset).
 */
function decodeDirectory(bytes) {
  const buf = new Uint8Array(bytes);
  const position = { buf, pos: 0 };
  const count = officialReadVarint(position);
  const entries = [];
  let lastTileId = 0;
  for (let index = 0; index < count; index += 1) {
    const delta = officialReadVarint(position);
    entries.push({ tileId: lastTileId + delta, offset: 0, length: 0, runLength: 1 });
    lastTileId += delta;
  }
  for (let index = 0; index < count; index += 1) entries[index].runLength = officialReadVarint(position);
  for (let index = 0; index < count; index += 1) entries[index].length = officialReadVarint(position);
  for (let index = 0; index < count; index += 1) {
    const value = officialReadVarint(position);
    entries[index].offset =
      value === 0 && index > 0 ? entries[index - 1].offset + entries[index - 1].length : value - 1;
  }
  return entries;
}

/** Expande cada entrada a sus z/x/y, uno por cada tesela del runLength. */
function expandEntries(entries) {
  const tiles = [];
  for (const entry of entries) {
    for (let index = 0; index < entry.runLength; index += 1) {
      const [z, x, y] = tileIdToZxy(entry.tileId + index);
      tiles.push({ z, x, y, tileId: entry.tileId + index, offset: entry.offset, length: entry.length });
    }
  }
  return tiles;
}

test("escritor: ida y vuelta con el lector oficial en zooms con identificadores > 2^31", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pmtiles-"));
  const path = join(dir, "roundtrip.pmtiles");

  // El fallo real estaba en el varint de 32 bits: `value & 0x7f` se corrompe a
  // partir de 2^31, y los identificadores de tesela lo superan dentro del zoom
  // 16. La muestra tiene que cubrir los dos lados del límite, así que se
  // comprueba que de verdad lo cruza en vez de darlo por hecho: el centro de
  // Málaga en zoom 16 (2125791945) queda POR DEBAJO de 2^31, y solo los
  // cuadrantes extremos lo superan.
  const raw = [
    { z: 13, x: 3996, y: 3196, text: "bajo" },
    { z: 16, x: 31962, y: 25572, text: "centro-de-malaga" },
    { z: 16, x: 0, y: 65535, text: "justo-pasado-el-limite" },
    { z: 16, x: 65535, y: 65535, text: "extremo-2-32" },
  ];
  const tiles = raw.map((tile) => ({
    z: tile.z,
    x: tile.x,
    y: tile.y,
    data: new Uint8Array(gzipSync(Buffer.from(tile.text))),
  }));

  const ids = tiles.map((tile) => writerZxyToTileId(tile.z, tile.x, tile.y));
  assert.ok(
    ids.some((id) => id > 2 ** 31),
    "el caso de prueba tiene que incluir un identificador por encima de 2^31, que es donde fallaba el varint",
  );
  assert.ok(
    ids.some((id) => id <= 2 ** 31),
    "el caso de prueba tiene que incluir también un identificador por debajo de 2^31",
  );

  const { bytes, stats } = writePmtiles({
    tiles,
    metadata: { name: "ida y vuelta", attribution: "test" },
    bounds: { west: -4.44, south: 36.71, east: -4.4, north: 36.73 },
    center: { lon: -4.4228, lat: 36.7196, zoom: 16 },
    minZoom: 13,
    maxZoom: 16,
    compress: (input) => new Uint8Array(gzipSync(Buffer.from(input), { level: 9 })),
  });
  assert.equal(stats.addressedTiles, tiles.length);
  await writeFile(path, bytes);

  const archive = new PMTiles(new LocalFileSource(path));
  const header = await archive.getHeader();
  assert.equal(header.tileType, 1, "tipo MVT");
  assert.equal(header.numAddressedTiles, tiles.length);
  assert.equal(header.minZoom, 13);
  assert.equal(header.maxZoom, 16);

  for (const tile of raw) {
    const result = await archive.getZxy(tile.z, tile.x, tile.y);
    assert.ok(result, `el lector oficial debe encontrar ${tile.z}/${tile.x}/${tile.y}`);
    assert.equal(Buffer.from(result.data).toString(), tile.text);
  }
});

test("paquete publicado: existe, la cabecera cuadra y el directorio raíz cabe en la primera lectura", async () => {
  const published = await findPublishedPackage();
  const info = await stat(published.path);
  assert.ok(info.size > 0, "el paquete no puede estar vacío");

  const archive = new PMTiles(new LocalFileSource(published.path));
  const header = await archive.getHeader();

  assert.equal(header.specVersion, 3);
  assert.equal(header.tileType, 1, "vectorial MVT");
  assert.equal(header.internalCompression, 2, "directorios y metadatos en gzip");
  assert.equal(header.tileCompression, 2, "teselas en gzip");
  assert.equal(header.clustered, true, "datos agrupados por tileId");
  assert.ok(header.numAddressedTiles > 0);
  assert.ok(header.minZoom <= header.maxZoom);
  assert.ok(header.minLon < header.maxLon && header.minLat < header.maxLat);
  // El lector solo pide 16384 bytes al abrir: si la raíz no cupiera ahí, nunca
  // se leería ninguna tesela.
  assert.ok(
    header.rootDirectoryOffset + header.rootDirectoryLength <= 16384,
    "el directorio raíz tiene que caber en los primeros 16384 bytes",
  );
  assert.equal(
    header.tileDataOffset + header.tileDataLength,
    info.size,
    "la cabecera tiene que explicar el archivo entero: sin bytes sin contabilizar",
  );
});

test("paquete publicado: TODOS los TileID son los del lector oficial y cada tesela se relee entera", async () => {
  const published = await findPublishedPackage();
  const fileBytes = await readFile(published.path);
  const archive = new PMTiles(new LocalFileSource(published.path));
  const header = await archive.getHeader();

  const directoryBytes = fileBytes.subarray(
    header.rootDirectoryOffset,
    header.rootDirectoryOffset + header.rootDirectoryLength,
  );
  const entries = decodeDirectory(gunzipSync(directoryBytes));
  const tiles = expandEntries(entries);

  assert.equal(
    tiles.length,
    header.numAddressedTiles,
    "el directorio direcciona exactamente las teselas que declara la cabecera",
  );

  // Capas de la B.4: el suelo viaja en `land` y `surface` (clases disjuntas), el
  // agua en `water`, y hay capas de fortalezas, atraques, pantalanes y parcelas.
  const expectedLayers = new Set([
    "buildings",
    "streets",
    "trees",
    "land",
    "water",
    "surface",
    "fortress",
    "berths",
    "moorings",
    "parcels",
  ]);

  // El directorio tiene que contabilizar TODO el tramo de datos de teselas:
  // sumando las longitudes de los contenidos únicos (cada `offset` una vez) se
  // tiene que llegar al `tileDataLength` de la cabecera. Sin esto, un
  // `length` mal escrito pasaría desapercibido mientras la descompresión no se
  // queje.
  const uniqueContents = new Map();
  for (const tile of tiles) {
    if (!uniqueContents.has(tile.offset)) uniqueContents.set(tile.offset, tile.length);
  }
  const accountedBytes = [...uniqueContents.values()].reduce((sum, length) => sum + length, 0);
  assert.equal(
    accountedBytes,
    header.tileDataLength,
    "la suma de las longitudes del directorio tiene que cubrir todo el tramo de datos",
  );

  let decodedFeatures = 0;
  for (const tile of tiles) {
    // 1. Numeración canónica: ida y vuelta con el lector oficial.
    const [z, x, y] = tileIdToZxy(tile.tileId);
    assert.deepEqual([z, x, y], [tile.z, tile.x, tile.y]);
    assert.equal(
      officialZxyToTileId(z, x, y),
      tile.tileId,
      `el tileId almacenado (${tile.tileId}) no es el de Hilbert oficial para ${z}/${x}/${y}`,
    );
    // 2. Mi escritor numera igual que el estándar.
    assert.equal(
      writerZxyToTileId(z, x, y),
      tile.tileId,
      `zxyToTileId propio discrepó del oficial en ${z}/${x}/${y}`,
    );

    // 3. El lector oficial relee la tesela desde el archivo.
    const result = await archive.getZxy(z, x, y);
    assert.ok(result, `el lector oficial no devuelve la tesela ${z}/${x}/${y}, que está direccionada`);
    const extracted = Buffer.from(result.data);

    // 4. Los bytes extraídos coinciden con el tramo que declara el directorio,
    //    descomprimido. Valida offset y length, no solo que "hay algo". Ojo:
    //    `entry.length` es la longitud COMPRIMIDA en disco y `result.data` ya
    //    viene descomprimido, así que comparar ambas longitudes sería comparar
    //    cosas distintas.
    const fromFile = gunzipSync(fileBytes.subarray(header.tileDataOffset + tile.offset, header.tileDataOffset + tile.offset + tile.length));
    assert.ok(fromFile.equals(extracted), `los bytes de ${z}/${x}/${y} no coinciden con los del archivo`);

    // 5. Es un MVT decodificable con contenido real.
    const layers = readTileLayers(new Uint8Array(extracted));
    assert.ok(layers.length > 0, `la tesela ${z}/${x}/${y} no tiene capas`);
    let features = 0;
    for (const layer of layers) {
      assert.ok(expectedLayers.has(layer.name), `capa desconocida «${layer.name}» en ${z}/${x}/${y}`);
      assert.ok(layer.featureCount > 0, `la capa «${layer.name}» de ${z}/${x}/${y} está vacía`);
      features += layer.featureCount;
    }
    decodedFeatures += features;
  }

  assert.ok(decodedFeatures > 0, "no se decodificó ningún elemento");
  assert.ok(
    tiles.some((tile) => tile.z === header.maxZoom),
    "debe haber teselas en el zoom máximo",
  );
});

test("paquete publicado: una tesela ausente dentro del área no devuelve datos", async () => {
  const published = await findPublishedPackage();
  const fileBytes = await readFile(published.path);
  const archive = new PMTiles(new LocalFileSource(published.path));
  const header = await archive.getHeader();

  const entries = decodeDirectory(
    gunzipSync(
      fileBytes.subarray(header.rootDirectoryOffset, header.rootDirectoryOffset + header.rootDirectoryLength),
    ),
  );
  const present = new Set(expandEntries(entries).map((tile) => `${tile.z}/${tile.x}/${tile.y}`));

  const z = header.maxZoom;
  const x = Math.floor(((header.centerLon + 180) / 360) * 2 ** z);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((header.centerLat * Math.PI) / 180) + 1 / Math.cos((header.centerLat * Math.PI) / 180)) / Math.PI) / 2) *
      2 ** z,
  );

  let absent = null;
  // B.4: la zona es un círculo grande y casi todo el cuadrado central tiene
  // datos, así que se busca más lejos (hasta ±14 teselas) hasta dar con un hueco
  // (el mar abierto o las esquinas del cuadrado que rodea al círculo).
  for (let dx = -14; dx <= 14 && absent === null; dx += 1) {
    for (let dy = -14; dy <= 14 && absent === null; dy += 1) {
      const key = `${z}/${x + dx}/${y + dy}`;
      if (!present.has(key)) absent = { z, x: x + dx, y: y + dy, key };
    }
  }
  assert.ok(absent, "no se encontró ninguna tesela ausente cerca del centro para la comprobación");

  const result = await archive.getZxy(absent.z, absent.x, absent.y);
  assert.ok(
    !result || !result.data || result.data.byteLength === 0,
    `${absent.key} no está en el paquete pero el lector devolvió datos: el directorio apunta mal`,
  );
});

test("paquete publicado: los metadatos llevan la atribución obligatoria", async () => {
  const published = await findPublishedPackage();
  const archive = new PMTiles(new LocalFileSource(published.path));
  const metadata = await archive.getMetadata();

  assert.ok(metadata, "el lector oficial debe obtener los metadatos");
  assert.ok(typeof metadata.name === "string" && metadata.name.length > 0);
  assert.match(String(metadata.attribution), /OpenStreetMap/);
  assert.match(String(metadata.attribution), /Catastro/);
  assert.match(String(metadata.version), /^\d{4}\.\d{2}\.\d+$/);
});
