/**
 * Research Resolver domain types (Fase 14).
 *
 * Pure types — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * The Research Resolver investigates unsupported consumer problems,
 * identifies applicable jurisdiction and official sources, extracts
 * relevant rules, detects uncertainty/conflicts, and produces a
 * structured answer with explicit provenance.
 *
 * Fundamental principle:
 *   AI researches → System validates → Sources verified → Findings produced
 *
 * Never:
 *   User → LLM → Legal answer
 */
import type { FactKey, FactValue } from "../types";
import type { IsoDateTime, IsoDate } from "../shared/temporal";

// Re-export temporal types for convenience
export type { IsoDateTime, IsoDate };

// ── Research Status ─────────────────────────────────────────────────

/**
 * Research lifecycle states.
 * Each state represents a verifiable stage in the research process.
 */
export type ResearchStatus =
  | "RESEARCH_PENDING"
  | "RESEARCHING"
  | "SOURCES_FOUND"
  | "SOURCES_VALIDATED"
  | "ANALYSIS_READY"
  | "RESULT_READY"
  | "INSUFFICIENT_INFORMATION"
  | "NO_RELIABLE_SOURCE"
  | "JURISDICTION_UNCERTAIN"
  | "SOURCE_CONFLICT"
  | "RESEARCH_FAILED";

// ── Source Authority ────────────────────────────────────────────────

/**
 * Source authority levels.
 * Higher authority = more reliable for legal conclusions.
 */
export type SourceAuthority =
  | "OFFICIAL_LEGISLATION" // Official legislation (BOE, EUR-Lex)
  | "OFFICIAL_REGULATION" // Official regulations
  | "GOVERNMENT_MINISTRY" // Official government ministries
  | "OFFICIAL_REGULATOR" // Official regulators/authorities
  | "JUDICIAL_DATABASE" // Official court decisions
  | "ADMINISTRATIVE_GUIDANCE" // Official administrative guidance
  | "INSTITUTIONAL_SOURCE" // Other authoritative institutional sources
  | "PROFESSIONAL_SOURCE" // Professional/academic sources
  | "SECONDARY_SOURCE" // Secondary sources (news, blogs)
  | "UNVERIFIED"; // Unverified source

// ── Source Type ─────────────────────────────────────────────────────

export type SourceType =
  | "LEGISLATION"
  | "REGULATION"
  | "JUDICIAL_DECISION"
  | "ADMINISTRATIVE_GUIDANCE"
  | "INSTITUTIONAL_REPORT"
  | "ACADEMIC_PAPER"
  | "PROFESSIONAL_ARTICLE"
  | "NEWS_ARTICLE"
  | "OTHER";

// ── Research Finding Status ─────────────────────────────────────────

export type FindingStatus =
  | "SUPPORTED"
  | "POTENTIALLY_APPLICABLE"
  | "INSUFFICIENT_DATA"
  | "CONTRADICTED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

// ── Conflict Type ───────────────────────────────────────────────────

export type ConflictType =
  | "DIFFERENT_JURISDICTION"
  | "DIFFERENT_DATE"
  | "PRIMARY_VS_SECONDARY"
  | "GENERAL_VS_SPECIFIC"
  | "AMENDED_LEGISLATION"
  | "OUTDATED_GUIDANCE"
  | "OTHER";

// ── Research Source ─────────────────────────────────────────────────

/**
 * A source discovered during research.
 * Sources are versioned and validated before use.
 */
export interface ResearchSource {
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly jurisdiction: string;
  readonly sourceType: SourceType;
  readonly authority: SourceAuthority;
  readonly publicationDate?: IsoDate;
  readonly effectiveDate?: IsoDate;
  readonly retrievedAt: IsoDateTime;
  readonly versionIdentifier?: string;
  readonly relevantSection?: string;
  readonly contentHash?: string;
  readonly validationStatus: "VALIDATED" | "UNVERIFIED" | "REJECTED";
  readonly validationNotes?: string;
}

// ── Research Finding ────────────────────────────────────────────────

/**
 * A research finding — a structured conclusion from source analysis.
 * Findings are NOT legal conclusions — they are research assessments
 * with explicit provenance.
 */
export interface ResearchFinding {
  readonly findingId: string;
  readonly proposition: string;
  readonly status: FindingStatus;
  readonly jurisdiction: string;
  readonly supportingSources: readonly ResearchSource[];
  readonly supportingFacts: readonly ResearchFact[];
  readonly contrarySources: readonly ResearchSource[];
  readonly uncertainty?: string;
  readonly reasoningSummary: string;
  readonly researchVersion: string;
  readonly temporalValidity?: TemporalValidity;
}

// ── Research Fact ───────────────────────────────────────────────────

/**
 * A fact relevant to the research finding.
 * Distinguishes between user-provided, document-extracted, and derived facts.
 */
export interface ResearchFact {
  readonly factKey: FactKey;
  readonly value: FactValue;
  readonly status: "CONFIRMED" | "UNCONFIRMED" | "DERIVED";
  readonly source: "USER_PROVIDED" | "DOCUMENT_EXTRACTED" | "AI_DERIVED";
}

// ── Temporal Validity ───────────────────────────────────────────────

/**
 * Temporal validity information for a source.
 * Distinguishes between publication, effective, and retrieval dates.
 */
export interface TemporalValidity {
  readonly publicationDate?: IsoDate;
  readonly effectiveDate?: IsoDate;
  readonly retrievalDate: IsoDateTime;
  readonly isActive: boolean;
  readonly isHistorical?: boolean;
  readonly notes?: string;
}

// ── Source Conflict ─────────────────────────────────────────────────

/**
 * A conflict between sources.
 * Conflicts are represented explicitly, not silently resolved.
 */
export interface SourceConflict {
  readonly conflictId: string;
  readonly conflictType: ConflictType;
  readonly sourceA: ResearchSource;
  readonly sourceB: ResearchSource;
  readonly description: string;
  readonly resolutionStatus: "UNRESOLVED" | "RESOLVED" | "EXPLAINED";
  readonly resolutionNotes?: string;
}

// ── Research Plan ───────────────────────────────────────────────────

/**
 * A structured research plan.
 * Plans define what needs to be investigated, not conclusions.
 */
export interface ResearchPlan {
  readonly planId: string;
  readonly problemDescription: string;
  readonly jurisdiction: string;
  readonly legalDomain: string;
  readonly entities: readonly string[];
  readonly researchQuestions: readonly ResearchQuestion[];
  readonly sourceCategories: readonly SourceType[];
  readonly requiredAuthority: SourceAuthority;
  readonly knownMissingFacts: readonly string[];
  readonly researchConstraints: readonly string[];
}

// ── Research Question ───────────────────────────────────────────────

/**
 * A specific question to investigate.
 */
export interface ResearchQuestion {
  readonly questionId: string;
  readonly question: string;
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
  readonly requiredSourceAuthority: SourceAuthority;
}

// ── Research Result ─────────────────────────────────────────────────

/**
 * The complete result of a research investigation.
 * This is the primary output of the Research Resolver.
 */
export interface ResearchResult {
  readonly researchId: string;
  readonly caseId: string;
  readonly jurisdiction: string;
  readonly status: ResearchStatus;
  readonly plan: ResearchPlan;
  readonly findings: readonly ResearchFinding[];
  readonly conflicts: readonly SourceConflict[];
  readonly sources: readonly ResearchSource[];
  readonly missingInformation: readonly MissingResearchInfo[];
  readonly disclaimers: readonly string[];
  readonly researchVersion: string;
  readonly previousResearchId?: string;
  readonly aiRequestIds: readonly string[];
  readonly createdAt: IsoDateTime;
  readonly completedAt?: IsoDateTime;
}

// ── Missing Research Info ───────────────────────────────────────────

/**
 * Information missing for a reliable research result.
 */
export interface MissingResearchInfo {
  readonly factKey: string;
  readonly description: string;
  readonly impact: "required" | "recommended";
  readonly blockingFindings: readonly string[];
}

// ── Research Budget ─────────────────────────────────────────────────

/**
 * Budget constraints for research execution.
 */
export interface ResearchBudget {
  readonly maxSearches: number;
  readonly maxSourceFetches: number;
  readonly maxAiCalls: number;
  readonly maxTokens: number;
  readonly maxDurationMs: number;
  readonly maxRetries: number;
}

// ── Research Execution State ────────────────────────────────────────

/**
 * Internal state during research execution.
 */
export interface ResearchExecutionState {
  readonly searchesPerformed: number;
  readonly sourceFetchesPerformed: number;
  readonly aiCallsPerformed: number;
  readonly tokensUsed: number;
  readonly startedAt: IsoDateTime;
  readonly sources: readonly ResearchSource[];
  readonly findings: readonly ResearchFinding[];
  readonly conflicts: readonly SourceConflict[];
}
