/**
 * Marcas viales y bordillos (Fase C): lo que convierte las franjas grises del
 * suelo en calles.
 *
 *  · Bordillo: una cinta clara de 0,55 m sobre el contorno de las calzadas
 *    principales y secundarias. Solo donde de verdad hay orilla de calzada: una
 *    arista con calzada a UN lado y nada al otro. Las aristas de corte de tesela,
 *    las que separan dos trozos de la misma calle y las espinas degeneradas del
 *    recorte (calzada a los dos lados, o a ninguno) no son borde de calle y
 *    dibujaban rayas rectas cruzando la calzada y el suelo.
 *  · Línea central discontinua en las calles principales. Un trozo de línea no se
 *    dibuja si cae dentro de la calzada de OTRA calle que lo cruza, para no pintar
 *    rayas encima de los cruces.
 *
 * Todo va a 0,30 m (entre las calles, 0,28, y los puentes, 0,34) en una sola
 * malla de color por vértice: dos llamadas de dibujo en total.
 */

import * as THREE from "three";
import { MeshBuilder } from "./mesh";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";
import { hexToNumber } from "./palette";
import { pointInRing } from "./polygon";
import { isTileCut } from "./tiles";
import type { CityFeature } from "./tiles";

const MARK_Y = 0.3;
const CURB_WIDTH = 0.55;
const CURB_COLOR = hexToNumber("#d8d2c3");
const DASH_COLOR = hexToNumber("#ece8dc");
const DASH_LENGTH = 2.4;
const DASH_GAP = 4.6;
const HALF_WIDTH: Record<string, number> = { major: 5.5, minor: 3.5, other: 2.2 };

export type RoadMeshes = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  stats: { curbSegments: number; dashes: number; skippedAtJunctions: number; skippedSeams: number; triangles: number };
};

/** Cinta plana centrada en a→b, con normal hacia arriba. */
function strip(builder: MeshBuilder, ax: number, az: number, bx: number, bz: number, width: number, color: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length < 0.2) return false;
  const px = (dz / length) * (width / 2);
  const pz = (-dx / length) * (width / 2);
  builder.addQuad(
    [ax - px, MARK_Y, az - pz],
    [bx - px, MARK_Y, bz - pz],
    [bx + px, MARK_Y, bz + pz],
    [ax + px, MARK_Y, az + pz],
    color,
  );
  return true;
}

type Segment = { ax: number; az: number; bx: number; bz: number; half: number; rank: number };

export function buildRoads(features: CityFeature[], uniforms: SceneUniforms): RoadMeshes {
  const group = new THREE.Group();
  group.name = "marcas-viales";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(material, uniforms, { key: "roads" });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const curbs = new MeshBuilder();
  let curbSegments = 0;
  let skippedSeams = 0;

  // Índice de las calzadas (principales y secundarias) para saber si un punto cae sobre asfalto.
  type RoadPolygon = { outer: Array<[number, number]>; holes: Array<Array<[number, number]>>; minX: number; maxX: number; minZ: number; maxZ: number };
  const ROAD_CELL = 64;
  const roadGrid = new Map<string, RoadPolygon[]>();
  const roadPolygons: Array<{ polygon: CityFeature["polygons"][number]; kind: string }> = [];
  for (const feature of features) {
    if (feature.layer !== "surface" || (feature.kind !== "road_major" && feature.kind !== "road_minor")) continue;
    for (const polygon of feature.polygons) {
      roadPolygons.push({ polygon, kind: feature.kind });
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of polygon.outer) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const entry: RoadPolygon = { outer: polygon.outer, holes: polygon.holes, minX, maxX, minZ, maxZ };
      for (let cx = Math.floor(minX / ROAD_CELL); cx <= Math.floor(maxX / ROAD_CELL); cx += 1) {
        for (let cz = Math.floor(minZ / ROAD_CELL); cz <= Math.floor(maxZ / ROAD_CELL); cz += 1) {
          const key = `${cx}:${cz}`;
          const list = roadGrid.get(key);
          if (list) list.push(entry);
          else roadGrid.set(key, [entry]);
        }
      }
    }
  }
  const onRoad = (x: number, z: number): boolean => {
    for (const road of roadGrid.get(`${Math.floor(x / ROAD_CELL)}:${Math.floor(z / ROAD_CELL)}`) ?? []) {
      if (x < road.minX || x > road.maxX || z < road.minZ || z > road.maxZ) continue;
      if (!pointInRing([x, z], road.outer)) continue;
      if (road.holes.some((hole) => pointInRing([x, z], hole))) continue;
      return true;
    }
    return false;
  };
  /** ¿Es esta arista orilla de calzada? Calzada a un lado y nada al otro (se prueba cada pocos metros). */
  const isKerb = (ax: number, az: number, bx: number, bz: number): boolean => {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.2) return false;
    const nx = (bz - az) / length;
    const nz = -(bx - ax) / length;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    return onRoad(x + nx * 0.4, z + nz * 0.4) !== onRoad(x - nx * 0.4, z - nz * 0.4);
  };
  const PIECE_M = 10;
  for (const { polygon } of roadPolygons) {
    const rings: Array<[Array<[number, number]>, number[] | undefined]> = [[polygon.outer, polygon.outerBorder]];
    polygon.holes.forEach((hole, index) => rings.push([hole, polygon.holesBorder?.[index]]));
    for (const [ring, flags] of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (!a || !b || isTileCut(flags, i)) continue;
        // Una arista larga se recorre a trozos: puede ser orilla en un tramo y empalme con otra calle en el siguiente.
        const pieces = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / PIECE_M));
        for (let k = 0; k < pieces; k += 1) {
          const ax = a[0] + ((b[0] - a[0]) * k) / pieces;
          const az = a[1] + ((b[1] - a[1]) * k) / pieces;
          const bx = a[0] + ((b[0] - a[0]) * (k + 1)) / pieces;
          const bz = a[1] + ((b[1] - a[1]) * (k + 1)) / pieces;
          if (!isKerb(ax, az, bx, bz)) {
            skippedSeams += 1;
            continue;
          }
          if (strip(curbs, ax, az, bx, bz, CURB_WIDTH, CURB_COLOR)) curbSegments += 1;
        }
      }
    }
  }

  // Calles que cuentan para los cruces: tramos con su media calzada.
  const streets = features.filter((f) => f.layer === "streets" && (f.kind === "major" || f.kind === "minor"));
  const CELL = 40;
  const grid = new Map<string, Segment[]>();
  for (const street of streets) {
    const half = HALF_WIDTH[street.kind] ?? 3;
    const rank = street.kind === "major" ? 2 : 1;
    for (const line of street.lines) {
      for (let i = 0; i < line.length - 1; i += 1) {
        const a = line[i];
        const b = line[i + 1];
        if (!a || !b) continue;
        const segment: Segment = { ax: a[0], az: a[1], bx: b[0], bz: b[1], half, rank };
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CELL));
        const seen = new Set<string>();
        for (let s = 0; s <= steps; s += 1) {
          const t = s / steps;
          const key = `${Math.floor((a[0] + (b[0] - a[0]) * t) / CELL)}:${Math.floor((a[1] + (b[1] - a[1]) * t) / CELL)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const list = grid.get(key);
          if (list) list.push(segment);
          else grid.set(key, [segment]);
        }
      }
    }
  }
  /** ¿Está (x, z) en la calzada de otra calle que cruza con rumbo (dx, dz)? */
  const crossed = (x: number, z: number, dx: number, dz: number, rank: number): boolean => {
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const list = grid.get(`${Math.floor(x / CELL) + ox}:${Math.floor(z / CELL) + oz}`);
        if (!list) continue;
        for (const s of list) {
          if (s.rank < rank) continue;
          const sx = s.bx - s.ax;
          const sz = s.bz - s.az;
          const sl = Math.hypot(sx, sz);
          if (sl < 0.01) continue;
          const t = Math.min(1, Math.max(0, ((x - s.ax) * sx + (z - s.az) * sz) / (sl * sl)));
          const d = Math.hypot(x - (s.ax + sx * t), z - (s.az + sz * t));
          if (d > s.half + 2.5) continue;
          // Misma calle (casi paralela): no cuenta como cruce.
          const cos = Math.abs((sx * dx + sz * dz) / (sl * Math.hypot(dx, dz) || 1));
          if (cos < 0.9) return true;
        }
      }
    }
    return false;
  };

  const dashes = new MeshBuilder();
  let dashCount = 0;
  let skipped = 0;
  const period = DASH_LENGTH + DASH_GAP;
  for (const street of streets) {
    if (street.kind !== "major") continue;
    for (const line of street.lines) {
      let carry = 0; // metros recorridos dentro del periodo de la línea
      for (let i = 0; i < line.length - 1; i += 1) {
        const a = line[i];
        const b = line[i + 1];
        if (!a || !b) continue;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.01) continue;
        const ux = (b[0] - a[0]) / length;
        const uz = (b[1] - a[1]) / length;
        let at = 0;
        while (at < length) {
          const phase = carry % period;
          const painting = phase < DASH_LENGTH;
          // Mínimo de 0,1 mm: con el resto de coma flotante `at` podría no avanzar nunca.
          const run = Math.max(1e-4, Math.min((painting ? DASH_LENGTH : period) - phase, length - at));
          if (painting) {
            const mx = a[0] + ux * (at + run / 2);
            const mz = a[1] + uz * (at + run / 2);
            if (crossed(mx, mz, ux, uz, 2)) skipped += 1;
            else if (strip(dashes, a[0] + ux * at, a[1] + uz * at, a[0] + ux * (at + run), a[1] + uz * (at + run), 0.2, DASH_COLOR)) dashCount += 1;
          }
          at += run;
          carry += run;
        }
      }
    }
  }

  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  for (const [name, builder] of [["bordillos", curbs], ["lineas", dashes]] as const) {
    if (builder.isEmpty) continue;
    const geometry = builder.build();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = 16;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.push(geometry);
    triangles += builder.triangleCount;
  }
  return { group, materials: [material], geometries, stats: { curbSegments, dashes: dashCount, skippedAtJunctions: skipped, skippedSeams, triangles } };
}
