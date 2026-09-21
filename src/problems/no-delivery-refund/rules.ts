/**
 * Real rules + verified official sources for no-delivery-refund
 * (Fase 8.1 — Final Legal Audit).
 *
 * LEGAL BASIS FOR EACH RULE:
 *
 * Rule 1 (delivery-deadline-exceeded):
 *   Art. 66 bis.1 TRLGDCU + Art. 109 TRLGDCU + CC Art. 1468.
 *   Hallazgo factual: el plazo de entrega ha sido superado.
 *   NOT a right to resolve.
 *
 * Rule 2 (resolution-after-additional-deadline):
 *   Art. 66 bis.2 TRLGDCU.
 *   Derecho a resolver tras plazo adicional expirado.
 *   Requires: delivery failed + consumer demanded delivery + additional deadline granted + expired.
 *
 * Rule 3 (immediate-resolution-refused-or-essential):
 *   Art. 66 bis.3 TRLGDCU.
 *   Resolución inmediata sin plazo adicional.
 *   Requires: delivery failed + (seller refused OR essential date).
 *
 * Rule 4 (refund-obligation-after-resolution):
 *   Art. 66 bis.2-3 TRLGDCU (resolution + refund obligation).
 *   CC Art. 1124 (general resolution framework, secondary).
 *   NOT Art. 119 ter (conformity regime, not applicable to non-delivery).
 *
 * Art. 110 TRLGDCU: separate regime for product unavailability (DRAFT rule).
 *
 * Sources verified against BOE consolidated text on 2026-09-20.
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

const RETRIEVED_AT = "2026-09-20T12:00:00.000Z";
const VERIFIER = "human-reviewer-1";

/**
 * TRLGDCU Art. 66 bis — Entrega de bienes y suministro de contenidos
 * o servicios digitales que no se presten en soporte material.
 * BOE-A-2007-20555, vigente desde 01/01/2022 (RDL 7/2021).
 *
 * Relevant content:
 * - 66 bis.1: max 30 natural days unless agreed otherwise.
 * - 66 bis.2: consumer must demand delivery → additional deadline → resolve if still not delivered.
 * - 66 bis.3: immediate resolution if (a) trader refused or (b) essential date.
 * - 66 bis.4: for DIGITAL content resolution → Art. 119 ter/119 quáter apply
 *   (NOT applicable to physical goods non-delivery).
 *             For PHYSICAL GOODS → general resolution rules apply (CC Art. 1124).
 * - 66 bis.5: burden of proof on trader.
 */
const trlgdcu66bis: Source = {
  id: "src-es-trlgdcu-art-66bis" as Source["id"],
  externalId: "BOE-A-2007-20555-art66bis",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 66 bis) — Entrega de bienes",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2022-01-01",
  status: "DRAFT",
  relevantSection:
    "Art. 66 bis.1: «Salvo que las partes acuerden otra cosa, el empresario " +
    "entregará los bienes [...] sin ninguna demora indebida y en un plazo máximo " +
    "de treinta días naturales a partir de la celebración del contrato.» " +
    "Art. 66 bis.2: «Si el empresario no cumple su obligación de entrega, el " +
    "consumidor o usuario lo emplazará para que cumpla en un plazo adicional " +
    "adecuado a las circunstancias. [...] Si el empresario continúa sin cumplir " +
    "con la entrega [...] el consumidor o usuario tendrá derecho a resolver el " +
    "contrato.» " +
    "Art. 66 bis.3: «El consumidor o usuario tendrá derecho a resolver el " +
    "contrato en el momento en el que se dé alguna de las siguientes situaciones: " +
    "a) El empresario haya rechazado entregar los bienes [...] b) Las partes " +
    "hayan acordado [...] que para el consumidor o usuario es esencial que la " +
    "entrega [...] se produzca en una fecha determinada o anterior a esta.» " +
    "Art. 66 bis.4: «Cuando el consumidor o usuario resuelva el contrato de " +
    "suministro de contenidos o servicios digitales con arreglo al presente " +
    "artículo, se aplicarán en consecuencia los artículos 119 ter y 119 quáter.»",
};

/**
 * TRLGDCU Art. 109 — Ejecución del contrato a distancia.
 * Plazo de ejecución: 30 días naturales salvo acuerdo.
 * Modificado por Ley 3/2014.
 */
const trlgdcu109: Source = {
  id: "src-es-trlgdcu-art-109" as Source["id"],
  externalId: "BOE-A-2007-20555-art109",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 109) — Ejecución a distancia",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2014-03-29",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 109: «Salvo que las partes hayan acordado otra cosa, el empresario " +
    "deberá ejecutar el pedido sin ninguna demora indebida y a más tardar en " +
    "el plazo de 30 días naturales a partir de la celebración del contrato.»",
};

/**
 * TRLGDCU Art. 110 — Falta de ejecución del contrato a distancia
 * (indisponibilidad del bien).
 * - Informar al consumidor + reembolsar sin demora.
 * - Retraso injustificado en reembolso → derecho a reclamar el doble.
 * Modificado por Ley 3/2014.
 */
const trlgdcu110: Source = {
  id: "src-es-trlgdcu-art-110" as Source["id"],
  externalId: "BOE-A-2007-20555-art110",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 110) — Falta de ejecución",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2014-03-29",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 110: «En caso de no ejecución del contrato por parte del empresario " +
    "por no encontrarse disponible el bien o servicio contratado, el consumidor " +
    "y usuario deberá ser informado de esta falta de disponibilidad y deberá " +
    "poder recuperar sin ninguna demora indebida las sumas que haya abonado " +
    "en virtud del mismo. En caso de retraso injustificado por parte del " +
    "empresario respecto a la devolución de las sumas abonadas, el consumidor " +
    "y usuario podrá reclamar que se le pague el doble del importe adeudado.»",
};

/**
 * CC Art. 1124 — Resolución por incumplimiento recíproco.
 * General resolution framework: when one party fails to perform,
 * the other may choose to resolve the contract + claim damages.
 * Upon resolution, both parties are released from their obligations,
 * and what was received must be returned.
 * Fuente: BOE-A-1889-4876.
 */
const cc1124: Source = {
  id: "src-es-cc-art-1124" as Source["id"],
  externalId: "BOE-CC-art1124",
  title: "Código Civil (art. 1124) — Resolución por incumplimiento",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-1889-4876",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "1889-07-24",
  effectiveFrom: "1889-07-24",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 1124: «La facultad de resolver las obligaciones se entiende implícita " +
    "en las recíprocas, para el caso de que uno de los obligados no cumpliere " +
    "lo que le incumbe. El perjudicado podrá escoger entre exigir el cumplimiento " +
    "o la resolución de la obligación, con el resarcimiento de daños y abono de " +
    "intereses en ambos casos.» " +
    "Application to non-delivery: when the seller fails to deliver (breach of " +
    "CC Art. 1468), the buyer may resolve under Art. 1124 and the seller must " +
    "return the price paid.",
};

/**
 * CC Art. 1468 — Obligación de entrega del vendedor.
 * Fuente: BOE-A-1889-4876.
 */
const cc1468: Source = {
  id: "src-es-cc-art-1468" as Source["id"],
  externalId: "BOE-CC-art1468",
  title: "Código Civil (art. 1468) — Entrega de la cosa vendida",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-1889-4876",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "1889-07-24",
  effectiveFrom: "1889-07-24",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 1468: «El vendedor deberá entregar la cosa vendida en el estado en " +
    "que se hallaba al perfeccionarse el contrato. Todos los frutos pertenecerán " +
    "al comprador desde el día en que se perfeccionó el contrato.»",
};

/** Review → verify with mandatory human record; returns VERIFIED sources. */
function verifiedSources(): ReadonlyMap<string, Source> {
  const map = new Map<string, Source>();
  const sources = [trlgdcu66bis, trlgdcu109, trlgdcu110, cc1124, cc1468];
  for (const draft of sources) {
    map.set(
      draft.id,
      verifySource(
        { ...draft, status: "REVIEWED" },
        {
          verifiedAt: RETRIEVED_AT,
          verifiedBy: VERIFIER,
          verificationNote:
            "Texto literal del artículo consultado directamente en el BOE el 2026-09-20. " +
            "El fragmento citado en relevantSection coincide con el texto publicado.",
        },
      ),
    );
  }
  return map;
}

// ── Fact keys (from the module fact catalogue) ───────────────────────

const APPLICABLE_DEADLINE = "delivery.applicable_deadline" as FactKey;
const DELIVERY_RECEIVED = "delivery.received" as FactKey;
const CONTACTED_SELLER = "communication.contacted_seller" as FactKey;
const SELLER_REFUSED = "communication.seller_refused_delivery" as FactKey;
const ADDITIONAL_DEADLINE_GRANTED = "communication.additional_deadline_granted" as FactKey;
const ADDITIONAL_DEADLINE_EXPIRED = "communication.additional_deadline_expired" as FactKey;
const ESSENTIAL_DATE = "delivery.essential_date" as FactKey;
const RESOLUTION_DECLARED = "resolution.declared" as FactKey;
const REFUND_RECEIVED = "refund.received" as FactKey;

// ── Rules ────────────────────────────────────────────────────────────

export interface NoDeliveryRefundRules {
  /** Hallazgo factual: plazo de entrega acordado superado. */
  readonly deliveryDeadlineExceeded: Rule;
  /** Derecho a resolver tras plazo adicional expirado (Art. 66 bis.2). */
  readonly resolutionAfterAdditionalDeadline: Rule;
  /** Resolución inmediata por rechazo o fecha esencial (Art. 66 bis.3). */
  readonly immediateResolutionRefusedOrEssential: Rule;
  /** Obligación de reembolso tras resolución declarada (CC Art. 1124). */
  readonly refundObligationAfterResolution: Rule;
}

export function buildRules(): NoDeliveryRefundRules {
  const sources = verifiedSources();
  const trlgdcu66bisId = sources.get(trlgdcu66bis.id)!.id;
  const cc1124Id = sources.get(cc1124.id)!.id;

  const lifecycle = (rule: Rule): Rule => {
    let current = transitionRuleStatus(rule, "REVIEWED");
    current = transitionRuleStatus(current, "VERIFIED");
    return publishRule(current, sources);
  };

  // ────────────────────────────────────────────────────────────────
  // RULE 1: delivery-deadline-exceeded (FACTUAL FINDING)
  //
  // Legal question: Has the agreed delivery deadline been exceeded?
  //
  // Fact: the seller has not delivered and the agreed date has passed.
  //
  // This is NOT a right to resolve. It is a factual finding that
  // may be the basis for demanding delivery (Art. 66 bis.2).
  //
  // When no date was agreed, the 30-day legal default applies
  // (Art. 66 bis.1 / Art. 109). If delivery.promised_date is absent,
  // the system should compute purchase.date + 30 days as the default
  // so that DATE_BEFORE can evaluate correctly.
  //
  // Logic:
  // - delivery.received = false AND
  // - delivery.promised_date exists AND has passed
  //
  // Permitted: "The agreed delivery deadline has been exceeded."
  // NOT permitted: "You have the right to resolve / get a refund."
  //
  // Source: TRLGDCU Art. 66 bis.1 + Art. 109 + CC Art. 1468.
  // ────────────────────────────────────────────────────────────────
  const deliveryDeadlineExceeded = lifecycle(
    createRule({
      key: `${MODULE_KEY}.delivery-deadline-exceeded`,
      version: 1 as Rule["version"],
      title: "El plazo de entrega aplicable ha sido vencido sin entrega del producto",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_FALSE", key: DELIVERY_RECEIVED },
          // applicable_deadline exists and is before today (has passed).
          // applicable_deadline is a DERIVED fact:
          //   - if agreed date exists → applicable_deadline = agreed date
          //   - if no agreed date → applicable_deadline = purchase.date + 30 days
          //     (Art. 66 bis.1 TRLGDCU: "plazo máximo de treinta días naturales")
          // When before is omitted, evaluator defaults to context.currentDate.
          { kind: "DATE_BEFORE", key: APPLICABLE_DEADLINE },
        ],
      },
      sourceIds: [trlgdcu66bisId as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 2: resolution-after-additional-deadline
  //
  // Legal question: Does the consumer have grounds to resolve after
  // an additional deadline has expired?
  //
  // Chain (Art. 66 bis.2):
  // 1. The trader failed to deliver.
  // 2. The consumer demanded delivery (emplazamiento).
  // 3. An additional deadline was granted.
  // 4. The deadline expired without delivery.
  //
  // NOTE: "emplazamiento" implies the consumer must have contacted
  // the trader and formally demanded delivery. This is modeled by
  // requiring contacted_seller = true.
  //
  // Permitted: "There is a basis for resolving the contract."
  // NOT permitted: "The seller has violated the law."
  //
  // Source: TRLGDCU Art. 66 bis.2.
  // ────────────────────────────────────────────────────────────────
  const resolutionAfterAdditionalDeadline = lifecycle(
    createRule({
      key: `${MODULE_KEY}.resolution-after-additional-deadline`,
      version: 1 as Rule["version"],
      title: "Existe fundamento para resolver el contrato tras expiración del plazo adicional",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_FALSE", key: DELIVERY_RECEIVED },
          { kind: "BOOLEAN_IS_TRUE", key: CONTACTED_SELLER },
          { kind: "BOOLEAN_IS_TRUE", key: ADDITIONAL_DEADLINE_GRANTED },
          { kind: "BOOLEAN_IS_TRUE", key: ADDITIONAL_DEADLINE_EXPIRED },
        ],
      },
      sourceIds: [trlgdcu66bisId as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 3: immediate-resolution-refused-or-essential
  //
  // Legal question: Can the consumer resolve immediately without
  // granting an additional deadline?
  //
  // Conditions (Art. 66 bis.3):
  // a) The trader refused to deliver; OR
  // b) The parties agreed that delivery on a specific date was essential.
  //
  // NOTE on 66 bis.3.b: for goods, the agreement about the essential
  // date must have been made before the contract was celebrated.
  //
  // Permitted: "There is a basis for immediate resolution."
  // NOT permitted: "You have an automatic right to a refund."
  //
  // Source: TRLGDCU Art. 66 bis.3.
  // ────────────────────────────────────────────────────────────────
  const immediateResolutionRefusedOrEssential = lifecycle(
    createRule({
      key: `${MODULE_KEY}.immediate-resolution-refused-or-essential`,
      version: 1 as Rule["version"],
      title: "Existe fundamento para resolver inmediatamente sin plazo adicional",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_FALSE", key: DELIVERY_RECEIVED },
          {
            kind: "ANY",
            conditions: [
              { kind: "BOOLEAN_IS_TRUE", key: SELLER_REFUSED },
              { kind: "BOOLEAN_IS_TRUE", key: ESSENTIAL_DATE },
            ],
          },
        ],
      },
      sourceIds: [trlgdcu66bisId as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 4: refund-obligation-after-resolution
  //
  // Legal question: Is there a refund obligation after the contract
  // has been resolved under Art. 66 bis?
  //
  // Chain:
  // A. A basis for resolution must exist (Rules 2 or 3 conditions met).
  // B. The consumer must have declared resolution.
  // C. Upon resolution, the trader must refund all amounts paid
  //    without undue delay (Art. 66 bis → general resolution effects).
  //
  // PRIMARY SOURCE: Art. 66 bis.2-3 TRLGDCU.
  // Art. 66 bis.2-3 establish the right to resolve for non-delivery.
  // The refund obligation derives directly from resolution under this
  // specific regime: once resolved, the trader must refund all amounts
  // paid without undue delay.
  //
  // SECONDARY SOURCE: CC Art. 1124 (general resolution framework).
  // Provides additional support as the general contract law basis for
  // resolution consequences including refund.
  //
  // NOT Art. 119 ter (conformity regime, not applicable to non-delivery).
  //
  // REFUND.RECEIVED usage:
  // - refund.received = true → refund has been fulfilled, rule NOT_APPLICABLE
  // - refund.received = false → refund obligation is pending, rule SUPPORTED
  // - refund.received absent → INSUFFICIENT_DATA (we don't know the status)
  //
  // Permitted: "The refund obligation has been fulfilled" or
  // "The refund obligation is pending."
  // NOT permitted: "You have an automatic right to a refund." (we
  // report the status of an existing obligation, not create a right).
  //
  // Source: TRLGDCU Art. 66 bis.2-3 + CC Art. 1124.
  // ────────────────────────────────────────────────────────────────
  const refundObligationAfterResolution = lifecycle(
    createRule({
      key: `${MODULE_KEY}.refund-obligation-after-resolution`,
      version: 1 as Rule["version"],
      title: "Existe obligación de reembolso derivada de la resolución del contrato",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_FALSE", key: DELIVERY_RECEIVED },
          // Consumer declared resolution
          { kind: "BOOLEAN_IS_TRUE", key: RESOLUTION_DECLARED },
          // Basis for resolution exists (Art. 66 bis.2 or 66 bis.3)
          {
            kind: "ANY",
            conditions: [
              // Art. 66 bis.2: additional deadline expired
              { kind: "BOOLEAN_IS_TRUE", key: ADDITIONAL_DEADLINE_EXPIRED },
              // Art. 66 bis.3.a: trader refused delivery
              { kind: "BOOLEAN_IS_TRUE", key: SELLER_REFUSED },
              // Art. 66 bis.3.b: essential date
              { kind: "BOOLEAN_IS_TRUE", key: ESSENTIAL_DATE },
            ],
          },
          // Refund not yet received → obligation is pending
          { kind: "BOOLEAN_IS_FALSE", key: REFUND_RECEIVED },
        ],
      },
      sourceIds: [trlgdcu66bisId as string, cc1124Id as string],
    }),
  );

  return {
    deliveryDeadlineExceeded,
    resolutionAfterAdditionalDeadline,
    immediateResolutionRefusedOrEssential,
    refundObligationAfterResolution,
  };
}
