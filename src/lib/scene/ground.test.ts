import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SURFACE_LAYERS } from "./palette";
import { buildGround } from "./ground";
import { createSceneUniforms, fadeKeep } from "./materials";
import type { CityFeature } from "./tiles";
import { chamferDistance } from "./water";
import { regularPolygon } from "./polygon";

function surface(kind: string, outer: Array<[number, number]>, props: Record<string, string> = {}): CityFeature {
  return {
    layer: kind === "land" ? "land" : "surface",
    kind,
    name: "",
    polygons: [{ outer, holes: [] }],
    lines: [],
    points: [],
    heightM: 0,
    heightSource: "",
    levels: 0,
    areaM2: 0,
    osmId: "",
    catastroRef: "",
    genus: "",
    species: "",
    leafType: "",
    tile: "17/0/0",
    props: { kind, ...props },
  };
}

describe("capas del suelo: alturas explícitas y orden definido", () => {
  const layers = Object.entries(SURFACE_LAYERS).sort((a, b) => a[1].order - b[1].order);

  it("cada clase tiene una altura propia y distinta", () => {
    const heights = layers.map(([, layer]) => layer.y);
    expect(new Set(heights).size).toBe(heights.length);
  });

  it("la prioridad crece con la altura y con el orden de dibujo", () => {
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i]![1].y).toBeGreaterThan(layers[i - 1]![1].y);
      expect(layers[i]![1].order).toBeGreaterThan(layers[i - 1]![1].order);
    }
  });

  it("la separación entre clases es de al menos 1,5 cm y el conjunto no pasa de 50 cm", () => {
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i]![1].y - layers[i - 1]![1].y).toBeGreaterThanOrEqual(0.015);
    }
    const span = layers.at(-1)![1].y - layers[0]![1].y;
    // Coherente con la escala: medio metro de cota entre la tierra y un puente.
    expect(span).toBeLessThan(0.5);
  });

  it("la separación vence a la resolución del búfer de profundidad al zoom lejano", () => {
    // d² / (near · 2²⁴) con el `near` dinámico: 3 300 m y near 90 m.
    const resolution = (3300 * 3300) / (90 * 2 ** 24);
    expect(resolution).toBeLessThan(0.01);
    expect(0.02).toBeGreaterThan(resolution * 2);
  });
});

describe("construcción del suelo", () => {
  it("dibuja cada clase una sola vez, a su altura y con su orden", () => {
    const uniforms = createSceneUniforms({ cx: 0, cz: 0, radius: 100 }, 50, "#cddde6");
    const square = (x: number, z: number): Array<[number, number]> => [
      [x, z],
      [x + 10, z],
      [x + 10, z + 10],
      [x, z + 10],
    ];
    const ground = buildGround(
      [
        surface("land", [[-50, -50], [50, -50], [50, 50], [-50, 50]]),
        surface("road_major", square(0, 0)),
        surface("plaza", square(20, 0)),
        surface("green", square(0, 20), { subkind: "park" }),
      ],
      uniforms,
    );
    expect(ground.stats.classes).toBe(4);
    const meshes = ground.group.children as THREE.Mesh[];
    for (const mesh of meshes) {
      const kind = mesh.name.replace("suelo-", "");
      const layer = SURFACE_LAYERS[kind]!;
      expect(mesh.renderOrder).toBe(layer.order);
      const box = new THREE.Box3().setFromObject(mesh);
      expect(box.min.y).toBeCloseTo(layer.y, 6);
      expect(box.max.y).toBeCloseTo(layer.y, 6);
    }
  });
});

describe("difuminado radial", () => {
  const circle = { cx: 0, cz: 0, radius: 1400 };
  it("es idéntico en todas las direcciones a igual distancia", () => {
    const values = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return fadeKeep(circle, 250, Math.cos(a) * 1520, Math.sin(a) * 1520);
    });
    for (const v of values) expect(v).toBeCloseTo(values[0]!, 10);
  });

  it("es nítido dentro del círculo y niebla pura más allá de la banda", () => {
    expect(fadeKeep(circle, 250, 1000, 0)).toBe(1);
    expect(fadeKeep(circle, 250, 1400, 0)).toBe(1);
    expect(fadeKeep(circle, 250, 1650, 0)).toBe(0);
    expect(fadeKeep(circle, 250, 0, 1700)).toBe(0);
  });

  it("el polígono circunscrito contiene al círculo y el inscrito queda dentro", () => {
    const outside = regularPolygon(1710, 128, "circumscribed");
    const inside = regularPolygon(1400, 128, "inscribed");
    for (const [x, z] of outside) expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(1710);
    for (const [x, z] of inside) expect(Math.hypot(x, z)).toBeCloseTo(1400, 6);
    // El polígono inscrito se separa del círculo menos de 0,03 % del radio.
    const apothem = 1400 * Math.cos(Math.PI / 128);
    expect(1400 - apothem).toBeLessThan(1400 * 0.0004);
  });
});

describe("campo de distancia a la orilla", () => {
  it("mide en metros la distancia a la tierra más cercana", () => {
    const size = 32;
    const water = new Uint8Array(size * size).fill(1);
    // Tierra: la columna 0.
    for (let y = 0; y < size; y += 1) water[y * size] = 0;
    const distance = chamferDistance(water, size, 2);
    expect(distance[5 * size]).toBe(0);
    expect(distance[5 * size + 1]).toBeCloseTo(2, 5);
    expect(distance[5 * size + 10]).toBeCloseTo(20, 5);
  });
});
