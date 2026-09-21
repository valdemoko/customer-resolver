/**
 * Problem Module: flight-cancel (Fase 8.4).
 *
 * "Me han cancelado un vuelo. ¿Tengo derecho a compensación?"
 *
 * Legal basis (VERIFIED):
 * - Reglamento (CE) 261/2004 — Derechos de los pasajeros aéreos
 *   Arts. 5, 7, 8, 9, 14
 * - TRLGDCU Art. 165 — Transporte aéreo de pasajeros
 * - Ley 21/2000, de 6 de diciembre — Derechos de los pasajeros aéreos
 *   (transposición parcial, derogada en lo contradictorio por el Reglamento)
 *
 * EU261/2004 is DIRECTLY APPLICABLE in Spain (and all EU member states).
 * It creates non-waivable rights for air passengers.
 *
 * Key distinction from existing modules:
 * - cancellation-charge: consumer cancelled → was charged
 * - flight-cancel: AIRLINE cancelled → what are passenger's rights?
 *
 * The resolution logic is completely different: fixed statutory compensation
 * amounts, strict notice periods, and tiered distance-based rights.
 */
import { defineProblemModule, type ProblemModuleDefinition } from "@core/problems/contract";

export const MODULE_KEY = "flight-cancel";
export const MODULE_VERSION = 2;

export const flightCancelModule: ProblemModuleDefinition = defineProblemModule({
  key: MODULE_KEY,
  version: MODULE_VERSION,
  title: "Vuelo cancelado",
  description:
    "El vuelo ha sido cancelado por la aerolínea. Analizamos plazos de aviso, " +
    "distancia, ofertas de transporte alternativo y obligaciones de asistencia. " +
    "El análisis es factual: fechas, horas, distancias y comunicaciones. " +
    "Las conclusiones jurídicas finales pertenecen al Result Engine.",
  jurisdictions: ["ES"],
  locales: ["es-ES"],

  // ── Fact catalogue ──────────────────────────────────────────────
  factCatalogue: [
    // ── Required facts ────────────────────────────────────────────
    {
      key: "flight.departure_airport",
      type: "string",
      description: "Código IATA del aeropuerto de salida (ej: MAD, BCN, VLC).",
      questionId: "q-departure",
      required: true,
    },
    {
      key: "flight.arrival_airport",
      type: "string",
      description: "Código IATA del aeropuerto de llegada (ej: CDG, FCO, NRT).",
      questionId: "q-arrival",
      required: true,
    },
    {
      key: "flight.scheduled_date",
      type: "date",
      description: "Fecha programada del vuelo.",
      questionId: "q-scheduled-date",
      required: true,
    },
    {
      key: "cancellation.date",
      type: "date",
      description: "Fecha en que la aerolínea comunicó la cancelación al pasajero.",
      questionId: "q-cancellation-date",
      required: true,
    },
    {
      key: "cancellation.notice_days",
      type: "number",
      description:
        "Número de días de antelación con que la aerolínea informó de la cancelación " +
        "respecto a la fecha de salida. Se calcula automáticamente: " +
        "scheduled_date - cancellation.date. Relevante para Art. 5.1(c). " +
        "Puede ser negativo si la cancelación se comunicó después de la fecha de salida.",
      questionId: "q-notice-days",
      required: false,
    },
    {
      key: "airline.reimbursement_offered",
      type: "boolean",
      description: "¿La aerolínea ofreció reembolso del billete (Art. 8.1.a)?",
      questionId: "q-reimbursement",
      required: true,
    },
    {
      key: "airline.re_routing_offered",
      type: "boolean",
      description: "¿La aerolínea ofreció transporte alternativo (Art. 8.1.b)?",
      questionId: "q-re-routing",
      required: true,
    },
    {
      key: "airline.assistance_offered",
      type: "boolean",
      description:
        "¿La aerolínea ofreció asistencia (Art. 9): llamadas, comidas, alojamiento si aplica?",
      questionId: "q-assistance",
      required: true,
    },

    // ── Optional facts — Compensation ─────────────────────────────
    {
      key: "passenger.claimed_compensation",
      type: "boolean",
      description: "¿El pasajero ha reclamado formalmente la compensación a la aerolínea?",
      questionId: "q-claimed",
      required: false,
    },
    {
      key: "passenger.compensation_received",
      type: "boolean",
      description: "¿El pasajero ha recibido la compensación económica?",
      questionId: "q-received-compensation",
      required: false,
    },
    {
      key: "passenger.reimbursed",
      type: "boolean",
      description: "¿El pasajero ha recibido el reembolso del billete?",
      questionId: "q-reimbursed",
      required: false,
    },

    // ── Optional facts — Re-routing details ───────────────────────
    {
      key: "airline.re_routing.accepted",
      type: "boolean",
      description: "¿El pasajero aceptó el transporte alternativo ofrecido?",
      questionId: "q-accepted-re-routing",
      required: false,
    },
    {
      key: "airline.re_routing.departure_delay_hours",
      type: "number",
      description: "Horas de retraso respecto al horario original del vuelo alternativo.",
      questionId: "q-re-routing-delay",
      required: false,
    },

    // ── Optional facts — Alternative transport compliance (Art. 5(1)(c)) ──
    {
      key: "airline.alternative_transport_compliant",
      type: "boolean",
      description:
        "¿El transporte alternativo ofrecido cumple los umbrales del Art. 5.1.c " +
        "(salida no más de 1-2h antes y llegada dentro de 2-4h después según plazo de aviso)? " +
        "Determina si la aerolínea está exenta de compensación. " +
        "Solo aplica cuando se ofreció transporte alternativo.",
      questionId: "q-alt-transport-compliant",
      required: false,
    },

    // ── Optional facts — Alternative transport arrival delay (Art. 7(2)) ──
    {
      key: "airline.alternative_arrival_delay_hours",
      type: "number",
      description:
        "Horas de retraso en la llegada del vuelo alternativo respecto a la hora de llegada " +
        "original programada. Utilizado para Art. 7.2: reducción del 50% de la compensación " +
        "cuando el transporte alternativo llega dentro de ciertos umbrales por distancia. " +
        "Umbrales Art. 7.2: ≤2h (≤1500km), ≤3h (1500-3500km), ≤4h (>3500km).",
      questionId: "q-alt-arrival-delay",
      required: false,
    },

    // ── Optional facts — Art. 7(2) reduction eligibility ──────────
    {
      key: "passenger.compensation_reduction_eligible",
      type: "boolean",
      description:
        "¿El pasajero es elegible para la reducción del 50% de la compensación " +
        "según Art. 7.2 del Reglamento 261/2004? Se determina cuando: " +
        "(1) se aceptó transporte alternativo, " +
        "(2) la llegada del alternativo está dentro de los umbrales Art. 7.2, " +
        "y (3) NO concurre la exención completa del Art. 5.1.c. " +
        "Tipo derivado: se establece a partir del resultado de las reglas.",
      questionId: "q-reduction-eligible",
      required: false,
    },

    // ── Optional facts — Cancellation reason ──────────────────────
    {
      key: "airline.cancellation_reason",
      type: "string",
      description: "Motivo comunicado por la aerolínea para la cancelación (texto libre).",
      questionId: "q-reason",
      required: false,
    },
    {
      key: "airline.reason_is_extraordinary",
      type: "boolean",
      description:
        "¿La aerolínea alega circunstancias extraordinarias (Art. 5.3)? " +
        "Ej: condiciones meteorológicas, seguridad, huelga controladores.",
      questionId: "q-extraordinary",
      required: false,
    },

    // ── Optional facts — Additional costs ─────────────────────────
    {
      key: "passenger.additional_costs",
      type: "money",
      description:
        "Costes adicionales generados por la cancelación (alojamiento, comidas, transporte alternativo propio). " +
        "Base legal: Art. 8.3 cuando la aerolínea no proporciona alojamiento o transporte.",
      questionId: "q-additional-costs",
      required: false,
    },

    // ── Optional facts — Compensation amount ──────────────────────
    {
      key: "passenger.compensation_amount",
      type: "money",
      description:
        "Importe de compensación económica recibido o pendiente de recibir. " +
        "Se determina por Art. 7 según distancia (250/400/600€) y posibles reducciones. " +
        "Tipo derivado: se establece a partir del resultado de las reglas.",
      questionId: "q-compensation-amount",
      required: false,
    },

    // ── Optional facts — Booking context ──────────────────────────
    {
      key: "flight.booking_date",
      type: "date",
      description: "Fecha en que se realizó la reserva del vuelo.",
      questionId: "q-booking-date",
      required: false,
    },
    {
      key: "flight.number",
      type: "string",
      description: "Número de vuelo (ej: IB3456, VY1234).",
      questionId: "q-flight-number",
      required: false,
    },
    {
      key: "airline.name",
      type: "string",
      description: "Nombre de la aerolínea.",
      questionId: "q-airline-name",
      required: false,
    },

    // ── Derived facts (computed, never collected) ─────────────────
    {
      key: "flight.distance_km",
      type: "number",
      description:
        "Distancia entre aeropuertos en kilómetros (great-circle / Art. 7.4). " +
        "Se calcula a partir de los códigos IATA. Determina la cuantía de compensación (Art. 7).",
      required: false,
    },
    {
      key: "flight.compensation_tier",
      type: "number",
      description:
        "Tier de compensación según distancia: 250 (≤1500km), 400 (>1500km, intra-UE), " +
        "600 (>3500km o inter-UE >3500km). Derivado de distance_km. " +
        "Art. 7.1 Reglamento 261/2004. Puede reducirse un 50% según Art. 7.2.",
      required: false,
    },
  ],

  // ── Adaptive intake ─────────────────────────────────────────────
  intake: [
    // Phase 1: What happened?
    {
      id: "q-departure",
      text: "¿De qué aeropuerto salía tu vuelo? (código IATA o ciudad)",
      type: "string",
      factKey: "flight.departure_airport",
      required: true,
    },
    {
      id: "q-arrival",
      text: "¿A qué aeropuerto ibas dirigido?",
      type: "string",
      factKey: "flight.arrival_airport",
      required: true,
    },
    {
      id: "q-scheduled-date",
      text: "¿Cuál era la fecha programada del vuelo?",
      type: "date",
      factKey: "flight.scheduled_date",
      required: true,
    },
    {
      id: "q-cancellation-date",
      text: "¿Cuándo te comunicaron la cancelación?",
      type: "date",
      factKey: "cancellation.date",
      required: true,
    },

    // Phase 2: What did the airline offer?
    {
      id: "q-reimbursement",
      text: "¿La aerolínea te ofreció devolverte el dinero del billete?",
      type: "boolean",
      factKey: "airline.reimbursement_offered",
      required: true,
    },
    {
      id: "q-re-routing",
      text: "¿La aerolínea te ofreció un vuelo alternativo?",
      type: "boolean",
      factKey: "airline.re_routing_offered",
      required: true,
    },
    {
      id: "q-assistance",
      text: "¿La aerolínea te ofreció asistencia (comidas, llamadas, hotel si era necesario)?",
      type: "boolean",
      factKey: "airline.assistance_offered",
      required: true,
    },

    // Phase 3: Re-routing details (conditional)
    {
      id: "q-accepted-re-routing",
      text: "¿Aceptaste el vuelo alternativo que te ofrecieron?",
      type: "boolean",
      factKey: "airline.re_routing.accepted",
      required: false,
      askIf: [{ factKey: "airline.re_routing_offered" as never, equals: true }],
    },
    {
      id: "q-re-routing-delay",
      text: "Si aceptaste, ¿cuánto se retrasó respecto al horario original?",
      type: "number",
      factKey: "airline.re_routing.departure_delay_hours",
      required: false,
      askIf: [
        { factKey: "airline.re_routing_offered" as never, equals: true },
        { factKey: "airline.re_routing.accepted" as never, equals: true },
      ],
    },
    {
      id: "q-alt-transport-compliant",
      text: "¿El vuelo alternativo llegó dentro de los plazos del Reglamento 261/2004?",
      type: "boolean",
      factKey: "airline.alternative_transport_compliant",
      required: false,
      askIf: [{ factKey: "airline.re_routing_offered" as never, equals: true }],
    },
    {
      id: "q-alt-arrival-delay",
      text: "Si tomaste el vuelo alternativo, ¿cuánto se retrasó la llegada respecto a la hora original? (horas)",
      type: "number",
      factKey: "airline.alternative_arrival_delay_hours",
      required: false,
      askIf: [
        { factKey: "airline.re_routing_offered" as never, equals: true },
        { factKey: "airline.re_routing.accepted" as never, equals: true },
      ],
    },

    // Phase 4: Cancellation reason
    {
      id: "q-reason",
      text: "¿Te dieron algún motivo para la cancelación?",
      type: "string",
      factKey: "airline.cancellation_reason",
      required: false,
    },
    {
      id: "q-extraordinary",
      text: "¿La aerolínea dijo que fue por circunstancias extraordinarias (clima, seguridad, huelga)?",
      type: "boolean",
      factKey: "airline.reason_is_extraordinary",
      required: false,
    },

    // Phase 5: Compensation status
    {
      id: "q-claimed",
      text: "¿Ya has reclamado la compensación económica a la aerolínea?",
      type: "boolean",
      factKey: "passenger.claimed_compensation",
      required: false,
    },
    {
      id: "q-received-compensation",
      text: "Si reclamaste, ¿te han pagado la compensación?",
      type: "boolean",
      factKey: "passenger.compensation_received",
      required: false,
      askIf: [{ factKey: "passenger.claimed_compensation" as never, equals: true }],
    },
    {
      id: "q-reimbursed",
      text: "¿Te han devuelto ya el dinero del billete?",
      type: "boolean",
      factKey: "passenger.reimbursed",
      required: false,
    },

    // Phase 6: Additional info
    {
      id: "q-additional-costs",
      text: "¿Tuviste gastos adicionales por la cancelación (hotel, comidas, otro transporte)?",
      type: "money",
      factKey: "passenger.additional_costs",
      required: false,
    },
    {
      id: "q-airline-name",
      text: "¿Qué aerolínea era?",
      type: "string",
      factKey: "airline.name",
      required: false,
    },
    {
      id: "q-flight-number",
      text: "¿Recuerdas el número de vuelo?",
      type: "string",
      factKey: "flight.number",
      required: false,
    },
  ],

  // ── Rule keys ───────────────────────────────────────────────────
  ruleKeys: [
    "flight-cancel.flight-was-cancelled",
    "flight-cancel.notice-period-insufficient",
    "flight-cancel.compensation-exemption-alternative-transport",
    "flight-cancel.compensation-due-no-extraordinary",
    "flight-cancel.reimbursement-entitlement",
    "flight-cancel.assistance-not-offered",
    "flight-cancel.additional-costs-claim",
    "flight-cancel.compensation-amount",
    "flight-cancel.compensation-50-percent-reduction",
  ],

  relatedProblems: [],
});
