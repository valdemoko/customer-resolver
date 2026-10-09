// GENERADO POR data-pipeline/steps/04-tiles.mjs — NO EDITAR A MANO.
// Se regenera con:  cd data-pipeline && node run.mjs tiles
//
// Este módulo es el puente entre el pipeline y la aplicación: mientras no exista
// un paquete, `tilesPackage` es null y la ciudad no se puede abrir.
//
// OJO: aquí NO se decide si la ciudad está publicada. Que existan teselas
// verificadas es condición necesaria, pero el estado `available` lo decide el
// paso 06 leyendo además la verificación geográfica y las mediciones de
// rendimiento. Escribirlo aquí fue un error real: la ciudad figuraba como
// publicada con la evidencia a medias.

export const dataVersion = "2026.10.1";
export const generatedAt = "2026-10-09";
export const dataStatus = "ready" as const;

/** Fechas de extracción reales, escritas por el pipeline. */
export const sourceExtractedAt: Record<string, string> = {
  "osm": "2026-10-09",
  "catastro-bu": "2026-10-09"
};

export const tilesPackage = {
  url: "/tiles/malaga/malaga-2026.10.1.pmtiles",
  dataVersion: "2026.10.1",
  generatedAt: "2026-10-09",
  coveredBounds: {"west":-4.43833,"south":36.69907,"east":-4.39867,"north":36.73093},
  layers: ["buildings","streets","trees","land","water","surface","fortress","berths","moorings","parcels"],
  bytes: 3389950,
  sha256: "31ecc7fbf147b450771a5a333521e4f0fc84d15155600540767572a18f0f4b3e",
};

/** Resumen del control de calidad, medido en el paso 03. */
export const quality = {
  buildings: 5399,
  buildingsWithRealOrDeclaredHeight: 97.2,
  heightSources: {"catastro_gfa_derived":1612,"osm_levels":3628,"default_estimate":152,"osm_height":7},
  catastroDeclaredFloorsAvailable: 0,
  catastroGrossFloorAreaAvailable: 9110,
  catastroMatched: 3624,
  crossCheckAgreementShare: 92.6,
  crossCheckBuildings: 1561,
  relationsNotAssembled: 161,
  discardedTooSmall: 131,
} as const;

/** Presupuesto declarado frente a peso real del paquete. */
export const weight = {
  bytes: 3389950,
  tiles: 328,
  emptyTilesSkipped: 162,
  budgetBytes: 12 * 1024 * 1024,
} as const;

/** Control de calidad medido en el paso 03, publicado tal cual. */
export const report = {
  buildings: 5399,
  heightSources: {"catastro_gfa_derived":1612,"osm_levels":3628,"default_estimate":152,"osm_height":7},
  realHeightShare: 0.9718466382663457,
  catastroGrossFloorAreaAvailable: 9110,
  catastroDeclaredFloorsAvailable: 0,
  crossCheck: {"compared":1561,"agreeWithinOneFloorShare":0.9256886611146701,"meanAbsoluteFloorDelta":0.77},
  // El as string[] es necesario: dentro de un objeto as const la lista quedaría
  // de solo lectura y no encaja con el esquema de la aplicación, que declara
  // notes: string[]. El as const de fuera conserva los literales numéricos.
  notes: ["Relación 18144528 descartada: 2 anillos exteriores (se esperaba 1).","161 relaciones de OpenStreetMap no se han ensamblado (no son edificios: agua, usos del suelo, etc.). Solo el agua se procesa por su anillo exterior."] as string[],
} as const;
