/**
 * Paleta de la escena.
 *
 * TRES REGLAS QUE ESTE MÓDULO IMPONE:
 *
 *  1. **El color no es información inventada.** La altura ya viaja en los datos
 *     y su ORIGEN también (`height_source`). El color de un edificio es una
 *     decisión estética y se elige por hash del identificador: igual para el
 *     mismo edificio en todas las cargas y en todos los dispositivos. Un color
 *     por edificio generado al azar en cada carga haría que la ciudad parpadease
 *     distinta cada vez y que dos capturas no fueran comparables.
 *
 *  2. **Lo estimado no puede parecer medido, y por eso el color dice UNA sola
 *     cosa.** El color no codifica la fiabilidad en general: es decorativo. La
 *     única excepción es el gris: los edificios cuya altura es el valor por
 *     defecto (no hay dato) se pintan en gris piedra y su cubierta también. Es
 *     la única información que da el color, es la misma que declara la leyenda
 *     y la ficha, y es cierta: si se pintaran con la paleta cálida estarían
 *     pareciendo un dato que no existe.
 *
 *  3. **Armonía, no arcoíris.** La paleta es cálida y de saturación media, con
 *     los tokens escritos aquí una sola vez. Los edificios altos y modernos
 *     tienden a grises y blancos, como en la ciudad real.
 */

/** Hash FNV-1a de 32 bits: determinista, sin dependencias y bien repartido. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Paleta de fachadas. Cálidos mediterráneos, con variación de luminosidad. */
const WALLS = [
  "#f2ece0", // blanco cal
  "#ece2cf", // crema
  "#e0c9a0", // ocre
  "#d9a68a", // terracota suave
  "#c08a63", // siena
  "#e3c3b8", // rosa empolvado
  "#e8d49a", // amarillo albero
  "#c8ccd2", // gris azulado
  "#e5ab8c", // salmón
  "#d8d2c6", // piedra
] as const;

/** Fachadas para edificios altos o modernos: grises y blancos. */
const MODERN_WALLS = ["#f4f2ee", "#e6e7e6", "#d5d9dc", "#c3c9ce", "#eef0f1"] as const;

/** Cubiertas: teja, pizarra y terraza. */
const ROOFS = ["#c4703f", "#b25c39", "#a8543c", "#8f5c4a", "#7e8489", "#e8e2d6"] as const;

/**
 * Gris de «no hay dato». Un solo tono para fachada y cubierta, para que no se
 * confunda con ninguno de los tonos cálidos de la paleta.
 */
export const ESTIMATED = { wall: "#b6b2a8", roof: "#a49f94" } as const;

/** Cubiertas de edificios modernos: terraza clara y grava. */
const MODERN_ROOFS = ["#d8d5cd", "#c9c7c0", "#e2ded4"] as const;

/**
 * Tonos de hito. La Catedral, la Alcazaba, el Ayuntamiento y el Teatro Romano
 * se reconocen en los datos por nombre o por referencia catastral; se les da un
 * tono ligeramente distinto para que se lean, sin inventar fachadas ni detalles
 * que los datos no tienen.
 */
const LANDMARK_WALLS: Record<string, string> = {
  catedral: "#eee6d2",
  alcazaba: "#d6bd93",
  ayuntamiento: "#f0ead9",
  "teatro-romano": "#d9c8a7",
  "mercado-atarazanas": "#cdb894",
  castillo: "#cfc3ab",
  "palacio-episcopal": "#e7d2ad",
};

/** Aguas: azul mediterráneo, con la orilla más clara. */
export const SEA = {
  deep: "#1f7fa8",
  mid: "#2b96bf",
  shallow: "#5fbcd4",
  line: "#8ed4e4",
} as const;

/** Superficies planas de la escena. */
export const GROUND = {
  land: "#ddd4c2",
  plaza: "#e6ddc9",
  street: "#cfc6b3",
  path: "#d8d0bf",
  sand: "#e8d9ae",
  green: "#7fae5f",
  greenDark: "#5d8f45",
  greenLight: "#9cc474",
  port: "#a9b7c0",
  rail: "#a9a29a",
} as const;

/** Color de acento del producto, para el resaltado de una unidad. */
export const ACCENT = "#c2491d";

/**
 * Fondo del visor y nubes. El fondo es un azul pizarra de tono medio, ni claro ni
 * oscuro, para que la ciudad no destaque con un contraste duro. `horizon` y `fog`
 * son EL MISMO color a propósito: el borde difuminado del mapa se funde con el
 * fondo sin costura. Hacia arriba el cielo se oscurece un poco y respira (ver
 * `sky.ts`). `light` es el cielo que ILUMINA la escena (hemisferio) y que se
 * refleja en el agua: se mantiene claro aunque el fondo no lo sea.
 */
export const SKY = {
  top: "#2b4163",
  horizon: "#385070",
  fog: "#385070",
  light: "#dce9f0",
  cloudTop: "#f3f7ff",
  cloudBottom: "#a9bbd8",
} as const;

const MODERN_KINDS = new Set([
  "office",
  "commercial",
  "retail",
  "hotel",
  "industrial",
  "warehouse",
  "garage",
  "garages",
  "supermarket",
  "hospital",
  "school",
  "university",
  "civic",
  "public",
]);

export type BuildingColors = { wall: number; roof: number; landmark: boolean };

/** ¿Tiene esta altura o este uso pinta de edificio moderno? */
export function isModernBuilding(kind: string, heightM: number): boolean {
  if (heightM >= 29) return true;
  return MODERN_KINDS.has(kind.toLowerCase());
}

export type LandmarkId = keyof typeof LANDMARK_WALLS;

const LANDMARK_MATCHERS: Array<{ id: LandmarkId; pattern: RegExp }> = [
  { id: "catedral", pattern: /catedral/i },
  { id: "alcazaba", pattern: /alcazaba/i },
  { id: "ayuntamiento", pattern: /ayuntamiento|casa consistorial/i },
  { id: "teatro-romano", pattern: /teatro romano/i },
  { id: "mercado-atarazanas", pattern: /atarazanas/i },
  { id: "castillo", pattern: /gibralfaro|castillo/i },
  { id: "palacio-episcopal", pattern: /palacio episcopal/i },
];

/** Identifica un hito por su nombre de OSM. Devuelve `null` si no lo es. */
export function landmarkFor(name: string): LandmarkId | null {
  if (!name) return null;
  for (const matcher of LANDMARK_MATCHERS) {
    if (matcher.pattern.test(name)) return matcher.id;
  }
  return null;
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * Color de un edificio, decidido por su identificador estable.
 *
 * `osmId` es la clave: es único, no cambia entre cargas y está publicado en la
 * tesela. La variación de luminosidad se aplica sobre el tono elegido con un
 * segundo hash, no con `Math.random()`.
 */
export function buildingColors(options: {
  osmId: string;
  kind: string;
  heightM: number;
  name: string;
  /** Origen de la altura, tal cual viene en la tesela. */
  heightSource: string;
}): BuildingColors {
  // Sin dato de altura: gris, siempre, sin excepciones y antes que ninguna otra
  // regla. Un edificio estimado pintado de ocre sería un dato falso a la vista.
  if (options.heightSource === "default_estimate") {
    return {
      wall: hexToNumber(ESTIMATED.wall),
      roof: hexToNumber(ESTIMATED.roof),
      landmark: false,
    };
  }

  const landmark = landmarkFor(options.name);
  const modern = isModernBuilding(options.kind, options.heightM);
  const hash = hashString(options.osmId);

  if (landmark) {
    return {
      wall: hexToNumber(LANDMARK_WALLS[landmark] ?? WALLS[0]),
      roof: hexToNumber(ROOFS[hash % ROOFS.length] ?? ROOFS[0]),
      landmark: true,
    };
  }

  const walls = modern ? MODERN_WALLS : WALLS;
  const roofs = modern ? MODERN_ROOFS : ROOFS;
  return {
    wall: hexToNumber(walls[hash % walls.length] ?? walls[0]),
    roof: hexToNumber(roofs[(hash >>> 8) % roofs.length] ?? roofs[0]),
    landmark: false,
  };
}

/** Variación de luminosidad determinista, para que dos tonos iguales no se peguen. */
export function shade(color: number, amount: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * (1 + amount))));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * (1 + amount))));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * (1 + amount))));
  return (r << 16) | (g << 8) | b;
}

/**
 * Compatibilidad con la leyenda de la ficha de ciudad, que ya usaba estos
 * nombres. Se mantienen para no reescribir la ficha entera por un cambio de
 * paleta, y porque su significado sigue siendo el mismo: el gris es «sin dato».
 */
export const mapPalette = {
  buildingEstimated: ESTIMATED.wall,
  buildingEdge: "#6f5f4c",
  buildingMid: WALLS[2],
  buildingHigh: WALLS[4],
} as const;

/**
 * Superficies del suelo (B.4). Cada clase de `surface` tiene su color y su
 * altura de apoyo (`SURFACE_LAYERS`): la clase de mayor prioridad en el pipeline
 * es también la más alta, de modo que un resto numérico de solape (< 0,001 % del
 * suelo) se resuelve siempre a favor de la clase correcta y no parpadea.
 */
export const SURFACE_COLORS: Record<string, string> = {
  land: "#ddd4c2",
  road_major: "#4a4d52",
  road_minor: "#5b5e63",
  road_other: "#76777a",
  bridge: "#54585e",
  rail: "#a9a29a",
  plaza: "#eadfca",
  path: "#dcd3bf",
  steps: "#cfc5ae",
  quay: "#d1cdc2",
  pier: "#c6c1b4",
  breakwater: "#9f9a8f",
  beach: "#ebdaa6",
  pontoon: "#8d6c4b",
};

export const GREEN_COLORS: Record<string, string> = {
  park: "#7fae5f",
  garden: "#8cb86a",
  playground: "#b7c78b",
  pitch: "#86b36a",
  dog_park: "#9cc474",
  recreation_ground: "#93bd6b",
  common: "#93bd6b",
  nature_reserve: "#6f9f55",
  grass: "#9cc474",
  meadow: "#a6c97c",
  village_green: "#9cc474",
  greenfield: "#b4c98a",
  grassland: "#a9c27e",
  flowerbed: "#9fc477",
  cemetery: "#a3b98e",
  orchard: "#86b062",
  vineyard: "#8fb067",
  forest: "#5d8f45",
  wood: "#5d8f45",
  scrub: "#8fa66a",
  heath: "#a2a972",
};

export const LANDUSE_COLORS: Record<string, string> = {
  residential: "#ded5c3",
  commercial: "#e2d3c2",
  retail: "#e2d3c2",
  industrial: "#d3cfc6",
  education: "#dcd8cc",
  military: "#cfcbbb",
  railway: "#cdc7bd",
  religious: "#dccfba",
  garages: "#d0cbc0",
  parking: "#cfcac0",
  port: "#b9c3c8",
  brownfield: "#d6cdb9",
  construction: "#d6cdb9",
};

/** Alturas de apoyo (m) y orden de dibujo de cada clase. Ver docs/decisions.md (B.4). */
export const SURFACE_LAYERS: Record<string, { y: number; order: number }> = {
  land: { y: -0.1, order: 1 },
  landuse: { y: 0.02, order: 2 },
  green: { y: 0.05, order: 3 },
  beach: { y: 0.08, order: 4 },
  breakwater: { y: 0.1, order: 5 },
  pier: { y: 0.12, order: 6 },
  quay: { y: 0.14, order: 7 },
  steps: { y: 0.16, order: 8 },
  path: { y: 0.18, order: 9 },
  plaza: { y: 0.2, order: 10 },
  rail: { y: 0.22, order: 11 },
  road_other: { y: 0.24, order: 12 },
  road_minor: { y: 0.26, order: 13 },
  road_major: { y: 0.28, order: 14 },
  bridge: { y: 0.34, order: 15 },
};

/** Muros de muelle y orilla. */
export const SHORE = { top: "#d2cdc0", bottom: "#8f8b80", sand: "#d9c79a" } as const;

/** Agua (B.4): azul vivo, más claro y verdoso en la orilla. */
export const WATER = {
  deep: "#0f6fc2",
  mid: "#1d8ad6",
  shallow: "#58c3e4",
  foam: "#f4fbff",
} as const;
