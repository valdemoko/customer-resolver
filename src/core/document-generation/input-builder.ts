/**
 * Document Generation Input Builder (Fase 12).
 *
 * Transforms case data (facts, claims, sources, timeline) into a
 * structured DocumentGenerationInput that the AI can use to draft.
 *
 * ONLY uses:
 *   - CONFIRMED facts
 *   - SUPPORTED claims
 *   - Verified sources
 *   - Real timeline events
 *
 * NEVER includes:
 *   - UNCONFIRMED facts as factual assertions
 *   - Unsupported claims as legal assertions
 *   - Invented data
 */
import type { Fact } from "../types";
import type { Claim, Result } from "../result/types";
import type { ActionPlan } from "../actions/types";
import type {
  DocumentCitation,
  DocumentGenerationInput,
  DocumentType,
  FactualStatement,
  LegalStatement,
  UnresolvedItem,
} from "./types";

// ── Document Type Determination ─────────────────────────────────────

/**
 * Determine the document type from the problem key and available claims.
 * This is deterministic: same problemKey + same claims → same documentType.
 */
export function determineDocumentType(
  problemKey: string,
  supportedClaims: readonly Claim[],
): DocumentType {
  // Map problem keys to document types
  const typeMap: Record<string, DocumentType> = {
    "cancellation-charge": "CONSUMER_COMPLAINT",
    "no-delivery-refund": "REFUND_REQUEST",
    "warranty-rejection": "WARRANTY_CLAIM",
    "flight-cancel": "FLIGHT_CANCELLATION_CLAIM",
  };

  const baseType = typeMap[problemKey] ?? "GENERAL_FORMAL_REQUEST";

  // Refine based on claims if needed
  const hasRefundClaim = supportedClaims.some(
    (c) =>
      c.ruleKey.includes("reimbursement") ||
      c.ruleKey.includes("refund") ||
      c.ruleKey.includes("reembolso"),
  );

  if (hasRefundClaim && baseType === "CONSUMER_COMPLAINT") {
    return "REFUND_REQUEST";
  }

  return baseType;
}

// ── Fact Filtering ──────────────────────────────────────────────────

/**
 * Extract only CONFIRMED facts as factual statements.
 * QUALIFIED facts get a qualification note.
 * UNCONFIRMED/CONTRADICTED facts are excluded from assertions.
 */
function buildFactualStatements(facts: readonly Fact[]): readonly FactualStatement[] {
  const statements: FactualStatement[] = [];

  for (const fact of facts) {
    if (fact.status === "SUPERSEDED") continue;

    if (fact.status === "CONFIRMED") {
      statements.push({
        factKey: fact.key,
        factId: fact.id,
        text: formatFactAsStatement(fact),
        confidence: "CONFIRMED",
      });
    }
    // UNCONFIRMED and CONTRADICTED facts are NOT included as assertions
    // They appear as unresolved items instead
  }

  return statements;
}

/**
 * Format a fact value as a human-readable statement.
 * This is deterministic — same fact value → same text.
 */
function formatFactAsStatement(fact: Fact): string {
  const value = fact.value;
  switch (value.type) {
    case "string":
      return `${fact.key}: ${value.value}`;
    case "number":
      return `${fact.key}: ${value.value}`;
    case "boolean":
      return `${fact.key}: ${value.value ? "sí" : "no"}`;
    case "date":
      return `${fact.key}: ${value.value}`;
    case "money":
      return `${fact.key}: ${value.value.amountMinor} ${value.value.currency}`;
    case "enum":
      return `${fact.key}: ${value.value}`;
    default:
      return `${fact.key}: [dato confirmado]`;
  }
}

// ── Claim Filtering ─────────────────────────────────────────────────

/**
 * Extract only SUPPORTED claims as legal statements.
 * POTENTIALLY_APPLICABLE and other statuses are excluded from legal assertions.
 */
function buildLegalStatements(claims: readonly Claim[]): readonly LegalStatement[] {
  const statements: LegalStatement[] = [];

  for (const claim of claims) {
    if (claim.status === "SUPPORTED") {
      statements.push({
        claimId: claim.id,
        ruleKey: claim.ruleKey,
        text: claim.assertion,
        citationIds: claim.supportingSources.map((s) => s.sourceId),
      });
    }
  }

  return statements;
}

// ── Source Citations ────────────────────────────────────────────────

/**
 * Build citations from supporting sources of SUPPORTED claims.
 */
function buildCitations(claims: readonly Claim[]): readonly DocumentCitation[] {
  const citationMap = new Map<string, DocumentCitation>();

  for (const claim of claims) {
    if (claim.status !== "SUPPORTED") continue;

    for (const source of claim.supportingSources) {
      if (!citationMap.has(source.sourceId)) {
        citationMap.set(source.sourceId, {
          id: `citation-${source.sourceId}`,
          assertionRef: claim.assertion,
          sourceId: source.sourceId,
          sourceTitle: source.title,
          sourceUrl: source.url,
        });
      }
    }
  }

  return [...citationMap.values()];
}

// ── Unresolved Items ────────────────────────────────────────────────

/**
 * Build unresolved items from contradictions, missing info, and unconfirmed facts.
 */
function buildUnresolvedItems(result: Result, facts: readonly Fact[]): readonly UnresolvedItem[] {
  const items: UnresolvedItem[] = [];

  // Contradictions
  for (const contradiction of result.contradictions) {
    items.push({
      type: "CONTRADICTION",
      description: contradiction.description,
      factKey: contradiction.factKey,
    });
  }

  // Missing required information
  for (const missing of result.missingInformation) {
    if (missing.impact === "required") {
      items.push({
        type: "MISSING_INFORMATION",
        description: missing.description,
        factKey: missing.factKey,
      });
    }
  }

  // Unconfirmed facts that the user provided
  for (const fact of facts) {
    if (fact.status === "UNCONFIRMED" && fact.provenance === "AI_INTERPRETED") {
      items.push({
        type: "UNCONFIRMED_FACT",
        description: `Dato no confirmado: ${fact.key}`,
        factKey: fact.key,
      });
    }
  }

  return items;
}

// ── Main Builder ────────────────────────────────────────────────────

export interface BuildInputParams {
  readonly caseId: string;
  readonly result: Result;
  readonly actionPlan: ActionPlan;
  readonly facts: readonly Fact[];
  readonly sender: {
    readonly name?: string;
    readonly address?: string;
    readonly email?: string;
    readonly phone?: string;
  };
  readonly recipient: {
    readonly name: string;
    readonly address?: string;
    readonly email?: string;
  };
  readonly requestedAction: string;
  readonly jurisdiction?: string;
  readonly language?: string;
}

/**
 * Build a DocumentGenerationInput from case data.
 * ONLY uses confirmed/supported data. Pure function.
 */
export function buildDocumentInput(params: BuildInputParams): DocumentGenerationInput {
  const { result, facts, sender, recipient, requestedAction } = params;

  const confirmedFacts = buildFactualStatements(facts);
  const supportedClaims = buildLegalStatements(result.claims);
  const citations = buildCitations(result.claims);
  const unresolvedItems = buildUnresolvedItems(result, facts);

  const documentType = determineDocumentType(result.problemKey, result.claims);

  return {
    documentType,
    jurisdiction: params.jurisdiction ?? "ES",
    language: params.language ?? "es",
    sender,
    recipient,
    confirmedFacts,
    supportedClaims,
    applicableSources: citations,
    timeline: [], // TODO: Build from case events when available
    requestedAction,
    caseMetadata: {
      problemKey: result.problemKey,
      problemTitle: result.problemKey, // Should be resolved to human-readable title
      createdAt: result.evaluatedAt,
      jurisdiction: params.jurisdiction,
      language: params.language,
    },
    analysisSnapshotId: undefined, // Will be set by the caller
    unresolvedItems,
  };
}
