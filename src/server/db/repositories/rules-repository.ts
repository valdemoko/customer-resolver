/**
 * Rules & Sources repository adapter (Fase 3).
 * Infrastructure-only. Definitions are validated with Zod at this boundary;
 * they are data, never executed (docs prompt §30).
 */
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import type { Condition, Rule, RuleStatus } from "@core/rules/types";
import type { Source, SourceStatus, SourceType } from "@core/rules/sources";
import type { RuleEvaluation } from "@core/rules/types";

import { ruleEvaluations, ruleSources, rules, sources } from "../schema";

// ── Zod boundary validation (rules/sources are data) ─────────────────

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("FACT_EXISTS"), key: z.string() }),
    z.object({
      kind: z.literal("FACT_EQUALS"),
      key: z.string(),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      kind: z.literal("FACT_NOT_EQUALS"),
      key: z.string(),
      notEquals: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({ kind: z.literal("FACT_GREATER_THAN"), key: z.string(), than: z.number() }),
    z.object({ kind: z.literal("FACT_LESS_THAN"), key: z.string(), than: z.number() }),
    z.object({ kind: z.literal("FACT_GREATER_OR_EQUAL"), key: z.string(), than: z.number() }),
    z.object({ kind: z.literal("FACT_LESS_OR_EQUAL"), key: z.string(), than: z.number() }),
    // `before`/`after` are OPTIONAL: omitted means "relative to the evaluation
    // date" (the evaluator falls back to the current date). Requiring them here
    // made every rule that asks "is this deadline still in the future?"
    // unpublishable, which silently disabled the whole analysis.
    z.object({ kind: z.literal("DATE_BEFORE"), key: z.string(), before: z.string().optional() }),
    z.object({ kind: z.literal("DATE_AFTER"), key: z.string(), after: z.string().optional() }),
    z.object({
      kind: z.literal("DATE_WITHIN_DAYS"),
      key: z.string(),
      withinDays: z.number(),
      referenceDate: z.string().optional(),
    }),
    z.object({ kind: z.literal("DATE_AFTER_FACT"), key: z.string(), otherKey: z.string() }),
    z.object({ kind: z.literal("DATE_BEFORE_FACT"), key: z.string(), otherKey: z.string() }),
    z.object({
      kind: z.literal("DATE_DIFFERENCE"),
      startFact: z.string(),
      endFact: z.string(),
      duration: z.number().int().positive(),
      unit: z.enum(["DAYS", "MONTHS"]),
      comparison: z.enum(["GREATER_THAN", "GREATER_OR_EQUAL"]),
    }),
    z.object({ kind: z.literal("BOOLEAN_IS_TRUE"), key: z.string() }),
    z.object({ kind: z.literal("BOOLEAN_IS_FALSE"), key: z.string() }),
    z.object({ kind: z.literal("ALL"), conditions: z.array(conditionSchema).min(1) }),
    z.object({ kind: z.literal("ANY"), conditions: z.array(conditionSchema).min(1) }),
    z.object({ kind: z.literal("NOT"), condition: conditionSchema }),
  ]),
) as z.ZodType<Condition>;

const scopeSchema = z.discriminatedUnion("level", [
  z.object({ level: z.literal("COUNTRY_WIDE"), country: z.string() }),
  z.object({ level: z.literal("REGIONAL"), country: z.string(), region: z.string() }),
]);

const ruleDefinitionSchema = z.object({
  key: z.string(),
  version: z.number().int().positive(),
  title: z.string().min(1),
  scope: scopeSchema,
  root: conditionSchema,
  sourceIds: z.array(z.string()),
});

const sourceSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  jurisdiction: z.object({ country: z.string(), region: z.string().optional() }),
  type: z.enum([
    "LAW",
    "REGULATION",
    "OFFICIAL_GUIDANCE",
    "OFFICIAL_DATA",
    "COURT_DECISION",
    "GOVERNMENT_PAGE",
    "OTHER_OFFICIAL",
  ]),
  publishedOn: z.string().optional(),
  effectiveFrom: z.string().optional(),
  versionIdentifier: z.string(),
  relevantSection: z.string().optional(),
});

export class RulesRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, never>>) {}

  // ── Rules ────────────────────────────────────────────────────────

  async saveRule(rule: Rule): Promise<Rule> {
    // Zod validation at the persistence boundary — invariant defense in depth.
    ruleDefinitionSchema.parse({
      key: rule.key,
      version: rule.version,
      title: rule.title,
      scope: rule.scope,
      root: rule.root,
      sourceIds: rule.sourceIds,
    });

    await this.db
      .insert(rules)
      .values({
        id: rule.id,
        key: rule.key,
        version: rule.version,
        title: rule.title,
        scope: rule.scope,
        rootCondition: rule.root,
        sourceIds: rule.sourceIds,
        status: rule.status,
        createdAt: rule.createdAt,
      })
      .onConflictDoUpdate({
        target: [rules.id],
        set: { status: rule.status }, // definition fields are immutable once stored
      });

    return rule;
  }

  async getRule(key: string, version: number): Promise<Rule | null> {
    const [row] = await this.db
      .select()
      .from(rules)
      .where(and(eq(rules.key, key), eq(rules.version, version)))
      .limit(1);
    if (!row) return null;
    return this.mapRule(row);
  }

  async listRules(status?: RuleStatus): Promise<readonly Rule[]> {
    const rows = status
      ? await this.db.select().from(rules).where(eq(rules.status, status)).orderBy(asc(rules.key))
      : await this.db.select().from(rules).orderBy(asc(rules.key));
    return rows.map((row) => this.mapRule(row));
  }

  private mapRule(row: typeof rules.$inferSelect): Rule {
    const definition = ruleDefinitionSchema.parse({
      key: row.key,
      version: row.version,
      title: row.title,
      scope: row.scope,
      root: row.rootCondition,
      sourceIds: row.sourceIds,
    });
    return {
      ...definition,
      id: row.id as Rule["id"],
      status: row.status as RuleStatus,
      createdAt: row.createdAt,
    } as unknown as Rule;
  }

  // ── Sources ──────────────────────────────────────────────────────

  async saveSource(source: Source): Promise<Source> {
    sourceSchema.parse({
      externalId: source.externalId,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      jurisdiction: source.jurisdiction,
      type: source.type,
      publishedOn: source.publishedOn,
      effectiveFrom: source.effectiveFrom,
      versionIdentifier: source.versionIdentifier,
      relevantSection: source.relevantSection,
    });

    await this.db
      .insert(sources)
      .values({
        id: source.id,
        externalId: source.externalId,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
        jurisdiction: source.jurisdiction,
        type: source.type,
        publishedOn: source.publishedOn ?? null,
        effectiveFrom: source.effectiveFrom ?? null,
        retrievedAt: source.retrievedAt,
        versionIdentifier: source.versionIdentifier,
        status: source.status,
        verification: source.verification ?? null,
        supersededById: source.supersededById ?? null,
        relevantSection: source.relevantSection ?? null,
      })
      .onConflictDoUpdate({
        target: [sources.id],
        set: {
          status: source.status,
          verification: source.verification ?? null,
          supersededById: source.supersededById ?? null,
        },
      });

    return source;
  }

  async getSource(id: string): Promise<Source | null> {
    const [row] = await this.db.select().from(sources).where(eq(sources.id, id)).limit(1);
    return row ? this.mapSource(row) : null;
  }

  async listSources(status?: SourceStatus): Promise<readonly Source[]> {
    const rows = status
      ? await this.db
          .select()
          .from(sources)
          .where(eq(sources.status, status))
          .orderBy(asc(sources.externalId))
      : await this.db.select().from(sources).orderBy(asc(sources.externalId));
    return rows.map((row) => this.mapSource(row));
  }

  private mapSource(row: typeof sources.$inferSelect): Source {
    const data = sourceSchema.parse({
      externalId: row.externalId,
      title: row.title,
      publisher: row.publisher,
      url: row.url,
      jurisdiction: row.jurisdiction,
      type: row.type,
      publishedOn: row.publishedOn ?? undefined,
      effectiveFrom: row.effectiveFrom ?? undefined,
      versionIdentifier: row.versionIdentifier,
      relevantSection: row.relevantSection ?? undefined,
    });
    return {
      id: row.id as Source["id"],
      ...data,
      type: row.type as SourceType,
      retrievedAt: row.retrievedAt,
      status: row.status as SourceStatus,
      verification: (row.verification ?? undefined) as Source["verification"],
      supersededById: (row.supersededById ?? undefined) as Source["supersededById"],
    };
  }

  // ── Rule ↔ Source traceability ───────────────────────────────────

  async linkRuleToSource(params: {
    ruleId: string;
    sourceId: string;
    ruleKey: string;
    ruleVersion: number;
    claim: string;
  }): Promise<void> {
    await this.db
      .insert(ruleSources)
      .values({
        ruleId: params.ruleId,
        sourceId: params.sourceId,
        ruleKey: params.ruleKey,
        ruleVersion: params.ruleVersion,
        claim: params.claim,
      })
      .onConflictDoNothing();
  }

  async listRuleSources(ruleKey: string, ruleVersion: number) {
    return this.db
      .select()
      .from(ruleSources)
      .where(and(eq(ruleSources.ruleKey, ruleKey), eq(ruleSources.ruleVersion, ruleVersion)));
  }

  // ── Persisted evaluations (append-only) ──────────────────────────

  async recordEvaluation(params: {
    caseId: string;
    evaluation: RuleEvaluation;
    rulesetHash?: string;
    evaluatedAt: string;
  }): Promise<void> {
    await this.db.insert(ruleEvaluations).values({
      id: crypto.randomUUID(),
      caseId: params.caseId,
      ruleKey: params.evaluation.ruleKey,
      ruleVersion: params.evaluation.ruleVersion,
      status: params.evaluation.status,
      evaluation: params.evaluation,
      rulesetHash: params.rulesetHash ?? null,
      evaluatedAt: params.evaluatedAt,
    });
  }

  async listEvaluationsForCase(caseId: string) {
    return this.db
      .select()
      .from(ruleEvaluations)
      .where(eq(ruleEvaluations.caseId, caseId))
      .orderBy(asc(ruleEvaluations.evaluatedAt));
  }

  /** Simple deterministic hash over the published ruleset (reproducibility). */
  rulesetHash(publishedRules: readonly Rule[]): string {
    const canonical = JSON.stringify(
      publishedRules
        .map((r) => ({ key: r.key, version: r.version }))
        .sort((a, b) => a.key.localeCompare(b.key) || a.version - b.version),
    );
    // Non-crypto FNV-1a is enough for ruleset identity; documented in the report.
    let hash = 0x811c9dc5;
    for (const byte of Buffer.from(canonical, "utf8")) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
}
