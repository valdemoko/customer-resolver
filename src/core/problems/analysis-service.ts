/**
 * Problem Analysis Service (Fase 4) — generic application service.
 *
 * Runs a Problem Module end-to-end over the F1–F3 substrate:
 *   case → facts → evidence → jurisdiction → rules → evaluations → snapshot.
 *
 * The core knows NO concrete problem: modules are resolved from a
 * ProblemRegistry injected by the composition root. Only PUBLISHED rules are
 * evaluated — draft rules never serve users. The service depends exclusively
 * on ports + pure domain logic (no Drizzle, no HTTP, no AI).
 */
import { DomainError } from "@lib/errors";
import type { CaseRepository } from "../ports";
import { CaseNotFoundError } from "../case/service";
import type { CaseService } from "../case/service";
import type { SnapshotId } from "../types";
import { isoDateDaysBetween } from "../shared/temporal";
import { evaluateRule, type Rule, type RuleEvaluation, type RuleEvaluationContext } from "../rules";
import { jurisdictionApplies } from "../rules/jurisdiction";
import type { ProblemModuleDefinition } from "./contract";
import { resolveNextQuestionWithValues } from "./intake";
import type { KnownFact } from "./intake";

/** Port: read the current PUBLISHED rules the analysis needs. */
export interface PublishedRulesProvider {
  getPublishedRules(keys: readonly string[]): Promise<readonly Rule[]>;
}

/** Thrown when the requested problem module is not registered. */
export class UnknownProblemError extends Error {
  readonly code = "UNKNOWN_PROBLEM";
  constructor(readonly problemKey: string) {
    super(`Unknown problem module: ${problemKey}`);
    this.name = "UnknownProblemError";
  }
}

/** Thrown when the case's jurisdiction is not supported by the module. */
export class UnsupportedJurisdictionError extends Error {
  readonly code = "UNSUPPORTED_JURISDICTION";
  constructor(
    readonly problemKey: string,
    readonly jurisdiction: string,
    readonly supported: readonly string[],
  ) {
    super(
      `Problem ${problemKey} does not support jurisdiction ${jurisdiction} ` +
        `(supported: ${supported.join(", ")})`,
    );
    this.name = "UnsupportedJurisdictionError";
  }
}

export interface ProblemAnalysis {
  readonly caseId: string;
  readonly problemKey: string;
  readonly moduleVersion: number;
  readonly jurisdiction: string;
  readonly evaluatedAt: string;
  /** Deterministic context date (injected, never new Date() inside rules). */
  readonly currentDate: string;
  readonly evaluations: readonly RuleEvaluation[];
  readonly snapshotId: SnapshotId;
  readonly intakeComplete: boolean;
  readonly missingRequiredFacts: readonly string[];
  readonly engineVersion: string;
}

export interface RunAnalysisOptions {
  /** Analysis date — injectable for reproducibility (defaults to now). */
  readonly currentDate?: string;
  /** sourceId → version identifier, frozen into the snapshot. */
  readonly sourceVersions?: Readonly<Record<string, string>>;
}

export interface ProblemAnalysisServiceDeps {
  readonly repo: CaseRepository;
  readonly caseService: CaseService;
  readonly rules: PublishedRulesProvider;
  /** Evaluation recorder port (implemented by the rules repository adapter). */
  readonly evaluationRecorder: {
    recordEvaluation(params: {
      caseId: string;
      evaluation: RuleEvaluation;
      rulesetHash?: string;
      evaluatedAt: string;
    }): Promise<void>;
  };
  readonly registry: {
    get(problemKey: string): ProblemModuleDefinition;
    has(problemKey: string): boolean;
  };
  readonly engineVersion?: string;
}

export class ProblemAnalysisService {
  private readonly engineVersion: string;

  constructor(private readonly deps: ProblemAnalysisServiceDeps) {
    this.engineVersion = deps.engineVersion ?? "1.0.0";
  }

  private get repo() {
    return this.deps.repo;
  }

  private get caseService() {
    return this.deps.caseService;
  }

  private get rules() {
    return this.deps.rules;
  }

  private get registry() {
    return this.deps.registry;
  }

  /**
   * Run the full module analysis for a case:
   * load aggregate → validate module/jurisdiction → build evaluation context
   * (facts + contradicted keys + evidence refs) → evaluate each PUBLISHED rule
   * of the module → persist evaluations + analysis snapshot atomically.
   */
  async runProblemAnalysis(caseId: string, options?: RunAnalysisOptions): Promise<ProblemAnalysis> {
    const loaded = await this.repo.loadCase(caseId);
    if (!loaded) throw new CaseNotFoundError(caseId);
    const problemKey = loaded.case.problemSlug as string;

    if (!this.registry.has(problemKey)) throw new UnknownProblemError(problemKey);
    const problemModule = this.registry.get(problemKey);

    const jurisdiction = loaded.case.jurisdiction as string;
    if (!problemModule.jurisdictions.includes(jurisdiction as never)) {
      throw new UnsupportedJurisdictionError(problemKey, jurisdiction, problemModule.jurisdictions);
    }

    // ── Build the pure evaluation context ────────────────────────────
    const contradictedKeys = new Set(
      loaded.contradictions
        .filter((c) => c.status === "UNRESOLVED")
        .map((c) => c.factKey as string),
    ) as unknown as Set<
      RuleEvaluationContext["contradictedKeys"] extends ReadonlySet<infer K> ? K : never
    >;
    const evidenceRefsByFact = new Map<string, string[]>();
    for (const link of loaded.evidenceLinks) {
      const refs = evidenceRefsByFact.get(link.factId) ?? [];
      refs.push(link.evidenceId);
      evidenceRefsByFact.set(link.factId, refs);
    }

    const currentFacts = loaded.facts.filter((f) => f.status !== "SUPERSEDED");
    const context: RuleEvaluationContext = {
      facts: currentFacts.map((f) => ({
        key: f.key,
        status: f.status,
        value: extractPrimitive(f.value),
        evidenceRefs:
          evidenceRefsByFact.get(f.id as string) ?? f.evidenceRefs.map((r) => r.evidenceId),
      })),
      contradictedKeys,
      jurisdiction: parseJurisdiction(jurisdiction),
      currentDate: (options?.currentDate ?? todayIso()) as RuleEvaluationContext["currentDate"],
    };

    // ── Evaluate only the module's PUBLISHED rules ───────────────────
    const published = await this.rules.getPublishedRules(problemModule.ruleKeys);
    const publishedKeys = new Set(published.map((r) => r.key));
    const missingRules = problemModule.ruleKeys.filter((k) => !publishedKeys.has(k));
    if (missingRules.length > 0) {
      throw new DomainError(
        `Problem ${problemKey}: rules not available as PUBLISHED: ${missingRules.join(", ")}`,
      );
    }

    // Cheap deterministic pre-filter: skip rules whose jurisdiction cannot match.
    const evaluations = published
      .filter((rule) => jurisdictionApplies(rule.scope, context.jurisdiction))
      .map((rule) => evaluateRule(rule, context));

    // ── Persist evaluations + snapshot ───────────────────────────────
    const evaluatedAt = new Date().toISOString();
    const sourceVersions = { ...(options?.sourceVersions ?? {}) };
    const hash = rulesetHash(published);

    for (const evaluation of evaluations) {
      await this.deps.evaluationRecorder.recordEvaluation({
        caseId,
        evaluation,
        rulesetHash: hash,
        evaluatedAt,
      });
    }

    const { snapshotId } = await this.caseService.createSnapshotForCase(caseId, {
      rulesetHash: hash as never,
      sourceVersions,
      at: evaluatedAt as never,
    });

    // ── Intake status (informational, drives the UI later) ───────────
    // "Complete" means every REQUIRED question's fact is known — optional
    // questions may remain unanswered without blocking analysis.
    const knownKeys = new Set(currentFacts.map((f) => f.key as string));
    const missingRequiredFacts = problemModule.intake
      .filter((q) => q.required && !knownKeys.has(q.factKey as string))
      .map((q) => q.factKey as string);
    const values = new Map(currentFacts.map((f) => [f.key as string, extractPrimitive(f.value)]));
    const known: KnownFact[] = currentFacts.map((f) => ({
      key: f.key,
      status: f.status,
    }));
    // Informational next-question resolution (consumed by the UI in a later phase);
    // completion semantics above are requirement-based, not presence-based.
    resolveNextQuestionWithValues(problemModule, known, values as never);

    return {
      caseId,
      problemKey,
      moduleVersion: problemModule.version,
      jurisdiction,
      evaluatedAt,
      currentDate: context.currentDate,
      evaluations,
      snapshotId,
      intakeComplete: missingRequiredFacts.length === 0,
      missingRequiredFacts,
      engineVersion: this.engineVersion,
    };
  }
}

/** Extract the comparable primitive from a FactValue for the evaluator context. */
function extractPrimitive(value: { type: string; value: unknown }): unknown {
  // money keeps its structured form (amountMinor/currency) — v1 rules cannot
  // compare it; enum/object values are passed as-is for FACT_EQUALS on strings.
  if (value && typeof value === "object" && "amountMinor" in (value as object)) {
    return value;
  }
  return (value as { value?: unknown }).value ?? value;
}

/** Parse "ES" / "ES-AN" into { country, region? }. */
function parseJurisdiction(code: string): { country: string; region?: string } {
  const dash = code.indexOf("-");
  if (dash === -1) return { country: code };
  return { country: code.slice(0, dash), region: code.slice(dash + 1) };
}

/** Today as an IsoDate (UTC) — the only permitted "now" read, injected via options. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic identity hash of the evaluated ruleset (same FNV-1a as infra). */
function rulesetHash(rules: readonly Rule[]): string {
  const canonical = JSON.stringify(
    rules
      .map((r) => ({ key: r.key, version: r.version }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.version - b.version),
  );
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(canonical, "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export { isoDateDaysBetween };
