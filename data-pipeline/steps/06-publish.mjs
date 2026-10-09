import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUILD_DIR, REPO_DIR, loadCity } from "../lib/city.mjs";
import { log, step, warn } from "../lib/log.mjs";

/**
 * Decisión de publicación.
 *
 * POR QUÉ ES UN PASO Y NO UN CAMPO QUE SE EDITA A MANO: la tentación es poner
 * `status: "available"` cuando el paquete se genera. Así fue durante un tiempo y
 * dejó la aplicación afirmando que Málaga estaba publicada antes de que
 * existieran ni la verificación geográfica ni las mediciones de rendimiento. La
 * ciudad aparecía como disponible con la evidencia a medias.
 *
 * Este paso lee la evidencia REAL de disco y decide. Si algo falta o no cuadra,
 * la ciudad se queda en `in_preparation` y los motivos se publican literalmente,
 * en lugar de quedar en un comentario. La decisión queda escrita en el
 * manifiesto del paquete (`publish`), que es lo que lee la aplicación.
 *
 * Contenido exigido para publicar:
 *  1. Paquete de teselas verificado con el lector oficial (paso 04): cero
 *     discrepancias de identificador y extracción de teselas comprobada.
 *  2. Verificación geográfica (paso 05) con TODOS los puntos de control hallados
 *     en la fuente independiente, y al menos 10.
 *  3. Mediciones de rendimiento sobre un build de producción
 *     (`build/<slug>.performance.json`), dentro de los presupuestos que declara
 *     la propia ciudad.
 *  4. Los informes en `docs/verification/<slug>.md` y `docs/performance.md`.
 *
 * QUEDA FUERA DE ESTA DECISIÓN, a propósito: la licencia del terreno y del
 * Catastro están pendientes de lectura literal, y eso se publica como limitación
 * en el informe de fase, no como bloqueo. Bloquear la publicación por un trámite
 * documental no protegería a nadie; publicar una cifra falsa, sí hace daño. La
 * interfaz muestra igualmente la atribución y marca esas fuentes como no
 * verificadas.
 */

/** Umbrales de rendimiento. Se comparan contra los presupuestos de la ciudad. */
const BUDGET_MS_LCP = 2500;
const BUDGET_CLS = 0.1;

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileExists(path) {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function run() {
  const city = await loadCity();
  step(`06 · Decisión de publicación — ${city.name}`);

  const blockers = [];
  const evidence = {};

  // ------------------------------------------------------------ 1. teselas
  const manifestPath = join(BUILD_DIR, `${city.slug}.tiles.json`);
  const manifest = await readJsonIfPresent(manifestPath);
  if (!manifest) {
    blockers.push("No hay manifiesto de teselas (build/" + city.slug + ".tiles.json).");
  } else {
    evidence.tiles = {
      dataVersion: manifest.dataVersion,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      tiles: manifest.tiles,
      idsMismatched: manifest.verification.tileIdsMismatched,
      tilesExtractedAndCompared: manifest.verification.tilesExtractedAndCompared,
      tilesSampled: manifest.verification.tilesSampled,
    };
    if (manifest.verification.tileIdsMismatched !== 0) {
      blockers.push(
        `El paquete tiene ${manifest.verification.tileIdsMismatched} identificadores de tesela que no coinciden con el lector oficial.`,
      );
    }
    if (manifest.verification.tilesExtractedAndCompared === 0) {
      blockers.push("No se extrajo ninguna tesela del paquete para comprobarla.");
    }
    if (manifest.bytes > city.maxTilePackageBytes) {
      blockers.push(
        `El paquete pesa ${manifest.bytes} B y el presupuesto de la ciudad es ${city.maxTilePackageBytes} B.`,
      );
    }
  }

  // -------------------------------------------------------- 2. verificación
  const verification = await readJsonIfPresent(join(BUILD_DIR, `${city.slug}.verification.json`));
  if (!verification) {
    blockers.push("No hay verificación geográfica (build/" + city.slug + ".verification.json).");
  } else {
    evidence.verification = {
      generatedAt: verification.generatedAt,
      independentSource: verification.independentSource,
      totalControlPoints: verification.totalControlPoints,
      verifiedPoints: verification.verifiedPoints,
      pointsInsideCoverage: verification.pointsInsideCoverage,
      pointsWithin40mOfPublishedGeometry: verification.pointsWithin40mOfPublishedGeometry,
    };
    if (verification.totalControlPoints < 10) {
      blockers.push(
        `La verificación declara ${verification.totalControlPoints} puntos de control, y se exigen al menos 10.`,
      );
    }
    if (verification.verifiedPoints < verification.totalControlPoints) {
      blockers.push(
        `Solo ${verification.verifiedPoints} de ${verification.totalControlPoints} puntos de control tienen coordenada independiente. No se publica con puntos sin comprobar.`,
      );
    }
    if (verification.pointsInsideCoverage < verification.totalControlPoints) {
      blockers.push(
        `${verification.totalControlPoints - verification.pointsInsideCoverage} punto(s) de control caen fuera del área publicada.`,
      );
    }
  }

  // -------------------------------------------------------- 3. rendimiento
  const performance = await readJsonIfPresent(join(BUILD_DIR, `${city.slug}.performance.json`));
  if (!performance) {
    blockers.push("No hay mediciones de rendimiento (build/" + city.slug + ".performance.json).");
  } else {
    evidence.performance = {
      measuredAt: performance.measuredAt,
      build: performance.build,
      metrics: performance.metrics,
    };
    const metrics = performance.metrics ?? {};
    const required = ["lcpMs", "cls", "initialJsBytes", "firstUsefulViewMs", "memoryAfter5MinMb"];
    for (const key of required) {
      if (typeof metrics[key] !== "number" || Number.isNaN(metrics[key])) {
        blockers.push(`La medición de rendimiento no incluye «${key}».`);
      }
    }
    if (typeof metrics.lcpMs === "number" && metrics.lcpMs > BUDGET_MS_LCP) {
      blockers.push(`LCP del catálogo ${metrics.lcpMs} ms por encima del presupuesto de ${BUDGET_MS_LCP} ms.`);
    }
    if (typeof metrics.cls === "number" && metrics.cls > BUDGET_CLS) {
      blockers.push(`CLS del catálogo ${metrics.cls} por encima del presupuesto de ${BUDGET_CLS}.`);
    }
    if (
      typeof metrics.memoryAfter5MinMb === "number" &&
      metrics.memoryAfter5MinMb > city.maxViewerMemoryMb
    ) {
      blockers.push(
        `El visor usa ${metrics.memoryAfter5MinMb} MB tras 5 minutos y el presupuesto de la ciudad es ${city.maxViewerMemoryMb} MB.`,
      );
    }
  }

  // ------------------------------------------------------------- 4. informes
  const verificationDoc = join(REPO_DIR, "docs", "verification", `${city.slug}.md`);
  const performanceDoc = join(REPO_DIR, "docs", "performance.md");
  evidence.docs = {
    verification: `docs/verification/${city.slug}.md`,
    performance: "docs/performance.md",
  };
  if (!(await fileExists(verificationDoc))) {
    blockers.push(`Falta el informe de verificación (docs/verification/${city.slug}.md).`);
  }
  if (!(await fileExists(performanceDoc))) {
    blockers.push("Falta el informe de rendimiento (docs/performance.md).");
  }

  // -------------------------------------------------------------- decisión
  const publishStatus = blockers.length === 0 ? "available" : "in_preparation";

  if (manifest) {
    manifest.publish = {
      status: publishStatus,
      decidedAt: new Date().toISOString().slice(0, 10),
      evidence,
      blockers,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  const generated = `// GENERADO POR data-pipeline/steps/06-publish.mjs — NO EDITAR A MANO.
// Se regenera con:  cd data-pipeline && node run.mjs publish
//
// La decisión de publicar una ciudad no se toma escribiendo aquí "available":
// se toma leyendo la evidencia real de disco (teselas verificadas, verificación
// geográfica y mediciones de rendimiento). Si algo falta, esto dice
// "in_preparation" y los motivos, y la aplicación muestra ese estado.

export const publishStatus = ${JSON.stringify(publishStatus)} as const;
export const publishDecidedAt = ${JSON.stringify(
    manifest?.publish?.decidedAt ?? new Date().toISOString().slice(0, 10),
  )};

/** Evidencia en la que se apoya la decisión. */
export const publishEvidence = ${JSON.stringify(evidence, null, 2)} as const;

/** Motivos concretos por los que la ciudad NO está publicada. Vacío si lo está. */
export const publishBlockers = ${JSON.stringify(blockers, null, 2)} as const;
`;

  await writeFile(
    join(REPO_DIR, "src", "lib", "cities", "data", `${city.slug}.publish.generated.ts`),
    generated,
  );

  if (publishStatus === "available") {
    log(`Publicación: DISPONIBLE. ${blockers.length} bloqueos.`);
  } else {
    for (const blocker of blockers) warn(`Bloqueo: ${blocker}`);
    log(`Publicación: EN PREPARACIÓN. ${blockers.length} bloqueo(s) pendientes.`);
  }
  log(`Módulo generado: src/lib/cities/data/${city.slug}.publish.generated.ts`);

  return { publishStatus, blockers, evidence };
}
