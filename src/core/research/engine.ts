/**
 * Research Engine (Fase 14, spec §1/§17).
 *
 * Orchestrates the research process:
 *   PLAN → SEARCH → COLLECT → VALIDATE → EXTRACT → COMPARE → RESULT
 *
 * The engine is BOUNDED:
 *   - Maximum searches
 *   - Maximum source fetches
 *   - Maximum AI calls
 *   - Maximum tokens
 *   - Maximum duration
 *
 * The engine is DETERMINISTIC for the same inputs:
 *   - Same problem + same jurisdiction + same facts → same research plan
 *   - Same sources + same extraction → same findings
 *
 * The engine NEVER:
 *   - Invents legislation
 *   - Publishes rules automatically
 *   - Silently resolves source conflicts
 *   - Turns uncertainty into conclusions
 */
import type {
  ResearchPlan,
  ResearchQuestion,
  ResearchFinding,
  ResearchSource,
  ResearchResult,
  ResearchStatus,
  ResearchBudget,
  ResearchExecutionState,
  SourceConflict,
  MissingResearchInfo,
  SourceType,
} from "./types";
import type { IsoDateTime } from "../shared/temporal";
import { validateSource, compareAuthority } from "./source-validator";
import { randomUUID } from "node:crypto";

// ── Default Budget ──────────────────────────────────────────────────

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxSearches: 5,
  maxSourceFetches: 10,
  maxAiCalls: 10,
  maxTokens: 50_000,
  maxDurationMs: 120_000, // 2 minutes
  maxRetries: 2,
};

// ── Research Engine ─────────────────────────────────────────────────

export class ResearchEngine {
  constructor(private readonly budget: ResearchBudget = DEFAULT_RESEARCH_BUDGET) {}

  /**
   * Create a structured research plan from a problem description.
   * This is DETERMINISTIC: same input → same plan.
   */
  createPlan(params: {
    problemDescription: string;
    jurisdiction: string;
    entities: readonly string[];
    facts: ReadonlyMap<string, unknown>;
  }): ResearchPlan {
    const { problemDescription, jurisdiction, entities, facts } = params;

    // Identify legal domain from problem description
    const legalDomain = this.identifyLegalDomain(problemDescription);

    // Generate research questions
    const questions = this.generateResearchQuestions(problemDescription, legalDomain, jurisdiction);

    // Identify missing facts
    const missingFacts = this.identifyMissingFacts(facts, legalDomain);

    // Determine required source categories
    const sourceCategories = this.determineSourceCategories(legalDomain, jurisdiction);

    return {
      planId: `plan-${randomUUID()}`,
      problemDescription,
      jurisdiction,
      legalDomain,
      entities,
      researchQuestions: questions,
      sourceCategories,
      requiredAuthority: "OFFICIAL_LEGISLATION",
      knownMissingFacts: missingFacts,
      researchConstraints: [
        "Must use official sources when available",
        "Must not invent legal conclusions",
        "Must preserve source provenance",
      ],
    };
  }

  /**
   * Check if research budget is exhausted.
   */
  isBudgetExhausted(state: ResearchExecutionState): boolean {
    if (state.searchesPerformed >= this.budget.maxSearches) return true;
    if (state.sourceFetchesPerformed >= this.budget.maxSourceFetches) return true;
    if (state.aiCallsPerformed >= this.budget.maxAiCalls) return true;
    if (state.tokensUsed >= this.budget.maxTokens) return true;

    // Duration check
    const elapsed = Date.now() - new Date(state.startedAt).getTime();
    if (elapsed >= this.budget.maxDurationMs) return true;

    return false;
  }

  /**
   * Validate a source and update its validation status.
   */
  validateSource(source: ResearchSource, jurisdiction: string): ResearchSource {
    const validation = validateSource(source, jurisdiction);

    return {
      ...source,
      validationStatus: validation.isValid ? "VALIDATED" : "REJECTED",
      authority: validation.authority,
      validationNotes:
        [...validation.validationNotes, ...validation.warnings].join("; ") || undefined,
    };
  }

  /**
   * Detect conflicts between sources.
   */
  detectConflicts(sources: readonly ResearchSource[]): readonly SourceConflict[] {
    const conflicts: SourceConflict[] = [];

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const sourceA = sources[i]!;
        const sourceB = sources[j]!;

        // Only compare validated sources
        if (sourceA.validationStatus !== "VALIDATED") continue;
        if (sourceB.validationStatus !== "VALIDATED") continue;

        // Check for conflicts
        const conflict = this.checkForConflict(sourceA, sourceB);
        if (conflict) {
          conflicts.push({
            conflictId: `conflict-${randomUUID()}`,
            conflictType: conflict.type as SourceConflict["conflictType"],
            sourceA,
            sourceB,
            description: conflict.description,
            resolutionStatus: "UNRESOLVED",
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Build a research result from findings and sources.
   */
  buildResult(params: {
    caseId: string;
    plan: ResearchPlan;
    findings: readonly ResearchFinding[];
    sources: readonly ResearchSource[];
    conflicts: readonly SourceConflict[];
    aiRequestIds: readonly string[];
    previousResearchId?: string;
  }): ResearchResult {
    const { caseId, plan, findings, sources, conflicts, aiRequestIds, previousResearchId } = params;

    // Determine overall status
    const status = this.determineOverallStatus(findings, conflicts);

    // Identify missing information
    const missingInformation = this.identifyMissingInfo(findings, plan);

    // Build disclaimers
    const disclaimers = this.buildDisclaimers(status, conflicts);

    const now = new Date().toISOString() as IsoDateTime;

    return {
      researchId: `research-${randomUUID()}`,
      caseId,
      jurisdiction: plan.jurisdiction,
      status,
      plan,
      findings,
      conflicts,
      sources,
      missingInformation,
      disclaimers,
      researchVersion: `v${Date.now()}`,
      previousResearchId,
      aiRequestIds,
      createdAt: now,
      completedAt: now,
    };
  }

  // ── Private Methods ───────────────────────────────────────────────

  private identifyLegalDomain(problemDescription: string): string {
    const desc = problemDescription.toLowerCase();

    if (desc.includes("vuelo") || desc.includes("cancelación") || desc.includes("aerolínea")) {
      return "AVIATION_CONSUMER";
    }
    if (desc.includes("garantía") || desc.includes("producto") || desc.includes("defecto")) {
      return "WARRANTY_CONSUMER";
    }
    if (desc.includes("compra") || desc.includes("reembolso") || desc.includes("devolución")) {
      return "PURCHASE_CONSUMER";
    }
    if (desc.includes("contrato") || desc.includes("servicio") || desc.includes("suscripción")) {
      return "SERVICE_CONSUMER";
    }
    if (
      desc.includes("telecomunicaciones") ||
      desc.includes("internet") ||
      desc.includes("móvil")
    ) {
      return "TELECOM_CONSUMER";
    }

    return "GENERAL_CONSUMER";
  }

  private generateResearchQuestions(
    _problemDescription: string,
    legalDomain: string,
    jurisdiction: string,
  ): readonly ResearchQuestion[] {
    const questions: ResearchQuestion[] = [];

    // Universal questions
    questions.push({
      questionId: `q-jurisdiction-${randomUUID()}`,
      question: `What consumer protection laws apply in ${jurisdiction} for this type of problem?`,
      priority: "HIGH",
      requiredSourceAuthority: "OFFICIAL_LEGISLATION",
    });

    questions.push({
      questionId: `q-rights-${randomUUID()}`,
      question: "What are the consumer's legal rights in this situation?",
      priority: "HIGH",
      requiredSourceAuthority: "OFFICIAL_LEGISLATION",
    });

    questions.push({
      questionId: `q-deadlines-${randomUUID()}`,
      question: "What deadlines or time limits apply?",
      priority: "MEDIUM",
      requiredSourceAuthority: "OFFICIAL_LEGISLATION",
    });

    // Domain-specific questions
    if (legalDomain === "WARRANTY_CONSUMER") {
      questions.push({
        questionId: `q-warranty-${randomUUID()}`,
        question: "What warranty period and remedies are available?",
        priority: "HIGH",
        requiredSourceAuthority: "OFFICIAL_LEGISLATION",
      });
    }

    if (legalDomain === "PURCHASE_CONSUMER") {
      questions.push({
        questionId: `q-refund-${randomUUID()}`,
        question: "Under what conditions is a refund required?",
        priority: "HIGH",
        requiredSourceAuthority: "OFFICIAL_LEGISLATION",
      });
    }

    if (legalDomain === "AVIATION_CONSUMER") {
      questions.push({
        questionId: `q-compensation-${randomUUID()}`,
        question: "What compensation is available for this situation?",
        priority: "HIGH",
        requiredSourceAuthority: "OFFICIAL_REGULATION",
      });
    }

    return questions;
  }

  private identifyMissingFacts(
    facts: ReadonlyMap<string, unknown>,
    legalDomain: string,
  ): readonly string[] {
    const missing: string[] = [];

    // Common missing facts
    if (!facts.has("purchase_date")) missing.push("purchase_date");
    if (!facts.has("seller_name")) missing.push("seller_name");
    if (!facts.has("product_description")) missing.push("product_description");

    // Domain-specific missing facts
    if (legalDomain === "WARRANTY_CONSUMER") {
      if (!facts.has("delivery_date")) missing.push("delivery_date");
      if (!facts.has("defect_description")) missing.push("defect_description");
    }

    if (legalDomain === "AVIATION_CONSUMER") {
      if (!facts.has("flight_date")) missing.push("flight_date");
      if (!facts.has("airline_name")) missing.push("airline_name");
    }

    return missing;
  }

  private determineSourceCategories(
    legalDomain: string,
    _jurisdiction: string,
  ): readonly SourceType[] {
    const categories: SourceType[] = ["LEGISLATION", "REGULATION"];

    if (legalDomain === "AVIATION_CONSUMER") {
      categories.push("REGULATION"); // EU regulations
    }

    categories.push("ADMINISTRATIVE_GUIDANCE", "INSTITUTIONAL_REPORT");

    return categories;
  }

  private checkForConflict(
    sourceA: ResearchSource,
    sourceB: ResearchSource,
  ): { type: string; description: string } | null {
    // Different jurisdictions
    if (sourceA.jurisdiction !== sourceB.jurisdiction) {
      return {
        type: "DIFFERENT_JURISDICTION",
        description: `Sources apply to different jurisdictions: ${sourceA.jurisdiction} vs ${sourceB.jurisdiction}`,
      };
    }

    // Different dates
    if (sourceA.publicationDate && sourceB.publicationDate) {
      if (sourceA.publicationDate !== sourceB.publicationDate) {
        return {
          type: "DIFFERENT_DATE",
          description: `Sources published on different dates: ${sourceA.publicationDate} vs ${sourceB.publicationDate}`,
        };
      }
    }

    // Primary vs secondary
    const rankA = compareAuthority(sourceA.authority, "SECONDARY_SOURCE");
    const rankB = compareAuthority(sourceB.authority, "SECONDARY_SOURCE");
    if (Math.abs(rankA - rankB) >= 3) {
      return {
        type: "PRIMARY_VS_SECONDARY",
        description: `Significant authority difference: ${sourceA.authority} vs ${sourceB.authority}`,
      };
    }

    return null;
  }

  private determineOverallStatus(
    findings: readonly ResearchFinding[],
    conflicts: readonly SourceConflict[],
  ): ResearchStatus {
    if (findings.length === 0) {
      return "INSUFFICIENT_INFORMATION";
    }

    // Check for unresolved conflicts
    const unresolvedConflicts = conflicts.filter((c) => c.resolutionStatus === "UNRESOLVED");
    if (unresolvedConflicts.length > 0) {
      return "SOURCE_CONFLICT";
    }

    // Check finding statuses
    const hasSupported = findings.some((f) => f.status === "SUPPORTED");
    const hasPotentially = findings.some((f) => f.status === "POTENTIALLY_APPLICABLE");
    const hasInsufficient = findings.some((f) => f.status === "INSUFFICIENT_DATA");
    const hasContradicted = findings.some((f) => f.status === "CONTRADICTED");

    if (hasSupported && !hasContradicted) {
      return "RESULT_READY";
    }

    if (hasPotentially) {
      return "ANALYSIS_READY";
    }

    if (hasContradicted) {
      return "SOURCE_CONFLICT";
    }

    if (hasInsufficient) {
      return "INSUFFICIENT_INFORMATION";
    }

    return "RESULT_READY";
  }

  private identifyMissingInfo(
    findings: readonly ResearchFinding[],
    plan: ResearchPlan,
  ): readonly MissingResearchInfo[] {
    const missing: MissingResearchInfo[] = [];

    // Check for missing facts in findings
    for (const finding of findings) {
      if (finding.status === "INSUFFICIENT_DATA") {
        missing.push({
          factKey: finding.proposition,
          description: `Insufficient data to determine: ${finding.proposition}`,
          impact: "required",
          blockingFindings: [finding.findingId],
        });
      }
    }

    // Check for known missing facts from plan
    for (const factKey of plan.knownMissingFacts) {
      missing.push({
        factKey,
        description: `Missing information: ${factKey}`,
        impact: "recommended",
        blockingFindings: [],
      });
    }

    return missing;
  }

  private buildDisclaimers(
    status: ResearchStatus,
    conflicts: readonly SourceConflict[],
  ): readonly string[] {
    const disclaimers: string[] = [
      "Esta información no constituye asesoramiento legal.",
      "Los resultados se basan en fuentes públicas disponibles y pueden no reflejar cambios recientes.",
      "La investigación es un proceso automatizado que puede no captar todas las complejidades legales.",
    ];

    if (status === "SOURCE_CONFLICT") {
      disclaimers.push(
        "Se detectaron fuentes contradictorias. Se recomienda consultar con un profesional.",
      );
    }

    if (status === "INSUFFICIENT_INFORMATION") {
      disclaimers.push(
        "No fue posible encontrar información suficiente para llegar a una conclusión.",
      );
    }

    if (conflicts.length > 0) {
      disclaimers.push(`Se identificaron ${conflicts.length} conflicto(s) entre fuentes.`);
    }

    return disclaimers;
  }
}
