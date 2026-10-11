/**
 * Caras de una unidad: lo que el comprador rellena con una foto.
 *
 * · Edificio: cada LADO de la huella es una cara `f0`, `f1`…, en el orden del
 *   contorno. Un lado reúne las paredes seguidas que miran hacia el mismo sitio:
 *   una fachada curva, con pequeños quiebros o con escalones cortos es UNA cara y
 *   la foto se reparte entera a lo largo de todo el lado (no un trozo por pared).
 *   Se descartan los lados de menos de 2,5 m; si quedan más de 12, se conservan
 *   los 12 más largos (el resto sigue siendo pared sin anuncio).
 * · Tramo de muralla: dos caras, `f0` (a un lado) y `f1` (al otro).
 * · Local, panel de crucero, vela y cartel de avioneta: una sola cara `f0`.
 *
 * Los identificadores de cara salen de la geometría, así que son estables
 * mientras los datos no cambien. La MISMA función la usan el visor (para pintar
 * las fotos) y el estudio de compra (para dejar elegir la cara).
 */

import type { Ring } from "@/lib/scene/polygon";
import { ensureCounterClockwise, simplifyCollinear } from "@/lib/scene/polygon";

export type Face = {
  id: string;
  a: [number, number];
  b: [number, number];
  /** Normal hacia fuera, en el plano (x, z). */
  normal: [number, number];
  widthM: number;
  /** Número de orden en el contorno, para etiquetar («Cara 3»). */
  order: number;
  /**
   * Lado con quiebros o escalones: la poligonal de `a` a `b` que sigue la huella (incluye ambos extremos). Si
   * no está, la cara es el segmento recto `a`→`b`. `widthM` es el ancho del lado medido a lo largo de él.
   */
  path?: Array<[number, number]>;
};

export const MAX_BUILDING_FACES = 12;
export const MIN_FACE_WIDTH_M = 2.5;
/** Giro entre dos paredes seguidas a partir del cual hay una esquina (empieza otro lado). */
const CORNER_DEG = 35;
/** Giro acumulado máximo dentro de un lado: una torre redonda se reparte en varias caras. */
const RUN_DEG = 80;
/** Un tramo corto entre dos lados que miran igual (un escalón de la fachada) no los separa. */
const STEP_MAX_M = 5;
/** Dos lados «miran igual» si sus normales difieren menos de esto. */
const SAME_SIDE_DEG = 30;
/** Pared que avanza menos de esta fracción de su largo a lo largo del lado: es un escalón, no lleva foto. */
const STEP_PROJECTION = 0.4;
const RAD = 180 / Math.PI;

const TAU = Math.PI * 2;
function turnBetween(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

export function buildingFaces(footprint: Ring): Face[] {
  const ring = simplifyCollinear(ensureCounterClockwise(footprint), 0.6);
  type Edge = { a: [number, number]; b: [number, number]; len: number; angle: number };
  let edges: Edge[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    edges.push({ a, b, len, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }
  if (edges.length < 3) return [];
  // El primer lado empieza en una esquina para que ninguno quede partido por el principio del contorno.
  const corner = edges.findIndex((edge, i) => Math.abs(turnBetween(edges[(i + edges.length - 1) % edges.length]!.angle, edge.angle)) * RAD > CORNER_DEG);
  if (corner > 0) edges = [...edges.slice(corner), ...edges.slice(0, corner)];

  // 1) Paredes seguidas que giran poco entre sí.
  let runs: Edge[][] = [];
  for (const edge of edges) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    const sharp = !run || !last || Math.abs(turnBetween(last.angle, edge.angle)) * RAD > CORNER_DEG || Math.abs(turnBetween(run[0]!.angle, edge.angle)) * RAD > RUN_DEG;
    if (sharp) runs.push([edge]);
    else run.push(edge);
  }
  // 2) Un tramo corto entre dos lados que miran igual es un escalón de la fachada: se unen los tres.
  const length = (run: Edge[]) => run.reduce((sum, edge) => sum + edge.len, 0);
  const heading = (run: Edge[]) => Math.atan2(run[run.length - 1]!.b[1] - run[0]!.a[1], run[run.length - 1]!.b[0] - run[0]!.a[0]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 1; i < runs.length - 1; i += 1) {
      const before = runs[i - 1]!;
      const step = runs[i]!;
      const after = runs[i + 1]!;
      if (length(step) >= STEP_MAX_M) continue;
      if (Math.abs(turnBetween(heading(before), heading(after))) * RAD > SAME_SIDE_DEG) continue;
      runs = [...runs.slice(0, i - 1), [...before, ...step, ...after], ...runs.slice(i + 2)];
      merged = true;
      break;
    }
  }

  const faces: Face[] = [];
  for (const run of runs) {
    const a = run[0]!.a;
    const b = run[run.length - 1]!.b;
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (chord < 1e-6) continue;
    const tangent: [number, number] = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
    // Ancho del lado: lo que las paredes avanzan A LO LARGO de él (los escalones casi no suman).
    const width = run.reduce((sum, edge) => sum + Math.max(0, (edge.b[0] - edge.a[0]) * tangent[0] + (edge.b[1] - edge.a[1]) * tangent[1]), 0);
    if (width < MIN_FACE_WIDTH_M) continue;
    // Anillo antihorario: el exterior queda a la derecha del sentido de avance.
    const face: Face = { id: "", a, b, normal: [tangent[1], -tangent[0]], widthM: width, order: 0 };
    if (run.length > 1) face.path = [a, ...run.map((edge) => edge.b)];
    faces.push(face);
  }
  let kept = faces;
  if (kept.length > MAX_BUILDING_FACES) {
    const longest = new Set(
      kept
        .map((face, position) => ({ position, width: face.widthM }))
        .sort((x, y) => y.width - x.width)
        .slice(0, MAX_BUILDING_FACES)
        .map((entry) => entry.position),
    );
    kept = kept.filter((_, position) => longest.has(position));
  }
  return kept.map((face, position) => ({ ...face, id: `f${position}`, order: position + 1 }));
}

/**
 * ¿Hay que invertir la coordenada u de la foto en esta cara? Visto desde fuera, la derecha de quien
 * mira es `(normal.z, −normal.x)`. Si el sentido `a`→`b` va hacia esa derecha, u crece bien; si va hacia
 * la izquierda (el caso de todas las huellas antihorarias), la foto saldría en espejo y hay que darle la vuelta.
 */
export function faceFlipsU(face: Pick<Face, "a" | "b" | "normal">): boolean {
  const right: [number, number] = [face.normal[1], -face.normal[0]];
  return (face.b[0] - face.a[0]) * right[0] + (face.b[1] - face.a[1]) * right[1] < 0;
}

/** Un trozo plano de la banda de una cara: dos puntos ya desplazados hacia fuera y la u de la foto en cada uno. */
export type StripSegment = { a: [number, number]; b: [number, number]; ua: number; ub: number };

/**
 * Trozos que cubren una cara. La coordenada horizontal de la foto (`u`, de 0 a 1, izquierda a derecha vista
 * desde fuera) se reparte por lo que cada pared avanza a lo largo del lado, así la foto continúa entera de una
 * pared a la siguiente y sin espejo. Las paredes que casi no avanzan (los escalones) no llevan foto: se omiten.
 */
export function faceStrip(face: Face, offsetM: number): StripSegment[] {
  const path = face.path && face.path.length >= 2 ? face.path : [face.a, face.b];
  const chord = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]) || 1;
  const tangent: [number, number] = [(face.b[0] - face.a[0]) / chord, (face.b[1] - face.a[1]) / chord];
  const steps = path.slice(0, -1).map((point, i) => {
    const next = path[i + 1]!;
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    const len = Math.hypot(dx, dz) || 1;
    return { point, next, len, advance: Math.max(0, dx * tangent[0] + dz * tangent[1]), normal: [dz / len, -dx / len] as [number, number] };
  });
  const total = steps.reduce((sum, step) => sum + step.advance, 0) || 1;
  const flip = faceFlipsU(face);
  const segments: StripSegment[] = [];
  let travelled = 0;
  for (const step of steps) {
    const from = travelled / total;
    travelled += step.advance;
    const to = travelled / total;
    if (step.advance < step.len * STEP_PROJECTION) continue; // escalón: pared sin foto
    segments.push({
      a: [step.point[0] + step.normal[0] * offsetM, step.point[1] + step.normal[1] * offsetM],
      b: [step.next[0] + step.normal[0] * offsetM, step.next[1] + step.normal[1] * offsetM],
      ua: flip ? 1 - from : from,
      ub: flip ? 1 - to : to,
    });
  }
  return segments;
}

/** Dos caras de un tramo de muralla: la cuerda del tramo, a cada lado. */
export function wallFaces(lines: Ring[], thicknessM = 2.5): Face[] {
  const points = lines.flat();
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return [];
  const width = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (width < 1) return [];
  const dx = (last[0] - first[0]) / width;
  const dz = (last[1] - first[1]) / width;
  // Desplazamiento de media grosor para que la cara quede sobre la superficie.
  const half = thicknessM / 2;
  const left: [number, number] = [dz, -dx];
  const right: [number, number] = [-dz, dx];
  const shift = (point: [number, number], normal: [number, number]): [number, number] => [
    point[0] + normal[0] * half,
    point[1] + normal[1] * half,
  ];
  return [
    { id: "f0", a: shift(first, left), b: shift(last, left), normal: left, widthM: width, order: 1 },
    // La cara opuesta se recorre al revés para que sus normales apunten hacia fuera.
    { id: "f1", a: shift(last, right), b: shift(first, right), normal: right, widthM: width, order: 2 },
  ];
}

/** Una cara plana de un cartel (local, panel, vela, avioneta). */
export function panelFace(widthM: number): Face[] {
  return [{ id: "f0", a: [0, 0], b: [widthM, 0], normal: [0, 1], widthM, order: 1 }];
}

/** ¿Qué imagen lleva una cara? La propia o, si «misma foto en todas», la común. */
export function imageKeyFor(faceId: string, images: Record<string, string> | string[], sameForAll: boolean): string | null {
  const keys = Array.isArray(images) ? images : Object.keys(images);
  if (keys.includes(faceId)) return faceId;
  if (sameForAll && keys.includes("all")) return "all";
  return null;
}

/**
 * Recorte «cover»: qué parte de una imagen (relación ancho/alto `image`) cubre una
 * superficie de relación `surface` sin deformarla. Devuelve [u0, v0, u1, v1].
 */
export function coverUV(surface: number, image: number): [number, number, number, number] {
  if (!(surface > 0) || !(image > 0)) return [0, 0, 1, 1];
  if (image > surface) {
    const keep = surface / image; // la imagen es más ancha: se recorta a los lados
    return [(1 - keep) / 2, 0, (1 + keep) / 2, 1];
  }
  const keep = image / surface; // más alta: se recorta arriba y abajo
  return [0, (1 - keep) / 2, 1, (1 + keep) / 2];
}

/**
 * Ventana de la imagen que se ve en una superficie: el recorte «cover» a zoom 1,
 * reducido por `zoom` y desplazado dentro de la foto según `x` / `y`. Con x = y = 0,5
 * y zoom 1 es exactamente `coverUV`. Devuelve [u0, v0, u1, v1] (v = 0 abajo).
 */
export function frameUV(
  surface: number,
  image: number,
  framing: { x: number; y: number; zoom: number } = { x: 0.5, y: 0.5, zoom: 1 },
): [number, number, number, number] {
  const [bu0, bv0, bu1, bv1] = coverUV(surface, image);
  const zoom = Math.min(3, Math.max(1, framing.zoom));
  const w = (bu1 - bu0) / zoom;
  const h = (bv1 - bv0) / zoom;
  const x = Math.min(1, Math.max(0, framing.x));
  const y = Math.min(1, Math.max(0, framing.y));
  const u0 = x * (1 - w);
  const v1 = 1 - y * (1 - h); // y = 0 es la parte de arriba de la foto
  return [u0, v1 - h, u0 + w, v1];
}

/**
 * Coordenadas de textura de una huella para pintar una foto en el techo. Se gira
 * la huella para alinearla con su lado más largo, se toma la caja que la envuelve
 * y se encuadra la imagen (cover + encuadre del anunciante). Devuelve un [u, v] por punto.
 */
export function roofUVs(
  points: Array<[number, number]>,
  imageAspect: number,
  framing: { x: number; y: number; zoom: number } = { x: 0.5, y: 0.5, zoom: 1 },
): Array<[number, number]> {
  if (points.length < 3) return points.map(() => [0, 0]);
  let best = 0;
  let angle = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > best) {
      best = length;
      angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotated = points.map(([x, z]) => [x * cos - z * sin, x * sin + z * cos] as const);
  const minX = Math.min(...rotated.map((p) => p[0]));
  const maxX = Math.max(...rotated.map((p) => p[0]));
  const minY = Math.min(...rotated.map((p) => p[1]));
  const maxY = Math.max(...rotated.map((p) => p[1]));
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const [u0, v0, u1, v1] = frameUV(width / height, imageAspect, framing);
  // Visto desde arriba con el norte hacia arriba, z crece hacia abajo (sur): la v de la foto tiene que ir al revés
  // que z, o el techo saldría en espejo (el texto se leería al revés).
  return rotated.map(([x, y]) => [u0 + ((x - minX) / width) * (u1 - u0), v0 + ((maxY - y) / height) * (v1 - v0)]);
}

/** ¿Tiene techo pintable? Edificios y tramos de muralla (tienen huella); locales y anuncios móviles, no. */
export function unitHasRoof(unitId: string): boolean {
  return unitId.startsWith("b:") || unitId.startsWith("w:");
}
