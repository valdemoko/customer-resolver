import { describe, expect, it } from "vitest";
import { angleLerp, cruisePose, cruiseStage, makePath, samplePath, yawOf } from "./traffic";
import { buildSeaMap, findSeaPath } from "./seamap";

describe("ciclo del crucero", () => {
  it("empieza y acaba amarrado y recorre toda la ruta a mitad de ciclo", () => {
    expect(cruiseStage(0).s).toBe(0);
    expect(cruiseStage(0.3).stage).toBe("dwell");
    expect(cruiseStage(0.7).s).toBe(1);
    expect(cruiseStage(0.7).stage).toBe("turn");
    expect(cruiseStage(0.95).s).toBe(0);
    expect(cruiseStage(1.3).stage).toBe("dwell");
    const sample = [0.55, 0.6, 0.65].map((u) => cruiseStage(u).s);
    expect(sample[0]).toBeLessThan(sample[1]!);
    expect(sample[1]).toBeLessThan(sample[2]!);
  });

  it("al zarpar se aparta del muelle sin girar y después enfila la ruta", () => {
    const path = makePath([[0, 0], [0, 400], [600, 800]]);
    const baseYaw = 1;
    const dwell = cruisePose(path, baseYaw, 200, 0.1);
    expect(dwell.yaw).toBe(baseYaw);
    const early = cruisePose(path, baseYaw, 200, 0.5 + 0.18 * 0.12);
    expect(Math.abs(early.yaw - baseYaw)).toBeLessThan(0.05);
    const far = cruisePose(path, baseYaw, 200, 0.67);
    const tangent = samplePath(path, path.length * 0.98);
    expect(Math.abs(angleLerp(far.yaw, yawOf(tangent.tx, tangent.tz), 1) - far.yaw)).toBeLessThan(0.2);
  });

  it("vuelve por la misma ruta y la termina en el atraque", () => {
    const path = makePath([[0, 0], [0, 500]]);
    const back = cruisePose(path, 0, 100, 0.8);
    expect(back.z).toBeGreaterThan(0);
    expect(back.z).toBeLessThan(500);
    expect(cruisePose(path, 0, 100, 0.93).z).toBe(0);
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
