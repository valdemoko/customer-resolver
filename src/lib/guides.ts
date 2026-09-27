/**
 * Guides catalogue — single source of truth for the /guias cluster.
 *
 * These are explanatory guides about the *process* around a consumer problem
 * (how to claim, how to withdraw, what a delay entitles you to), as opposed to
 * the per-problem analysis modules in `problem-catalogue.ts`, which produce a
 * case-specific report.
 *
 * Consumed by: /guias, /guias/[slug], each problem page (reverse cross-links),
 * the sitemap and the tests. A guide only exists when it answers an intent the
 * problem pages do not already cover; `relatedSlugs` records where a reader of
 * that guide should continue, so both directions of the link are data-driven.
 */

export interface GuideEntry {
  /** URL slug used in /guias/[slug]. */
  readonly slug: string;
  /** Editorial H1. */
  readonly title: string;
  /** <title> text. The layout template appends " · Resolveo". */
  readonly metaTitle: string;
  /** Meta description and card summary. */
  readonly description: string;
  /** One-paragraph abstract shown on the index and in listings. */
  readonly lead: string;
  /** ISO date on which the guide was last reviewed. */
  readonly updatedAt: string;
  /** Problem slugs this guide sends the reader to, and that link back here. */
  readonly relatedSlugs: readonly string[];
  /** Questions the guide answers, rendered as an FAQ block. */
  readonly faq: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
}

export const GUIDES: readonly GuideEntry[] = [
  {
    slug: "como-reclamar",
    title: "Cómo reclamar una incidencia de consumo",
    metaTitle: "Cómo reclamar a una empresa: canales, hojas y pasos",
    description:
      "Qué es una hoja de reclamaciones, ante quién se presenta una reclamación de consumo y qué papel tienen la OMIC, las juntas arbitrales, AESA o SETELECO.",
    lead: "Reclamar es una secuencia, no un trámite único: primero la empresa, después el canal de consumo que corresponde. Esta guía ordena los pasos y explica qué hace cada organismo para que no pierdas tiempo llamando a la puerta equivocada.",
    updatedAt: "2026-09-27",
    relatedSlugs: [
      "cancelacion-cargo-posterior",
      "pedido-no-llega",
      "garantia-rechazada",
      "vuelo-cancelado",
    ],
    faq: [
      {
        question: "¿Cuánto cuesta reclamar?",
        answer:
          "Los servicios públicos de consumo (oficinas municipales y servicios de las comunidades autónomas) y las juntas arbitrales de consumo son gratuitos. Los organismos sectoriales como AESA o la Oficina de Atención al Usuario de Telecomunicaciones también lo son. La vía judicial es la única que puede generar costes.",
      },
      {
        question: "¿Sirve de algo reclamar a la empresa antes de ir al organismo?",
        answer:
          "Sí. La mayoría de reclamaciones piden acreditar que ya te has dirigido al empresario. Además, la fecha de esa primera reclamación es la prueba de que actuaste a tiempo, algo que importa si después hay que discutir plazos.",
      },
      {
        question: "¿Tengo que usar la hoja de reclamaciones?",
        answer:
          "La hoja de reclamaciones es una vía oficial y gratuita, y en establecimientos abiertos al público de España es obligatorio tenerla a disposición del cliente. No es la única forma de reclamar: una reclamación por escrito por el canal oficial de la empresa también vale y deja rastro.",
      },
    ],
  },
  {
    slug: "devolver-compra-online",
    title: "Devolver una compra online: el derecho de desistimiento",
    metaTitle: "Devolución de compras online: 14 días de desistimiento",
    description:
      "Cuándo tienes 14 días para devolver una compra online sin dar explicaciones, quién asume los gastos de devolución y qué productos quedan fuera.",
    lead: "Devolver algo que sí llegó correctamente y no te convence es distinto de reclamar un producto defectuoso o un pedido que no llega. Ese «me he arrepentido» tiene su propia norma —el derecho de desistimiento— con un plazo, unas excepciones y unas reglas sobre quién paga el envío de vuelta.",
    updatedAt: "2026-09-27",
    relatedSlugs: ["pedido-no-llega", "garantia-rechazada"],
    faq: [
      {
        question: "¿La tienda puede quedarse con los gastos de envío originales?",
        answer:
          "Puede retener del reembolso el coste del envío estándar de ida, pero no más: los envíos adicionales que tú hayas elegido no se reembolsan, y tampoco puede quedarse con el importe del producto.",
      },
      {
        question: "¿Puedo devolver un producto que ya he abierto?",
        answer:
          "Puedes desistir de un bien aunque lo hayas manipulado para comprobar su naturaleza, características o funcionamiento, pero respondes de la pérdida de valor que resulte de una manipulación distinta de la necesaria para comprobarlo. Hay excepciones cerradas: por ejemplo, productos de higiene precintados que ya has abierto o grabaciones y programas informáticos precintados que has desprecintado.",
      },
      {
        question: "Compré en una tienda física, ¿tengo estos 14 días?",
        answer:
          "No. El derecho de desistimiento se aplica a contratos a distancia y a contratos celebrados fuera del establecimiento. En una compra presencial no existe ese derecho: dependen de la política comercial de la tienda, que es voluntaria.",
      },
    ],
  },
  {
    slug: "retraso-de-vuelo",
    title: "Vuelo retrasado: derechos del pasajero",
    metaTitle: "Vuelo retrasado: compensación y derechos del pasajero",
    description:
      "Retraso de vuelo: cuándo tienes derecho a asistencia, al reembolso del billete y a la compensación de 250, 400 o 600 euros.",
    lead: "Un retraso no es una cancelación, pero comparte muchas de sus consecuencias. Lo que cambia son los umbrales: el derecho a asistencia depende de la duración del retraso y del tramo de distancia, y a partir de tres horas de retraso en el destino final entra en juego la compensación.",
    updatedAt: "2026-09-27",
    relatedSlugs: ["vuelo-cancelado"],
    faq: [
      {
        question: "Me avisaron con antelación y por eso voy con retraso, ¿da igual?",
        answer:
          "En las cancelaciones, el aviso con antelación puede excluir la compensación. En los retrasos, la compensación de tres horas o más en el destino final no desaparece por haber sido avisado: lo que puede exonerar es que la causa sea una circunstancia extraordinaria que el transportista no pudiera evitar, y quien debe acreditarlo es la aerolínea.",
      },
      {
        question: "¿Cuenta el retraso de la escala?",
        answer:
          "Lo que cuenta es la llegada al destino final del contrato. Una escala no rompe el cálculo: si el retraso acumulado en el destino final alcanza las tres horas, el supuesto de compensación puede aplicarse aunque el primer tramo llegara a tiempo.",
      },
      {
        question: "Perdí una reserva de hotel por el retraso, ¿lo cubre la compensación?",
        answer:
          "La compensación del Reglamento es una cantidad fija por el tiempo perdido, no un resarcimiento de daños. Los gastos que podrías reclamar por separado son los de asistencia que la aerolínea debía cubrir y no cubrió (comidas, alojamiento, transporte). Otras pérdidas siguen la vía civil y quedan fuera de este análisis.",
      },
    ],
  },
] as const;

/** Get a guide by its slug. */
export function getGuideBySlug(slug: string): GuideEntry | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/**
 * Guides that reference a given problem slug. Used by the problem pages to add
 * a contextual "sigue leyendo" block without hand-maintaining two lists.
 */
export function getGuidesForProblem(problemSlug: string): readonly GuideEntry[] {
  return GUIDES.filter((guide) => guide.relatedSlugs.includes(problemSlug));
}
