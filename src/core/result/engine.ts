/**
 * Result Engine (Fase 7).
 *
 * Converts raw rule evaluations + facts + sources into a structured Result.
 * This is a PURE function — no I/O, no time reads, no AI.
 *
 * The engine NEVER invents facts, NEVER fabricates sources, and NEVER
 * overstates certainty. Every claim must be traceable to a rule evaluation.
 */
import type { Fact } from "../types";
import type { RuleEvaluation } from "../rules/types";
import { DERIVED_FACT_SOURCES, resolveAnswerableFactKey } from "../problems/requirements";
import { channelsForProblem } from "./channels";
import type {
  Claim,
  ClaimStatus,
  MissingInformation,
  Result,
  ResultContradiction,
  SupportingFact,
  SupportingSource,
} from "./types";

// ── Claim Assertion Templates ───────────────────────────────────────

/**
 * Map rule keys to human-readable assertion templates.
 * These are DECLARATIVE DATA, not legal conclusions.
 */
const ASSERTION_TEMPLATES: Readonly<
  Record<string, (status: ClaimStatus) => { assertion: string; explanation: string }>
> = {
  "cancellation-charge.charge-after-cancellation": (status) => ({
    assertion: "El cargo se produjo después de la fecha de cancelación",
    explanation:
      status === "SUPPORTED"
        ? "Con la información disponible, el cargo se registró después de que usted solicitó la cancelación del servicio."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Los datos indican que el cargo pudo haberse producido después de la cancelación, pero falta confirmación de alguna fecha."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos suficiente información para determinar si el cargo se produjo después de la cancelación. Necesitamos confirmar las fechas involucradas."
            : status === "CONTRADICTED"
              ? "La información disponible es contradictoria respecto a las fechas del cargo y la cancelación."
              : "Esta regla no resulta aplicable a su caso.",
  }),
  "cancellation-charge.charge-after-confirmed-cancellation": (status) => ({
    assertion: "El cargo se produjo después de una cancelación confirmada",
    explanation:
      status === "SUPPORTED"
        ? "Existe confirmación de la cancelación y el cargo se registró posteriormente."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Los datos sugieren una cancelación confirmada con cargo posterior, pero falta documentación de la confirmación."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos confirmar que exista una confirmación de cancelación. Esto bloquea esta evaluación."
            : status === "CONTRADICTED"
              ? "La información sobre la confirmación de cancelación es contradictoria."
              : "Esta evaluación no resulta aplicable.",
  }),
  "cancellation-charge.contract-duration-exceeds-24-months": (status) => ({
    assertion: "El contrato tiene una duración superior a 24 meses",
    explanation:
      status === "SUPPORTED"
        ? "El contrato tiene una duración que excede los 24 meses."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Los datos sugieren una duración superior a 24 meses, pero falta confirmación exacta."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos la fecha de inicio del contrato para calcular su duración."
            : status === "CONTRADICTED"
              ? "La información sobre la duración del contrato es contradictoria."
              : "Esta regla no resulta aplicable.",
  }),

  // ── warranty-rejection (Fase 8.2) ──────────────────────────────
  "warranty-rejection.seller-rejected-within-period": (status) => ({
    assertion: "El rechazo del vendedor se produjo dentro del plazo legal de responsabilidad",
    explanation:
      status === "SUPPORTED"
        ? "El vendedor rechazó la reclamación mientras el producto estaba dentro del plazo de responsabilidad de 3 años (Art. 120.1 TRLGDCU)."
        : status === "POTENTIALLY_APPLICABLE"
          ? "El rechazo parece estar dentro del plazo de responsabilidad, pero necesitamos confirmar la fecha de entrega."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos determinar si el rechazo está dentro del plazo sin conocer la fecha de entrega del producto."
            : status === "CONTRADICTED"
              ? "La información sobre la fecha de entrega es contradictoria. Verifique la fecha correcta."
              : "El plazo legal de responsabilidad de 3 años ha expirado.",
  }),
  "warranty-rejection.presumption-applies": (status) => ({
    assertion: "Se aplica la presunción de falta de conformidad preexistente (2 años)",
    explanation:
      status === "SUPPORTED"
        ? "El producto está dentro de los primeros 2 años desde la entrega. La ley presume que la falta de conformidad ya existía en el momento de entrega (Art. 121.1 TRLGDCU). El vendedor debe demostrar lo contrario."
        : status === "POTENTIALLY_APPLICABLE"
          ? "El producto podría estar dentro del período de presunción de 2 años, pero necesitamos confirmar la fecha de entrega."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos determinar si la presunción de 2 años aplica sin conocer la fecha de entrega."
            : status === "CONTRADICTED"
              ? "La información sobre la fecha de entrega es contradictoria."
              : "Han pasado más de 2 años desde la entrega. El consumidor debe demostrar que la falta de conformidad existía en el momento de la entrega.",
  }),
  "warranty-rejection.no-remedy-offered": (status) => ({
    assertion: "El vendedor rechazó sin ofrecer reparación ni sustitución",
    explanation:
      status === "SUPPORTED"
        ? "El vendedor rechazó la reclamación sin ofrecer reparación ni sustitución del producto. Según los arts. 117 y 118 TRLGDCU, cuando existe una falta de conformidad, el vendedor debe remediarla mediante reparación o sustitución."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que el vendedor no ofreció ninguna medida correctora, pero necesitamos confirmar los detalles de su respuesta."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información suficiente sobre si el vendedor ofreció alguna medida correctora."
            : status === "CONTRADICTED"
              ? "La información sobre la respuesta del vendedor es contradictoria."
              : "El vendedor ha ofrecido al menos una medida correctora (reparación o sustitución).",
  }),
  "warranty-rejection.repair-failed-or-defect-recurred": (status) => ({
    assertion: "La reparación falló o el mismo defecto reapareció",
    explanation:
      status === "SUPPORTED"
        ? "La reparación fue intentada pero [falló / el mismo defecto reapareció]. Bajo el art. 119 TRLGDCU, el consumidor podría solicitar una reducción proporcional del precio o la resolución del contrato, siempre que la falta de conformidad no sea de escasa importancia."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que la reparación falló o el defecto reapareció, pero necesitamos confirmar el historial de reparación."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información suficiente sobre el historial de reparación."
            : status === "CONTRADICTED"
              ? "La información sobre el historial de reparación es contradictoria."
              : "No hay evidencia de una reparación fallida o un defecto recurrente.",
  }),
  "warranty-rejection.seller-claims-expired": (status) => ({
    assertion: "El vendedor alega que la garantía ha expirado",
    explanation:
      status === "SUPPORTED"
        ? "El vendedor ha afirmado que el plazo de garantía ha expirado. Esta afirmación puede verificarse contra la fecha de entrega y los plazos legales (arts. 120-121 TRLGDCU)."
        : status === "POTENTIALLY_APPLICABLE"
          ? "El vendedor parece haber alegado expiración, pero necesitamos confirmar los detalles."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información sobre la posición del vendedor."
            : status === "CONTRADICTED"
              ? "La posición del vendedor es contradictoria."
              : "El vendedor no ha alegado que la garantía haya expirado.",
  }),
  "warranty-rejection.seller-declares-wont-repair": (status) => ({
    assertion: "El vendedor declara que no pondrá el bien en conformidad",
    explanation:
      status === "SUPPORTED"
        ? "El vendedor ha declarado que no va a reparar el producto. Según el art. 119.f TRLGDCU, esto podría facultar al consumidor para solicitar una reducción del precio o la resolución del contrato."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que el vendedor ha declarado que no reparará, pero necesitamos confirmar los detalles."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información sobre la posición del vendedor."
            : status === "CONTRADICTED"
              ? "La posición del vendedor es contradictoria."
              : "El vendedor no ha declarado que se niega a reparar.",
  }),

  // ── flight-cancel (Fase 8.4) ──────────────────────────────────
  "flight-cancel.flight-was-cancelled": (status) => ({
    assertion: "El vuelo fue cancelado por la aerolínea",
    explanation:
      status === "SUPPORTED"
        ? "La aerolínea canceló el vuelo. Esto activa las obligaciones del Reglamento 261/2004."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que el vuelo fue cancelado, pero necesitamos confirmar la fecha y aeropuertos."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos suficiente información para confirmar que el vuelo fue cancelado."
            : status === "CONTRADICTED"
              ? "La información sobre la cancelación es contradictoria."
              : "No se ha confirmado que el vuelo haya sido cancelado.",
  }),
  "flight-cancel.notice-period-insufficient": (status) => ({
    assertion: "El plazo de aviso fue inferior a 14 días antes de la salida",
    explanation:
      status === "SUPPORTED"
        ? "La aerolínea canceló el vuelo con menos de 14 días de antelación. Esto es una condición necesaria para tener derecho a compensación según el art. 5.1.c del Reglamento 261/2004, pero no es suficiente por sí sola: la aerolínea podría estar exenta si ofreció transporte alternativo que cumple ciertos umbrales de llegada."
        : status === "POTENTIALLY_APPLICABLE"
          ? "El plazo de aviso parece ser inferior a 14 días, pero necesitamos confirmar las fechas exactas."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos calcular el plazo de aviso sin conocer las fechas de cancelación y salida."
            : status === "CONTRADICTED"
              ? "La información sobre las fechas es contradictoria."
              : "El aviso fue con 14 o más días de antelación, lo que exime de compensación según el art. 5.1.c(i).",
  }),
  "flight-cancel.compensation-due-no-extraordinary": (status) => ({
    assertion: "No se alegaron circunstancias extraordinarias",
    explanation:
      status === "SUPPORTED"
        ? "La aerolínea no ha alegado circunstancias extraordinarias (clima, seguridad, huelga). Según el art. 5.3 del Reglamento 261/2004, la carga de la prueba recae sobre la aerolínea."
        : status === "POTENTIALLY_APPLICABLE"
          ? "No hay constancia de que la aerolínea haya alegado circunstancias extraordinarias."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información sobre la razón de la cancelación."
            : status === "CONTRADICTED"
              ? "La información sobre la razón de la cancelación es contradictoria."
              : "La aerolínea ha alegado circunstancias extraordinarias que podrían eximir de compensación.",
  }),
  "flight-cancel.reimbursement-entitlement": (status) => ({
    assertion: "Existe derecho a reembolso del billete por cancelación del vuelo",
    explanation:
      status === "SUPPORTED"
        ? "El vuelo fue cancelado y usted aún no ha recibido el reembolso. Según el art. 8.1.a del Reglamento 261/2004, tiene derecho al reembolso íntegro del billete."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que existe derecho a reembolso, pero necesitamos confirmar si ya lo recibió."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos determinar el estado del reembolso."
            : status === "CONTRADICTED"
              ? "La información sobre el reembolso es contradictoria."
              : "El reembolso ya ha sido procesado o no aplica.",
  }),
  "flight-cancel.assistance-not-offered": (status) => ({
    assertion: "La aerolínea no ofreció la asistencia obligatoria",
    explanation:
      status === "SUPPORTED"
        ? "Con los datos confirmados, la aerolínea no ofreció asistencia (comidas, llamadas, alojamiento). Según el art. 9.1 del Reglamento 261/2004, esta asistencia debería haber sido ofrecida de forma gratuita."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que la aerolínea no ofreció asistencia, pero necesitamos confirmar los detalles."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información sobre si la aerolínea ofreció asistencia."
            : status === "CONTRADICTED"
              ? "La información sobre la asistencia es contradictoria."
              : "La aerolínea sí ofreció asistencia.",
  }),
  "flight-cancel.additional-costs-claim": (status) => ({
    assertion: "El pasajero incurrió en gastos adicionales por la cancelación",
    explanation:
      status === "SUPPORTED"
        ? "El pasajero tuvo gastos adicionales derivados de la cancelación del vuelo. Según el art. 8.3 del Reglamento 261/2004, cuando la aerolínea no proporciona alojamiento o transporte, el pasajero puede reclamar el reembolso de gastos razonables."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Parece que hubo gastos adicionales, pero necesitamos confirmar el importe."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información sobre gastos adicionales."
            : status === "CONTRADICTED"
              ? "La información sobre los gastos adicionales es contradictoria."
              : "No se han identificado gastos adicionales.",
  }),
  // ── flight-cancel new rules (Fase 8.4 audit) ──────────────
  "flight-cancel.compensation-exemption-alternative-transport": (status) => ({
    assertion:
      "La aerolínea está exenta de compensación por ofrecer transporte alternativo conforme",
    explanation:
      status === "SUPPORTED"
        ? "La aerolínea ofreció transporte alternativo que cumple los umbrales del art. 5.1.c(ii)/(iii) del Reglamento 261/2004. Según esta disposición, la aerolínea está exenta de pagar compensación económica cuando el transporte alternativo llega dentro de los plazos establecidos."
        : status === "POTENTIALLY_APPLICABLE"
          ? "La aerolínea ofreció transporte alternativo, pero necesitamos confirmar si cumple los umbrales de llegada."
          : status === "INSUFFICIENT_DATA"
            ? "No tenemos información suficiente sobre el transporte alternativo para determinar si la aerolínea está exenta."
            : status === "CONTRADICTED"
              ? "La información sobre el transporte alternativo es contradictoria."
              : "La aerolínea no ofreció transporte alternativo que cumpla los umbrales del art. 5.1.c, o no ofreció transporte alternativo.",
  }),
  "flight-cancel.compensation-amount": (status) => ({
    assertion: "La cuantía base de compensación según distancia del vuelo",
    explanation:
      status === "SUPPORTED"
        ? "Según el art. 7.1 del Reglamento 261/2004, la compensación base se determina por la distancia del vuelo: 250€ (≤1500km), 400€ (>1500km intra-UE o 1500-3500km) o 600€ (>3500km). Esta es la cuantía ANTES de posibles reducciones del art. 7.2."
        : status === "POTENTIALLY_APPLICABLE"
          ? "La distancia del vuelo sugiere una cuantía de compensación base, pero necesitamos confirmar los datos."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos determinar la cuantía de compensación sin conocer la distancia del vuelo."
            : status === "CONTRADICTED"
              ? "La información sobre la distancia es contradictoria."
              : "No se ha determinado una cuantía de compensación base.",
  }),
  "flight-cancel.compensation-50-percent-reduction": (status) => ({
    assertion: "El pasajero es elegible para la reducción del 50% de la compensación (art. 7.2)",
    explanation:
      status === "SUPPORTED"
        ? "Según el art. 7.2 del Reglamento 261/2004, cuando el transporte alternativo aceptado llega dentro de ciertos umbrales (≤2h para vuelos ≤1500km, ≤3h para 1500-3500km, ≤4h para >3500km), la compensación puede reducirse un 50%. Esto es DISTINTO de la exención completa del art. 5.1.c."
        : status === "POTENTIALLY_APPLICABLE"
          ? "Los datos sugieren elegibilidad para reducción del 50%, pero necesitamos confirmar los plazos de llegada del vuelo alternativo."
          : status === "INSUFFICIENT_DATA"
            ? "No podemos determinar si procede la reducción del 50% sin conocer el retraso de llegada del vuelo alternativo."
            : status === "CONTRADICTED"
              ? "La información sobre el transporte alternativo es contradictoria."
              : "No procede reducción del 50% según los datos confirmados.",
  }),
};

// ── Status Priority (for overall status) ────────────────────────────

const STATUS_PRIORITY: Record<ClaimStatus, number> = {
  UNKNOWN: 0,
  NOT_APPLICABLE: 1,
  INSUFFICIENT_DATA: 2,
  CONTRADICTED: 3,
  POTENTIALLY_APPLICABLE: 4,
  SUPPORTED: 5,
};

function highestStatus(statuses: ClaimStatus[]): ClaimStatus {
  if (statuses.length === 0) return "UNKNOWN";
  let best: ClaimStatus = "UNKNOWN";
  for (const s of statuses) {
    if (STATUS_PRIORITY[s] > STATUS_PRIORITY[best]) best = s;
  }
  return best;
}

// ── Fact Lookup ─────────────────────────────────────────────────────

function buildFactLookup(facts: readonly Fact[]): Map<string, Fact> {
  const map = new Map<string, Fact>();
  for (const f of facts) {
    if (f.status !== "SUPERSEDED") {
      map.set(f.key as string, f);
    }
  }
  return map;
}

// ── Supporting Facts ────────────────────────────────────────────────

function buildSupportingFacts(
  _evaluation: RuleEvaluation,
  factMap: Map<string, Fact>,
): readonly SupportingFact[] {
  // Return all facts from the factMap — the evaluation context already
  // filtered to relevant facts (current, non-superseded).
  const supporting: SupportingFact[] = [];
  for (const fact of factMap.values()) {
    supporting.push({
      factKey: fact.key,
      value: fact.value,
      status: fact.status as "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED",
      confidence: fact.confidence,
      evidenceIds: fact.evidenceRefs.map((r) => r.evidenceId),
    });
  }

  return supporting;
}

// ── Missing Information ─────────────────────────────────────────────

function buildMissingInformation(
  evaluations: readonly RuleEvaluation[],
  questionMap: Map<string, { text: string; factKey: string; required: boolean }>,
): readonly MissingInformation[] {
  const missing = new Map<string, MissingInformation>();

  for (const evaluation of evaluations) {
    for (const factKey of evaluation.missingFacts) {
      const key = factKey as string;
      if (missing.has(key)) continue;

      const question = questionMap.get(key);
      missing.set(key, {
        factKey: factKey,
        questionId: question?.factKey === key ? undefined : question?.factKey,
        description: question?.text ?? `Dato requerido: ${key}`,
        impact: evaluation.status === "INSUFFICIENT_DATA" ? "required" : "recommended",
        blockedClaims: [evaluation.ruleKey],
      });
    }
  }

  return [...missing.values()];
}

// ── Contradictions ──────────────────────────────────────────────────

function buildContradictions(
  evaluations: readonly RuleEvaluation[],
  factMap: Map<string, Fact>,
): readonly ResultContradiction[] {
  const contradictions = new Map<string, ResultContradiction>();

  for (const evaluation of evaluations) {
    for (const factKey of evaluation.contradictedFacts) {
      const key = factKey as string;
      if (contradictions.has(key)) {
        const existing = contradictions.get(key)!;
        contradictions.set(key, {
          ...existing,
          affectedClaims: [...existing.affectedClaims, evaluation.ruleKey],
        });
        continue;
      }

      const fact = factMap.get(key);
      contradictions.set(key, {
        factKey: factKey,
        description: `Información contradictoria sobre: ${key}`,
        conflictingValues: fact ? [fact.value] : [],
        affectedClaims: [evaluation.ruleKey],
      });
    }
  }

  return [...contradictions.values()];
}

// ── Disclaimers ─────────────────────────────────────────────────────

function buildDisclaimers(overallStatus: ClaimStatus): readonly string[] {
  const disclaimers: string[] = [
    "Esta información no constituye asesoramiento legal.",
    "Los resultados se basan en la información proporcionada y las normativas vigentes.",
  ];

  if (overallStatus === "POTENTIALLY_APPLICABLE") {
    disclaimers.push("Algunas conclusiones son provisionales y requieren confirmación adicional.");
  }

  if (overallStatus === "INSUFFICIENT_DATA") {
    disclaimers.push("No es posible determinar una conclusión con la información disponible.");
  }

  return disclaimers;
}

// ── Main Engine ─────────────────────────────────────────────────────

export interface BuildResultInput {
  readonly caseId: string;
  readonly problemKey: string;
  readonly evaluatedAt: string;
  readonly engineVersion: string;
  readonly facts: readonly Fact[];
  readonly evaluations: readonly RuleEvaluation[];
  readonly sources: readonly SupportingSource[];
  /** Intake questions from the problem module (for missing info descriptions). */
  readonly questions?: readonly { id: string; text: string; factKey: string; required: boolean }[];
  /** Whether intake is complete. */
  readonly intakeComplete?: boolean;
}

/**
 * Build a Result from rule evaluations + facts + sources.
 * PURE: same inputs → same output, always.
 */
export function buildResult(input: BuildResultInput): Result {
  const {
    caseId,
    problemKey,
    evaluatedAt,
    engineVersion,
    facts,
    evaluations,
    sources,
    questions = [],
    intakeComplete = false,
  } = input;

  const factMap = buildFactLookup(facts);
  const questionMap = new Map(questions.map((q) => [q.factKey, q]));

  // Derived facts (deadlines, distances, compensation tiers) are never asked:
  // the system computes them. When a rule reports one as missing, point at the
  // question that supplies its inputs instead of showing a raw fact key.
  for (const derivedKey of Object.keys(DERIVED_FACT_SOURCES)) {
    if (questionMap.has(derivedKey)) continue;
    const question = questionMap.get(resolveAnswerableFactKey(derivedKey));
    if (question) questionMap.set(derivedKey, question);
  }

  // Build claims from evaluations
  const claims: Claim[] = evaluations.map((evaluation, index) => {
    const template = ASSERTION_TEMPLATES[evaluation.ruleKey];
    const { assertion, explanation } = template
      ? template(evaluation.status)
      : {
          assertion: `Evaluación: ${evaluation.ruleKey}`,
          explanation: `Resultado: ${evaluation.status}`,
        };

    const supportingFacts = buildSupportingFacts(evaluation, factMap);
    const supportingSources = sources.filter((s) => evaluation.sourceIds.includes(s.sourceId));

    return {
      id: `claim-${index}`,
      ruleKey: evaluation.ruleKey,
      ruleVersion: evaluation.ruleVersion,
      status: evaluation.status,
      assertion,
      explanation,
      supportingFacts,
      supportingSources,
      missingFacts: evaluation.missingFacts,
      contradictedFacts: evaluation.contradictedFacts,
      ruleTraces: evaluation.traces,
    };
  });

  // Aggregate overall status
  const allStatuses = claims.map((c) => c.status);
  const overallStatus = highestStatus(allStatuses);

  // Build summary
  const summary = buildSummary(overallStatus, claims);

  // Build missing information
  const missingInformation = buildMissingInformation(evaluations, questionMap);

  // Build contradictions
  const contradictions = buildContradictions(evaluations, factMap);

  // Build disclaimers
  const disclaimers = buildDisclaimers(overallStatus);

  return {
    caseId,
    problemKey,
    evaluatedAt: evaluatedAt as Result["evaluatedAt"],
    engineVersion,
    overallStatus,
    summary,
    claims,
    missingInformation,
    contradictions,
    sources,
    disclaimers,
    // Where to act: official bodies for this problem, always shown — a case
    // with insufficient data still has a competent authority to complain to.
    channels: channelsForProblem(problemKey),
    intakeComplete,
  };
}

// ── Summary Builder ─────────────────────────────────────────────────

function buildSummary(overallStatus: ClaimStatus, claims: readonly Claim[]): string {
  const supported = claims.filter((c) => c.status === "SUPPORTED").length;
  const potentially = claims.filter((c) => c.status === "POTENTIALLY_APPLICABLE").length;
  const insufficient = claims.filter((c) => c.status === "INSUFFICIENT_DATA").length;
  const contradicted = claims.filter((c) => c.status === "CONTRADICTED").length;

  const parts: string[] = [];

  if (supported > 0) {
    parts.push(
      `${supported} afirmación${supported > 1 ? "es" : ""} confirmada${supported > 1 ? "s" : ""}`,
    );
  }
  if (potentially > 0) {
    parts.push(
      `${potentially} afirmación${potentially > 1 ? "es" : ""} potencialmente aplicable${potentially > 1 ? "s" : ""}`,
    );
  }
  if (insufficient > 0) {
    parts.push(`${insufficient} afirmación${insufficient > 1 ? "es" : ""} sin datos suficientes`);
  }
  if (contradicted > 0) {
    parts.push(
      `${contradicted} afirmación${contradicted > 1 ? "es" : ""} contradictoria${contradicted > 1 ? "s" : ""}`,
    );
  }

  const base = parts.length > 0 ? `Análisis: ${parts.join("; ")}.` : "Análisis completado.";

  switch (overallStatus) {
    case "SUPPORTED":
      return `${base} La información disponible respalda las conclusiones.`;
    case "POTENTIALLY_APPLICABLE":
      return `${base} Algunas conclusiones son provisionales.`;
    case "INSUFFICIENT_DATA":
      return `${base} Se requiere información adicional para llegar a una conclusión.`;
    case "CONTRADICTED":
      return `${base} Se detectaron contradicciones que requieren resolución.`;
    case "NOT_APPLICABLE":
      return `${base} Las reglas evaluadas no resultan aplicables.`;
    default:
      return base;
  }
}
