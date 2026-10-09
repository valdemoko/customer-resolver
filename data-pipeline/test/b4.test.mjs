import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seaFromCoastlines } from "../steps/03c-surface.mjs";
import {
  bufferLine,
  circleRing,
  difference,
  intersection,
  makeFrame,
  multiArea,
  pointInMulti,
  polygonOf,
  unionMany,
} from "../lib/surface.mjs";

/**
 * FASE B.4 · pruebas del pipeline.
 *
 * Dos grupos: (1) algoritmos con entradas sintéticas, que siempre se ejecutan, y
 * (2) comprobaciones sobre los ARTEFACTOS REALES del pipeline (`build/`), que se
 * omiten solo si todavía no se ha generado el paquete. Son los comprobantes
 * geométricos automáticos que pide el encargo: círculo sin geometrías truncadas,
 * superficies sin solapes, parcelas sobre fachada real y sin cruzar edificios.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, "..", "build");
const CITY = JSON.parse(readFileSync(join(HERE, "..", "..", "src", "data", "cities", "malaga.geo.json"), "utf8"));
const { circle, fadeBandM } = CITY.scene.coverage;
const R = circle.radiusM;
const RCLIP = R + fadeBandM + 60;
const frame = makeFrame(circle.center);

const load = (name) => {
  const path = join(BUILD, `malaga.${name}.geojson`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).features : null;
};
const hasBuild = existsSync(join(BUILD, "malaga.parcels.geojson")) && existsSync(join(BUILD, "malaga.surface.geojson"));

describe("geometría de superficies (sintética)", () => {
  it("el mar sale del lado DERECHO de la costa aunque esta salga y vuelva a entrar", () => {
    // Costa de oeste a este con un dique que se mete hacia el sur y vuelve: tierra
    // a la izquierda (norte), mar a la derecha (sur).
    const coast = [
      [-1500, 0],
      [-200, 0],
      [-200, -400],
      [200, -400],
      [200, 0],
      [1500, 0],
    ];
    const { sea } = seaFromCoastlines([coast], 1000);
    assert.ok(multiArea(sea) > 0);
    assert.equal(pointInMulti(-600, -500, sea), true, "mar al sur de la costa");
    assert.equal(pointInMulti(600, -500, sea), true);
    assert.equal(pointInMulti(0, -200, sea), false, "el dique es tierra");
    assert.equal(pointInMulti(0, 500, sea), false, "al norte de la costa hay tierra");
  });

  it("las clases disjuntas no se solapan tras la diferencia", () => {
    const road = bufferLine([[-100, 0], [100, 0]], 10);
    const park = polygonOf([[-80, -30], [80, -30], [80, 30], [-80, 30]]);
    const rest = difference(park, road);
    assert.ok(multiArea(intersection(rest, road)) < 1e-6);
    assert.ok(Math.abs(multiArea(rest) + multiArea(intersection(park, road)) - multiArea(park)) < 1e-3);
  });

  it("el polígono circunscrito contiene al círculo", () => {
    for (const [x, y] of circleRing(1000, 256, true)) assert.ok(Math.hypot(x, y) >= 1000 - 1e-9);
  });

  it("la unión por lotes conserva el área de piezas disjuntas", () => {
    const pieces = Array.from({ length: 30 }, (_, i) => polygonOf([[i * 10, 0], [i * 10 + 8, 0], [i * 10 + 8, 5], [i * 10, 5]]));
    assert.ok(Math.abs(multiArea(unionMany(pieces, 4)) - 30 * 8 * 5) < 1e-6);
  });
});

describe("artefactos reales: círculo, agua y superficies", { skip: !hasBuild }, () => {
  const radial = ([lon, lat]) => {
    const [x, y] = frame.toLocal(lon, lat);
    return Math.hypot(x, y);
  };
  const eachPoint = (geometry, fn) => {
    const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const poly of polys) for (const ring of poly) for (const point of ring) fn(point);
    if (geometry.type === "LineString") for (const point of geometry.coordinates) fn(point);
  };

  it("ninguna superficie, agua ni tierra sobresale del recorte circular", () => {
    for (const layer of ["land", "water", "surface"]) {
      let worst = 0;
      for (const feature of load(layer)) eachPoint(feature.geometry, (p) => (worst = Math.max(worst, radial(p))));
      assert.ok(worst <= RCLIP + 0.5, `${layer}: vértice a ${worst.toFixed(1)} m (límite ${RCLIP} m)`);
    }
  });

  it("ningún edificio queda partido por el borde: se publica entero o no se publica", () => {
    const buildings = load("buildings");
    assert.ok(buildings.length > 5000);
    let farthest = 0;
    for (const feature of buildings) eachPoint(feature.geometry, (p) => (farthest = Math.max(farthest, radial(p))));
    // Todos los vértices dentro del recorte con 60 m de holgura: ninguno cruza el borde.
    assert.ok(farthest <= RCLIP + 60 + 0.5, `edificio hasta ${farthest.toFixed(1)} m`);
  });

  it("el mar es una sola masa grande y toca el recorte (sin costura puerto/mar abierto)", () => {
    const sea = load("water").filter((f) => f.properties.kind === "sea");
    assert.ok(sea.length >= 1);
    const area = sea.reduce((sum, f) => sum + f.properties.area, 0);
    assert.ok(area > 1_500_000, `mar de ${area} m²`);
    let farthest = 0;
    for (const f of sea) eachPoint(f.geometry, (p) => (farthest = Math.max(farthest, radial(p))));
    assert.ok(farthest > R + fadeBandM, "el mar llega hasta el borde del recorte");
  });

  it("la validación de solapes del paso 03c está dentro de tolerancia", () => {
    const report = JSON.parse(readFileSync(join(BUILD, "malaga.surface-report.json"), "utf8"));
    assert.equal(report.surface.passes, true);
    assert.ok(report.surface.pairsCompared > 1000);
    assert.ok(report.surface.worstPairOverlapM2 < 15);
    assert.ok(report.surface.overlapShareOfSurface < 1e-4);
  });

  it("los atraques de cruceros salen de los datos y son rectos y largos", () => {
    const berths = load("berths");
    assert.ok(berths.length >= 2, `solo ${berths.length} atraques`);
    for (const berth of berths) assert.ok(berth.properties.length >= 140);
  });

  it("Alcazaba y Gibralfaro: recintos, murallas y torres cartografiados", () => {
    const fortress = load("fortress");
    const count = (kind, part) => fortress.filter((f) => f.properties.kind === kind && (!part || f.properties.part === part)).length;
    assert.equal(count("enclosure"), 2);
    assert.ok(count("wall", "alcazaba") >= 8);
    assert.ok(count("wall", "gibralfaro") >= 8);
    assert.ok(count("wall", "coracha") >= 2);
    assert.ok(count("tower", "alcazaba") >= 6);
    assert.ok(fortress.some((f) => f.properties.osm_id === "way/194708337" && f.properties.name === "Torre del Homenaje"));
  });
});

describe("artefactos reales: parcelas (locales)", { skip: !hasBuild }, () => {
  const parcels = load("parcels");
  const buildings = load("buildings");
  const local = (coord) => frame.toLocal(coord[0], coord[1]);
  const byId = new Map(buildings.map((f) => [f.properties.osm_id, f]));
  const ringOf = (feature) => feature.geometry.coordinates[0].map(local);

  const edgeDistance = (p, ring) => {
    let best = Infinity;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
    }
    return best;
  };
  const inside = (x, y, ring) => {
    let inn = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
    }
    return inn;
  };

  it("hay parcelas, con origen y sin ninguna marca inventada", () => {
    assert.ok(parcels.length > 1500, `solo ${parcels.length}`);
    const sources = new Set(parcels.map((f) => f.properties.source));
    for (const source of sources) assert.ok(["catastro_unit", "osm_poi", "estimated"].includes(source));
    assert.ok(sources.has("osm_poi") && sources.has("estimated"));
  });

  it("identificadores únicos y estables (L-xxxxxxx)", () => {
    const ids = parcels.map((f) => f.properties.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^L-[0-9a-z]{7}$/);
  });

  it("cada parcela está SOBRE la fachada real de su edificio (≤ 5 cm del borde)", () => {
    let checked = 0;
    for (const f of parcels) {
      const building = byId.get(f.properties.building);
      assert.ok(building, `edificio ${f.properties.building} inexistente`);
      const ring = ringOf(building);
      for (const coord of f.geometry.coordinates) {
        const d = edgeDistance(local(coord), ring);
        assert.ok(d < 0.05, `parcela ${f.properties.id}: extremo a ${d.toFixed(3)} m del borde`);
      }
      checked += 1;
    }
    assert.equal(checked, parcels.length);
  });

  it("ninguna parcela atraviesa un edificio ni bloquea la calle: el sondeo frontal cae fuera de todo edificio", () => {
    // Rejilla de 80 m para no comparar cada parcela con los 5.000 edificios.
    const grid = new Map();
    for (const b of buildings) {
      const ring = ringOf(b);
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / 80); gx <= Math.floor(Math.max(...xs) / 80); gx += 1) {
        for (let gy = Math.floor(Math.min(...ys) / 80); gy <= Math.floor(Math.max(...ys) / 80); gy += 1) {
          const key = `${gx}:${gy}`;
          const list = grid.get(key) ?? [];
          list.push({ ring, id: b.properties.osm_id });
          grid.set(key, list);
        }
      }
    }
    for (const f of parcels) {
      const [a, b] = f.geometry.coordinates.map(local);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const probe = [mid[0] + f.properties.nx * 0.5, mid[1] + f.properties.ny * 0.5];
      for (const { ring, id } of grid.get(`${Math.floor(probe[0] / 80)}:${Math.floor(probe[1] / 80)}`) ?? []) {
        if (inside(probe[0], probe[1], ring)) assert.fail(`parcela ${f.properties.id}: el frente cae dentro de ${id}`);
      }
    }
  });

  it("dos parcelas de una misma fachada no se solapan y miden entre 2,2 y 7,6 m", () => {
    const byBuilding = new Map();
    for (const f of parcels) {
      assert.ok(f.properties.width >= 2.2 - 1e-6 && f.properties.width <= 7.6, `ancho ${f.properties.width}`);
      const list = byBuilding.get(f.properties.building) ?? [];
      list.push(f);
      byBuilding.set(f.properties.building, list);
    }
    for (const list of byBuilding.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const [a1, a2] = list[i].geometry.coordinates.map(local);
          const [b1, b2] = list[j].geometry.coordinates.map(local);
          // Solo importa si son colineales (misma arista): se comparan proyecciones.
          const dx = a2[0] - a1[0];
          const dy = a2[1] - a1[1];
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const off = (p) => Math.abs((p[0] - a1[0]) * -uy + (p[1] - a1[1]) * ux);
          if (off(b1) > 0.05 || off(b2) > 0.05) continue;
          const t = (p) => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy;
          const [s0, s1] = [t(b1), t(b2)].sort((x, y) => x - y);
          const overlap = Math.min(len, s1) - Math.max(0, s0);
          assert.ok(overlap < 0.05, `parcelas ${list[i].properties.id} y ${list[j].properties.id} se solapan ${overlap.toFixed(2)} m`);
        }
      }
    }
  });

  it("el informe de parcelas suma el total y declara 0 unidades catastrales", () => {
    const report = JSON.parse(readFileSync(join(BUILD, "malaga.parcels-report.json"), "utf8"));
    const sum = Object.values(report.bySource).reduce((s, v) => s + v, 0);
    assert.equal(sum, report.total);
    assert.equal(report.total, parcels.length);
    assert.equal(report.bySource.catastro_unit, 0);
  });
});
