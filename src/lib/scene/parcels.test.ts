import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildParcels } from "./parcels";
import type { CityFeature } from "./tiles";
import type { BuildingRecord } from "./city";

function feature(
  layer: CityFeature["layer"],
  props: Record<string, string | number>,
  lines: Array<Array<[number, number]>>,
): CityFeature {
  return {
    layer,
    kind: String(props.kind ?? ""),
    name: "",
    polygons: [],
    lines,
    points: [],
    heightM: 0,
    heightSource: "",
    levels: 0,
    areaM2: 0,
    osmId: "",
    catastroRef: "",
    genus: "",
    species: "",
    leafType: "",
    tile: "17/0/0",
    props,
  };
}

function building(id: string, renderHeightM: number): BuildingRecord {
  return {
    id,
    index: 0,
    osmId: id,
    name: "Edificio de prueba",
    heightM: renderHeightM / 1.25,
    renderHeightM,
    heightSource: "osm_levels",
    kind: "yes",
    levels: 4,
    areaM2: 400,
    catastroRef: "",
    landmark: false,
    landmarkId: null,
    fortressId: null,
    wallHex: "#ffffff",
    centroid: [0, 0],
    footprint: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
    radiusM: 14,
  };
}

// Edificio de 0..20 × 0..20; fachada sur (z = 20) con normal +z (en la tesela: ny = -1, porque norte = −z).
const FACADE = (id: string, a: [number, number], b: [number, number], source: string) =>
  feature(
    "parcels",
    {
      id,
      source,
      building: "way/1",
      nx: 0,
      ny: -1,
      street: "Calle Prueba",
      zone: "z",
      poi_name: source === "osm_poi" ? "Panadería X" : "",
      category: "shop=bakery",
    },
    [[a, b]],
  );

describe("parcelas publicitarias", () => {
  const buildings = new Map([["way/1", building("way/1", 15)]]);

  it("cada parcela es un rectángulo pegado a la fachada, fuera del edificio", () => {
    const system = buildParcels({
      features: [FACADE("L-1", [2, 20], [8, 20], "osm_poi"), FACADE("L-2", [8.2, 20], [14, 20], "estimated")],
      buildingsById: buildings,
      exaggeration: 1.25,
    });
    expect(system.records).toHaveLength(2);
    for (const record of system.records) {
      expect(record.normal).toEqual([0, 1]);
      expect(record.state).toBe("available");
    }
    const position = (system.group.children[0] as THREE.Mesh).geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      // z = 20 (pared) + 0,12 (separación): siempre FUERA de la huella (0..20).
      expect(position.getZ(i)).toBeGreaterThan(20);
      expect(position.getZ(i)).toBeLessThan(20.2);
      // Nunca bajo el suelo ni por encima de la cubierta dibujada.
      expect(position.getY(i)).toBeGreaterThan(0);
      expect(position.getY(i)).toBeLessThan(15);
    }
  });

  it("la altura de la parcela sigue a la exageración vertical", () => {
    const system = buildParcels({
      features: [FACADE("L-1", [2, 20], [8, 20], "osm_poi")],
      buildingsById: buildings,
      exaggeration: 1.25,
    });
    expect(system.records[0]?.heightM).toBeCloseTo(3.4 * 1.25 - 0.3 * 1.25, 6);
  });

  it("un tramo partido entre teselas se reúne en una sola parcela", () => {
    const system = buildParcels({
      features: [FACADE("L-9", [2, 20], [5, 20], "estimated"), FACADE("L-9", [5, 20], [9, 20], "estimated")],
      buildingsById: buildings,
      exaggeration: 1.25,
    });
    expect(system.records).toHaveLength(1);
    expect(system.records[0]?.widthM).toBeCloseTo(7, 6);
  });

  it("descarta con motivo lo que no tiene edificio o cuelga de un edificio demasiado bajo", () => {
    const orphan = FACADE("L-1", [2, 20], [8, 20], "estimated");
    orphan.props = { ...orphan.props, building: "way/404" };
    const system = buildParcels({
      features: [orphan, FACADE("L-2", [2, 20], [8, 20], "estimated")],
      buildingsById: new Map([["way/1", building("way/1", 1.5)]]),
      exaggeration: 1.25,
    });
    expect(system.records).toHaveLength(0);
    expect(system.stats.skippedNoBuilding).toBe(1);
    expect(system.stats.skippedTooLow).toBe(1);
  });

  it("todas las parcelas empiezan disponibles y sin anunciante, contadas por origen", () => {
    const system = buildParcels({
      features: [FACADE("L-1", [2, 20], [8, 20], "osm_poi"), FACADE("L-2", [9, 20], [15, 20], "estimated")],
      buildingsById: buildings,
      exaggeration: 1.25,
    });
    expect(system.stats.bySource).toEqual({ catastro_unit: 0, osm_poi: 1, estimated: 1 });
    expect(system.records.every((r) => r.state === "available")).toBe(true);
    expect(new Set(system.records.map((r) => r.id)).size).toBe(system.records.length);
  });
});
