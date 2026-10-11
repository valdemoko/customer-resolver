import { z } from "zod";

/**
 * Configuración de ciudad: la fuente de verdad es la base de datos, pero el
 * mismo esquema valida el archivo de seed y el paquete de datos del pipeline.
 * Añadir una ciudad es datos + registro, nunca código nuevo.
 *
 * Invariante de honestidad (ver docs/decisions.md#honestidad-de-datos):
 * una ciudad solo puede estar "available" si su paquete de datos está
 * publicado. El esquema lo impone, no la buena voluntad del programador.
 */

export const CityStatusSchema = z.enum(["available", "in_preparation", "unavailable"]);
export type CityStatus = z.infer<typeof CityStatusSchema>;

export const DataStatusSchema = z.enum(["pending", "ready", "failed"]);
export type DataStatus = z.infer<typeof DataStatusSchema>;

/** [longitud, latitud] en WGS84 (EPSG:4326), el orden de GeoJSON. */
export const LngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const BoundsSchema = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
  })
  .refine((b) => b.west < b.east, { message: "bounds: west debe ser menor que east" })
  .refine((b) => b.south < b.north, { message: "bounds: south debe ser menor que north" });

export const InitialViewSchema = z.object({
  center: LngLatSchema,
  zoom: z.number().min(0).max(24),
  pitch: z.number().min(0).max(85),
  /** Rumbo en grados desde el norte geográfico, sentido horario. */
  bearing: z.number().min(-360).max(360),
});

export const CameraLimitsSchema = z
  .object({
    minZoom: z.number().min(0).max(24),
    maxZoom: z.number().min(0).max(24),
    minPitch: z.number().min(0).max(85),
    maxPitch: z.number().min(0).max(85),
    /** Caja de paneo: más amplia que el área con datos, para no perder el norte. */
    bounds: BoundsSchema,
  })
  .refine((c) => c.minZoom < c.maxZoom, { message: "cameraLimits: minZoom < maxZoom" })
  .refine((c) => c.minPitch < c.maxPitch, { message: "cameraLimits: minPitch < maxPitch" });

export const AttributionSchema = z.object({
  /** Texto de atribución exacto y obligatorio que exige la licencia. */
  label: z.string().min(1),
  url: z.string().regex(/^https:\/\//, "La URL de atribución debe ser https"),
  /** Identificador SPDX o nombre de la licencia. */
  license: z.string().min(1),
  licenseUrl: z.string().regex(/^https:\/\//).optional(),
  /** Qué parte del mapa aporta esta fuente (para la tabla de docs/verification). */
  contributed: z.string().min(1),
  /**
   * `true` solo si una persona ha leído el texto literal de la licencia y ha
   * confirmado la obligación de atribución. Si es `false`, la atribución se
   * muestra igualmente (es lo conservador) y la tarea queda abierta en
   * docs/decisions.md. No se pone a `true` por suposición.
   */
  verified: z.boolean(),
});

export const DataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** URL de la que se descarga realmente, para reproducibilidad. */
  endpoint: z.string().min(1),
  /**
   * Fecha de extracción en ISO 8601 (YYYY-MM-DD), o `null` mientras la fuente
   * esté declarada pero el pipeline no la haya extraído todavía. No se rellena
   * a mano: la escribe el pipeline en el manifiesto del paquete de datos.
   */
  extractedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "extractedAt debe ser YYYY-MM-DD").nullable(),
  /**
   * CRS de origen y de destino declarados para la conversión. Se documenta la
   * conversión completa («EPSG:4326 solicitado; el conjunto se publica en
   * EPSG:25830») porque la trazabilidad del cambio de sistema de referencia es
   * parte de la reproducibilidad, no un detalle.
   */
  crs: z.string().min(3).max(160).optional(),
  attribution: AttributionSchema,
  /** Capas que aporta esta fuente al paquete final. */
  layers: z.array(z.string().min(1)).min(1),
});

/**
 * Paquete de teselas publicado. `null` significa: no hay datos publicados, y la
 * interfaz debe decirlo. Nunca se inventa un mapa "de ejemplo" que parezca real.
 */
export const TilePackageSchema = z.object({
  /** Ruta servida por el CDN (absoluta o /tiles/...). */
  url: z.string().min(1),
  /** Versión con la que se cachea; permite invalidar visitas repetidas. */
  dataVersion: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, "dataVersion debe ser YYYY.MM.N"),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Área realmente cubierta por el paquete (no el término municipal). */
  coveredBounds: BoundsSchema,
  layers: z.array(z.string().min(1)).min(1),
  /** Tamaño real del archivo, medido al generarlo. Sirve para la carga con % real. */
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "sha256 en hexadecimal minúscula"),
});

/** Zona cargable/descargable según cámara. */
export const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bounds: BoundsSchema,
  /** Nivel de detalle disponible en esta zona. */
  detail: z.enum(["full", "reduced", "placeholder"]),
});

export const PerformanceProfileSchema = z.object({
  /** Presupuesto de bytes del paquete de teselas de esta ciudad. */
  maxTilePackageBytes: z.number().int().positive(),
  /** Frames por segundo objetivo en escritorio. */
  targetFpsDesktop: z.number().int().positive(),
  targetFpsMobile: z.number().int().positive(),
  /** Presupuesto de memoria del visor, en megabytes. */
  maxViewerMemoryMb: z.number().int().positive(),
});

export const LocaleTextSchema = z.record(z.string().min(2).max(5), z.string().min(1));

/**
 * Terreno. En Málaga el relieve no es decorativo: Gibralfaro y la Alcazaba
 * están a más de 100 m sobre el nivel del centro, y sin relieve la ciudad queda
 * plana y falsa. Es opcional porque depende de una fuente externa.
 */
export const TerrainSchema = z.object({
  enabled: z.boolean(),
  /** Plantilla de teselas ráster de elevación, con {z}/{x}/{y}. */
  tilesUrl: z.string().regex(/^https:\/\//, "El terreno debe servirse por https"),
  encoding: z.enum(["terrarium", "mapbox"]),
  tileSize: z.number().int().positive(),
  maxZoom: z.number().int().positive(),
  exaggeration: z.number().positive().max(3),
  attribution: AttributionSchema,
});

/**
 * Configuración de la escena 3D: ciudad continua sobre terreno, con la zona
 * cubierta definida por un polígono y los alrededores difuminados en niebla.
 *
 * Todo lo que define la ZONA (polígono, banda de difuminado), la CÁMARA y las
 * NUBES vive aquí, no en el motor. El motor no sabe nada de Málaga: recibe estos
 * números. Añadir una ciudad es, otra vez, datos y una línea en el registro.
 */
export const LandmarkSchema = z.object({
  /** Clave estable del emblemático en el código. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Identificador OSM del edificio cuyo volumen sustituye o corrige. */
  osmId: z.string().regex(/^(way|relation)\/\d+$/),
  /** Altura verificada en metros, con la fuente. `null` si no hay fuente. */
  heightM: z.number().positive().nullable(),
  heightSource: z.string().min(1),
  /** Modelo GLB propio (relativo a /public). `null` = volumen extruido. */
  modelUrl: z.string().nullable(),
  /** Lado por el que se ve la fachada principal (torres), para orientar el modelo. */
  facing: z.enum(["N", "S", "E", "W"]).nullable(),
  /** `simplified` = volumen fiel pero sin detalle; `detailed` = modelo propio. */
  fidelity: z.enum(["simplified", "detailed"]),
});

export const SceneSchema = z.object({
  /** Origen del sistema local en metros, en grados. */
  center: LngLatSchema,
  seed: z.number().int().nonnegative(),
  /** Zoom de las teselas que se decodifican. Debe existir en el paquete. */
  detailZoom: z.number().int().min(10).max(22),
  coverage: z.object({
    /** Zona bien definida: un CÍRCULO (centro [lon, lat] y radio en metros). */
    circle: z.object({
      center: LngLatSchema,
      radiusM: z.number().min(300).max(6000),
    }),
    /**
     * Ancho de la banda de transición RADIAL en metros. Más allá del círculo la
     * ciudad se funde con la niebla a lo largo de esta distancia, y la banda
     * entera (más el margen de extracción) tiene que caber dentro del área con
     * datos.
     */
    fadeBandM: z.number().min(60).max(1200),
    /** Margen extra de extracción más allá de la banda, en metros. */
    extractMarginM: z.number().min(0).max(600),
  }),
  /**
   * Exageración vertical UNIFORME de los edificios en 3D. Es una escala visual:
   * las alturas de los datos no se tocan y el panel muestra las reales.
   */
  verticalExaggeration: z.object({
    factor: z.number().min(1).max(2.5),
    note: z.string().min(1),
  }),
  /** Nivel de la lámina de agua por tipo, en metros respecto al suelo (negativo). */
  water: z.object({
    levelsM: z.record(z.string(), z.number().max(0).min(-6)),
    note: z.string().min(1),
  }),
  /** Zonas comerciales donde se estiman parcelas de local donde faltan datos. */
  locales: z.object({
    estimatedTargetWidthM: z.number().min(3).max(12),
    zones: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        center: LngLatSchema.optional(),
        radiusM: z.number().positive().optional(),
        osmPolygon: z.string().regex(/^(way|relation)\/\d+$/).optional(),
        paddingM: z.number().min(0).optional(),
        frontage: z.enum(["any", "pedestrian"]),
      }),
    ),
  }),
  ships: z.object({
    cruise: z.array(
      z.object({
        lengthM: z.number().min(80).max(400),
        beamM: z.number().min(15).max(60),
        heightM: z.number().min(15).max(80),
        hull: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        deck: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    ),
    small: z.object({ maxDesktop: z.number().int().min(0).max(300), maxMobile: z.number().int().min(0).max(150) }),
    note: z.string().min(1),
  }),
  market: z.object({
    basePriceCents: z.number().int().min(50).max(100_000),
    cruisePanelsPerShip: z.number().int().min(2).max(8),
    sailUnits: z.number().int().min(0).max(200),
    planes: z.number().int().min(0).max(3),
    trucks: z.number().int().min(0).max(30).default(0),
    movingBoats: z.object({ desktop: z.number().int().min(0).max(60), mobile: z.number().int().min(0).max(30) }),
    cruiseCycleSeconds: z.number().min(120).max(7200),
    planeAltitudeM: z.array(z.number().min(60).max(900)).min(1).max(3),
    planeOrbitM: z.array(z.number().min(300).max(1600)).min(1).max(3),
    note: z.string().min(1),
  }),
  fortresses: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      parts: z.array(z.string().min(1)).min(1),
      enclosureOsmId: z.string().regex(/^(way|relation)\/\d+$/),
      wallHeightM: z.object({ outer: z.number().positive(), inner: z.number().positive() }),
      towerHeightM: z.number().positive(),
      keepOsmId: z.string().regex(/^(way|relation)\/\d+$/).nullable(),
      keepHeightM: z.number().positive(),
      gateHeightM: z.number().positive(),
      heightSource: z.string().min(1),
      fidelity: z.enum(["simplified", "detailed"]),
    }),
  ),
  camera: z
    .object({
      /** Zoom máximo: casi a pie de calle. */
      minDistanceM: z.number().min(10).max(500),
      maxDistanceM: z.number().min(500).max(20_000),
      minPitchDeg: z.number().min(1).max(60),
      maxPitchDeg: z.number().min(20).max(89),
      initialAzimuthDeg: z.number().min(-360).max(360),
      initialPitchDeg: z.number().min(0).max(85),
      initialDistanceM: z.number().min(100).max(20_000),
      /** Altura mínima de la cámara sobre el suelo, en metros. */
      minHeightM: z.number().min(0.5).max(50),
      /** El desplazamiento solo se permite por debajo de esta distancia. */
      panBelowDistanceM: z.number().min(100).max(20_000),
      /** Segundos por vuelta completa. */
      rotationSeconds: z.number().min(20).max(600),
      idleReturnMs: z.number().int().min(1000).max(60_000),
      returnDurationMs: z.number().int().min(800).max(2500),
    })
    .refine((c) => c.minDistanceM < c.maxDistanceM, {
      message: "scene.camera: minDistanceM debe ser menor que maxDistanceM",
    })
    .refine((c) => c.minPitchDeg < c.maxPitchDeg, {
      message: "scene.camera: minPitchDeg debe ser menor que maxPitchDeg",
    })
    .refine(
      (c) => c.initialPitchDeg >= c.minPitchDeg && c.initialPitchDeg <= c.maxPitchDeg,
      { message: "scene.camera: la inclinación inicial debe estar dentro de los límites" },
    )
    .refine(
      (c) => c.initialDistanceM >= c.minDistanceM && c.initialDistanceM <= c.maxDistanceM,
      { message: "scene.camera: la distancia inicial debe estar dentro de los límites" },
    ),
  clouds: z.object({
    /** Bancos bajos del perímetro + nubes altas de fondo. */
    desktop: z.number().int().min(0).max(80),
    mobile: z.number().int().min(0).max(40),
    driftSeconds: z.number().min(60).max(3600),
  }),
  trees: z.object({
    maxDesktop: z.number().int().min(0).max(20_000),
    maxMobile: z.number().int().min(0).max(10_000),
    /** Calles con palmeras estimadas (nombre exacto en OSM). */
    palmStreets: z.array(z.string().min(1)),
  }),
  landmarks: z.array(LandmarkSchema),
  /** Alturas dibujadas decididas por producto (no son un dato): edificio → metros. */
  heightOverrides: z
    .array(z.object({ osmId: z.string().regex(/^(way|relation)\/\d+$/), name: z.string().min(1).optional(), heightM: z.number().positive(), note: z.string().min(1) }))
    .default([]),
  /** Edificios cuyo patio interior grande se cierra con tejado (decisión de producto: se leía como un agujero). */
  closedCourtyards: z.array(z.object({ osmId: z.string().regex(/^(way|relation)\/\d+$/), note: z.string().min(1) })).default([]),
  /** Sombras de mapa. En móvil se apagan solas; aquí se declara la intención. */
  shadows: z.boolean(),
});

export type SceneConfig = z.infer<typeof SceneSchema>;
export type LandmarkConfig = z.infer<typeof LandmarkSchema>;

/**
 * Resultados medidos del control de calidad del paquete de datos. Se escriben
 * desde el pipeline, no a mano: son la evidencia que la ficha de ciudad enseña
 * en lugar de adjetivos.
 */
export const QualityReportSchema = z.object({
  buildings: z.number().int().nonnegative(),
  /** Recuento de edificios por origen de la altura. */
  heightSources: z.record(z.string(), z.number().int().nonnegative()),
  /** Proporción de edificios con altura de dato (no del valor por defecto). */
  realHeightShare: z.number().min(0).max(1),
  /** 'grossFloorArea' del Catastro disponible. */
  catastroGrossFloorAreaAvailable: z.number().int().nonnegative(),
  /** Plantas declaradas por el Catastro. En Málaga hoy: cero. */
  catastroDeclaredFloorsAvailable: z.number().int().nonnegative(),
  /** Contraste entre dos fuentes independientes. `null` si no se pudo hacer. */
  crossCheck: z
    .object({
      compared: z.number().int().nonnegative(),
      agreeWithinOneFloorShare: z.number().min(0).max(1),
      meanAbsoluteFloorDelta: z.number().nonnegative(),
    })
    .nullable(),
  notes: z.array(z.string()),
});

export type QualityReport = z.infer<typeof QualityReportSchema>;

export const CityConfigSchema = z
  .object({
    id: z.string().uuid("id debe ser un UUID estable"),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug en kebab-case"),
    name: z.string().min(1),
    /** Nombres por idioma, para SEO internacional. */
    localizedNames: LocaleTextSchema.optional(),
    country: z.string().min(1),
    /** ISO 3166-1 alpha-2. */
    countryCode: z.string().regex(/^[A-Z]{2}$/, "countryCode ISO 3166-1 alpha-2"),
    region: z.string().min(1),
    center: LngLatSchema,
    bounds: BoundsSchema,
    initialView: InitialViewSchema,
    cameraLimits: CameraLimitsSchema,
    sources: z.array(DataSourceSchema).min(1),
    attributions: z.array(AttributionSchema).min(1),
    zones: z.array(ZoneSchema).min(1),
    performance: PerformanceProfileSchema,
    status: CityStatusSchema,
    /**
     * De dónde sale el número de parcelas. "database" significa que la interfaz
     * puede mostrarlo; "none" significa que debe omitirlo por completo.
     */
    parcelCountSource: z.enum(["database", "none"]),
    dataStatus: DataStatusSchema,
    tiles: TilePackageSchema.nullable(),
    /** Miniatura generada desde la propia escena (no fotos de stock). */
    thumbnail: z
      .object({
        src: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        alt: z.string().min(1),
        generatedFrom: z.string().min(1),
      })
      .nullable(),
    /** Si la vista 3D está publicada, la ciudad se puede abrir. */
    viewerUrl: z.string().min(1).nullable(),
    /** Mediciones del paquete de datos. `null` mientras no haya paquete. */
    report: QualityReportSchema.nullable(),
    /** Relieve. `null` si la ciudad se muestra plana. */
    terrain: TerrainSchema.nullable(),
    /** Escena 3D: zona cubierta, cámara, nubes, árboles y emblemáticos. */
    scene: SceneSchema,
  })
  .refine((c) => c.dataStatus !== "ready" || c.tiles !== null, {
    message: "dataStatus 'ready' exige un paquete de teselas publicado",
    path: ["tiles"],
  })
  .refine((c) => c.tiles === null || c.sources.every((s) => s.extractedAt !== null), {
    message:
      "Un paquete publicado exige fecha de extracción real en todas sus fuentes (nada de procedencia inventada)",
    path: ["sources"],
  })
  .refine((c) => c.status !== "available" || (c.tiles !== null && c.dataStatus === "ready"), {
    message:
      "Una ciudad 'available' debe tener datos publicados. Si el paquete aún no existe, usa 'in_preparation'.",
    path: ["status"],
  })
  .refine((c) => c.parcelCountSource !== "database" || c.status === "available", {
    message: "No se puede prometer un recuento de parcelas en una ciudad no disponible",
    path: ["parcelCountSource"],
  })
  .refine(
    (c) =>
      c.initialView.center[0] >= c.bounds.west &&
      c.initialView.center[0] <= c.bounds.east &&
      c.initialView.center[1] >= c.bounds.south &&
      c.initialView.center[1] <= c.bounds.north,
    { message: "La vista inicial debe estar dentro de bounds", path: ["initialView"] },
  );

export type CityConfig = z.infer<typeof CityConfigSchema>;
export type Bounds = z.infer<typeof BoundsSchema>;
export type LngLat = z.infer<typeof LngLatSchema>;
export type Attribution = z.infer<typeof AttributionSchema>;
export type TilePackage = z.infer<typeof TilePackageSchema>;

/**
 * La zona cubierta MÁS su banda de difuminado tiene que caber dentro del área con
 * datos: fuera del paquete no hay nada, y la banda es justo lo que se ve ahí. Es
 * la comprobación que impide que una ciudad se dibuje sobre terreno inventado.
 * Es aproximada (caja del polígono + banda), y es conservadora.
 */
export function sceneFitsCoverage(city: CityConfig): boolean {
  if (!city.tiles) return false;
  const bounds = city.tiles.coveredBounds;
  const { circle, fadeBandM, extractMarginM } = city.scene.coverage;
  const reach = circle.radiusM + fadeBandM + extractMarginM * 0.5;
  const lat = circle.center[1];
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLon = reach / metersPerDegLon;
  const dLat = reach / 111_132;
  return (
    circle.center[0] - dLon >= bounds.west - 1e-9 &&
    circle.center[0] + dLon <= bounds.east + 1e-9 &&
    circle.center[1] - dLat >= bounds.south - 1e-9 &&
    circle.center[1] + dLat <= bounds.north + 1e-9
  );
}

/** Una ciudad puede abrirse en el visor 3D solo si está disponible y publicada. */
export function isCityOpenable(city: CityConfig): boolean {
  return city.status === "available" && city.viewerUrl !== null && city.tiles !== null;
}
