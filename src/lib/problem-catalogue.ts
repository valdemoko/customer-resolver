/**
 * Problem Catalogue — single source of truth for public surface.
 *
 * Consumed by: homepage, SearchBar, /problemas, /problemas/[slug],
 * sitemap, and tests.
 *
 * Each entry maps a problem module to its public-facing representation.
 * The slug is the URL-safe identifier used in /problemas/[slug].
 */

export interface ProblemCatalogueEntry {
  /** Unique problem key (matches module key) */
  readonly key: string;
  /** URL slug for public pages */
  readonly slug: string;
  /** Public display title */
  readonly title: string;
  /** Short description for cards and metadata */
  readonly description: string;
  /** Category for grouping */
  readonly category: string;
  /** Whether a deterministic resolver exists */
  readonly available: boolean;
  /** Keywords for local search (SearchBar) */
  readonly keywords: readonly string[];
  /** Legal basis (abbreviated) */
  readonly legalBasis: readonly string[];
  /** What information the module needs (for landing pages) */
  readonly whatWeAnalyze: readonly string[];
  /** What the result includes */
  readonly whatYouGet: readonly string[];
  /** What the module cannot determine */
  readonly limitations: readonly string[];
  /** "Saber más" detailed information */
  readonly saberMas: {
    /** Key facts that matter for this problem */
    readonly keyFacts: readonly string[];
    /** Important dates to preserve */
    readonly importantDates: readonly string[];
    /** Useful evidence types */
    readonly evidenceTypes: readonly string[];
    /** Common mistakes users make */
    readonly commonMistakes: readonly string[];
    /** What Resolveo verifies */
    readonly whatWeVerify: readonly string[];
    /** What cannot be determined */
    readonly whatCannotBeDetermined: readonly string[];
  };
}

export const PROBLEM_CATALOGUE: readonly ProblemCatalogueEntry[] = [
  {
    key: "cancellation-charge",
    slug: "cancelacion-cargo-posterior",
    title: "Cancelación y cargo posterior",
    description:
      "Cancelaste un servicio y te han cobrado después. Analizamos las fechas, el contrato y la normativa aplicable.",
    category: "Pagos y facturas",
    available: true,
    keywords: [
      "cancelar",
      "cancelación",
      "cobrado",
      "cargo",
      "factura",
      "servicio",
      "telecomunicaciones",
      "suscripción",
      "permanencia",
      "internet",
      "móvil",
      "telefonía",
      "contrato",
    ],
    legalBasis: [
      "TRLGDCU Art. 97 — Información precontractual",
      "TRLGDCU Art. 109 — Ejecución del contrato a distancia",
      "CC Art. 1124 — Resolución por incumplimiento",
    ],
    whatWeAnalyze: [
      "Fecha de cancelación del servicio",
      "Fecha y cuantía del cargo recibido",
      "Existencia de compromiso de permanencia",
      "Confirmación de la cancelación",
    ],
    whatYouGet: [
      "Evaluación de si el cargo es conforme a derecho",
      "Reglas aplicables con trazabilidad a fuentes",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "No resuelve litigios judiciales",
      "Se basa en la información que proporcionas",
    ],
    saberMas: {
      keyFacts: [
        "Fecha exacta en que solicitaste la cancelación (no la fecha efectiva)",
        "Fecha y cuantía del cargo recibido después de la cancelación", 
        "Si existía compromiso de permanencia en el contrato",
        "Si dispones de confirmación escrita de la cancelación",
      ],
      importantDates: [
        "Fecha de solicitud de cancelación — marca el inicio del plazo",
        "Fecha del cargo posterior — determina si está dentro del plazo de reclamación",
        "Fecha de inicio del contrato — relevante para compromisos de permanencia",
      ],
      evidenceTypes: [
        "Confirmación de cancelación (email, SMS, documento)",
        "Contrato o condiciones del servicio",
        "Factura o extracto con el cargo", 
        "Comunicaciones con el proveedor",
      ],
      commonMistakes: [
        "Confundir la fecha de solicitud de cancelación con la fecha de efectividad",
        "No conservar la confirmación de cancelación",
        "No revisar si el contrato tenía compromiso de permanencia",
        "Presentar reclamación sin documentar primero el cargo",
      ],
      whatWeVerify: [
        "Si el cargo es conforme a la normativa vigente",
        "Si existía compromiso de permanencia y si era legal",
        "Si la cancelación fue correctamente notificada",
        "Si el plazo de reclamación sigue abierto",
      ],
      whatCannotBeDetermined: [
        "Si el proveedor aceptará la reclamación sin recurso",
        "Si hay cláusulas específicas en tu contrato que puedan afectar",
        "Si existen reclamaciones previas del mismo tipo",
      ],
    },
  },
  {
    key: "no-delivery-refund",
    slug: "pedido-no-llega",
    title: "Pedido no llega o no se reembolsa",
    description:
      "Realizaste un pedido que no llegó o no se entregó correctamente y necesitas saber qué puedes hacer.",
    category: "Compras",
    available: true,
    keywords: [
      "pedido",
      "compra",
      "reembolso",
      "devolución",
      "dinero",
      "vendedor",
      "tienda",
      "envío",
      "entrega",
      "llegar",
    ],
    legalBasis: [
      "TRLGDCU Art. 66 bis — Entrega de bienes y plazos",
      "TRLGDCU Art. 109 — Ejecución del contrato a distancia",
      "CC Art. 1124 — Resolución por incumplimiento recíproco",
    ],
    whatWeAnalyze: [
      "Fecha de compra y fecha prometida de entrega",
      "Si el producto fue finalmente entregado",
      "Comunicaciones con el vendedor",
      "Plazos adicionales concedidos",
      "Declaración de resolución del contrato",
    ],
    whatYouGet: [
      "Evaluación de plazos de entrega conforme a normativa",
      "Determinación de si procede la resolución",
      "Obligación de reembolso del vendedor",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "No puede ejecutar resoluciones judiciales",
      "Requiere información veraz del consumidor",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de compra del producto",
        "Fecha de entrega efectiva (no la de compra)",
        "Si has comunicado la falta de conformidad al vendedor",
        "Si el vendedor ha respondido y cómo",
      ],
      importantDates: [
        "Fecha de compra — inicio del plazo de garantía legal",
        "Fecha de entrega — plazo de 2 años para reclamar (Art. 121 TRLGDCU)",
        "Fecha de comunicación al vendedor — marca el plazo de 3 meses para reclamar",
      ],
      evidenceTypes: [
        "Factura o ticket de compra",
        "Comprobante de entrega (tracking, albarán)",
        "Comunicaciones con el vendedor",
        "Informe técnico si lo tienes",
      ],
      commonMistakes: [
        "No distinguir entre garantía legal y garantía comercial",
        "Reclamar después de 3 meses desde la comunicación",
        "No conservar el comprobante de compra",
        "Aceptar el rechazo sin verificar la normativa",
      ],
      whatWeVerify: [
        "Si estás dentro del plazo de garantía legal",
        "Si el rechazo del vendedor es conforme a la normativa",
        "Si procede la resolución, reparación o sustitución",
        "Si tienes derecho a reducción del precio",
      ],
      whatCannotBeDetermined: [
        "Si el defecto es imputable al fabricante o al usuario",
        "Si existe una causa de exclusión de la garantía",
        "Si el vendedor puede demostrar que el defecto no existía",
      ],
    },
  },
  {
    key: "warranty-rejection",
    slug: "garantia-rechazada",
    title: "Garantía rechazada",
    description:
      "El vendedor ha rechazado tu solicitud relacionada con una falta de conformidad. Analizamos plazos, respuestas y vías de actuación.",
    category: "Compras",
    available: true,
    keywords: [
      "garantía",
      "rechazado",
      "reparación",
      "producto",
      "defectuoso",
      "sustitución",
      "técnico",
      "conformidad",
      "devolver",
      "reembolso",
    ],
    legalBasis: [
      "TRLGDCU Arts. 114-125 — Conformidad de bienes",
      "TRLGDCU Art. 121 — Carga de la prueba (2 años)",
      "TRLGDCU Art. 118 — Puesta en conformidad",
      "TRLGDCU Art. 119 — Reducción del precio y resolución",
    ],
    whatWeAnalyze: [
      "Descripción de la falta de conformidad",
      "Respuesta del vendedor al reclamación",
      "Plazos desde la compra y desde la entrega",
      "Historial de reparaciones",
      "Alegaciones del vendedor (desgaste, uso indebido, plazo)",
      "Garantía comercial si existe",
    ],
    whatYouGet: [
      "Evaluación de si el rechazo es conforme a normativa",
      "Plazos de responsabilidad y presunción",
      "Vías de actuación disponibles",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "La evaluación depende de la información proporcionada",
      "No determina valoración pericial de defectos",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de compra del producto",
        "Fecha de entrega efectiva",
        "Descripción del defecto de conformidad",
        "Respuesta del vendedor a tu reclamación",
      ],
      importantDates: [
        "Fecha de compra — inicio del plazo de 2 años (Art. 121 TRLGDCU)",
        "Fecha de entrega — plazo para manifestar la falta de conformidad",
        "Fecha de comunicación al vendedor — plazo de 3 meses para reclamar",
      ],
      evidenceTypes: [
        "Factura o ticket de compra",
        "Comprobante de entrega",
        "Comunicaciones con el vendedor",
        "Informe técnico o pericial si existe",
      ],
      commonMistakes: [
        "No distinguir entre garantía legal y garantía comercial",
        "Reclamar fuera del plazo de 3 meses desde la primera comunicación",
        "No conservar el comprobante de compra",
        "Aceptar el rechazo sin verificar si el vendedor cumple la normativa",
      ],
      whatWeVerify: [
        "Si estás dentro del plazo de garantía legal",
        "Si el rechazo del vendedor es conforme a la normativa",
        "Si procede la resolución, reparación o sustitución",
        "Si tienes derecho a reducción del precio",
      ],
      whatCannotBeDetermined: [
        "Si el defecto es imputable al fabricante o al usuario",
        "Si existe una causa de exclusión de la garantía",
        "Si el vendedor puede demostrar que el defecto no existía en el momento de la entrega",
      ],
    },
  },
  {
    key: "flight-cancel",
    slug: "vuelo-cancelado",
    title: "Vuelo cancelado por la aerolínea",
    description:
      "La aerolínea canceló tu vuelo. Analizamos plazos de aviso, distancia, transporte alternativo y derecho a compensación.",
    category: "Transporte",
    available: true,
    keywords: [
      "vuelo",
      "cancelado",
      "aerolínea",
      "compensación",
      "retraso",
      "billete",
      "avión",
      "aeropuerto",
      "alternativo",
      "reembolso",
    ],
    legalBasis: [
      "Reglamento (CE) 261/2004 — Derechos de pasajeros aéreos",
      "Art. 5 — Cancelación y excepciones",
      "Art. 7 — Compensación (250/400/600 EUR)",
      "Art. 8 — Reembolso y transporte alternativo",
      "Art. 9 — Derecho a asistencia",
    ],
    whatWeAnalyze: [
      "Aeropuertos de salida y llegada (distancia)",
      "Fecha de cancelación y plazo de aviso",
      "Oferta de transporte alternativo y su conformidad",
      "Circunstancias alegadas por la aerolínea",
      "Gastos adicionales incurridos",
      "Estado de reclamación y reembolso",
    ],
    whatYouGet: [
      "Compensación base según distancia (250/400/600 EUR)",
      "Exención por transporte alternativo conforme",
      "Reducción del 50% cuando corresponde (Art. 7.2)",
      "Derecho a reembolso y asistencia",
      "Acciones recomendadas concretas",
    ],
    limitations: [
      "No sustituye asesoría legal profesional",
      "La distancia se calcula entre aeropuertos (no conexión)",
      "No cubre viajes combinados",
      "Circunstancias extraordinarias requieren verificación del transportista",
    ],
    saberMas: {
      keyFacts: [
        "Fecha de cancelación del vuelo",
        "Plazo de aviso de la aerolínea",
        "Aeropuertos de salida y llegada (distancia)",
        "Si te ofrecieron transporte alternativo",
      ],
      importantDates: [
        "Fecha de cancelación — determina si estás dentro del plazo de reclamación",
        "Fecha del vuelo original — referencia para cálculo de compensación",
        "Fecha de notificación — plazo de 2 años para reclamar (Reglamento 261/2004)",
      ],
      evidenceTypes: [
        "Confirmación de reserva",
        "Comunicación de cancelación de la aerolínea",
        "Billete de vuelo alternativo si lo tomaste",
        "Gastos adicionales (hotel, transporte, comidas)",
      ],
      commonMistakes: [
        "No conservar la confirmación de cancelación",
        "Aceptar transporte alternativo sin verificar si cumple condiciones",
        "No registrar gastos adicionales incurridos",
        "Reclamar fuera del plazo de 2 años",
      ],
      whatWeVerify: [
        "Si la cancelación cumple condiciones del Art. 5 del Reglamento 261/2004",
        "Si procede compensación de 250/400/600 EUR",
        "Si la aerolínea tiene derecho a exención",
        "Si te corresponde transporte alternativo o reembolso",
      ],
      whatCannotBeDetermined: [
        "Si las circunstancias extraordinarias alegadas son ciertas",
        "Si la aerolínea cumple con la asistencia durante la espera",
        "Si existen acuerdos específicos con la aerolínea",
      ],
    },
  },
] as const;

/** Get a problem by its slug */
export function getProblemBySlug(
  slug: string,
): ProblemCatalogueEntry | undefined {
  return PROBLEM_CATALOGUE.find((p) => p.slug === slug);
}

/** Get a problem by its module key */
export function getProblemByKey(
  key: string,
): ProblemCatalogueEntry | undefined {
  return PROBLEM_CATALOGUE.find((p) => p.key === key);
}

/** Get only available problems */
export function getAvailableProblems(): readonly ProblemCatalogueEntry[] {
  return PROBLEM_CATALOGUE.filter((p) => p.available);
}

/** Search problems by query (local, for SearchBar) */
export function searchProblems(query: string): readonly ProblemCatalogueEntry[] {
  if (!query.trim()) return [];
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scored = PROBLEM_CATALOGUE.map((problem) => {
    let score = 0;
    const titleLower = problem.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const categoryLower = problem.category
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
      if (categoryLower.includes(term)) score += 5;
      for (const kw of problem.keywords) {
        const kwNorm = kw
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (kwNorm === term) score += 8;
        else if (kwNorm.includes(term) || term.includes(kwNorm)) score += 4;
      }
    }
    return { problem, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.problem);
}
