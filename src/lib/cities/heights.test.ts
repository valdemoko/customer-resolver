import { describe, expect, it } from "vitest";
import {
  HEIGHT_SOURCES,
  heightSourceInfo,
  summarizeHeightSources,
} from "./heights";

/**
 * El módulo de orígenes existe para que la interfaz no pueda presentar una
 * altura estimada como un dato. Estos tests fijan esa propiedad: lo estimado se
 * cuenta aparte, lo desconocido cae del lado conservador y las proporciones
 * suman lo que tienen que sumar.
 */
describe("origen de las alturas", () => {
  it("marca como dato solo los orígenes que proceden de una fuente", () => {
    const dataSources = Object.values(HEIGHT_SOURCES).filter((source) => source.fromData);
    expect(dataSources.length).toBeGreaterThan(0);
    for (const source of dataSources) {
      expect(source.kind).not.toBe("estimado");
    }
    expect(HEIGHT_SOURCES.default_estimate?.fromData).toBe(false);
    expect(HEIGHT_SOURCES.default_estimate?.kind).toBe("estimado");
  });

  it("trata un origen desconocido como estimación, no como dato", () => {
    const info = heightSourceInfo("algo_que_no_existe");
    expect(info.kind).toBe("estimado");
    expect(info.fromData).toBe(false);
  });

  it("separa el dato declarado del derivado y de la estimación", () => {
    const summary = summarizeHeightSources({
      catastro_gfa_derived: 1464,
      osm_levels: 6953,
      osm_height: 4,
      default_estimate: 50,
    });

    expect(summary.total).toBe(8471);
    expect(summary.withData).toBe(8421);
    expect(summary.estimated).toBe(50);

    const byKind = new Map(summary.groups.map((group) => [group.kind, group]));
    expect(byKind.get("declarado")?.buildings).toBe(6957);
    expect(byKind.get("derivado")?.buildings).toBe(1464);
    expect(byKind.get("estimado")?.buildings).toBe(50);

    // Las proporciones son proporciones del total: suman 1.
    const share = summary.groups.reduce((sum, group) => sum + group.share, 0);
    expect(share).toBeCloseTo(1, 10);
  });

  it("ordena los orígenes concretos de más a menos edificios", () => {
    const summary = summarizeHeightSources({ osm_levels: 10, catastro_floors: 2 });
    expect(summary.sources.map((source) => source.id)).toEqual(["osm_levels", "catastro_floors"]);
  });

  it("no divide por cero cuando no hay recuento", () => {
    const summary = summarizeHeightSources({});
    expect(summary.total).toBe(0);
    expect(summary.withDataShare).toBe(0);
    expect(summary.groups).toEqual([]);
  });
});
