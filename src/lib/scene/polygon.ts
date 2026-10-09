/**
 * Polígono de cobertura de la ciudad y operaciones de polígono.
 *
 * CONVENIO: los anillos son ABIERTOS (el último punto no repite al primero) y
 * van en sentido ANTIHORARIO en el plano (x, z) del mundo. Repetir el cierre en
 * unos sitios y no en otros es la clase de detalle que produce una cara mal
 * triangulada y una tarde de depuración, así que se fija aquí y se respeta en
 * todo el proyecto.
 *
 * EL POLÍGONO DE COBERTURA ES CONVEXO: el recorte de geometría es Sutherland–
 * Hodgman, que solo es correcto contra un recorte convexo. `isConvex` lo
 * comprueba en la configuración de la ciudad y en un test.
 */

import earcut from "earcut";

export type Ring = Array<[number, number]>;

/** PRNG determinista (mulberry32). Dos ejecuciones dan el mismo resultado. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Área con signo. Positiva si el anillo va en sentido antihorario. */
export function signedArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

export function polygonArea(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

export function isCounterClockwise(ring: Ring): boolean {
  return signedArea(ring) > 0;
}

/** Fuerza el sentido antihorario, que es el que asume el resto del módulo. */
export function ensureCounterClockwise(ring: Ring): Ring {
  return isCounterClockwise(ring) ? ring : ring.slice().reverse();
}

/** ¿Es convexo? Sin cambios de signo en el producto vectorial de aristas. */
export function isConvex(ring: Ring): boolean {
  const n = ring.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const c = ring[(i + 2) % n];
    if (!a || !b || !c) return false;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross === 0) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
}

/** Casco convexo por cadena monótona de Andrew. Devuelve un anillo abierto. */
export function convexHull(points: Ring): Ring {
  if (points.length < 3) return points.slice();
  const sorted = points
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const build = (input: Ring): Ring => {
    const stack: Ring = [];
    for (const point of input) {
      while (stack.length >= 2) {
        const last = stack[stack.length - 1];
        const previous = stack[stack.length - 2];
        if (!last || !previous) break;
        if (cross(previous, last, point) <= 0) stack.pop();
        else break;
      }
      stack.push(point);
    }
    stack.pop();
    return stack;
  };

  const lower = build(sorted);
  const upper = build(sorted.slice().reverse());
  return ensureCounterClockwise([...lower, ...upper]);
}

/**
 * Semiplanos de un polígono convexo antihorario: cada arista se expresa como
 * `nx·x + nz·z ≤ c` (dentro). La distancia con signo de un punto al polígono es
 * el MÁXIMO de `nx·x + nz·z − c` sobre las aristas: negativa dentro, positiva
 * fuera. La misma función se evalúa en JavaScript y en el shader, así que el
 * difuminado de los bordes y el recorte de la geometría no pueden discrepar.
 */
export type HalfPlane = { nx: number; nz: number; c: number };

export function halfPlanes(ring: Ring): HalfPlane[] {
  const planes: HalfPlane[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    // Anillo antihorario en (x, z): la normal hacia fuera es (dz, -dx).
    const nx = dz / length;
    const nz = -dx / length;
    planes.push({ nx, nz, c: nx * a[0] + nz * a[1] });
  }
  return planes;
}

/** Distancia con signo al polígono convexo: < 0 dentro, > 0 fuera. */
export function signedDistance(planes: HalfPlane[], x: number, z: number): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const plane of planes) {
    const d = plane.nx * x + plane.nz * z - plane.c;
    if (d > max) max = d;
  }
  return max;
}

/**
 * Polígono convexo ampliado `distanceM` hacia fuera (vértices en ingletes).
 * Es el recorte de la geometría: lo que queda más allá de la banda de
 * difuminado ya es niebla pura y no hace falta construirlo.
 */
export function offsetConvex(ring: Ring, distanceM: number): Ring {
  const planes = halfPlanes(ring).map((plane) => ({ ...plane, c: plane.c + distanceM }));
  const out: Ring = [];
  for (let index = 0; index < planes.length; index += 1) {
    const p = planes[(index + planes.length - 1) % planes.length];
    const q = planes[index];
    if (!p || !q) continue;
    const det = p.nx * q.nz - p.nz * q.nx;
    if (Math.abs(det) < 1e-9) continue;
    out.push([(p.c * q.nz - p.nz * q.c) / det, (p.nx * q.c - p.c * q.nx) / det]);
  }
  return ensureCounterClockwise(out);
}

/** Recorte de un polígono contra un polígono CONVEXO (Sutherland–Hodgman). */
export function clipToConvex(subject: Ring, clip: Ring): Ring {
  if (subject.length < 3) return [];
  let output: Ring = subject.slice();

  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b) continue;
    const input = output;
    output = [];
    if (input.length === 0) break;

    const side = (point: [number, number]) =>
      (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      if (!current || !previous) continue;
      const currentSide = side(current);
      const previousSide = side(previous);
      if (currentSide >= 0) {
        if (previousSide < 0) {
          const t = previousSide / (previousSide - currentSide);
          output.push([
            previous[0] + t * (current[0] - previous[0]),
            previous[1] + t * (current[1] - previous[1]),
          ]);
        }
        output.push(current);
      } else if (previousSide >= 0) {
        const t = previousSide / (previousSide - currentSide);
        output.push([
          previous[0] + t * (current[0] - previous[0]),
          previous[1] + t * (current[1] - previous[1]),
        ]);
      }
    }
  }

  return output.length >= 3 ? ensureCounterClockwise(output) : [];
}

/** Recorta una lista de anillos y descarta lo que queda por debajo del umbral. */
export function clipRings(rings: Ring[], clip: Ring, minAreaM2 = 0.5): Ring[] {
  const kept: Ring[] = [];
  for (const ring of rings) {
    const clipped = clipToConvex(ring, clip);
    if (clipped.length >= 3 && polygonArea(clipped) >= minAreaM2) kept.push(clipped);
  }
  return kept;
}

export function pointInRing(point: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > point[1] !== b[1] > point[1]) {
      const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

/** Índices de triángulos (earcut) para un anillo ya en metros. */
export function triangulateRing(ring: Ring, holes: Ring[] = []): number[] {
  const flat: number[] = [];
  for (const point of ring) flat.push(point[0], point[1]);
  const holeIndices: number[] = [];
  for (const hole of holes) {
    if (hole.length < 3) continue;
    holeIndices.push(flat.length / 2);
    for (const point of hole) flat.push(point[0], point[1]);
  }
  return triangulateFlat(flat, holeIndices);
}

/**
 * earcut trabaja con una lista plana [x0, z0, x1, z1, …].
 *
 * POR QUÉ EARCUT Y NO UN ABANICO: la zona de recorte es convexa, pero las
 * huellas de los edificios y los polígonos de agua y de verde NO lo son. Un
 * abanico sobre un polígono cóncavo genera triángulos que salen fuera de la
 * huella, y el resultado se ve como edificios con esquinas de cristal. earcut
 * resuelve la concavidad de verdad.
 */
export function triangulateFlat(flat: number[], holes: number[] = []): number[] {
  return holes.length > 0 ? earcut(flat, holes) : earcut(flat);
}

/** Área de un anillo en m² a partir de su área con signo (ya en metros). */
export function ringAreaM2(ring: Ring): number {
  return polygonArea(ring);
}

export function ringCentroid(ring: Ring): [number, number] {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  return [x / ring.length, z / ring.length];
}

/**
 * Quita los vértices repetidos o casi repetidos (menos de `toleranceM`).
 *
 * Las huellas de OpenStreetMap, tras pasar por teselas, traen vértices
 * duplicados. `earcut` no falla con ellos: triangula SOLO UNA PARTE del polígono
 * y devuelve un tejado a medias sin ningún aviso. Se descubrió pinchando sobre
 * la catedral, cuya mitad este no respondía al ratón.
 */
export function dedupeRing(ring: Ring, toleranceM = 0.08): Ring {
  const out: Ring = [];
  for (const point of ring) {
    const last = out[out.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < toleranceM) continue;
    out.push(point);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < toleranceM) out.pop();
    else break;
  }
  return out.length >= 3 ? out : ring;
}

/** Reduce un anillo a los vértices que aportan forma, sin rectas intermedias. */
export function simplifyCollinear(ring: Ring, toleranceM2 = 0.25): Ring {
  if (ring.length <= 3) return ring;
  const kept: Ring = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[(i + ring.length - 1) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    if (!a || !b || !c) continue;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > toleranceM2) kept.push(b);
  }
  return kept.length >= 3 ? kept : ring;
}

/**
 * Polígono regular centrado en (cx, cz) que aproxima un círculo.
 *
 * `inscribed`: sus vértices están SOBRE el círculo (queda dentro; sirve para
 * limitar la cámara). `circumscribed`: sus lados son tangentes (contiene al
 * círculo; sirve para recortar sin cortar nada visible). Con 128 lados la
 * diferencia con el círculo ideal es de 0,03 % del radio.
 */
export function regularPolygon(
  radius: number,
  sides = 128,
  mode: "inscribed" | "circumscribed" = "inscribed",
  cx = 0,
  cz = 0,
): Ring {
  const r = mode === "inscribed" ? radius : radius / Math.cos(Math.PI / sides);
  const ring: Ring = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
  }
  return ensureCounterClockwise(ring);
}
