/**
 * Geometría de superficies para el pipeline (FASE B.4).
 *
 * Todo se calcula en METROS locales (x = este, y = norte) alrededor del centro
 * del círculo de la escena, no en grados: así los anchos, las distancias y las
 * tolerancias son físicas y los resultados no dependen de la latitud. Al final
 * se devuelven a lon/lat con 7 decimales (≈ 1 cm).
 *
 * Las operaciones booleanas (unión, diferencia, intersección) usan
 * `polygon-clipping`, con las coordenadas redondeadas a 1 cm antes de operar.
 * Redondear antes evita los fallos de robustez clásicos («Unable to complete
 * output ring») que producen las coordenadas con 15 decimales casi coincidentes.
 */
import polygonClipping from "polygon-clipping";

const METERS_PER_DEG_LAT = 111_132;
const METERS_PER_DEG_LON_EQ = 111_320;

export function makeFrame(center) {
  const [lon0, lat0] = center;
  const mx = METERS_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  return {
    lon0,
    lat0,
    toLocal: (lon, lat) => [(lon - lon0) * mx, (lat - lat0) * METERS_PER_DEG_LAT],
    toLonLat: (x, y) => [lon0 + x / mx, lat0 + y / METERS_PER_DEG_LAT],
  };
}

export const snap = (value, step = 0.01) => Math.round(value / step) * step;

/* ------------------------------------------------------------ anillos */

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function snapRing(ring, step) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [snap(x, step), snap(y, step)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out.length >= 3 ? closeRing(out) : null;
}

/** Polígono(s) → MultiPolygon limpio y redondeado. */
export function toMulti(geometry, step = 0.01) {
  const polys = [];
  const polygons = Array.isArray(geometry?.[0]?.[0]?.[0]) ? geometry : [geometry];
  for (const polygon of polygons) {
    const rings = [];
    for (const ring of polygon) {
      const snapped = snapRing(ring, step);
      if (snapped) rings.push(snapped);
    }
    if (rings.length > 0) polys.push(rings);
  }
  return polys;
}

export const polygonOf = (outer, holes = []) => toMulti([[outer, ...holes]]);

export function multiArea(multi) {
  let area = 0;
  for (const polygon of multi) {
    polygon.forEach((ring, index) => {
      const a = Math.abs(ringArea(ring));
      area += index === 0 ? a : -a;
    });
  }
  return area;
}

/* ------------------------------------------------------- booleanas */

function attempt(operation, args) {
  try {
    return operation(...args);
  } catch (error) {
    // Reintento con una rejilla más gruesa: resuelve casi todos los casos
    // degenerados sin cambiar nada que se vea (5 cm).
    const coarse = args.map((geometry) => toMulti(geometry, 0.05));
    try {
      return operation(...coarse);
    } catch {
      const coarser = args.map((geometry) => toMulti(geometry, 0.2));
      try {
        return operation(...coarser);
      } catch (finalError) {
        throw new Error(`Operación booleana fallida: ${finalError.message ?? error.message}`);
      }
    }
  }
}

const nonEmpty = (list) => list.filter((g) => g && g.length > 0);

/**
 * Normaliza una geometría: `union` de UNA sola entrada resuelve anillos que se
 * cruzan o se tocan (frecuentes en OSM) y devuelve polígonos simples y válidos.
 * Sin esto, una huella con un «lazo» contamina las booleanas de toda su celda.
 */
export function normalize(multi) {
  if (!multi || multi.length === 0) return [];
  try {
    return attempt((a) => polygonClipping.union(a), [multi]);
  } catch {
    return multi;
  }
}

export function union(...geoms) {
  const items = nonEmpty(geoms);
  if (items.length === 0) return [];
  if (items.length === 1) return items[0];
  return attempt((a, ...rest) => polygonClipping.union(a, ...rest), items);
}

/** Unión en lotes: más estable y más rápida que una sola con miles de entradas. */
export function unionMany(geoms, batch = 400) {
  let current = nonEmpty(geoms);
  if (current.length === 0) return [];
  while (current.length > 1) {
    const next = [];
    for (let index = 0; index < current.length; index += batch) {
      next.push(union(...current.slice(index, index + batch)));
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current[0];
}

export function difference(subject, ...clips) {
  const cuts = nonEmpty(clips);
  if (!subject || subject.length === 0) return [];
  if (cuts.length === 0) return subject;
  return attempt((a, ...rest) => polygonClipping.difference(a, ...rest), [subject, ...cuts]);
}

export function intersection(a, b) {
  if (!a?.length || !b?.length) return [];
  return attempt((x, y) => polygonClipping.intersection(x, y), [a, b]);
}

/* ------------------------------------------------- polígono regular */

/** Polígono regular que CONTIENE al círculo de radio `radius` (circunscrito). */
export function circleRing(radius, sides = 256, circumscribed = true) {
  const r = circumscribed ? radius / Math.cos(Math.PI / sides) : radius;
  const ring = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    ring.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return ring;
}

/* ------------------------------------------------------ líneas */

function disc(center, radius, sides = 10) {
  const ring = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    ring.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return ring;
}

/** Cinta de ancho `width` a lo largo de una polilínea (juntas redondeadas). */
export function bufferLine(line, width) {
  const half = width / 2;
  const parts = [];
  for (let index = 0; index < line.length - 1; index += 1) {
    const [ax, ay] = line[index];
    const [bx, by] = line[index + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    if (length < 0.05) continue;
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;
    parts.push(
      toMulti([[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]]),
    );
    if (index > 0) parts.push(toMulti([[disc([ax, ay], half)]]));
  }
  return parts.length === 0 ? [] : unionMany(parts, 200);
}

/* -------------------------------------------- ensamblado de OSM */

/**
 * Une `ways` (listas de [x, y]) por sus extremos y devuelve las cadenas. Los
 * extremos se comparan con una tolerancia de 2 cm. Sirve para la costa y para
 * los anillos de los multipolígonos.
 */
export function chainLines(lines, toleranceM = 0.02) {
  const key = (p) => `${Math.round(p[0] / toleranceM)}:${Math.round(p[1] / toleranceM)}`;
  const pool = lines.filter((line) => line.length >= 2).map((line) => line.slice());
  const byStart = new Map();
  const byEnd = new Map();
  const alive = new Set(pool.map((_, index) => index));
  const reindex = () => {
    byStart.clear();
    byEnd.clear();
    for (const index of alive) {
      const line = pool[index];
      byStart.set(key(line[0]), index);
      byEnd.set(key(line[line.length - 1]), index);
    }
  };
  reindex();

  const chains = [];
  while (alive.size > 0) {
    const startIndex = alive.values().next().value;
    alive.delete(startIndex);
    let chain = pool[startIndex];
    let grew = true;
    while (grew) {
      grew = false;
      reindex();
      const endKey = key(chain[chain.length - 1]);
      const nextIndex = byStart.get(endKey);
      if (nextIndex !== undefined && alive.has(nextIndex)) {
        alive.delete(nextIndex);
        chain = chain.concat(pool[nextIndex].slice(1));
        grew = true;
        continue;
      }
      const startKey = key(chain[0]);
      const prevIndex = byEnd.get(startKey);
      if (prevIndex !== undefined && alive.has(prevIndex)) {
        alive.delete(prevIndex);
        chain = pool[prevIndex].slice(0, -1).concat(chain);
        grew = true;
        continue;
      }
      // Sentido contrario (way cuya orientación no concuerda): solo para anillos
      // de multipolígonos; la costa respeta el sentido y no entra aquí.
    }
    chains.push(chain);
  }
  return chains;
}

/** Une segmentos sin importar su sentido (anillos de multipolígonos). */
export function stitchRings(segments, toleranceM = 0.02) {
  const key = (p) => `${Math.round(p[0] / toleranceM)}:${Math.round(p[1] / toleranceM)}`;
  const remaining = segments.filter((segment) => segment.length >= 2).map((segment) => segment.slice());
  const rings = [];
  while (remaining.length > 0) {
    let chain = remaining.shift();
    let guard = 0;
    while (key(chain[0]) !== key(chain[chain.length - 1]) && guard < 5000) {
      guard += 1;
      const endKey = key(chain[chain.length - 1]);
      let found = -1;
      let reverse = false;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        if (key(candidate[0]) === endKey) {
          found = index;
          break;
        }
        if (key(candidate[candidate.length - 1]) === endKey) {
          found = index;
          reverse = true;
          break;
        }
      }
      if (found < 0) break;
      const [piece] = remaining.splice(found, 1);
      chain = chain.concat((reverse ? piece.slice().reverse() : piece).slice(1));
    }
    if (chain.length >= 4 && key(chain[0]) === key(chain[chain.length - 1])) rings.push(chain);
  }
  return rings;
}

/**
 * Multipolígono de una relación de OSM: anillos exteriores menos interiores.
 * `toXY` convierte {lat, lon} a [x, y] locales. Devuelve un MultiPolygon.
 */
export function assembleMultipolygon(relation, toXY) {
  const outers = [];
  const inners = [];
  for (const member of relation.members ?? []) {
    if (member.type !== "way" || !member.geometry || member.geometry.length < 2) continue;
    const line = member.geometry.map((point) => toXY(point.lon, point.lat));
    if (member.role === "inner") inners.push(line);
    else outers.push(line);
  }
  const outerRings = stitchRings(outers);
  const innerRings = stitchRings(inners);
  if (outerRings.length === 0) return [];
  const outerMulti = unionMany(outerRings.map((ring) => toMulti([[ring]])));
  const holes = innerRings.length > 0 ? unionMany(innerRings.map((ring) => toMulti([[ring]]))) : [];
  return difference(outerMulti, holes);
}

/* ----------------------------------------------- geometría libre */

export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInMulti(x, y, multi) {
  for (const polygon of multi) {
    const [outer, ...holes] = polygon;
    if (outer && pointInRing(x, y, outer) && !holes.some((hole) => pointInRing(x, y, hole))) return true;
  }
  return false;
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/** MultiPolygon local → geometría GeoJSON en lon/lat. */
export function multiToGeoJSON(multi, frame) {
  const polygons = multi.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => {
        const [lon, lat] = frame.toLonLat(x, y);
        return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
      }),
    ),
  );
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
  return { type: "MultiPolygon", coordinates: polygons };
}

/** Parte un MultiPolygon en features de un solo polígono (más fáciles de teselar). */
export function multiToFeatures(multi, frame, properties) {
  return multi.map((polygon) => ({
    type: "Feature",
    properties,
    geometry: multiToGeoJSON([polygon], frame),
  }));
}

export function bboxOfMulti(multi) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of multi) {
    for (const [x, y] of polygon[0] ?? []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}
