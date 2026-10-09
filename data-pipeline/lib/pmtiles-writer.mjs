/**
 * Escritor mínimo del formato PMTiles v3.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: la versión pública del paquete `pmtiles` en npm
 * (4.5.0) trae el LECTOR pero no el escritor, y este entorno no tiene Java ni
 * Docker para usar Planetiler o el CLI de PMTiles. El formato es un contenedor
 * sencillo y está especificado, así que se implementa aquí.
 *
 * No se pide confianza: el paso 04 relee el archivo generado con el lector
 * OFICIAL del paquete `pmtiles`, compara mi numeración de teselas con la suya
 * tesela a tesela y comprueba que se pueden extraer y decodificar teselas
 * concretas. Si algo no cuadra, el pipeline falla y no publica el paquete.
 *
 * TRES ERRORES REALES QUE ESTE ARCHIVO YA NO COMETE (los cometió y la
 * verificación con el lector oficial los destapó; ninguna tesela era legible):
 *
 *  1. El identificador de tesela no es `y · 2^z + x` (orden por filas), sino la
 *     posición acumulada en una curva de Hilbert, como exige la especificación.
 *     El lector calcula el identificador con su propio algoritmo: si el escritor
 *     numera de otra forma, ninguna búsqueda encuentra nada. Se reproduce aquí
 *     el algoritmo oficial bit a bit.
 *  2. El directorio no se escribe intercalando (delta, runLength) por entrada.
 *     Son cinco secciones EN SERIE: recuento, todos los deltas de TileID, todos
 *     los runLength, todas las longitudes y todos los desplazamientos.
 *  3. Los desplazamientos se codifican como `offset + 1`, y como `0` solo si la
 *     entrada es contigua a la anterior (nunca en la primera entrada, porque el
 *     decodificador trata el 0 de la primera como `0 - 1`).
 *
 * Referencia del formato: especificación PMTiles v3 (cabecera de 127 bytes).
 */

const HEADER_SIZE = 127;
const MAGIC = "PMTiles";
const SPEC_VERSION = 3;
const MAX_ROOT_DIRECTORY_BYTES = 16384 - HEADER_SIZE;

export const COMPRESSION = { NONE: 1, GZIP: 2, BROTLI: 3, ZSTD: 4 };
export const TILE_TYPE = { MVT: 1, PNG: 2, JPEG: 3, WEBP: 4, AVIF: 5 };

/* ------------------------------------------------------------------ varint */

/**
 * Entero de anchura variable (protobuf): 7 bits por byte, el bit alto indica
 * continuación.
 *
 * OJO: aquí NO se puede usar `value & 0x7f`. Los operadores de bits de
 * JavaScript convierten a 32 bits con signo, así que a partir de 2^31 el valor
 * se corrompe en silencio. Los identificadores de tesela superan 2^31 a partir
 * del zoom 16, justo donde está el detalle del centro histórico. Se usa
 * aritmética de coma flotante, exacta hasta 2^53.
 */
function writeVarint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining % 128) + 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return bytes;
}

export function readVarint(buffer, offset) {
  let result = 0;
  let shift = 1;
  let position = offset;
  for (;;) {
    if (position >= buffer.length) throw new Error("varint truncado");
    const byte = buffer[position];
    position += 1;
    result += (byte & 0x7f) * shift;
    if ((byte & 0x80) === 0) break;
    shift *= 128;
    if (shift > 2 ** 56) throw new Error("varint demasiado largo");
  }
  return { value: result, offset: position };
}

/* ------------------------------------------------------------- identificador */

/** Rotación de la curva de Hilbert, tal cual la define el lector oficial. */
function rotate(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx !== 0) return [n - 1 - y, n - 1 - x];
    return [y, x];
  }
  return [x, y];
}

/**
 * Identificador de tesela: posición acumulada en la serie de curvas de Hilbert,
 * una por nivel de zoom, empezando en el 0.
 *
 * Es una copia del algoritmo del lector oficial (`zxyToTileId` de pmtiles 4.5.0)
 * y el paso 04 lo comprueba contra el original en todas las teselas generadas.
 * Si alguna vez divergen, la verificación falla y el paquete no se publica.
 */
export function zxyToTileId(z, x, y) {
  if (z > 26) throw new Error("z por encima de 26 no cabe con precisión segura");
  if (x >= 2 ** z || y >= 2 ** z) throw new Error("x/y fuera de los límites del zoom");

  let acc = ((2 ** z) * (2 ** z) - 1) / 3;
  let a = z - 1;
  let [tx, ty] = [x, y];
  for (let s = 2 ** a; s > 0; s >>= 1) {
    const rx = tx & s;
    const ry = ty & s;
    acc += ((3 * rx) ^ ry) * 2 ** a;
    [tx, ty] = rotate(s, tx, ty, rx, ry);
    a -= 1;
  }
  return acc;
}

/* --------------------------------------------------------------- directorio */

/**
 * Serializa un directorio (raíz u hoja) tal y como espera el lector.
 *
 * Orden obligatorio de las cinco secciones, sin intercalar nada:
 *   1. número de entradas
 *   2. deltas de TileID (respecto a la entrada anterior)
 *   3. runLength de todas las entradas
 *   4. longitud de todas las entradas
 *   5. desplazamiento de todas las entradas
 */
function serializeDirectory(entries, compress) {
  const sorted = [...entries].sort((a, b) => a.tileId - b.tileId);
  const bytes = [];

  bytes.push(...writeVarint(sorted.length));

  let previousTileId = 0;
  for (const entry of sorted) {
    bytes.push(...writeVarint(entry.tileId - previousTileId));
    previousTileId = entry.tileId;
  }

  for (const entry of sorted) bytes.push(...writeVarint(entry.runLength));
  for (const entry of sorted) bytes.push(...writeVarint(entry.length));

  let nextOffset = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index];
    // Contigüidad (incluida la que deja la deduplicación al reutilizar un blob
    // anterior): se codifica como 0. En la primera entrada no se puede usar 0,
    // porque el decodificador lo interpreta como "una antes del anterior".
    if (index > 0 && entry.offset === nextOffset) bytes.push(0);
    else bytes.push(...writeVarint(entry.offset + 1));
    nextOffset = entry.offset + entry.length;
  }

  return compress(Uint8Array.from(bytes));
}

/* ---------------------------------------------------------------- escritura */

function writeUint64(view, offset, value) {
  view.setBigUint64(offset, BigInt(value), true);
}

function writeHeader({
  rootOffset,
  rootLength,
  metadataOffset,
  metadataLength,
  tileDataOffset,
  tileDataLength,
  addressedTiles,
  tileEntries,
  tileContents,
  tileType,
  minZoom,
  maxZoom,
  bounds,
  center,
}) {
  const header = new Uint8Array(HEADER_SIZE);
  const view = new DataView(header.buffer);

  for (let i = 0; i < MAGIC.length; i += 1) header[i] = MAGIC.charCodeAt(i);
  header[7] = SPEC_VERSION;

  writeUint64(view, 8, rootOffset);
  writeUint64(view, 16, rootLength);
  writeUint64(view, 24, metadataOffset);
  writeUint64(view, 32, metadataLength);
  writeUint64(view, 40, 0); // sin directorios hoja: el árbol cabe en la raíz
  writeUint64(view, 48, 0);
  writeUint64(view, 56, tileDataOffset);
  writeUint64(view, 64, tileDataLength);
  writeUint64(view, 72, addressedTiles);
  writeUint64(view, 80, tileEntries);
  writeUint64(view, 88, tileContents);

  header[96] = 1; // agrupado por tileId dentro de los datos
  header[97] = COMPRESSION.GZIP; // directorios y metadatos comprimidos con gzip
  header[98] = COMPRESSION.GZIP; // las teselas también
  header[99] = tileType;
  header[100] = minZoom;
  header[101] = maxZoom;

  view.setInt32(102, Math.round(bounds.west * 1e7), true);
  view.setInt32(106, Math.round(bounds.south * 1e7), true);
  view.setInt32(110, Math.round(bounds.east * 1e7), true);
  view.setInt32(114, Math.round(bounds.north * 1e7), true);

  header[118] = Math.round(center.zoom);
  view.setInt32(119, Math.round(center.lon * 1e7), true);
  view.setInt32(123, Math.round(center.lat * 1e7), true);

  return header;
}

/**
 * Escribe un archivo PMTiles a partir de una lista de teselas ya comprimidas.
 *
 * @param {object} options
 * @param {{z:number,x:number,y:number,data:Uint8Array}[]} options.tiles
 * @param {object} options.metadata  Metadatos (se serializan a JSON y se comprimen)
 * @param {object} options.bounds    { west, south, east, north }
 * @param {object} options.center    { lon, lat, zoom }
 * @param {number} options.minZoom
 * @param {number} options.maxZoom
 * @param {(input: Uint8Array) => Uint8Array} options.compress
 */
export function writePmtiles({ tiles, metadata, bounds, center, minZoom, maxZoom, compress }) {
  const metadataBytes = compress(new TextEncoder().encode(JSON.stringify(metadata)));

  // Deduplicación de contenido idéntico (muy habitual en teselas vecinas de
  // suelo o agua) y orden por tileId, que es lo que exige `clustered = 1`.
  const sorted = [...tiles].sort(
    (a, b) => zxyToTileId(a.z, a.x, a.y) - zxyToTileId(b.z, b.x, b.y),
  );

  const contentOffsets = new Map();
  const dataChunks = [];
  let dataLength = 0;
  const entries = [];

  for (const tile of sorted) {
    const key = Buffer.from(tile.data).toString("base64");
    let offset = contentOffsets.get(key);
    if (offset === undefined) {
      offset = dataLength;
      contentOffsets.set(key, offset);
      dataChunks.push(tile.data);
      dataLength += tile.data.length;
    }
    entries.push({
      tileId: zxyToTileId(tile.z, tile.x, tile.y),
      offset,
      length: tile.data.length,
      runLength: 1,
    });
  }

  // Fusión de entradas consecutivas que comparten contenido: un único registro
  // con runLength > 1. Es la forma compacta que prefiere el formato.
  const merged = [];
  for (const entry of entries) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.offset === entry.offset &&
      previous.length === entry.length &&
      previous.tileId + previous.runLength === entry.tileId
    ) {
      previous.runLength += 1;
      continue;
    }
    merged.push({ ...entry });
  }

  const rootDirectory = serializeDirectory(merged, compress);
  if (rootDirectory.length > MAX_ROOT_DIRECTORY_BYTES) {
    throw new Error(
      `El directorio raíz comprimido (${rootDirectory.length} B) excede el límite de 16257 B: haría falta un nivel de directorios hoja.`,
    );
  }

  const tileDataOffset = HEADER_SIZE + rootDirectory.length + metadataBytes.length;

  const header = writeHeader({
    rootOffset: HEADER_SIZE,
    rootLength: rootDirectory.length,
    metadataOffset: HEADER_SIZE + rootDirectory.length,
    metadataLength: metadataBytes.length,
    tileDataOffset,
    tileDataLength: dataLength,
    addressedTiles: tiles.length,
    tileEntries: merged.length,
    tileContents: dataChunks.length,
    tileType: TILE_TYPE.MVT,
    minZoom,
    maxZoom,
    bounds,
    center,
  });

  const output = new Uint8Array(tileDataOffset + dataLength);
  output.set(header, 0);
  output.set(rootDirectory, HEADER_SIZE);
  output.set(metadataBytes, HEADER_SIZE + rootDirectory.length);
  let position = tileDataOffset;
  for (const chunk of dataChunks) {
    output.set(chunk, position);
    position += chunk.length;
  }

  return {
    bytes: output,
    stats: {
      addressedTiles: tiles.length,
      tileEntries: merged.length,
      uniqueTileContents: dataChunks.length,
      rootDirectoryBytes: rootDirectory.length,
      metadataBytes: metadataBytes.length,
      tileDataBytes: dataLength,
      totalBytes: output.length,
    },
  };
}
