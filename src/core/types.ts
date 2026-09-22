/**
 * Core domain type taxonomy (Fase 1).
 * Pure types with invariants — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * Naming aligns 1:1 with the data layer of docs/ARCHITECTURE.md §5
 * (the DB layer adds persistence-only columns such as surrogate ids and timestamps).
 */
import type { IsoDate, IsoDateTime } from "./shared/temporal";
import type { Money } from "./shared/money";

// ── Case identity ───────────────────────────────────────────────────

/** Stable problem identifier (e.g. "cancellation-charge"). The core never interprets it. */
export type ProblemSlug = string & { readonly __brand: "ProblemSlug" };
export type JurisdictionCode = string & { readonly __brand: "JurisdictionCode" }; // "ES", "UK", "US-CA"…
export type Locale = string & { readonly __brand: "Locale" }; // BCP-47, e.g. "es-ES"
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" }; // ISO 4217

/** Opaque owner identity: a user id OR an anonymous owner hash (auth arrives later). */
export type OwnerId = string & { readonly __brand: "OwnerId" };

// ── Case status (state machine) ─────────────────────────────────────

/**
 * Case lifecycle states (ARCHITECTURE.md §7, corrected by STRESS_TEST):
 * statuses ending in `_X` are informational "contexts" — the case stays in its
 * base state while a side activity (analysis running, contradictions pending) is active.
 */
export type CaseStatus =
  | "DRAFT"
  | "COLLECTING_INFORMATION"
  | "READY_FOR_ANALYSIS"
  | "ANALYZING_X"
  | "NEEDS_INFORMATION"
  | "HAS_CONTRADICTIONS"
  | "RESULT_AVAILABLE"
  | "ACTION_IN_PROGRESS"
  | "AWAITING_RESPONSE"
  | "ESCALATED"
  | "CLOSED";

// ── Facts ───────────────────────────────────────────────────────────

export type FactId = string & { readonly __brand: "FactId" };
export type FactKey = string & { readonly __brand: "FactKey" }; // namespaced by problem module, e.g. "contract.start_date"

/** FactProvenance (ARCHITECTURE.md §10, incl. user_resolved from STRESS_TEST fix #2). */
export type FactProvenance =
  | "USER_PROVIDED"
  | "DOCUMENT_EXTRACTED"
  | "AI_INTERPRETED"
  | "DERIVED"
  | "SYSTEM"
  | "USER_RESOLVED";

/**
 * FactStatus: `CONFIRMED` facts are usable by rules; `CONTRADICTED` facts block
 * dependent rules (they return unknown); `SUPERSEDED` facts are history.
 */
export type FactStatus = "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" | "SUPERSEDED";

/** Confidence buckets (STRESS_TEST fix #6: nominal, not pseudo-precise numerics). */
export type ConfidenceBucket = "USER" | "PARSER" | "OCR" | "AI" | "DERIVED";

/**
 * FactValue — a practical closed union (not an over-abstract type system).
 * Money is structured (minor units + currency); dates stay calendar dates.
 */
export type FactValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: IsoDate }
  | { type: "datetime"; value: IsoDateTime }
  | { type: "money"; value: Money }
  | { type: "enum"; value: string; options: readonly string[] }
  | { type: "object"; value: Record<string, unknown> };

/** Pointer to future evidence (documents/OCR arrive in Fase 5+; reference is stable now). */
export interface EvidenceReference {
  /** Stable id of the evidence item (future `evidence.id` in DB). */
  readonly evidenceId: string;
  /** Optional document id (future `documents.id`). */
  readonly documentId?: string;
  /** Human/machine locatable position, e.g. "page 2", "section 4.1", "ocr-line 17". */
  readonly location?: string;
}

/** A resolution recorded when a user (or verified evidence) settles a contradiction. */
export interface ContradictionResolution {
  readonly resolvedBy: "USER" | "VERIFIED_EVIDENCE";
  /** The winning candidate — its fact id or a new fact created by the resolution. */
  readonly chosenFactId: FactId;
  /** Why (recorded verbatim; user language). Never silently overwritten. */
  readonly reason: string;
  readonly resolvedAt: IsoDateTime;
}

export interface Fact {
  readonly id: FactId;
  readonly caseId: string;
  readonly key: FactKey;
  readonly value: FactValue;
  readonly provenance: FactProvenance;
  readonly status: FactStatus;
  readonly confidence: ConfidenceBucket;
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** Resolution context when this fact settles a CONTRADICTED one (USER_RESOLVED provenance). */
  readonly resolution?: ContradictionResolution;
  /** Id of the fact this one supersedes (history chain, never deleted). */
  readonly supersedesId?: FactId;
  /** Id of the fact that superseded this one (set when it stops being current). */
  readonly supersededById?: FactId;
}

// ── Contradictions ──────────────────────────────────────────────────

export type ContradictionId = string & { readonly __brand: "ContradictionId" };
export type ContradictionStatus =
  "UNRESOLVED" | "RESOLVED_BY_USER" | "RESOLVED_BY_VERIFIED_EVIDENCE";

export interface Contradiction {
  readonly id: ContradictionId;
  readonly caseId: string;
  readonly factIdA: FactId;
  readonly factIdB: FactId;
  /** The conflicting fact key (both candidates share it by construction). */
  readonly factKey: FactKey;
  readonly status: ContradictionStatus;
  readonly resolution?: ContradictionResolution;
  readonly detectedAt: IsoDateTime;
  readonly resolvedAt?: IsoDateTime;
}

// ── Snapshots & provenance (STRESS_TEST fix #3) ─────────────────────

export type SnapshotId = string & { readonly __brand: "SnapshotId" };

/** Deterministic digest of the active ruleset at snapshot time (rules arrive in Fase 3+). */
export type RulesetHash = string & { readonly __brand: "RulesetHash" };

export interface CaseSnapshot {
  readonly id: SnapshotId;
  readonly caseId: string;
  readonly previousSnapshotId?: SnapshotId;
  readonly engineVersion: string;
  readonly rulesetHash?: RulesetHash;
  /** sourceId → version, frozen at evaluation time. */
  readonly sourceVersions: Readonly<Record<string, string>>;
  /** AI request ids that contributed facts to this snapshot (Fase 6 populates it). */
  readonly aiRequestIds: readonly string[];
  readonly factIds: readonly FactId[];
  readonly contradictionIds: readonly ContradictionId[];
  readonly createdAt: IsoDateTime;
}

// ── Domain events (traceability — NOT event sourcing, STRESS_TEST §14) ──

export type CaseEventType =
  | "CASE_CREATED"
  | "CASE_STATUS_CHANGED"
  | "FACT_ADDED"
  | "FACT_UPDATED"
  | "FACT_SUPERSEDED"
  | "CONTRADICTION_DETECTED"
  | "CONTRADICTION_RESOLVED"
  | "EVIDENCE_CREATED"
  | "EVIDENCE_STATUS_CHANGED"
  | "EVIDENCE_REPLACED"
  | "EVIDENCE_LINKED_TO_FACT"
  | "EVIDENCE_UNLINKED_FROM_FACT"
  | "SNAPSHOT_CREATED"
  | "CASE_UPDATED"
  | "DOCUMENT_UPLOADED"
  | "ANALYSIS_RECALCULATED"
  | "DOCUMENT_GENERATED"
  | "DOCUMENT_FINALIZED"
  | "COMMUNICATION_RECORDED"
  | "FOLLOW_UP_CREATED"
  | "CASE_ESCALATED"
  | "CASE_REOPENED"
  | "CASE_CLOSED";

export type CaseEventPayload = Readonly<Record<string, string | number | boolean | null>>;

export interface CaseEvent {
  readonly id: string;
  readonly caseId: string;
  readonly type: CaseEventType;
  readonly occurredAt: IsoDateTime;
  /** Small, PII-free structured payload (e.g. { factKey, from, to }). */
  readonly payload: CaseEventPayload;
}

// ── Communications ────────────────────────────────────────────────

export type CommunicationDirection = "SENT" | "RECEIVED" | "PHONE_CALL" | "IN_PERSON" | "OTHER";
export type CommunicationChannel =
  "EMAIL" | "LETTER" | "PHONE" | "ONLINE_FORM" | "IN_PERSON" | "OTHER";

export interface CaseCommunication {
  readonly id: string;
  readonly caseId: string;
  readonly direction: CommunicationDirection;
  readonly channel: CommunicationChannel;
  readonly occurredAt: IsoDateTime;
  readonly counterparty: string;
  readonly subject?: string;
  readonly summary: string;
  readonly linkedEvidenceIds: readonly string[];
  readonly linkedDocumentId?: string;
  readonly relatedActionId?: string;
  readonly createdAt: IsoDateTime;
}

// ── Case timeline summary ─────────────────────────────────────────

export interface CaseTimelineEntry {
  readonly eventId: string;
  readonly caseId: string;
  readonly type: CaseEventType;
  readonly occurredAt: IsoDateTime;
  readonly payload: CaseEventPayload;
  readonly description: string;
}

// ── Optimistic concurrency ──────────────────────────────────────────

export type CaseVersion = number & { readonly __brand: "CaseVersion" };

/** A Case aggregate with optimistic-locking version (STRESS_TEST fix #8). */
export interface Case {
  readonly id: string;
  readonly problemSlug: ProblemSlug;
  readonly jurisdiction: JurisdictionCode;
  readonly locale: Locale;
  readonly currency: CurrencyCode;
  readonly status: CaseStatus;
  readonly ownerId: OwnerId;
  readonly version: CaseVersion;
  readonly currentSnapshotId?: SnapshotId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}
