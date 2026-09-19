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
    id: uuid("id").primaryKey(),
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
    supersededById: uuid("superseded_by_id"),
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
    sourceId: uuid("source_id")
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
