/**
 * Action Engine (Fase 7).
 *
 * Derives concrete actions from a Result. Actions are deterministic:
 * same Result → same Action Plan, always.
 *
 * The engine NEVER invents actions. Each action must be traceable to
 * at least one claim or missing information item.
 */
import type { Result } from "../result/types";
import type { Action, ActionPlan, ActionType } from "./types";

// ── Action Templates ────────────────────────────────────────────────

interface ActionTemplate {
  readonly type: ActionType;
  readonly title: string;
  readonly description: string;
  readonly priority: number;
  /** When to generate this action (claim status → action). */
  readonly triggerStatus:
    "SUPPORTED" | "POTENTIALLY_APPLICABLE" | "INSUFFICIENT_DATA" | "CONTRADICTED";
}

/**
 * Templates for actions that can be derived from claims.
 * These are DECLARATIVE DATA — not legal advice.
 */
const ACTION_TEMPLATES: readonly ActionTemplate[] = [
  // SUPPORTED claims → request refund / submit complaint
  {
    type: "REQUEST_REFUND",
    title: "Solicitar reembolso",
    description:
      "Con la información disponible, puede solicitar el reembolso o la compensación que corresponda a su caso. Adjunte la documentación de soporte.",
    priority: 1,
    triggerStatus: "SUPPORTED",
  },
  {
    type: "SUBMIT_COMPLAINT",
    title: "Presentar reclamación",
    description:
      "Si la empresa no responde o rechaza su solicitud, puede presentar una reclamación formal ante los organismos oficiales que aparecen más abajo.",
    priority: 2,
    triggerStatus: "SUPPORTED",
  },

  // POTENTIALLY_APPLICABLE → gather more evidence
  {
    type: "COLLECT_INFORMATION",
    title: "Recopilar información adicional",
    description:
      "Algunas conclusiones son provisionales. Recopile documentación adicional para confirmar los datos.",
    priority: 1,
    triggerStatus: "POTENTIALLY_APPLICABLE",
  },
  {
    type: "PRESERVE_EVIDENCE",
    title: "Conservar evidencia",
    description:
      "Guarde toda la documentación relevante (correos, facturas, capturas de pantalla) como respaldo.",
    priority: 1,
    triggerStatus: "POTENTIALLY_APPLICABLE",
  },

  // INSUFFICIENT_DATA → collect info
  {
    type: "COLLECT_INFORMATION",
    title: "Proporcionar información faltante",
    description:
      "No es posible determinar una conclusión con la información actual. Proporcione los datos solicitados.",
    priority: 1,
    triggerStatus: "INSUFFICIENT_DATA",
  },

  // CONTRADICTED → preserve + contact
  {
    type: "PRESERVE_EVIDENCE",
    title: "Documentar contradicción",
    description:
      "Se detectaron información contradictoria. Documente ambas versiones y conserve la evidencia de cada una.",
    priority: 1,
    triggerStatus: "CONTRADICTED",
  },
  {
    type: "CONTACT_MERCHANT",
    title: "Consultar al proveedor",
    description:
      "La información es contradictoria. Contacte al proveedor para aclarar la situación.",
    priority: 2,
    triggerStatus: "CONTRADICTED",
  },
];

// ── Missing Information Actions ─────────────────────────────────────

/**
 * One action per fact the user can actually complete.
 *
 * Facts with no answerable question (`answerable: false`) are NOT turned into
 * "provide this" actions: the user would be sent to a dead end. The report shows
 * the explanation instead, without an action that cannot be carried out.
 */
function deriveMissingInfoActions(result: Result): readonly Action[] {
  const actions: Action[] = [];

  for (const missing of result.missingInformation) {
    if (missing.impact !== "required" || !missing.answerable) continue;

    actions.push({
      id: `action-missing-${missing.factKey}`,
      type: "COLLECT_INFORMATION",
      // A question becomes "complete this"; a failed computation becomes "review
      // this", because the user cannot answer the derived value itself.
      title:
        missing.kind === "question"
          ? `Completar: ${missing.description.replace(/\?\s*$/, "")}`
          : "Revisar un dato que no hemos podido calcular",
      description: missing.description,
      priority: 1,
      status: "AVAILABLE",
      prerequisites: [],
      relatedClaims: missing.blockedClaims,
      relatedEvidence: [],
    });
  }

  return actions;
}

/**
 * Collapse actions that mean the same thing.
 *
 * A derived action is emitted per claim, so four supported claims produced four
 * identical "Solicitar reembolso" entries and every missing fact produced one
 * more generic "Proporcionar información faltante". The report became a wall of
 * repeated lines. Actions are merged by (type, title); the claims they relate to
 * are kept, because they are what makes the action traceable.
 */
function mergeDuplicateActions(actions: readonly Action[]): readonly Action[] {
  const merged = new Map<string, Action>();

  for (const action of actions) {
    const key = `${action.type}\u0000${action.title}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, action);
      continue;
    }
    merged.set(key, {
      ...existing,
      priority: Math.min(existing.priority, action.priority),
      relatedClaims: [...new Set([...existing.relatedClaims, ...action.relatedClaims])],
      relatedEvidence: [...new Set([...existing.relatedEvidence, ...action.relatedEvidence])],
    });
  }

  return [...merged.values()];
}

// ── Evidence Preservation Actions ───────────────────────────────────

function deriveEvidenceActions(result: Result): readonly Action[] {
  const actions: Action[] = [];

  // If there are contradictions, suggest preserving evidence
  if (result.contradictions.length > 0) {
    actions.push({
      id: "action-preserve-all",
      type: "PRESERVE_EVIDENCE",
      title: "Conservar toda la documentación",
      description:
        "Se detectaron inconsistencias. Guarde todos los documentos, correos y capturas de pantalla relacionados con su caso.",
      priority: 1,
      status: "AVAILABLE",
      prerequisites: [],
      relatedClaims: result.contradictions.flatMap((c) => c.affectedClaims),
      relatedEvidence: [],
    });
  }

  return actions;
}

// ── Document Generation Actions ─────────────────────────────────────

function deriveDocumentActions(result: Result): readonly Action[] {
  const actions: Action[] = [];

  // If any claim is SUPPORTED, offer document generation
  const supportedClaims = result.claims.filter((c) => c.status === "SUPPORTED");
  if (supportedClaims.length > 0) {
    actions.push({
      id: "action-generate-complaint",
      type: "GENERATE_DOCUMENT",
      title: "Generar reclamación",
      description: "Genere un documento de reclamación con los datos confirmados de su caso.",
      priority: 3,
      status: "AVAILABLE",
      prerequisites: [],
      relatedClaims: supportedClaims.map((c) => c.id),
      relatedEvidence: [],
      metadata: { templateId: "reclamation-v1" },
    });
  }

  return actions;
}

// ── Next Step ───────────────────────────────────────────────────────

function determineNextStep(result: Result, actions: readonly Action[]): string {
  // If there are missing required facts, that's the first step. Listed as a
  // count with the first item named: dumping every question into one sentence
  // was unreadable and repeated questions the user had already answered.
  const requiredMissing = result.missingInformation.filter((m) => m.impact === "required");
  if (requiredMissing.length > 0) {
    const [first] = requiredMissing;
    const rest = requiredMissing.length - 1;
    return (
      `Faltan ${requiredMissing.length} dato${requiredMissing.length > 1 ? "s" : ""} para poder concluir. ` +
      `Empieza por: ${first?.description ?? ""}${rest > 0 ? ` (y ${rest} más)` : ""}`
    );
  }

  // If there are contradictions, address them first
  if (result.contradictions.length > 0) {
    return "Hay información contradictoria que necesita resolverse primero.";
  }

  // If there are available actions, describe the next one
  const available = actions.filter((a) => a.status === "AVAILABLE");
  if (available.length > 0) {
    const next = available[0]!;
    return `Siguiente paso: ${next.title}.`;
  }

  return "Su caso ha sido analizado. Revise los resultados y acciones disponibles.";
}

// ── Main Engine ─────────────────────────────────────────────────────

/**
 * Derive an Action Plan from a Result.
 * PURE: same inputs → same output, always.
 */
export function deriveActions(result: Result): ActionPlan {
  const actions: Action[] = [];

  // 1. Derive actions from claims
  for (const claim of result.claims) {
    for (const template of ACTION_TEMPLATES) {
      if (claim.status === template.triggerStatus) {
        actions.push({
          id: `action-${claim.ruleKey}-${template.type.toLowerCase()}`,
          type: template.type,
          title: template.title,
          description: template.description,
          priority: template.priority,
          status: "AVAILABLE",
          prerequisites: [],
          relatedClaims: [claim.id],
          relatedEvidence: [],
        });
      }
    }
  }

  // 2. Derive actions from missing information
  const missingActions = deriveMissingInfoActions(result);
  actions.push(...missingActions);

  // Any missing fact is already reported: as a specific "complete this" action
  // when the person can answer it, or as an explanation when the analysis could
  // not compute it. The generic "provide missing information" would only add a
  // vague step on top of either.
  const genericCollect = result.missingInformation.length > 0;

  // 3. Derive evidence preservation actions
  actions.push(...deriveEvidenceActions(result));

  // 4. Derive document generation actions
  actions.push(...deriveDocumentActions(result));

  // 5. Collapse duplicates, then sort by priority (highest first)
  const merged = mergeDuplicateActions(
    genericCollect
      ? actions.filter(
          (a) =>
            !(
              a.type === "COLLECT_INFORMATION" &&
              a.title === "Proporcionar información faltante"
            ),
        )
      : actions,
  );
  const sorted = [...merged].sort((a, b) => a.priority - b.priority);

  // 6. Determine next step
  const nextStep = determineNextStep(result, sorted);

  // 7. Determine if plan is complete — incomplete only when the USER can still
  // do something about it (an unanswerable derived fact is not a pending step).
  const complete =
    result.missingInformation.filter((m) => m.impact === "required" && m.answerable).length === 0;

  return {
    caseId: result.caseId,
    problemKey: result.problemKey,
    generatedAt: result.evaluatedAt,
    actions: sorted,
    nextStep,
    complete,
  };
}
