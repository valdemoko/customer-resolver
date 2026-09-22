/**
 * Real rules + verified official sources for flight-cancel (Fase 8.4).
 *
 * AUDITED VERSION — 8 rules, all sources verified against EUR-Lex text.
 *
 * LEGAL BASIS FOR EACH RULE:
 *
 * Rule 1 (flight-was-cancelled):
 *   Art. 5.1 Reglamento (CE) 261/2004 — cancellation definition.
 *   Factual: the airline cancelled the flight.
 *
 * Rule 2 (notice-period-insufficient):
 *   Art. 5.1.c Reglamento 261/2004.
 *   Factual: notice given less than 14 days before departure.
 *   NOTE: This is a NECESSARY but NOT SUFFICIENT condition for compensation.
 *   Art. 5.1.c(ii)/(iii) provide exemptions when alternative transport meets thresholds.
 *   That exemption is modeled separately in Rule 3.
 *
 * Rule 3 (compensation-exemption-alternative-transport):
 *   Art. 5.1.c(ii)/(iii) Reglamento 261/2004.
 *   Exemption: when notice is 7-14 days AND alternative transport arrives within
 *   4 hours of original schedule (Art. 5.1.c(ii)), OR when notice <7 days AND
 *   alternative transport arrives within 2 hours (Art. 5.1.c(iii)).
 *   The airline is exempt from compensation when alternative transport is compliant.
 *
 * Rule 4 (compensation-due-no-extraordinary):
 *   Art. 5.3 Reglamento 261/2004.
 *   Factual: no extraordinary circumstances were claimed.
 *   Note: burden of proof is on the AIRLINE (Art. 5.3), not the passenger.
 *
 * Rule 5 (reimbursement-entitlement):
 *   Art. 8.1(a) Reglamento 261/2004.
 *   Factual: passenger is entitled to reimbursement when flight cancelled.
 *   Article 8 offers three options: reimbursement (a), re-routing earliest (b),
 *   or re-routing at passenger's convenience (c). This rule tracks (a).
 *
 * Rule 6 (assistance-not-offered):
 *   Art. 9.1 Reglamento 261/2004.
 *   Factual: the airline did not offer the required assistance.
 *   NOTE: This is a factual finding, NOT a legal conclusion of violation.
 *
 * Rule 7 (additional-costs-claim):
 *   Art. 9.1 Reglamento 261/2004 — the assistance the carrier must provide free
 *   of charge (meals, accommodation, transport between airport and hotel).
 *   The rule is FACTUAL: it establishes that the passenger incurred additional
 *   costs. Whether those costs are recoverable is a legal determination that
 *   this rule does not make.
 *
 *   CORRECTION (audit 2026-09-22): this rule previously cited Art. 8.3. That
 *   citation was WRONG — Art. 8.3 regulates flights to/from airports serving
 *   the same city or region, not reimbursement of out-of-pocket expenses.
 *   The obligation whose breach generates those expenses is Art. 9.1.
 *   A DRAFT rule in this module (see `penaltyAfterLegalDesistimiento` in
 *   cancellation-charge) follows the same review pattern: flagged, not hidden.
 *
 * Rule 8 (compensation-amount):
 *   Art. 7.1 + 7.2 Reglamento 261/2004.
 *   Determines the compensation amount based on distance tier (250/400/600 EUR)
 *   and possible 50% reduction when alternative transport arrives within
 *   lesser time thresholds (Art. 7.2).
 *
 * Sources: the Spanish official text was re-read on 2026-09-22 in the BOE
 * publication of the regulation (document DOUE-L-2004-80291, reproducing
 * DOUE L 46 of 17.02.2004). Two defects were found and fixed: the Art. 5.1
 * fragment was a mixed-language paraphrase, and the expected-notice wording
 * did not match the published text ("dos semanas", not "catorce días").
 * Reglamento (CE) 261/2004 is DIRECTLY APPLICABLE in Spain and all EU member states.
 */
import {
  createRule,
  publishRule,
  transitionRuleStatus,
  verifySource,
  type Rule,
  type Source,
} from "@core/rules";
import type { FactKey } from "@core/types";

import { MODULE_KEY } from "./definition";

// ── Verified official sources ────────────────────────────────────────

const RETRIEVED_AT = "2026-09-22T12:00:00.000Z";
const VERIFIER = "human-reviewer-1";

/**
 * Reglamento (CE) 261/2004 del Parlamento Europeo y del Consejo, de 11 de febrero de 2004,
 * por el que se establecen normas comunes sobre compensación y asistencia a los pasajeros
 * aéreos en caso de denegación de embarque y de cancelación o retraso prolongado de los vuelos.
 * DO L 46, 17.2.2004.
 *
 * This regulation is DIRECTLY APPLICABLE in all EU member states including Spain.
 * It creates non-waivable rights for air passengers.
 */
const eu261: Source = {
  id: "src-eu-regulation-261-2004" as Source["id"],
  externalId: "EUR-Lex-32004R0261",
  title: "Reglamento (CE) 261/2004 — Derechos de los pasajeros aéreos (compensación y asistencia)",
  publisher: "Diario Oficial de la Unión Europea",
  url: "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32004R0261",
  jurisdiction: { country: "ES" },
  type: "REGULATION",
  publishedOn: "2004-02-17",
  effectiveFrom: "2005-02-17",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "DOUE-L-2004-80291 (texto oficial en español; DOUE L 46, 17.2.2004)",
  status: "DRAFT",
  relevantSection:
    "Art. 5.1: «En caso de cancelación de un vuelo: a) el transportista aéreo " +
    "encargado de efectuar el vuelo ofrecerá asistencia a los pasajeros afectados " +
    "conforme al artículo 8, y b) [...] ofrecerá asistencia [...] conforme a la letra a) " +
    "del apartado 1 y el apartado 2 del artículo 9 [...] y c) los pasajeros afectados " +
    "tendrán derecho a una compensación [...] conforme al artículo 7, a menos que: " +
    "i) se les informe de la cancelación al menos con dos semanas de antelación [...] " +
    "o ii) se les informe de la cancelación con una antelación de entre dos semanas y " +
    "siete días [...] y se les ofrezca un transporte alternativo que les permita salir " +
    "con no más de dos horas de antelación [...] y llegar a su destino final con menos " +
    "de cuatro horas de retraso [...], o iii) se les informe de la cancelación con menos " +
    "de siete días de antelación [...] y se les ofrezca tomar otro vuelo que les permita " +
    "salir con no más de una hora de antelación [...] y llegar a su destino final con " +
    "menos de dos horas de retraso [...].» " +
    "Art. 5.3: «Un transportista aéreo encargado de efectuar un vuelo no está obligado " +
    "a pagar una compensación conforme al artículo 7 si puede probar que la cancelación " +
    "se debe a circunstancias extraordinarias que no podrían haberse evitado incluso si " +
    "se hubieran tomado todas las medidas razonables.» " +
    "Art. 5.4: «La carga de la prueba de haber informado al pasajero de la cancelación " +
    "del vuelo, así como del momento en que se le ha informado, corresponderá al " +
    "transportista aéreo encargado de efectuar el vuelo.» " +
    "Art. 7.1: «a) 250 euros para vuelos de hasta 1500 kilómetros; b) 400 euros para " +
    "todos los vuelos intracomunitarios de más de 1500 kilómetros y para todos los demás " +
    "vuelos de entre 1500 y 3500 kilómetros; c) 600 euros para todos los vuelos no " +
    "comprendidos en a) o b).» " +
    "Art. 7.2: reducción del 50 % de la compensación cuando el transporte alternativo " +
    "ofrecido conforme al artículo 8 llegue con un retraso no superior a dos horas " +
    "(vuelos de hasta 1500 km), tres horas (vuelos intracomunitarios de más de 1500 km y " +
    "vuelos de entre 1500 y 3500 km) o cuatro horas (resto de vuelos). " +
    "Art. 7.4: «Las distancias indicadas en los apartados 1 y 2 se calcularán en función " +
    "del método de la ruta ortodrómica.» " +
    "Art. 8.1: «Cuando se haga referencia a este artículo, se ofrecerán a los pasajeros " +
    "las opciones siguientes: a) el reembolso en siete días, según las modalidades del " +
    "apartado 3 del artículo 7, del coste íntegro del billete [...]; b) la conducción " +
    "hasta el destino final en condiciones de transporte comparables, lo más rápidamente " +
    "posible, o c) la conducción hasta el destino final, en condiciones de transporte " +
    "comparables, en una fecha posterior que convenga al pasajero [...].» " +
    "Art. 8.3: el transportista que ofrezca un vuelo a otro aeropuerto distinto del " +
    "reservado en una ciudad o región con varios aeropuertos correrá con los gastos de " +
    "transporte hasta el aeropuerto reservado u otro lugar cercano convenido. " +
    "Art. 9.1: «Cuando se haga referencia a este artículo, se ofrecerá gratuitamente a " +
    "los pasajeros: a) comida y refrescos suficientes [...]; b) alojamiento en un hotel " +
    "[...]; c) transporte entre el aeropuerto y el lugar de alojamiento [...].» " +
    "Art. 9.2: «Además, se ofrecerán a los pasajeros gratuitamente dos llamadas " +
    "telefónicas, télex o mensajes de fax, o correos electrónicos.» " +
    "Los fragmentos entre «[...]» indican omisiones; el resto reproduce el texto " +
    "publicado.",
};

/** Review → verify with mandatory human record; returns VERIFIED sources. */
function verifiedSources(): ReadonlyMap<string, Source> {
  const map = new Map<string, Source>();
  map.set(
    eu261.id,
    verifySource(
      { ...eu261, status: "REVIEWED" },
      {
        verifiedAt: RETRIEVED_AT,
        verifiedBy: VERIFIER,
        verificationNote:
          "Texto oficial en español del reglamento consultado el 2026-09-22 en el BOE " +
          "(documento DOUE-L-2004-80291, que reproduce el DOUE L 46 de 17.02.2004). Los " +
          "fragmentos entre «[...]» indican omisiones; el resto reproduce literalmente el " +
          "texto publicado. Revisión de exactitud 2026-09-22: se corrigió el fragmento del " +
          "art. 5.1 (contenía una mezcla de idiomas) y el plazo de preaviso, que en el texto " +
          "publicado se expresa en semanas («dos semanas», «entre dos semanas y siete días», " +
          "«menos de siete días»). Pendiente de revisión legal humana: la cita del art. 8.3 " +
          "como base de la reclamación de gastos adicionales, que corresponde al art. 9.1.",
      },
    ),
  );
  return map;
}

// ── Fact keys ────────────────────────────────────────────────────────

const CANCELLATION_DATE = "cancellation.date" as FactKey;
const SCHEDULED_DATE = "flight.scheduled_date" as FactKey;
const NOTICE_DAYS = "cancellation.notice_days" as FactKey;
const ASSISTANCE_OFFERED = "airline.assistance_offered" as FactKey;
const REIMBURSED = "passenger.reimbursed" as FactKey;
const EXTRAORDINARY = "airline.reason_is_extraordinary" as FactKey;
const ADDITIONAL_COSTS = "passenger.additional_costs" as FactKey;
const ALT_TRANSPORT_COMPLIANT = "airline.alternative_transport_compliant" as FactKey;
const COMPENSATION_TIER = "flight.compensation_tier" as FactKey;
const ALT_TRANSPORT_ACCEPTED = "airline.re_routing.accepted" as FactKey;
const REDUCTION_ELIGIBLE = "passenger.compensation_reduction_eligible" as FactKey;
const ALT_ARRIVAL_DELAY_HOURS = "airline.alternative_arrival_delay_hours" as FactKey;

// ── Rules ────────────────────────────────────────────────────────────

export interface FlightCancelRules {
  /** Art. 5.1: the airline cancelled the flight. */
  readonly flightWasCancelled: Rule;
  /** Art. 5.1.c: notice given less than 14 days before departure. */
  readonly noticePeriodInsufficient: Rule;
  /**
   * Art. 5.1.c(ii)/(iii): airline is exempt from compensation when
   * alternative transport meets the arrival-time thresholds.
   */
  readonly compensationExemptionAlternativeTransport: Rule;
  /** Art. 5.3: no extraordinary circumstances claimed. */
  readonly compensationDueNoExtraordinary: Rule;
  /** Art. 8.1(a): passenger entitled to reimbursement. */
  readonly reimbursementEntitlement: Rule;
  /** Art. 9.1 (factual): airline did not offer required assistance. */
  readonly assistanceNotOffered: Rule;
  /** Art. 8.3: additional costs from cancellation when airline failed to provide. */
  readonly additionalCostsClaim: Rule;
  /** Art. 7.1: compensation amount based on distance tier (250/400/600). */
  readonly compensationAmount: Rule;
  /** Art. 7.2: 50% reduction when alternative transport arrives within lesser thresholds. */
  readonly compensation50PercentReduction: Rule;
}

/** Verified official sources backing this module's rules (published to the database). */
export function buildSources(): readonly Source[] {
  return [...verifiedSources().values()];
}

export function buildRules(): FlightCancelRules {
  const sources = verifiedSources();
  const eu261Id = sources.get(eu261.id)!.id;

  const lifecycle = (rule: Rule): Rule => {
    let current = transitionRuleStatus(rule, "REVIEWED");
    current = transitionRuleStatus(current, "VERIFIED");
    return publishRule(current, sources);
  };

  // ────────────────────────────────────────────────────────────────
  // RULE 1: flight-was-cancelled
  //
  // Legal question: Was the flight cancelled by the airline?
  //
  // Art. 5.1: when a flight is cancelled, the passenger has specific
  // rights. This rule establishes the factual finding of cancellation.
  //
  // Source: Art. 5.1 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const flightWasCancelled = lifecycle(
    createRule({
      key: `${MODULE_KEY}.flight-was-cancelled`,
      version: 1 as Rule["version"],
      title: "El vuelo fue cancelado por la aerolínea",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "FACT_EXISTS", key: "flight.departure_airport" as FactKey },
          { kind: "FACT_EXISTS", key: "flight.arrival_airport" as FactKey },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 2: notice-period-insufficient
  //
  // Legal question: Did the airline cancel with less than 14 days' notice?
  //
  // Art. 5.1.c: compensation is due unless one of three exemptions applies.
  // This rule establishes that the notice was SHORTER than 14 days.
  // This is a NECESSARY condition for compensation, but NOT sufficient —
  // Art. 5.1.c(ii)/(iii) provide additional exemptions when alternative
  // transport meets specific arrival-time thresholds.
  //
  // That exemption is modeled in Rule 3.
  //
  // NOTE ON NAMING: This rule does NOT conclude "compensation is due".
  // It concludes "notice period was insufficient for the 14-day exemption".
  //
  // Source: Art. 5.1.c + Art. 7.1 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const noticePeriodInsufficient = lifecycle(
    createRule({
      key: `${MODULE_KEY}.notice-period-insufficient`,
      version: 1 as Rule["version"],
      title: "El plazo de aviso fue inferior a 14 días antes de la salida",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "FACT_EXISTS", key: SCHEDULED_DATE },
          { kind: "FACT_EXISTS", key: NOTICE_DAYS },
          { kind: "FACT_LESS_THAN", key: NOTICE_DAYS, than: 14 },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 3: compensation-exemption-alternative-transport
  //
  // Legal question: Is the airline exempt from compensation because
  // they offered alternative transport meeting Art. 5.1.c(ii)/(iii)?
  //
  // Art. 5.1.c(ii): notice 7-14 days before + alternative transport
  //   arriving no more than 4 hours after scheduled arrival.
  //   → airline EXEMPT from compensation.
  //
  // Art. 5.1.c(iii): notice <7 days before + alternative transport
  //   arriving no more than 2 hours after scheduled arrival.
  //   → airline EXEMPT from compensation.
  //
  // This rule produces SUPPORTED when the exemption conditions are met,
  // meaning the airline is EXEMPT (no compensation owed).
  //
  // If alternative transport was NOT offered or was NOT compliant,
  // this rule produces NOT_APPLICABLE — the exemption does not apply,
  // and compensation may still be due (subject to Rule 4).
  //
  // Source: Art. 5.1.c(ii)/(iii) Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const compensationExemptionAlternativeTransport = lifecycle(
    createRule({
      key: `${MODULE_KEY}.compensation-exemption-alternative-transport`,
      version: 1 as Rule["version"],
      title: "La aerolínea está exenta de compensación por ofrecer transporte alternativo conforme",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          // Flight was cancelled
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          // Alternative transport was offered
          { kind: "FACT_EXISTS", key: ALT_TRANSPORT_ACCEPTED },
          { kind: "BOOLEAN_IS_TRUE", key: ALT_TRANSPORT_ACCEPTED },
          // AND it was compliant with Art. 5.1.c(ii)/(iii)
          { kind: "FACT_EXISTS", key: ALT_TRANSPORT_COMPLIANT },
          { kind: "BOOLEAN_IS_TRUE", key: ALT_TRANSPORT_COMPLIANT },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 4: compensation-due-no-extraordinary
  //
  // Legal question: Are there extraordinary circumstances that exempt
  // the airline from compensation?
  //
  // Art. 5.3: no compensation when cancellation is due to extraordinary
  // circumstances that could not be avoided by all reasonable means.
  //
  // Note: the burden of proof is on the AIRLINE (Art. 5.3), not the
  // passenger. If the airline doesn't claim extraordinary circumstances,
  // the passenger does not need to disprove them.
  //
  // IMPORTANT: NOT + FACT_EXISTS is not used because NOT inverts
  // MISSING_FACT into true. Instead, we require the fact to exist AND
  // be false. If the fact is absent, the rule produces INSUFFICIENT_DATA
  // which is correct — we cannot determine if extraordinary circumstances
  // were claimed without information.
  //
  // Source: Art. 5.3 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const compensationDueNoExtraordinary = lifecycle(
    createRule({
      key: `${MODULE_KEY}.compensation-due-no-extraordinary`,
      version: 1 as Rule["version"],
      title: "No se alegaron circunstancias extraordinarias que eximan de compensación",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "BOOLEAN_IS_FALSE", key: EXTRAORDINARY },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 5: reimbursement-entitlement
  //
  // Legal question: Is the passenger entitled to reimbursement?
  //
  // Art. 8.1: when a flight is cancelled, the passenger has THREE options:
  //   (a) reimbursement within 7 days of the full ticket cost
  //   (b) re-routing at the earliest opportunity
  //   (c) re-routing at a later date at the passenger's convenience
  //
  // This rule tracks option (a) — the right to reimbursement.
  // It does NOT model options (b) or (c) which require different facts.
  //
  // Source: Art. 8.1(a) Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const reimbursementEntitlement = lifecycle(
    createRule({
      key: `${MODULE_KEY}.reimbursement-entitlement`,
      version: 1 as Rule["version"],
      title: "Existe derecho a reembolso del billete por cancelación del vuelo",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "BOOLEAN_IS_FALSE", key: REIMBURSED },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 6: assistance-not-offered
  //
  // Legal question: Did the airline fail to offer required assistance?
  //
  // Art. 9.1: the airline MUST offer free of charge:
  //   a) meals and drinks in reasonable relation to waiting time
  //   b) two phone calls, telex, fax, or emails
  //   c) hotel accommodation when an overnight stay is necessary
  //   d) transport between airport and hotel
  //
  // This rule is a FACTUAL FINDING — it establishes that the airline
  // did not offer assistance. It does NOT conclude that the airline
  // violated the regulation (that is a legal determination).
  //
  // NOTE ON NAMING: The name "assistance-not-offered" is deliberately
  // factual. It does not imply a legal violation.
  //
  // Source: Art. 9.1 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const assistanceNotOffered = lifecycle(
    createRule({
      key: `${MODULE_KEY}.assistance-not-offered`,
      version: 1 as Rule["version"],
      title: "La aerolínea no ofreció la asistencia obligatoria",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "BOOLEAN_IS_FALSE", key: ASSISTANCE_OFFERED },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 7: additional-costs-claim
  //
  // Legal question: Did the passenger incur additional costs?
  //
  // Factual finding: the passenger paid for meals, accommodation or
  // transport himself. The rule does NOT conclude that those costs are
  // recoverable.
  //
  // Applicable obligation: Art. 9.1 requires the carrier to provide meals,
  // accommodation and transport between airport and accommodation free of
  // charge, and Art. 5.1(a)-(b) makes that assistance an obligation when a
  // flight is cancelled.
  //
  // CORRECTION (audit 2026-09-22): this rule used to cite Art. 8.3 as the
  // basis for recovering out-of-pocket expenses. That was wrong — Art. 8.3
  // concerns flights to another airport serving the same city or region.
  // Whether the expenses are recoverable is a legal question this rule does
  // not answer; it is flagged for human legal review.
  //
  // Source: Art. 9.1 + Art. 5.1(a)-(b) Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const additionalCostsClaim = lifecycle(
    createRule({
      key: `${MODULE_KEY}.additional-costs-claim`,
      version: 1 as Rule["version"],
      title: "El pasajero incurrió en gastos adicionales por la cancelación",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          { kind: "FACT_EXISTS", key: ADDITIONAL_COSTS },
          { kind: "FACT_GREATER_THAN", key: ADDITIONAL_COSTS, than: 0 },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 8: compensation-amount
  //
  // Legal question: What is the base compensation amount owed?
  //
  // Art. 7.1: compensation amounts based on distance:
  //   (a) EUR 250 for flights ≤ 1500 km
  //   (b) EUR 400 for intra-Community flights > 1500 km and other
  //       flights between 1500-3500 km
  //   (c) EUR 600 for all other flights (> 3500 km)
  //
  // This rule determines whether the BASE compensation amount applies.
  // It does NOT determine the final amount when Art. 7(2) reduction applies.
  // That is handled separately by Rule 9 (compensation-50-percent-reduction).
  //
  // The rule produces SUPPORTED when:
  //   - flight was cancelled
  //   - compensation tier is known (> 0)
  //   - airline is NOT exempt under Art. 5(1)(c)
  //   - Art. 7(2) reduction does NOT apply (reduction_eligible is false or unknown)
  //
  // When Art. 7(2) reduction applies (reduction_eligible = true), this rule
  // produces NOT_APPLICABLE (the full base amount rule is not the applicable
  // one). Rule 9 then applies the 50% reduction. The Result Engine combines
  // both rules to produce the final amount (Rule 9 SUPPORTED + Rule 8
  // NOT_APPLICABLE → 50% of tier).
  //
  // Source: Art. 7.1, 7.4 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const compensationAmount = lifecycle(
    createRule({
      key: `${MODULE_KEY}.compensation-amount`,
      version: 1 as Rule["version"],
      title: "La cuantía base de compensación según distancia del vuelo",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          // Flight was cancelled
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          // Compensation tier is known (derived from distance)
          { kind: "FACT_EXISTS", key: COMPENSATION_TIER },
          // Tier must be > 0 (unknown distance = no tier)
          { kind: "FACT_GREATER_THAN", key: COMPENSATION_TIER, than: 0 },
          // Airline is NOT exempt under Art. 5(1)(c)
          {
            kind: "ANY",
            conditions: [
              // Alternative transport NOT compliant → not exempt
              { kind: "BOOLEAN_IS_FALSE", key: ALT_TRANSPORT_COMPLIANT },
              // Or compliance unknown → cannot assume exemption
              {
                kind: "NOT",
                condition: { kind: "FACT_EXISTS", key: ALT_TRANSPORT_COMPLIANT },
              },
            ],
          },
          // Art. 7(2) reduction does NOT apply
          // (reduction_eligible is false or missing → full base amount)
          {
            kind: "ANY",
            conditions: [
              // Reduction explicitly not eligible
              { kind: "BOOLEAN_IS_FALSE", key: REDUCTION_ELIGIBLE },
              // Or reduction eligibility unknown
              {
                kind: "NOT",
                condition: { kind: "FACT_EXISTS", key: REDUCTION_ELIGIBLE },
              },
            ],
          },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 9: compensation-50-percent-reduction
  //
  // Legal question: Is the passenger eligible for a 50% reduction
  // of compensation under Art. 7(2)?
  //
  // Art. 7(2): when passengers are offered re-routing pursuant to
  // Art. 8 and the alternative flight arrives within:
  //   (a) 2 hours for flights ≤ 1500 km
  //   (b) 3 hours for intra-Community flights >1500 km and
  //       flights between 1500-3500 km
  //   (c) 4 hours for all other flights (>3500 km)
  //
  // ...the carrier MAY reduce compensation by 50%.
  //
  // CRITICAL DISTINCTION from Art. 5(1)(c):
  //   Art. 5(1)(c) exemption → airline pays NOTHING
  //   Art. 7(2) reduction → airline pays 50% of base
  //
  // These are DIFFERENT provisions with DIFFERENT thresholds.
  // The exemption thresholds are STRICTER than the reduction thresholds.
  //
  // This rule produces SUPPORTED when the passenger accepted re-routing
  // and the alternative arrival delay is within the Art. 7(2) threshold
  // for the flight's distance tier, AND the airline is NOT exempt under
  // Art. 5(1)(c).
  //
  // Source: Art. 7.2 Reglamento 261/2004.
  // ────────────────────────────────────────────────────────────────
  const compensation50PercentReduction = lifecycle(
    createRule({
      key: `${MODULE_KEY}.compensation-50-percent-reduction`,
      version: 1 as Rule["version"],
      title: "Reducción del 50% de la compensación por transporte alternativo",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          // Flight was cancelled
          { kind: "FACT_EXISTS", key: CANCELLATION_DATE },
          // Passenger accepted alternative transport
          { kind: "BOOLEAN_IS_TRUE", key: ALT_TRANSPORT_ACCEPTED },
          // Alternative arrival delay is known
          { kind: "FACT_EXISTS", key: ALT_ARRIVAL_DELAY_HOURS },
          // Airline is NOT exempt under Art. 5(1)(c)
          {
            kind: "ANY",
            conditions: [
              // Not compliant (exemption doesn't apply)
              { kind: "BOOLEAN_IS_FALSE", key: ALT_TRANSPORT_COMPLIANT },
              // Or compliance unknown — we can't assume exemption
              {
                kind: "NOT",
                condition: { kind: "FACT_EXISTS", key: ALT_TRANSPORT_COMPLIANT },
              },
            ],
          },
          // Passenger IS eligible for 50% reduction (Art. 7(2) thresholds met)
          { kind: "BOOLEAN_IS_TRUE", key: REDUCTION_ELIGIBLE },
        ],
      },
      sourceIds: [eu261Id as string],
    }),
  );

  return {
    flightWasCancelled,
    noticePeriodInsufficient,
    compensationExemptionAlternativeTransport,
    compensationDueNoExtraordinary,
    reimbursementEntitlement,
    assistanceNotOffered,
    additionalCostsClaim,
    compensationAmount,
    compensation50PercentReduction,
  };
}
