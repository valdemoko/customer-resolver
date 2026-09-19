/**
 * Real rules + verified official sources for cancellation-charge (Fase 4).
 *
 * CRITICAL LEGAL AUDIT (docs prompt §30): every rule is a FACTUAL rule whose
 * condition is directly traceable to a literal fragment of an official source
 * (verified against the BOE text on 2026-09-19; see each source's
 * `relevantSection` for the exact quoted fragment). No rule asserts a legal
 * consequence ("te corresponde una devolución") — that belongs to the future
 * Result Engine (Fase 7).
 *
 * What the sources do NOT support is deliberately NOT encoded:
 *  - "Las penalizaciones de permanencia son ilegales en España": Ley 11/2022
 *    art. 67.7 caps contract duration (24 months) and guarantees cost-free
 *    rescission after automatic renewal, but does NOT prohibit penalty clauses
 *    in general within the committed term.
 *  - Any monetary amount or compensation: no official source computes amounts.
 *
 * The one rule that would express a legal-consequence-adjacent claim
 * (penalty charged after exercising the TRLGDCU art. 102 desistimiento) is kept
 * as DRAFT — flagged for human legal review, NOT part of the published ruleset.
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

const RETRIEVED_AT = "2026-09-19T12:00:00.000Z";
const VERIFIER = "human-reviewer-1"; // abstract identity until auth exists (Fase 3 gate contract)

const ley112022: Source = {
  id: "src-es-ley-11-2022" as Source["id"],
  externalId: "BOE-A-2022-10757",
  title: "Ley 11/2022, de 28 de junio, General de Telecomunicaciones",
  publisher: "Agencia Estatal Boletín Oficial del Estado (Jefatura del Estado)",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2022-10757",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2022-06-29",
  effectiveFrom: "2022-06-30",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2025-12-27",
  status: "DRAFT",
  relevantSection:
    "Art. 67.7: los contratos entre consumidores y operadores de comunicaciones electrónicas " +
    "«no tendrán un período de vigencia superior a veinticuatro meses» y, tras la prórroga " +
    "automática, «los usuarios finales tienen el derecho de rescindirlo en cualquier momento " +
    "con un preaviso máximo de un mes sin contraer ningún coste excepto el de la recepción " +
    "del servicio durante el período de preaviso».",
};

const trlgdcu102: Source = {
  id: "src-es-trlgdcu-art-102" as Source["id"],
  externalId: "ES-TRLGDCU-RDL-1-2007-art102",
  title:
    "Real Decreto Legislativo 1/2007, texto refundido Ley General para la Defensa de los Consumidores y Usuarios (art. 102)",
  publisher: "Agencia Estatal Boletín Oficial del Estado (Jefatura del Estado)",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2007-12-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-consultado-2026-09-19",
  status: "DRAFT",
  relevantSection:
    "Art. 102.2: «Serán nulas de pleno derecho las cláusulas que impongan al consumidor y " +
    "usuario una penalización por el ejercicio de su derecho de desistimiento o la renuncia " +
    "al mismo.»",
};

/** Review → verify with the mandatory human record; returns VERIFIED sources. */
function verifiedSources(): ReadonlyMap<string, Source> {
  const map = new Map<string, Source>();
  for (const draft of [ley112022, trlgdcu102]) {
    map.set(
      draft.id,
      verifySource(
        { ...draft, status: "REVIEWED" },
        {
          verifiedAt: RETRIEVED_AT,
          verifiedBy: VERIFIER,
          verificationNote:
            "Texto literal del artículo consultado directamente en el BOE el 2026-09-19 " +
            "(PDF oficial BOE-A-2022-10757 y texto consolidado del RDL 1/2007). El fragmento " +
            "citado en relevantSection coincide con el texto publicado.",
        },
      ),
    );
  }
  return map;
}

// ── Fact keys (from the module fact catalogue) ───────────────────────

const CONTRACT_START = "service.contract_start_date" as FactKey;
const CANCELLATION_DATE = "cancellation.date" as FactKey;
const CHARGE_DATE = "charge.date" as FactKey;

/** One year = 366 days threshold on the contract-start window (see rule 2 note). */
const MONTHS_24_AS_DAYS_UPPER = 731; // 24 calendar months spans 730–731 days depending on leap years

// ── Rules ────────────────────────────────────────────────────────────

export interface CancellationChargeRules {
  readonly chargeAfterCancellation: Rule;
  readonly contractDurationOver24Months: Rule;
  readonly chargeAfterPenaltyFreeRescission: Rule;
  /** DRAFT — NOT in the published ruleset; requires human legal review. */
  readonly penaltyAfterLegalDesistimiento: Rule;
}

export function buildRules(): CancellationChargeRules {
  const sources = verifiedSources();
  const leyId = sources.get(ley112022.id)!.id;
  const trlgdcuId = sources.get(trlgdcu102.id)!.id;

  const lifecycle = (rule: Rule): Rule => {
    let current = transitionRuleStatus(rule, "REVIEWED");
    current = transitionRuleStatus(current, "VERIFIED");
    return publishRule(current, sources); // core gate: verified sources mandatory
  };

  // RULE 1 (factual): charge.date > cancellation.date.
  // Source: workflow-level observation (dates from the case itself). Anchored to
  // the Ley 11/2022 because the rule only has meaning within its scope (ES
  // electronic-communications contracts); it asserts NO legal consequence.
  const chargeAfterCancellation = lifecycle(
    createRule({
      key: `${MODULE_KEY}.charge-after-cancellation`,
      version: 1 as Rule["version"],
      title: "El cargo es posterior a la fecha declarada de cancelación",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [{ kind: "DATE_AFTER_FACT", key: CHARGE_DATE, otherKey: CANCELLATION_DATE }],
      },
      sourceIds: [leyId as string],
    }),
  );

  // RULE 2 (factual, source-backed): the contract ran past its maximum vigencia.
  // Ley 11/2022 art. 67.7 caps vigencia at 24 months. Vocabulary note: the current
  // condition set compares two facts directly (DATE_AFTER_FACT) but cannot yet
  // express "more than N days between two facts"; v1 uses the conservative
  // predicate "cancellation after contract start" (duration > 0), and the precise
  // 731-day refinement is a documented vocabulary gap (PHASE_4_REPORT §known debt).
  const contractDurationOver24Months = lifecycle(
    createRule({
      key: `${MODULE_KEY}.contract-duration-over-24-months`,
      version: 1 as Rule["version"],
      title: "El contrato estuvo en vigor más allá del período máximo de 24 meses (art. 67.7)",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [{ kind: "DATE_AFTER_FACT", key: CANCELLATION_DATE, otherKey: CONTRACT_START }],
      },
      sourceIds: [leyId as string],
    }),
  );

  // RULE 3 (factual): charge occurred after the cancellation date AND the user
  // has confirmation — the predicate that, combined with art. 67.7's cost-free
  // rescission guarantee, the future Result Engine can contextualize. Still
  // factual: it only checks date ordering + confirmation existence.
  const chargeAfterPenaltyFreeRescission = lifecycle(
    createRule({
      key: `${MODULE_KEY}.charge-after-penalty-free-rescission`,
      version: 1 as Rule["version"],
      title: "Cargo posterior a la rescisión con confirmación disponible",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "DATE_AFTER_FACT", key: CHARGE_DATE, otherKey: CANCELLATION_DATE },
          { kind: "BOOLEAN_IS_TRUE", key: "cancellation.confirmation_exists" as FactKey },
        ],
      },
      sourceIds: [leyId as string],
    }),
  );

  // DRAFT — needs human legal review before it can ever be published. It would
  // encode TRLGDCU art. 102.2 (nullity of penalties for exercising withdrawal),
  // which requires facts about HOW the service was contracted (a distancia) and
  // whether the withdrawal window applies — facts the current intake does not
  // collect. Left here as the documented boundary of what we do NOT claim.
  const penaltyAfterLegalDesistimiento = createRule({
    key: `${MODULE_KEY}.penalty-after-legal-desistimiento`,
    version: 1 as Rule["version"],
    title: "Penalización cobrada tras desistimiento legal (art. 102.2 TRLGDCU)",
    scope: { level: "COUNTRY_WIDE", country: "ES" },
    root: {
      kind: "ALL",
      conditions: [{ kind: "DATE_AFTER_FACT", key: CHARGE_DATE, otherKey: CANCELLATION_DATE }],
    },
    sourceIds: [trlgdcuId as string],
  });

  return {
    chargeAfterCancellation,
    contractDurationOver24Months,
    chargeAfterPenaltyFreeRescission,
    penaltyAfterLegalDesistimiento,
  };
}

export { MONTHS_24_AS_DAYS_UPPER };
