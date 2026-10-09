/**
 * Barcos (B.4): cruceros amarrados y embarcaciones pequeñas en las dársenas.
 *
 * GENÉRICOS A PROPÓSITO. Los modelos son propios y sin ninguna referencia a una
 * naviera: ni nombre, ni logotipo, ni librea. Colores neutros (blanco, azul,
 * gris) con variaciones entre ellos. Casco, superestructura escalonada,
 * chimenea y franjas de ventanas: proporciones verosímiles, sin pretender ser un
 * buque concreto.
 *
 * DÓNDE VAN: los cruceros se colocan en los FRENTES DE ATRAQUE que el pipeline
 * extrae de los datos (capa `berths`, paso 03e: muelles que tocan la terminal de
 * cruceros, tramos rectos de más de 140 m), paralelos al muelle y separados de
 * él lo justo para no tocarlo. Los pequeños se colocan a ambos lados de los
 * pantalanes de las dársenas (capa `moorings`), con `InstancedMesh`.
 *
 * NO ESTORBAN: no entran en la malla de selección (el rayo los atraviesa), no
 * llevan parcelas, y solo se mueven con un balanceo mínimo del casco.
 */

import * as THREE from "three";
import type { CityFeature } from "./tiles";
import { MeshBuilder } from "./mesh";
import { patchMaterial } from "./materials";
import type { SceneUniforms } from "./materials";
import { hexToNumber } from "./palette";
import { seededRandom, pointInRing } from "./polygon";
import type { Ring } from "./polygon";
import { buildSeaMap } from "./seamap";
import type { SeaMap } from "./seamap";

export type CruiseConfig = {
  lengthM: number;
  beamM: number;
  heightM: number;
  hull: string;
  accent: string;
  deck: string;
};

export type ShipObstacle = { cx: number; cz: number; ux: number; uz: number; halfLength: number; halfBeam: number; top: number };

export type Ships = {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  /** Balanceo suave; `reduceMotion` lo deja quieto. */
  update: (elapsed: number, reduceMotion: boolean) => void;
  setSmallBoatBudget: (fraction: number) => void;
  /** Mapa del mar (distancia a tierra) para trayectorias de barcos. */
  sea: SeaMap;
  /** Cruceros colocados, con lo necesario para moverlos y colgarles paneles. */
  cruise: Array<{
    id: number;
    mesh: THREE.Mesh;
    obstacle: ShipObstacle;
    config: CruiseConfig;
    lengthM: number;
    base: [number, number];
    baseYaw: number;
    /** Normal del muelle hacia el agua. */
    water: [number, number];
  }>;
  material: THREE.Material;
  /** Posición y rumbo de los veleros amarrados (para colgarles anuncios en la vela). */
  mooredSails: Array<{ x: number; z: number; yaw: number; length: number }>;
  /** Altura de un casco en (x, z), o 0: la cámara no atraviesa un crucero. */
  heightAt: (x: number, z: number) => number;
  placements: Array<{
    berth: string;
    quay: string;
    lengthM: number;
    berthLengthM: number;
    center: [number, number];
    headingDeg: number;
    /** Fracción del casco (rejilla de comprobación) que cae sobre el mar. */
    inWaterShare: number;
    /** Hueco entre el casco y el frente de atraque, en metros. */
    quayGapM: number;
  }>;
  stats: { cruise: number; cruiseTriangles: number; smallPlaced: number; smallTriangles: number };
};

/* ------------------------------------------------------------ geometría */

export function box(
  builder: MeshBuilder,
  cx: number,
  y0: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
): void {
  const ring: Ring = [
    [cx - sx / 2, cz - sz / 2],
    [cx + sx / 2, cz - sz / 2],
    [cx + sx / 2, cz + sz / 2],
    [cx - sx / 2, cz + sz / 2],
  ];
  builder.addWalls(ring, y0, y0 + sy, color);
  builder.addPolygon({ outer: ring, holes: [] }, y0 + sy, color);
}

/** Contorno del casco visto desde arriba: popa recta, costados rectos y proa en punta. */
function hullOutline(length: number, beam: number): Ring {
  const half = beam / 2;
  const L = length / 2;
  const start = length * 0.22; // dónde empieza a estrecharse la proa
  const points: Ring = [];
  // Costado de babor, de popa a proa.
  points.push([-L, -half * 0.82]);
  points.push([start - L, -half]);
  const bowSteps = 6;
  for (let i = 1; i <= bowSteps; i += 1) {
    const t = i / bowSteps;
    points.push([L - length * 0.22 * (1 - t), -half * (1 - t ** 2.2)]);
  }
  for (let i = bowSteps - 1; i >= 1; i -= 1) {
    const t = i / bowSteps;
    points.push([L - length * 0.22 * (1 - t), half * (1 - t ** 2.2)]);
  }
  points.push([start - L, half]);
  points.push([-L, half * 0.82]);
  return points;
}

/**
 * Altura de la borda sobre el agua. Es alta a propósito (≈ 30 % del buque): el costado
 * liso es la superficie donde se pintan los paneles publicitarios, y cuanto más alto,
 * más cabe en cada uno.
 */
export function cruiseHullTop(heightM: number): number {
  return Math.max(12, heightM * 0.3);
}

function buildCruiseGeometry(config: CruiseConfig, length: number): THREE.BufferGeometry {
  const { beamM: B, heightM: H } = config;
  const hull = hexToNumber(config.hull);
  const accent = hexToNumber(config.accent);
  const deck = hexToNumber(config.deck);
  const glass = hexToNumber("#3b4f66");
  const builder = new MeshBuilder();

  const hullTop = cruiseHullTop(H);
  const outline = hullOutline(length, B);
  // Casco: del fondo (bajo el agua) a la borda.
  builder.addWalls(outline, -4, hullTop, hull);
  builder.addPolygon({ outer: outline, holes: [] }, hullTop, deck);
  // Franja de color junto a la borda.
  const stripe = outline.map(([x, z]) => [x * 1.0005, z * 1.0005] as [number, number]);
  builder.addWalls(stripe, hullTop - 1.4, hullTop - 0.3, accent);

  // Superestructura escalonada (de la cubierta hacia arriba).
  const tiers = [
    { x0: -0.43, x1: 0.2, w: 0.88, h: 0.3 },
    { x0: -0.4, x1: 0.12, w: 0.76, h: 0.26 },
    { x0: -0.33, x1: 0.02, w: 0.58, h: 0.2 },
  ];
  let y = hullTop;
  tiers.forEach((tier, index) => {
    const sx = (tier.x1 - tier.x0) * length;
    const cx = ((tier.x0 + tier.x1) / 2) * length;
    const sy = tier.h * (H - hullTop);
    box(builder, cx, y, 0, sx, sy, tier.w * B, index === 0 ? deck : index === 1 ? hull : deck);
    // Franjas de ventanas a ambos lados (dos por nivel).
    for (const side of [-1, 1]) {
      for (const f of [0.28, 0.62]) {
        box(builder, cx, y + sy * f, side * (tier.w * B * 0.5 + 0.04), sx * 0.97, Math.max(0.9, sy * 0.14), 0.12, glass);
      }
    }
    y += sy;
  });
  // Puente de mando adelantado, más ancho (las alas).
  box(builder, 0.2 * length, hullTop + (H - hullTop) * 0.3 - 1, 0, length * 0.05, 4.2, B * 0.92, deck);
  box(builder, 0.2 * length, hullTop + (H - hullTop) * 0.3 + 1.2, 0, length * 0.045, 1.4, B * 0.9, glass);

  // Chimenea: prisma octogonal estrecho, con el color de acento y la boca oscura.
  const funnelX = -0.2 * length;
  const funnelY = y;
  const funnelH = (H - hullTop) * 0.22;
  const r = B * 0.09;
  const ring: Ring = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ring.push([funnelX + Math.cos(a) * r * 1.5, Math.sin(a) * r]);
  }
  builder.addWalls(ring, funnelY, funnelY + funnelH, accent);
  builder.addPolygon({ outer: ring, holes: [] }, funnelY + funnelH, hexToNumber("#2b3138"));
  // Mástil de proa.
  box(builder, 0.31 * length, hullTop, 0, 0.7, H * 0.28, 0.7, deck);

  return builder.build();
}

/** Velero normalizado a eslora 1 (se escala por instancia). */
export function buildSailboatGeometry(): THREE.BufferGeometry {
  const builder = new MeshBuilder();
  const hull = hexToNumber("#f5f6f7");
  const trim = hexToNumber("#8a97a6");
  const outline = hullOutline(1, 0.3);
  builder.addWalls(outline, -0.04, 0.08, hull);
  builder.addPolygon({ outer: outline, holes: [] }, 0.08, hexToNumber("#d9c7a3"));
  // Mástil y vela mayor (triángulo doble cara).
  box(builder, -0.02, 0.08, 0, 0.012, 1.5, 0.012, trim);
  const sail = hexToNumber("#fbfbfa");
  const a: [number, number, number] = [-0.015, 0.14, 0];
  const b: [number, number, number] = [-0.015, 1.52, 0];
  const c: [number, number, number] = [-0.46, 0.16, 0];
  builder.addTriangle(a, b, c, sail);
  builder.addTriangle(a, c, b, sail);
  const jibA: [number, number, number] = [0.02, 0.18, 0];
  const jibB: [number, number, number] = [0.02, 1.3, 0];
  const jibC: [number, number, number] = [0.42, 0.12, 0];
  builder.addTriangle(jibA, jibB, jibC, sail);
  builder.addTriangle(jibA, jibC, jibB, sail);
  return builder.build();
}

/** Lancha normalizada a eslora 1. */
export function buildLaunchGeometry(): THREE.BufferGeometry {
  const builder = new MeshBuilder();
  const hull = hexToNumber("#f2f4f6");
  const outline = hullOutline(1, 0.32);
  builder.addWalls(outline, -0.03, 0.09, hull);
  builder.addPolygon({ outer: outline, holes: [] }, 0.09, hexToNumber("#c9ccd0"));
  box(builder, -0.08, 0.09, 0, 0.34, 0.14, 0.22, hexToNumber("#e9ecef"));
  box(builder, -0.06, 0.2, 0, 0.26, 0.05, 0.2, hexToNumber("#3b4f66"));
  return builder.build();
}

export const TINTS = [
  [1, 1, 1],
  [0.86, 0.93, 1],
  [0.9, 0.9, 0.92],
  [1, 0.96, 0.88],
  [0.8, 0.88, 0.96],
  [0.94, 0.94, 0.9],
] as const;

/* -------------------------------------------------------------- colocación */

type Berth = { id: string; quay: string; a: [number, number]; b: [number, number]; lengthM: number; side: "left" | "right" };

export function buildShips(options: {
  features: CityFeature[];
  uniforms: SceneUniforms;
  cruise: CruiseConfig[];
  smallMax: number;
  waterLevel: number;
  seed: number;
  radiusM?: number;
}): Ships {
  const { features, uniforms, cruise, waterLevel } = options;
  const group = new THREE.Group();
  group.name = "barcos";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const random = seededRandom(options.seed ^ 0x51b0a7);

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  patchMaterial(material, uniforms, { key: "ships", instanced: true });
  materials.push(material);

  /* ----------------------------------------------------------- cruceros */
  // Un frente largo cruza varias teselas y llega en trozos con el mismo `id`:
  // se reúnen y se toman los extremos más alejados (el frente es recto).
  const berthParts = new Map<
    string,
    { quay: string; length: number; side: "left" | "right"; points: Array<[number, number]>; ref: [number, number] | null }
  >();
  for (const f of features) {
    if (f.layer !== "berths") continue;
    const id = String(f.props.id ?? "");
    const entry = berthParts.get(id) ?? {
      quay: String(f.props.quay ?? ""),
      length: Number(f.props.length ?? 0),
      side: String(f.props.water_side ?? "left") as "left" | "right",
      points: [],
      ref: null as [number, number] | null,
    };
    for (const line of f.lines) {
      for (const point of line) entry.points.push([point[0], point[1]]);
      // Sentido original del frente (el lado del agua es «izquierda/derecha» de él).
      const head = line[0];
      const tail = line[line.length - 1];
      if (!entry.ref && head && tail) entry.ref = [tail[0] - head[0], tail[1] - head[1]];
    }
    berthParts.set(id, entry);
  }
  const berths: Berth[] = [];
  for (const [id, entry] of berthParts) {
    const first = entry.points[0];
    if (!first) continue;
    let a = first;
    let b = first;
    let best = -1;
    for (const p of entry.points) {
      const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (d > best) {
        best = d;
        a = p;
      }
    }
    best = -1;
    for (const p of entry.points) {
      const d = Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (d > best) {
        best = d;
        b = p;
      }
    }
    // Se conserva el SENTIDO original: los extremos se ordenan según él.
    if (entry.ref && (b[0] - a[0]) * entry.ref[0] + (b[1] - a[1]) * entry.ref[1] < 0) [a, b] = [b, a];
    berths.push({ id, quay: entry.quay, a, b, lengthM: Math.hypot(b[0] - a[0], b[1] - a[1]), side: entry.side });
  }
  berths.sort((x, y) => y.lengthM - x.lengthM);

  const seaRings: Array<{ outer: Ring; holes: Ring[] }> = [];
  for (const f of features) {
    if (f.layer === "water" && f.kind === "sea") seaRings.push(...f.polygons);
  }
  // Caja de cada fragmento de mar: descarta de un vistazo casi todos antes de
  // recorrer sus vértices (había miles de consultas contra decenas de miles de
  // vértices en la carga).
  const seaBoxes = seaRings.map((p) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [px, pz] of p.outer) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    return { minX, maxX, minZ, maxZ };
  });
  const inSea = (x: number, z: number) =>
    seaRings.some((p, index) => {
      const box = seaBoxes[index];
      if (!box || x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return false;
      return pointInRing([x, z], p.outer) && !p.holes.some((h) => pointInRing([x, z], h));
    });

  const sea = buildSeaMap(inSea, options.radiusM ?? 1400, 25);
  const cruiseRecords: Ships["cruise"] = [];
  const obstacles: ShipObstacle[] = [];
  const swayers: Array<{ object: THREE.Object3D; phase: number; roll: number; pitch: number }> = [];
  const placements: Ships["placements"] = [];
  let cruiseTriangles = 0;
  const ordered = [...cruise].sort((p, q) => q.lengthM - p.lengthM);
  ordered.forEach((config, index) => {
    const berth = berths[index];
    if (!berth) return;
    // El barco cabe en el frente con 12 m de holgura por extremo.
    const length = Math.min(config.lengthM, berth.lengthM - 24);
    if (length < 80) return;
    const geometry = buildCruiseGeometry(config, length);
    geometries.push(geometry);
    cruiseTriangles += geometry.getAttribute("position").count / 3;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `crucero-${index + 1}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // Dirección del frente y lado del agua. En la tesela las coordenadas ya van
    // en (x = este, z = sur): izquierda en (este, norte) es (dz, −dx) aquí.
    const dx = berth.b[0] - berth.a[0];
    const dz = berth.b[1] - berth.a[1];
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    let water: [number, number] = berth.side === "left" ? [uz, -ux] : [-uz, ux];
    const mid: [number, number] = [(berth.a[0] + berth.b[0]) / 2, (berth.a[1] + berth.b[1]) / 2];
    // El sentido del frente depende del orden en que llegan los trozos de tesela;
    // si al regenerar las teselas se invierte, el lado «agua» quedaría en tierra.
    // Se comprueba contra el mar y se corrige.
    const probe = (w: [number, number]) => inSea(mid[0] + w[0] * (config.beamM / 2 + 8), mid[1] + w[1] * (config.beamM / 2 + 8));
    if (!probe(water) && probe([-water[0], -water[1]])) water = [-water[0], -water[1]];
    const gap = config.beamM / 2 + 3;
    const cx = mid[0] + water[0] * gap;
    const cz = mid[1] + water[1] * gap;
    // La proa mira hacia donde se decida con la semilla: es solo una variación.
    const bow = random() < 0.5 ? 1 : -1;
    const hx = ux * bow;
    const hz = uz * bow;
    // Eje local +x del modelo → (hx, 0, hz): rotación Y de ángulo −atan2(hz, hx).
    const yaw = -Math.atan2(hz, hx);
    mesh.position.set(cx, waterLevel, cz);
    mesh.rotation.y = yaw;
    group.add(mesh);
    swayers.push({ object: mesh, phase: random() * Math.PI * 2, roll: 0.0045 + random() * 0.002, pitch: 0.0022 });
    const obstacle: ShipObstacle = {
      cx,
      cz,
      ux: hx,
      uz: hz,
      halfLength: length / 2,
      halfBeam: config.beamM / 2,
      top: waterLevel + config.heightM,
    };
    obstacles.push(obstacle);
    cruiseRecords.push({ id: index + 1, mesh, obstacle, config, lengthM: length, base: [cx, cz], baseYaw: yaw, water });
    // Comprobación de colocación: qué parte del casco (rejilla 11 × 5) cae en el mar.
    let wet = 0;
    let total = 0;
    for (let iu = 0; iu <= 10; iu += 1) {
      for (let iv = 0; iv <= 4; iv += 1) {
        const u = (iu / 10 - 0.5) * length;
        const v = (iv / 4 - 0.5) * config.beamM;
        total += 1;
        if (inSea(cx + hx * u - hz * v, cz + hz * u + hx * v)) wet += 1;
      }
    }
    placements.push({
      inWaterShare: wet / total,
      quayGapM: gap - config.beamM / 2,
      berth: berth.id,
      quay: berth.quay,
      lengthM: Math.round(length),
      berthLengthM: berth.lengthM,
      center: [cx, cz],
      headingDeg: Math.round(((Math.atan2(hz, hx) * 180) / Math.PI + 360) % 360),
    });
  });

  /* --------------------------------------------------------- pequeños */

  type Slot = { x: number; z: number; yaw: number; length: number; sail: boolean; tint: number };
  const slots: Slot[] = [];
  for (const f of features) {
    if (f.layer !== "moorings") continue;
    for (const line of f.lines) {
      // Se recorre el pantalán por tramos y a cada lado se atraca un barco.
      for (let i = 0; i < line.length - 1; i += 1) {
        const p = line[i];
        const q = line[i + 1];
        if (!p || !q) continue;
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const segment = Math.hypot(dx, dz);
        if (segment < 6) continue;
        const ux = dx / segment;
        const uz = dz / segment;
        const spacing = 5.8;
        const count = Math.floor((segment - 3) / spacing);
        for (let k = 0; k < count; k += 1) {
          const t = 2 + k * spacing + spacing / 2;
          for (const side of [-1, 1]) {
            const length = 8 + random() * 6;
            const sail = random() < 0.62;
            const offset = 1.1 + length * 0.15 + 0.35;
            const x = p[0] + ux * t + -uz * offset * side;
            const z = p[1] + uz * t + ux * offset * side;
            // Proa hacia fuera del pantalán, popa junto a él.
            const bx = -uz * side;
            const bz = ux * side;
            const centreX = x + bx * length * 0.42;
            const centreZ = z + bz * length * 0.42;
            const farX = centreX + bx * length * 0.55;
            const farZ = centreZ + bz * length * 0.55;
            if (!inSea(centreX, centreZ) || !inSea(farX, farZ)) continue;
            slots.push({
              x: centreX,
              z: centreZ,
              yaw: -Math.atan2(bz, bx),
              length,
              sail,
              tint: Math.floor(random() * TINTS.length),
            });
          }
        }
      }
    }
  }
  // Ocupación parcial determinista: no todos los amarres tienen barco.
  const occupied = slots.filter(() => random() < 0.72);
  const cap = Math.min(options.smallMax, occupied.length);
  const chosen = occupied.slice(0, cap);

  const sailGeometry = buildSailboatGeometry();
  const launchGeometry = buildLaunchGeometry();
  geometries.push(sailGeometry, launchGeometry);
  const sails = chosen.filter((s) => s.sail);
  const launches = chosen.filter((s) => !s.sail);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const meshes: THREE.InstancedMesh[] = [];
  const fill = (geometry: THREE.BufferGeometry, list: Slot[], name: string) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = name;
    list.forEach((slot, index) => {
      dummy.position.set(slot.x, waterLevel, slot.z);
      dummy.rotation.set(0, slot.yaw, 0);
      dummy.scale.setScalar(slot.length);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const tint = TINTS[slot.tint] ?? TINTS[0];
      mesh.setColorAt(index, color.setRGB(tint[0], tint[1], tint[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push(mesh);
  };
  fill(sailGeometry, sails, "veleros");
  fill(launchGeometry, launches, "lanchas");
  const smallTriangles =
    sails.length * (sailGeometry.getAttribute("position").count / 3) +
    launches.length * (launchGeometry.getAttribute("position").count / 3);
  const capacities = meshes.map((m) => m.count);

  const bobbers = swayers;
  return {
    group,
    materials,
    geometries,
    placements,
    sea,
    cruise: cruiseRecords,
    material,
    mooredSails: sails.map((slot) => ({ x: slot.x, z: slot.z, yaw: slot.yaw, length: slot.length })),
    update: (elapsed, reduceMotion) => {
      if (reduceMotion) return;
      for (const s of bobbers) {
        s.object.rotation.z = Math.sin(elapsed * 0.55 + s.phase) * s.roll;
        s.object.rotation.x = Math.sin(elapsed * 0.38 + s.phase * 1.7) * s.pitch;
      }
    },
    setSmallBoatBudget: (fraction) => {
      meshes.forEach((mesh, index) => {
        mesh.count = Math.round((capacities[index] ?? 0) * Math.min(1, Math.max(0, fraction)));
      });
    },
    heightAt: (x, z) => {
      for (const o of obstacles) {
        const rx = x - o.cx;
        const rz = z - o.cz;
        const along = rx * o.ux + rz * o.uz;
        const across = -rx * o.uz + rz * o.ux;
        if (Math.abs(along) <= o.halfLength && Math.abs(across) <= o.halfBeam) return o.top;
      }
      return 0;
    },
    stats: {
      cruise: placements.length,
      cruiseTriangles: Math.round(cruiseTriangles),
      smallPlaced: chosen.length,
      smallTriangles: Math.round(smallTriangles),
    },
  };
}
