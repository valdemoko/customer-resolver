/**
 * Locales como parcelas publicitarias individuales (B.4).
 *
 * UNA PARCELA es un tramo de fachada de planta baja, con identificador estable
 * y estado inicial «disponible». Se dibuja como un rectángulo pegado a la
 * fachada (a 12 cm de la pared, sin entrar en el edificio ni en la calle) y se
 * SELECCIONA por separado del edificio.
 *
 * SIN ETIQUETAS FLOTANTES, Y NO SOLO POR COLOR. Cada estado se distingue por su
 * FORMA o PATRÓN:
 *   · reposo      → solo el marco fino.
 *   · hover       → marco más grueso + rayado diagonal.
 *   · selección   → marco + cuadrícula (damero).
 * El color acompaña pero no es lo único que cambia, así que se lee igual con
 * daltonismo. Todo es opaco (descarte de fragmentos), sin transparencia.
 *
 * CARGA POR ZONA / VOLUMEN: una sola malla con todas las parcelas (2 triángulos
 * por parcela) y un solo material; no se dibuja si la cámara está lejos
 * (`SHOW_DISTANCE`), y el rayo de selección usa su propio BVH.
 */

import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import type { CityFeature } from "./tiles";
import type { BuildingRecord } from "./city";
import { ACCENT, hexToNumber } from "./palette";

/** Altura (m reales) del rectángulo de planta baja, antes de la exageración. */
const PARCEL_TOP_M = 3.4;
const PARCEL_BOTTOM_M = 0.3;
const WALL_OFFSET_M = 0.12;
/** Distancia de órbita por debajo de la cual se dibujan las parcelas. */
export const SHOW_DISTANCE = 1150;

export type ParcelSource = "catastro_unit" | "osm_poi" | "estimated";

export type ParcelRecord = {
  /** Identificador estable (`L-xxxxxxx`), derivado de la geometría y del edificio. */
  id: string;
  index: number;
  source: ParcelSource;
  /** Identificador OSM del edificio al que pertenece la fachada. */
  buildingId: string;
  buildingName: string;
  poiId: string;
  poiName: string;
  category: string;
  widthM: number;
  street: string;
  zone: string;
  /** Extremos del tramo, en metros locales (x, z). */
  a: [number, number];
  b: [number, number];
  /** Normal hacia fuera de la fachada (x, z). */
  normal: [number, number];
  /** Altura dibujada del rectángulo. */
  heightM: number;
  /** Estado inicial de TODAS las parcelas. */
  state: "available";
};

export type ParcelSystem = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  records: ParcelRecord[];
  byId: Map<string, ParcelRecord>;
  /** Malla de selección (no se añade a la escena). */
  pickMesh: THREE.Mesh | null;
  setHover: (index: number) => void;
  setSelected: (index: number) => void;
  /** Textura de locales comprados (índice de parcela). */
  setOwnedTexture: (texture: THREE.Texture) => void;
  /** Actualiza visibilidad y uniformes según la cámara y el foco. */
  update: (camera: THREE.Vector3, orbitDistance: number) => void;
  stats: {
    total: number;
    bySource: Record<ParcelSource, number>;
    skippedNoBuilding: number;
    skippedTooLow: number;
    triangles: number;
  };
  dispose: () => void;
};

const VERTEX = /* glsl */ `
  attribute float pid;
  attribute vec2 puv;
  attribute vec2 psize;
  varying float vPid;
  varying vec2 vUv;
  varying vec2 vSize;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vPid = pid;
    vUv = puv;
    vSize = psize;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uHover;
  uniform float uSelected;
  uniform float uShow;
  uniform vec3 uCamera;
  uniform vec3 uIdle;
  uniform vec3 uHoverColor;
  uniform vec3 uSelectedColor;
  uniform sampler2D uOwnedTex;
  uniform vec3 uOwnedColor;
  varying float vPid;
  varying vec2 vUv;
  varying vec2 vSize;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float d = distance(vWorld, uCamera);
    if (d > uShow) discard;
    bool hover = abs(vPid - uHover) < 0.5;
    bool selected = abs(vPid - uSelected) < 0.5;
    // Distancia al borde del rectángulo, en metros.
    float edge = min(min(vUv.x, vSize.x - vUv.x), min(vUv.y, vSize.y - vUv.y));
    // El marco crece con la distancia para seguir viéndose de lejos.
    float frame = clamp(d * 0.0026, 0.16, 0.7) * (hover || selected ? 1.6 : 1.0);
    float cell = max(0.55, d * 0.0042);
    vec3 color = uIdle;
    bool inFrame = edge < frame;
    if (selected) {
      color = uSelectedColor;
      // Damero: forma distinta del rayado de hover.
      float checker = mod(floor(vUv.x / cell) + floor(vUv.y / cell), 2.0);
      if (!inFrame && checker > 0.5) discard;
    } else if (hover) {
      color = uHoverColor;
      // Rayado diagonal.
      float stripe = mod((vUv.x + vUv.y) / cell, 1.0);
      if (!inFrame && stripe > 0.45) discard;
    } else {
      // Comprado: marco del color de la marca; relleno sólido solo si no lleva foto.
      float owned = texture2D(uOwnedTex, vec2((vPid + 0.5) / 8192.0, 0.5)).r;
      if (owned > 0.5) {
        color = uOwnedColor;
        if (!inFrame && owned < 0.9) discard;
      } else if (!inFrame) {
        discard;
      }
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function buildParcels(options: {
  features: CityFeature[];
  buildingsById: Map<string, BuildingRecord>;
  exaggeration: number;
}): ParcelSystem {
  const { features, buildingsById, exaggeration } = options;
  const records: ParcelRecord[] = [];
  const bySource: Record<ParcelSource, number> = { catastro_unit: 0, osm_poi: 0, estimated: 0 };
  let skippedNoBuilding = 0;
  let skippedTooLow = 0;

  const positions: number[] = [];
  const pids: number[] = [];
  const uvs: number[] = [];
  const sizes: number[] = [];
  const pickPositions: number[] = [];

  // Un tramo que cruza el borde entre dos teselas llega partido en dos trozos
  // con el mismo identificador: se reúnen por `id` y se toman los extremos.
  const grouped = new Map<string, { feature: CityFeature; points: Array<[number, number]> }>();
  for (const feature of features) {
    if (feature.layer !== "parcels") continue;
    const key = String(feature.props.id ?? "");
    const entry = grouped.get(key) ?? { feature, points: [] };
    for (const line of feature.lines) for (const point of line) entry.points.push([point[0], point[1]]);
    grouped.set(key, entry);
  }

  for (const { feature, points } of grouped.values()) {
    if (points.length < 2) continue;
    // Extremos: el par de puntos más alejado (los tramos son rectos).
    const first = points[0];
    if (!first) continue;
    let a = first;
    let b = first;
    let best = -1;
    for (const p of points) {
      const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (d > best) {
        best = d;
        a = p;
      }
    }
    best = -1;
    for (const p of points) {
      const d = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (d > best) {
        best = d;
        b = p;
      }
    }
    const buildingId = String(feature.props.building ?? "");
    const building = buildingsById.get(buildingId);
    if (!building) {
      skippedNoBuilding += 1;
      continue;
    }
    const bottom = PARCEL_BOTTOM_M * exaggeration;
    const top = Math.min(PARCEL_TOP_M * exaggeration, building.renderHeightM - 0.3);
    if (top - bottom < 1.4) {
      skippedTooLow += 1;
      continue;
    }
    // En la tesela, la normal va en (este, norte); la escena usa (x = este, z = sur).
    const nx = Number(feature.props.nx ?? 0);
    const nz = -Number(feature.props.ny ?? 0);
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (width < 1) continue;
    const source = String(feature.props.source ?? "estimated") as ParcelSource;
    const index = records.length;
    const record: ParcelRecord = {
      id: String(feature.props.id ?? `L-${index}`),
      index,
      source,
      buildingId,
      buildingName: building.name,
      poiId: String(feature.props.poi_id ?? ""),
      poiName: String(feature.props.poi_name ?? ""),
      category: String(feature.props.category ?? ""),
      widthM: Math.round(width * 100) / 100,
      street: String(feature.props.street ?? ""),
      zone: String(feature.props.zone ?? ""),
      a: [a[0], a[1]],
      b: [b[0], b[1]],
      normal: [nx, nz],
      heightM: top - bottom,
      state: "available",
    };
    records.push(record);
    bySource[source] = (bySource[source] ?? 0) + 1;

    const ox = nx * WALL_OFFSET_M;
    const oz = nz * WALL_OFFSET_M;
    const corners: Array<[number, number, number, number, number]> = [
      [a[0] + ox, bottom, a[1] + oz, 0, 0],
      [b[0] + ox, bottom, b[1] + oz, width, 0],
      [b[0] + ox, top, b[1] + oz, width, top - bottom],
      [a[0] + ox, top, a[1] + oz, 0, top - bottom],
    ];
    for (const triangle of [[0, 1, 2], [0, 2, 3]] as const) {
      for (const vertexIndex of triangle) {
        const c = corners[vertexIndex];
        if (!c) continue;
        positions.push(c[0], c[1], c[2]);
        pickPositions.push(c[0], c[1], c[2]);
        pids.push(index);
        uvs.push(c[3], c[4]);
        sizes.push(width, top - bottom);
      }
    }
  }

  const group = new THREE.Group();
  group.name = "parcelas";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const byId = new Map(records.map((r) => [r.id, r]));

  if (records.length === 0) {
    return {
      group,
      materials,
      geometries,
      records,
      byId,
      pickMesh: null,
      setHover: () => undefined,
      setSelected: () => undefined,
      setOwnedTexture: () => undefined,
      update: () => undefined,
      stats: { total: 0, bySource, skippedNoBuilding, skippedTooLow, triangles: 0 },
      dispose: () => undefined,
    };
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("pid", new THREE.Float32BufferAttribute(pids, 1));
  geometry.setAttribute("puv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("psize", new THREE.Float32BufferAttribute(sizes, 2));
  geometry.computeBoundingSphere();
  geometries.push(geometry);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHover: { value: -1 },
      uSelected: { value: -1 },
      uShow: { value: 1800 },
      uCamera: { value: new THREE.Vector3() },
      uIdle: { value: new THREE.Color("#14b8a6") },
      uHoverColor: { value: new THREE.Color("#19c9b4") },
      uSelectedColor: { value: new THREE.Color(ACCENT) },
      uOwnedTex: { value: null as THREE.Texture | null },
      uOwnedColor: { value: new THREE.Color("#e0663a") },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
  });
  materials.push(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "parcelas";
  mesh.renderOrder = 20;
  mesh.frustumCulled = true;
  group.add(mesh);

  // Malla de selección: solo posiciones, con BVH indirecto (el orden de los
  // triángulos no cambia, así que `faceIndex / 2` es el índice de la parcela).
  const pickGeometry = new THREE.BufferGeometry();
  pickGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pickPositions, 3));
  pickGeometry.computeBoundingSphere();
  const pickMesh = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  pickMesh.raycast = acceleratedRaycast;
  (pickGeometry as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = new MeshBVH(pickGeometry, {
    indirect: true,
  });
  pickMesh.updateMatrixWorld(true);
  geometries.push(pickGeometry);

  let lastVisible = true;
  return {
    group,
    materials,
    geometries,
    records,
    byId,
    pickMesh,
    setHover: (index) => {
      material.uniforms.uHover!.value = index;
    },
    setSelected: (index) => {
      material.uniforms.uSelected!.value = index;
    },
    setOwnedTexture: (texture) => {
      material.uniforms.uOwnedTex!.value = texture;
    },
    update: (camera, orbitDistance) => {
      const visible = orbitDistance < SHOW_DISTANCE;
      if (visible !== lastVisible) {
        mesh.visible = visible;
        lastVisible = visible;
      }
      (material.uniforms.uCamera!.value as THREE.Vector3).copy(camera);
    },
    stats: {
      total: records.length,
      bySource,
      skippedNoBuilding,
      skippedTooLow,
      triangles: records.length * 2,
    },
    dispose: () => {
      delete (pickGeometry as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree;
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      (pickMesh.material as THREE.Material).dispose();
    },
  };
}

export { hexToNumber };
