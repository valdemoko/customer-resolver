/**
 * Alcazaba y castillo de Gibralfaro (B.4): geometría COMPUESTA a partir de OSM.
 *
 * QUÉ ES FIEL Y QUÉ NO. La PLANTA es la de OpenStreetMap: los dos recintos
 * amurallados (`barrier=city_wall`), las torres con nombre, las puertas y los
 * edificios del interior, más la coracha que sube hacia Gibralfaro (dos lienzos
 * paralelos). Las ALTURAS no vienen en los datos y ninguna fuente técnica
 * consultada las publica: son estimaciones declaradas en la configuración
 * (`fortresses[].heightSource`), por eso el conjunto se marca como «simplificado».
 * Las almenas son un detalle genérico (la Alcazaba las tiene), sin reproducir
 * ninguna forma concreta.
 *
 * Cada fortaleza es UN solo elemento seleccionable (un solo `bid`), con tono
 * propio.
 */

import type { CityFeature, Polymesh } from "./tiles";
import type { Ring } from "./polygon";
import { convexHull, ensureCounterClockwise, pointInRing, ringCentroid } from "./polygon";
import { hexToNumber, shade } from "./palette";

export type FortressConfig = {
  id: string;
  name: string;
  parts: string[];
  enclosureOsmId: string;
  wallHeightM: { outer: number; inner: number };
  towerHeightM: number;
  keepOsmId: string | null;
  keepHeightM: number;
  gateHeightM: number;
  heightSource: string;
  fidelity: "simplified" | "detailed";
};

export type FortressItem = {
  /** Anillo de la pieza (muro, torre, puerta o edificio interior). */
  outer: Ring;
  holes: Ring[];
  height: number;
  wall: number;
  roof: number;
  kind: "wall" | "tower" | "gate" | "keep" | "building";
  /** Almenas sobre la coronación (solo muros y torres). */
  merlons: boolean;
  /** Eje del muro (a, b) y grosor, para colocar las almenas en sus dos bordes. */
  segment?: { a: [number, number]; b: [number, number]; thickness: number };
};

/** Un tramo de muralla de ≈ 30 m: una unidad publicitaria con identificador propio. */
export type WallUnit = {
  /** `w:gibralfaro:07` */
  id: string;
  name: string;
  /** Conjunto al que pertenece (`alcazaba` incluye la coracha). */
  group: string;
  items: FortressItem[];
  /** Eje del tramo (polilínea), en metros. */
  lines: Ring[];
  /** Casco convexo de las cintas: sirve de huella para contorno y selección. */
  footprint: Ring;
  centroid: [number, number];
  radiusM: number;
  heightM: number;
  lengthM: number;
  osmId: string;
};

export type FortressPlan = {
  config: FortressConfig;
  /** Huella de todo el conjunto, para el contorno y el centro de la selección. */
  enclosure: Ring;
  centroid: [number, number];
  radiusM: number;
  items: FortressItem[];
  /** Tramos de muralla (cada uno, una unidad comprable). */
  wallUnits: WallUnit[];
  /** OSM ids de edificios absorbidos por la fortaleza (no se dibujan aparte). */
  memberOsmIds: Set<string>;
  counts: { walls: number; towers: number; gates: number; buildings: number; wallLengthM: number };
};

const WALL_THICKNESS = { outer: 2.2, inner: 2.8 };

function segmentQuad(a: [number, number], b: [number, number], width: number): Ring | null {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.3) return null;
  const nx = (-dz / length) * (width / 2);
  const nz = (dx / length) * (width / 2);
  return ensureCounterClockwise([
    [a[0] + nx, a[1] + nz],
    [b[0] + nx, b[1] + nz],
    [b[0] - nx, b[1] - nz],
    [a[0] - nx, a[1] - nz],
  ]);
}

export function planFortresses(
  features: CityFeature[],
  configs: FortressConfig[],
  fortressWall: number,
): FortressPlan[] {
  const fortressFeatures = features.filter((f) => f.layer === "fortress");
  const buildings = features.filter((f) => f.layer === "buildings");
  const plans: FortressPlan[] = [];

  for (const config of configs) {
    const enclosureFeature = fortressFeatures.find(
      (f) => f.kind === "enclosure" && f.osmId === config.enclosureOsmId,
    );
    const enclosure = enclosureFeature?.polygons[0]?.outer;
    if (!enclosure) continue;

    const keepFeature = config.keepOsmId
      ? buildings.find((f) => f.osmId === config.keepOsmId) ??
        fortressFeatures.find((f) => f.osmId === config.keepOsmId)
      : null;
    const keepCentre = keepFeature?.polygons[0] ? ringCentroid(keepFeature.polygons[0].outer) : null;

    const toneWall = hexToNumber("#d8bf92");
    const toneRoof = hexToNumber("#c9ac7c");
    const items: FortressItem[] = [];
    const memberOsmIds = new Set<string>();
    const counts = { walls: 0, towers: 0, gates: 0, buildings: 0, wallLengthM: 0 };

    // 1. Torres y puertas cartografiadas en la capa `fortress`.
    for (const feature of fortressFeatures) {
      if (!config.parts.includes(String(feature.props.part ?? ""))) continue;
      if (feature.kind !== "tower" && feature.kind !== "gate") continue;
      const polygon = feature.polygons[0];
      if (!polygon) continue;
      memberOsmIds.add(feature.osmId);
      const isKeep = Boolean(config.keepOsmId) && feature.osmId === config.keepOsmId;
      const height = isKeep ? config.keepHeightM : feature.kind === "gate" ? config.gateHeightM : config.towerHeightM;
      items.push({
        outer: polygon.outer,
        holes: polygon.holes,
        height,
        wall: shade(toneWall, isKeep ? 0.04 : 0),
        roof: toneRoof,
        kind: isKeep ? "keep" : feature.kind === "gate" ? "gate" : "tower",
        merlons: feature.kind === "tower",
      });
      counts[feature.kind === "gate" ? "gates" : "towers"] += 1;
    }

    // 2. Muros: el pipeline ya los entrega en TRAMOS de ≈ 30 m con identificador
    //    (`props.unit`). Cada tramo es una unidad: cintas con grosor, de altura
    //    exterior o interior según su distancia a la torre del Homenaje.
    const unitMap = new Map<string, WallUnit>();
    for (const feature of fortressFeatures) {
      if (feature.kind !== "wall" || !config.parts.includes(String(feature.props.part ?? ""))) continue;
      const unitId = String(feature.props.unit ?? "");
      if (!unitId) continue;
      let unit = unitMap.get(unitId);
      if (!unit) {
        unit = {
          id: unitId,
          name: "",
          group: config.id,
          items: [],
          lines: [],
          footprint: [],
          centroid: [0, 0],
          radiusM: 0,
          heightM: 0,
          lengthM: 0,
          osmId: feature.osmId,
        };
        unitMap.set(unitId, unit);
      }
      for (const line of feature.lines) {
        unit.lines.push(line);
        for (let index = 0; index < line.length - 1; index += 1) {
          const a = line[index];
          const b = line[index + 1];
          if (!a || !b) continue;
          const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const inner = keepCentre ? Math.hypot(mid[0] - keepCentre[0], mid[1] - keepCentre[1]) < 75 : false;
          const quad = segmentQuad(a, b, inner ? WALL_THICKNESS.inner : WALL_THICKNESS.outer);
          if (!quad) continue;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          unit.lengthM += length;
          counts.wallLengthM += length;
          unit.heightM = Math.max(unit.heightM, inner ? config.wallHeightM.inner : config.wallHeightM.outer);
          unit.items.push({
            outer: quad,
            holes: [],
            height: inner ? config.wallHeightM.inner : config.wallHeightM.outer,
            wall: shade(toneWall, inner ? 0.02 : -0.03),
            roof: shade(toneRoof, -0.05),
            kind: "wall",
            merlons: true,
            segment: { a, b, thickness: inner ? WALL_THICKNESS.inner : WALL_THICKNESS.outer },
          });
        }
      }
    }
    const wallUnits = [...unitMap.values()]
      .filter((unit) => unit.items.length > 0)
      .sort((x, y) => x.id.localeCompare(y.id));
    for (const unit of wallUnits) {
      const points: Ring = unit.items.flatMap((item) => item.outer);
      unit.footprint = ensureCounterClockwise(convexHull(points));
      unit.centroid = ringCentroid(unit.footprint);
      unit.radiusM = unit.footprint.reduce(
        (max, p) => Math.max(max, Math.hypot(p[0] - unit.centroid[0], p[1] - unit.centroid[1])),
        0,
      );
      unit.name = `Muralla de ${config.id === "gibralfaro" ? "Gibralfaro" : "la Alcazaba"} · tramo ${unit.id.split(":")[2] ?? ""}`;
    }
    counts.walls = wallUnits.length;

    // 3. Edificios del interior del recinto (palacios, puertas, almacenes…).
    for (const building of buildings) {
      const polygon = building.polygons[0];
      if (!polygon || memberOsmIds.has(building.osmId)) continue;
      const centre = ringCentroid(polygon.outer);
      if (!pointInRing(centre, enclosure)) continue;
      memberOsmIds.add(building.osmId);
      // Sin altura de fuente, un edificio interior no pasa de 6 m (estimación).
      const known = building.heightSource !== "default_estimate";
      items.push({
        outer: polygon.outer,
        holes: polygon.holes,
        height: known ? Math.min(building.heightM, 14) : 6,
        wall: shade(toneWall, 0.05),
        roof: toneRoof,
        kind: "building",
        merlons: false,
      });
      counts.buildings += 1;
    }

    let radius = 0;
    const centroid = ringCentroid(enclosure);
    for (const point of enclosure) radius = Math.max(radius, Math.hypot(point[0] - centroid[0], point[1] - centroid[1]));
    plans.push({ config, enclosure, centroid, radiusM: radius, items, wallUnits, memberOsmIds, counts });
  }
  // `fortressWall` se reserva para escalar la altura de coronación en pruebas.
  void fortressWall;
  return plans;
}

/** Posiciones de las almenas a lo largo de un anillo cerrado (torres). */
export function merlonCells(ring: Ring, spacingM = 3.0, sizeM = 1.05): Ring[] {
  const cells: Ring[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < spacingM) continue;
    const count = Math.max(1, Math.floor(length / spacingM));
    const dx = (b[0] - a[0]) / length;
    const dz = (b[1] - a[1]) / length;
    for (let k = 0; k < count; k += 1) {
      const t = ((k + 0.5) / count) * length;
      const cx = a[0] + dx * t;
      const cz = a[1] + dz * t;
      const h = sizeM / 2;
      cells.push([
        [cx - h, cz - h],
        [cx + h, cz - h],
        [cx + h, cz + h],
        [cx - h, cz + h],
      ]);
    }
  }
  return cells;
}

/** Almenas de un muro: dos hileras, una por borde, a lo largo de su eje. */
export function wallMerlons(
  segment: { a: [number, number]; b: [number, number]; thickness: number },
  spacingM = 3.2,
  sizeM = 1.0,
): Ring[] {
  const { a, b, thickness } = segment;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < spacingM) return [];
  const dx = (b[0] - a[0]) / length;
  const dz = (b[1] - a[1]) / length;
  const count = Math.floor(length / spacingM);
  const offset = Math.max(0, thickness / 2 - sizeM / 2);
  const h = sizeM / 2;
  const cells: Ring[] = [];
  for (let k = 0; k < count; k += 1) {
    const t = ((k + 0.5) / count) * length;
    for (const side of [-1, 1]) {
      const cx = a[0] + dx * t + -dz * offset * side;
      const cz = a[1] + dz * t + dx * offset * side;
      cells.push([
        [cx - h, cz - h],
        [cx + h, cz - h],
        [cx + h, cz + h],
        [cx - h, cz + h],
      ]);
    }
  }
  return cells;
}

export type { Polymesh };
