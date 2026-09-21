/**
 * Research Service (Fase 14, spec §2/§24/§25).
 *
 * Integrates Research Resolver with existing architecture:
 *   - F8.3 Universal Intake (routing)
 *   - F12 Document Generation
 *   - F13 Case Management (timeline)
 *   - AI Router (bounded AI calls)
 *   - Source Registry (existing sources)
 *
 * The service orchestrates:
 *   1. Receive unsupported problem from intake
 *   2. Create research plan
 *   3. Execute bounded research
 *   4. Validate sources
 *   5. Extract findings
 *   6. Detect conflicts
 *   7. Produce structured result
 *   8. Record in case timeline
 */
import type {
  ResearchPlan,
  ResearchResult,
  ResearchFinding,
  ResearchSource,
  ResearchBudget,
  ResearchStatus,
  ResearchQuestion,
  SourceConflict,
} from "./types";
import type { Claim, ClaimStatus } from "../result/types";
import { ResearchEngine, DEFAULT_RESEARCH_BUDGET } from "./engine";
import { WebSearchAdapter } from "./web-search";
import { compareAuthority } from "./source-validator";
import { randomUUID } from "node:crypto";

// ── Research Service ────────────────────────────────────────────────

export class ResearchService {
  private readonly engine: ResearchEngine;
  private readonly searchAdapter: WebSearchAdapter;
  private readonly budget: ResearchBudget;

  constructor(budget: Partial<ResearchBudget> = {}) {
    this.budget = { ...DEFAULT_RESEARCH_BUDGET, ...budget };
    this.engine = new ResearchEngine(this.budget);
    this.searchAdapter = new WebSearchAdapter();
  }

  /**
   * Start research for an unsupported problem.
   *
   * Flow:
   *   1. Create research plan
   *   2. Execute bounded research
   *   3. Return research result
   *
   * This is the main entry point for Research Resolver.
   */
  async startResearch(params: {
    caseId: string;
    problemDescription: string;
    jurisdiction: string;
    entities: readonly string[];
    facts: ReadonlyMap<string, unknown>;
    previousResearchId?: string;
  }): Promise<ResearchResult> {
    const { caseId, problemDescription, jurisdiction, entities, facts, previousResearchId } = params;

    // 1. Create research plan
    const plan = this.engine.createPlan({
      problemDescription,
      jurisdiction,
      entities,
      facts,
    });

    // 2. Execute bounded research
    const { findings, sources, conflicts, aiRequestIds } = await this.executeResearch(plan);

    // 3. Build and return result
    return this.engine.buildResult({
      caseId,
      plan,
      findings,
      sources,
      conflicts,
      aiRequestIds,
      previousResearchId,
    });
  }

  /**
   * Get the status of a research result.
   */
  getResearchStatus(result: ResearchResult): ResearchStatus {
    return result.status;
  }

  /**
   * Check if research can be rerun.
   */
  canRerun(result: ResearchResult): boolean {
    // Can rerun if status is not RESULT_READY or if there are unresolved conflicts
    return result.status !== "RESULT_READY" || 
           result.conflicts.some(c => c.resolutionStatus === "UNRESOLVED");
  }

  /**
   * Get research summary for UI display.
   */
  getResearchSummary(result: ResearchResult): {
    status: string;
    findingCount: number;
    sourceCount: number;
    conflictCount: number;
    supportedFindings: number;
    uncertainFindings: number;
    missingInfoCount: number;
  } {
    const supported = result.findings.filter(f => f.status === "SUPPORTED").length;
    const uncertain = result.findings.filter(f => 
      f.status === "POTENTIALLY_APPLICABLE" || f.status === "INSUFFICIENT_DATA"
    ).length;

    return {
      status: this.getStatusLabel(result.status),
      findingCount: result.findings.length,
      sourceCount: result.sources.length,
      conflictCount: result.conflicts.length,
      supportedFindings: supported,
      uncertainFindings: uncertain,
      missingInfoCount: result.missingInformation.length,
    };
  }

  /**
   * Convert research findings to Result Engine-compatible claims.
   * This integrates with F12 Document Generation.
   */
  findingsToClaims(result: ResearchResult): readonly Claim[] {
    return result.findings.map((finding, index) => ({
      id: `research-claim-${index}`,
      ruleKey: `research.${finding.proposition.slice(0, 50).replace(/\s+/g, "-").toLowerCase()}`,
      ruleVersion: 1,
      status: finding.status as ClaimStatus,
      assertion: finding.proposition,
      explanation: finding.reasoningSummary,
      supportingFacts: finding.supportingFacts.map(f => ({
        factKey: f.factKey,
        value: f.value,
        status: f.status as "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED",
        confidence: f.source === "USER_PROVIDED" ? "USER" as const : "AI" as const,
        evidenceIds: [],
      })),
      supportingSources: finding.supportingSources.map(s => ({
        sourceId: s.sourceId,
        title: s.title,
        url: s.url,
        type: s.sourceType,
        retrievedAt: s.retrievedAt,
        claim: finding.proposition,
      })),
      missingFacts: [],
      contradictedFacts: [],
      ruleTraces: [],
    }));
  }

  // ── Private Methods ───────────────────────────────────────────────

  private async executeResearch(plan: ResearchPlan): Promise<{
    findings: readonly ResearchFinding[];
    sources: readonly ResearchSource[];
    conflicts: readonly SourceConflict[];
    aiRequestIds: readonly string[];
  }> {
    const sources: ResearchSource[] = [];
    const findings: ResearchFinding[] = [];
    const aiRequestIds: string[] = [];

    // Execute bounded research for each question
    for (const question of plan.researchQuestions) {
      if (sources.length >= this.budget.maxSourceFetches) break;

      // Search for sources
      const searchResults = await this.searchAdapter.search(
        question.question,
        plan.jurisdiction,
      );

      // Convert results to sources
      for (const result of searchResults.results) {
        if (sources.length >= this.budget.maxSourceFetches) break;

        const source = this.searchAdapter.resultToSource(result, plan.jurisdiction);
        const validated = this.engine.validateSource(source, plan.jurisdiction);
        sources.push(validated);
      }

      // Generate finding for this question
      const finding = this.generateFinding(question, sources, plan);
      findings.push(finding);
    }

    // Detect conflicts
    const conflicts = this.engine.detectConflicts(sources);

    return { findings, sources, conflicts, aiRequestIds };
  }

  private generateFinding(
    question: ResearchQuestion,
    sources: readonly ResearchSource[],
    plan: ResearchPlan,
  ): ResearchFinding {
    // Find validated sources that could answer this question
    const validSources = sources.filter(s => s.validationStatus === "VALIDATED");

    if (validSources.length === 0) {
      return {
        findingId: `finding-${randomUUID()}`,
        proposition: question.question,
        status: "INSUFFICIENT_DATA",
        jurisdiction: plan.jurisdiction,
        supportingSources: [],
        supportingFacts: [],
        contrarySources: [],
        reasoningSummary: "No validated sources found for this question.",
        researchVersion: `v${Date.now()}`,
      };
    }

    // Sort by authority
    const sortedSources = [...validSources].sort((a, b) =>
      compareAuthority(a.authority, b.authority)
    );

    // Use highest authority source
    const primarySource = sortedSources[0]!;

    return {
      findingId: `finding-${randomUUID()}`,
      proposition: question.question,
      status: "POTENTIALLY_APPLICABLE", // Always potentially applicable from web research
      jurisdiction: plan.jurisdiction,
      supportingSources: [primarySource],
      supportingFacts: [],
      contrarySources: [],
      reasoningSummary: `Based on ${primarySource.title} (${primarySource.authority}).`,
      researchVersion: `v${Date.now()}`,
      temporalValidity: {
        publicationDate: primarySource.publicationDate,
        effectiveDate: primarySource.effectiveDate,
        retrievalDate: primarySource.retrievedAt,
        isActive: true,
      },
    };
  }

  private getStatusLabel(status: ResearchStatus): string {
    const labels: Record<ResearchStatus, string> = {
      RESEARCH_PENDING: "Pendiente",
      RESEARCHING: "Investigando...",
      SOURCES_FOUND: "Fuentes encontradas",
      SOURCES_VALIDATED: "Fuentes validadas",
      ANALYSIS_READY: "Análisis listo",
      RESULT_READY: "Resultado listo",
      INSUFFICIENT_INFORMATION: "Información insuficiente",
      NO_RELIABLE_SOURCE: "Sin fuente fiable",
      JURISDICTION_UNCERTAIN: "Jurisdicción incierta",
      SOURCE_CONFLICT: "Conflicto entre fuentes",
      RESEARCH_FAILED: "Investigación fallida",
    };
    return labels[status] ?? status;
  }
}
