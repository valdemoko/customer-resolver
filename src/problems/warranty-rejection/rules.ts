/**
 * Real rules + verified official sources for warranty-rejection
 * (Fase 8.2 — Legal Specification, APPROVED FOR IMPLEMENTATION).
 *
 * LEGAL BASIS FOR EACH RULE:
 *
 * Rule 1 (seller-rejected-within-period):
 *   Art. 120.1 TRLGDCU — 3-year responsibility period.
 *   Factual: seller rejected within the statutory period.
 *   NOT: rejection = illegality.
 *
 * Rule 2 (presumption-applies):
 *   Art. 121.1 TRLGDCU — 2-year rebuttable presumption.
 *   Factual: product is within the presumption period.
 *   NOT: defect is proven.
 *
 * Rule 3 (no-remedy-offered):
 *   Arts. 117.1, 118.1 TRLGDCU — seller's obligation to remedy.
 *   Factual: seller rejected without offering repair or replacement.
 *   NOT: seller violated the law (may have legitimate grounds).
 *
 * Rule 4 (repair-failed-or-defect-recurred):
 *   Art. 119.d, 122.3 TRLGDCU — recurrence after conformity attempt.
 *   Factual: repair was attempted and failed/recurred.
 *   NOT: automatic right to resolution (minor importance exception).
 *
 * Rule 5 (seller-claims-expired):
 *   Art. 120.1 TRLGDCU — seller's claim of expired warranty.
 *   Factual: seller has made this claim.
 *   NOT: the claim is correct (depends on actual dates).
 *
 * Rule 6 (seller-declares-wont-repair):
 *   Art. 119.f TRLGDCU — seller declared won't put into conformity.
 *   Factual: seller has made this declaration.
 *   NOT: automatic resolution (minor importance exception).
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
 * TRLGDCU Art. 117 — Responsabilidad del empresario y derechos del
 * consumidor en caso de falta de conformidad.
 * BOE-A-2007-20555, modificado por RDL 7/2021, vigente desde 01/01/2022.
 */
const trlgdcu117: Source = {
  id: "src-es-trlgdcu-art-117" as Source["id"],
  externalId: "BOE-A-2007-20555-art117",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 117) — Responsabilidad del empresario",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 117.1: «El empresario responderá ante el consumidor o usuario de " +
    "cualquier falta de conformidad que exista en el momento de la entrega del bien, " +
    "contenido o servicio digital, pudiendo el consumidor o usuario, mediante una " +
    "simple declaración, exigir al empresario la subsanación de dicha falta de " +
    "conformidad, la reducción del precio o la resolución del contrato.»",
};

/**
 * TRLGDCU Art. 118 — Régimen jurídico de la puesta en conformidad.
 * Regulates repair and replacement as primary remedies.
 */
const trlgdcu118: Source = {
  id: "src-es-trlgdcu-art-118" as Source["id"],
  externalId: "BOE-A-2007-20555-art118",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 118) — Puesta en conformidad",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 118.1: «Si el bien no fuera conforme con el contrato, para ponerlo " +
    "en conformidad, el consumidor o usuario tendrá derecho a elegir entre la " +
    "reparación o la sustitución, salvo que una de estas dos opciones resultare " +
    "imposible o que, en comparación con la otra medida correctora, suponga " +
    "costes desproporcionados para el empresario.» " +
    "Art. 118.3: «El empresario podrá negarse a poner los bienes o los contenidos " +
    "o servicios digitales en conformidad cuando resulte imposible o suponga costes " +
    "desproporcionados.»",
};

/**
 * TRLGDCU Art. 119 — Reducción del precio y resolución del contrato.
 * Secondary remedies when primary remedies fail or are refused.
 */
const trlgdcu119: Source = {
  id: "src-es-trlgdcu-art-119" as Source["id"],
  externalId: "BOE-A-2007-20555-art119",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 119) — Reducción del precio y resolución",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 119: «El consumidor o usuario podrá exigir una reducción proporcionada " +
    "del precio o la resolución del contrato, en cualquiera de los siguientes " +
    "supuestos: a) En relación con bienes [...], cuando la medida correctora " +
    "consistente en ponerlos en conformidad resulte imposible o desproporcionada [...]. " +
    "d) Aparezca cualquier falta de conformidad después del intento del empresario " +
    "de poner los bienes [...] en conformidad. [...] f) El empresario haya declarado, " +
    "o así se desprenda claramente de las circunstancias, que no pondrá los bienes [...] " +
    "en conformidad en un plazo razonable o sin mayores inconvenientes para el consumidor.» " +
    "«La resolución no procederá cuando la falta de conformidad sea de escasa importancia.»",
};

/**
 * TRLGDCU Art. 120 — Plazo para la manifestación de la falta de conformidad.
 * 3 years for goods, 2 years for digital content.
 */
const trlgdcu120: Source = {
  id: "src-es-trlgdcu-art-120" as Source["id"],
  externalId: "BOE-A-2007-20555-art120",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 120) — Plazos de responsabilidad",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 120.1: «El empresario será responsable de las faltas de conformidad " +
    "que existan en el momento de la entrega o del suministro y se manifiesten " +
    "en un plazo de tres años desde la entrega en el caso de bienes [...] " +
    "En los bienes de segunda mano, el empresario y el consumidor o usuario " +
    "podrán pactar un plazo menor [...] que no podrá ser inferior a un año " +
    "desde la entrega.»",
};

/**
 * TRLGDCU Art. 121 — Carga de la prueba.
 * 2-year rebuttable presumption.
 */
const trlgdcu121: Source = {
  id: "src-es-trlgdcu-art-121" as Source["id"],
  externalId: "BOE-A-2007-20555-art121",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 121) — Carga de la prueba",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 121.1: «Salvo prueba en contrario, se presumirá que las faltas de " +
    "conformidad que se manifiesten en los dos años siguientes a la entrega " +
    "del bien [...] ya existían cuando el bien se entregó, excepto cuando " +
    "para los bienes esta presunción sea incompatible con su naturaleza o la " +
    "índole de la falta de conformidad.»",
};

/**
 * TRLGDCU Art. 122 — Suspensión del cómputo de plazos.
 * Clock pauses during repair; 1-year post-repair presumption.
 */
const trlgdcu122: Source = {
  id: "src-es-trlgdcu-art-122" as Source["id"],
  externalId: "BOE-A-2007-20555-art122",
  title: "Real Decreto Legislativo 1/2007, TRLGDCU (art. 122) — Suspensión de plazos",
  publisher: "Agencia Estatal Boletín Oficial del Estado",
  url: "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555",
  jurisdiction: { country: "ES" },
  type: "LAW",
  publishedOn: "2007-11-30",
  effectiveFrom: "2022-01-01",
  retrievedAt: RETRIEVED_AT,
  versionIdentifier: "consolidado-2026-02-28",
  status: "DRAFT",
  relevantSection:
    "Art. 122.3: «Durante el año posterior a la entrega del bien [...] ya " +
    "conforme, el empresario responderá de las faltas de conformidad que " +
    "motivaron la puesta en conformidad, presumiéndose que se trata de la " +
    "misma falta de conformidad cuando se reproduzcan los defectos del mismo " +
    "origen que los inicialmente manifestados.»",
};

// ── Fact keys ────────────────────────────────────────────────────────

const SELLER_REJECTION = "seller.rejection" as FactKey;
const OFFERED_REPAIR = "seller.offered_repair" as FactKey;
const OFFERED_REPLACEMENT = "seller.offered_replacement" as FactKey;
const REPAIR_COMPLETED = "repair.completed" as FactKey;
const REPAIR_FAILED = "repair.failed" as FactKey;
const REPAIR_DEFECT_RECURRED = "repair.defect_recurred" as FactKey;
const CLAIMED_WARRANTY_EXPIRED = "seller.claimed_warranty_expired" as FactKey;
const DECLARED_WONT_REPAIR = "seller.declared_wont_repair" as FactKey;
const COMPLIANCE_RESPONSIBILITY_DEADLINE = "compliance.responsibility_deadline" as FactKey;
const COMPLIANCE_PRESUMPTION_DEADLINE = "compliance.presumption_deadline" as FactKey;

// ── Source verification helper ───────────────────────────────────────

function verifiedSources(): ReadonlyMap<string, Source> {
  const map = new Map<string, Source>();
  const sources = [trlgdcu117, trlgdcu118, trlgdcu119, trlgdcu120, trlgdcu121, trlgdcu122];
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

// ── Rules ────────────────────────────────────────────────────────────

export interface WarrantyRejectionRules {
  /** Seller rejected within the 3-year responsibility period. */
  readonly sellerRejectedWithinPeriod: Rule;
  /** 2-year rebuttable presumption applies. */
  readonly presumptionApplies: Rule;
  /** Seller rejected without offering any remedy. */
  readonly noRemedyOffered: Rule;
  /** Repair attempted but failed or defect recurred. */
  readonly repairFailedOrDefectRecurred: Rule;
  /** Seller claimed warranty has expired. */
  readonly sellerClaimsExpired: Rule;
  /** Seller declared they will not repair. */
  readonly sellerDeclaresWontRepair: Rule;
}

/**
 * Verified official sources backing this module's rules.
 *
 * Exported so the server layer can publish the source set into the database:
 * a claim may only cite a source whose identity, version and human verification
 * metadata actually exist in the `sources` table.
 */
export function buildSources(): readonly Source[] {
  return [...verifiedSources().values()];
}

export function buildRules(): WarrantyRejectionRules {
  const sources = verifiedSources();
  const src120 = sources.get(trlgdcu120.id)!.id;
  const src121 = sources.get(trlgdcu121.id)!.id;
  const src117 = sources.get(trlgdcu117.id)!.id;
  const src118 = sources.get(trlgdcu118.id)!.id;
  const src119 = sources.get(trlgdcu119.id)!.id;
  const src122 = sources.get(trlgdcu122.id)!.id;

  const lifecycle = (rule: Rule): Rule => {
    let current = transitionRuleStatus(rule, "REVIEWED");
    current = transitionRuleStatus(current, "VERIFIED");
    return publishRule(current, sources);
  };

  // ────────────────────────────────────────────────────────────────
  // RULE 1: seller-rejected-within-period
  //
  // Legal question: Did the seller reject while the product was still
  // within the 3-year statutory responsibility period?
  //
  // Uses derived fact compliance.responsibility_deadline (computed from
  // purchase.delivery_date + 36 months, or agreed period for used goods).
  //
  // Condition: seller.rejection = true AND deadline has NOT passed.
  //
  // Permitted: "The seller rejected within the warranty period."
  // NOT permitted: "The rejection was illegal."
  //
  // Source: Art. 120.1 TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const sellerRejectedWithinPeriod = lifecycle(
    createRule({
      key: `${MODULE_KEY}.seller-rejected-within-period`,
      version: 1 as Rule["version"],
      title: "El rechazo del vendedor se produjo dentro del plazo legal de responsabilidad",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          // compliance.responsibility_deadline must exist first (FACT_EXISTS
          // ensures INSUFFICIENT_DATA when missing, preventing NOT from
          // inverting MISSING_FACT into true).
          { kind: "FACT_EXISTS", key: COMPLIANCE_RESPONSIBILITY_DEADLINE },
          // Deadline is NOT before today → deadline is today or after →
          // we are within the period.
          {
            kind: "NOT",
            condition: {
              kind: "DATE_BEFORE",
              key: COMPLIANCE_RESPONSIBILITY_DEADLINE,
            },
          },
        ],
      },
      sourceIds: [src120 as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 2: presumption-applies
  //
  // Legal question: Is the product within the first 2 years from delivery?
  // If so, the 2-year rebuttable presumption applies (Art. 121.1).
  //
  // Uses derived fact compliance.presumption_deadline.
  //
  // Permitted: "The presumption applies — seller must prove otherwise."
  // NOT permitted: "The defect is proven."
  //
  // Source: Art. 121.1 TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const presumptionApplies = lifecycle(
    createRule({
      key: `${MODULE_KEY}.presumption-applies`,
      version: 1 as Rule["version"],
      title: "Se aplica la presunción de falta de conformidad preexistente (2 años)",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          { kind: "FACT_EXISTS", key: COMPLIANCE_PRESUMPTION_DEADLINE },
          {
            kind: "NOT",
            condition: {
              kind: "DATE_BEFORE",
              key: COMPLIANCE_PRESUMPTION_DEADLINE,
            },
          },
        ],
      },
      sourceIds: [src121 as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 3: no-remedy-offered
  //
  // Legal question: Did the seller reject without offering ANY remedy
  // (neither repair nor replacement)?
  //
  // Permitted: "The seller rejected without offering repair or replacement."
  // NOT permitted: "The seller violated the law."
  //
  // Source: Arts. 117.1, 118.1 TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const noRemedyOffered = lifecycle(
    createRule({
      key: `${MODULE_KEY}.no-remedy-offered`,
      version: 1 as Rule["version"],
      title: "El vendedor rechazó sin ofrecer reparación ni sustitución",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          { kind: "BOOLEAN_IS_FALSE", key: OFFERED_REPAIR },
          { kind: "BOOLEAN_IS_FALSE", key: OFFERED_REPLACEMENT },
        ],
      },
      sourceIds: [src117 as string, src118 as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 4: repair-failed-or-defect-recurred
  //
  // Legal question: Was repair attempted and either failed or the same
  // defect recurred?
  //
  // Art. 119.d: defect appearing after seller's conformity attempt.
  // Art. 122.3: 1-year post-repair presumption for same-origin defects.
  //
  // Permitted: "Price reduction or resolution MAY be available."
  // NOT permitted: "You have the right to resolution."
  // (minor importance exception applies — Art. 119 final clause).
  //
  // Source: Art. 119.d, 122.3 TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const repairFailedOrDefectRecurred = lifecycle(
    createRule({
      key: `${MODULE_KEY}.repair-failed-or-defect-recurred`,
      version: 1 as Rule["version"],
      title: "La reparación falló o el mismo defecto reapareció",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          { kind: "BOOLEAN_IS_TRUE", key: REPAIR_COMPLETED },
          {
            kind: "ANY",
            conditions: [
              { kind: "BOOLEAN_IS_TRUE", key: REPAIR_FAILED },
              { kind: "BOOLEAN_IS_TRUE", key: REPAIR_DEFECT_RECURRED },
            ],
          },
        ],
      },
      sourceIds: [src119 as string, src122 as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 5: seller-claims-expired
  //
  // Legal question: Has the seller specifically claimed the warranty
  // period has expired?
  //
  // This is a factual assertion by the seller. The system identifies
  // the claim but does NOT validate it — that depends on the dates
  // (Rules 1 and 2).
  //
  // Source: Art. 120.1 TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const sellerClaimsExpired = lifecycle(
    createRule({
      key: `${MODULE_KEY}.seller-claims-expired`,
      version: 1 as Rule["version"],
      title: "El vendedor alega que la garantía ha expirado",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          { kind: "BOOLEAN_IS_TRUE", key: CLAIMED_WARRANTY_EXPIRED },
        ],
      },
      sourceIds: [src120 as string],
    }),
  );

  // ────────────────────────────────────────────────────────────────
  // RULE 6: seller-declares-wont-repair
  //
  // Legal question: Has the seller declared they will not put the goods
  // into conformity?
  //
  // Art. 119.f: this may entitle the consumer to price reduction or
  // resolution. But the system does NOT conclude that resolution is
  // appropriate — minor importance exception applies.
  //
  // Source: Art. 119.f TRLGDCU.
  // ────────────────────────────────────────────────────────────────
  const sellerDeclaresWontRepair = lifecycle(
    createRule({
      key: `${MODULE_KEY}.seller-declares-wont-repair`,
      version: 1 as Rule["version"],
      title: "El vendedor declara que no pondrá el bien en conformidad",
      scope: { level: "COUNTRY_WIDE", country: "ES" },
      root: {
        kind: "ALL",
        conditions: [
          { kind: "BOOLEAN_IS_TRUE", key: SELLER_REJECTION },
          { kind: "BOOLEAN_IS_TRUE", key: DECLARED_WONT_REPAIR },
        ],
      },
      sourceIds: [src119 as string],
    }),
  );

  return {
    sellerRejectedWithinPeriod,
    presumptionApplies,
    noRemedyOffered,
    repairFailedOrDefectRecurred,
    sellerClaimsExpired,
    sellerDeclaresWontRepair,
  };
}
