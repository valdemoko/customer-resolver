// GENERADO POR data-pipeline/steps/06-publish.mjs — NO EDITAR A MANO.
// Se regenera con:  cd data-pipeline && node run.mjs publish
//
// La decisión de publicar una ciudad no se toma escribiendo aquí "available":
// se toma leyendo la evidencia real de disco (teselas verificadas, verificación
// geográfica y mediciones de rendimiento). Si algo falta, esto dice
// "in_preparation" y los motivos, y la aplicación muestra ese estado.

export const publishStatus = "available" as const;
export const publishDecidedAt = "2026-10-09";

/** Evidencia en la que se apoya la decisión. */
export const publishEvidence = {
  "tiles": {
    "dataVersion": "2026.10.1",
    "bytes": 3387133,
    "sha256": "812626af6545029077091e9a833cc6fa3be795728447bd72b001929133184106",
    "tiles": 328,
    "idsMismatched": 0,
    "tilesExtractedAndCompared": 12,
    "tilesSampled": 12
  },
  "verification": {
    "generatedAt": "2026-10-09",
    "independentSource": "es.wikipedia.org — action=query&prop=coordinates (título exacto) y list=geosearch (contraste por área)",
    "totalControlPoints": 10,
    "verifiedPoints": 10,
    "pointsInsideCoverage": 10,
    "pointsWithin40mOfPublishedGeometry": 9
  },
  "performance": {
    "measuredAt": "2026-10-09",
    "build": {
      "framework": "Next.js 16.4.0 (Turbopack)",
      "mode": "production",
      "server": "next start -p 3210",
      "node": "v24.14.1",
      "browser": "Chrome 154.0.8037.98 (GPU AMD Radeon RX 6600, ANGLE D3D11)",
      "viewport": "1440x900",
      "network": "localhost (sin latencia de red ni CDN)",
      "dataVersion": "2026.10.1",
      "tilePackageBytes": 1737205
    },
    "metrics": {
      "lcpMs": 272,
      "lcpMsSecondLoad": 68,
      "cls": 0,
      "catalogTtfbMs": 50,
      "catalogHtmlBytes": 9443,
      "initialJsBytes": 205709,
      "initialJsTransferBytes": 209009,
      "initialJsFiles": 11,
      "catalogRequests": 40,
      "thirdPartyRequests": 0,
      "viewerJsBytes": 419211,
      "viewerJsFiles": 14,
      "viewerDownloadedForFirstViewBytes": 3174922,
      "memoryAfter5MinMb": 75.1,
      "memoryAfterSeconds": 310,
      "memoryAt10sMb": 75.7,
      "firstUsefulViewMs": 2688,
      "memoryNote": "B.4: la sesion larga de 5 minutos no se ha repetido; ultima medida (B.3) conservada"
    }
  },
  "docs": {
    "verification": "docs/verification/malaga.md",
    "performance": "docs/performance.md"
  }
} as const;

/** Motivos concretos por los que la ciudad NO está publicada. Vacío si lo está. */
export const publishBlockers = [] as const;
