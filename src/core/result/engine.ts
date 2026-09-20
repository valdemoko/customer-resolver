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
