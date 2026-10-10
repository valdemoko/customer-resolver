import type { MapCity } from "@/components/marketing/NetworkMarkers";
import { listCities } from "./registry";
import { isCityOpenable } from "./schema";

/** Ciudades del catálogo como puntos del mapa del mundo (portada y salto desde el visor). */
export function listMapCities(): MapCity[] {
  return listCities().map((city) => ({
    slug: city.slug,
    name: city.name,
    country: city.country,
    lon: city.center[0],
    lat: city.center[1],
    openable: isCityOpenable(city),
    statusLabel: isCityOpenable(city) ? "Disponible" : city.status === "in_preparation" ? "En preparación" : "No disponible",
  }));
}
