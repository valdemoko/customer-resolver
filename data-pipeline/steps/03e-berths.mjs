import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, readRaw, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";
import { distanceToSegment, makeFrame, pointInRing } from "../lib/surface.mjs";

/**
 * FASE B.4 · Atraques de cruceros.
 *
 * QUÉ SON ATRAQUES DE CRUCEROS, según los datos: OpenStreetMap marca la
 * terminal con `seaway=cruise_port` (edificio) y con `cargo=passengers` (uso del
 * suelo «Terminal de Cruceros»). Este paso toma los muelles (`man_made=quay`/
 * `pier`) que tocan esas marcas, recorre su orilla con el agua (el contorno del
 * mar que dejó el paso 03c) y extrae los TRAMOS RECTOS de más de 140 m: son los
 * frentes de atraque donde cabe un crucero. No se inventa ningún muelle.
 */

const MIN_RUN_M = 140;
/** Los barcos solo se colocan DENTRO de la zona nítida (círculo menos 60 m). */
const USABLE_MARGIN_M = 60;
const RUN_TURN_DEG = 7;
const NEAR_CRUISE_M = 90;
/** Un muelle abierto es solo UNA orilla del muelle: la terminal puede estar a un ancho de distancia. */
const NEAR_CRUISE_OPEN_M = 220;
const ON_QUAY_M = 2.5;

const closedWay = (g) => g?.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;

export async function run() {
  const city = await loadCity();
  step(`03e · Atraques de cruceros — ${city.name}`);
  const osm = await readRaw(`${city.slug}.osm.json`);
  const frame = makeFrame(city.scene.coverage.circle.center);
  const toXY = (p) => frame.toLocal(p.lon, p.lat);

  // 1. Marcas de terminal de cruceros en los datos.
  const marks = osm.elements.filter((e) => {
    const t = e.tags ?? {};
    return e.type === "way" && e.geometry && (t.seaway === "cruise_port" || (t.cargo === "passengers" && /Crucero|Cruise/i.test(`${t.name ?? ""} ${t["name:en"] ?? ""}`)));
  });
  log(`Marcas de cruceros: ${marks.map((m) => `way/${m.id} (${m.tags.name})`).join(" · ") || "ninguna"}`);
  const markPoints = marks.flatMap((m) => m.geometry.map(toXY));

  // 2. Muelles que tocan esas marcas.
  const quays = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (e.type !== "way" || !e.geometry) continue;
    if (!["quay", "pier"].includes(t.man_made)) continue;
    // Un muelle ABIERTO (p. ej. «Muelle 2 - Guadiaro») es directamente la línea
    // de su orilla; uno cerrado es su contorno. Ambos sirven para localizar
    // las aristas del mar que coinciden con el muelle.
    const closed = closedWay(e.geometry);
    if (!closed && e.geometry.length < 3) continue;
    const ring = e.geometry.map(toXY);
    let near = Infinity;
    for (const [mx, my] of markPoints) {
      for (let i = 0; i < ring.length - 1; i += 4) near = Math.min(near, Math.hypot(ring[i][0] - mx, ring[i][1] - my));
    }
    const inside = closed && markPoints.some(([mx, my]) => pointInRing(mx, my, ring));
    if (inside || near <= (closed ? NEAR_CRUISE_M : NEAR_CRUISE_OPEN_M)) quays.push({ id: `way/${e.id}`, name: t.name ?? "", ring });
  }
  // Los muelles con nombre van primero: si dos coinciden en el mismo frente, el
  // frente se etiqueta con el nombre, no con un identificador.
  quays.sort((p, q) => Number(Boolean(q.name)) - Number(Boolean(p.name)));
  log(`Muelles asociados: ${quays.map((q) => `${q.id} ${q.name}`).join(" · ") || "ninguno"}`);

  // 3. Contorno del mar (de 03c).
  const water = JSON.parse(await readFile(join(BUILD_DIR, `${city.slug}.water.geojson`), "utf8")).features.filter((f) => f.properties.kind === "sea");
  const polygons = water.flatMap((f) =>
    (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) =>
      poly.map((ring) => ring.map(([lon, lat]) => frame.toLocal(lon, lat))),
    ),
  );
  const inSea = (x, y) => polygons.some(([outer, ...holes]) => pointInRing(x, y, outer) && !holes.some((h) => pointInRing(x, y, h)));

  const distToQuay = (x, y, quay) => {
    let best = Infinity;
    for (let i = 0; i < quay.ring.length - 1; i += 1) {
      const a = quay.ring[i];
      const b = quay.ring[i + 1];
      best = Math.min(best, distanceToSegment(x, y, a[0], a[1], b[0], b[1]).distance);
    }
    return best;
  };

  const features = [];
  for (const quay of quays) {
    // Aristas del mar que coinciden con el borde del muelle.
    const runsForQuay = [];
    for (const [outer, ...holes] of polygons) {
      for (const ring of [outer, ...holes]) {
        let current = [];
        const flush = () => {
          if (current.length >= 2) runsForQuay.push(current);
          current = [];
        };
        for (let i = 0; i < ring.length - 1; i += 1) {
          const a = ring[i];
          const b = ring[i + 1];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (distToQuay(mid[0], mid[1], quay) <= ON_QUAY_M && distToQuay(a[0], a[1], quay) <= ON_QUAY_M) {
            if (current.length === 0) current.push(a);
            current.push(b);
          } else flush();
        }
        flush();
      }
    }
    // Tramos rectos dentro de cada recorrido.
    for (const path of runsForQuay) {
      let start = 0;
      const emit = (from, to) => {
        let a = path[from];
        let b = path[to];
        // Se recorta el tramo al disco utilizable (la parte dentro del círculo).
        {
          const r = city.scene.coverage.circle.radiusM - USABLE_MARGIN_M;
          const dx0 = b[0] - a[0];
          const dy0 = b[1] - a[1];
          const A = dx0 * dx0 + dy0 * dy0;
          const B = 2 * (a[0] * dx0 + a[1] * dy0);
          const C = a[0] * a[0] + a[1] * a[1] - r * r;
          const disc = B * B - 4 * A * C;
          if (A === 0 || disc <= 0) return;
          const t0 = Math.max(0, (-B - Math.sqrt(disc)) / (2 * A));
          const t1 = Math.min(1, (-B + Math.sqrt(disc)) / (2 * A));
          if (t1 - t0 <= 0) return;
          const na = [a[0] + dx0 * t0, a[1] + dy0 * t0];
          const nb = [a[0] + dx0 * t1, a[1] + dy0 * t1];
          a = na;
          b = nb;
        }
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let walked = 0;
        for (let i = from; i < to; i += 1) walked += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        const full = Math.hypot(path[to][0] - path[from][0], path[to][1] - path[from][1]);
        if (length < MIN_RUN_M || walked > full * 1.08) return;
        const dx = (b[0] - a[0]) / length;
        const dy = (b[1] - a[1]) / length;
        // Normal hacia el agua: se prueba el lado izquierdo a 8 m del punto medio.
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const leftWater = inSea(mid[0] - dy * 8, mid[1] + dx * 8);
        const rightWater = inSea(mid[0] + dy * 8, mid[1] - dx * 8);
        if (leftWater === rightWater) return;
        features.push({
          type: "Feature",
          properties: {
            kind: "cruise_berth",
            id: `berth-${features.length + 1}`,
            quay: quay.name || quay.id,
            quay_osm: quay.id,
            length: Math.round(length),
            water_side: leftWater ? "left" : "right",
          },
          geometry: { type: "LineString", coordinates: [a, b].map(([x, y]) => frame.toLonLat(x, y)) },
        });
      };
      for (let i = 1; i < path.length; i += 1) {
        const a = path[start];
        const b = path[i];
        const base = Math.atan2(path[start + 1]?.[1] - a[1], path[start + 1]?.[0] - a[0]);
        const heading = Math.atan2(b[1] - path[i - 1][1], b[0] - path[i - 1][0]);
        let delta = Math.abs(heading - base);
        if (delta > Math.PI) delta = 2 * Math.PI - delta;
        if (delta > (RUN_TURN_DEG * Math.PI) / 180) {
          emit(start, i - 1);
          start = i - 1;
        }
      }
      emit(start, path.length - 1);
    }
  }
  features.sort((x, y) => y.properties.length - x.properties.length);
  // Dos muelles superpuestos (p. ej. un pier dentro de un muelle mayor) dan el
  // mismo frente dos veces: se descarta el duplicado (punto medio a < 15 m).
  const unique = [];
  for (const f of features) {
    const [a, b] = f.geometry.coordinates.map(([lon, lat]) => frame.toLocal(lon, lat));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const duplicate = unique.some((u) => {
      const [c, d] = u.geometry.coordinates.map(([lon, lat]) => frame.toLocal(lon, lat));
      return distanceToSegment(mid[0], mid[1], c[0], c[1], d[0], d[1]).distance < 15;
    });
    if (!duplicate) unique.push(f);
  }
  features.length = 0;
  features.push(...unique);
  features.forEach((f, i) => (f.properties.id = `berth-${i + 1}`));
  await writeFile(join(BUILD_DIR, `${city.slug}.berths.geojson`), JSON.stringify({ type: "FeatureCollection", features }));
  log(`Frentes de atraque de cruceros (≥ ${MIN_RUN_M} m): ${features.length} · ${features.map((f) => `${f.properties.quay} ${f.properties.length} m`).join(" · ")}`);
  if (features.length === 0) warn("No se ha encontrado ningún frente de atraque: revisa las marcas de cruceros.");
  return { berths: features.length };
}
