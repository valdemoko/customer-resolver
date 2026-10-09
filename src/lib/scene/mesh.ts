/**
 * Construcción de mallas.
 *
 * DOS DECISIONES QUE EXPLICAN EL ARCHIVO ENTERO:
 *
 *  1. **Geometría NO indexada con color por vértice.** Así el sombreado es plano
 *     por construcción (cada triángulo tiene sus tres normales iguales, que
 *     `computeVertexNormals` calcula por cara al no compartir vértices) y el
 *     color se puede poner por cara. El resultado es el aspecto low poly sin
 *     necesitar materiales por color: la ciudad entera es UNA malla y por tanto
 *     UNA llamada de dibujo. Con un material por color habría decenas.
 *
 *  2. **Se fusiona por capa, no por elemento.** Un edificio de 3836 no puede ser
 *     3836 objetos: three.js no puede con eso. Se acumulan los triángulos de
 *     toda la capa en un mismo búfer.
 */

import * as THREE from "three";
import type { Ring } from "./polygon";
import { triangulateFlat, polygonArea } from "./polygon";
import type { Polymesh } from "./tiles";

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  /** Identificador por triángulo, para poder saber qué se ha pinchado. */
  private readonly ids: string[] = [];
  private readonly hex = new THREE.Color();

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  addTriangle(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    color: number,
    id = "",
  ): void {
    this.hex.setHex(color);
    for (const point of [a, b, c]) {
      this.positions.push(point[0], point[1], point[2]);
      this.colors.push(this.hex.r, this.hex.g, this.hex.b);
    }
    this.ids.push(id);
  }

  /** Cuadrilátero con los vértices en orden; se parte en dos triángulos. */
  addQuad(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    color: number,
    id = "",
  ): void {
    this.addTriangle(a, b, c, color, id);
    this.addTriangle(a, c, d, color, id);
  }

  /** Cara horizontal a partir de un anillo, con huecos si los hay. */
  addPolygon(
    polygon: Polymesh,
    altitude: number,
    color: number,
    id = "",
    /**
     * `true` solo si la cara se mira desde ABAJO (por ejemplo, la base de un
     * volumen hueco).
     *
     * El orden de los vértices está calculado, no elegido: un anillo
     * antihorario en el plano (x, z) produce, al pasar a tres dimensiones con
     * y hacia arriba, una normal que apunta hacia ABAJO. Es decir, la cara se
     * ve desde abajo y con material de una sola cara desaparece. El fallo real
     * que esto causó: el suelo, el agua, el verde y las calles eran invisibles y
     * la ciudad parecía flotar sobre el cielo. Lo delata la comprobación de
     * normales de `mesh.test.ts`.
     */
    downward = false,
  ): void {
    const flat: number[] = [];
    const holes: number[] = [];
    for (const point of polygon.outer) flat.push(point[0], point[1]);
    for (const hole of polygon.holes) {
      if (hole.length < 3) continue;
      holes.push(flat.length / 2);
      for (const point of hole) flat.push(point[0], point[1]);
    }
    if (flat.length < 6) return;

    const indices = triangulateFlat(flat, holes);
    const vertexCount = flat.length / 2;
    for (let index = 0; index < indices.length; index += 3) {
      const i0 = indices[index];
      const i1 = indices[index + 1];
      const i2 = indices[index + 2];
      if (i0 === undefined || i1 === undefined || i2 === undefined) continue;
      if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
      const p0: [number, number, number] = [flat[i0 * 2] ?? 0, altitude, flat[i0 * 2 + 1] ?? 0];
      const p1: [number, number, number] = [flat[i1 * 2] ?? 0, altitude, flat[i1 * 2 + 1] ?? 0];
      const p2: [number, number, number] = [flat[i2 * 2] ?? 0, altitude, flat[i2 * 2 + 1] ?? 0];
      // Cara hacia arriba: se invierte el orden. Cara hacia abajo: se deja tal
      // cual, que ya apunta hacia abajo.
      if (downward) this.addTriangle(p0, p1, p2, color, id);
      else this.addTriangle(p0, p2, p1, color, id);
    }
  }

  /**
   * Triangula una cara horizontal UNA vez y la añade a este constructor y a los
   * `others` (p. ej. la malla de selección). Con `earcut` cada tejado se
   * triangulaba dos veces —una para dibujar y otra para pinchar— y era lo más
   * caro de construir la ciudad.
   */
  addPolygonShared(
    polygon: Polymesh,
    altitude: number,
    color: number,
    id: string,
    others: MeshBuilder[],
    otherColor = 0xffffff,
  ): void {
    const flat: number[] = [];
    const holes: number[] = [];
    for (const point of polygon.outer) flat.push(point[0], point[1]);
    for (const hole of polygon.holes) {
      if (hole.length < 3) continue;
      holes.push(flat.length / 2);
      for (const point of hole) flat.push(point[0], point[1]);
    }
    if (flat.length < 6) return;
    const indices = triangulateFlat(flat, holes);
    const vertexCount = flat.length / 2;
    for (let index = 0; index < indices.length; index += 3) {
      const i0 = indices[index];
      const i1 = indices[index + 1];
      const i2 = indices[index + 2];
      if (i0 === undefined || i1 === undefined || i2 === undefined) continue;
      if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
      const p0: [number, number, number] = [flat[i0 * 2] ?? 0, altitude, flat[i0 * 2 + 1] ?? 0];
      const p1: [number, number, number] = [flat[i1 * 2] ?? 0, altitude, flat[i1 * 2 + 1] ?? 0];
      const p2: [number, number, number] = [flat[i2 * 2] ?? 0, altitude, flat[i2 * 2 + 1] ?? 0];
      this.addTriangle(p0, p2, p1, color, id);
      for (const other of others) other.addTriangle(p0, p2, p1, otherColor, id);
    }
  }

  /** Cara horizontal de un anillo suelto (sin huecos). */
  addRing(ring: Ring, altitude: number, color: number, id = "", downward = false): void {
    this.addPolygon({ outer: ring, holes: [] }, altitude, color, id, downward);
  }

  /**
   * Cara horizontal con el color decidido POR TRIÁNGULO.
   *
   * Es lo que permite el degradado de costa del agua: cada triángulo toma el
   * tono que le corresponde según su distancia al borde, sin necesidad de
   * transparencias ni de texturas. La función recibe el centroide del triángulo
   * en coordenadas del mundo (x, z).
   */
  addPolygonShaded(
    polygon: Polymesh,
    altitude: number,
    colorAt: (centroid: [number, number]) => number,
    id = "",
  ): void {
    const flat: number[] = [];
    const holes: number[] = [];
    for (const point of polygon.outer) flat.push(point[0], point[1]);
    for (const hole of polygon.holes) {
      if (hole.length < 3) continue;
      holes.push(flat.length / 2);
      for (const point of hole) flat.push(point[0], point[1]);
    }
    if (flat.length < 6) return;

    const indices = triangulateFlat(flat, holes);
    const vertexCount = flat.length / 2;
    for (let index = 0; index < indices.length; index += 3) {
      const i0 = indices[index];
      const i1 = indices[index + 1];
      const i2 = indices[index + 2];
      if (i0 === undefined || i1 === undefined || i2 === undefined) continue;
      if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
      const x0 = flat[i0 * 2] ?? 0;
      const z0 = flat[i0 * 2 + 1] ?? 0;
      const x1 = flat[i1 * 2] ?? 0;
      const z1 = flat[i1 * 2 + 1] ?? 0;
      const x2 = flat[i2 * 2] ?? 0;
      const z2 = flat[i2 * 2 + 1] ?? 0;
      const color = colorAt([(x0 + x1 + x2) / 3, (z0 + z1 + z2) / 3]);
      // Mismo criterio que en `addPolygon`: cara horizontal hacia arriba.
      this.addTriangle([x0, altitude, z0], [x2, altitude, z2], [x1, altitude, z1], color, id);
    }
  }

  /**
   * Pared vertical entre dos alturas, a lo largo de un anillo.
   *
   * ORDEN DE VÉRTICES CALCULADO: subir por la arista `a` (abajo → arriba), pasar
   * a la arista `b` arriba y bajar. Recorrer primero la base (a → b) y después
   * la altura genera una normal hacia DENTRO del volumen; con material de una
   * sola cara el edificio se ve hueco —se ve la pared del fondo por dentro— y se
   * nota sobre todo con luz rasante, que es la de esta escena.
   */
  addWalls(ring: Ring, bottom: number, top: number, color: number, id = ""): void {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      if (!a || !b) continue;
      this.addQuad(
        [a[0], bottom, a[1]],
        [a[0], top, a[1]],
        [b[0], top, b[1]],
        [b[0], bottom, b[1]],
        color,
        id,
      );
    }
  }

  /**
   * `buildingIndex` añade el atributo `bid` (índice numérico del edificio por
   * vértice), que es lo que permite resaltar UN edificio de una malla fusionada
   * sin reconstruir nada. `withColor: false` y `withNormals: false` ahorran
   * memoria en la malla que solo sirve para lanzar rayos.
   */
  build(
    options: {
      buildingIndex?: Map<string, number>;
      withColor?: boolean;
      withNormals?: boolean;
    } = {},
  ): THREE.BufferGeometry {
    const { buildingIndex, withColor = true, withNormals = true } = options;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    if (withColor) geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    if (buildingIndex) {
      const bid = new Float32Array(this.ids.length * 3);
      for (let triangle = 0; triangle < this.ids.length; triangle += 1) {
        const value = buildingIndex.get(this.ids[triangle] ?? "") ?? -1;
        bid[triangle * 3] = value;
        bid[triangle * 3 + 1] = value;
        bid[triangle * 3 + 2] = value;
      }
      geometry.setAttribute("bid", new THREE.BufferAttribute(bid, 1));
    }
    if (withNormals) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** Identificadores por triángulo, en el mismo orden que las caras. */
  pickIds(): string[] {
    return this.ids;
  }

  /** Anillo de la cara superior, útil para recortar lo que se apoya encima. */
  static ringAt(ring: Ring, altitude: number): Array<[number, number, number]> {
    return ring.map((point) => [point[0], altitude, point[1]] as [number, number, number]);
  }
}

/** Área total de los polígonos de un elemento, para descartar ruido. */
export function polygonsArea(polygons: Polymesh[]): number {
  let area = 0;
  for (const polygon of polygons) {
    area += polygonArea(polygon.outer);
    for (const hole of polygon.holes) area -= polygonArea(hole);
  }
  return area;
}
