import { describe, expect, it } from "vitest";
import {
  ESTIMATED,
  buildingColors,
  hashString,
  hexToNumber,
  isModernBuilding,
  landmarkFor,
} from "./palette";

describe("color por edificio", () => {
  const base = { kind: "apartments", heightM: 15, name: "", heightSource: "osm_levels" };

  it("es determinista para el mismo identificador", () => {
    const a = buildingColors({ ...base, osmId: "way/183832040" });
    const b = buildingColors({ ...base, osmId: "way/183832040" });
    expect(a).toEqual(b);
  });

  it("un edificio sin dato de altura es GRIS, y esto es una invariante", () => {
    // Es la única información que da el color en todo el diorama, y la leyenda y
    // la ficha la declaran. Si esta prueba falla, la ciudad está pintando de
    // ocre un edificio cuya altura no se sabe, que es lo mismo que presentar una
    // estimación como un dato.
    const colors = buildingColors({
      ...base,
      osmId: "way/1",
      heightSource: "default_estimate",
      name: "Catedral de Málaga",
      heightM: 60,
    });
    expect(colors.wall).toBe(hexToNumber(ESTIMATED.wall));
    expect(colors.roof).toBe(hexToNumber(ESTIMATED.roof));
    expect(colors.landmark).toBe(false);
  });

  it("no repite el mismo color para toda la ciudad", () => {
    const seen = new Set<number>();
    for (let index = 0; index < 400; index += 1) {
      seen.add(buildingColors({ ...base, osmId: `way/${index}` }).wall);
    }
    // La paleta tiene diez tonos cálidos y cinco modernos: un puñado de colores
    // distintos es el objetivo; cientos sería un arcoíris.
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(seen.size).toBeLessThanOrEqual(15);
  });

  it("los edificios altos tienden a grises y blancos", () => {
    expect(isModernBuilding("apartments", 42)).toBe(true);
    expect(isModernBuilding("office", 12)).toBe(true);
    expect(isModernBuilding("apartments", 12)).toBe(false);
  });
});

describe("hitos", () => {
  it("reconoce los edificios singulares por su nombre", () => {
    expect(landmarkFor("Catedral de Málaga")).toBe("catedral");
    expect(landmarkFor("Alcazaba")).toBe("alcazaba");
    expect(landmarkFor("Mercado de Atarazanas")).toBe("mercado-atarazanas");
    expect(landmarkFor("Edificio cualquiera")).toBeNull();
    expect(landmarkFor("")).toBeNull();
  });

  it("les da un tono propio sin inventarles detalles", () => {
    const cathedral = buildingColors({
      kind: "cathedral",
      heightM: 40,
      name: "Catedral de Málaga",
      heightSource: "osm_levels",
      osmId: "way/98",
    });
    expect(cathedral.landmark).toBe(true);
    const plain = buildingColors({
      kind: "apartments",
      heightM: 40,
      name: "",
      heightSource: "osm_levels",
      osmId: "way/98",
    });
    expect(cathedral.wall).not.toBe(plain.wall);
  });
});

describe("hash", () => {
  it("es estable y reparte", () => {
    expect(hashString("way/1")).toBe(hashString("way/1"));
    const values = new Set<number>();
    for (let index = 0; index < 500; index += 1) values.add(hashString(`way/${index}`));
    expect(values.size).toBeGreaterThan(480);
  });
});
