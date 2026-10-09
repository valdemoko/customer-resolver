/**
 * Caras de una unidad: lo que el comprador rellena con una foto.
 *
 * · Edificio: cada pared de la huella (simplificada) es una cara `f0`, `f1`…, en
 *   el orden del contorno. Se unen los tramos colineales y se descartan las
 *   paredes de menos de 2,5 m; si quedan más de 12, se conservan las 12 más
 *   largas (el resto sigue siendo pared sin anuncio).
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
};

export const MAX_BUILDING_FACES = 12;
export const MIN_FACE_WIDTH_M = 2.5;

export function buildingFaces(footprint: Ring): Face[] {
  const ring = simplifyCollinear(ensureCounterClockwise(footprint), 0.6);
  const edges: Face[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (width < MIN_FACE_WIDTH_M) continue;
    // Anillo antihorario: el exterior queda a la derecha del sentido a → b.
    edges.push({ id: "", a, b, normal: [(b[1] - a[1]) / width, -(b[0] - a[0]) / width], widthM: width, order: 0 });
  }
  let kept = edges;
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
  return rotated.map(([x, y]) => [u0 + ((x - minX) / width) * (u1 - u0), v0 + ((y - minY) / height) * (v1 - v0)]);
}

/** ¿Tiene techo pintable? Edificios y tramos de muralla (tienen huella); locales y anuncios móviles, no. */
export function unitHasRoof(unitId: string): boolean {
  return unitId.startsWith("b:") || unitId.startsWith("w:");
}
