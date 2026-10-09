import { describe, expect, it } from "vitest";
import { orientedBox } from "./landmarks";

/** Rectángulo de `length` × `width` girado `degrees` alrededor de (cx, cz). */
function rotated(length: number, width: number, degrees: number, cx: number, cz: number) {
  const a = (degrees * Math.PI) / 180;
  const corners: Array<[number, number]> = [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ];
  return corners.map(([x, z]) => [
    cx + x * Math.cos(a) - z * Math.sin(a),
    cz + x * Math.sin(a) + z * Math.cos(a),
  ]) as Array<[number, number]>;
}

describe("rectángulo mínimo de una huella", () => {
  it("el eje largo sigue al lado largo, sea cual sea el giro", () => {
    for (const degrees of [0, 10, 45, 87, 93, 130, 175]) {
      const box = orientedBox(rotated(119, 82, degrees, 40, -20));
      expect(box.length).toBeCloseTo(119, 1);
      expect(box.width).toBeCloseTo(82, 1);
      const expected = (degrees * Math.PI) / 180;
      // El eje puede apuntar a un lado o al opuesto: se compara su valor absoluto.
      expect(Math.abs(box.axis[0] * Math.cos(expected) + box.axis[1] * Math.sin(expected))).toBeCloseTo(1, 2);
      expect(box.center[0]).toBeCloseTo(40, 1);
      expect(box.center[1]).toBeCloseTo(-20, 1);
    }
  });
});
