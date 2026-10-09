import malagaUnits from "@/data/market/units-malaga.json";
import { UNIT_ID_PATTERN } from "./types";
import geoRaw from "@/data/cities/malaga.geo.json";

/**
 * ¿Existe esta unidad? La API solo vende identificadores que están en el
 * paquete de datos (edificios, locales, tramos de muralla) o que declara la
 * configuración (paneles de crucero, velas, carteles de avioneta).
 */
const market = (geoRaw as unknown as { scene: { market: { cruisePanelsPerShip: number; sailUnits: number; planes: number; basePriceCents: number } } }).scene
  .market;

const known = {
  buildings: new Set(malagaUnits.buildings),
  parcels: new Set(malagaUnits.parcels),
  walls: new Set(malagaUnits.walls),
};

export const BASE_PRICE = market.basePriceCents;

export function isKnownUnit(id: string): boolean {
  if (!UNIT_ID_PATTERN.test(id)) return false;
  const [kind, a, b] = id.split(":");
  switch (kind) {
    case "b":
      return known.buildings.has(id.slice(2));
    case "p":
      return known.parcels.has(id.slice(2));
    case "w":
      return known.walls.has(id);
    case "s":
      return Number(b) < market.cruisePanelsPerShip && Boolean(a);
    case "v":
      return Number(a) < market.sailUnits;
    case "a":
      return Number(id.slice("a:plane-".length)) <= market.planes;
    default:
      return false;
  }
}

/** Cuántas unidades de cada clase hay a la venta (cifras reales del paquete y de la configuración). */
export function unitCatalogCounts() {
  return {
    buildings: malagaUnits.buildings.length,
    parcels: malagaUnits.parcels.length,
    walls: malagaUnits.walls.length,
    cruisePanels: market.cruisePanelsPerShip * 3,
    sails: market.sailUnits,
    planes: market.planes,
    mobile: market.cruisePanelsPerShip * 3 + market.sailUnits + market.planes,
  };
}

type NamedScene = { landmarks?: Array<{ osmId: string; name: string }>; heightOverrides?: Array<{ osmId: string; name?: string }> };
const names = (malagaUnits as unknown as { names?: Record<string, string> }).names ?? {};
const scene = (geoRaw as unknown as { scene: NamedScene }).scene;
const extraNames = new Map<string, string>(
  [...(scene.landmarks ?? []), ...(scene.heightOverrides ?? [])]
    .filter((entry): entry is { osmId: string; name: string } => Boolean(entry.name))
    .map((entry) => [entry.osmId, entry.name]),
);

/** Nombre público de un edificio, si existe en los datos. */
export function buildingNameOf(osmId: string): string | null {
  return extraNames.get(osmId) ?? names[osmId] ?? null;
}
