import { describe, expect, it } from "vitest";
import { mergeFragments } from "./tiles";
import type { CityFeature } from "./tiles";
import { polygonArea } from "./polygon";

function building(osmId: string, outer: Array<[number, number]>, tile: string): CityFeature {
  return {
    layer: "buildings",
    kind: "yes",
    name: "Edificio",
    polygons: [{ outer, holes: [] }],
    lines: [],
    points: [],
    heightM: 12,
    heightSource: "osm_levels",
    levels: 4,
    areaM2: 0,
    osmId,
    catastroRef: "",
    genus: "",
    species: "",
    leafType: "",
    tile,
    props: {},
  };
}

describe("unión de trozos de edificio entre teselas", () => {
  it("un edificio partido por el borde de una tesela vuelve a ser uno solo", () => {
    // Dos trozos de un mismo rectángulo de 40 × 20 m que se solapan en el
    // «buffer» de las teselas: 0..24 y 16..40.
    const left = building("way/1", [[0, 0], [24, 0], [24, 20], [0, 20]], "17/1/1");
    const right = building("way/1", [[16, 0], [40, 0], [40, 20], [16, 20]], "17/2/1");
    const other = building("way/2", [[100, 0], [110, 0], [110, 10], [100, 10]], "17/2/1");
    const merged = mergeFragments([left, right, other]);
    const one = merged.find((feature) => feature.osmId === "way/1");
    expect(merged).toHaveLength(2);
    expect(one?.polygons).toHaveLength(1);
    expect(polygonArea(one?.polygons[0]?.outer ?? [])).toBeCloseTo(800, 3);
  });

  it("si un trozo ya trae el edificio entero (margen de teselas), se usa sin calcular la unión", () => {
    const whole = { ...building("way/7", [[0, 0], [40, 0], [40, 20], [0, 20]], "17/1/1"), areaM2: 800 };
    const part = { ...building("way/7", [[30, 0], [60, 0], [60, 20], [30, 20]], "17/2/1"), areaM2: 800 };
    const merged = mergeFragments([part, whole]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.polygons[0]?.outer).toEqual(whole.polygons[0]?.outer);
  });

  it("si ningún trozo llega entero, se unen (edificios mayores que el margen)", () => {
    const left = { ...building("way/8", [[0, 0], [24, 0], [24, 20], [0, 20]], "17/1/1"), areaM2: 800 };
    const right = { ...building("way/8", [[16, 0], [40, 0], [40, 20], [16, 20]], "17/2/1"), areaM2: 800 };
    const [one] = mergeFragments([left, right]);
    expect(polygonArea(one?.polygons[0]?.outer ?? [])).toBeCloseTo(800, 3);
  });

  it("lo que no es un edificio, o no tiene identificador, pasa sin tocar", () => {
    const green: CityFeature = { ...building("", [[0, 0], [5, 0], [5, 5]], "t"), layer: "surface" };
    const anonymous = building("", [[0, 0], [5, 0], [5, 5]], "t");
    expect(mergeFragments([green, anonymous])).toHaveLength(2);
  });

  it("un edificio que solo llega en una tesela no se modifica", () => {
    const single = building("way/3", [[0, 0], [8, 0], [8, 8], [0, 8]], "17/1/1");
    const [result] = mergeFragments([single]);
    expect(result?.polygons[0]?.outer).toEqual(single.polygons[0]?.outer);
  });
});
