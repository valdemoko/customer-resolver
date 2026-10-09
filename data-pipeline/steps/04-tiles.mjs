import { createHash } from "node:crypto";
import { gzipSync, gunzipSync as gunzip } from "node:zlib";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { PMTiles, zxyToTileId as officialZxyToTileId } from "pmtiles";
import { BUILD_DIR, REPO_DIR, TILES_DIR, loadCity } from "../lib/city.mjs";
import { humanBytes, log, step, warn } from "../lib/log.mjs";
import { readTileLayers } from "../lib/mvt-read.mjs";
import { writePmtiles, zxyToTileId } from "../lib/pmtiles-writer.mjs";
import { LocalFileSource } from "../lib/pmtiles-source.mjs";


/**
 * Capas que se publican y su ajuste de teselado (B.4: suelo, agua, fortalezas, atraques y parcelas). La clave es el archivo que
 * escribe el paso 03 y `layer` es el nombre con el que la capa viaja dentro del
 * paquete (el que busca el estilo del visor).
 *
 * `tolerance` controla la simplificación de geometría: cuanto más bajo, más
 * fiel. Los edificios van bajos porque su silueta es lo que da la sensación de
 * ciudad; el agua y el verde admiten más simplificación porque son manchas.
 */
const LAYER_CONFIG = {
  buildings: { layer: "buildings", tolerance: 2, minZoom: 13, extent: 4096, buffer: 512, maxZoom: 17 },
  streets: { layer: "streets", tolerance: 2, minZoom: 15, extent: 4096, buffer: 32, maxZoom: 17 },
  trees: { layer: "trees", tolerance: 0, minZoom: 15, extent: 4096, buffer: 8, maxZoom: 17 },
  // B.4 · Suelo, agua y puerto. SIN simplificar y SIN margen de recorte entre
  // teselas (`buffer: 0`): son clases DISJUNTAS y deben seguir siéndolo. Con
  // simplificación, dos polígonos vecinos se simplifican por separado y dejan
  // solapes o grietas de decímetros; con margen, cada tesela se «sale» ~1 m sobre
  // la clase de al lado. Solo hacen falta en el zoom de detalle (17).
  land: { layer: "land", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  water: { layer: "water", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  surface: { layer: "surface", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  fortress: { layer: "fortress", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  berths: { layer: "berths", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  moorings: { layer: "moorings", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
  parcels: { layer: "parcels", tolerance: 0, minZoom: 17, extent: 4096, buffer: 0, maxZoom: 17 },
};

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat, z) {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** z,
  );
}

/** Rango de teselas que cubre el rectángulo, con un margen de seguridad. */
function tileRange(bounds, z, margin = 1) {
  return {
    minX: Math.max(0, lonToTileX(bounds.west, z) - margin),
    maxX: Math.min(2 ** z - 1, lonToTileX(bounds.east, z) + margin),
    minY: Math.max(0, latToTileY(bounds.north, z) - margin),
    maxY: Math.min(2 ** z - 1, latToTileY(bounds.south, z) + margin),
  };
}

async function readLayer(name) {
  const raw = await readFile(join(BUILD_DIR, `malaga.${name}.geojson`), "utf8");
  return JSON.parse(raw);
}

export async function run() {
  const city = await loadCity();
  step(`04 · Paquete PMTiles — ${city.name}`);

  const minZoom = city.zooms.min;
  const maxZoom = city.zooms.max;

  // ------------------------------------------------------- índices por capa
  const indexes = new Map();
  for (const name of Object.keys(LAYER_CONFIG)) {
    const collection = await readLayer(name);
    const config = LAYER_CONFIG[name];
    indexes.set(name, {
      config,
      // geojson-vt 5 exporta una clase: hay que instanciarla con `new`.
      index: new geojsonvt(collection, {
        maxZoom: config.maxZoom,
        indexMaxZoom: 6,
        tolerance: config.tolerance,
        extent: config.extent,
        buffer: config.buffer,
        lineMetrics: false,
        promoteId: undefined,
      }),
      featureCount: collection.features.length,
    });
    log(`Capa ${name}: ${collection.features.length} elementos`);
  }

  // ------------------------------------------------------------ teselado
  const tiles = [];
  let emptyTiles = 0;
  const layerTotals = {};
  const tileCountByZoom = {};

  for (let z = minZoom; z <= maxZoom; z += 1) {
    const range = tileRange(city.bounds, z);
    let generated = 0;
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        const layersForTile = {};
        for (const [name, entry] of indexes) {
          if (z < entry.config.minZoom) continue;
          const tile = entry.index.getTile(z, x, y);
          if (!tile || !tile.features || tile.features.length === 0) continue;
          layersForTile[entry.config.layer] = tile;
          layerTotals[name] = (layerTotals[name] ?? 0) + tile.features.length;
        }

        if (Object.keys(layersForTile).length === 0) {
          emptyTiles += 1;
          continue;
        }

        const buffer = vtpbf.fromGeojsonVt(layersForTile, { version: 2, extent: 4096 });
        const compressed = gzipSync(Buffer.from(buffer), { level: 9 });
        tiles.push({ z, x, y, data: new Uint8Array(compressed) });
        generated += 1;
      }
    }
    tileCountByZoom[z] = generated;
    log(`Zoom ${z}: ${generated} teselas con datos, ${emptyTiles} vacías descartadas`);
  }

  if (tiles.length === 0) {
    throw new Error("No se ha generado ninguna tesela: revisa las capas de entrada.");
  }

  // --------------------------------------------------------- versión y ruta
  const now = new Date();
  const dataVersion = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, "0")}.1`;
  const fileName = `${city.slug.toLowerCase()}-${dataVersion}.pmtiles`;
  const relativePath = `/tiles/${city.slug}/${fileName}`;

  const { bytes, stats } = writePmtiles({
    tiles,
    metadata: {
      name: `Alzado — ${city.name}`,
      description:
        "Reconstrucción del centro histórico a partir de OpenStreetMap (ODbL) y del conjunto INSPIRE de edificios del Catastro.",
      attribution: "© OpenStreetMap contributors | © Dirección General del Catastro",
      version: dataVersion,
      type: "overlay",
      bounds: [city.bounds.west, city.bounds.south, city.bounds.east, city.bounds.north],
      center: [city.center[0], city.center[1], Math.round(city.initialView.zoom)],
      minzoom: minZoom,
      maxzoom: maxZoom,
    },
    bounds: city.bounds,
    center: { lon: city.center[0], lat: city.center[1], zoom: city.initialView.zoom },
    minZoom,
    maxZoom,
    compress: (input) => new Uint8Array(gzipSync(Buffer.from(input), { level: 9 })),
  });

  await mkdir(join(TILES_DIR, city.slug), { recursive: true });
  const absolutePath = join(TILES_DIR, city.slug, fileName);
  await writeFile(absolutePath, bytes);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileStat = await stat(absolutePath);

  // ------------------------------------------------ verificación obligatoria
  step("Verificación del paquete con el lector oficial de PMTiles");
  const archive = new PMTiles(new LocalFileSource(absolutePath));
  const header = await archive.getHeader();

  const problems = [];
  // Los nombres de campo son los del lector OFICIAL (`Header` de pmtiles 4.5.0):
  // `numAddressedTiles`, no `addressedTilesCount`. Leer un campo que no existe
  // devuelve `undefined`, y comparar `undefined !== 148` "fallaba" siempre: la
  // verificación denunciaba un paquete correcto. Se usan los nombres reales.
  if (header.tileType !== 1) problems.push(`tileType ${header.tileType} (se esperaba 1 = MVT)`);
  if (header.minZoom !== minZoom) problems.push(`minZoom ${header.minZoom} ≠ ${minZoom}`);
  if (header.maxZoom !== maxZoom) problems.push(`maxZoom ${header.maxZoom} ≠ ${maxZoom}`);
  if (header.numAddressedTiles !== tiles.length) {
    problems.push(`numAddressedTiles ${header.numAddressedTiles} ≠ ${tiles.length}`);
  }
  if (header.tileCompression !== 2) problems.push(`compresión de tesela ${header.tileCompression} ≠ gzip`);
  if (header.internalCompression !== 2) {
    problems.push(`compresión interna ${header.internalCompression} ≠ gzip (directorios y metadatos)`);
  }
  if (!header.clustered) problems.push("la cabecera no declara los datos agrupados por tileId");
  if (header.rootDirectoryLength > 16257) {
    problems.push(`directorio raíz de ${header.rootDirectoryLength} B: excede el límite de 16257 B`);
  }
  // La aritmética de la cabecera tiene que explicar el archivo entero. Si no
  // cuadra, hay bytes sin contabilizar y la lectura por rangos mentiría.
  if (header.tileDataOffset + header.tileDataLength !== fileStat.size) {
    problems.push(
      `la cabecera no explica el archivo: datos hasta ${header.tileDataOffset + header.tileDataLength} B, archivo de ${fileStat.size} B`,
    );
  }

  // 1. Numeración de teselas. El lector busca cada tesela por su identificador
  //    de Hilbert; si el escritor numera distinto, no encuentra NINGUNA. Se
  //    compara mi implementación con la del propio lector en todas las teselas
  //    generadas, en vez de darlo por hecho.
  let idMismatches = 0;
  let firstMismatch = null;
  for (const tile of tiles) {
    const mine = zxyToTileId(tile.z, tile.x, tile.y);
    const theirs = officialZxyToTileId(tile.z, tile.x, tile.y);
    if (mine !== theirs) {
      idMismatches += 1;
      if (firstMismatch === null) {
        firstMismatch = `${tile.z}/${tile.x}/${tile.y}: ${mine} ≠ ${theirs}`;
      }
    }
  }
  if (idMismatches > 0) {
    problems.push(
      `${idMismatches} de ${tiles.length} identificadores de tesela no coinciden con el lector oficial (primero: ${firstMismatch})`,
    );
  }

  // 2. Extracción real de teselas repartidas por todo el paquete, comparando
  //    byte a byte con lo que se escribió. "Se escribió" y "se puede leer" son
  //    cosas distintas.
  const sampleStep = Math.max(1, Math.floor(tiles.length / 12));
  const sampleTiles = tiles.filter((unused, index) => index % sampleStep === 0).slice(0, 12);
  const extracted = [];
  for (const tile of sampleTiles) {
    const result = await archive.getZxy(tile.z, tile.x, tile.y);
    if (!result || !result.data || result.data.byteLength === 0) {
      problems.push(
        `el lector oficial no encuentra la tesela ${tile.z}/${tile.x}/${tile.y}, que sí está en el paquete`,
      );
      continue;
    }
    // OJO: `getZxy` del lector oficial YA descomprime la tesela (aplica
    // `tileCompression` antes de devolver). Volver a descomprimir aquí lanzaba
    // «incorrect header check» y la verificación culpaba al escritor de un
    // archivo correcto. Se compara contra el contenido descomprimido.
    const expected = gunzip(Buffer.from(tile.data));
    if (Buffer.compare(Buffer.from(result.data), expected) !== 0) {
      problems.push(`los bytes de la tesela ${tile.z}/${tile.x}/${tile.y} no coinciden con los escritos`);
      continue;
    }
    extracted.push(tile);
  }

  // 3. Una tesela que NO existe debe devolver vacío, no datos de otra: si el
  //    directorio estuviera mal ordenado, el lector devolvería la vecina.
  const absentZ = Math.min(16, maxZoom);
  const absentX = lonToTileX(city.center[0], absentZ) + 3;
  const absentY = latToTileY(city.center[1], absentZ) + 3;
  const absentIsAbsent = !tiles.some(
    (tile) => tile.z === absentZ && tile.x === absentX && tile.y === absentY,
  );
  if (absentIsAbsent) {
    const missing = await archive.getZxy(absentZ, absentX, absentY);
    if (missing && missing.data && missing.data.byteLength > 0) {
      problems.push(
        `una tesela inexistente (${absentZ}/${absentX}/${absentY}) devuelve datos: el directorio apunta mal`,
      );
    }
  }

  // 4. Metadatos: comprueba de paso que la compresión interna declarada es la
  //    que de verdad se usó.
  let metadataCheck = null;
  try {
    const metadataRead = await archive.getMetadata();
    metadataCheck = {
      name: metadataRead?.name ?? null,
      attribution: metadataRead?.attribution ?? null,
      version: metadataRead?.version ?? null,
    };
    if (!metadataRead || !metadataRead.name) {
      problems.push("el lector oficial no obtiene los metadatos del paquete");
    }
  } catch (error) {
    problems.push(`los metadatos no se pueden leer: ${error.message}`);
  }

  // Se lee una tesela del centro a un zoom alto y se comprueba que sea MVT con
  // las capas esperadas. Es la comprobación que separa "archivo escrito" de
  // "mapa válido".
  const probeZoom = Math.min(16, maxZoom);
  const probeX = lonToTileX(city.center[0], probeZoom);
  const probeY = latToTileY(city.center[1], probeZoom);
  const probe = await archive.getZxy(probeZoom, probeX, probeY);

  let probeLayers = [];
  if (!probe || !probe.data) {
    problems.push(`no se pudo leer la tesela de prueba ${probeZoom}/${probeX}/${probeY}`);
  } else {
    try {
      // `probe.data` ya viene descomprimida del lector oficial.
      probeLayers = readTileLayers(new Uint8Array(probe.data));
    } catch (error) {
      problems.push(`la tesela de prueba no es MVT válido: ${error.message}`);
    }
    if (probeLayers.length === 0) problems.push("la tesela de prueba no tiene capas");
    if (probeLayers.length > 0 && !probeLayers.some((layer) => layer.name === "buildings")) {
      problems.push("la tesela de prueba no incluye la capa de edificios");
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) warn(`Verificación: ${problem}`);
    throw new Error(
      "El paquete PMTiles no pasa la verificación. No se publica un archivo que no se puede leer.",
    );
  }

  log(
    `Cabecera verificada: tipo MVT, zooms ${header.minZoom}–${header.maxZoom}, ${header.numAddressedTiles} teselas direccionadas, ${humanBytes(fileStat.size)}`,
  );
  log(
    `Tesela de prueba ${probeZoom}/${probeX}/${probeY}: ${probeLayers.map((layer) => `${layer.name}(${layer.featureCount})`).join(", ")}`,
  );
  log(
    `Identificadores de tesela: ${tiles.length}/${tiles.length} coinciden con el lector oficial. Teselas extractadas y comparadas byte a byte: ${extracted.length}/${sampleTiles.length}`,
  );
  log(
    `Tesela inexistente devuelve vacío: ${absentIsAbsent ? "sí" : "no comprobado (esa tesela sí existe)"}`,
  );
  log(
    `Metadatos leídos por el lector oficial: ${metadataCheck ? `${metadataCheck.name} · ${metadataCheck.version}` : "no"}`,
  );

  // ------------------------------------------------------------- manifiesto
  const manifest = {
    city: city.slug,
    dataVersion,
    generatedAt: now.toISOString().slice(0, 10),
    file: relativePath,
    bytes: fileStat.size,
    sha256,
    coveredBounds: city.bounds,
    zooms: { min: minZoom, max: maxZoom },
    layers: Object.keys(LAYER_CONFIG).filter((name) => (layerTotals[name] ?? 0) > 0),
    tiles: tiles.length,
    tilesByZoom: tileCountByZoom,
    emptyTilesSkipped: emptyTiles,
    featuresPerLayer: Object.fromEntries(
      Object.entries(layerTotals).map(([name, count]) => [name, count]),
    ),
    writer: "data-pipeline (escritor propio PMTiles v3), verificado con el lector oficial de pmtiles 4.5.0",
    verification: {
      readerVersion: "pmtiles 4.5.0",
      headerChecked: true,
      // Las comprobaciones de cabecera y de extracción real de teselas son
      // reproducible de forma independiente con `node --test test/`.
      automatedTest: "data-pipeline/test/pmtiles.test.mjs",
      tileIdsComparedWithOfficial: tiles.length,
      tileIdsMismatched: idMismatches,
      tilesExtractedAndCompared: extracted.length,
      tilesSampled: sampleTiles.length,
      absentTileReturnsEmpty: absentIsAbsent
        ? {
            z: absentZ,
            x: absentX,
            y: absentY,
            returnedEmpty: true,
          }
        : null,
      metadataRead: metadataCheck,
      probeTile: { z: probeZoom, x: probeX, y: probeY, layers: probeLayers },
    },
    compression: "gzip (nivel 9)",
    pmtilesStats: stats,
  };

  await writeFile(join(BUILD_DIR, `${city.slug}.tiles.json`), JSON.stringify(manifest, null, 2));

  // ------------------------------- módulo generado que consume la aplicación
  const osm = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.quality.json`), "utf8"));
  const generated = `// GENERADO POR data-pipeline/steps/04-tiles.mjs — NO EDITAR A MANO.
// Se regenera con:  cd data-pipeline && node run.mjs tiles
//
// Este módulo es el puente entre el pipeline y la aplicación: mientras no exista
// un paquete, \`tilesPackage\` es null y la ciudad no se puede abrir.
//
// OJO: aquí NO se decide si la ciudad está publicada. Que existan teselas
// verificadas es condición necesaria, pero el estado \`available\` lo decide el
// paso 06 leyendo además la verificación geográfica y las mediciones de
// rendimiento. Escribirlo aquí fue un error real: la ciudad figuraba como
// publicada con la evidencia a medias.

export const dataVersion = ${JSON.stringify(dataVersion)};
export const generatedAt = ${JSON.stringify(manifest.generatedAt)};
export const dataStatus = "ready" as const;

/** Fechas de extracción reales, escritas por el pipeline. */
export const sourceExtractedAt: Record<string, string> = ${JSON.stringify(
    {
      osm: osm.inputs.osm.extractedAt,
      "catastro-bu": osm.inputs.catastro.extractedAt,
    },
    null,
    2,
  )};

export const tilesPackage = {
  url: ${JSON.stringify(relativePath)},
  dataVersion: ${JSON.stringify(dataVersion)},
  generatedAt: ${JSON.stringify(manifest.generatedAt)},
  coveredBounds: ${JSON.stringify(city.bounds)},
  layers: ${JSON.stringify(manifest.layers)},
  bytes: ${manifest.bytes},
  sha256: ${JSON.stringify(sha256)},
};

/** Resumen del control de calidad, medido en el paso 03. */
export const quality = {
  buildings: ${osm.buildings.total},
  buildingsWithRealOrDeclaredHeight: ${Math.round(osm.buildings.realHeightShare * 1000) / 10},
  heightSources: ${JSON.stringify(osm.buildings.byHeightSource)},
  catastroDeclaredFloorsAvailable: ${osm.buildings.catastroDeclaredFloorsAvailable},
  catastroGrossFloorAreaAvailable: ${osm.buildings.catastroGrossFloorAreaAvailable},
  catastroMatched: ${osm.buildings.matchedWithCatastro},
  crossCheckAgreementShare: ${Math.round((osm.crossCheck?.agreementShare ?? 0) * 1000) / 10},
  crossCheckBuildings: ${osm.crossCheck?.buildingsComparable ?? 0},
  relationsNotAssembled: ${osm.relationsNotAssembled},
  discardedTooSmall: ${osm.buildings.discardedTooSmall},
} as const;

/** Presupuesto declarado frente a peso real del paquete. */
export const weight = {
  bytes: ${manifest.bytes},
  tiles: ${manifest.tiles},
  emptyTilesSkipped: ${manifest.emptyTilesSkipped},
  budgetBytes: 12 * 1024 * 1024,
} as const;

/** Control de calidad medido en el paso 03, publicado tal cual. */
export const report = {
  buildings: ${osm.buildings.total},
  heightSources: ${JSON.stringify(osm.buildings.byHeightSource)},
  realHeightShare: ${osm.buildings.realHeightShare},
  catastroGrossFloorAreaAvailable: ${osm.buildings.catastroGrossFloorAreaAvailable},
  catastroDeclaredFloorsAvailable: ${osm.buildings.catastroDeclaredFloorsAvailable},
  crossCheck: ${
    osm.crossCheck && osm.crossCheck.buildingsComparable > 0
      ? JSON.stringify({
          compared: osm.crossCheck.buildingsComparable,
          agreeWithinOneFloorShare: osm.crossCheck.agreementShare,
          meanAbsoluteFloorDelta: osm.crossCheck.meanAbsoluteFloorDelta,
        })
      : "null"
  },
  // El as string[] es necesario: dentro de un objeto as const la lista quedaría
  // de solo lectura y no encaja con el esquema de la aplicación, que declara
  // notes: string[]. El as const de fuera conserva los literales numéricos.
  notes: ${JSON.stringify(osm.notes ?? [])} as string[],
} as const;
`;

  await writeFile(join(REPO_DIR, "src", "lib", "cities", "data", `${city.slug}.generated.ts`), generated);

  log(`Paquete: ${relativePath} (${humanBytes(fileStat.size)})`);
  log(`sha256: ${sha256}`);
  log(`Teselas por zoom: ${JSON.stringify(tileCountByZoom)}`);
  log(`Módulo generado para la app: src/lib/cities/data/${city.slug}.generated.ts`);
  return manifest;
}
