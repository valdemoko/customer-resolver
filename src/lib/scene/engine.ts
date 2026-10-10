/**
 * Motor de la escena: monta la ciudad continua, carga los datos y dibuja.
 *
 * DESACOPLADO DEL ESTADO DE REACT, A PROPÓSITO. El bucle de dibujo vive aquí,
 * fuera de React: el contenedor monta el motor una vez y se limita a leer los
 * avisos que emite (fases, selección, medidas). Si el bucle dependiera del
 * estado de React, cada cambio de interfaz —abrir una ficha, mover el ratón
 * sobre un edificio— volvería a montar la escena o provocaría renders
 * innecesarios, y el giro daría tirones justo cuando el usuario hace algo.
 *
 * SE DETIENE LO QUE NO SE VE. Con la pestaña oculta no se dibuja, y con el
 * contenedor sin tamaño no se dibuja tampoco.
 */

import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { buildCity } from "./city";
import type { BuildingRecord, CityMeshes, LandmarkSlot } from "./city";
import { buildGround } from "./ground";
import { buildRoads } from "./roads";
import { buildLife, buildRoutes } from "./life";
import { createWalkMode, type WalkMode } from "./walkmode";
import { WalkWorld } from "./walker";
import type { Life } from "./life";
import type { RoadMeshes } from "./roads";
import type { GroundMeshes } from "./ground";
import { buildWater } from "./water";
import type { WaterMeshes } from "./water";
import { buildParcels, SHOW_DISTANCE } from "./parcels";
import type { ParcelRecord, ParcelSystem } from "./parcels";
import { buildShips } from "./ships";
import type { CruiseConfig, Ships } from "./ships";
import type { FortressConfig } from "./fortress";
import { AdLayer } from "./ads";
import { buildTraffic } from "./traffic";
import type { Traffic, TrafficConfig } from "./traffic";
import type { FaceModel } from "./ads";
import { buildingFaces, panelFace, wallFaces } from "@/lib/market/faces";
import type { UnitView } from "@/lib/market/types";
import { buildClouds, buildSky } from "./sky";
import type { Clouds, Sky } from "./sky";
import { buildTrees, planTrees } from "./trees";
import type { TreeSystem } from "./trees";
import { CityCameraController } from "./camera";
import type { CameraLimits, CameraPose } from "./camera";
import { createSceneUniforms } from "./materials";
import { halfPlanes, regularPolygon } from "./polygon";
import { loadCity, boundsOfLocalRing } from "./tiles";
import { MeshBuilder } from "./mesh";
import { SKY, ACCENT, hexToNumber } from "./palette";
import type { LandmarkConfig } from "@/lib/cities/schema";
import { placeLandmarkModel } from "./landmarks";

export const PHASE_IDS = [
  "datos",
  "edificios",
  "terreno",
  "puerto",
  "locales",
  "arboles",
  "nubes",
  "fotograma",
] as const;

export type PhaseId = (typeof PHASE_IDS)[number];

export const PHASE_LABELS: Record<PhaseId, string> = {
  datos: "Leyendo el paquete de datos",
  edificios: "Construyendo los edificios",
  terreno: "Preparando el suelo y el agua",
  puerto: "Colocando los muelles y los barcos",
  locales: "Situando los locales",
  arboles: "Plantando el arbolado",
  nubes: "Colocando las nubes",
  fotograma: "Primer fotograma",
};

export type EngineOptions = {
  container: HTMLElement;
  tileUrl: string;
  /** Origen del sistema local, en grados. */
  center: [number, number];
  /** Radio de la zona bien definida (círculo centrado en `center`), en metros. */
  radiusM: number;
  /** Banda de difuminado RADIAL fuera del círculo, en metros. */
  fadeBandM: number;
  /** Exageración vertical uniforme de los edificios (1 = alturas reales). */
  exaggeration: number;
  /** Nivel de la lámina de agua por tipo (m, negativo respecto al suelo). */
  waterLevelsM: Record<string, number>;
  fortresses: FortressConfig[];
  ships: { cruise: CruiseConfig[]; small: { maxDesktop: number; maxMobile: number } };
  seed: number;
  detailZoom: number;
  camera: {
    limits: CameraLimits;
    initial: CameraPose;
    rotationSeconds: number;
    idleReturnMs: number;
    returnDurationMs: number;
  };
  clouds: { desktop: number; mobile: number; driftSeconds: number };
  trees: { maxDesktop: number; maxMobile: number; palmStreets: string[] };
  landmarks: LandmarkConfig[];
  heightOverrides?: Array<{ osmId: string; name?: string | undefined; heightM: number }> | undefined;
  shadows: boolean;
  onPhase: (phase: PhaseId, progress: { done: number; total: number; note?: string }) => void;
  onSelect: (selection: BuildingRecord | null) => void;
  /** Selección de un local (parcela). Excluye a la de edificio. */
  onSelectParcel?: (parcel: ParcelRecord | null) => void;
  onHover: (record: BuildingRecord | null) => void;
  /** Unidad comprable bajo el puntero (edificio, local, tramo, panel, vela, cartel). */
  /** Tráfico móvil con anuncios (cruceros, veleros, avionetas). */
  traffic?: TrafficConfig;
  onHoverUnit?: (unitId: string | null) => void;
  /** Selección de un anuncio móvil (panel de crucero, vela, cartel de avioneta). */
  onSelectAd?: (unitId: string | null) => void;
  /** La cámara empieza (o deja) de seguir a un objeto móvil. */
  onTrack?: (unitId: string | null) => void;
  onStats: (stats: EngineStats) => void;
  onStateChange?: (state: { rotating: boolean; atHome: boolean }) => void;
  onContextLost?: () => void;
  /** Entra o sale del modo «Explorar a pie». */
  onWalkChange?: (walking: boolean) => void;
};

export type EngineStats = {
  fpsAvg: number;
  /** Percentil 5 de FPS: el tirón que de verdad se nota. */
  fpsP5: number;
  drawCalls: number;
  triangles: number;
  memoryMb: number | null;
  clouds: number;
  trees: number;
  pixelRatio: number;
  shadows: boolean;
  qualityLevel: number;
};

export type SceneSummary = {
  coveredAreaM2: number;
  buildings: number;
  buildingsEstimated: number;
  landmarks: number;
  treesMapped: number;
  treesEstimated: number;
  streets: number;
  waterPolygons: number;
  detailZoom: number;
  tilesLoaded: number;
  tilesMissing: number;
  decodeMs: number;
  zones: number;
  exaggeration: number;
  waterMasses: number;
  waterByKind: Record<string, number>;
  fortresses: number;
  parcels: number;
  parcelsBySource: Record<string, number>;
  cruiseShips: number;
  smallBoats: number;
  groundClasses: number;
};

export type CityEngine = {
  dispose: () => void;
  setManuallyPaused: (paused: boolean) => void;
  requestHome: () => void;
  isManuallyPaused: () => boolean;
  /** Selecciona (o deselecciona con `null`) un edificio por identificador. */
  select: (id: string | null) => void;
  getSelection: () => BuildingRecord | null;
  getParcelSelection: () => ParcelRecord | null;
  /** Nuevo estado del mercado: tiñe lo comprado y pinta las fotos de los compradores. */
  setMarket: (views: UnitView[], version: string, free?: readonly string[]) => void;
  /** Caras, huella y alturas de una unidad: lo que dibuja el estudio de compra. */
  studioModel: (unitId: string) => FaceModel | null;
  /** Identificador de unidad comprable de un edificio por su id, o `null`. */
  unitIdOfBuilding: (id: string) => string | null;
  /** Lleva la cámara hasta una unidad y la selecciona (para el ranking de edificios más caros). */
  flyToUnit: (unitId: string) => boolean;
  /** Selecciona una unidad por su identificador (p. ej. al volver de Stripe). */
  selectUnit: (unitId: string | null) => void;
  /** Deja de seguir al objeto móvil (si lo había). */
  stopTracking: () => void;
  /** Modo «Explorar a pie»: suelta un personaje donde mira la cámara. `false` si aún no se puede. */
  enterWalk: () => boolean;
  exitWalk: () => void;
  isWalking: () => boolean;
  getStats: () => EngineStats;
  getSummary: () => SceneSummary;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isMobileDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(max-width: 720px)").matches ||
      window.matchMedia("(pointer: coarse)").matches)
  );
}

/** Contorno fino de un edificio: base, cubierta y aristas verticales. */
function outlineGeometry(record: BuildingRecord): THREE.BufferGeometry {
  const points: number[] = [];
  const ring = record.footprint;
  const top = record.renderHeightM + 0.2;
  const stride = Math.max(1, Math.ceil(ring.length / 36));
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    points.push(a[0], 0.5, a[1], b[0], 0.5, b[1]);
    points.push(a[0], top, a[1], b[0], top, b[1]);
    // Aristas verticales solo en las esquinas de verdad: en un muro recto con
    // vértices intermedios, una línea por vértice se leía como rayas.
    const before = ring[(index + ring.length - 1) % ring.length];
    if (before && index % stride === 0) {
      const turn = Math.abs(
        (a[0] - before[0]) * (b[1] - a[1]) - (a[1] - before[1]) * (b[0] - a[0]),
      );
      const lengths = Math.hypot(a[0] - before[0], a[1] - before[1]) * Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (lengths > 0 && turn / lengths > 0.34) points.push(a[0], 0.5, a[1], a[0], top, a[1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

let liveEngines = 0;

/** Metros que el centro de la cámara puede pasar del borde del círculo. */
const CAMERA_EDGE_MARGIN_M = 120;

export function createCityEngine(options: EngineOptions): CityEngine {
  const { container } = options;
  const mobile = isMobileDevice();
  const reduceMotion = prefersReducedMotion();
  liveEngines += 1;

  /* --------------------------------------------------------- zona y recorte */
  // El origen del sistema local ES el centro del círculo. `core` (inscrito) limita
  // la cámara; `clip` (circunscrito, círculo + banda + holgura) delimita lo que se
  // pide al paquete y dónde viven las nubes. El difuminado del shader usa el
  // círculo exacto.
  // La cámara puede centrarse hasta CAMERA_EDGE_MARGIN_M más allá del círculo: así
  // las casas del borde se pueden encuadrar y pinchar de cerca, no solo verlas desde dentro.
  const core = regularPolygon(options.radiusM + CAMERA_EDGE_MARGIN_M, 128, "inscribed");
  const clip = regularPolygon(options.radiusM + options.fadeBandM + 60, 128, "circumscribed");
  const corePlanes = halfPlanes(core);
  const clipPlanes = halfPlanes(clip);
  const uniforms = createSceneUniforms({ cx: 0, cz: 0, radius: options.radiusM }, options.fadeBandM, SKY.fog);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(hexToNumber(SKY.fog), 4200, 15000);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 26000);
  const target = new THREE.Vector3(0, 0, 0);

  // Bandera de DIAGNÓSTICO (`?logdepth=1`): activa el búfer de profundidad
  // logarítmico para medir su coste (docs/performance.md). Por defecto NO se usa:
  // el z-fighting se resuelve en los datos y con `near`/`far` dinámicos.
  const logDepth =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("logdepth");
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    powerPreference: "high-performance",
    alpha: false,
    logarithmicDepthBuffer: logDepth,
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(hexToNumber(SKY.horizon), 1);
  let shadowsEnabled = options.shadows && !mobile;
  renderer.shadowMap.enabled = shadowsEnabled;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  const onContextLostEvent = (event: Event) => {
    event.preventDefault();
    options.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onContextLostEvent);

  /* --------------------------------------------------------------- luces */
  scene.add(new THREE.HemisphereLight(hexToNumber(SKY.light), hexToNumber("#8a7a63"), 1.05));
  const sun = new THREE.DirectionalLight(hexToNumber("#fff2dd"), 1.55);
  const sunOffset = new THREE.Vector3(-0.55, 0.78, 0.45).normalize().multiplyScalar(2600);
  sun.castShadow = shadowsEnabled;
  if (shadowsEnabled) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 6000;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun, sun.target);

  /* --------------------------------------------------------------- estado */
  let sky: Sky | null = null;
  let city: CityMeshes | null = null;
  let clouds: Clouds | null = null;
  let trees: TreeSystem | null = null;
  const extraGeometries: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];
  let ground: GroundMeshes | null = null;
  let water: WaterMeshes | null = null;
  let parcels: ParcelSystem | null = null;
  let ships: Ships | null = null;
  let ads: AdLayer | null = null;
  let traffic: Traffic | null = null;
  let life: Life | null = null;
  type Flight = { start: number; duration: number; from: { x: number; z: number; d: number; az: number; pitch: number }; to: { x: number; z: number; d: number; az: number; pitch: number } };
  let flight: Flight | null = null;
  let walkMode: WalkMode | null = null;
  let roads: RoadMeshes | null = null;
  let marketViews: UnitView[] = [];
  let marketVersion = "0";
  let marketFree: readonly string[] = [];
  let selection: BuildingRecord | null = null;
  let hovered: BuildingRecord | null = null;
  let parcelSelection: ParcelRecord | null = null;
  let parcelHovered: ParcelRecord | null = null;
  let disposed = false;
  let rafId = 0;
  let elapsed = 0;
  // Solo para pruebas: congela el tiempo de la escena (agua, nubes, barcos) para
  // medir el ruido entre fotogramas sin que la animación lo contamine.
  // Con `prefers-reduced-motion` el tiempo de la escena está parado desde el
  // principio: ni oleaje, ni deriva de nubes, ni balanceo de barcos.
  let timeFrozen = reduceMotion;

  const frameTimes: number[] = [];
  let stats: EngineStats = {
    fpsAvg: 0,
    fpsP5: 0,
    drawCalls: 0,
    triangles: 0,
    memoryMb: null,
    clouds: 0,
    trees: 0,
    pixelRatio,
    shadows: shadowsEnabled,
    qualityLevel: 0,
  };
  const cost = { updateMs: 0, renderMs: 0, frameMs: 0, samples: 0 };
  // Tiempo de cada fase de carga (ms desde el inicio de la carga), publicado en
  // `data-island-timings` para medir dónde se va el primer fotograma.
  const timings: Record<string, number> = {};
  const loadStarted = performance.now();
  const mark = (name: string) => {
    timings[name] = Math.round(performance.now() - loadStarted);
    container.dataset.islandTimings = JSON.stringify(timings);
  };

  const summary: SceneSummary = {
    coveredAreaM2: Math.round(Math.PI * options.radiusM * options.radiusM),
    buildings: 0,
    buildingsEstimated: 0,
    landmarks: 0,
    treesMapped: 0,
    treesEstimated: 0,
    streets: 0,
    waterPolygons: 0,
    detailZoom: options.detailZoom,
    tilesLoaded: 0,
    tilesMissing: 0,
    decodeMs: 0,
    zones: 0,
    exaggeration: options.exaggeration,
    waterMasses: 0,
    waterByKind: {},
    fortresses: 0,
    parcels: 0,
    parcelsBySource: {},
    cruiseShips: 0,
    smallBoats: 0,
    groundClasses: 0,
  };

  /* ------------------------------------------------------------- selección */
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const downRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 2000);
  downRay.firstHitOnly = true;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const scratch = new THREE.Vector3();

  function setPointer(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  type Hit = { building: BuildingRecord | null; parcel: ParcelRecord | null; ad: string | null };

  /**
   * Qué hay bajo el puntero: un LOCAL (parcela) o un EDIFICIO. Las parcelas están
   * a 12 cm de la fachada, así que gana la parcela si su impacto no queda detrás
   * del edificio (con 60 cm de tolerancia) y solo cuando se están dibujando.
   */
  function pickTarget(clientX: number, clientY: number): Hit {
    setPointer(clientX, clientY);
    let building: BuildingRecord | null = null;
    let buildingDistance = Number.POSITIVE_INFINITY;
    const mesh = city?.pickMesh;
    if (mesh && city) {
      const hit = mesh ? raycaster.intersectObject(mesh, false)[0] : undefined;
      const faceIndex = hit?.faceIndex;
      if (hit && faceIndex !== undefined && faceIndex !== null) {
        const id = city.pickIds[faceIndex];
        building = id ? (city.buildingsById.get(id) ?? null) : null;
        buildingDistance = hit.distance;
      }
    }
    let parcel: ParcelRecord | null = null;
    let parcelDistance = Number.POSITIVE_INFINITY;
    const parcelMesh = parcels?.pickMesh;
    if (parcels && parcelMesh && parcelsVisible) {
      const hit = raycaster.intersectObject(parcelMesh, false)[0];
      const faceIndex = hit?.faceIndex;
      if (hit && faceIndex !== undefined && faceIndex !== null && hit.distance <= buildingDistance + 0.6) {
        parcel = parcels.records[Math.floor(faceIndex / 2)] ?? null;
        parcelDistance = hit.distance;
      }
    }
    // Anuncios móviles (paneles de crucero, velas, carteles): ganan si están delante.
    const adHit = traffic?.pick(raycaster) ?? null;
    if (adHit && adHit.distance < Math.min(buildingDistance, parcel ? parcelDistance : Number.POSITIVE_INFINITY)) {
      return { building: null, parcel: null, ad: adHit.unitId };
    }
    return parcel ? { building: null, parcel, ad: null } : { building, parcel: null, ad: null };
  }

  function pick(clientX: number, clientY: number): BuildingRecord | null {
    return pickTarget(clientX, clientY).building;
  }

  /** Punto del mundo bajo el cursor: tejado si lo hay, suelo si no. */
  function pickWorldPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const mesh = city?.pickMesh;
    const hit = mesh ? raycaster.intersectObject(mesh, false)[0] : undefined;
    if (hit) return hit.point.clone();
    return raycaster.ray.intersectPlane(groundPlane, scratch.set(0, 0, 0))
      ? scratch.clone()
      : null;
  }

  /** Altura de lo más alto que hay en (x, z): tejado o 0. */
  function clearanceAt(x: number, z: number): number {
    const mesh = city?.pickMesh;
    if (!mesh) return 0;
    downRay.ray.origin.set(x, 1000, z);
    downRay.ray.direction.set(0, -1, 0);
    const hit = downRay.intersectObject(mesh, false)[0];
    // Un crucero amarrado tampoco se atraviesa: se trata como un tejado.
    return Math.max(hit ? hit.point.y : 0, ships?.heightAt(x, z) ?? 0);
  }

  const controller = new CityCameraController({
    camera,
    element: container,
    target,
    limits: options.camera.limits,
    initial: options.camera.initial,
    panBounds: corePlanes,
    rotationSeconds: options.camera.rotationSeconds,
    idleReturnMs: options.camera.idleReturnMs,
    returnDurationMs: options.camera.returnDurationMs,
    reduceMotion,
    onStateChange: options.onStateChange,
    pickPoint: pickWorldPoint,
    clearance: clearanceAt,
  });

  /* ------------------------------------------------------------ resaltado */
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: hexToNumber("#ffffff"),
    fog: false,
    depthTest: true,
  });
  const selectionOutlineMaterial = new THREE.LineBasicMaterial({
    color: hexToNumber(ACCENT),
    fog: false,
    depthTest: true,
  });
  let hoverOutline: THREE.LineSegments | null = null;
  let selectionOutline: THREE.LineSegments | null = null;

  function setOutline(
    kind: "hover" | "selection",
    record: BuildingRecord | null,
  ): void {
    const previous = kind === "hover" ? hoverOutline : selectionOutline;
    if (previous) {
      scene.remove(previous);
      previous.geometry.dispose();
    }
    let next: THREE.LineSegments | null = null;
    if (record) {
      next = new THREE.LineSegments(
        outlineGeometry(record),
        kind === "hover" ? outlineMaterial : selectionOutlineMaterial,
      );
      next.name = `contorno-${kind}`;
      next.frustumCulled = false;
      next.renderOrder = 3;
      scene.add(next);
    }
    if (kind === "hover") hoverOutline = next;
    else selectionOutline = next;
  }

  /** Identificador de unidad comprable de un edificio, o `null` si no se vende. */
  function unitIdOfRecord(record: BuildingRecord): string | null {
    if (record.kind === "wall") return record.id;
    if (record.kind === "fortress") return null;
    return record.id.startsWith("way/") || record.id.startsWith("relation/") ? `b:${record.id}` : null;
  }

  /** Modelo de caras de una unidad (para pintar las fotos y para el estudio). */
  function faceModelOf(unitId: string): FaceModel | null {
    const kind = unitId[0];
    if (kind === "b" && city) {
      const record = city.buildingsById.get(unitId.slice(2));
      if (!record) return null;
      return {
        unitId,
        faces: buildingFaces(record.footprint),
        bottomM: 0.4,
        topM: Math.max(2, record.renderHeightM - 0.4),
        centre: record.centroid,
        footprint: record.footprint,
        heightM: record.renderHeightM,
      };
    }
    if (kind === "w" && city) {
      const record = city.buildingsById.get(unitId);
      const unit = city.fortresses.flatMap((plan) => plan.wallUnits).find((entry) => entry.id === unitId);
      if (!record || !unit) return null;
      return {
        unitId,
        faces: wallFaces(unit.lines),
        bottomM: 0.4,
        topM: Math.max(2, record.renderHeightM),
        centre: record.centroid,
        footprint: record.footprint,
        heightM: record.renderHeightM,
      };
    }
    if (kind === "p" && parcels) {
      const parcel = parcels.byId.get(unitId.slice(2));
      if (!parcel) return null;
      const bottom = 0.3 * options.exaggeration;
      return {
        unitId,
        faces: [
          {
            id: "f0",
            a: parcel.a,
            b: parcel.b,
            normal: parcel.normal,
            widthM: parcel.widthM,
            order: 1,
          },
        ],
        bottomM: bottom,
        topM: bottom + parcel.heightM,
        centre: [(parcel.a[0] + parcel.b[0]) / 2, (parcel.a[1] + parcel.b[1]) / 2],
        heightM: parcel.heightM,
      };
    }
    if (kind === "s" || kind === "v" || kind === "a" || kind === "t") {
      return { unitId, faces: panelFace(kind === "a" ? 36 : kind === "s" ? 24 : kind === "t" ? 6.1 : 4), bottomM: 0, topM: kind === "a" ? 9 : kind === "t" ? 2.35 : 6, centre: [0, 0] };
    }
    return null;
  }

  /** Lleva la cámara hasta (x, z) con una animación suave. Con «reducir movimiento», salta. */
  function flyTo(x: number, z: number, distance: number, pitch = 38): void {
    const pose = controller.getPose();
    const to = { x, z, d: distance, az: pose.azimuthDeg, pitch };
    if (reduceMotion) {
      controller.setPose({ azimuthDeg: to.az, pitchDeg: pitch, distance, target: [x, z] });
      return;
    }
    flight = { start: performance.now(), duration: 1500, from: { x: target.x, z: target.z, d: pose.distance, az: pose.azimuthDeg, pitch: pose.pitchDeg }, to };
  }

  /** Distancia (m) a partir de la cual pinchar un anuncio acerca la cámara a él; más cerca, ya se está mirando de cerca. */
  const ZOOM_ON_CLICK_FROM = 450;

  /** Si la unidad tiene anuncio y se pincha desde lejos, la cámara se acerca a ella (sin cambiar la selección). */
  function zoomToAdvertised(unitId: string | null): void {
    if (!unitId || walkMode?.active || controller.getPose().distance < ZOOM_ON_CLICK_FROM) return;
    if (!marketViews.some((view) => view.id === unitId && view.owned)) return;
    const kind = unitId[0];
    if ((kind === "b" || kind === "w") && city) {
      const record = city.buildingsById.get(kind === "b" ? unitId.slice(2) : unitId);
      if (record) flyTo(record.centroid[0], record.centroid[1], Math.min(420, Math.max(80, record.radiusM * 3.4 + 50)));
    } else if (kind === "p" && parcels) {
      const parcel = parcels.byId.get(unitId.slice(2));
      if (parcel) flyTo((parcel.a[0] + parcel.b[0]) / 2, (parcel.a[1] + parcel.b[1]) / 2, 55, 30);
    }
  }

  /** Sale del modo a pie y devuelve la órbita justo donde estaba el personaje. */
  function exitWalk(): void {
    const left = walkMode?.exit();
    if (!left) return;
    flight = null;
    controller.setSuspended(false);
    // yaw = hacia dónde miraba la cámara; la órbita se coloca en el lado contrario, a vista de calle alta.
    const azimuthDeg = (Math.atan2(-Math.cos(left.yaw), -Math.sin(left.yaw)) * 180) / Math.PI;
    controller.setPose({ azimuthDeg, pitchDeg: 38, distance: 90, target: [left.x, left.z] });
    options.onWalkChange?.(false);
  }

  /** Selecciona una unidad comprable y lleva la cámara hasta ella. Devuelve `false` si no la encuentra. */
  function flyToUnit(unitId: string): boolean {
    exitWalk();
    const kind = unitId[0];
    if ((kind === "b" || kind === "w") && city) {
      const record = city.buildingsById.get(kind === "b" ? unitId.slice(2) : unitId);
      if (!record) return false;
      if (parcelSelection) setParcelSelection(null, false);
      setSelection(record, true);
      flyTo(record.centroid[0], record.centroid[1], Math.min(420, Math.max(80, record.radiusM * 3.4 + 50)));
      return true;
    }
    if (kind === "p" && parcels) {
      const parcel = parcels.byId.get(unitId.slice(2));
      if (!parcel) return false;
      setParcelSelection(parcel, true);
      flyTo((parcel.a[0] + parcel.b[0]) / 2, (parcel.a[1] + parcel.b[1]) / 2, 55, 30);
      return true;
    }
    if (startTracking(unitId)) {
      options.onSelectAd?.(unitId);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------ seguimiento de objetos móviles */
  let tracked: string | null = null;
  /** Encuadre al seguir cada clase de objeto: distancia (m) y cabeceo (°). */
  const TRACK_VIEW: Record<string, { distance: number; pitchDeg: number }> = {
    s: { distance: 190, pitchDeg: 24 },
    a: { distance: 150, pitchDeg: 18 },
    v: { distance: 70, pitchDeg: 26 },
    t: { distance: 60, pitchDeg: 26 },
  };
  function startTracking(unitId: string): boolean {
    if (walkMode?.active) return false;
    const point = traffic?.worldPositionOf(unitId);
    if (!point) return false;
    flight = null;
    tracked = unitId;
    controller.setFollow({ x: point.x, y: point.y, z: point.z }, TRACK_VIEW[unitId[0] ?? ""] ?? { distance: 90, pitchDeg: 26 });
    container.dataset.tracking = unitId;
    options.onTrack?.(unitId);
    return true;
  }
  function stopTracking(): void {
    if (!tracked) return;
    tracked = null;
    controller.setFollow(null);
    delete container.dataset.tracking;
    options.onTrack?.(null);
  }

  function applyHold(): void {
    controller.setHold(
      hovered !== null || selection !== null || parcelHovered !== null || parcelSelection !== null,
    );
  }

  let adHovered: string | null = null;
  function setHover(record: BuildingRecord | null, parcel: ParcelRecord | null = null, ad: string | null = null): void {
    if (record?.id === hovered?.id && parcel?.id === parcelHovered?.id && ad === adHovered) return;
    adHovered = ad;
    hovered = record;
    parcelHovered = parcel;
    uniforms.uHover.value = record ? record.index : -1;
    parcels?.setHover(parcel ? parcel.index : -1);
    // El que ya está seleccionado no necesita un segundo contorno encima.
    setOutline("hover", record && record.id !== selection?.id ? record : null);
    container.dataset.hover = parcel ? parcel.id : record ? record.osmId : "";
    options.onHoverUnit?.(ad ?? (parcel ? `p:${parcel.id}` : record ? unitIdOfRecord(record) : null));
    container.style.cursor = record || parcel || ad ? "pointer" : "";
    options.onHover(record);
    applyHold();
  }

  function setSelection(record: BuildingRecord | null, notify = true): void {
    if (record) stopTracking(); // elegir un edificio suelta el objeto móvil que se seguía
    // Edificio y local son excluyentes: elegir uno suelta el otro.
    if (record && parcelSelection) {
      parcelSelection = null;
      parcels?.setSelected(-1);
      if (notify) options.onSelectParcel?.(null);
    }
    selection = record;
    uniforms.uSelected.value = record ? record.index : -1;
    setOutline("selection", record);
    setOutline("hover", hovered && hovered.id !== record?.id ? hovered : null);
    controller.setZoomFocus(
      record ? { x: record.centroid[0], y: record.renderHeightM * 0.5, z: record.centroid[1] } : null,
    );
    container.dataset.selected = record ? record.osmId : parcelSelection ? parcelSelection.id : "";
    if (notify) options.onSelect(record);
    applyHold();
    forceTrees = true;
  }

  function setParcelSelection(parcel: ParcelRecord | null, notify = true): void {
    if (parcel) stopTracking();
    if (parcel && selection) {
      selection = null;
      uniforms.uSelected.value = -1;
      setOutline("selection", null);
      if (notify) options.onSelect(null);
    }
    parcelSelection = parcel;
    parcels?.setSelected(parcel ? parcel.index : -1);
    controller.setZoomFocus(
      parcel
        ? {
            x: (parcel.a[0] + parcel.b[0]) / 2 + parcel.normal[0] * 2,
            y: parcel.heightM * 0.5 + 0.4,
            z: (parcel.a[1] + parcel.b[1]) / 2 + parcel.normal[1] * 2,
          }
        : selection
          ? { x: selection.centroid[0], y: selection.renderHeightM * 0.5, z: selection.centroid[1] }
          : null,
    );
    container.dataset.selected = parcel ? parcel.id : selection ? selection.osmId : "";
    if (notify) options.onSelectParcel?.(parcel);
    applyHold();
    forceTrees = true;
  }

  /* --------------------------------------------------- entrada del puntero */
  let pointerInside = false;
  let pointerX = 0;
  let pointerY = 0;
  let pointerType = "mouse";
  let pointerDirty = false;
  let lastHoverPick = 0;
  let parcelsVisible = false;
  let down: { x: number; y: number; t: number; button: number } | null = null;

  const onPointerEnter = () => {
    pointerInside = true;
  };
  const onPointerMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerType = event.pointerType;
    pointerInside = true;
    pointerDirty = true;
  };
  const onPointerLeave = () => {
    pointerInside = false;
    setHover(null);
  };
  const onPointerDown = (event: PointerEvent) => {
    flight = null; // quien arrastra manda sobre el vuelo automático
    down = { x: event.clientX, y: event.clientY, t: performance.now(), button: event.button };
    pointerType = event.pointerType;
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || start.button !== 0 || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 6 || performance.now() - start.t > 550) return;
    // Un clic (o un toque) selecciona lo que hay bajo el puntero; en vacío,
    // deselecciona. En táctil el resalte aparece aquí, al tocar.
    const hit = pickTarget(event.clientX, event.clientY);
    if (hit.ad) {
      if (parcelSelection) setParcelSelection(null);
      if (selection) setSelection(null);
      startTracking(hit.ad);
      options.onSelectAd?.(hit.ad);
      return;
    }
    stopTracking();
    options.onSelectAd?.(null);
    if (hit.parcel) {
      setParcelSelection(hit.parcel);
      zoomToAdvertised(`p:${hit.parcel.id}`);
    } else {
      if (parcelSelection) setParcelSelection(null);
      setSelection(hit.building);
      if (hit.building) zoomToAdvertised(unitIdOfRecord(hit.building));
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Con un panel abierto, Escape solo lo cierra; sin panel, también sale del modo a pie.
    if (walkMode?.active && !selection && !parcelSelection) exitWalk();
    stopTracking();
    if (selection) setSelection(null);
    if (parcelSelection) setParcelSelection(null);
  };

  container.addEventListener("pointerenter", onPointerEnter);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);

  /* ------------------------------------------------------------------ bucle */
  let lastTick = performance.now();
  const tick = (): number => {
    const now = performance.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    return delta;
  };

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const cloudBase = mobile ? options.clouds.mobile : options.clouds.desktop;

  function applyQuality(level: number): void {
    stats.qualityLevel = level;
    if (level >= 1) {
      pixelRatio = Math.min(pixelRatio, 1);
      renderer.setPixelRatio(pixelRatio);
      if (shadowsEnabled) {
        shadowsEnabled = false;
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
        scene.traverse((object) => {
          const material = (object as THREE.Mesh).material as THREE.Material | undefined;
          if (material) material.needsUpdate = true;
        });
      }
      clouds?.setCount(Math.round(cloudBase * 0.5));
      trees?.setBudget(0.6);
      ships?.setSmallBoatBudget(0.5);
    }
    if (level >= 2) {
      clouds?.setCount(Math.max(4, Math.round(cloudBase / 3)));
      trees?.setBudget(0.35);
      // En un dispositivo modesto las embarcaciones pequeñas se apagan; los
      // cruceros (3 modelos) siguen, porque cuestan una llamada de dibujo cada uno.
      ships?.setSmallBoatBudget(0);
    }
    resize();
  }

  let lowFpsStreak = 0;
  function updateAdaptiveQuality(): void {
    if (frameTimes.length < 60) return;
    // `frameTimes` guarda TIEMPOS de fotograma en segundos, no fps. Comparar un
    // tiempo con un umbral de fps (45) daba siempre verdadero y la calidad caía
    // al mínimo en el primer segundo: se encontró midiendo (nivel 2 a 180 fps).
    const averageTime = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
    const average = averageTime > 0 ? 1 / averageTime : 0;
    frameTimes.length = 0;
    // Solo se baja la calidad si el aparato no llega de forma SOSTENIDA (tres
    // ventanas seguidas), para no reaccionar a un parón puntual de carga.
    const threshold = stats.qualityLevel === 0 ? 40 : 28;
    lowFpsStreak = average < threshold ? lowFpsStreak + 1 : 0;
    if (lowFpsStreak >= 3 && stats.qualityLevel < 2) {
      lowFpsStreak = 0;
      applyQuality(stats.qualityLevel + 1);
    }
  }

  function computeFps(deltas: number[]): { avg: number; p5: number } {
    if (deltas.length === 0) return { avg: 0, p5: 0 };
    const fps = deltas.map((delta) => 1 / Math.max(delta, 0.0001)).sort((a, b) => a - b);
    const avg = fps.reduce((sum, value) => sum + value, 0) / fps.length;
    const index = Math.max(0, Math.floor(fps.length * 0.05));
    return { avg: Math.round(avg), p5: Math.round(fps[index] ?? fps[0] ?? 0) };
  }

  let fpsWindow: number[] = [];
  let lastFrameTime = performance.now();
  let forceTrees = true;
  let lastTreeUpdate = 0;
  let lastShadowUpdate = 0;
  const lastCamera = new THREE.Vector3(1e9, 0, 0);
  const lastTarget = new THREE.Vector3(1e9, 0, 0);
  const shadowCenter = new THREE.Vector3();

  function updateShadowFrustum(): void {
    if (!shadowsEnabled) return;
    // La cámara de sombras sigue al foco y se encoge al acercarse: con el zoom a
    // pie de calle las sombras ganan resolución en lugar de quedarse borrosas.
    const distance = camera.position.distanceTo(target);
    const half = Math.min(1500, Math.max(110, distance * 0.95));
    const texel = (half * 2) / 2048;
    shadowCenter.set(
      Math.round(target.x / texel) * texel,
      0,
      Math.round(target.z / texel) * texel,
    );
    sun.target.position.copy(shadowCenter);
    sun.position.copy(shadowCenter).add(sunOffset);
    // El sesgo por la normal sigue al tamaño del texel: con la cámara de sombras
    // grande hace falta más para evitar el «acné», y con zoom a pie de calle un
    // sesgo grande separaría la sombra de su objeto.
    sun.shadow.normalBias = Math.max(0.05, texel * 2.2);
    const shadowCamera = sun.shadow.camera;
    if (Math.abs(shadowCamera.right - half) > half * 0.06) {
      shadowCamera.left = -half;
      shadowCamera.right = half;
      shadowCamera.top = half;
      shadowCamera.bottom = -half;
      shadowCamera.updateProjectionMatrix();
    }
    sun.target.updateMatrixWorld();
  }

  function frame(): void {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const delta = tick();
    const now = performance.now();
    if (!timeFrozen) elapsed += delta;

    if (document.hidden || container.clientWidth === 0) {
      lastFrameTime = now;
      return;
    }

    const t0 = performance.now();
    if (walkMode?.active) {
      // El modo a pie coloca la cámara; el «foco» de la escena pasa a ser el personaje.
      target.copy(walkMode.update(delta));
    } else if (flight) {
      const t = Math.min(1, (now - flight.start) / flight.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out cúbica
      const { from, to } = flight;
      // Se cruza por una distancia mayor a mitad de vuelo (sube y baja), para no atravesar edificios.
      const lift = Math.sin(t * Math.PI) * Math.max(0, Math.hypot(to.x - from.x, to.z - from.z) * 0.18);
      controller.setPose({
        azimuthDeg: from.az + (to.az - from.az) * e,
        pitchDeg: from.pitch + (to.pitch - from.pitch) * e,
        distance: from.d + (to.d - from.d) * e + lift,
        target: [from.x + (to.x - from.x) * e, from.z + (to.z - from.z) * e],
      });
      if (t >= 1) flight = null;
    }
    if (!walkMode?.active) controller.update(delta);
    uniforms.uTime.value = elapsed;
    const orbitDistance = camera.position.distanceTo(target);
    parcelsVisible = orbitDistance < SHOW_DISTANCE;
    water?.update(camera.position);
    ads?.update(target, now);
    parcels?.update(camera.position, orbitDistance);
    ships?.update(elapsed, reduceMotion);
    traffic?.update(elapsed, reduceMotion);
    life?.update(elapsed, reduceMotion);
    if (tracked) {
      // El foco persigue al objeto; si el usuario lo soltó (desplazó la vista), se deja de seguir.
      const point = traffic?.worldPositionOf(tracked);
      if (!controller.isFollowing() || !point) stopTracking();
      else controller.updateFollowPoint(point.x, point.y, point.z);
    }

    // Hover con la cámara en movimiento: se vuelve a lanzar el rayo aunque el
    // puntero esté quieto, porque lo que hay debajo ha cambiado.
    const cameraMoved =
      camera.position.distanceToSquared(lastCamera) > 0.0004 ||
      target.distanceToSquared(lastTarget) > 0.0004;
    if (
      pointerInside &&
      pointerType !== "touch" &&
      (pointerDirty || cameraMoved) &&
      now - lastHoverPick > 45 &&
      !down
    ) {
      lastHoverPick = now;
      pointerDirty = false;
      const hit = pickTarget(pointerX, pointerY);
      setHover(hit.building, hit.parcel, hit.ad);
    }
    if (cameraMoved) {
      lastCamera.copy(camera.position);
      lastTarget.copy(target);
    }

    sky?.mesh.position.copy(camera.position);
    if (sky) sky.material.uniforms.uTime!.value = elapsed;

    const focus = selection
      ? scratch.set(selection.centroid[0], selection.renderHeightM * 0.5, selection.centroid[1])
      : target;
    clouds?.update(elapsed, timeFrozen ? 0 : delta, camera.position, focus);

    if (trees && (forceTrees || now - lastTreeUpdate > 210)) {
      lastTreeUpdate = now;
      trees.update(
        camera,
        selection
          ? { x: selection.centroid[0], z: selection.centroid[1], radius: selection.radiusM + 9 }
          : null,
        forceTrees,
      );
      forceTrees = false;
    }
    if (now - lastShadowUpdate > 240) {
      lastShadowUpdate = now;
      updateShadowFrustum();
    }
    const t1 = performance.now();

    renderer.render(scene, camera);
    const t2 = performance.now();

    cost.updateMs += t1 - t0;
    cost.renderMs += t2 - t1;
    cost.frameMs += t2 - t0;
    cost.samples += 1;

    const frameDelta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (frameDelta > 0 && frameDelta < 1) {
      frameTimes.push(frameDelta);
      fpsWindow.push(frameDelta);
    }

    if (frameTimes.length >= 90) updateAdaptiveQuality();
    if (fpsWindow.length >= 120) {
      const { avg, p5 } = computeFps(fpsWindow);
      fpsWindow = [];
      const info = renderer.info;
      const memory =
        "memory" in performance
          ? Math.round(
              ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
                ?.usedJSHeapSize ?? 0) /
                1048576,
            )
          : null;
      stats = {
        fpsAvg: avg,
        fpsP5: p5,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        memoryMb: memory && memory > 0 ? memory : null,
        clouds: clouds?.activeCount ?? 0,
        trees: trees?.stats().visible ?? 0,
        pixelRatio: renderer.getPixelRatio(),
        shadows: shadowsEnabled,
        qualityLevel: stats.qualityLevel,
      };
      options.onStats(stats);
      container.dataset.fpsAvg = String(stats.fpsAvg);
      container.dataset.fpsP5 = String(stats.fpsP5);
      container.dataset.drawCalls = String(stats.drawCalls);
      container.dataset.triangles = String(stats.triangles);
      if (stats.memoryMb !== null) container.dataset.memoryMb = String(stats.memoryMb);
    }
  }

  /* ------------------------------------------------------------------ carga */
  (async () => {
    try {
      options.onPhase("datos", { done: 0, total: 1, note: "Abriendo el paquete PMTiles" });
      const loaded = await loadCity({
        url: options.tileUrl,
        center: options.center,
        zoom: options.detailZoom,
        bounds: boundsOfLocalRing(options.center, clip),
        onTile: (done, total, features) =>
          options.onPhase("datos", {
            done,
            total,
            note: `${features.toLocaleString("es-ES")} elementos decodificados`,
          }),
      });
      if (disposed) return;
      mark("datos");
      summary.tilesLoaded = loaded.tilesLoaded;
      summary.tilesMissing = loaded.tilesMissing;
      summary.decodeMs = loaded.decodeMs;

      options.onPhase("edificios", { done: 0, total: 1, note: "Extruyendo huellas y cubiertas" });
      city = buildCity({
        features: loaded.features,
        uniforms,
        landmarks: options.landmarks,
        heightOverrides: options.heightOverrides,
        fortresses: options.fortresses,
        exaggeration: options.exaggeration,
      });
      scene.add(city.group);
      mark("edificios");
      summary.buildings = city.stats.buildings;
      summary.buildingsEstimated = city.stats.buildingsEstimated;
      summary.landmarks = city.stats.landmarks;
      summary.fortresses = city.stats.fortresses;
      summary.zones = city.stats.zones;
      options.onPhase("edificios", {
        done: 1,
        total: 1,
        note: `${city.stats.buildings.toLocaleString("es-ES")} edificios · ${city.stats.zones} zonas · exageración ×${options.exaggeration.toLocaleString("es-ES")}`,
      });

      options.onPhase("terreno", { done: 0, total: 1, note: "Suelo en clases disjuntas y agua" });
      ground = buildGround(loaded.features, uniforms);
      scene.add(ground.group);
      roads = buildRoads(loaded.features, uniforms);
      scene.add(roads.group);
      mark("suelo");
      summary.groundClasses = ground.stats.classes;
      const seaLevel = options.waterLevelsM.sea ?? -1.6;
      water = buildWater({
        features: loaded.features,
        uniforms,
        levelsM: options.waterLevelsM,
        clipRadiusM: options.radiusM + options.fadeBandM + 60,
        beachRings: ground.beachRings,
        sunDirection: sunOffset,
        shoreFieldPx: mobile ? 1024 : 2048,
      });
      scene.add(water.group);
      mark("agua");
      summary.waterMasses = water.stats.masses;
      summary.waterByKind = water.stats.byKind;
      summary.waterPolygons = water.stats.masses;
      // Plano de fondo bajo el agua y la tierra, del color de la niebla: una
      // rendija entre teselas no deja ver un vacío oscuro.
      const seabedGeometry = new THREE.PlaneGeometry(60000, 60000, 1, 1);
      seabedGeometry.rotateX(-Math.PI / 2);
      const seabedMaterial = new THREE.MeshBasicMaterial({ color: hexToNumber(SKY.fog), fog: false });
      const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
      seabed.position.y = seaLevel - 3;
      seabed.frustumCulled = false;
      seabed.renderOrder = -1;
      scene.add(seabed);
      extraGeometries.push(seabedGeometry);
      extraMaterials.push(seabedMaterial);
      options.onPhase("terreno", {
        done: 1,
        total: 1,
        note: `${ground.stats.polygons.toLocaleString("es-ES")} polígonos en ${ground.stats.classes} clases · ${water.stats.masses} masas de agua · campo de costa ${water.stats.shoreFieldMs} ms`,
      });

      // Modelos propios de edificios emblemáticos (catedral). Sus triángulos
      // pasan también a la malla de selección.
      const pickPositions: number[] = [];
      const pickExtraIds: string[] = [];
      for (const slot of city.landmarkSlots as LandmarkSlot[]) {
        if (!slot.config.modelUrl) continue;
        let geometries: THREE.BufferGeometry[] = [];
        try {
          const placed = await placeLandmarkModel({
            slot,
            material: city.buildingMaterial,
            heightScale: options.exaggeration,
          });
          if (disposed) return;
          if (placed) {
            scene.add(placed.object);
            geometries = placed.geometries;
            extraGeometries.push(...placed.geometries);
          }
        } catch (error) {
          // Si el modelo no carga, el emblemático NO desaparece: se dibuja su
          // volumen extruido de siempre y se deja el motivo en el contenedor.
          container.dataset.landmarkError = `${slot.config.id}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          const fallback = new MeshBuilder();
          fallback.addWalls(slot.record.footprint, 0, slot.record.renderHeightM, 0xe6dabb, slot.record.id);
          fallback.addPolygon(
            { outer: slot.record.footprint, holes: [] },
            slot.record.renderHeightM,
            0xb3a99a,
            slot.record.id,
          );
          const geometry = fallback.build({
            buildingIndex: new Map([[slot.record.id, slot.record.index]]),
          });
          const mesh = new THREE.Mesh(geometry, city.buildingMaterial);
          scene.add(mesh);
          geometries = [geometry];
          extraGeometries.push(geometry);
        }
        for (const geometry of geometries) {
          const position = geometry.getAttribute("position");
          for (let index = 0; index < position.count; index += 1) {
            pickPositions.push(position.getX(index), position.getY(index), position.getZ(index));
          }
          for (let triangle = 0; triangle < position.count / 3; triangle += 1) {
            pickExtraIds.push(slot.record.id);
          }
        }
      }
      if (pickPositions.length > 0 && city.pickMesh && city.pickGeometry) {
        const old = city.pickGeometry.getAttribute("position");
        const merged = new Float32Array(old.array.length + pickPositions.length);
        merged.set(old.array as Float32Array, 0);
        merged.set(pickPositions, old.array.length);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(merged, 3));
        geometry.computeBoundingSphere();
        city.pickGeometry.dispose();
        city.pickGeometry = geometry;
        city.pickMesh.geometry = geometry;
        city.pickIds = city.pickIds.concat(pickExtraIds);
      }
      // BVH sobre la malla de selección: el rayo deja de recorrer cada triángulo.
      if (city.pickGeometry && city.pickMesh) {
        city.pickMesh.raycast = acceleratedRaycast;
        // `indirect` deja el orden de los triángulos intacto: el `faceIndex` del
        // impacto sigue siendo el índice del identificador por triángulo.
        (city.pickGeometry as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree =
          new MeshBVH(city.pickGeometry, { indirect: true });
      }

      options.onPhase("puerto", { done: 0, total: 1, note: "Cruceros en sus atraques y barcos en las dársenas" });
      ships = buildShips({
        features: loaded.features,
        uniforms,
        cruise: options.ships.cruise,
        smallMax: mobile ? options.ships.small.maxMobile : options.ships.small.maxDesktop,
        waterLevel: seaLevel,
        seed: options.seed,
        radiusM: options.radiusM,
      });
      scene.add(ships.group);
      // Calles reales por las que circulan coches, camiones y peatones.
      const routes = buildRoutes(loaded.features, { cx: uniforms.uCircle.value.x, cz: uniforms.uCircle.value.y, radius: uniforms.uCircle.value.z });
      if (options.traffic) {
        traffic = buildTraffic({
          ships,
          config: options.traffic,
          mobile,
          waterLevel: seaLevel,
          seed: options.seed,
          radiusM: options.radiusM,
          routes: routes.drive,
          focus: [uniforms.uCircle.value.x + 250, uniforms.uCircle.value.y - 200],
        });
        scene.add(traffic.group);
      }
      life = buildLife({ features: loaded.features, circle: { cx: uniforms.uCircle.value.x, cz: uniforms.uCircle.value.y, radius: uniforms.uCircle.value.z }, seed: options.seed, mobile, routes });
      scene.add(life.group);
      {
        // Modo «Explorar a pie»: muros = edificios de más de un metro; agua profunda y borde de la zona no se cruzan.
        const deepWater = new Set(["sea", "dock", "river", "reservoir", "pond"]);
        const walkWorld = new WalkWorld({
          buildings: [...city.buildingsById.values()].filter((record) => record.renderHeightM >= 1).map((record) => record.footprint),
          water: loaded.features
            .filter((feature) => feature.layer === "water" && deepWater.has(feature.kind || "water"))
            .flatMap((feature) => feature.polygons.map((polygon) => ({ outer: polygon.outer, holes: polygon.holes }))),
          bounds: corePlanes,
        });
        const wallRay = new THREE.Raycaster();
        walkMode = createWalkMode({
          scene,
          camera,
          container,
          world: walkWorld,
          rayDistance: (from, direction, maxDistance) => {
            const mesh = city?.pickMesh;
            if (!mesh) return null;
            wallRay.set(from, direction);
            wallRay.far = maxDistance;
            const hit = wallRay.intersectObject(mesh, false)[0];
            return hit ? hit.distance : null;
          },
          accentHex: hexToNumber(ACCENT),
          reduceMotion,
        });
      }
      mark("barcos");
      summary.cruiseShips = ships.stats.cruise;
      summary.smallBoats = ships.stats.smallPlaced;
      options.onPhase("puerto", {
        done: 1,
        total: 1,
        note: `${ships.stats.cruise} cruceros · ${ships.stats.smallPlaced} embarcaciones pequeñas`,
      });

      options.onPhase("locales", { done: 0, total: 1, note: "Parcelas de planta baja" });
      parcels = buildParcels({
        features: loaded.features,
        buildingsById: city.buildingsById,
        exaggeration: options.exaggeration,
      });
      scene.add(parcels.group);
      ads = new AdLayer(faceModelOf, (unitId) => {
        if (unitId[0] === "p") {
          const parcel = parcels?.byId.get(unitId.slice(2));
          return parcel ? { table: 1, index: parcel.index } : null;
        }
        const record = unitId[0] === "w" ? city?.buildingsById.get(unitId) : unitId[0] === "b" ? city?.buildingsById.get(unitId.slice(2)) : undefined;
        return record ? { table: 0, index: record.index } : null;
      });
      scene.add(ads.group);
      uniforms.uOwnedTex.value = ads.ownedTexture;
      parcels.setOwnedTexture(ads.parcelOwnedTexture);
      if (marketViews.length > 0 || marketFree.length > 0) ads.setUnits(marketViews, marketVersion, marketFree);
      traffic?.setMarket(marketViews, (id, key) => ads?.texture(id, key) ?? null);
      mark("locales");
      summary.parcels = parcels.stats.total;
      summary.parcelsBySource = parcels.stats.bySource;
      options.onPhase("locales", {
        done: 1,
        total: 1,
        note: `${parcels.stats.total.toLocaleString("es-ES")} locales (${parcels.stats.bySource.osm_poi} de OpenStreetMap, ${parcels.stats.bySource.estimated} estimados)`,
      });

      options.onPhase("arboles", { done: 0, total: 1, note: "Plan de arbolado" });
      const plan = planTrees({
        features: loaded.features,
        clip,
        palmStreets: options.trees.palmStreets,
        seed: options.seed,
        max: mobile ? options.trees.maxMobile : options.trees.maxDesktop,
        // Las fachadas con local quedan libres: ningún árbol tapa un escaparate.
        clearSegments: parcels.records.map((record) => ({ a: record.a, b: record.b })),
      });
      trees = buildTrees(plan, uniforms);
      scene.add(trees.group);
      mark("arboles");
      summary.treesMapped = plan.stats.mapped + plan.stats.mappedRows;
      summary.treesEstimated = plan.stats.estimatedParks + plan.stats.estimatedStreets;
      options.onPhase("arboles", {
        done: 1,
        total: 1,
        note: `${plan.spots.length.toLocaleString("es-ES")} árboles (${summary.treesMapped} de OSM, ${summary.treesEstimated} estimados)`,
      });

      options.onPhase("nubes", { done: 0, total: 1, note: "Nubes de perímetro y de fondo" });
      clouds = buildClouds({
        count: cloudBase,
        outer: clip,
        bandM: options.fadeBandM,
        driftSeconds: options.clouds.driftSeconds,
        seed: options.seed,
      });
      scene.add(clouds.group);
      sky = buildSky(20000);
      scene.add(sky.mesh);
      mark("nubes");
      options.onPhase("nubes", { done: 1, total: 1, note: `${clouds.placedCount} nubes` });

      resize();
      controller.update(0);
      trees.update(camera, null, true);
      clouds.update(0, 0.016, camera.position, target);
      water.update(camera.position);
      parcels.update(camera.position, camera.position.distanceTo(target));
      updateShadowFrustum();
      // Primer dibujado sincrónico: es el fotograma que se mide, y compilar los
      // materiales aquí evita que el primer fotograma del bucle sea el caro.
      renderer.render(scene, camera);
      mark("fotograma");
      options.onPhase("fotograma", { done: 1, total: 1 });
      container.dataset.islandReady = "true";
      container.dataset.islandFirstFrameMs = String(Math.round(performance.now()));
      tick();
      lastFrameTime = performance.now();
      frame();
    } catch (error) {
      container.dataset.islandError = error instanceof Error ? error.message : String(error);
      options.onPhase("datos", {
        done: 0,
        total: 1,
        note: error instanceof Error ? error.message : "Error al cargar",
      });
    }
  })();

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);

  /* ------------------------------------------- API de medición (para pruebas) */
  const project = (x: number, y: number, z: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const point = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
    };
  };
  const api = {
    getStats: () => stats,
    getSummary: () => summary,
    getSelection: () => selection,
    getParcelSelection: () => parcelSelection,
    camera: () => ({
      position: camera.position.toArray(),
      focus: target.toArray(),
      ...controller.getPose(),
      returning: controller.isReturning(),
      near: camera.near,
    }),
    getFrameCost: () => ({
      updateMs: cost.samples ? cost.updateMs / cost.samples : 0,
      renderMs: cost.samples ? cost.renderMs / cost.samples : 0,
      frameMs: cost.samples ? cost.frameMs / cost.samples : 0,
      samples: cost.samples,
    }),
    resetFrameCost: () => {
      cost.updateMs = 0;
      cost.renderMs = 0;
      cost.frameMs = 0;
      cost.samples = 0;
    },
    /** Identificador del edificio bajo un punto de la pantalla. */
    pickScreen: (clientX: number, clientY: number) => pick(clientX, clientY)?.id ?? null,
    setPose: (pose: Partial<CameraPose> & { target?: [number, number] }) => controller.setPose(pose),
    memory: () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 }),
    treeStats: () => trees?.stats() ?? null,
    treePlan: () => trees?.plan.stats ?? null,
    cloudInfo: () =>
      clouds
        ? { placed: clouds.placedCount, active: clouds.activeCount, trianglesPerVariant: clouds.trianglesPerVariant }
        : null,
    setClouds: (count: number) => clouds?.setCount(count),
    setTrees: (fraction: number) => {
      trees?.setBudget(fraction);
      forceTrees = true;
    },
    setSelection: (id: string | null) =>
      setSelection(id ? (city?.buildingsById.get(id) ?? null) : null),
    findBuilding: (predicate: string) => {
      const needle = predicate.toLowerCase();
      for (const record of city?.buildingsByIndex ?? []) {
        if (record.name.toLowerCase().includes(needle) || record.id === predicate) {
          return { id: record.id, name: record.name, centroid: record.centroid, heightM: record.heightM, renderHeightM: record.renderHeightM };
        }
      }
      return null;
    },
    screenOfPoint: (x: number, y: number, z: number) => project(x, y, z),
    sceneTime: () => elapsed,
    adStats: () => ads?.stats() ?? null,
    trafficStats: () => traffic?.stats ?? null,
    trafficSnapshot: () => traffic?.snapshot() ?? null,
    roadStats: () => roads?.stats ?? null,
    lifeStats: () => life?.stats ?? null,
    lifeSnapshot: () => life?.snapshot() ?? null,
    /** Solo diagnóstico: oculta o muestra las mallas cuyo nombre empieza por `prefix`. */
    setVisibleByName: (prefix: string, visible: boolean) => {
      let changed = 0;
      scene.traverse((object) => {
        if (object.name.startsWith(prefix)) {
          object.visible = visible;
          changed += 1;
        }
      });
      return changed;
    },
    /** Solo diagnóstico: el mapa del mar alrededor de un punto, en texto (# tierra, . agua, 1-9 agua libre/25 m). */
    seaAscii: (x: number, z: number, half: number) => {
      const sea = ships?.sea;
      if (!sea) return null;
      const rows: string[] = [];
      for (let dz = -half; dz <= half; dz += sea.cell) {
        let row = "";
        for (let dx = -half; dx <= half; dx += sea.cell) {
          const c = sea.clearanceAt(x + dx, z + dz);
          row += c <= 0 ? "#" : String(Math.min(9, Math.floor(c / 25)));
        }
        rows.push(row);
      }
      return rows;
    },
    shipBases: () => ships?.cruise.map((c) => ({ id: c.id, base: c.base, water: c.water, yaw: c.baseYaw })) ?? [],
    /** Solo para comprobaciones: fija el tiempo de escena y lo congela. */
    setSceneTime: (seconds: number) => {
      elapsed = seconds;
      timeFrozen = true;
      traffic?.update(elapsed, false);
      life?.update(elapsed, false);
    },
    screenOfUnit: (unitId: string) => {
      const point = traffic?.worldPositionOf(unitId);
      return point ? project(point.x, point.y, point.z) : null;
    },
    unitIdOfBuilding: (id: string) => {
      const record = city?.buildingsById.get(id);
      return record ? unitIdOfRecord(record) : null;
    },
    freezeTime: (frozen: boolean) => {
      timeFrozen = frozen;
    },
    screenOfBuilding: (id: string) => {
      const record = city?.buildingsById.get(id);
      if (!record) return null;
      return project(record.centroid[0], record.renderHeightM, record.centroid[1]);
    },
    /** Identificador del edificio que hay en (x, z), lanzando un rayo vertical. */
    pickWorld: (x: number, z: number) => {
      const mesh = city?.pickMesh;
      if (!mesh || !city) return null;
      downRay.ray.origin.set(x, 1000, z);
      const hit = downRay.intersectObject(mesh, false)[0];
      const faceIndex = hit?.faceIndex;
      if (faceIndex === undefined || faceIndex === null) return null;
      return city.pickIds[faceIndex] ?? null;
    },
    sampleBuildings: (count: number) =>
      (city?.buildingsByIndex ?? [])
        .filter((record) => record.areaM2 > 120)
        .slice(0, count)
        .map((record) => ({ id: record.id, centroid: record.centroid, heightM: record.heightM, renderHeightM: record.renderHeightM })),
    live: () => liveEngines,
    /** Parcelas (locales): todas, con su origen y su geometría. */
    parcelList: () => parcels?.records ?? [],
    parcelStats: () => parcels?.stats ?? null,
    waterStats: () => water?.stats ?? null,
    groundStats: () => ground?.stats ?? null,
    shipInfo: () => (ships ? { placements: ships.placements, stats: ships.stats } : null),
    fortressInfo: () =>
      (city?.fortresses ?? []).map((plan) => ({
        id: plan.config.id,
        name: plan.config.name,
        counts: plan.counts,
        items: plan.items.length,
        centroid: plan.centroid,
      })),
    setSmallBoats: (fraction: number) => ships?.setSmallBoatBudget(fraction),
    setParcelSelection: (id: string | null) =>
      setParcelSelection(id ? (parcels?.byId.get(id) ?? null) : null),
    /** Identificador de la parcela (o del edificio) bajo un punto de la pantalla. */
    pickTargetScreen: (clientX: number, clientY: number) => {
      const hit = pickTarget(clientX, clientY);
      return hit.ad
        ? { kind: "ad", id: hit.ad }
        : hit.parcel
        ? { kind: "parcel", id: hit.parcel.id }
        : hit.building
          ? { kind: "building", id: hit.building.id }
          : null;
    },
    screenOfParcel: (id: string) => {
      const record = parcels?.byId.get(id);
      if (!record) return null;
      const mx = (record.a[0] + record.b[0]) / 2 + record.normal[0] * 0.2;
      const mz = (record.a[1] + record.b[1]) / 2 + record.normal[1] * 0.2;
      return project(mx, 0.3 * options.exaggeration + record.heightM * 0.5, mz);
    },
    walk: () => (walkMode ? { active: walkMode.active, ...walkMode.snapshot() } : null),
    clipBounds: () => clip,
    coreBounds: () => core,
    clipPlanes: () => clipPlanes,
    logDepth: () => logDepth,
  };
  Object.defineProperty(window, "__alzadoIsland", { value: api, configurable: true });

  return {
    dispose: () => {
      disposed = true;
      liveEngines -= 1;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLostEvent);
      walkMode?.dispose();
      controller.dispose();

      // Liberación explícita: al salir de la ciudad y volver, sin esto se acumula
      // memoria de la tarjeta gráfica hasta que el navegador pierde el contexto.
      parcels?.dispose();
      ads?.dispose();
      traffic?.dispose();
      life?.dispose();
      for (const texture of water?.textures ?? []) texture.dispose();
      for (const object of [city, clouds, trees, ground, roads, water, ships]) {
        if (!object) continue;
        for (const geometry of object.geometries) geometry.dispose();
        for (const material of object.materials) material.dispose();
      }
      for (const geometry of extraGeometries) geometry.dispose();
      for (const material of extraMaterials) material.dispose();
      if (sky) {
        sky.geometry.dispose();
        sky.material.dispose();
      }
      if (city?.pickGeometry) {
        const geometry = city.pickGeometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
        delete geometry.boundsTree;
        geometry.dispose();
      }
      if (hoverOutline) hoverOutline.geometry.dispose();
      if (selectionOutline) selectionOutline.geometry.dispose();
      outlineMaterial.dispose();
      selectionOutlineMaterial.dispose();
      sun.shadow.map?.dispose();
      scene.clear();
      renderer.dispose();
      // Suelta el contexto WebGL ya: los navegadores limitan los contextos vivos
      // (16 en Chrome) y esperar al recolector de basura no es una garantía.
      renderer.forceContextLoss();
      if (canvas.parentElement === container) container.removeChild(canvas);
      delete container.dataset.islandReady;
      delete container.dataset.selected;
      delete container.dataset.hover;
      container.style.cursor = "";
    },
    setManuallyPaused: (paused: boolean) => controller.setManuallyPaused(paused),
    requestHome: () => {
      // Primero se suelta TODO lo que mueve o retiene la cámara y después arranca el retorno:
      // soltar la selección cambia la retención del giro y eso cancelaría un retorno ya iniciado
      // (había que pulsar «Vista inicial» dos veces).
      exitWalk();
      flight = null;
      stopTracking();
      if (selection) setSelection(null);
      if (parcelSelection) setParcelSelection(null);
      controller.requestHome(!reduceMotion);
    },
    isManuallyPaused: () => controller.isManuallyPaused(),
    enterWalk: () => {
      if (!walkMode || walkMode.active) return false;
      flight = null;
      stopTracking();
      if (selection) setSelection(null);
      if (parcelSelection) setParcelSelection(null);
      // Si había algo seleccionado, `setSelection(null)` ya soltó la retención del giro.
      const yaw = Math.atan2(target.z - camera.position.z, target.x - camera.position.x);
      // Se suelta justo donde mira la cámara; de muy lejos, el foco es el centro de la ciudad.
      if (!walkMode.enter(target.x, target.z, yaw)) return false;
      controller.setSuspended(true);
      setHover(null);
      options.onWalkChange?.(true);
      return true;
    },
    exitWalk,
    isWalking: () => walkMode?.active ?? false,
    select: (id: string | null) => {
      stopTracking();
      if (parcelSelection) setParcelSelection(null, false);
      setSelection(id ? (city?.buildingsById.get(id) ?? null) : null, false);
    },
    getSelection: () => selection,
    getParcelSelection: () => parcelSelection,
    setMarket: (views: UnitView[], version: string, free: readonly string[] = []) => {
      marketViews = views;
      marketVersion = version;
      marketFree = free;
      ads?.setUnits(views, version, free);
      traffic?.setMarket(views, (id, key) => ads?.texture(id, key) ?? null);
    },
    studioModel: (unitId: string) => faceModelOf(unitId),
    flyToUnit: (unitId: string) => flyToUnit(unitId),
    unitIdOfBuilding: (id: string) => {
      const record = city?.buildingsById.get(id);
      return record ? unitIdOfRecord(record) : null;
    },
    stopTracking: () => stopTracking(),
    selectUnit: (unitId: string | null) => {
      if (!unitId) return;
      if (unitId[0] === "p") {
        const parcel = parcels?.byId.get(unitId.slice(2));
        if (parcel) setParcelSelection(parcel, true);
        return;
      }
      const record = unitId[0] === "w" ? city?.buildingsById.get(unitId) : unitId[0] === "b" ? city?.buildingsById.get(unitId.slice(2)) : undefined;
      if (record) setSelection(record, true);
    },
    getStats: () => stats,
    getSummary: () => summary,
  };
}

