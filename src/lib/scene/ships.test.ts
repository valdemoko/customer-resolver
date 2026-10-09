import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildShips } from "./ships";
import { createSceneUniforms } from "./materials";
import type { CityFeature } from "./tiles";

function f(
  layer: CityFeature["layer"],
  kind: string,
  props: Record<string, string | number>,
  partial: Partial<CityFeature>,
): CityFeature {
  return {
    layer,
    kind,
    name: "",
    polygons: [],
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
    ...partial,
  };
}

const CRUISE = [
  { lengthM: 330, beamM: 38, heightM: 52, hull: "#f1f3f5", accent: "#2b5d9e", deck: "#e3e7ea" },
  { lengthM: 190, beamM: 28, heightM: 36, hull: "#d6dadd", accent: "#4b6b8a", deck: "#eceff1" },
];

// Mar: z > 0. Muelle a lo largo de x en z = 0, con el agua al sur (z positivo).
const SEA = f("water", "sea", {}, {
  polygons: [
    {
      outer: [
        [-1000, 0],
        [1000, 0],
        [1000, 1000],
        [-1000, 1000],
      ],
      holes: [],
    },
  ],
});
// Yendo hacia +x, el sur (z+) queda a la DERECHA en (este, norte).
const BERTH = (id: string, ax: number, bx: number, length: number) =>
  f("berths", "cruise_berth", { id, quay: "Muelle de prueba", length, water_side: "right" }, {
    lines: [
      [
        [ax, 0],
        [bx, 0],
      ],
    ],
  });

describe("barcos", () => {
  const uniforms = createSceneUniforms({ cx: 0, cz: 0, radius: 1400 }, 250, "#cddde6");

  it("los cruceros se colocan paralelos al frente de atraque, en el lado del agua y dentro de él", () => {
    const ships = buildShips({
      features: [SEA, BERTH("berth-1", -200, 200, 400), BERTH("berth-2", 300, 500, 200)],
      uniforms,
      cruise: CRUISE,
      smallMax: 0,
      waterLevel: -1.6,
      seed: 7,
    });
    expect(ships.placements).toHaveLength(2);
    const [big, small] = ships.placements;
    expect(big?.berth).toBe("berth-1");
    expect(big?.lengthM).toBeLessThanOrEqual(400 - 24);
    expect(small?.lengthM).toBeLessThanOrEqual(200 - 24);
    for (const placement of ships.placements) {
      // Lado del agua (z > 0) y separados del muelle más de la mitad de su manga.
      expect(placement.center[1]).toBeGreaterThan(14);
      // Paralelos al muelle: el rumbo es 0° o 180° (eje x).
      expect([0, 180]).toContain(placement.headingDeg);
      // El casco entero en el agua y con holgura al muelle.
      expect(placement.inWaterShare).toBe(1);
      expect(placement.quayGapM).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("sin nombres ni librea: un material genérico, de color por vértice y sin texturas", () => {
    const ships = buildShips({
      features: [SEA, BERTH("berth-1", -200, 200, 400)],
      uniforms,
      cruise: CRUISE,
      smallMax: 0,
      waterLevel: -1.6,
      seed: 7,
    });
    expect(ships.materials).toHaveLength(1);
    const material = ships.materials[0] as THREE.MeshLambertMaterial;
    expect(material.map).toBeNull();
    for (const child of ships.group.children) expect((child as THREE.Mesh).material).toBe(material);
  });

  it("un crucero no se puede atravesar con la cámara y nada más lo es", () => {
    const ships = buildShips({
      features: [SEA, BERTH("berth-1", -200, 200, 400)],
      uniforms,
      cruise: CRUISE,
      smallMax: 0,
      waterLevel: -1.6,
      seed: 7,
    });
    const centre = ships.placements[0]?.center ?? [0, 0];
    expect(ships.heightAt(centre[0], centre[1])).toBeGreaterThan(30);
    expect(ships.heightAt(centre[0], -50)).toBe(0);
    expect(ships.heightAt(900, 900)).toBe(0);
  });

  it("el presupuesto de barcos pequeños se respeta y se puede apagar", () => {
    const moorings = f("moorings", "pontoon", {}, {
      lines: [
        [
          [-100, 120],
          [100, 120],
        ],
        [
          [-100, 200],
          [100, 200],
        ],
      ],
    });
    const ships = buildShips({ features: [SEA, moorings], uniforms, cruise: [], smallMax: 12, waterLevel: -1.6, seed: 3 });
    expect(ships.stats.smallPlaced).toBeGreaterThan(0);
    expect(ships.stats.smallPlaced).toBeLessThanOrEqual(12);
    const counts = () => ships.group.children.reduce((s, c) => s + ((c as THREE.InstancedMesh).count ?? 0), 0);
    expect(counts()).toBe(ships.stats.smallPlaced);
    ships.setSmallBoatBudget(0);
    expect(counts()).toBe(0);
  });

  it("los barcos pequeños atracan a ambos lados del pantalán y solo sobre el agua", () => {
    const moorings = f("moorings", "pontoon", {}, {
      lines: [
        [
          [-60, 100],
          [60, 100],
        ],
      ],
    });
    const ships = buildShips({ features: [SEA, moorings], uniforms, cruise: [], smallMax: 100, waterLevel: -1.6, seed: 1 });
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const sides = new Set<number>();
    for (const child of ships.group.children) {
      const mesh = child as THREE.InstancedMesh;
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.z).toBeGreaterThan(0);
        // Nunca encima del pantalán (a ±1,1 m de su eje).
        expect(Math.abs(position.z - 100)).toBeGreaterThan(1.4);
        sides.add(Math.sign(position.z - 100));
      }
    }
    expect(sides.size).toBe(2);
  });
});
