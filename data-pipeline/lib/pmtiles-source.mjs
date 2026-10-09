import { open } from "node:fs/promises";

/**
 * Fuente local para el lector OFICIAL de PMTiles.
 *
 * El `FileSource` que trae el paquete espera un `Blob`/`File` del navegador
 * (`this.file.slice(...).arrayBuffer()`), no una ruta, así que en Node falla. Se
 * implementa la interfaz mínima que el lector necesita —`getBytes(offset,
 * length)`— para poder leer un archivo del disco con el MISMO lector oficial.
 * Si la verificación se hiciera con código propio, comprobaría que mi escritor
 * está de acuerdo con mi lector, que no demuestra nada.
 */
export class LocalFileSource {
  constructor(path) {
    this.path = path;
  }

  async getKey() {
    return this.path;
  }

  async getBytes(offset, length) {
    const handle = await open(this.path, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const slice = buffer.subarray(0, bytesRead);
      return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) };
    } finally {
      await handle.close();
    }
  }
}
