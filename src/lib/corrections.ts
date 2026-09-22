/**
 * Corrections log — Resolveo.
 *
 * A dated record of changes that affected what the site or the analysis says.
 * It exists because a system that cites legislation must be able to show when
 * it got something wrong and what it changed: a correction that is only visible
 * in a commit log is not accountability.
 *
 * Only real, already-applied changes belong here. When adding an entry, state
 * what was wrong, what it says now, and which pages or problems it affects —
 * never a vague "improvements made".
 */

export type CorrectionKind = "legal" | "analysis" | "content" | "privacy";

export interface Correction {
  /** ISO date the correction reached production. */
  readonly date: string;
  readonly kind: CorrectionKind;
  /** What was wrong, stated plainly. */
  readonly problem: string;
  /** What it says / does now. */
  readonly resolution: string;
  /** Pages or problems affected. */
  readonly scope: string;
}

export const CORRECTION_KIND_LABELS: Record<CorrectionKind, string> = {
  legal: "Normativa y fuentes",
  analysis: "Análisis",
  content: "Contenido",
  privacy: "Privacidad y datos",
};

/**
 * First date the project keeps this log. Before it, changes were not recorded
 * here; the limitation is stated on the page rather than hidden.
 */
export const CORRECTIONS_LOG_START = "2026-09-22";

export const CORRECTIONS: readonly Correction[] = [
  {
    date: "2026-09-22",
    kind: "legal",
    problem:
      "La cita del artículo 5.1 del Reglamento (CE) 261/2004 incluía un fragmento en inglés y plazos que no coincidían con el texto publicado.",
    resolution:
      "La cita se reescribió con el texto oficial en español publicado en el BOE (documento DOUE-L-2004-80291, DOUE L 46 de 17.02.2004). Afecta a las reglas de cancelación de vuelo que invocaban ese artículo.",
    scope: "Problema «Vuelo cancelado» · Fuentes normativas",
  },
  {
    date: "2026-09-22",
    kind: "legal",
    problem:
      "Los gastos adicionales por cancelación se atribuían al artículo 8.3 del Reglamento, que en realidad regula los aeropuertos de una misma ciudad.",
    resolution:
      "La base correcta es el artículo 9.1, junto con el artículo 5.1(a)-(b). El supuesto de gastos adicionales queda marcado para revisión legal humana antes de aplicarse como conclusión publicada.",
    scope: "Problema «Vuelo cancelado»",
  },
  {
    date: "2026-09-22",
    kind: "legal",
    problem:
      "Se anunciaba un plazo de «3 meses» para reclamar sin ninguna fuente registrada que lo respaldara, y se atribuía un plazo de 2 años al Reglamento 261/2004, que no fija plazos de reclamación.",
    resolution:
      "Se eliminó el plazo sin fuente. Se publican solo los plazos que constan en las fuentes registradas: 3 años (art. 120.1 TRLGDCU), 2 años de presunción (art. 121.1) y 30 días (art. 66 bis.1), y se indica expresamente que el Reglamento europeo no fija plazo.",
    scope: "Fichas de problema · Informes",
  },
  {
    date: "2026-09-22",
    kind: "legal",
    problem:
      "La página de fuentes mantenía una copia propia de las referencias y atribuía el artículo 102.2 del TRLGDCU a la Ley 11/2022.",
    resolution:
      "La página ya no mantiene una copia: se genera a partir de los propios módulos de análisis, de modo que una fuente solo aparece si una regla publicada la cita. La atribución incorrecta desapareció con la copia manual.",
    scope: "Fuentes normativas",
  },
  {
    date: "2026-09-22",
    kind: "privacy",
    problem:
      "La política de cookies afirmaba que el navegador no almacenaba datos, cuando el flujo de un caso usa almacenamiento de sesión.",
    resolution:
      "La política describe la clave real que se usa (el identificador del caso), para qué sirve y cuándo se borra. La política de privacidad identifica además los proveedores que tratan datos y el hecho de que el análisis usa modelos de lenguaje.",
    scope: "Política de cookies · Política de privacidad",
  },
  {
    date: "2026-09-22",
    kind: "content",
    problem:
      "La página de autoría indicaba un número de pruebas del proyecto como si fuera una credencial, y ese número no correspondía con la realidad del repositorio.",
    resolution:
      "Se retiró el dato. En su lugar se explica qué comprueba el sistema automáticamente y qué revisa una persona, que es lo que una página de autoría puede afirmar honestamente.",
    scope: "Autoría",
  },
  {
    date: "2026-09-22",
    kind: "analysis",
    problem:
      "La lectura de los documentos subidos no proponía ningún hecho al análisis: el archivo se almacenaba y se extraía su texto, pero no se usaba para completar datos del caso.",
    resolution:
      "La extracción de datos a partir del documento está conectada al análisis y los hechos propuestos se incorporan como candidatos a confirmar, nunca como hechos confirmados.",
    scope: "Documentos del caso · Informes",
  },
  {
    date: "2026-09-22",
    kind: "analysis",
    problem:
      "Un caso podía quedar con una conclusión imposible de alcanzar: el informe seguía pidiendo un dato que ya no podía cambiar el resultado.",
    resolution:
      "El análisis deja de pedir datos que no pueden alterar la conclusión y cierra el caso en su lugar.",
    scope: "Análisis de casos · Informes",
  },
  {
    date: "2026-09-22",
    kind: "privacy",
    problem:
      "La política de cookies documentaba un uso de almacenamiento de sesión que el buscador había dejado de escribir, así que describía un almacenamiento que ya no existía.",
    resolution:
      "La política de cookies y la de privacidad afirman ahora lo que el código hace: no se usa ninguna tecnología de almacenamiento del navegador, y el estado del caso reside en el servidor.",
    scope: "Política de cookies · Política de privacidad",
  },
  {
    date: "2026-09-22",
    kind: "analysis",
    problem:
      "Elegir un problema ya conocido en el buscador volvía a enviarlo a interpretación por IA y terminaba en un cuestionario distinto del resto del sitio.",
    resolution:
      "El buscador envía un problema conocido directamente al análisis determinista y el texto libre al flujo de interpretación, que es el único que tiene reintento y salida alternativa cuando el proveedor falla.",
    scope: "Buscador · Cuestionario del caso",
  },
];

/** True when the log has at least one entry (the page should never fake one). */
export function hasCorrections(): boolean {
  return CORRECTIONS.length > 0;
}
