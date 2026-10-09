/**
 * Conversión de OSM a GeoJSON.
 *
 * Se implementa aquí, sin dependencia externa, para que el pipeline no dependa
 * de un paquete abandonado. Solo se procesan *ways*: las relaciones
 * (multipolígonos) no se ensamblan todavía y se cuentan aparte para que el
 * informe de calidad diga cuántas se han quedado fuera. No se finge que están.
 */

/** ¿Cierra el anillo el primer y último nodo? */
function isClosed(geometry) {
  if (geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return first.lat === last.lat && first.lon === last.lon;
}

/** Way abierto → LineString. */
export function wayToLineString(element) {
  if (!element.geometry || element.geometry.length < 2) return null;
  return {
    type: "LineString",
    coordinates: element.geometry.map((point) => [point.lon, point.lat]),
  };
}

/**
 * Way cerrado → Polygon. El anillo exterior se cierra explícitamente, como
 * exige RFC 7946.
 */
export function wayToPolygon(element) {
  if (!element.geometry || !isClosed(element.geometry)) return null;
  const ring = element.geometry.map((point) => [point.lon, point.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (ring.length < 4) return null;
  return { type: "Polygon", coordinates: [ring] };
}

/** Área aproximada de un anillo en metros cuadrados (proyección local plana). */
export function ringAreaM2(ring) {
  if (ring.length < 4) return 0;
  const lat0 = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const metersPerDegLat = 111_132.0;
  const metersPerDegLon = 111_320.0 * Math.cos((lat0 * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const x1 = ring[i][0] * metersPerDegLon;
    const y1 = ring[i][1] * metersPerDegLat;
    const x2 = ring[i + 1][0] * metersPerDegLon;
    const y2 = ring[i + 1][1] * metersPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/** Distancia en metros entre dos puntos [lon, lat]. Haversine. */
export function distanceMeters(a, b) {
  const R = 6_371_008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Centroide del anillo exterior, ponderado por área. */
export function polygonCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (area === 0) return ring[0];
  return [cx / (6 * area), cy / (6 * area)];
}

/** Redondeo de coordenadas para reducir el peso del archivo. */
export function roundCoordinates(coordinates, decimals = 7) {
  const factor = 10 ** decimals;
  if (typeof coordinates[0] === "number") {
    return [
      Math.round(coordinates[0] * factor) / factor,
      Math.round(coordinates[1] * factor) / factor,
    ];
  }
  return coordinates.map((part) => roundCoordinates(part, decimals));
}

/** Divide un rectángulo en una rejilla de celdas (para paginar servicios WFS). */
export function splitBBox(bbox, columns, rows) {
  const width = (bbox.east - bbox.west) / columns;
  const height = (bbox.north - bbox.south) / rows;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        west: bbox.west + column * width,
        south: bbox.south + row * height,
        east: bbox.west + (column + 1) * width,
        north: bbox.south + (row + 1) * height,
      });
    }
  }
  return cells;
}
