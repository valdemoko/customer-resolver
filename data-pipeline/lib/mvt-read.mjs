/**
 * Lector mínimo de Mapbox Vector Tile.
 *
 * Existe para VERIFICAR: después de generar el paquete se decodifica una tesela
 * concreta y se comprueba que contiene las capas y los elementos esperados. Sin
 * esto, "el archivo se ha escrito" no es lo mismo que "el archivo es un mapa
 * válido".
 *
 * Solo se decodifica lo necesario: nombre de capa y número de elementos. No es
 * un lector completo (no decodifica los comandos de dibujo de las geometrías).
 */

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  let position = offset;
  for (;;) {
    if (position >= buffer.length) throw new Error("varint truncado en la tesela");
    const byte = buffer[position];
    position += 1;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 53) throw new Error("varint demasiado largo en la tesela");
  }
  return { value: result, offset: position };
}

function readLengthDelimited(buffer, offset) {
  const { value: length, offset: start } = readVarint(buffer, offset);
  return { start, end: start + length };
}

function skipField(buffer, offset, wireType) {
  if (wireType === 0) return readVarint(buffer, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) return readLengthDelimited(buffer, offset).end;
  if (wireType === 5) return offset + 4;
  throw new Error(`tipo de campo no soportado en la tesela: ${wireType}`);
}

/** Cuenta los elementos de una capa ya delimitada. */
function readLayer(buffer) {
  let name = "";
  let featureCount = 0;
  let offset = 0;

  while (offset < buffer.length) {
    const { value: key, offset: afterKey } = readVarint(buffer, offset);
    const fieldNumber = key >> 3;
    const wireType = key & 0x07;
    offset = afterKey;

    if (fieldNumber === 1 && wireType === 2) {
      const { start, end } = readLengthDelimited(buffer, offset);
      name = Buffer.from(buffer.subarray(start, end)).toString("utf8");
      offset = end;
      continue;
    }
    if (fieldNumber === 2 && wireType === 2) {
      const { end } = readLengthDelimited(buffer, offset);
      featureCount += 1;
      offset = end;
      continue;
    }
    offset = skipField(buffer, offset, wireType);
  }

  return { name, featureCount };
}

/**
 * Devuelve `[{ name, featureCount }]` de una tesela MVT ya descomprimida.
 * Lanza si el búfer no es un protobuf válido.
 */
export function readTileLayers(buffer) {
  const layers = [];
  let offset = 0;

  while (offset < buffer.length) {
    const { value: key, offset: afterKey } = readVarint(buffer, offset);
    const fieldNumber = key >> 3;
    const wireType = key & 0x07;
    offset = afterKey;

    if (fieldNumber === 3 && wireType === 2) {
      const { start, end } = readLengthDelimited(buffer, offset);
      layers.push(readLayer(buffer.subarray(start, end)));
      offset = end;
      continue;
    }
    offset = skipField(buffer, offset, wireType);
  }

  return layers;
}
