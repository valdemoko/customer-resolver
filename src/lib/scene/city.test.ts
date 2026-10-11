import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCity } from "./city";
import { createSceneUniforms } from "./materials";
import type { CityFeature } from "./tiles";

function building(osmId: string, outer: Array<[number, number]>, holes: Array<Array<[number, number]>>): CityFeature {
  return {
    layer: "buildings",
    kind: "yes",
    name: "",
    polygons: [{ outer, holes }],
    lines: [],
    points: [],
    heightM: 12,
    heightSource: "osm_levels",
    levels: 4,
    areaM2: 400,
    osmId,
    catastroRef: "",
    genus: "",
    species: "",
    leafType: "",
    tile: "17/0/0",
    props: {},
  };
}

const uniforms = createSceneUniforms({ cx: 0, cz: 0, radius: 1400 }, 250, "#cddde6");
const build = (features: CityFeature[]) =>
  buildCity({ features, uniforms, landmarks: [], fortresses: [], exaggeration: 1.25 });

/** Triángulos verticales de un plano x = c con su normal, de una malla no indexada. */
function wallNormals(geometry: THREE.BufferGeometry, axis: "x" | "z", value: number) {
  const position = geometry.getAttribute("position");
  const out: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    if ([a, b, c].every((p) => Math.abs(p[axis] - value) < 1e-6)) {
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      out.push(normal[axis]);
    }
  }
  return out;
}

describe("patios cerrados por configuración", () => {
  const outer: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const hole: Array<[number, number]> = [[30, 30], [70, 30], [70, 70], [30, 70]];
  const walls = (closed: string[]) => {
    const city = buildCity({ features: [building("relation/7", outer, [hole])], uniforms, landmarks: [], fortresses: [], exaggeration: 1.25, closedCourtyards: closed });
    const mesh = city.group.children.find((child) => child.name.startsWith("edificios")) as THREE.Mesh;
    return wallNormals(mesh.geometry, "x", 30).length;
  };

  it("un edificio de la lista no tiene paredes de patio: el tejado lo cierra", () => {
    expect(walls([])).toBeGreaterThan(0); // sin la opción, el patio grande sigue abierto
    expect(walls(["relation/7"])).toBe(0);
    expect(walls(["relation/999"])).toBeGreaterThan(0); // otro edificio no se toca
  });
});

describe("edificios con patio interior", () => {
  // Patio grande (1.600 m²: un ruedo): se deja abierto y con paredes propias.
  const outer: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const hole: Array<[number, number]> = [[30, 30], [70, 30], [70, 70], [30, 70]];

  it("el patio grande tiene paredes propias, orientadas hacia el hueco (no se ve el interior)", () => {
    const city = build([building("way/1", outer, [hole])]);
    const mesh = city.group.children.find((child) => child.name.startsWith("edificios")) as THREE.Mesh;
    const west = wallNormals(mesh.geometry, "x", 30);
    expect(west.length).toBeGreaterThan(0);
    expect(west.every((n) => n > 0.99)).toBe(true);
    expect(wallNormals(mesh.geometry, "x", 70).every((n) => n < -0.99)).toBe(true);
    expect(wallNormals(mesh.geometry, "x", 0).every((n) => n < -0.99)).toBe(true);
    expect(wallNormals(mesh.geometry, "x", 100).every((n) => n > 0.99)).toBe(true);
  });

  it("la malla de selección también tiene las paredes del patio grande", () => {
    const city = build([building("way/1", outer, [hole])]);
    expect(wallNormals(city.pickGeometry as THREE.BufferGeometry, "x", 30).length).toBeGreaterThan(0);
  });

  it("el tejado no cubre el patio grande", () => {
    const city = build([building("way/1", outer, [hole])]);
    const mesh = city.group.children.find((child) => child.name.startsWith("edificios")) as THREE.Mesh;
    expect(roofCoversPoint(mesh.geometry, 12 * 1.25, 50, 50)).toBe(false);
    expect(roofCoversPoint(mesh.geometry, 12 * 1.25, 10, 10)).toBe(true);
  });

  it("un patio pequeño se rellena: tejado continuo y sin paredes interiores", () => {
    const small: Array<[number, number]> = [[40, 40], [50, 40], [50, 50], [40, 50]];
    const city = build([building("way/1", outer, [small])]);
    const mesh = city.group.children.find((child) => child.name.startsWith("edificios")) as THREE.Mesh;
    expect(roofCoversPoint(mesh.geometry, 12 * 1.25, 45, 45)).toBe(true);
    expect(wallNormals(mesh.geometry, "x", 40)).toHaveLength(0);
  });
});

/** ¿Hay algún triángulo del tejado (a la altura `top`) que contenga el punto (x, z)? */
function roofCoversPoint(geometry: THREE.BufferGeometry, top: number, x: number, z: number): boolean {
  const position = geometry.getAttribute("position");
  const inside = (i: number) => {
    const p = [0, 1, 2].map((k) => [position.getX(i + k), position.getZ(i + k)] as const);
    const sign = (a: readonly [number, number], b: readonly [number, number]) => (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (z - b[1]);
    const d1 = sign(p[0]!, p[1]!);
    const d2 = sign(p[1]!, p[2]!);
    const d3 = sign(p[2]!, p[0]!);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (let i = 0; i < position.count; i += 3) {
    if ([0, 1, 2].every((k) => Math.abs(position.getY(i + k) - top) < 1e-6) && inside(i)) return true;
  }
  return false;
}
