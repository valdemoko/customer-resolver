/**
 * Tráfico y anuncios móviles (Fase C): cruceros que zarpan y vuelven, veleros y
 * lanchas que navegan en bucles, avionetas con cartel que dan la vuelta a la
 * ciudad, y los paneles publicitarios que llevan todos ellos.
 *
 * REGLAS DE PARTIDA
 *  · A t = 0 todos los cruceros están en su atraque (la colocación de B.4 sigue
 *    siendo la imagen inicial), y con «reducir movimiento» el tiempo de escena
 *    no avanza, así que se quedan allí.
 *  · Los cruceros solo navegan por celdas de mar con agua libre (`seamap`); si no
 *    hay ruta hasta mar abierto, el crucero se queda amarrado.
 *  · Los paneles son planos sueltos colgados del barco (o avioneta). Los libres
 *    de crucero y avioneta enseñan «Anuncia aquí»; las velas libres no se dibujan
 *    (son decenas), pero siguen siendo pinchables.
 */

import * as THREE from "three";
import { frameUV, imageKeyFor } from "@/lib/market/faces";
import { whenImageReady } from "./ads";
import type { UnitView } from "@/lib/market/types";
import { formatCents } from "@/lib/money";
import { MeshBuilder } from "./mesh";
import { hexToNumber } from "./palette";
import { seededRandom } from "./polygon";
import { findSeaPath, reachableCells, smoothPath } from "./seamap";
import type { SeaMap } from "./seamap";
import { box, buildLaunchGeometry, buildSailboatGeometry, cruiseHullTop } from "./ships";
import { TRUCK_PANEL, agentPose, buildTruckGeometry, spawnAgent, stepAgent } from "./life";
import type { Agent, Route } from "./life";
import type { Ships } from "./ships";

export type TrafficConfig = {
  cruisePanelsPerShip: number;
  sailUnits: number;
  planes: number;
  movingBoats: { desktop: number; mobile: number };
  cruiseCycleSeconds: number;
  planeAltitudeM: number[];
  planeOrbitM: number[];
  /** Camiones de carga con anuncio en la caja (unidades `t:1`…). */
  trucks?: number;
};

/* ------------------------------------------------------------ funciones puras */

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Velocidad de crucero de los cruceros: ≈ 5 nudos, para que se vean navegar despacio. */
export const CRUISE_SPEED = 2.6;
/** Tiempo de aceleración y de frenado (el barco no arranca ni se detiene de golpe). */
export const CRUISE_RAMP_S = 45;

/**
 * Distancia recorrida `tau` segundos después de zarpar, sobre una ruta de `total`
 * metros: arranca acelerando despacio, navega a velocidad constante y frena al
 * llegar. Devuelve también si ya terminó.
 */
export function sailDistance(tau: number, total: number, speed = CRUISE_SPEED, ramp = CRUISE_RAMP_S): { d: number; done: boolean } {
  const duration = sailDuration(total, speed, ramp);
  if (tau <= 0) return { d: 0, done: false };
  if (tau >= duration) return { d: total, done: true };
  if (tau < ramp) return { d: (0.5 * speed * tau * tau) / ramp, done: false };
  if (tau > duration - ramp) {
    const left = duration - tau;
    return { d: total - (0.5 * speed * left * left) / ramp, done: false };
  }
  return { d: speed * (tau - ramp / 2), done: false };
}

/** Segundos que tarda en recorrer la ruta con esas rampas. */
export function sailDuration(total: number, speed = CRUISE_SPEED, ramp = CRUISE_RAMP_S): number {
  return total / speed + ramp;
}

export type Voyage = { dwellS: number; total: number; leadS: number };

/**
 * Estado de un crucero en el instante `t`: amarrado (esperando) o navegando, con la
 * distancia recorrida sobre su ruta (ida por varios puntos de mar abierto y vuelta
 * al atraque). `leadS` es lo que le queda de espera en el atraque a t = 0, para que
 * todos empiecen amarrados y zarpen escalonados.
 */
export function voyageAt(t: number, voyage: Voyage): { moving: boolean; d: number } {
  const sailS = sailDuration(voyage.total);
  const cycle = voyage.dwellS + sailS;
  const u = (((t + voyage.dwellS - voyage.leadS) % cycle) + cycle) % cycle;
  if (u < voyage.dwellS) return { moving: false, d: 0 };
  const { d, done } = sailDistance(u - voyage.dwellS, voyage.total);
  return { moving: !done, d };
}

export type Path = { points: Array<[number, number]>; cumulative: number[]; length: number };

export function makePath(points: Array<[number, number]>): Path {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] ?? 0 };
}

/** Punto y tangente unitaria a `distance` metros del inicio de la ruta. */
export function samplePath(path: Path, distance: number): { x: number; z: number; tx: number; tz: number } {
  const d = Math.min(path.length, Math.max(0, distance));
  let lo = 0;
  let hi = path.cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.cumulative[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = path.points[lo]!;
  const b = path.points[Math.min(path.points.length - 1, lo + 1)]!;
  const span = path.cumulative[Math.min(path.cumulative.length - 1, lo + 1)]! - path.cumulative[lo]!;
  const f = span > 0 ? (d - path.cumulative[lo]!) / span : 0;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const norm = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * f, z: a[1] + dz * f, tx: dx / norm, tz: dz / norm };
}

/** Interpolación por el camino angular más corto. */
export function angleLerp(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/** Giro del modelo (proa en +x) para mirar hacia (hx, hz). */
export const yawOf = (hx: number, hz: number) => -Math.atan2(hz, hx);

/**
 * Pose de un crucero a `distance` metros de recorrido de su ruta. Cerca del atraque
 * (a la salida y a la llegada) conserva el rumbo del muelle para no barrerlo con la
 * popa, y en mar abierto sigue la tangente de la ruta.
 */
export function voyagePose(
  path: Path,
  baseYaw: number,
  lengthM: number,
  distance: number,
): { x: number; z: number; yaw: number } {
  const p = samplePath(path, distance);
  const fromEnd = Math.min(distance, path.length - distance);
  const blend = smooth((fromEnd - lengthM * 0.5) / 240);
  return { x: p.x, z: p.z, yaw: angleLerp(baseYaw, yawOf(p.tx, p.tz), blend) };
}

/* ------------------------------------------------------------ paneles */

type PanelKind = "ship" | "sail" | "plane" | "truck";

type Panel = {
  unitId: string;
  kind: PanelKind;
  /** Aspecto ancho / alto, para el texto del cartel. */
  aspect: number;
  meshes: THREE.Mesh[];
  /** Mallas que se ondulan (carteles de avioneta). */
  flutter: THREE.BufferGeometry[];
  hideWhenFree: boolean;
};

const textureCache = new Map<string, THREE.Texture>();

/** Cartel de texto en un canvas; en entornos sin DOM devuelve `null`. */
function labelTexture(lines: { title: string; sub?: string; free: boolean; aspect: number }): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${lines.free ? "f" : "o"}|${lines.aspect}|${lines.title}|${lines.sub ?? ""}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const height = 192;
  const width = Math.round(height * lines.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const bg = lines.free ? "#f6f1e6" : "#16233b";
  const fg = lines.free ? "#16233b" : "#fdf7e8";
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = lines.free ? "#c9772b" : "#e0b04a";
  context.lineWidth = 8;
  context.strokeRect(10, 10, width - 20, height - 20);
  context.fillStyle = fg;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const fit = (text: string, size: number, weight: string, maxWidth: number) => {
    let px = size;
    do {
      context.font = `${weight} ${px}px "Segoe UI", system-ui, sans-serif`;
      px -= 4;
    } while (context.measureText(text).width > maxWidth && px > 20);
  };
  const hasSub = Boolean(lines.sub);
  fit(lines.title, hasSub ? 92 : 110, "700", width - 80);
  context.fillText(lines.title, width / 2, hasSub ? height * 0.4 : height / 2);
  if (lines.sub) {
    context.globalAlpha = 0.78;
    fit(lines.sub, 52, "500", width - 80);
    context.fillText(lines.sub, width / 2, height * 0.76);
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function quadGeometry(segments: number, flipU: boolean): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, segments, 1);
  if (flipU) {
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i));
    // Al invertir u la cara trasera se ve sin espejo; se invierten los triángulos
    // para que mire hacia atrás.
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  }
  return geometry;
}

export type TrafficStats = {
  cruiseMoving: number;
  cruiseStatic: number;
  sailingBoats: number;
  loops: number;
  planes: number;
  trucks: number;
  panels: number;
  /** Cruceros que se quedan amarrados y por qué (para diagnóstico). */
  cruiseBlocked: Array<{ ship: number; reason: string }>;
  cruisePaths: Array<{ ship: number; lengthM: number; minClearM: number; worstAtM: number }>;
};

export type Traffic = {
  group: THREE.Group;
  update: (elapsed: number, reduceMotion: boolean) => void;
  /** Reaplica el estado del mercado a los paneles. */
  setMarket: (views: UnitView[], textureFor: (unitId: string, key: string) => THREE.Texture | null) => void;
  /** Panel bajo el rayo, si lo hay. */
  pick: (raycaster: THREE.Raycaster) => { unitId: string; distance: number } | null;
  /** Posición actual de un panel en el mundo (para comprobaciones y enfoque). */
  worldPositionOf: (unitId: string) => THREE.Vector3 | null;
  /** Posiciones de barcos y avionetas ahora mismo. */
  snapshot: () => {
    cruise: Array<{ id: number; x: number; z: number }>;
    planes: Array<{ x: number; y: number; z: number }>;
    trucks: Array<{ x: number; z: number }>;
    sailers: number;
  };
  /** ¿Es una unidad móvil de este tráfico? */
  hasUnit: (unitId: string) => boolean;
  stats: TrafficStats;
  dispose: () => void;
};

export function buildTraffic(options: {
  ships: Ships;
  config: TrafficConfig;
  mobile: boolean;
  waterLevel: number;
  seed: number;
  radiusM: number;
  /** Calzadas por las que circulan los camiones (de `buildRoutes`). */
  routes?: Route[];
  /** Punto hacia el que se prefiere colocar los camiones (el centro de la zona nítida). */
  focus?: [number, number];
}): Traffic {
  const { ships, config, waterLevel, radiusM } = options;
  const random = seededRandom(options.seed ^ 0x7a11c3);
  const group = new THREE.Group();
  group.name = "trafico";
  const geometries: THREE.BufferGeometry[] = [];
  const panels: Panel[] = [];
  const panelMaterials: THREE.MeshBasicMaterial[] = [];
  const extraMaterials: THREE.Material[] = [];
  const pickables: THREE.Mesh[] = [];
  const sea: SeaMap = ships.sea;

  const addPanel = (
    unitId: string,
    kind: PanelKind,
    parent: THREE.Object3D,
    size: [number, number],
    at: [number, number, number],
    sides: Array<1 | -1>,
    options2: { hideWhenFree: boolean; segments?: number },
  ): Panel => {
    const panel: Panel = { unitId, kind, aspect: size[0] / size[1], meshes: [], flutter: [], hideWhenFree: options2.hideWhenFree };
    const material = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.FrontSide });
    panelMaterials.push(material);
    for (const side of sides) {
      const geometry = quadGeometry(options2.segments ?? 1, false);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(size[0], size[1], 1);
      mesh.position.set(at[0], at[1], at[2] + side * (kind === "sail" ? 0.004 : kind === "truck" ? 0.03 : 0.15));
      if (side === -1) mesh.rotation.y = Math.PI;
      mesh.renderOrder = 18;
      mesh.name = unitId;
      mesh.userData.unitId = unitId;
      if (options2.segments) panel.flutter.push(geometry);
      parent.add(mesh);
      panel.meshes.push(mesh);
      pickables.push(mesh);
    }
    panels.push(panel);
    return panel;
  };

  /* ------------------------------------------------------------- cruceros */
  type Cruise = { path: Path | null; record: Ships["cruise"][number]; voyage: Voyage };
  const cruises: Cruise[] = [];
  const goals: Array<[number, number]> = [];
  const pathInfo: TrafficStats["cruisePaths"] = [];
  const blocked: TrafficStats["cruiseBlocked"] = [];
  ships.cruise.forEach((record, index) => {
    const { base, water, lengthM, config: ship } = record;
    const hullTop = cruiseHullTop(ship.heightM);
    // Paneles del casco: la mitad a estribor (+z) y la mitad a babor (−z).
    const perSide = Math.max(1, Math.floor(config.cruisePanelsPerShip / 2));
    const straight = lengthM * 0.56;
    const width = (straight / perSide) * 0.9;
    const height = hullTop * 0.78;
    for (let n = 0; n < perSide * 2; n += 1) {
      const side: 1 | -1 = n < perSide ? 1 : -1;
      const slot = n % perSide;
      const x = -straight / 2 + (slot + 0.5) * (straight / perSide);
      addPanel(
        `s:cruise-${record.id}:${n}`,
        "ship",
        record.mesh,
        [width, height],
        [x, hullTop * 0.54, side * (ship.beamM / 2 + 0.05)],
        [side],
        { hideWhenFree: false },
      );
    }

    // Ruta: del atraque al agua libre y de ahí a varios puntos de mar abierto,
    // distintos para cada barco, antes de volver. Todo por A* sobre agua libre.
    let path: Path | null = null;
    let entry: [number, number] | null = null;
    for (let d = 0; d <= 260; d += 8) {
      const x = base[0] + water[0] * d;
      const z = base[1] + water[1] * d;
      if (sea.clearanceAt(x, z) >= 12) {
        entry = [x, z];
        break;
      }
    }
    if (!entry) blocked.push({ ship: record.id, reason: "sin agua libre junto al atraque" });
    if (entry) {
      const reachable = reachableCells(sea, entry, 12);
      const mine: Array<[number, number]> = [];
      const candidates: Array<{ cell: number; score: number; x: number; z: number }> = [];
      for (const cell of reachable) {
        const clear = sea.clear[cell]!;
        if (clear < 90) continue;
        const [x, z] = sea.centreOf(cell);
        if (Math.hypot(x, z) > radiusM - 120) continue;
        const away = Math.hypot(x - base[0], z - base[1]);
        if (away < 350 || away > 1250) continue;
        candidates.push({ cell, score: Math.min(clear, 300) - away * 0.03, x, z });
      }
      candidates.sort((p, q) => q.score - p.score);
      // Hasta tres destinos: se elige al azar entre los mejores, separados entre sí y de los de otros barcos.
      const pool = candidates.slice(0, 60);
      for (let n = 0; n < 3 && pool.length > 0; n += 1) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const pick = pool[Math.floor(random() * pool.length)]!;
          if (mine.some((g) => Math.hypot(g[0] - pick.x, g[1] - pick.z) < 320)) continue;
          if (goals.some((g) => Math.hypot(g[0] - pick.x, g[1] - pick.z) < 200)) continue;
          mine.push([pick.x, pick.z]);
          break;
        }
      }
      if (mine.length === 0) blocked.push({ ship: record.id, reason: "sin destino en mar abierto" });
      const stops: Array<[number, number]> = [];
      let from: [number, number] = entry;
      const legs: Array<Array<[number, number]>> = [];
      for (const goal of mine) {
        const leg = findSeaPath(sea, from, goal, 12, 80);
        if (!leg || leg.length < 2) {
          blocked.push({ ship: record.id, reason: `sin ruta a ${Math.round(goal[0])},${Math.round(goal[1])} desde ${Math.round(from[0])},${Math.round(from[1])}` });
          continue;
        }
        legs.push(leg);
        stops.push(goal);
        from = goal;
      }
      if (legs.length > 0) {
        // Vuelta al agua junto al atraque; si no hay ruta de vuelta, se deshace la última pierna.
        const home = findSeaPath(sea, from, entry, 12, 80);
        if (home && home.length >= 2) {
          const raw: Array<[number, number]> = [[base[0], base[1]], entry];
          for (const leg of legs) raw.push(...leg.slice(1));
          raw.push(...home.slice(1));
          raw.push([base[0], base[1]]);
          path = makePath(smoothPath(raw, 2));
          for (const goal of stops) goals.push(goal);
          let minClear = Infinity;
          let worstAt = 0;
          // Se mide fuera del atraque (los primeros 150 m salen del muelle, por definición cerca de tierra).
          for (let d = 150; d <= path.length - 150; d += 40) {
            const p = samplePath(path, d);
            const clearance = sea.clearanceAt(p.x, p.z);
            if (clearance < minClear) {
              minClear = clearance;
              worstAt = d;
            }
          }
          pathInfo.push({ ship: record.id, lengthM: Math.round(path.length), minClearM: Math.round(minClear), worstAtM: worstAt });
        } else {
          blocked.push({ ship: record.id, reason: "sin ruta de vuelta al atraque" });
        }
      }
    }
    const total = path && path.length > 200 ? path.length : 0;
    cruises.push({
      path: total > 0 ? path : null,
      record,
      // Cada barco empieza amarrado y zarpa escalonado: el primero enseguida, los demás cada ~2 minutos.
      voyage: { dwellS: config.cruiseCycleSeconds * 0.35, total, leadS: 50 + index * 130 },
    });
  });

  /* ----------------------------------------------------- barcos que navegan */
  const budget = options.mobile ? config.movingBoats.mobile : config.movingBoats.desktop;
  type Loop = { cx: number; cz: number; r: number };
  const loops: Loop[] = [];
  const wanted = Math.ceil(budget / 2);
  const cells: number[] = [];
  for (let cell = 0; cell < sea.clear.length; cell += 1) if (sea.clear[cell]! >= 150) cells.push(cell);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  for (const cell of cells) {
    if (loops.length >= wanted) break;
    const [x, z] = sea.centreOf(cell);
    if (Math.hypot(x, z) > radiusM - 160) continue;
    if (loops.some((l) => Math.hypot(l.cx - x, l.cz - z) < 140)) continue;
    const room = sea.clear[cell]! - 40;
    const r = Math.min(300, room);
    if (r < 90) continue;
    loops.push({ cx: x, cz: z, r: r * (0.7 + random() * 0.3) });
  }

  type Sailer = {
    mesh: THREE.Mesh;
    loop: Loop;
    phase: number;
    direction: 1 | -1;
    speed: number;
    heel: number;
    sail: boolean;
  };
  const sailers: Sailer[] = [];
  const sailGeometry = buildSailboatGeometry();
  const launchGeometry = buildLaunchGeometry();
  geometries.push(sailGeometry, launchGeometry);
  let sailUnit = 1;
  const sailPanel = (parent: THREE.Object3D) => {
    if (sailUnit > config.sailUnits) return;
    addPanel(`v:${sailUnit}`, "sail", parent, [0.26, 0.42], [-0.17, 0.42, 0], [1, -1], { hideWhenFree: true });
    sailUnit += 1;
  };
  if (loops.length > 0) {
    for (let i = 0; i < budget; i += 1) {
      const sail = random() < 0.7;
      const length = (9 + random() * 5) * (sail ? 1.25 : 1);
      const mesh = new THREE.Mesh(sail ? sailGeometry : launchGeometry, ships.material);
      mesh.scale.setScalar(length);
      mesh.rotation.order = "YXZ";
      mesh.frustumCulled = false;
      mesh.name = sail ? "velero-navegando" : "lancha-navegando";
      group.add(mesh);
      if (sail) sailPanel(mesh);
      sailers.push({
        mesh,
        loop: loops[i % loops.length]!,
        phase: random() * Math.PI * 2,
        direction: random() < 0.5 ? 1 : -1,
        speed: sail ? 3.2 + random() * 2.2 : 6 + random() * 3,
        heel: sail ? 0.1 + random() * 0.06 : 0.02,
        sail,
      });
    }
  }
  // Las velas que sobran cuelgan de los veleros amarrados.
  for (const moored of ships.mooredSails) {
    if (sailUnit > config.sailUnits) break;
    const anchor = new THREE.Group();
    anchor.position.set(moored.x, waterLevel, moored.z);
    anchor.rotation.y = moored.yaw;
    anchor.scale.setScalar(moored.length);
    group.add(anchor);
    sailPanel(anchor);
  }

  /* ------------------------------------------------------------ avionetas */
  const planeBuilder = new MeshBuilder();
  const white = hexToNumber("#f4f1ea");
  const red = hexToNumber("#c0432a");
  const dark = hexToNumber("#2b3138");
  box(planeBuilder, 0, 0, 0, 8, 1.7, 1.7, white);
  box(planeBuilder, 1, 1.5, 0, 1.8, 0.28, 11.5, white);
  box(planeBuilder, 1, 0.9, 0, 0.5, 0.6, 0.5, dark);
  box(planeBuilder, -3.9, 0.3, 0, 1.6, 2.3, 0.3, red);
  box(planeBuilder, -3.9, 0.9, 0, 1.3, 0.25, 3.6, white);
  box(planeBuilder, 4.2, 0.2, 0, 0.8, 1.2, 1.2, dark);
  box(planeBuilder, 4.7, 0.1, 0, 0.12, 0.2, 3.2, dark);
  const planeGeometry = planeBuilder.build();
  geometries.push(planeGeometry);
  type Plane = { anchor: THREE.Group; orbit: number; altitude: number; phase: number; direction: 1 | -1; panel: Panel };
  const planes: Plane[] = [];
  const planeScale = 2.2;
  const bannerWidth = 40;
  const bannerHeight = 9;
  for (let i = 0; i < Math.min(config.planes, 3); i += 1) {
    const anchor = new THREE.Group();
    anchor.rotation.order = "YXZ";
    const body = new THREE.Mesh(planeGeometry, ships.material);
    body.scale.setScalar(planeScale);
    body.frustumCulled = false;
    anchor.add(body);
    // Cabo y cartel por detrás.
    const rope = new THREE.Mesh(
      (() => {
        const builder = new MeshBuilder();
        box(builder, 0, 0, 0, 1, 0.08, 0.08, dark);
        const g = builder.build();
        geometries.push(g);
        return g;
      })(),
      ships.material,
    );
    rope.scale.set(24, 1, 1);
    rope.position.set(-14, 0.5, 0);
    anchor.add(rope);
    const bannerAnchor = new THREE.Group();
    bannerAnchor.position.set(-26 - bannerWidth / 2, 0.5, 0);
    anchor.add(bannerAnchor);
    const panel = addPanel(`a:plane-${i + 1}`, "plane", bannerAnchor, [bannerWidth, bannerHeight], [0, 0, 0], [1, -1], {
      hideWhenFree: false,
      segments: 16,
    });
    // La cara trasera lleva la u invertida para que el texto no salga en espejo.
    const back = panel.meshes[1];
    if (back) {
      back.geometry.dispose();
      const flipped = quadGeometry(16, true);
      geometries.push(flipped);
      back.geometry = flipped;
      panel.flutter[1] = flipped;
    }
    group.add(anchor);
    planes.push({
      anchor,
      orbit: config.planeOrbitM[i] ?? config.planeOrbitM[0] ?? 1100,
      altitude: config.planeAltitudeM[i] ?? config.planeAltitudeM[0] ?? 250,
      phase: (i / 3) * Math.PI * 2 + 0.6,
      direction: i % 2 === 0 ? 1 : -1,
      panel,
    });
  }

  /* -------------------------------------------------------------- camiones */
  // Camiones de carga que recorren las calles despacio; la caja trasera lleva el anuncio por las dos caras.
  type Truck = { anchor: THREE.Group; agent: Agent };
  const trucks: Truck[] = [];
  const truckRoutes = options.routes ?? [];
  const TRUCK_SCALE = 1.4;
  if (truckRoutes.length > 0 && (config.trucks ?? 0) > 0) {
    const truckGeometry = buildTruckGeometry();
    geometries.push(truckGeometry);
    const truckMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    extraMaterials.push(truckMaterial);
    // Se reparten por las calles más largas, de una en una.
    // Las más largas, y de preferencia cerca del centro (es donde se mira).
    const central = (route: Route) => {
      const mid = samplePath(route.path, route.path.length / 2);
      const focus = options.focus ?? [0, 0];
      return Math.hypot(mid.x - focus[0], mid.z - focus[1]);
    };
    const longest = [...truckRoutes]
      .filter((route) => route.path.length >= 110)
      .sort((a, b) => central(a) - central(b))
      .slice(0, Math.max((config.trucks ?? 0) * 3, 12));
    for (let i = 0; i < (config.trucks ?? 0); i += 1) {
      const anchor = new THREE.Group();
      anchor.name = `camion-${i + 1}`;
      anchor.scale.setScalar(TRUCK_SCALE);
      const body = new THREE.Mesh(truckGeometry, truckMaterial);
      body.frustumCulled = false;
      anchor.add(body);
      const id = `t:${i + 1}`;
      const { width, height, x, y, halfBeam } = TRUCK_PANEL;
      addPanel(id, "truck", anchor, [width, height], [x, y, halfBeam], [1], { hideWhenFree: false });
      addPanel(id, "truck", anchor, [width, height], [x, y, -halfBeam], [-1], { hideWhenFree: false });
      group.add(anchor);
      trucks.push({ anchor, agent: spawnAgent(longest[i % longest.length]!, random, [2.6, 4.0], (route) => route.half * 0.4) });
    }
  }
  const placeTrucks = () => {
    for (const truck of trucks) {
      const { x, z, yaw } = agentPose(truck.agent, false);
      truck.anchor.position.set(x, 0.3, z);
      truck.anchor.rotation.y = yaw;
    }
  };
  placeTrucks();
  let truckClock = 0;

  /* ------------------------------------------------------------ movimiento */
  const PLANE_SPEED = 46;
  const update = (elapsed: number, reduceMotion: boolean) => {
    if (reduceMotion) return;
    const truckDt = Math.min(0.1, Math.max(0, elapsed - truckClock));
    truckClock = elapsed;
    if (truckDt > 0 && trucks.length > 0) {
      for (const truck of trucks) stepAgent(truck.agent, truckDt, 0.8);
      placeTrucks();
    }
    for (const cruise of cruises) {
      const { record, path, voyage } = cruise;
      if (!path) continue;
      const state = voyageAt(elapsed, voyage);
      const pose = state.moving ? voyagePose(path, record.baseYaw, record.lengthM, state.d) : null;
      const x = pose ? pose.x : record.base[0];
      const z = pose ? pose.z : record.base[1];
      record.mesh.position.x = x;
      record.mesh.position.z = z;
      record.mesh.rotation.y = pose ? pose.yaw : record.baseYaw;
      record.obstacle.cx = x;
      record.obstacle.cz = z;
      const yaw = record.mesh.rotation.y;
      record.obstacle.ux = Math.cos(yaw);
      record.obstacle.uz = -Math.sin(yaw);
    }
    for (const boat of sailers) {
      const w = (boat.speed / boat.loop.r) * boat.direction;
      const theta = boat.phase + w * elapsed;
      boat.mesh.position.set(boat.loop.cx + Math.cos(theta) * boat.loop.r, waterLevel, boat.loop.cz + Math.sin(theta) * boat.loop.r);
      boat.mesh.rotation.y = yawOf(-Math.sin(theta) * boat.direction, Math.cos(theta) * boat.direction);
      boat.mesh.rotation.x = boat.heel * boat.direction + Math.sin(elapsed * 0.8 + boat.phase) * 0.015;
    }
    for (const plane of planes) {
      const theta = plane.phase + ((PLANE_SPEED / plane.orbit) * elapsed) * plane.direction;
      plane.anchor.position.set(Math.cos(theta) * plane.orbit, plane.altitude, Math.sin(theta) * plane.orbit);
      plane.anchor.rotation.y = yawOf(-Math.sin(theta) * plane.direction, Math.cos(theta) * plane.direction);
      plane.anchor.rotation.x = 0.16 * plane.direction;
      // Ondulación del cartel: crece hacia la cola.
      for (const geometry of plane.panel.flutter) {
        const position = geometry.getAttribute("position");
        for (let v = 0; v < position.count; v += 1) {
          const along = position.getX(v) + 0.5; // 0 = cola · 1 = cabo
          position.setZ(v, Math.sin(along * 9 - elapsed * 3.2) * 0.045 * (1 - along));
        }
        position.needsUpdate = true;
      }
    }
  };
  // Pose inicial: aviones en órbita aunque el movimiento esté reducido.
  update(0, false);

  /* ---------------------------------------------------------------- mercado */
  const setMarket: Traffic["setMarket"] = (views, textureFor) => {
    const byId = new Map(views.map((view) => [view.id, view]));
    for (const panel of panels) {
      const view = byId.get(panel.unitId);
      const material = panel.meshes[0]?.material as THREE.MeshBasicMaterial | undefined;
      if (!material) continue;
      let texture: THREE.Texture | null = null;
      let visible = true;
      if (view?.owned && view.owner) {
        const key = view.owner.faces.length > 0 ? imageKeyFor("f0", view.owner.faces, view.owner.sameForAll) : null;
        texture = key ? textureFor(panel.unitId, key) : null;
        if (texture) texture.userData.isPhoto = true;
        texture ??= labelTexture({ title: view.owner.name, sub: view.owner.url.replace(/^https?:\/\//, ""), free: false, aspect: panel.aspect });
      } else {
        visible = !panel.hideWhenFree;
        const price = formatCents(view?.priceCents ?? 100);
        texture = visible ? labelTexture({ title: "Anuncia aquí", sub: price, free: true, aspect: panel.aspect }) : null;
      }
      material.map = texture;
      if (texture && texture.userData.isPhoto) {
        // Foto del anunciante: se encuadra sin deformarla en el panel (cada panel tiene su propia textura).
        const aspect = panel.aspect;
        whenImageReady(texture, (image) => {
          const [u0, v0, u1, v1] = frameUV(aspect, image, view?.owner?.framing);
          texture.repeat.set(u1 - u0, v1 - v0);
          texture.offset.set(u0, v0);
          texture.needsUpdate = false;
        });
      }
      material.color.set(texture ? 0xffffff : 0xdddddd);
      material.needsUpdate = true;
      for (const mesh of panel.meshes) mesh.visible = visible && Boolean(texture);
    }
  };

  const ownedIds = new Set(panels.map((p) => p.unitId));
  const stats: TrafficStats = {
    cruiseMoving: cruises.filter((c) => c.path).length,
    cruiseStatic: cruises.filter((c) => !c.path).length,
    sailingBoats: sailers.length,
    loops: loops.length,
    planes: planes.length,
    trucks: trucks.length,
    panels: panels.length,
    cruisePaths: pathInfo,
    cruiseBlocked: blocked,
  };

  return {
    group,
    update,
    setMarket,
    stats,
    hasUnit: (unitId) => ownedIds.has(unitId),
    worldPositionOf: (unitId) => {
      const mesh = pickables.find((candidate) => candidate.userData.unitId === unitId);
      return mesh ? mesh.getWorldPosition(new THREE.Vector3()) : null;
    },
    snapshot: () => ({
      cruise: cruises.map((c) => ({ id: c.record.id, x: c.record.mesh.position.x, z: c.record.mesh.position.z })),
      planes: planes.map((p) => ({ x: p.anchor.position.x, y: p.anchor.position.y, z: p.anchor.position.z })),
      trucks: trucks.map((t) => ({ x: t.anchor.position.x, z: t.anchor.position.z })),
      sailers: sailers.length,
    }),
    pick: (raycaster) => {
      // `visible = false` no excluye del rayo: las velas libres siguen siendo pinchables.
      const hit = raycaster.intersectObjects(pickables, false)[0];
      const unitId = hit?.object.userData.unitId as string | undefined;
      return hit && unitId ? { unitId, distance: hit.distance } : null;
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of panelMaterials) material.dispose();
      for (const material of extraMaterials) material.dispose();
    },
  };
}
