import { describe, expect, it } from "vitest";
import { merlonCells, planFortresses, wallMerlons } from "./fortress";
import type { FortressConfig } from "./fortress";
import type { CityFeature } from "./tiles";
import { signedArea } from "./polygon";

type P = Array<[number, number]>;

function base(
  layer: CityFeature["layer"],
  kind: string,
  props: Record<string, string | number>,
  extra: Partial<CityFeature> = {},
): CityFeature {
  return {
    layer,
    kind,
    name: String(props.name ?? ""),
    polygons: [],
    lines: [],
    points: [],
    heightM: 9,
    heightSource: "default_estimate",
    levels: 0,
    areaM2: 0,
    osmId: String(props.osm_id ?? ""),
    catastroRef: "",
    genus: "",
    species: "",
    leafType: "",
    tile: "17/0/0",
    props: { kind, ...props },
    ...extra,
  };
}

const CONFIG: FortressConfig = {
  id: "alcazaba",
  name: "Alcazaba de Prueba",
  parts: ["alcazaba"],
  enclosureOsmId: "way/1",
  wallHeightM: { outer: 7, inner: 9 },
  towerHeightM: 13,
  keepOsmId: "way/10",
  keepHeightM: 17,
  gateHeightM: 8,
  heightSource: "Estimación de prueba",
  fidelity: "simplified",
};

const square = (x: number, z: number, s: number): P => [
  [x, z],
  [x + s, z],
  [x + s, z + s],
  [x, z + s],
];

describe("fortalezas compuestas", () => {
  const features = [
    base("fortress", "enclosure", { osm_id: "way/1", part: "alcazaba" }, { polygons: [{ outer: square(-50, -50, 100), holes: [] }] }),
    base("fortress", "tower", { osm_id: "way/10", part: "alcazaba" }, { polygons: [{ outer: square(0, 0, 8), holes: [] }] }),
    base("fortress", "tower", { osm_id: "way/11", part: "alcazaba" }, { polygons: [{ outer: square(40, 40, 6), holes: [] }] }),
    base("fortress", "wall", { osm_id: "way/20", part: "alcazaba", unit: "w:alcazaba:01" }, { lines: [[[-20, 4], [30, 4]]] }),
    base("fortress", "wall", { osm_id: "way/21", part: "alcazaba", unit: "w:alcazaba:02" }, { lines: [[[-300, -300], [-250, -300]]] }),
    base("buildings", "yes", { osm_id: "way/30" }, { osmId: "way/30", polygons: [{ outer: square(-10, -10, 8), holes: [] }] }),
    base("buildings", "yes", { osm_id: "way/31" }, { osmId: "way/31", polygons: [{ outer: square(200, 200, 10), holes: [] }] }),
  ];
  const [plan] = planFortresses(features, [CONFIG], 1);

  it("reúne torres, muros y edificios interiores en un único elemento", () => {
    expect(plan).toBeDefined();
    expect(plan?.counts.towers).toBe(2);
    expect(plan?.counts.walls).toBe(2);
    expect(plan?.counts.buildings).toBe(1);
    expect(plan?.memberOsmIds.has("way/30")).toBe(true);
    expect(plan?.memberOsmIds.has("way/31")).toBe(false);
  });

  it("la torre del Homenaje y las demás torres llevan alturas distintas, siempre de la configuración", () => {
    const heights = (plan?.items ?? [])
      .filter((i) => i.kind === "keep" || i.kind === "tower")
      .map((i) => i.height)
      .sort((a, b) => a - b);
    expect(heights).toEqual([13, 17]);
  });

  it("el recinto interior (cerca del Homenaje) es más alto que el exterior", () => {
    const walls = (plan?.wallUnits ?? []).flatMap((unit) => unit.items);
    expect(new Set(walls.map((w) => w.height))).toEqual(new Set([7, 9]));
    const inner = walls.find((w) => w.height === 9);
    expect(inner?.segment?.a[1]).toBe(4);
  });

  it("cada tramo de muralla es una unidad con su identificador, nombre y huella", () => {
    const units = plan?.wallUnits ?? [];
    expect(units.map((u) => u.id)).toEqual(["w:alcazaba:01", "w:alcazaba:02"]);
    for (const unit of units) {
      expect(unit.name).toMatch(/^Muralla de la Alcazaba · tramo \d\d$/);
      expect(unit.footprint.length).toBeGreaterThanOrEqual(3);
      expect(unit.lengthM).toBeGreaterThan(0);
    }
  });

  it("los edificios interiores sin altura de fuente no pasan de 6 m (estimación)", () => {
    expect((plan?.items ?? []).find((i) => i.kind === "building")?.height).toBe(6);
  });

  it("todos los anillos son antihorarios (las caras apuntan hacia fuera)", () => {
    for (const item of plan?.items ?? []) expect(signedArea(item.outer)).toBeGreaterThan(0);
  });

  it("las almenas caben en la coronación y siguen el muro", () => {
    const cells = wallMerlons({ a: [0, 0], b: [32, 0], thickness: 2.2 });
    expect(cells.length).toBe(20); // 10 huecos × 2 bordes
    for (const cell of cells) {
      const zs = cell.map((p) => p[1]);
      expect(Math.max(...zs)).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1.1 - 1e-9);
    }
    expect(merlonCells(square(0, 0, 12)).length).toBeGreaterThan(8);
  });
});
