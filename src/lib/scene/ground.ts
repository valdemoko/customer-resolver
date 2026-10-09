/**
 * Suelo de la ciudad (B.4): tierra base y clases de superficie DISJUNTAS.
 *
 * POR QUÉ NO HAY Z-FIGHTING AQUÍ. La causa del parpadeo de la B.3 estaba en los
 * datos: polígonos de suelo, verde, calles y plazas que se SOLAPABAN en el mismo
 * plano con colores distintos. El pipeline (paso 03c) ya los ha recortado entre
 * sí con diferencias booleanas, así que este módulo recibe clases que no se pisan
 * y no tiene que resolver nada: dibuja cada clase UNA vez.
 *
 * Las capas, además, están separadas en altura y ordenadas de forma explícita
 * (`SURFACE_LAYERS`): la clase de más prioridad es la más alta y se dibuja la
 * última (`renderOrder`), y el resto de solape —un resto numérico de <0,001 %—
 * se resuelve siempre a favor de la clase correcta. Ni `polygonOffset` ni búfer
 * logarítmico hacen falta: se mide en docs/performance.md.
 */

import * as THREE from "three";
import type { CityFeature } from "./tiles";
import { MeshBuilder } from "./mesh";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";
import {
  GREEN_COLORS,
  LANDUSE_COLORS,
  SURFACE_COLORS,
  SURFACE_LAYERS,
  hashString,
  hexToNumber,
} from "./palette";

export type GroundMeshes = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  stats: { classes: number; polygons: number; triangles: number; drawCalls: number };
  /** Polígonos de playa, para colorear la orilla del agua como arena. */
  beachRings: Array<Array<[number, number]>>;
};

function colorFor(feature: CityFeature): { kind: string; color: number } {
  const kind = feature.kind;
  const sub = String(feature.props.subkind ?? "");
  if (kind === "green") {
    const base = GREEN_COLORS[sub] ?? GREEN_COLORS.park ?? "#7fae5f";
    // Variación determinista por nombre: parques vecinos no se pegan.
    const tint = ((hashString(feature.name || feature.osmId || sub) % 5) - 2) * 0.018;
    return { kind: "green", color: tintHex(base, tint) };
  }
  if (kind === "landuse") {
    return { kind: "landuse", color: hexToNumber(LANDUSE_COLORS[sub] ?? "#ded5c3") };
  }
  return { kind, color: hexToNumber(SURFACE_COLORS[kind] ?? "#d8d0bf") };
}

function tintHex(hex: string, amount: number): number {
  const value = hexToNumber(hex);
  const channel = (shift: number) =>
    Math.min(255, Math.max(0, Math.round(((value >> shift) & 0xff) * (1 + amount))));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function buildGround(features: CityFeature[], uniforms: SceneUniforms): GroundMeshes {
  const group = new THREE.Group();
  group.name = "suelo";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(material, uniforms, { key: "ground" });

  const builders = new Map<string, MeshBuilder>();
  const beachRings: Array<Array<[number, number]>> = [];
  let polygons = 0;

  for (const feature of features) {
    if (feature.layer !== "surface" && feature.layer !== "land") continue;
    const { kind, color } = colorFor(feature.layer === "land" ? { ...feature, kind: "land" } : feature);
    const layer = SURFACE_LAYERS[kind];
    if (!layer) continue; // `pontoon` y otras clases flotantes las dibuja otro módulo
    let builder = builders.get(kind);
    if (!builder) {
      builder = new MeshBuilder();
      builders.set(kind, builder);
    }
    for (const polygon of feature.polygons) {
      builder.addPolygon(polygon, layer.y, color);
      polygons += 1;
      if (kind === "beach") beachRings.push(polygon.outer);
    }
  }

  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  for (const [kind, builder] of builders) {
    if (builder.isEmpty) continue;
    const layer = SURFACE_LAYERS[kind];
    if (!layer) continue;
    const geometry = builder.build();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `suelo-${kind}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = layer.order;
    // Sin cálculo de esfera por malla de miles de teselas: una esfera englobante
    // por clase basta para el recorte de cámara.
    group.add(mesh);
    geometries.push(geometry);
    triangles += builder.triangleCount;
  }

  return {
    group,
    materials: [material],
    geometries,
    stats: { classes: builders.size, polygons, triangles, drawCalls: group.children.length },
    beachRings,
  };
}
