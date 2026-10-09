import type { CityConfig } from "./cities/schema";

/**
 * Normaliza texto para búsqueda: sin acentos, sin mayúsculas, sin puntuación.
 * "Málaga" → "malaga". Se aplica igual a la consulta y al índice, para que la
 * búsqueda instantánea no dependa de que el usuario escriba tildes.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Campos indexados de una ciudad. Se recalcula una sola vez por ciudad. */
export function searchIndex(city: CityConfig): string {
  const localized = city.localizedNames ? Object.values(city.localizedNames) : [];
  return normalize([city.name, city.country, city.region, city.countryCode, ...localized].join(" "));
}

/** Coincidencia por prefijo de palabra o por subcadena, en ese orden de peso. */
export function matchesQuery(index: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (index.includes(q)) return true;
  // Tolerancia a términos separados: "mala esp" encuentra "malaga espana"
  const terms = q.split(" ").filter(Boolean);
  return terms.every((term) => index.includes(term));
}
