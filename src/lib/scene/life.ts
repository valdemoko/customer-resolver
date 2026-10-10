/**
 * Vida en las calles: coches low poly que circulan despacio y peatones de cuerpo
 * redondeado (píldora) que pasean por las aceras. Y las rutas de calle que usan
 * también los camiones publicitarios (`traffic.ts`).
 *
 * REGLAS
 *  · Todo sigue calles REALES del paquete de datos (capa `streets`), nunca el
 *    vacío: una ruta es una calle larga dentro de la zona nítida.
 *  · Cada vehículo va y vuelve por su calle. Al llegar al extremo hace un cambio de
 *    sentido lento (gira 180° y cruza al otro carril), así no se ve ningún salto.
 *  · Pocos y baratos: coches e peatones son UNA malla instanciada cada una (dos
 *    llamadas de dibujo), con presupuesto menor en móvil.
 *  · Con «reducir movimiento» se colocan una vez y se quedan quietos.
 */

import * as THREE from "three";
import { MeshBuilder } from "./mesh";
import { hexToNumber } from "./palette";
import { seededRandom } from "./polygon";
import type { CityFeature } from "./tiles";
import { makePath, samplePath } from "./traffic";
import type { Path } from "./traffic";
import { box } from "./ships";

/** Nivel de la calzada: las marcas viales están a 0,30 m. */
const ROAD_Y = 0.3;
const HALF_WIDTH: Record<string, number> = { major: 5.5, minor: 3.5, other: 2.2, pedestrian: 3, path: 1.2 };

export type Route = { path: Path; kind: string; half: number };

export type FadeCircle = { cx: number; cz: number; radius: number };

/**
 * Calles largas dentro de la zona nítida. `drive` son calzadas (principales y
 * secundarias); `walk` suma las peatonales y sendas, y también las calzadas (se
 * camina por su acera).
 */
export function buildRoutes(features: CityFeature[], circle: FadeCircle): { drive: Route[]; walk: Route[] } {
  const limit = circle.radius * 0.8;
  const drive: Route[] = [];
  const walk: Route[] = [];
  for (const feature of features) {
    if (feature.layer !== "streets") continue;
    const kind = feature.kind;
    const isDrive = kind === "major" || kind === "minor";
    const isWalk = isDrive || kind === "pedestrian" || kind === "path";
    if (!isWalk) continue;
    for (const line of feature.lines) {
      if (line.length < 2) continue;
      const points = line.map((p) => [p[0], p[1]] as [number, number]);
      const path = makePath(points);
      if (path.length < (isDrive ? 70 : 45)) continue;
      const mid = samplePath(path, path.length / 2);
      if (Math.hypot(mid.x - circle.cx, mid.z - circle.cz) > limit) continue;
      const route: Route = { path, kind, half: HALF_WIDTH[kind] ?? 3 };
      if (isDrive) drive.push(route);
      walk.push(route);
    }
  }
  return { drive, walk };
}

/* ------------------------------------------------------------------ modelos */

const WHITE = 0xffffff; // la pintura: el color de instancia la tiñe
const GLASS = hexToNumber("#2b333b");
const TYRE = hexToNumber("#15181b");
const LIGHT = hexToNumber("#f2e9b8");
const TAIL = hexToNumber("#b02a2a");

/** Coche low poly: cuerpo, cabina acristalada, techo, cuatro ruedas y faros. El frente mira a +x. */
export function buildCarGeometry(): THREE.BufferGeometry {
  const builder = new MeshBuilder();
  // ruedas
  for (const x of [-1.35, 1.35]) for (const z of [-0.85, 0.85]) box(builder, x, 0, z, 0.8, 0.8, 0.34, TYRE);
  box(builder, 0, 0.3, 0, 4.2, 0.62, 1.78, WHITE); // carrocería baja
  box(builder, -0.15, 0.92, 0, 2.3, 0.62, 1.5, GLASS); // cabina
  box(builder, -0.15, 1.54, 0, 2.2, 0.12, 1.46, WHITE); // techo
  box(builder, 1.6, 0.62, 0, 0.9, 0.3, 1.7, WHITE); // capó
  box(builder, 2.12, 0.5, -0.6, 0.08, 0.2, 0.34, LIGHT);
  box(builder, 2.12, 0.5, 0.6, 0.08, 0.2, 0.34, LIGHT);
  box(builder, -2.12, 0.55, -0.6, 0.08, 0.2, 0.34, TAIL);
  box(builder, -2.12, 0.55, 0.6, 0.08, 0.2, 0.34, TAIL);
  return builder.build();
}

/** Persona: una píldora (cápsula) de pocos lados, de unos 1,45 m. */
export function buildPersonGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CapsuleGeometry(0.3, 0.85, 2, 6);
  // Origen en los pies para colocarla sobre la acera.
  geometry.translate(0, 0.3 + 0.425, 0);
  return geometry;
}

const CAR_COLORS = ["#d9503f", "#3f7fd9", "#ece7da", "#2f3a46", "#f0b83a", "#4b9b6b", "#a9aeb6", "#8a4b8f", "#ee7b30"].map((c) => new THREE.Color(c));
const SHIRTS = ["#ff7a4d", "#ffd23f", "#4fb0c6", "#e84f8c", "#7ac74f", "#f2ede3", "#6a7de8", "#e8913a"].map((c) => new THREE.Color(c));

/* ------------------------------------------------------------------ sistema */

export type Life = {
  group: THREE.Group;
  update: (elapsed: number, reduceMotion: boolean) => void;
  stats: { cars: number; people: number; driveRoutes: number; walkRoutes: number };
  /** Posiciones actuales (para comprobaciones). */
  snapshot: () => { cars: Array<{ x: number; z: number }>; people: Array<{ x: number; z: number }> };
  dispose: () => void;
};

export type Agent = {
  route: Route;
  s: number;
  /** Sentido pedido (+1 / −1) y sentido suavizado (−1…1) que hace el cambio de sentido. */
  dir: 1 | -1;
  face: number;
  speed: number;
  wait: number;
  /** Carril (coches) o acera (personas): lado fijo ±1 de personas. */
  lane: number;
  side: 1 | -1;
  phase: number;
};

export function spawnAgent(route: Route, random: () => number, speed: [number, number], lane: (route: Route) => number): Agent {
  const dir: 1 | -1 = random() < 0.5 ? 1 : -1;
  return {
    route,
    s: random() * route.path.length,
    dir,
    face: dir,
    speed: speed[0] + random() * (speed[1] - speed[0]),
    wait: 0,
    lane: lane(route),
    side: random() < 0.5 ? 1 : -1,
    phase: random() * Math.PI * 2,
  };
}

/** Avanza un agente por su calle; en los extremos espera y da la vuelta con calma. */
export function stepAgent(agent: Agent, dt: number, turnRate: number): void {
  const length = agent.route.path.length;
  if (agent.wait > 0) {
    agent.wait -= dt;
  } else {
    agent.s += agent.dir * agent.speed * dt;
    if (agent.s <= 0 || agent.s >= length) {
      agent.s = Math.min(length, Math.max(0, agent.s));
      agent.dir = agent.dir === 1 ? -1 : 1;
      agent.wait = 0.9;
    }
  }
  // El sentido suavizado persigue al pedido: aquí está el giro de 180° y el cruce de carril.
  const delta = agent.dir - agent.face;
  agent.face += Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt);
}

/** Posición y orientación (`rotation.y`) de un agente. Coches: carril del SENTIDO de marcha; personas: acera fija. */
export function agentPose(agent: Agent, walking: boolean): { x: number; z: number; yaw: number } {
  const pose = samplePath(agent.route.path, agent.s);
  // Normal derecha respecto a la tangente: (−tz, tx).
  const lateral = walking ? agent.lane * agent.side : agent.lane * agent.face;
  const forward = Math.atan2(pose.tz, pose.tx);
  // face = 1 mira a lo largo de la tangente; −1, al revés; entre medias va girando.
  return { x: pose.x - pose.tz * lateral, z: pose.z + pose.tx * lateral, yaw: -forward + ((1 - agent.face) / 2) * Math.PI };
}

const CAB = hexToNumber("#3f6fb0");
const BOX = hexToNumber("#e9e6df");
const CHASSIS = hexToNumber("#23282d");
/** Tamaño de los paneles laterales del camión (en metros del modelo, antes de la escala). */
export const TRUCK_PANEL = { width: 6.1, height: 2.35, x: -1.7, y: 2.35, halfBeam: 1.25 } as const;
/** Camión de carga: cabina azul y caja grande y blanca detrás. El frente mira a +x. */
export function buildTruckGeometry(): THREE.BufferGeometry {
  const builder = new MeshBuilder();
  for (const x of [-3.9, -2.5, 2.4]) for (const z of [-1.1, 1.1]) box(builder, x, 0, z, 1.0, 1.0, 0.42, TYRE);
  box(builder, -0.8, 0.5, 0, 7.6, 0.5, 2.0, CHASSIS); // chasis
  box(builder, -1.7, 0.95, 0, 6.6, 2.8, 2.5, BOX); // caja de carga
  box(builder, 2.45, 0.55, 0, 1.6, 2.15, 2.4, CAB); // cabina
  box(builder, 3.0, 1.55, 0, 0.5, 0.95, 2.2, GLASS); // parabrisas
  box(builder, 3.28, 0.7, -0.75, 0.06, 0.26, 0.4, LIGHT);
  box(builder, 3.28, 0.7, 0.75, 0.06, 0.26, 0.4, LIGHT);
  box(builder, -5.03, 0.8, -0.8, 0.06, 0.26, 0.4, TAIL);
  box(builder, -5.03, 0.8, 0.8, 0.06, 0.26, 0.4, TAIL);
  return builder.build();
}

export function buildLife(options: {
  features: CityFeature[];
  circle: FadeCircle;
  seed: number;
  mobile: boolean;
  /** Rutas ya calculadas (las comparte con los camiones); si no, se calculan aquí. */
  routes?: { drive: Route[]; walk: Route[] };
  cars?: number;
  people?: number;
}): Life {
  const random = seededRandom(options.seed ^ 0x51f3e9);
  const routes = options.routes ?? buildRoutes(options.features, options.circle);
  const group = new THREE.Group();
  group.name = "vida-urbana";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const carCount = routes.drive.length === 0 ? 0 : (options.cars ?? (options.mobile ? 34 : 80));
  const peopleCount = routes.walk.length === 0 ? 0 : (options.people ?? (options.mobile ? 26 : 64));

  const carGeometry = buildCarGeometry();
  const personGeometry = buildPersonGeometry();
  geometries.push(carGeometry, personGeometry);
  const carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const personMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  materials.push(carMaterial, personMaterial);

  const carMesh = new THREE.InstancedMesh(carGeometry, carMaterial, Math.max(1, carCount));
  const personMesh = new THREE.InstancedMesh(personGeometry, personMaterial, Math.max(1, peopleCount));
  for (const mesh of [carMesh, personMesh]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  carMesh.name = "coches";
  personMesh.name = "peatones";
  carMesh.count = carCount;
  personMesh.count = peopleCount;
  group.add(carMesh, personMesh);

  const spawn = (list: Route[], count: number, speed: [number, number], lane: (route: Route) => number): Agent[] =>
    Array.from({ length: count }, (_, index) => spawnAgent(list[index % list.length]!, random, speed, lane));

  const cars = spawn(routes.drive, carCount, [3.2, 5.6], (route) => route.half * 0.38);
  const people = spawn(routes.walk, peopleCount, [0.9, 1.5], (route) => route.half + 0.9);
  for (const agent of [...cars, ...people]) agent.face = agent.dir;
  cars.forEach((_, i) => carMesh.setColorAt(i, CAR_COLORS[i % CAR_COLORS.length]!));
  people.forEach((_, i) => personMesh.setColorAt(i, SHIRTS[(i * 3 + 1) % SHIRTS.length]!));
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
  if (personMesh.instanceColor) personMesh.instanceColor.needsUpdate = true;

  const dummy = new THREE.Object3D();
  const CAR_SCALE = 1.35; // un poco mayores que la realidad para que se lean desde la cámara
  const PERSON_SCALE = 1.5;
  const positions = { cars: [] as Array<{ x: number; z: number }>, people: [] as Array<{ x: number; z: number }> };

  const place = (mesh: THREE.InstancedMesh, index: number, agent: Agent, y: number, scale: number, walking: boolean, elapsed: number) => {
    const { x, z, yaw } = agentPose(agent, walking);
    const bob = walking ? Math.abs(Math.sin(elapsed * agent.speed * 3.4 + agent.phase)) * 0.07 : 0;
    dummy.position.set(x, y + bob, z);
    dummy.rotation.set(0, yaw, walking ? Math.sin(elapsed * agent.speed * 3.4 + agent.phase) * 0.07 : 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    return { x, z };
  };

  let last = 0;
  const render = (elapsed: number) => {
    positions.cars.length = 0;
    positions.people.length = 0;
    cars.forEach((agent, i) => positions.cars.push(place(carMesh, i, agent, ROAD_Y, CAR_SCALE, false, elapsed)));
    people.forEach((agent, i) => positions.people.push(place(personMesh, i, agent, ROAD_Y, PERSON_SCALE, true, elapsed)));
    carMesh.instanceMatrix.needsUpdate = true;
    personMesh.instanceMatrix.needsUpdate = true;
  };

  const update = (elapsed: number, reduceMotion: boolean) => {
    if (reduceMotion) return;
    const dt = Math.min(0.1, Math.max(0, elapsed - last));
    last = elapsed;
    if (dt > 0) {
      for (const agent of cars) stepAgent(agent, dt, 1.1);
      for (const agent of people) stepAgent(agent, dt, 4);
    }
    render(elapsed);
  };
  // Pose inicial: se ven aunque el movimiento esté reducido.
  render(0);

  return {
    group,
    update,
    stats: { cars: carCount, people: peopleCount, driveRoutes: routes.drive.length, walkRoutes: routes.walk.length },
    snapshot: () => ({ cars: [...positions.cars], people: [...positions.people] }),
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      carMesh.dispose();
      personMesh.dispose();
    },
  };
}

