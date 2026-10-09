import { describe, expect, it } from "vitest";
import {
  clipToConvex,
  convexHull,
  halfPlanes,
  offsetConvex,
  signedDistance,
  isConvex,
  pointInRing,
  polygonArea,
  seededRandom,
  simplifyCollinear,
  triangulateRing,
  ensureCounterClockwise,
} from "./polygon";

/** Polígono regular de `points` lados: convexo y antihorario por construcción. */
function regular(points: number, radius: number): Array<[number, number]> {
  return Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
  });
}

const BOX: Array<[number, number]> = [
  [-800, -500],
  [800, -500],
  [800, 500],
  [-800, 500],
];

describe("semiplanos y distancia al polígono", () => {
  it("la distancia con signo es negativa dentro, cero en el borde y positiva fuera", () => {
    const planes = halfPlanes(BOX);
    expect(signedDistance(planes, 0, 0)).toBeCloseTo(-500, 6);
    expect(signedDistance(planes, 800, 0)).toBeCloseTo(0, 6);
    expect(signedDistance(planes, 900, 0)).toBeCloseTo(100, 6);
    expect(signedDistance(planes, 0, -620)).toBeCloseTo(120, 6);
  });

  it("ampliar el polígono desplaza cada lado exactamente esa distancia", () => {
    const grown = offsetConvex(BOX, 200);
    const planes = halfPlanes(grown);
    expect(isConvex(grown)).toBe(true);
    expect(polygonArea(grown)).toBeCloseTo(2000 * 1400, 3);
    // Un punto a 200 m del polígono original queda justo en el borde ampliado.
    expect(signedDistance(planes, 1000, 0)).toBeCloseTo(0, 6);
    expect(signedDistance(halfPlanes(BOX), 1000, 0)).toBeCloseTo(200, 6);
  });

  it("el polígono ampliado sigue siendo antihorario", () => {
    expect(ensureCounterClockwise(offsetConvex(BOX, 50))).toEqual(offsetConvex(BOX, 50));
  });
});

describe("recorte contra la zona", () => {
  const zone = regular(48, 690);

  it("un polígono fuera no deja nada", () => {
    const far: Array<[number, number]> = [
      [5000, 5000],
      [5100, 5000],
      [5100, 5100],
      [5000, 5100],
    ];
    expect(clipToConvex(far, zone)).toEqual([]);
  });

  it("un polígono dentro se conserva entero", () => {
    const inside: Array<[number, number]> = [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ];
    const clipped = clipToConvex(inside, zone);
    expect(clipped.length).toBe(4);
    expect(polygonArea(clipped)).toBeCloseTo(400, 6);
  });

  it("un polígono que cruza el borde queda recortado y dentro", () => {
    const crossing: Array<[number, number]> = [
      [-2000, -100],
      [2000, -100],
      [2000, 100],
      [-2000, 100],
    ];
    const clipped = clipToConvex(crossing, zone);
    expect(polygonArea(clipped)).toBeLessThan(polygonArea(crossing));
    for (const point of clipped) {
      expect(pointInRing(point, zone) || onBoundary(point, zone)).toBe(true);
    }
  });
});

describe("triangulación", () => {
  it("un anillo convexo de n vértices da n-2 triángulos", () => {
    const ring = regular(24, 690);
    const indices = triangulateRing(ring);
    expect(indices.length).toBe((ring.length - 2) * 3);
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(ring.length);
    }
  });

  it("la suma de las áreas de los triángulos es el área del anillo", () => {
    // Se comprueba de verdad y no solo que «devuelve índices»: una triangulación
    // que se solapa consigo misma devuelve el número correcto de triángulos y el
    // área equivocada.
    const ring = regular(30, 690);
    const indices = triangulateRing(ring);
    let sum = 0;
    for (let index = 0; index < indices.length; index += 3) {
      const a = ring[indices[index] ?? 0];
      const b = ring[indices[index + 1] ?? 0];
      const c = ring[indices[index + 2] ?? 0];
      if (!a || !b || !c) continue;
      sum += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    expect(sum).toBeCloseTo(polygonArea(ring), 4);
  });
});

describe("utilidades", () => {
  it("el azar con semilla es reproducible", () => {
    const first = seededRandom(7);
    const second = seededRandom(7);
    for (let index = 0; index < 8; index += 1) {
      expect(first()).toBe(second());
    }
  });

  it("el casco convexo quita los entrantes", () => {
    const ring: Array<[number, number]> = [
      [-10, 0],
      [0, -1],
      [10, 0],
      [0, 10],
    ];
    const hull = convexHull(ring);
    expect(isConvex(hull)).toBe(true);
    expect(hull.length).toBe(4);
  });

  it("simplifica los vértices que no aportan forma", () => {
    const ring: Array<[number, number]> = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(simplifyCollinear(ring).length).toBe(4);
  });
});

function onBoundary(point: [number, number], ring: Array<[number, number]>): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < 1e-6) return true;
  }
  return false;
}
