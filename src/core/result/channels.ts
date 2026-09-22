/**
 * Official escalation channels shown in the case report.
 *
 * A rule evaluation says WHAT applies to your case; this list says WHERE you can
 * actually take it. Everything here links an official .gob.es page maintained by
 * the competent body.
 *
 * Deliberately NO phone numbers or mailboxes: those change, they differ per
 * municipality and per company, and inventing a contact in a consumer report
 * would be worse than showing none — so each channel points at the official
 * page where the current contact details live.
 *
 * Pure data: no I/O, no clock. Selecting channels by problem key is
 * deterministic (same problem → same channels).
 */

export interface ConsumerChannel {
  /** Stable identifier (used as React key / export marker). */
  readonly id: string;
  /** Who to contact, by their official name. */
  readonly target: string;
  /** What kind of channel it is (form, office, arbitration…). */
  readonly channel: string;
  /** When it applies — in plain language, no legal conclusions. */
  readonly why: string;
  /** Official URL. */
  readonly url: string;
}

/**
 * Channels that apply to any consumer case in Spain.
 * Verified against the official portals of the Ministries involved.
 */
const GENERAL_CHANNELS: readonly ConsumerChannel[] = [
  {
    id: "ministerio-reclamar-conflicto",
    target: "Ministerio de Derechos Sociales, Consumo y Agenda 2030",
    channel: "Guía oficial «Cómo reclamar»",
    why: "Ordena los pasos: reclamar por escrito a la empresa, reclamar a la autoridad de consumo y solicitar arbitraje.",
    url: "https://www.dsca.gob.es/es/consumo/como-reclamar-conflicto-consumo",
  },
  {
    id: "omic-junta-arbitral",
    target: "OMIC y Sistema Arbitral de Consumo",
    channel: "Oficina Municipal de Información al Consumidor y Junta Arbitral",
    why: "Reclamación gratuita ante tu municipio; si la empresa está adherida, la Junta Arbitral resuelve sin juicio.",
    url: "https://justoparaeso.consumo.gob.es/",
  },
  {
    id: "sede-consumo",
    target: "Sede Electrónica de Consumo",
    channel: "Trámites telemáticos del Ministerio de Consumo",
    why: "Presentar la reclamación con registro oficial y seguir su estado.",
    url: "https://consumo.sede.gob.es/",
  },
  {
    id: "centro-europeo-consumidor",
    target: "Centro Europeo del Consumidor en España",
    channel: "Asistencia para compras transfronterizas",
    why: "Cuando la empresa está en otro país de la UE/EEE: compras online fuera de España.",
    url: "https://portal-cec.consumo.gob.es/es",
  },
];

/** Extra channels for specific problem modules (by problem key). */
const MODULE_CHANNELS: Readonly<Record<string, readonly ConsumerChannel[]>> = {
  "flight-cancel": [
    {
      id: "aesa-pasajeros",
      target: "Agencia Española de Seguridad Aérea (AESA)",
      channel: "Reclamación por cancelación, retraso o denegación de embarque",
      why: "Autoridad competente para las compensaciones del Reglamento (CE) 261/2004.",
      url: "https://www.seguridadaerea.gob.es/es/ambitos/derechos-de-los-pasajeros/inicia-tu-reclamacion-con-aesa",
    },
    {
      id: "cec-transporte-aereo",
      target: "Centro Europeo del Consumidor — transporte aéreo",
      channel: "Reclamación internacional de pasajeros",
      why: "Vuelos con aerolínea de otro país de la UE/EEE o extrahub.",
      url: "https://portal-cec.consumo.gob.es/es",
    },
  ],
  "cancellation-charge": [
    {
      id: "oficina-atencion-usuario",
      target: "Oficina de Atención al Usuario de las Comunicaciones",
      channel: "Reclamación por telefonía, internet o televisión",
      why: "Reclamación ante el regulador si el proveedor de telecomunicaciones no responde.",
      url: "https://usuariosteleco.digital.gob.es/reclamaciones",
    },
  ],
};

/**
 * Channels to show for a problem key.
 *
 * Unknown module (or `unknown`): the general list still applies — a consumer
 * problem always has a competent body, even when our rules cannot analyse it.
 */
export function channelsForProblem(
  problemKey: string | null | undefined,
): readonly ConsumerChannel[] {
  const extra = problemKey ? (MODULE_CHANNELS[problemKey] ?? []) : [];
  return [...extra, ...GENERAL_CHANNELS];
}
