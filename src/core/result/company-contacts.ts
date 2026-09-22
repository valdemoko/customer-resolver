/**
 * Official customer-service channels of the companies people actually claim
 * against.
 *
 * Why this exists: a consumer report that says "reclama a la aerolínea" and
 * stops there sends the person to search Google, where the top results are
 * SEO pages with invented phone numbers. The report now names the company the
 * case is against and, when we have verified it, gives its official channels.
 *
 * Rules this file obeys:
 *  - Every entry carries the `sourceUrl` where the data was read (always the
 *    company's own site or its official help centre) and the `verifiedAt` date.
 *    Data we cannot attribute is not included.
 *  - Only channels the company itself publishes: no aggregators, no
 *    third-party "customer service" directories.
 *  - The report prints the verification date and links to the source, because
 *    companies change phone numbers and the person must be able to check it.
 *
 * PURE data + pure matching: no I/O, no clock.
 */

/** How the person reaches the company. */
export type CompanyChannelKind = "phone" | "web" | "form" | "email" | "chat" | "post";

export interface CompanyChannel {
  readonly kind: CompanyChannelKind;
  /** What this channel is for, in the person's terms. */
  readonly label: string;
  /** Phone number or address, when the channel has one. */
  readonly value?: string;
  /** Where it lives, when it is online. */
  readonly url?: string;
  /** Published opening hours, when known. */
  readonly hours?: string;
  /** Honest caveat about what this channel cannot do. */
  readonly note?: string;
}

export interface CompanyContactRecord {
  readonly id: string;
  /** Official trade name. */
  readonly name: string;
  /** Names people actually type, already normalised by `normalizeCompanyName`. */
  readonly aliases: readonly string[];
  /**
   * Names that must NOT match this record even though they contain an alias
   * (for example "iberia express" is a different airline than "iberia").
   */
  readonly notAliases?: readonly string[];
  readonly sector: string;
  readonly channels: readonly CompanyChannel[];
  /** Official page the channels were read from. */
  readonly sourceUrl: string;
  /** ISO date of the verification. */
  readonly verifiedAt: string;
  readonly note?: string;
}

const VERIFIED_AT = "2026-09-22";

export const COMPANY_CONTACTS: readonly CompanyContactRecord[] = [
  {
    id: "vueling",
    name: "Vueling",
    aliases: ["vueling", "vueling airlines"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "phone",
        label: "Atención al cliente en España",
        value: "900 645 000",
        hours: "Línea disponible 24 h; atención personalizada de 9:00 a 22:00 (hora española).",
      },
      {
        kind: "phone",
        label: "Segundo teléfono en España",
        value: "931 225 400",
        hours: "Mismo horario que la línea anterior.",
      },
      {
        kind: "web",
        label: "Reclamaciones y reembolsos",
        url: "https://help.vueling.com/hc/es/articles/19798807271441-Reclamaci%C3%B3n-y-reembolsos",
        note: "Desde su propio centro de ayuda puedes consultar el estado de un caso abierto o poner una queja.",
      },
    ],
    sourceUrl: "https://help.vueling.com/hc/es/articles/19916107516177-Contacto-Nuestros-tel%C3%A9fonos",
    verifiedAt: VERIFIED_AT,
    note: "Vueling gestiona compensaciones, reembolsos y quejas desde su centro de ayuda, no solo por teléfono.",
  },
  {
    id: "ryanair",
    name: "Ryanair",
    aliases: ["ryanair", "ryanair dac"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "phone",
        label: "Reservas y consultas generales",
        value: "+34 872 580 512",
        hours: "De lunes a viernes de 9:00 a 18:00; sábados y domingos de 10:00 a 17:00 (CET). Se cobra como llamada local.",
      },
      {
        kind: "phone",
        label: "Número alternativo",
        value: "+34 900 751 463",
        hours: "Mismo horario que la línea anterior.",
      },
      {
        kind: "form",
        label: "Enviar una consulta o reclamación",
        url: "https://www.ryanair.com/es/es/myryanair/feedback",
        note: "Es el canal que la aerolínea indica para reclamaciones escritas y deja constancia con referencia.",
      },
    ],
    sourceUrl: "https://help.ryanair.com/hc/es-es/articles/12893510195345-Ll%C3%A1manos-Espa%C3%B1a",
    verifiedAt: VERIFIED_AT,
    note: "Esos teléfonos son para reservas y consultas generales: para una reclamación escrita, la propia aerolínea remite a su formulario oficial.",
  },
  {
    id: "iberia",
    name: "Iberia",
    aliases: ["iberia", "iberia lae", "iberia linea aerea de espana"],
    notAliases: ["iberia express"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "phone",
        label: "Atención al cliente (teléfono gratuito)",
        value: "900 111 500",
      },
      {
        kind: "phone",
        label: "Atención al cliente (teléfono local)",
        value: "+34 91 333 67 01",
      },
      {
        kind: "web",
        label: "Atención al cliente en su web",
        url: "https://www.iberia.com/es/preguntas-frecuentes/atencion-clientes/",
        note: "Reclamaciones, quejas, justificantes, facturas y objetos perdidos.",
      },
      {
        kind: "web",
        label: "Vuelos retrasados o cancelados",
        url: "https://www.iberia.com/es/preguntas-frecuentes/vuelos-retrasados-o-cancelados/",
        note: "Indica cómo contactar con sus oficinas de atención cuando el vuelo se cancela o se retrasa.",
      },
    ],
    sourceUrl: "https://www.iberia.com/es/preguntas-frecuentes/atencion-clientes/",
    verifiedAt: VERIFIED_AT,
    note: "La web de Iberia bloquea la comprobación automática: los teléfonos anteriores se leyeron en el resultado indexado por Google de esa misma página oficial.",
  },
  {
    id: "air-europa",
    name: "Air Europa",
    aliases: ["air europa", "aireuropa", "air europa lineas aereas"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "phone",
        label: "Atención al cliente en España",
        value: "911 401 501",
        hours: "De 7:00 a 24:00, de lunes a domingo (solo desde España).",
      },
      {
        kind: "web",
        label: "Reclamaciones y seguimiento del expediente",
        url: "https://customerservice.aireuropa.com/",
        note: "Portal oficial de reclamaciones: permite abrir la reclamación y consultar su estado.",
      },
    ],
    sourceUrl: "https://blog.aireuropa.com/contactanos/",
    verifiedAt: VERIFIED_AT,
  },
  {
    id: "easyjet",
    name: "easyJet",
    aliases: ["easyjet", "easy jet", "easyjet airline"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "form",
        label: "Formulario de contacto",
        url: "https://www.easyjet.com/es/centro-de-ayuda/contacto/formulario-de-contacto",
      },
      {
        kind: "chat",
        label: "Chat y resto de canales",
        url: "https://www.easyjet.com/es/centro-de-ayuda/contacto/contacta-con-nosotros",
        hours: "Su servicio de atención al cliente abre de 8:00 a 20:00 todos los días.",
        note: "En su centro de ayuda no publica un teléfono de atención al cliente: el canal oficial es el formulario, el chat y el correo.",
      },
    ],
    sourceUrl: "https://www.easyjet.com/es/centro-de-ayuda/contacto/contacta-con-nosotros",
    verifiedAt: VERIFIED_AT,
  },
  {
    id: "volotea",
    name: "Volotea",
    aliases: ["volotea", "volotea airlines"],
    sector: "Aerolínea",
    channels: [
      {
        kind: "web",
        label: "Centro de Atención al Cliente",
        url: "https://www.volotea.com/es/contacto/",
        note: "Desde su página de contacto se accede al Centro de Atención al Cliente (teléfono y formulario según el motivo).",
      },
    ],
    sourceUrl: "https://www.volotea.com/es/contacto/",
    verifiedAt: VERIFIED_AT,
    note: "Volotea publica el teléfono dentro de su Centro de Atención al Cliente; no lo reproducimos porque cambia según el asunto.",
  },
];

// ── Matching ────────────────────────────────────────────────────────

/** Legal forms and filler words that never decide which company it is. */
const LEGAL_FORM_TOKENS = new Set([
  "sa",
  "sau",
  "sl",
  "slu",
  "sas",
  "srl",
  "gmbh",
  "plc",
  "ltd",
  "inc",
  "nv",
  "bv",
  "ag",
  "dac",
  "airlines",
  "lineas",
  "aereas",
  "sociedad",
  "anonima",
  "limitada",
  "españa",
  "espana",
  "group",
  "grupo",
]);

/**
 * Normalise a company name for comparison: case-insensitive, accent-free,
 * without legal forms or punctuation.
 */
export function normalizeCompanyName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    // Single letters come from dotted legal forms ("S.A." → "s", "a"): they
    // carry no identity, so dropping them keeps the same matcher working for
    // "Vueling Airlines, S.A." and "Vueling".
    .filter((token) => token.length > 1 && !LEGAL_FORM_TOKENS.has(token))
    .join(" ")
    .trim();
}

function mentions(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeCompanyName(needle);
  if (normalizedNeedle.length === 0) return false;
  return ` ${haystack} `.includes(` ${normalizedNeedle} `);
}

/**
 * The verified record for a company name, or null when we have none.
 *
 * Matching is word-based and prefers the longest alias, so "iberia express"
 * never resolves to Iberia (a record can also veto an alias explicitly), and
 * an unrecognised company simply returns null instead of a wrong contact.
 */
export function findCompanyContact(
  rawName: string | null | undefined,
): CompanyContactRecord | null {
  if (typeof rawName !== "string") return null;
  const candidate = normalizeCompanyName(rawName);
  if (candidate.length < 3) return null;

  let best: { record: CompanyContactRecord; length: number } | null = null;

  for (const record of COMPANY_CONTACTS) {
    for (const alias of record.aliases) {
      const normalizedAlias = normalizeCompanyName(alias);
      if (normalizedAlias.length < 3) continue;
      if (!mentions(candidate, normalizedAlias)) continue;
      if (record.notAliases?.some((veto) => mentions(candidate, veto))) continue;
      if (!best || normalizedAlias.length > best.length) {
        best = { record, length: normalizedAlias.length };
      }
    }
  }

  return best?.record ?? null;
}

/**
 * How to reach the company when we have no verified record for it.
 *
 * Generic on purpose: it teaches where the official channel lives and how to
 * leave a trace, instead of guessing a phone number.
 */
export const COMPANY_CONTACT_GUIDANCE: readonly string[] = [
  "Busca en tu factura, contrato o correo de compra el nombre exacto de la empresa: los datos de su atención al cliente suelen aparecer en ese mismo documento.",
  "En su web, el apartado «Atención al cliente», «Contacto», «Ayuda» o el pie de página es donde publica el teléfono, el chat y el correo oficial.",
  "Reclama siempre por un canal que deje rastro (formulario, correo o su propia app) y guarda la referencia o el número de incidencia que te den.",
  "Si reclamas por teléfono, apunta el día, la hora y con quién hablaste, y pide el número de expediente antes de colgar.",
  "Si no responden en el plazo que ellos mismos indiquen (o en un mes), escala a los organismos oficiales que aparecen en «Dónde reclamar».",
];
