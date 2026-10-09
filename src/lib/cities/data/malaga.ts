import type { CityConfig } from "../schema";
import geoRaw from "@/data/cities/malaga.geo.json";
import { dataStatus, report, sourceExtractedAt, tilesPackage } from "./malaga.generated";
import { publishBlockers, publishEvidence, publishStatus } from "./malaga.publish.generated";

/**
 * El JSON no puede expresar tuplas ni uniones literales, así que se proyecta a
 * un tipo exacto aquí. No es una validación: la validación real la hace Zod en
 * `registry.ts` al importar, y si el archivo no cumple el esquema la compilación
 * falla.
 */
const geo = geoRaw as unknown as {
  slug: string;
  name: string;
  center: [number, number];
  bounds: { west: number; south: number; east: number; north: number };
  initialView: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  cameraLimits: {
    minZoom: number;
    maxZoom: number;
    minPitch: number;
    maxPitch: number;
    bounds: { west: number; south: number; east: number; north: number };
  };
  zooms: { min: number; max: number };
  zones: CityConfig["zones"];
  scene: CityConfig["scene"];
};

/**
 * MÁLAGA — primer registro del catálogo.
 *
 * Todo lo que puede cambiar cuando se regeneran los datos viene del módulo
 * `malaga.generated.ts`, que escribe el pipeline. Todo lo geográfico viene del
 * contrato compartido `src/data/cities/malaga.geo.json`, el mismo archivo que
 * lee el pipeline: si la app y los datos no coinciden, el visor pediría teselas
 * que no existen.
 *
 * Este archivo NO se edita para "publicar" la ciudad: se ejecuta
 * `pnpm pipeline` y el módulo generado cambia el estado real.
 */
export const malaga: CityConfig = {
  id: "6f8a8eb6-3621-459d-864b-33470421ff8f",
  slug: geo.slug,
  name: geo.name,
  localizedNames: { es: "Málaga", en: "Malaga", fr: "Malaga" },
  country: "España",
  countryCode: "ES",
  region: "Andalucía",
  center: geo.center,
  bounds: geo.bounds,
  initialView: geo.initialView,
  cameraLimits: geo.cameraLimits,
  zones: geo.zones,
  /**
   * LA CIUDAD SE MUESTRA PLANA. Y se dice, no se disimula.
   *
   * En Málaga el relieve no es decorativo: Gibralfaro está a más de 130 m sobre
   * el nivel del centro y la Alcazaba se levanta sobre una colina. La única
   * fuente de elevación accesible desde este entorno es Terrain Tiles
   * (Mapzen/AWS), cuya licencia es una pila de atribuciones con componentes
   * restrictivos que no se ha podido leer literalmente; el Centro de Descargas
   * del CNIG, que sería la fuente prevista, no responde desde aquí. El encargo
   * es explícito para este caso: si no hay terreno con licencia verificada, se
   * usa terreno plano y se dice en la interfaz y en el informe. Eso es lo que
   * se hace: el terreno es plano y su ficha lo declara.
   *
   * Consecuencia asumida: la ciudad no reproduce el desnivel real. Un relieve
   * inventado o con licencia dudosa sería peor que no tenerlo.
   */
  terrain: null,
  scene: geo.scene,
  sources: [
    {
      id: "osm",
      name: "OpenStreetMap — consulta Overpass del área de la ciudad",
      endpoint: "https://overpass-api.de/api/interpreter",
      extractedAt: sourceExtractedAt.osm ?? null,
      crs: "EPSG:4326",
      layers: ["buildings", "streets", "water", "green", "landuse", "places", "landmarks"],
      attribution: {
        label: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        contributed:
          "Huellas de edificio, número de plantas y altura, red viaria, agua, zonas verdes, usos del suelo y toponimia",
        verified: true,
      },
    },
    {
      id: "catastro-bu",
      name: "Catastro — edificios INSPIRE (Dirección General del Catastro)",
      endpoint: "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx",
      extractedAt: sourceExtractedAt["catastro-bu"] ?? null,
      crs: "EPSG:4326 (solicitado); el conjunto se publica en EPSG:25830",
      layers: ["building_floors"],
      attribution: {
        label: "© Dirección General del Catastro",
        url: "https://www.catastro.hacienda.gob.es/webinspire/index.html",
        license: "Licencia de acceso y uso de los servicios y conjuntos de datos INSPIRE de la DGC",
        licenseUrl: "https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf",
        contributed:
          "Superficie construida total (grossFloorArea) para estimar el número de plantas. El número de plantas declarado NO se publica en este conjunto para Málaga: se midió y es cero.",
        // El PDF de la licencia usa fuentes con codificación propia y no se pudo
        // leer automáticamente. Pendiente de lectura manual antes de publicar.
        // Ver docs/decisions.md#licencias.
        verified: false,
      },
    },
  ],
  attributions: [
    {
      label: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      license: "ODbL 1.0",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      contributed: "Base urbana",
      verified: true,
    },
    {
      label: "© Dirección General del Catastro",
      url: "https://www.catastro.hacienda.gob.es/webinspire/index.html",
      license: "Licencia INSPIRE DGC (pendiente de lectura literal)",
      licenseUrl: "https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf",
      contributed: "Superficie construida oficial",
      verified: false,
    },
  ],
  performance: {
    maxTilePackageBytes: 12 * 1024 * 1024,
    targetFpsDesktop: 60,
    targetFpsMobile: 30,
    maxViewerMemoryMb: 512,
  },
  // Estado real, escrito por el pipeline. `publishStatus` lo decide el paso 06
  // con la evidencia en la mano (teselas verificadas, verificación geográfica y
  // rendimiento medido); no se escribe a mano. `publishBlockers` enumera lo que
  // falta, para que la interfaz pueda decirlo en lugar de callarlo.
  status: publishStatus,
  // NINGUNA parcela todavía: la tabla vive en la base de datos (fase D) y la
  // capa de parcelas aún no existe. Declarar "database" haría que la tarjeta del
  // catálogo afirmara que hay ubicaciones publicadas en la base de datos, que
  // hoy sería falso. Se declara "none" y la interfaz omite el dato.
  parcelCountSource: "none",
  dataStatus,
  tiles: tilesPackage,
  thumbnail: null,
  viewerUrl: tilesPackage ? `/city/${geo.slug}/viewer` : null,
  report,
};

/**
 * Motivos por los que la ciudad todavía no está publicada, tal cual los escribió
 * el pipeline. Se exporta para que la interfaz pueda mostrarlos: un estado sin
 * explicación se lee como abandono, y aquí hay una lista concreta de lo que
 * falta.
 */
export const malagaPublishBlockers: readonly string[] = publishBlockers;

/**
 * Resumen de la verificación geográfica que sostiene la publicación: cuántos
 * puntos de control independientes se comprobaron, cuántos caen dentro del área
 * y cuántos quedan a menos de 40 m de la geometría publicada. Lo escribe el paso
 * 05; la ficha de ciudad lo muestra en lugar de remitir a un documento.
 */
export const malagaVerification = publishEvidence.verification;

