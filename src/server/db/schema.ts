/**
 * Database schema (Fase 1) — mirrors src/core/types.ts 1:1 on semantic fields.
 * Persistence-only columns (surrogate ids, timestamps) live here, not in the core.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey(),
    problemSlug: text("problem_slug").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    ownerId: text("owner_id").notNull(),
    version: integer("version").notNull().default(1),
    currentSnapshotId: uuid("current_snapshot_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("cases_owner_idx").on(t.ownerId), index("cases_problem_idx").on(t.problemSlug)],
);

export const caseFacts = pgTable(
  "case_facts",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(), // FactValue (typed union, Zod-validated at rest boundary)
    provenance: text("provenance").notNull(),
    status: text("status").notNull(),
    confidence: text("confidence").notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull().default([]),
    resolution: jsonb("resolution"),
    supersedesId: uuid("supersedes_id"),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("case_facts_case_key_idx").on(t.caseId, t.key),
    index("case_facts_case_status_idx").on(t.caseId, t.status),
  ],
);

export const caseContradictions = pgTable(
  "case_contradictions",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    factIdA: uuid("fact_id_a").notNull(),
    factIdB: uuid("fact_id_b").notNull(),
    factKey: text("fact_key").notNull(),
    status: text("status").notNull(),
    resolution: jsonb("resolution"),
    detectedAt: timestamp("detected_at", { withTimezone: true, mode: "string" }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [index("case_contradictions_case_idx").on(t.caseId, t.status)],
);

export const caseSnapshots = pgTable(
  "case_snapshots",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    previousSnapshotId: uuid("previous_snapshot_id"),
    engineVersion: text("engine_version").notNull(),
    rulesetHash: text("ruleset_hash"),
    sourceVersions: jsonb("source_versions").notNull().default({}),
    aiRequestIds: jsonb("ai_request_ids").notNull().default([]),
    factIds: jsonb("fact_ids").notNull().default([]),
    contradictionIds: jsonb("contradiction_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("case_snapshots_case_idx").on(t.caseId, t.createdAt)],
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("case_events_case_idx").on(t.caseId, t.occurredAt)],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  /** Reserved for future multi-tenancy scoping; unused in Fase 1. */
  scope: text("scope"),
});

/**
 * Evidence (Fase 2). Metadata and content *representation* only — no bytes.
 * Content lives in a JSONB union (`text` / `url` / `file` descriptor).
 */
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    content: jsonb("content").notNull(),
    label: text("label"),
    checksum: text("checksum"),
    replacesEvidenceId: uuid("replaces_evidence_id"),
    replacedByEvidenceId: uuid("replaced_by_evidence_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("evidence_case_idx").on(t.caseId, t.status),
    index("evidence_checksum_idx").on(t.checksum),
  ],
);

/**
 * Rules (Fase 3). Definitions are DECLARATIVE DATA validated with Zod at the
 * boundary — never executed. (key, version) is unique; published versions are
 * immutable (enforced in the domain layer).
 */
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    scope: jsonb("scope").notNull(),
    rootCondition: jsonb("root_condition").notNull(),
    sourceIds: jsonb("source_ids").notNull().default([]),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("rules_key_version_unique").on(t.key, t.version),
    index("rules_status_idx").on(t.status, t.key),
  ],
);

/** Official sources with identity + version metadata + human verification. */
export const sources = pgTable(
  "sources",
  {
    // Source ids are DOMAIN identifiers ("src-es-trlgdcu-art-117"), not UUIDs:
    // rules reference them by these stable ids. Widened to text in 0011.
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull().unique(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull(),
    url: text("url").notNull(),
    jurisdiction: jsonb("jurisdiction").notNull(),
    type: text("type").notNull(),
    publishedOn: text("published_on"),
    effectiveFrom: text("effective_from"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "string" }).notNull(),
    versionIdentifier: text("version_identifier").notNull(),
    status: text("status").notNull(),
    verification: jsonb("verification"),
    supersededById: text("superseded_by_id"),
    relevantSection: text("relevant_section"),
  },
  (t) => [index("sources_status_idx").on(t.status)],
);

/** Explicit rule ↔ source traceability (queryable, not hidden in JSONB). */
export const ruleSources = pgTable(
  "rule_sources",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    ruleKey: text("rule_key").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    claim: text("claim").notNull(),
  },
  (t) => [
    uniqueIndex("rule_sources_unique").on(t.ruleId, t.sourceId),
    index("rule_sources_source_idx").on(t.sourceId),
  ],
);

/** Persisted rule evaluations — append-only audit, reproducible. */
export const ruleEvaluations = pgTable(
  "rule_evaluations",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    status: text("status").notNull(),
    evaluation: jsonb("evaluation").notNull(),
    rulesetHash: text("ruleset_hash"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("rule_evaluations_case_idx").on(t.caseId, t.evaluatedAt)],
);

/** N:N evidence ↔ fact with explicit semantics (SUPPORTS ≠ proven truth). */
export const evidenceFactLinks = pgTable(
  "evidence_fact_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    factId: uuid("fact_id")
      .notNull()
      .references(() => caseFacts.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    location: text("location"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("evidence_fact_unique_idx").on(t.evidenceId, t.factId, t.relation),
    index("evidence_fact_fact_idx").on(t.factId),
  ],
);

// ── Fase 5: Document Intelligence ───────────────────────────────────

/** Physical objects: stored bytes metadata (actual bytes live in ObjectStorage). */
export const physicalObjects = pgTable(
  "physical_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    originalFilename: text("original_filename"),
    status: text("status").notNull().default("STORED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("physical_objects_case_idx").on(t.caseId, t.status),
    index("physical_objects_evidence_idx").on(t.evidenceId),
    index("physical_objects_checksum_idx").on(t.checksumSha256),
  ],
);

/** Document processing runs: append-only audit of extraction attempts. */
export const documentProcessingRuns = pgTable(
  "document_processing_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    physicalObjectId: uuid("physical_object_id")
      .notNull()
      .references(() => physicalObjects.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    extractorType: text("extractor_type").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    result: jsonb("result"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [
    index("processing_runs_case_idx").on(t.caseId, t.createdAt),
    index("processing_runs_physical_idx").on(t.physicalObjectId),
    uniqueIndex("processing_runs_physical_version_unique").on(
      t.physicalObjectId,
      t.extractorVersion,
    ),
  ],
);

/** Document locations: where in a document a piece of content was found. */
export const documentLocations = pgTable(
  "document_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    physicalObjectId: uuid("physical_object_id")
      .notNull()
      .references(() => physicalObjects.id, { onDelete: "cascade" }),
    processingRunId: uuid("processing_run_id")
      .notNull()
      .references(() => documentProcessingRuns.id, { onDelete: "cascade" }),
    page: integer("page"),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    boundingBox: jsonb("bounding_box"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("document_locations_physical_idx").on(t.physicalObjectId)],
);

/** Document fact candidates: proposed facts from extraction (NOT confirmed). */
/**
 * AI request provenance (Fase 6) — append-only audit trail.
 * Stores identifiers/metrics ONLY: never prompts, never document content,
 * never PII. Attempts are a JSONB trace (per-attempt provider/model/status);
 * a separate ai_attempts table is deliberately avoided — the per-request
 * trace is small, bounded and always read together with its request.
 */
export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey(), // = aiRequestId
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    provider: text("provider"),
    model: text("model"),
    promptId: text("prompt_id").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull(),
    usage: jsonb("usage"),
    attempts: jsonb("attempts").notNull().default([]),
    durationMs: integer("duration_ms").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("ai_requests_case_idx").on(t.caseId, t.createdAt),
    index("ai_requests_task_idx").on(t.task, t.status),
    index("ai_requests_input_hash_idx").on(t.inputHash),
  ],
);

// ── Fase 11: Production persistence infrastructure ───────────────

/**
 * Durable AI budget per case (Fase 11).
 * Replaces the in-memory Map in budget-store.ts.
 * Atomic UPDATE ensures concurrent requests cannot exceed the global limit.
 */
export const aiBudgets = pgTable(
  "ai_budgets",
  {
    caseId: uuid("case_id")
      .primaryKey()
      .references(() => cases.id, { onDelete: "cascade" }),
    task: text("task").notNull().default("PROBLEM_INTERPRETATION"),
    count: integer("count").notNull().default(0),
    maxAllowed: integer("max_allowed").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("ai_budgets_task_idx").on(t.task, t.count)],
);

/**
 * Distributed rate limiting (Fase 11).
 * Sliding-window counter with automatic expiry.
 * scope+key+window_start is unique — concurrent inserts are safe via ON CONFLICT.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "string" }).notNull(),
    count: integer("count").notNull().default(1),
    maxRequests: integer("max_requests").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("rate_limits_scope_key_window_idx").on(t.scope, t.key, t.windowStart),
    index("rate_limits_expires_idx").on(t.expiresAt),
  ],
);

// ── Fase 12: Generated Documents ──────────────────────────────────

/**
 * Generated documents (Fase 12).
 * Stores document metadata and content. Files are in R2.
 * Versioning: each version is a separate row linked by previous_version_id.
 */
export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    format: text("format").notNull().default("txt"),
    title: text("title").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    /** Full document content as JSONB (sections, statements, citations). */
    content: jsonb("content").notNull(),
    /** Analysis snapshot that produced this document. */
    analysisSnapshotId: uuid("analysis_snapshot_id"),
    /** AI request that generated the draft. */
    aiRequestId: uuid("ai_request_id"),
    /** Prompt used for generation. */
    promptId: text("prompt_id"),
    promptVersion: integer("prompt_version"),
    /** Storage key for the exported file (R2). */
    storageKey: text("storage_key"),
    fileSize: integer("file_size"),
    /** Previous version (for version chain). */
    previousVersionId: uuid("previous_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("generated_documents_case_idx").on(t.caseId, t.createdAt),
    index("generated_documents_status_idx").on(t.status),
    uniqueIndex("generated_documents_case_version_idx").on(t.caseId, t.version),
  ],
);

// ── Fase 14: Research Resolver ──────────────────────────────────

/**
 * Research sessions (Fase 14).
 * Stores research investigations for unsupported problems.
 */
export const researchSessions = pgTable(
  "research_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("RESEARCH_PENDING"),
    jurisdiction: text("jurisdiction").notNull(),
    problemDescription: text("problem_description").notNull(),
    legalDomain: text("legal_domain").notNull(),
    researchVersion: text("research_version").notNull(),
    previousResearchId: uuid("previous_research_id"),
    plan: jsonb("plan").notNull(),
    aiRequestIds: jsonb("ai_request_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [index("idx_research_sessions_case_idx").on(t.caseId, t.createdAt)],
);

/**
 * Research findings (Fase 14).
 * Stores conclusions from source analysis.
 */
export const researchFindings = pgTable(
  "research_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchId: uuid("research_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    proposition: text("proposition").notNull(),
    status: text("status").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    reasoningSummary: text("reasoning_summary").notNull(),
    uncertainty: text("uncertainty"),
    researchVersion: text("research_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("idx_research_findings_research_idx").on(t.researchId)],
);

/**
 * Research sources (Fase 14).
 * Stores sources discovered during research.
 */
export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchId: uuid("research_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").references(() => researchFindings.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    sourceType: text("source_type").notNull(),
    authority: text("authority").notNull(),
    publicationDate: text("publication_date"),
    effectiveDate: text("effective_date"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: "string" }).notNull(),
    versionIdentifier: text("version_identifier"),
    relevantSection: text("relevant_section"),
    contentHash: text("content_hash"),
    validationStatus: text("validation_status").notNull().default("UNVERIFIED"),
    validationNotes: text("validation_notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_research_sources_research_idx").on(t.researchId),
    index("idx_research_sources_validation_idx").on(t.validationStatus),
  ],
);

/**
 * Research conflicts (Fase 14).
 * Stores conflicts between sources.
 */
export const researchConflicts = pgTable(
  "research_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchId: uuid("research_id")
      .notNull()
      .references(() => researchSessions.id, { onDelete: "cascade" }),
    conflictType: text("conflict_type").notNull(),
    sourceAId: uuid("source_a_id")
      .notNull()
      .references(() => researchSources.id),
    sourceBId: uuid("source_b_id")
      .notNull()
      .references(() => researchSources.id),
    description: text("description").notNull(),
    resolutionStatus: text("resolution_status").notNull().default("UNRESOLVED"),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("idx_research_conflicts_research_idx").on(t.researchId)],
);

export const caseCommunications = pgTable(
  "case_communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    channel: text("channel").notNull(),
    counterparty: text("counterparty").notNull(),
    subject: text("subject"),
    summary: text("summary").notNull(),
    linkedEvidenceIds: jsonb("linked_evidence_ids").notNull().default([]),
    linkedDocumentId: uuid("linked_document_id"),
    relatedActionId: text("related_action_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("idx_communications_case_idx").on(t.caseId, t.occurredAt),
    index("idx_communications_direction_idx").on(t.direction),
  ],
);

export const documentFactCandidates = pgTable(
  "document_fact_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    physicalObjectId: uuid("physical_object_id")
      .notNull()
      .references(() => physicalObjects.id, { onDelete: "cascade" }),
    processingRunId: uuid("processing_run_id")
      .notNull()
      .references(() => documentProcessingRuns.id, { onDelete: "cascade" }),
    factKey: text("fact_key").notNull(),
    proposedValue: jsonb("proposed_value").notNull(),
    locationId: uuid("location_id").references(() => documentLocations.id),
    extractorVersion: text("extractor_version").notNull(),
    extractorConfidence: integer("extractor_confidence"),
    relation: text("relation").notNull().default("EXTRACTED"),
    certainty: text("certainty"),
    aiRequestId: uuid("ai_request_id"),
    linkedFactId: uuid("linked_fact_id").references(() => caseFacts.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    index("fact_candidates_case_idx").on(t.caseId, t.factKey),
    index("fact_candidates_evidence_idx").on(t.evidenceId),
    index("fact_candidates_run_idx").on(t.processingRunId),
  ],
);
