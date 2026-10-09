import { describe, expect, it } from "vitest";
import { MeshBuilder } from "./mesh";

/**
 * Estas pruebas existen por un fallo real: la losa, el agua, el verde y las
 * calles se construían con la normal hacia ABAJO, así que con material de una
 * sola cara no se veían desde arriba. La ciudad aparecía flotando sobre el
 * cielo. Ninguna comprobación de tipos ni de número de triángulos lo detectaba:
 * la geometría era correcta y estaba del revés.
 */

const SQUARE: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** Normal de la primera cara de una geometría no indexada. */
function firstNormal(builder: MeshBuilder): [number, number, number] {
  const geometry = builder.build();
  const normal = geometry.getAttribute("normal");
  return [normal.getX(0) ?? 0, normal.getY(0) ?? 0, normal.getZ(0) ?? 0];
}

describe("orientación de las caras", () => {
  it("una cara horizontal mira hacia arriba", () => {
    const builder = new MeshBuilder();
    builder.addRing(SQUARE, 0, 0xffffff);
    const [x, y, z] = firstNormal(builder);
    expect(y).toBeGreaterThan(0.9);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(z)).toBeLessThan(0.01);
  });

  it("una cara horizontal marcada como «hacia abajo» mira hacia abajo", () => {
    const builder = new MeshBuilder();
    builder.addRing(SQUARE, 0, 0xffffff, "", true);
    expect(firstNormal(builder)[1]).toBeLessThan(-0.9);
  });

  it("la cara coloreada por triángulo también mira hacia arriba", () => {
    const builder = new MeshBuilder();
    builder.addPolygonShaded({ outer: SQUARE, holes: [] }, 0, () => 0xffffff);
    expect(firstNormal(builder)[1]).toBeGreaterThan(0.9);
  });

  it("las paredes miran hacia FUERA del volumen", () => {
    // Anillo antihorario en (x, z). La pared del lado derecho (x = 10) tiene que
    // mirar hacia +x, que es hacia fuera.
    const builder = new MeshBuilder();
    builder.addWalls(SQUARE, 0, 5, 0xffffff);
    const geometry = builder.build();
    const normal = geometry.getAttribute("normal");
    const position = geometry.getAttribute("position");

    let found = false;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      if (Math.abs(x - 10) < 1e-6 && (normal.getX(index) ?? 0) > 0.9) found = true;
    }
    expect(found).toBe(true);
  });
});

describe("búfer", () => {
  it("cada triángulo aporta tres vértices con color", () => {
    const builder = new MeshBuilder();
    builder.addQuad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], 0xff0000);
    expect(builder.triangleCount).toBe(2);
    const geometry = builder.build();
    expect(geometry.getAttribute("position").count).toBe(6);
    expect(geometry.getAttribute("color").count).toBe(6);
  });

  it("guarda el identificador por triángulo, en el mismo orden que las caras", () => {
    const builder = new MeshBuilder();
    builder.addRing(SQUARE, 0, 0xffffff, "way/1");
    builder.addRing(SQUARE, 0, 0xffffff, "way/2");
    const ids = builder.pickIds();
    expect(ids.length).toBe(builder.triangleCount);
    expect(ids[0]).toBe("way/1");
    expect(ids[ids.length - 1]).toBe("way/2");
  });
});
