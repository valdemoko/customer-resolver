/**
 * Lógica del modo «Explorar a pie»: colisiones y movimiento del personaje. No toca three.js ni el
 * DOM, así que se prueba sin navegador.
 *
 * El suelo es plano (y = 0): los edificios son muros, el agua y el borde de la zona cubierta no se
 * cruzan, y el salto solo sirve para moverse con gracia (no se sube a los tejados). Las
 * colisiones empujan al personaje fuera del muro en vez de pararlo en seco, así que al rozar una
 * fachada se desliza a lo largo de ella.
 */

import type { HalfPlane, Ring } from "./polygon";
import { pointInRing, signedDistance } from "./polygon";

export type WaterShape = { outer: Ring; holes: Ring[] };

type Solid = { ring: Ring; minX: number; maxX: number; minZ: number; maxZ: number };

const CELL_M = 48;

function boundsOf(ring: Ring): Solid {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { ring, minX, maxX, minZ, maxZ };
}

/** Punto más cercano de un segmento a (px, pz). */
function closestOnSegment(ax: number, az: number, bx: number, bz: number, px: number, pz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return [ax + dx * t, az + dz * t];
}

export class WalkWorld {
  private readonly solids: Solid[];
  private readonly grid = new Map<string, number[]>();
  private readonly water: Array<{ box: Solid; holes: Ring[] }>;
  private readonly bounds: HalfPlane[];

  constructor(options: { buildings: Ring[]; water: WaterShape[]; bounds: HalfPlane[] }) {
    this.solids = options.buildings.filter((ring) => ring.length >= 3).map(boundsOf);
    this.water = options.water.filter((shape) => shape.outer.length >= 3).map((shape) => ({ box: boundsOf(shape.outer), holes: shape.holes }));
    this.bounds = options.bounds;
    this.solids.forEach((solid, index) => {
      for (let cx = Math.floor(solid.minX / CELL_M); cx <= Math.floor(solid.maxX / CELL_M); cx += 1) {
        for (let cz = Math.floor(solid.minZ / CELL_M); cz <= Math.floor(solid.maxZ / CELL_M); cz += 1) {
          const key = `${cx},${cz}`;
          const list = this.grid.get(key);
          if (list) list.push(index);
          else this.grid.set(key, [index]);
        }
      }
    });
  }

  /** Edificios cuyas celdas tocan el círculo (x, z, radius). */
  private near(x: number, z: number, radius: number): Solid[] {
    const seen = new Set<number>();
    const found: Solid[] = [];
    for (let cx = Math.floor((x - radius) / CELL_M); cx <= Math.floor((x + radius) / CELL_M); cx += 1) {
      for (let cz = Math.floor((z - radius) / CELL_M); cz <= Math.floor((z + radius) / CELL_M); cz += 1) {
        for (const index of this.grid.get(`${cx},${cz}`) ?? []) {
          if (seen.has(index)) continue;
          seen.add(index);
          const solid = this.solids[index]!;
          if (x + radius < solid.minX || x - radius > solid.maxX || z + radius < solid.minZ || z - radius > solid.maxZ) continue;
          found.push(solid);
        }
      }
    }
    return found;
  }

  inBounds(x: number, z: number): boolean {
    return this.bounds.length === 0 || signedDistance(this.bounds, x, z) <= 0; // negativa = dentro
  }

  inWater(x: number, z: number): boolean {
    for (const { box, holes } of this.water) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (!pointInRing([x, z], box.ring)) continue;
      if (holes.some((hole) => pointInRing([x, z], hole))) continue;
      return true;
    }
    return false;
  }

  /** ¿Se puede estar aquí? Ni dentro de un edificio (con holgura de `radius`), ni en el agua, ni fuera de la zona. */
  blocked(x: number, z: number, radius: number): boolean {
    if (!this.inBounds(x, z) || this.inWater(x, z)) return true;
    for (const solid of this.near(x, z, radius)) {
      if (pointInRing([x, z], solid.ring)) return true;
      const ring = solid.ring;
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const [qx, qz] = closestOnSegment(a[0], a[1], b[0], b[1], x, z);
        if ((qx - x) ** 2 + (qz - z) ** 2 < radius * radius) return true;
      }
    }
    return false;
  }

  /**
   * Saca el círculo de los muros empujándolo por la normal del lado más cercano. Devuelve la
   * posición corregida (la misma si no tocaba nada).
   */
  pushOut(x: number, z: number, radius: number): [number, number] {
    let px = x;
    let pz = z;
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false;
      for (const solid of this.near(px, pz, radius)) {
        const ring = solid.ring;
        const inside = pointInRing([px, pz], ring);
        let best = Infinity;
        let bx = 0;
        let bz = 0;
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const [qx, qz] = closestOnSegment(a[0], a[1], b[0], b[1], px, pz);
          const d = (qx - px) ** 2 + (qz - pz) ** 2;
          if (d < best) {
            best = d;
            bx = qx;
            bz = qz;
          }
        }
        const distance = Math.sqrt(best);
        if (!inside && distance >= radius) continue;
        // Dirección desde el punto más cercano del muro hacia fuera. Dentro del edificio es la contraria.
        let nx = px - bx;
        let nz = pz - bz;
        const length = Math.hypot(nx, nz);
        if (length < 1e-6) continue;
        nx /= length;
        nz /= length;
        if (inside) {
          nx = -nx;
          nz = -nz;
        }
        const push = inside ? distance + radius : radius - distance;
        px += nx * push;
        pz += nz * push;
        moved = true;
      }
      if (!moved) break;
    }
    return [px, pz];
  }

  /**
   * Mueve de (x, z) a (x + dx, z + dz) deslizando por los muros. El agua y el borde de la zona no
   * se cruzan: si el destino cae en ellos se intenta cada eje por separado.
   */
  move(x: number, z: number, dx: number, dz: number, radius: number): [number, number] {
    const walkable = (tx: number, tz: number) => this.inBounds(tx, tz) && !this.inWater(tx, tz);
    let nx = x + dx;
    let nz = z + dz;
    if (!walkable(nx, nz)) {
      if (walkable(x + dx, z)) {
        nx = x + dx;
        nz = z;
      } else if (walkable(x, z + dz)) {
        nx = x;
        nz = z + dz;
      } else {
        nx = x;
        nz = z;
      }
    }
    const [rx, rz] = this.pushOut(nx, nz, radius);
    // Si empujar nos llevó al agua o fuera de la zona, nos quedamos donde estábamos.
    return walkable(rx, rz) ? [rx, rz] : [x, z];
  }

  /** Punto libre más cercano a (x, z), en espiral. `null` si no hay ninguno en `maxRadius`. */
  findFree(x: number, z: number, radius: number, maxRadius = 120): [number, number] | null {
    if (!this.blocked(x, z, radius)) return [x, z];
    for (let ring = 2; ring <= maxRadius; ring += 2) {
      const steps = Math.max(8, Math.round(ring * 1.6));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const cx = x + Math.cos(angle) * ring;
        const cz = z + Math.sin(angle) * ring;
        if (!this.blocked(cx, cz, radius)) return [cx, cz];
      }
    }
    return null;
  }
}

/* ------------------------------------------------------------------ personaje */

export const WALKER = {
  radius: 0.45,
  walkSpeed: 4.4,
  runSpeed: 9,
  /** Aceleración en suelo y en el aire (m/s²). */
  groundAccel: 38,
  airAccel: 12,
  gravity: 19,
  jumpHeight: 1.25,
  /** Margen para saltar justo después de pisar el borde y para pulsar antes de aterrizar. */
  coyoteS: 0.1,
  bufferS: 0.12,
} as const;

export type WalkInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  jump: boolean;
};

export type WalkerState = {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  /** Hacia dónde mira el cuerpo, en radianes (0 = +x). */
  heading: number;
  grounded: boolean;
  /** Velocidad horizontal actual, en m/s. */
  speed: number;
  coyote: number;
  buffered: number;
  jumpHeld: boolean;
};

export function createWalker(x: number, z: number, heading = 0): WalkerState {
  return { x, z, y: 0, vx: 0, vz: 0, vy: 0, heading, grounded: true, speed: 0, coyote: 0, buffered: 0, jumpHeld: false };
}

const TAU = Math.PI * 2;

/** Giro más corto entre dos ángulos, en radianes. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/**
 * Avanza un paso. `cameraYaw` es hacia dónde mira la cámara (radianes, 0 = +x): «adelante» es esa
 * dirección y «izquierda/derecha» van a sus lados. Se corre con `run`, no se corre hacia atrás.
 */
export function stepWalker(state: WalkerState, input: WalkInput, cameraYaw: number, dt: number, world: WalkWorld): void {
  const step = Math.min(dt, 0.05);
  const forwardAxis = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const sideAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // Dirección deseada en el mundo: la cámara mira hacia (cos yaw, sin yaw) y su derecha es (-sin yaw, cos yaw).
  let wishX = Math.cos(cameraYaw) * forwardAxis - Math.sin(cameraYaw) * sideAxis;
  let wishZ = Math.sin(cameraYaw) * forwardAxis + Math.cos(cameraYaw) * sideAxis;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  const running = input.run && forwardAxis >= 0 && wishLength > 0;
  const top = wishLength === 0 ? 0 : running ? WALKER.runSpeed : forwardAxis < 0 && sideAxis === 0 ? WALKER.walkSpeed * 0.7 : WALKER.walkSpeed;

  // Aceleración hacia la velocidad deseada (frena igual de rápido que acelera).
  const accel = (state.grounded ? WALKER.groundAccel : WALKER.airAccel) * step;
  const goalX = wishX * top;
  const goalZ = wishZ * top;
  const diffX = goalX - state.vx;
  const diffZ = goalZ - state.vz;
  const diff = Math.hypot(diffX, diffZ);
  if (diff <= accel) {
    state.vx = goalX;
    state.vz = goalZ;
  } else {
    state.vx += (diffX / diff) * accel;
    state.vz += (diffZ / diff) * accel;
  }

  // Salto con margen antes y después.
  if (input.jump && !state.jumpHeld) state.buffered = WALKER.bufferS;
  state.jumpHeld = input.jump;
  state.buffered = Math.max(0, state.buffered - step);
  state.coyote = state.grounded ? WALKER.coyoteS : Math.max(0, state.coyote - step);
  if (state.buffered > 0 && state.coyote > 0) {
    state.vy = Math.sqrt(2 * WALKER.gravity * WALKER.jumpHeight);
    state.grounded = false;
    state.coyote = 0;
    state.buffered = 0;
  }
  // Soltar la tecla pronto corta el salto: saltos cortos y largos.
  if (!input.jump && state.vy > 0) state.vy -= WALKER.gravity * 1.5 * step;

  state.vy -= WALKER.gravity * step;
  state.y += state.vy * step;
  if (state.y <= 0) {
    state.y = 0;
    state.vy = 0;
    state.grounded = true;
  } else {
    state.grounded = false;
  }

  // Movimiento horizontal con colisiones; lo que se pierde por el muro se descuenta de la velocidad.
  const before = [state.x, state.z] as const;
  const [nx, nz] = world.move(state.x, state.z, state.vx * step, state.vz * step, WALKER.radius);
  state.x = nx;
  state.z = nz;
  if (step > 0) {
    const realVx = (nx - before[0]) / step;
    const realVz = (nz - before[1]) / step;
    // Contra un muro la velocidad real es menor que la pedida: se corta para no «empujar» acumulando.
    if (Math.hypot(realVx, realVz) < Math.hypot(state.vx, state.vz) * 0.6) {
      state.vx = realVx;
      state.vz = realVz;
    }
  }
  state.speed = Math.hypot(state.vx, state.vz);

  // El cuerpo se orienta hacia donde se mueve (suavizado), no hacia la cámara.
  if (state.speed > 0.4) {
    const target = Math.atan2(state.vz, state.vx);
    const turn = angleDelta(state.heading, target);
    const maxTurn = 14 * step;
    state.heading += Math.abs(turn) <= maxTurn ? turn : Math.sign(turn) * maxTurn;
  }
}
