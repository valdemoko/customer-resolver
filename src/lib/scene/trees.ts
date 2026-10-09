/**
 * Arbolado: de dónde sale cada árbol, cómo se dibuja y cómo se aligera.
 *
 * TRES ORÍGENES, Y SE DISTINGUEN SIEMPRE:
 *  · `mapeado`: puntos `natural=tree` e hileras `natural=tree_row` de OpenStreetMap.
 *    Alguien los cartografió; están donde están.
 *  · `estimado`: relleno determinista (semilla fija) de parques y jardines y de
 *    las calles con palmeras declaradas en la configuración. No son datos: son
 *    una regla, y el informe lo declara como «estimado». Donde OSM ya tiene
 *    árboles en un parque, no se rellena encima.
 *
 * RENDIMIENTO: una malla instanciada por especie y por nivel de detalle. Cerca
 * se dibuja la silueta completa; lejos, una copa simplificada (el equivalente
 * barato de un «billboard» sin textura). Lo que está detrás de la cámara, fuera
 * del encuadre ampliado o más allá de la distancia máxima no se dibuja, y los
 * árboles pegados al edificio seleccionado se ocultan para no tapar la fachada.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityFeature } from "./tiles";
import type { Ring } from "./polygon";
import { clipRings, polygonArea, pointInRing, seededRandom } from "./polygon";
import { hashString } from "./palette";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";

export const SPECIES = ["palm", "orange", "street", "round", "pine"] as const;
export type Species = (typeof SPECIES)[number];

export type TreeSpot = {
  x: number;
  z: number;
  species: Species;
  scale: number;
  rotation: number;
  /** Variación de verde, 0..1. */
  tint: number;
  estimated: boolean;
};

export type TreePlan = {
  spots: TreeSpot[];
  stats: {
    mapped: number;
    mappedRows: number;
    estimatedParks: number;
    estimatedStreets: number;
    dropped: number;
    bySpecies: Record<Species, number>;
  };
};

/** Altura típica de cada especie, en metros, para convertir `height` en escala. */
const TYPICAL_HEIGHT: Record<Species, number> = {
  palm: 9.5,
  orange: 4.2,
  street: 8,
  round: 8,
  pine: 10,
};

function speciesFromTags(feature: CityFeature, hash: number): Species {
  const genus = feature.genus.toLowerCase();
  if (/phoenix|washingtonia|butia|chamaerops|trachycarpus|syagrus/.test(genus)) return "palm";
  if (/citrus/.test(genus)) return "orange";
  if (/pinus|araucaria|cupressus|cedrus/.test(genus) || feature.leafType === "needleleaved") {
    return "pine";
  }
  // Sin especie (la mayoría en OSM): reparto fijo por hash, con predominio de
  // arbolado de calle y copa redonda, que es lo que hay en el centro de Málaga.
  const roll = (hash % 100) / 100;
  if (roll < 0.1) return "palm";
  if (roll < 0.28) return "orange";
  if (roll < 0.62) return "street";
  if (roll < 0.92) return "round";
  return "pine";
}

function makeSpot(
  x: number,
  z: number,
  species: Species,
  hash: number,
  estimated: boolean,
  heightM = 0,
): TreeSpot {
  const random = seededRandom(hash ^ 0x9e3779b1);
  const base = heightM > 0 ? heightM / TYPICAL_HEIGHT[species] : 0.78 + random() * 0.5;
  return {
    x,
    z,
    species,
    scale: Math.min(1.9, Math.max(0.5, base)),
    rotation: random() * Math.PI * 2,
    tint: random(),
    estimated,
  };
}

/** Puntos a lo largo de una polilínea, cada `stepM`. */
function sampleLine(line: Ring, stepM: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  let carry = 0;
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index];
    const b = line[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const dx = (b[0] - a[0]) / length;
    const dz = (b[1] - a[1]) / length;
    let distance = stepM - carry;
    while (distance <= length) {
      out.push([a[0] + dx * distance, a[1] + dz * distance, dx, dz]);
      distance += stepM;
    }
    carry = length - (distance - stepM);
  }
  return out;
}

export function planTrees(options: {
  features: CityFeature[];
  clip: Ring;
  palmStreets: string[];
  seed: number;
  max: number;
  /**
   * Tramos de fachada con un local (B.4): ningún árbol se planta a menos de 2,8 m
   * de ellos, para que no tapen un escaparate. Los árboles de OSM tampoco: un
   * árbol mapeado delante de un local se retira y se cuenta en `stats.dropped`.
   */
  clearSegments?: Array<{ a: [number, number]; b: [number, number] }>;
}): TreePlan {
  const { features, clip, palmStreets, seed, max } = options;
  const mapped: TreeSpot[] = [];
  const estimated: TreeSpot[] = [];
  const stats: TreePlan["stats"] = {
    mapped: 0,
    mappedRows: 0,
    estimatedParks: 0,
    estimatedStreets: 0,
    dropped: 0,
    bySpecies: { palm: 0, orange: 0, street: 0, round: 0, pine: 0 },
  };

  // Rejilla de ocupación de 6 m: evita dos árboles uno encima de otro, sea cual
  // sea su origen, y permite saber si un parque ya tiene árboles mapeados.
  const CELL = 6;
  const occupied = new Set<string>();
  const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
  // Índice espacial de los tramos con local (celdas de 8 m).
  const CLEAR_M = 2.8;
  const clearCells = new Map<string, Array<{ a: [number, number]; b: [number, number] }>>();
  for (const segment of options.clearSegments ?? []) {
    const x0 = Math.floor((Math.min(segment.a[0], segment.b[0]) - CLEAR_M) / 8);
    const x1 = Math.floor((Math.max(segment.a[0], segment.b[0]) + CLEAR_M) / 8);
    const z0 = Math.floor((Math.min(segment.a[1], segment.b[1]) - CLEAR_M) / 8);
    const z1 = Math.floor((Math.max(segment.a[1], segment.b[1]) + CLEAR_M) / 8);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const key = `${gx}:${gz}`;
        const list = clearCells.get(key);
        if (list) list.push(segment);
        else clearCells.set(key, [segment]);
      }
    }
  }
  const nearShopfront = (x: number, z: number): boolean => {
    const list = clearCells.get(`${Math.floor(x / 8)}:${Math.floor(z / 8)}`);
    if (!list) return false;
    for (const { a, b } of list) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const lengthSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
      if (Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz)) < CLEAR_M) return true;
    }
    return false;
  };
  const free = (x: number, z: number) => !occupied.has(cellKey(x, z)) && !nearShopfront(x, z);
  const claim = (x: number, z: number) => occupied.add(cellKey(x, z));

  const insideClip = (x: number, z: number) => pointInRing([x, z], clip);

  // 1 · Mapeados: puntos.
  for (const feature of features) {
    if (feature.layer !== "trees") continue;
    const hash = hashString(feature.osmId || `${feature.tile}:${feature.points[0]?.[0]}`);
    if (feature.kind === "tree") {
      for (const point of feature.points) {
        if (!insideClip(point[0], point[1]) || !free(point[0], point[1])) continue;
        claim(point[0], point[1]);
        mapped.push(
          makeSpot(point[0], point[1], speciesFromTags(feature, hash), hash, false, feature.heightM),
        );
        stats.mapped += 1;
      }
    }
  }
  // 1b · Mapeados: hileras de árboles (cada 8 m a lo largo de la línea).
  for (const feature of features) {
    if (feature.layer !== "trees" || feature.kind !== "tree_row") continue;
    const hash = hashString(feature.osmId);
    for (const line of feature.lines) {
      for (const [x, z] of sampleLine(line, 8)) {
        if (!insideClip(x, z) || !free(x, z)) continue;
        claim(x, z);
        const spotHash = hash ^ hashString(`${Math.round(x)}:${Math.round(z)}`);
        mapped.push(makeSpot(x, z, speciesFromTags(feature, hash), spotHash, false, feature.heightM));
        stats.mappedRows += 1;
      }
    }
  }

  // 2 · Estimados: parques y jardines sin árboles mapeados suficientes.
  const FILLABLE = new Set([
    "park",
    "garden",
    "wood",
    "forest",
    "grass",
    "nature_reserve",
    "recreation_ground",
    "common",
    "village_green",
  ]);
  for (const feature of features) {
    // B.4: el verde viaja en la capa `surface` (clase `green`, subtipo en `subkind`).
    if (feature.layer !== "surface" || feature.kind !== "green") continue;
    const greenKind = String(feature.props.subkind ?? "");
    if (!FILLABLE.has(greenKind)) continue;
    const isWood = greenKind === "wood" || greenKind === "forest";
    const isGrass = greenKind === "grass";
    for (const ring of clipRings(feature.polygons.map((polygon) => polygon.outer), clip, 60)) {
      const area = polygonArea(ring);
      if (isGrass && area < 400) continue;
      // Densidad: un árbol cada ~120 m² en parque y ~220 en césped.
      const spacing = Math.sqrt(isWood ? 60 : isGrass ? 220 : 120);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      const first = ring[0] ?? [0, 0];
      const polygonHash = hashString(`${greenKind}:${Math.round(first[0])}:${Math.round(first[1])}`) ^ seed;
      const random = seededRandom(polygonHash);
      let placed = 0;
      for (let x = minX + spacing / 2; x < maxX; x += spacing) {
        for (let z = minZ + spacing / 2; z < maxZ; z += spacing) {
          if (placed >= 260) break;
          const px = x + (random() - 0.5) * spacing * 0.8;
          const pz = z + (random() - 0.5) * spacing * 0.8;
          if (!pointInRing([px, pz], ring) || !free(px, pz)) continue;
          claim(px, pz);
          const roll = random();
          const species: Species = isWood
            ? "pine"
            : roll < 0.12
              ? "palm"
              : roll < 0.3
                ? "orange"
                : roll < 0.62
                  ? "street"
                  : roll < 0.92
                    ? "round"
                    : "pine";
          estimated.push(makeSpot(px, pz, species, polygonHash ^ placed, true));
          stats.estimatedParks += 1;
          placed += 1;
        }
      }
    }
  }

  // 3 · Estimados: palmeras en los paseos declarados.
  const palmSet = new Set(palmStreets.map((name) => name.toLowerCase()));
  for (const feature of features) {
    if (feature.layer !== "streets" || !palmSet.has(feature.name.toLowerCase())) continue;
    const width = feature.kind === "major" ? 11 : feature.kind === "pedestrian" ? 9 : 7;
    for (const line of feature.lines) {
      let side = 1;
      for (const [x, z, dx, dz] of sampleLine(line, 15)) {
        const offset = width / 2 + 3.5;
        const px = x - dz * offset * side;
        const pz = z + dx * offset * side;
        side = -side;
        if (!insideClip(px, pz) || !free(px, pz)) continue;
        claim(px, pz);
        const hash = hashString(`${feature.name}:${Math.round(px)}:${Math.round(pz)}`);
        estimated.push(makeSpot(px, pz, hash % 10 < 7 ? "palm" : "street", hash, true));
        stats.estimatedStreets += 1;
      }
    }
  }

  // Presupuesto: lo mapeado manda; el relleno se recorta por orden de hash, que
  // es estable entre cargas (no depende de la memoria ni del dispositivo).
  let spots = mapped;
  const room = Math.max(0, max - mapped.length);
  if (mapped.length > max) {
    stats.dropped += mapped.length - max;
    spots = mapped.slice(0, max);
  } else if (estimated.length > room) {
    stats.dropped += estimated.length - room;
    estimated.sort(
      (a, b) => hashString(`${a.x | 0}:${a.z | 0}`) - hashString(`${b.x | 0}:${b.z | 0}`),
    );
    spots = mapped.concat(estimated.slice(0, room));
  } else {
    spots = mapped.concat(estimated);
  }
  for (const spot of spots) stats.bySpecies[spot.species] += 1;
  return { spots, stats };
}

/* ----------------------------------------------------------------- geometría */

type Part = { geometry: THREE.BufferGeometry; color: string };

function colored(parts: Part[]): THREE.BufferGeometry {
  const geometries = parts.map(({ geometry, color }) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute("uv");
    const count = flat.getAttribute("position").count;
    const tone = new THREE.Color(color);
    const data = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      data[index * 3] = tone.r;
      data[index * 3 + 1] = tone.g;
      data[index * 3 + 2] = tone.b;
    }
    flat.setAttribute("color", new THREE.BufferAttribute(data, 3));
    return flat;
  });
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error("No se pudo fusionar la geometría del árbol.");
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

const TRUNK = "#7d6046";

function trunk(radiusTop: number, radiusBottom: number, height: number): Part {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6, 1);
  geometry.translate(0, height / 2, 0);
  return { geometry, color: TRUNK };
}

function blob(
  radius: number,
  y: number,
  color: string,
  scale: [number, number, number] = [1, 1, 1],
  detail = 0,
  kind: "ico" | "dodeca" = "ico",
): Part {
  const geometry =
    kind === "ico"
      ? new THREE.IcosahedronGeometry(radius, detail)
      : new THREE.DodecahedronGeometry(radius, detail);
  geometry.scale(scale[0], scale[1], scale[2]);
  geometry.translate(0, y, 0);
  return { geometry, color };
}

/** Siluetas completas (cerca) por especie. Un árbol mide ~1 en altura típica. */
function nearGeometry(species: Species): THREE.BufferGeometry {
  switch (species) {
    case "palm": {
      const parts: Part[] = [trunk(0.16, 0.26, 8)];
      for (let frond = 0; frond < 8; frond += 1) {
        const leaf = new THREE.OctahedronGeometry(1, 0);
        leaf.scale(0.32, 0.05, 1.9);
        leaf.translate(0, 0, 1.7);
        leaf.rotateX(0.42);
        leaf.rotateY((frond / 8) * Math.PI * 2);
        leaf.translate(0, 8, 0);
        parts.push({ geometry: leaf, color: frond % 2 ? "#6c9a46" : "#5b8a3c" });
      }
      return colored(parts);
    }
    case "orange":
      return colored([
        trunk(0.12, 0.17, 1.9),
        blob(1.7, 3, "#4e8a3b", [1, 0.86, 1]),
        blob(0.9, 3.9, "#5a9643", [1, 0.9, 1]),
        blob(0.2, 3.2, "#e08a2c", [1, 1, 1]),
      ]);
    case "street":
      return colored([
        trunk(0.2, 0.3, 4.2),
        blob(2.6, 6, "#5f9440", [1, 0.82, 1], 0, "dodeca"),
        blob(1.5, 7.6, "#6ca24a", [1, 0.9, 1], 0, "dodeca"),
      ]);
    case "round":
      return colored([trunk(0.2, 0.3, 4), blob(2.9, 6.1, "#6fa04a", [1, 0.95, 1], 1)]);
    case "pine":
      return colored([
        trunk(0.22, 0.34, 7.2),
        blob(3.6, 8.4, "#4d7f3c", [1, 0.36, 1], 0, "dodeca"),
        blob(2.1, 9.4, "#578a44", [1, 0.45, 1], 0, "dodeca"),
      ]);
  }
}

/** Siluetas simplificadas (lejos): copa y poco más, 6 a 14 triángulos. */
function farGeometry(species: Species): THREE.BufferGeometry {
  switch (species) {
    case "palm": {
      const cone = new THREE.ConeGeometry(2.2, 2.2, 5, 1);
      cone.translate(0, 8.4, 0);
      return colored([trunk(0.2, 0.2, 8), { geometry: cone, color: "#5f8f3f" }]);
    }
    case "orange":
      return colored([blob(1.8, 2.8, "#4e8a3b", [1, 0.9, 1])]);
    case "street":
      return colored([blob(2.8, 6, "#5f9440", [1, 0.9, 1])]);
    case "round":
      return colored([blob(3, 6.3, "#6fa04a", [1, 0.95, 1])]);
    case "pine":
      return colored([blob(3.8, 8.4, "#4d7f3c", [1, 0.42, 1])]);
  }
}

/* ------------------------------------------------------------------- sistema */

export type TreeSystem = {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  plan: TreePlan;
  /** Reconstruye las instancias visibles. Barato; el motor lo llama a 4-5 Hz. */
  update: (
    camera: THREE.PerspectiveCamera,
    clearZone: { x: number; z: number; radius: number } | null,
    force?: boolean,
  ) => void;
  setBudget: (fraction: number) => void;
  stats: () => { visible: number; near: number; far: number; total: number };
};

export function buildTrees(plan: TreePlan, uniforms: SceneUniforms): TreeSystem {
  const group = new THREE.Group();
  group.name = "arboles";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(material, uniforms, { key: "tree", instanced: true });
  materials.push(material);

  const spotsBySpecies = new Map<Species, TreeSpot[]>();
  for (const species of SPECIES) spotsBySpecies.set(species, []);
  for (const spot of plan.spots) spotsBySpecies.get(spot.species)?.push(spot);

  type Layer = {
    species: Species;
    spots: TreeSpot[];
    near: THREE.InstancedMesh;
    far: THREE.InstancedMesh;
  };
  const layers: Layer[] = [];
  const baseTint = new THREE.Color();
  for (const species of SPECIES) {
    const spots = spotsBySpecies.get(species) ?? [];
    if (spots.length === 0) continue;
    const nearGeo = nearGeometry(species);
    const farGeo = farGeometry(species);
    geometries.push(nearGeo, farGeo);
    const near = new THREE.InstancedMesh(nearGeo, material, spots.length);
    const far = new THREE.InstancedMesh(farGeo, material, spots.length);
    for (const mesh of [near, far]) {
      mesh.name = `arboles-${species}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Color de instancia inicializado: la variación de verde.
      for (let index = 0; index < spots.length; index += 1) {
        const tint = spots[index]?.tint ?? 0.5;
        baseTint.setRGB(0.88 + tint * 0.24, 0.92 + tint * 0.14, 0.84 + (1 - tint) * 0.2);
        mesh.setColorAt(index, baseTint);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
    layers.push({ species, spots, near, far });
  }

  const NEAR_DISTANCE = 420;
  const FAR_DISTANCE = 2400;
  let budget = 1;
  let visible = 0;
  let nearCount = 0;
  let farCount = 0;

  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const wide = new THREE.PerspectiveCamera();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const sphere = new THREE.Sphere();

  const update: TreeSystem["update"] = (camera, clearZone) => {
    // Encuadre ampliado: el bucle de refresco es a 4-5 Hz y la cámara gira, así
    // que se dibuja algo más de lo que se ve para que el borde no «parpadee».
    wide.copy(camera);
    wide.fov = Math.min(120, camera.fov * 1.5);
    wide.aspect = camera.aspect * 1.2;
    wide.updateProjectionMatrix();
    wide.updateMatrixWorld(true);
    projection.multiplyMatrices(wide.projectionMatrix, wide.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const nearSq = NEAR_DISTANCE * NEAR_DISTANCE;
    const farSq = FAR_DISTANCE * FAR_DISTANCE;

    visible = 0;
    nearCount = 0;
    farCount = 0;
    for (const layer of layers) {
      let nIndex = 0;
      let fIndex = 0;
      const limit = Math.ceil(layer.spots.length * budget);
      for (let index = 0; index < limit; index += 1) {
        const spot = layer.spots[index];
        if (!spot) continue;
        const dx = spot.x - cx;
        const dz = spot.z - cz;
        const dy = 0 - cy;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > farSq) continue;
        if (clearZone) {
          const ex = spot.x - clearZone.x;
          const ez = spot.z - clearZone.z;
          if (ex * ex + ez * ez < clearZone.radius * clearZone.radius) continue;
        }
        sphere.center.set(spot.x, 5, spot.z);
        sphere.radius = 9 * spot.scale;
        if (!frustum.intersectsSphere(sphere)) continue;

        quaternion.setFromAxisAngle(yAxis, spot.rotation);
        position.set(spot.x, 0.3, spot.z);
        scaleVec.setScalar(spot.scale);
        matrix.compose(position, quaternion, scaleVec);
        if (distSq <= nearSq) {
          layer.near.setMatrixAt(nIndex, matrix);
          if (layer.near.instanceColor) {
            layer.near.setColorAt(nIndex, tintColor(spot.tint));
          }
          nIndex += 1;
        } else {
          layer.far.setMatrixAt(fIndex, matrix);
          if (layer.far.instanceColor) {
            layer.far.setColorAt(fIndex, tintColor(spot.tint));
          }
          fIndex += 1;
        }
      }
      layer.near.count = nIndex;
      layer.far.count = fIndex;
      layer.near.instanceMatrix.needsUpdate = true;
      layer.far.instanceMatrix.needsUpdate = true;
      if (layer.near.instanceColor) layer.near.instanceColor.needsUpdate = true;
      if (layer.far.instanceColor) layer.far.instanceColor.needsUpdate = true;
      nearCount += nIndex;
      farCount += fIndex;
      visible += nIndex + fIndex;
    }
  };

  const tintScratch = new THREE.Color();
  function tintColor(tint: number): THREE.Color {
    return tintScratch.setRGB(0.88 + tint * 0.24, 0.92 + tint * 0.14, 0.84 + (1 - tint) * 0.2);
  }

  return {
    group,
    geometries,
    materials,
    plan,
    update,
    setBudget: (fraction: number) => {
      budget = Math.min(1, Math.max(0.1, fraction));
    },
    stats: () => ({ visible, near: nearCount, far: farCount, total: plan.spots.length }),
  };
}
