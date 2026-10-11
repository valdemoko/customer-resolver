/**
 * Los edificios de la ciudad (B.4).
 *
 * El suelo (`ground.ts`), el agua (`water.ts`), las fortalezas (`fortress.ts`),
 * las parcelas (`parcels.ts`) y los barcos (`ships.ts`) viven en sus módulos.
 * Aquí quedan los volúmenes, que son lo único que se SELECCIONA como edificio.
 *
 * CADA EDIFICIO ES UNA ENTIDAD INDIVIDUAL aunque la malla esté fusionada: la
 * geometría se agrupa por ZONA (cuadrícula de `zoneSizeM`) para poder descartar
 * lo que no se ve, y cada vértice lleva `bid`, el índice de su edificio. Con
 * `bid` el hover y la selección resaltan un solo edificio con un uniforme, sin
 * tocar la geometría.
 *
 * EXAGERACIÓN VERTICAL (B.4). Los edificios se dibujan con una escala vertical
 * uniforme y configurable (`exaggeration`, 1,25 de inicio). Es una escala
 * VISUAL: `BuildingRecord.heightM` conserva la altura real del dato y su origen
 * (es la que enseña la ficha) y `renderHeightM` la altura dibujada. Los
 * emblemáticos llevan el mismo factor para conservar las proporciones.
 */

import * as THREE from "three";
import type { CityFeature, Polymesh } from "./tiles";
import type { Ring } from "./polygon";
import { dedupeRing, polygonArea, ringCentroid } from "./polygon";
import { MeshBuilder } from "./mesh";
import { buildingColors, hashString, hexToNumber, shade } from "./palette";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";
import type { LandmarkConfig } from "@/lib/cities/schema";
import { merlonCells, planFortresses, wallMerlons } from "./fortress";
import type { FortressConfig, FortressPlan } from "./fortress";

/** Altura de las almenas sobre la coronación, en metros reales (antes del factor). */
const MERLON_HEIGHT_M = 1.0;
/** Altura de apoyo del patio de las fortalezas (sobre las clases de suelo). */
const PATIO_Y = 0.3;

export type BuildingRecord = {
  /** Identificador estable: el de OSM, o una clave determinista si falta. */
  id: string;
  /** Índice numérico en la malla (atributo `bid`). */
  index: number;
  osmId: string;
  name: string;
  /** Altura REAL del dato (la que muestra la ficha). */
  heightM: number;
  /** Altura DIBUJADA: `heightM` × exageración vertical. */
  renderHeightM: number;
  heightSource: string;
  kind: string;
  levels: number;
  areaM2: number;
  catastroRef: string;
  landmark: boolean;
  /** Clave del emblemático en la configuración (`catedral`…), si lo es. */
  landmarkId: string | null;
  /** Identificador de la fortaleza (`alcazaba`, `gibralfaro`) si es una. */
  fortressId: string | null;
  /** Color de fachada determinista por hash del id, en hex. */
  wallHex: string;
  centroid: [number, number];
  /** Huella recortada, en metros: para el contorno y para despejar árboles. */
  footprint: Ring;
  /** Radio que encierra la huella desde el centroide, en metros. */
  radiusM: number;
};

export type LandmarkSlot = { config: LandmarkConfig; record: BuildingRecord };

export type CityMeshes = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  /** Malla invisible para lanzar rayos (con BVH). No se añade a la escena. */
  pickMesh: THREE.Mesh | null;
  pickIds: string[];
  pickGeometry: THREE.BufferGeometry | null;
  buildingsById: Map<string, BuildingRecord>;
  buildingsByIndex: BuildingRecord[];
  landmarkSlots: LandmarkSlot[];
  fortresses: FortressPlan[];
  /** Material de los edificios, para reutilizarlo en los modelos GLB. */
  buildingMaterial: THREE.MeshLambertMaterial;
  stats: {
    buildings: number;
    buildingsEstimated: number;
    landmarks: number;
    fortresses: number;
    triangles: number;
    drawCalls: number;
    zones: number;
  };
};

export type BuildOptions = {
  features: CityFeature[];
  uniforms: SceneUniforms;
  landmarks: LandmarkConfig[];
  fortresses: FortressConfig[];
  /** Exageración vertical uniforme (1 = alturas reales). */
  exaggeration: number;
  /** Alturas dibujadas fijadas por producto, por identificador OSM. */
  heightOverrides?: Array<{ osmId: string; name?: string | undefined; heightM: number }> | undefined;
  /** Edificios (id de OSM) cuyo patio interior se cierra con tejado aunque sea grande. */
  closedCourtyards?: string[] | undefined;
  zoneSizeM?: number;
  /** Área mínima de un edificio, en m²: por debajo es ruido del teselado. */
  minBuildingAreaM2?: number;
};

type Prepared = {
  key: string;
  outer: Ring;
  holes: Ring[];
  /** Altura REAL; el factor se aplica al construir la malla. */
  height: number;
  wall: number;
  roof: number;
  skipVolume: boolean;
  merlons?: Ring[];
};

function byLayer(features: CityFeature[], layer: CityFeature["layer"]): CityFeature[] {
  return features.filter((feature) => feature.layer === layer);
}

/** Área mínima (m²) de un hueco interior para dejarlo abierto. */
const MIN_OPEN_COURTYARD_M2 = 1200;

/** Recorta un polígono con sus huecos, limpiando vértices repetidos. */
function cleanPolygon(polygon: Polymesh, closeCourtyards = false): Polymesh | null {
  if (polygon.outer.length < 3) return null;
  const outer = dedupeRing(polygon.outer);
  // Un edificio de la lista `closedCourtyards` no deja ningún patio abierto, por grande que sea.
  const holes = closeCourtyards ? [] : polygon.holes
    // Solo se conservan los huecos grandes (el ruedo de una plaza de toros, un patio
    // de manzana enorme): los patios pequeños se rellenan, porque desde la vista
    // aérea se leían como agujeros en el edificio.
    .filter((hole) => hole.length >= 3 && polygonArea(hole) > MIN_OPEN_COURTYARD_M2)
    .map((hole) => dedupeRing(hole));
  return { outer, holes };
}

export function buildCity(options: BuildOptions): CityMeshes {
  const { features, uniforms, landmarks, exaggeration } = options;
  const k = exaggeration;
  const minBuildingAreaM2 = options.minBuildingAreaM2 ?? 4;
  const zoneSizeM = options.zoneSizeM ?? 520;

  const group = new THREE.Group();
  group.name = "ciudad";
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(buildingMaterial, uniforms, { key: "building", buildingId: true });
  const patioMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(patioMaterial, uniforms, { key: "patio" });
  materials.push(buildingMaterial, patioMaterial);

  const addMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    flags: { cast?: boolean; receive?: boolean; order?: number } = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = flags.cast ?? false;
    mesh.receiveShadow = flags.receive ?? true;
    if (flags.order !== undefined) mesh.renderOrder = flags.order;
    group.add(mesh);
    geometries.push(geometry);
    return mesh;
  };

  const landmarkByOsmId = new Map(landmarks.map((config) => [config.osmId, config]));
  const buildingsById = new Map<string, BuildingRecord>();
  const buildingsByIndex: BuildingRecord[] = [];
  const buildingIndex = new Map<string, number>();
  const prepared: Prepared[] = [];
  const landmarkSlots: LandmarkSlot[] = [];
  let buildingsEstimated = 0;
  let landmarkCount = 0;

  /* ------------------------------------------------------------ fortalezas */
  // Primero: sus edificios interiores se descuentan de la lista general y pasan a
  // ser UN solo elemento seleccionable por fortaleza.
  const fortresses = planFortresses(features, options.fortresses, k);
  const absorbed = new Set<string>();
  const patioBuilder = new MeshBuilder();
  for (const plan of fortresses) {
    for (const id of plan.memberOsmIds) absorbed.add(id);
    const { config } = plan;
    const height = plan.items.reduce((max, item) => Math.max(max, item.height), 0);
    const index = buildingsByIndex.length;
    const record: BuildingRecord = {
      id: config.id,
      index,
      osmId: config.enclosureOsmId,
      name: config.name,
      heightM: height,
      renderHeightM: height * k,
      heightSource: "fortress_estimate",
      kind: "fortress",
      levels: 0,
      areaM2: Math.round(polygonArea(plan.enclosure)),
      catastroRef: "",
      landmark: true,
      landmarkId: config.id,
      fortressId: config.id,
      wallHex: "#d8bf92",
      centroid: plan.centroid,
      footprint: plan.enclosure,
      radiusM: plan.radiusM,
    };
    buildingsById.set(config.id, record);
    buildingsByIndex.push(record);
    buildingIndex.set(config.id, index);
    landmarkCount += 1;
    for (const item of plan.items) {
      const merlons: Ring[] = [];
      if (item.merlons) {
        if (item.segment) merlons.push(...wallMerlons(item.segment));
        else merlons.push(...merlonCells(item.outer));
      }
      prepared.push({
        key: config.id,
        outer: item.outer,
        holes: item.holes,
        height: item.height,
        wall: item.wall,
        roof: item.roof,
        skipVolume: false,
        merlons,
      });
    }
    // Cada tramo de muralla es una entidad propia (hover, selección y compra).
    for (const wall of plan.wallUnits) {
      const wallIndex = buildingsByIndex.length;
      const wallRecord: BuildingRecord = {
        id: wall.id,
        index: wallIndex,
        osmId: wall.osmId,
        name: wall.name,
        heightM: wall.heightM,
        renderHeightM: wall.heightM * k,
        heightSource: "fortress_estimate",
        kind: "wall",
        levels: 0,
        areaM2: Math.round(wall.lengthM * 2.5),
        catastroRef: "",
        landmark: false,
        landmarkId: null,
        fortressId: config.id,
        wallHex: "#d8bf92",
        centroid: wall.centroid,
        footprint: wall.footprint,
        radiusM: wall.radiusM,
      };
      buildingsById.set(wall.id, wallRecord);
      buildingsByIndex.push(wallRecord);
      buildingIndex.set(wall.id, wallIndex);
      for (const item of wall.items) {
        const merlons: Ring[] = item.segment ? wallMerlons(item.segment) : [];
        prepared.push({
          key: wall.id,
          outer: item.outer,
          holes: item.holes,
          height: item.height,
          wall: item.wall,
          roof: item.roof,
          skipVolume: false,
          merlons,
        });
      }
    }
    patioBuilder.addPolygon({ outer: plan.enclosure, holes: [] }, PATIO_Y, hexToNumber("#d9c9a3"));
  }

  /* ------------------------------------------------------------ edificios */
  const closedCourtyards = new Set(options.closedCourtyards ?? []);
  for (const feature of byLayer(features, "buildings")) {
    if (absorbed.has(feature.osmId)) continue;
    for (const raw of feature.polygons) {
      const polygon = cleanPolygon(raw, closedCourtyards.has(feature.osmId));
      if (!polygon) continue;
      const area = polygonArea(polygon.outer);
      if (area < minBuildingAreaM2) continue;

      // Una sola clave por edificio, la MISMA para el color, la ficha, el
      // resaltado y la selección.
      const key =
        feature.osmId ||
        `${feature.tile}:${feature.name}:${Math.round(area)}:${Math.round(feature.heightM)}`;
      if (buildingsById.has(key)) {
        const existing = prepared.find((item) => item.key === key);
        if (existing && !existing.skipVolume) {
          prepared.push({ ...existing, outer: polygon.outer, holes: polygon.holes });
        }
        continue;
      }

      const landmarkConfig = landmarkByOsmId.get(feature.osmId);
      const colors = buildingColors({
        osmId: key,
        kind: feature.kind,
        heightM: feature.heightM,
        name: landmarkConfig?.name ?? "",
        heightSource: feature.heightSource,
      });
      if (feature.heightSource === "default_estimate" && !landmarkConfig) buildingsEstimated += 1;
      if (landmarkConfig) landmarkCount += 1;

      const verified = landmarkConfig?.heightM ?? null;
      const override = options.heightOverrides?.find((entry) => entry.osmId === feature.osmId) ?? null;
      const height = Math.max(3, verified ?? override?.heightM ?? feature.heightM);
      const wallTone = shade(colors.wall, ((hashString(key) % 7) - 3) * 0.012);
      const centroid = ringCentroid(polygon.outer);
      let radius = 0;
      for (const point of polygon.outer) {
        radius = Math.max(radius, Math.hypot(point[0] - centroid[0], point[1] - centroid[1]));
      }

      const index = buildingsByIndex.length;
      const record: BuildingRecord = {
        id: key,
        index,
        osmId: feature.osmId,
        name: landmarkConfig?.name ?? override?.name ?? feature.name,
        heightM: height,
        renderHeightM: height * k,
        heightSource: landmarkConfig && verified !== null ? "landmark_reference" : override ? "visual_override" : feature.heightSource,
        kind: feature.kind,
        levels: feature.levels,
        areaM2: Math.round(area),
        catastroRef: feature.catastroRef,
        landmark: Boolean(landmarkConfig),
        landmarkId: landmarkConfig?.id ?? null,
        fortressId: null,
        wallHex: `#${wallTone.toString(16).padStart(6, "0")}`,
        centroid,
        footprint: polygon.outer,
        radiusM: radius,
      };
      buildingsById.set(key, record);
      buildingsByIndex.push(record);
      buildingIndex.set(key, index);

      const hasModel = Boolean(landmarkConfig?.modelUrl);
      if (landmarkConfig) landmarkSlots.push({ config: landmarkConfig, record });
      prepared.push({
        key,
        outer: polygon.outer,
        holes: polygon.holes,
        height,
        wall: wallTone,
        roof: colors.roof,
        skipVolume: hasModel,
      });
    }
  }

  /* --------------------------------------------- mallas por zona y selección */
  const zoneBuilders = new Map<string, MeshBuilder>();
  const pickBuilder = new MeshBuilder();
  for (const item of prepared) {
    const record = buildingsById.get(item.key);
    if (!record) continue;
    const top = item.height * k;
    if (!item.skipVolume) {
      pickBuilder.addWalls(item.outer, 0, top, 0xffffff, item.key);
      const centre = ringCentroid(item.outer);
      const zoneKey = `${Math.floor(centre[0] / zoneSizeM)}:${Math.floor(centre[1] / zoneSizeM)}`;
      let builder = zoneBuilders.get(zoneKey);
      if (!builder) {
        builder = new MeshBuilder();
        zoneBuilders.set(zoneKey, builder);
      }
      builder.addWalls(item.outer, 0, top, item.wall, item.key);
      // PATIOS: los huecos del tejado (patios interiores) necesitan SUS paredes,
      // orientadas hacia el patio. Sin ellas, desde fuera se veía el interior del
      // edificio a través del hueco (caras traseras descartadas): el defecto de
      // «edificios con huecos arriba». El anillo se invierte para que las caras
      // miren al interior del hueco.
      for (const hole of item.holes) {
        const inward = hole.slice().reverse();
        builder.addWalls(inward, 0, top, item.wall, item.key);
        pickBuilder.addWalls(inward, 0, top, 0xffffff, item.key);
      }
      // Tejado: se triangula una vez y va a la malla visible y a la de selección.
      builder.addPolygonShared({ outer: item.outer, holes: item.holes }, top, item.roof, item.key, [pickBuilder]);
      for (const cell of item.merlons ?? []) {
        builder.addWalls(cell, top, top + MERLON_HEIGHT_M * k, item.wall, item.key);
        builder.addPolygon({ outer: cell, holes: [] }, top + MERLON_HEIGHT_M * k, item.roof, item.key);
      }
    }
    // Malla de selección: prisma con tapa, idéntico al volumen real (paredes y
    // tejado ya añadidos arriba). Con modelo propio (catedral) no hay prisma: el
    // motor añade a la malla de selección los triángulos del propio modelo, para
    // que se pinche lo que se ve.
  }

  for (const [zoneKey, builder] of zoneBuilders) {
    if (builder.isEmpty) continue;
    addMesh(`edificios ${zoneKey}`, builder.build({ buildingIndex }), buildingMaterial, {
      cast: true,
      receive: true,
    });
  }
  if (!patioBuilder.isEmpty) {
    addMesh("patios", patioBuilder.build(), patioMaterial, { receive: true, order: 17 });
  }

  const pickGeometry = pickBuilder.isEmpty
    ? null
    : pickBuilder.build({ withColor: false, withNormals: false });
  const pickMesh =
    pickGeometry === null
      ? null
      : new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  if (pickMesh) {
    pickMesh.name = "seleccion";
    pickMesh.updateMatrixWorld(true);
  }

  let triangles = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    triangles += index ? index.count / 3 : position ? position.count / 3 : 0;
  }

  return {
    group,
    materials,
    geometries,
    pickMesh,
    pickIds: pickBuilder.pickIds(),
    pickGeometry,
    buildingsById,
    buildingsByIndex,
    landmarkSlots,
    fortresses,
    buildingMaterial,
    stats: {
      buildings: buildingsById.size,
      buildingsEstimated,
      landmarks: landmarkCount,
      fortresses: fortresses.length,
      triangles: Math.round(triangles),
      drawCalls: group.children.length,
      zones: zoneBuilders.size,
    },
  };
}
