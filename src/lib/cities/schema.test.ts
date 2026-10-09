import { describe, expect, it } from "vitest";
import { CityConfigSchema, isCityOpenable, type CityConfig } from "./schema";
import { malaga } from "./data/malaga";
import { cities, listCities } from "./registry";

/** Copia profunda mutable para construir casos inválidos a partir de uno válido. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

const base = clone(malaga) as unknown as Record<string, unknown>;

const validTiles = {
  url: "/tiles/malaga/2026.10.1.pmtiles",
  dataVersion: "2026.10.1",
  generatedAt: "2026-10-09",
  coveredBounds: { west: -4.432, south: 36.7135, east: -4.408, north: 36.7275 },
  layers: ["buildings", "streets"],
  bytes: 4_194_304,
  sha256: "a".repeat(64),
};

function withTiles(): Record<string, unknown> {
  const city = clone(base);
  city.tiles = validTiles;
  city.dataStatus = "ready";
  city.status = "available";
  city.parcelCountSource = "database";
  city.viewerUrl = "/city/malaga/viewer";
  city.sources = (city.sources as Record<string, unknown>[]).map((source) => ({
    ...source,
    extractedAt: "2026-10-09",
  }));
  return city;
}

describe("invariantes de honestidad del catálogo", () => {
  it("la ciudad real del registro es válida y su estado se sostiene con la evidencia", () => {
    const result = CityConfigSchema.safeParse(malaga);
    expect(result.success).toBe(true);

    // El estado no se escribe a mano: lo decide el pipeline (paso 06). Lo que
    // aquí se comprueba es la coherencia entre ese estado y los datos: si la
    // ciudad está disponible, tiene que haber paquete publicado de verdad; si
    // no lo está, no puede abrirse el visor.
    if (malaga.status === "available") {
      expect(malaga.tiles).not.toBeNull();
      expect(malaga.dataStatus).toBe("ready");
      expect(isCityOpenable(malaga)).toBe(true);
    } else {
      expect(isCityOpenable(malaga)).toBe(false);
    }
  });

  it("prohíbe marcar una ciudad como disponible sin paquete de datos", () => {
    const city = withTiles();
    city.tiles = null;
    const result = CityConfigSchema.safeParse(city);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("available");
  });

  it("prohíbe declarar 'ready' sin teselas publicadas", () => {
    const city = clone(base);
    city.dataStatus = "ready";
    city.tiles = null;
    const result = CityConfigSchema.safeParse(city);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("dataStatus");
  });

  it("exige fecha de extracción real en todas las fuentes si hay paquete publicado", () => {
    const city = withTiles();
    const sources = city.sources as Record<string, unknown>[];
    sources[0] = { ...sources[0]!, extractedAt: null };
    const result = CityConfigSchema.safeParse(city);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("extracción");
  });

  it("prohíbe prometer recuento de parcelas en una ciudad no disponible", () => {
    // El caso inválido se construye explícitamente: una ciudad en preparación
    // que promete parcelas. Antes se daba por hecho que la ciudad de base no
    // estaba publicada; cuando Málaga pasó a disponible, el test dejó de probar
    // lo que decía probar.
    const city = clone(base);
    city.status = "in_preparation";
    city.parcelCountSource = "database";
    const result = CityConfigSchema.safeParse(city);
    expect(result.success).toBe(false);
  });

  it("prohíbe una vista inicial fuera de los límites declarados", () => {
    const city = clone(base);
    city.initialView = { ...(city.initialView as object), center: [-4.5, 36.7196] };
    const result = CityConfigSchema.safeParse(city);
    expect(result.success).toBe(false);
  });

  it("rechaza un identificador que no sea UUID", () => {
    const city = clone(base);
    city.id = "malaga";
    expect(CityConfigSchema.safeParse(city).success).toBe(false);
  });

  it("rechaza un código de país que no sea ISO 3166-1 alpha-2", () => {
    const city = clone(base);
    city.countryCode = "esp";
    expect(CityConfigSchema.safeParse(city).success).toBe(false);
  });

  it("rechaza un slug que no sea kebab-case", () => {
    const city = clone(base);
    city.slug = "Málaga";
    expect(CityConfigSchema.safeParse(city).success).toBe(false);
  });

  it("acepta una ciudad completamente publicada", () => {
    const result = CityConfigSchema.safeParse(withTiles());
    expect(result.success).toBe(true);
    expect(isCityOpenable(result.data as CityConfig)).toBe(true);
  });
});

describe("registro", () => {
  it("expone al menos la ciudad de Málaga", () => {
    expect(cities.length).toBeGreaterThanOrEqual(1);
    expect(cities.some((city) => city.slug === "malaga")).toBe(true);
  });

  it("ordena las ciudades que se pueden abrir antes que las que están en preparación", () => {
    const ordered = listCities();
    const firstUnavailableIndex = ordered.findIndex((city) => city.status !== "available");
    if (firstUnavailableIndex !== -1) {
      expect(ordered.slice(firstUnavailableIndex).every((city) => city.status !== "available")).toBe(
        true,
      );
    }
  });
});
