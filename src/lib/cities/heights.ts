/**
 * Origen de la altura de cada edificio.
 *
 * REGLA QUE ESTE MÓDULO EXISTE PARA SOSTENER: la interfaz no puede presentar una
 * cifra estimada como si fuera una medida. Cada edificio del paquete lleva la
 * propiedad `height_source`, y aquí se traduce a algo que se pueda leer sin
 * ambigüedad: si la cifra procede de un dato de la fuente, si es un dato
 * oficial derivado o si es el valor por defecto que se pone cuando no hay dato.
 *
 * Ninguna de las alturas de Málaga es una medición sobre el terreno: son datos
 * declarados (Catastro/OSM), un dato oficial derivado (superficie construida ÷
 * huella) o el valor por defecto. Por eso las categorías se llaman «declarado»,
 * «derivado» y «estimación», y nunca «medido».
 *
 * El mismo módulo lo consumen el visor (ficha del edificio y leyenda) y la ficha
 * de ciudad (recuento por origen). Si cada uno tuviera su propia interpretación,
 * acabarían discrepando y la promesa de honestidad se rompería por un lado.
 */

export type HeightKind = "declarado" | "derivado" | "estimado";

export type HeightSourceInfo = {
  id: string;
  /** Etiqueta corta para la ficha del edificio. */
  label: string;
  kind: HeightKind;
  /** `true` solo si la cifra procede de un dato de la fuente. */
  fromData: boolean;
  /** Explicación de una línea, sin adjetivos. */
  detail: string;
};

export const HEIGHT_SOURCES: Record<string, HeightSourceInfo> = {
  catastro_floors: {
    id: "catastro_floors",
    label: "Plantas declaradas por el Catastro",
    kind: "declarado",
    fromData: true,
    detail:
      "Número de plantas declarado en el conjunto INSPIRE de edificios del Catastro (× 3 m por planta).",
  },
  catastro_gfa_derived: {
    id: "catastro_gfa_derived",
    label: "Derivada de la superficie construida oficial",
    kind: "derivado",
    fromData: true,
    detail:
      "Superficie construida total del Catastro dividida por la huella del propio edificio catastral, redondeada a plantas (× 3 m). Es un dato oficial DERIVADO, no una altura declarada.",
  },
  osm_height: {
    id: "osm_height",
    label: "Altura declarada en OpenStreetMap",
    kind: "declarado",
    fromData: true,
    detail: "Etiqueta `height` de OpenStreetMap, tal cual.",
  },
  osm_levels: {
    id: "osm_levels",
    label: "Plantas declaradas en OpenStreetMap",
    kind: "declarado",
    fromData: true,
    detail: "Etiqueta `building:levels` de OpenStreetMap (× 3 m por planta).",
  },
  visual_override: {
    id: "visual_override",
    label: "Altura estimada, elevada para publicidad",
    kind: "estimado",
    fromData: false,
    detail:
      "El dato de altura es muy bajo para la función del edificio y no hay fuente verificada. Se dibuja más alto por decisión de producto, para que sus fachadas sirvan de soporte publicitario; no es una medición.",
  },
  landmark_reference: {
    id: "landmark_reference",
    label: "Altura de un edificio emblemático, con fuente",
    kind: "declarado",
    fromData: true,
    detail:
      "Cifra publicada en una fuente documentada (ver docs/verification/landmarks.md). Sustituye a la del paquete de datos, que para este edificio es errónea o inexistente.",
  },
  fortress_estimate: {
    id: "fortress_estimate",
    label: "Estimación para un conjunto fortificado",
    kind: "estimado",
    fromData: false,
    detail:
      "OpenStreetMap cartografía la planta de murallas, torres y puertas, pero no sus alturas, y ninguna fuente técnica consultada las publica. Las cifras son estimaciones declaradas en la configuración (ver docs/verification/landmarks.md).",
  },
  default_estimate: {
    id: "default_estimate",
    label: "Sin dato: se modela con el mínimo",
    kind: "estimado",
    fromData: false,
    detail:
      "No hay dato para este edificio. Se modela con 3 plantas (9 m) y se marca como estimación en el mapa y en esta ficha.",
  },
};

const UNKNOWN: HeightSourceInfo = {
  id: "origen_desconocido",
  label: "Origen no declarado",
  kind: "estimado",
  fromData: false,
  detail:
    "El paquete no declara el origen de esta altura, así que se trata como estimación. Es el comportamiento conservador.",
};

export function heightSourceInfo(id: string | null | undefined): HeightSourceInfo {
  if (!id) return UNKNOWN;
  return HEIGHT_SOURCES[id] ?? { ...UNKNOWN, id };
}

export const HEIGHT_KIND_LABEL: Record<HeightKind, string> = {
  declarado: "dato declarado por la fuente",
  derivado: "dato oficial derivado",
  estimado: "estimación, no un dato",
};

export type HeightGroup = {
  kind: HeightKind;
  label: string;
  buildings: number;
  share: number;
};

export type HeightSummary = {
  /** Total de edificios con origen contabilizado. */
  total: number;
  groups: HeightGroup[];
  /** Edificios cuya altura NO es el valor por defecto. */
  withData: number;
  /** Proporción de edificios con dato (declarado o derivado) frente al total. */
  withDataShare: number;
  estimated: number;
  /** Orígenes concretos presentes, ordenados de más a menos edificios. */
  sources: (HeightSourceInfo & { buildings: number; share: number })[];
};

const KIND_ORDER: HeightKind[] = ["declarado", "derivado", "estimado"];
const KIND_TITLE: Record<HeightKind, string> = {
  declarado: "Dato declarado",
  derivado: "Dato derivado",
  estimado: "Estimación",
};

/**
 * Resume el recuento por origen que publica el informe de calidad del pipeline.
 * Devuelve proporciones, no adjetivos, y separa siempre lo estimado.
 */
export function summarizeHeightSources(heightSources: Record<string, number>): HeightSummary {
  const entries = Object.entries(heightSources).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const byKind = new Map<HeightKind, number>();
  for (const [id, count] of entries) {
    const kind = heightSourceInfo(id).kind;
    byKind.set(kind, (byKind.get(kind) ?? 0) + count);
  }

  const groups: HeightGroup[] = KIND_ORDER.filter((kind) => (byKind.get(kind) ?? 0) > 0).map(
    (kind) => ({
      kind,
      label: KIND_TITLE[kind],
      buildings: byKind.get(kind) ?? 0,
      share: total === 0 ? 0 : (byKind.get(kind) ?? 0) / total,
    }),
  );

  const estimated = byKind.get("estimado") ?? 0;

  const sources = entries
    .map(([id, count]) => ({ ...heightSourceInfo(id), buildings: count, share: total === 0 ? 0 : count / total }))
    .sort((a, b) => b.buildings - a.buildings);

  return {
    total,
    groups,
    withData: total - estimated,
    withDataShare: total === 0 ? 0 : (total - estimated) / total,
    estimated,
    sources,
  };
}

export function formatShare(share: number, decimals = 1): string {
  return `${(share * 100).toFixed(decimals)} %`;
}
