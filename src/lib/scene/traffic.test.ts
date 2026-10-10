import { describe, expect, it } from "vitest";
import { CRUISE_SPEED, angleLerp, makePath, sailDistance, sailDuration, samplePath, voyageAt, voyagePose, yawOf } from "./traffic";
import { buildSeaMap, findSeaPath } from "./seamap";

describe("viaje del crucero", () => {
  const voyage = { dwellS: 300, total: 2400, leadS: 100 };

  it("empieza amarrado, espera lo que le queda y después navega despacio hasta volver", () => {
    expect(voyageAt(0, voyage)).toEqual({ moving: false, d: 0 });
    expect(voyageAt(99, voyage).moving).toBe(false);
    // Zarpa cuando se acaba la espera (100 s) y el recorrido crece sin saltos.
    const samples = [150, 300, 500, 800].map((t) => voyageAt(t, voyage).d);
    expect(samples[0]).toBeGreaterThan(0);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThan(samples[i - 1]!);
    // Al acabar la ruta vuelve a estar amarrado.
    const sail = sailDuration(voyage.total);
    expect(voyageAt(100 + sail + 5, voyage)).toEqual({ moving: false, d: 0 });
    // Y el ciclo se repite.
    expect(voyageAt(100 + sail + voyage.dwellS + 200, voyage).moving).toBe(true);
  });

  it("nunca va más rápido que su velocidad de crucero y arranca y frena con suavidad", () => {
    const total = 2000;
    let previous = 0;
    let maxSpeed = 0;
    for (let tau = 1; tau < sailDuration(total); tau += 1) {
      const { d } = sailDistance(tau, total);
      maxSpeed = Math.max(maxSpeed, d - previous);
      previous = d;
    }
    expect(maxSpeed).toBeLessThanOrEqual(CRUISE_SPEED + 1e-6);
    expect(sailDistance(1, total).d).toBeLessThan(CRUISE_SPEED / 2); // al principio casi parado
    expect(sailDistance(sailDuration(total) - 1, total).d).toBeGreaterThan(total - CRUISE_SPEED); // al final casi parado
    expect(sailDistance(sailDuration(total) + 10, total)).toEqual({ d: total, done: true });
  });

  it("junto al muelle conserva el rumbo del atraque y en mar abierto sigue la ruta", () => {
    const path = makePath([[0, 0], [0, 400], [600, 800], [0, 400], [0, 0]]);
    const baseYaw = 1;
    expect(Math.abs(voyagePose(path, baseYaw, 200, 5).yaw - baseYaw)).toBeLessThan(0.05);
    expect(Math.abs(voyagePose(path, baseYaw, 200, path.length - 5).yaw - baseYaw)).toBeLessThan(0.05);
    const far = voyagePose(path, baseYaw, 200, path.length * 0.4);
    const tangent = samplePath(path, path.length * 0.4);
    expect(Math.abs(angleLerp(far.yaw, yawOf(tangent.tx, tangent.tz), 1) - far.yaw)).toBeLessThan(0.2);
  });
});

describe("mapa del mar", () => {
  const inSea = (_x: number, z: number) => z > 0; // mar al sur de z = 0
  const map = buildSeaMap(inSea, 600, 50);

  it("mide la distancia a tierra y no deja salir de la rejilla", () => {
    expect(map.clearanceAt(0, 25)).toBeLessThan(60);
    expect(map.clearanceAt(0, 300)).toBeGreaterThan(200);
    expect(map.clearanceAt(0, -200)).toBe(0);
    expect(map.clearanceAt(5000, 5000)).toBe(0);
  });

  it("encuentra una ruta por agua libre y falla si el destino es tierra", () => {
    const path = findSeaPath(map, [0, 160], [300, 560], 60);
    expect(path).not.toBeNull();
    for (const [x, z] of path!) expect(map.clearanceAt(x, z)).toBeGreaterThanOrEqual(60);
    expect(findSeaPath(map, [0, 160], [0, -300], 60)).toBeNull();
  });
});
