import { CityConfigSchema, isCityOpenable, sceneFitsCoverage, type CityConfig } from "./schema";
import { malaga, malagaPublishBlockers, malagaVerification } from "./data/malaga";

/**
 * Registro de ciudades.
 *
 * Añadir una ciudad = crear un archivo en ./data, validarlo con el esquema y
 * añadirlo a esta lista. El motor (visor, catálogo, consultas de parcelas) no
 * se toca: lee de aquí.
 *
 * Cualquier configuración inválida hace fallar el build a propósito: es mejor
 * romper la compilación que publicar un catálogo que promete algo falso.
 */

const rawCities = [malaga] as const;

export const cities: CityConfig[] = rawCities.map((city, index) => {
  const result = CityConfigSchema.safeParse(city);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  · ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuración de ciudad inválida en la posición ${index}:\n${issues}\n`,
    );
  }
  const parsed = result.data;
  // Invariante de la escena: la zona cubierta MÁS su banda de difuminado tiene
  // que caber dentro del área con datos. Fuera del paquete no hay nada, y esa
  // franja es justo la que se ve difuminada: si el polígono se sale, la niebla
  // taparía un vacío en lugar de fundir datos reales.
  if (parsed.tiles && !sceneFitsCoverage(parsed)) {
    throw new Error(
      `Configuración inválida de ${parsed.slug}: el círculo de cobertura más su banda de ${parsed.scene.coverage.fadeBandM} m se sale del área cubierta por el paquete de datos. Reduce el radio o la banda, o amplía la cobertura del pipeline.`,
    );
  }
  return parsed;
});

/** Orden estable para el catálogo: disponibles primero, luego alfabético. */
export function listCities(): CityConfig[] {
  const rank: Record<CityConfig["status"], number> = {
    available: 0,
    in_preparation: 1,
    unavailable: 2,
  };
  return [...cities].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name, "es");
  });
}

export function getCityBySlug(slug: string): CityConfig | undefined {
  return cities.find((city) => city.slug === slug);
}

export function getOpenableCities(): CityConfig[] {
  return cities.filter(isCityOpenable);
}

/**
 * Motivos por los que una ciudad todavía no se puede abrir, escritos por el
 * pipeline (paso 06). No son un estado de ánimo: son comprobaciones concretas
 * que aún no pasan. Se leen desde aquí para que la interfaz pueda decirlos.
 */
const PUBLISH_BLOCKERS: Record<string, readonly string[]> = {
  malaga: malagaPublishBlockers,
};

export function getPublishBlockers(slug: string): readonly string[] {
  return PUBLISH_BLOCKERS[slug] ?? [];
}

/**
 * Resumen de la verificación geográfica publicada por ciudad. `null` si la ciudad
 * no tiene verificación: en ese caso la ficha lo dice, no inventa un cero ni un
 * guion que parezca un dato.
 */
const VERIFICATION: Record<
  string,
  { totalControlPoints: number; verifiedPoints: number; pointsInsideCoverage: number; pointsWithin40mOfPublishedGeometry: number } | undefined
> = {
  malaga: malagaVerification,
};

export function getVerificationSummary(slug: string) {
  return VERIFICATION[slug] ?? null;
}

export { isCityOpenable };
export type { CityConfig };
