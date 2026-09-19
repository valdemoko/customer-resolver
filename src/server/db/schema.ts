/**
 * Database schema (Fase 1) — mirrors src/core/types.ts 1:1 on semantic fields.
 * Persistence-only columns (surrogate ids, timestamps) live here, not in the core.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
