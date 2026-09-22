/**
 * Publishes the code-defined module rule sets into the database.
 *
 * Why this exists: rules are authored in code (src/problems, one rules file per
 * module) with a DRAFT → REVIEWED → VERIFIED → PUBLISHED lifecycle and verified official
 * sources. The rule engine, however, only evaluates rules marked PUBLISHED in
 * the `rules` table — so without this step the analysis of every case fails with
 * "rules not available as PUBLISHED" and no result can ever be produced.
 *
 * Guarantees:
 *  - Idempotent: existing (key, version) pairs are never rewritten. Published
 *    definitions are immutable, so re-running is a no-op, not a mutation.
 *  - Sources first: a rule may only reference sources that already exist.
 *  - Deterministic: iterates the registry and the rule sets in a fixed order.
 *  - Runs at most once per server instance (see `ensureModuleRuleSetsPublished`).
 */
import type { Rule, Source } from "@core/rules";
import type { ProblemModuleDefinition, ProblemRegistry } from "@core/problems/contract";
import {
  computeIntakeRequirements,
  type IntakeRequirements,
} from "@core/problems/requirements";
import type { RulesRepository } from "@server/db/repositories/rules-repository";

import {
  buildRules as buildCancellationChargeRules,
  buildSources as buildCancellationChargeSources,
} from "@problems/cancellation-charge";
import {
  buildRules as buildNoDeliveryRefundRules,
  buildSources as buildNoDeliveryRefundSources,
} from "@problems/no-delivery-refund";
import {
  buildRules as buildWarrantyRejectionRules,
  buildSources as buildWarrantyRejectionSources,
} from "@problems/warranty-rejection";
import {
  buildRules as buildFlightCancelRules,
  buildSources as buildFlightCancelSources,
} from "@problems/flight-cancel";

interface ModuleRuleSet {
  readonly rules: () => readonly Rule[];
  readonly sources: () => readonly Source[];
}

/**
 * Explicit module → rule set map. Adding a problem module means registering it
 * here as well; an unknown module key is skipped rather than silently analysed
 * against no rules (the analysis surfaces that mismatch on its own).
 */
const MODULE_RULE_SETS: Readonly<Record<string, ModuleRuleSet>> = {
  "cancellation-charge": {
    rules: () => Object.values(buildCancellationChargeRules()) as Rule[],
    sources: buildCancellationChargeSources,
  },
  "no-delivery-refund": {
    rules: () => Object.values(buildNoDeliveryRefundRules()) as Rule[],
    sources: buildNoDeliveryRefundSources,
  },
  "warranty-rejection": {
    rules: () => Object.values(buildWarrantyRejectionRules()) as Rule[],
    sources: buildWarrantyRejectionSources,
  },
  "flight-cancel": {
    rules: () => Object.values(buildFlightCancelRules()) as Rule[],
    sources: buildFlightCancelSources,
  },
};

const codeRulesCache = new Map<string, readonly Rule[]>();

/**
 * The module's code-defined rules (no database access). Used to know which facts
 * an analysis reads, so the questionnaire can ask exactly those.
 */
export function moduleCodeRules(moduleKey: string): readonly Rule[] {
  const cached = codeRulesCache.get(moduleKey);
  if (cached) return cached;
  const ruleSet = MODULE_RULE_SETS[moduleKey];
  const rules = ruleSet ? ruleSet.rules() : [];
  codeRulesCache.set(moduleKey, rules);
  return rules;
}

/**
 * Which facts must be collected before this module's analysis can conclude.
 * Derived facts (deadlines, distances, tiers) are excluded: the system computes
 * them from their inputs, so asking the user for them would be nonsense.
 */
export function moduleIntakeRequirements(module: ProblemModuleDefinition): IntakeRequirements {
  // Only rules that will actually be evaluated count: a code-defined DRAFT rule
  // (deliberately unpublished) must not make the questionnaire ask for facts no
  // analysis will ever read.
  const evaluable = moduleCodeRules(module.key).filter((rule) => rule.status === "PUBLISHED");
  return computeIntakeRequirements(module, evaluable);
}

export interface PublishSummary {
  readonly sourcesPublished: number;
  readonly rulesPublished: number;
  readonly rulesAlreadyPresent: number;
  readonly modulesWithoutRuleSet: readonly string[];
}

/**
 * Publish every registered module's rules + sources. Idempotent: safe to call on
 * every request, though normally called once per instance.
 */
export async function publishModuleRuleSets(
  registry: ProblemRegistry,
  rulesRepo: RulesRepository,
): Promise<PublishSummary> {
  const existing = new Set(
    (await rulesRepo.listRules()).map((rule) => `${rule.key}@${rule.version}`),
  );

  let sourcesPublished = 0;
  let rulesPublished = 0;
  let rulesAlreadyPresent = 0;
  const modulesWithoutRuleSet: string[] = [];

  for (const problemModule of registry.list()) {
    const ruleSet = MODULE_RULE_SETS[problemModule.key];
    if (!ruleSet) {
      modulesWithoutRuleSet.push(problemModule.key);
      continue;
    }

    // Sources first: rules reference them by id.
    for (const source of ruleSet.sources()) {
      await rulesRepo.saveSource(source);
      sourcesPublished += 1;
    }

    // Rules: only insert what is missing. A published definition is immutable,
    // so re-saving one would be either a no-op or an error — never a change.
    for (const rule of ruleSet.rules()) {
      if (existing.has(`${rule.key}@${rule.version}`)) {
        rulesAlreadyPresent += 1;
        continue;
      }
      await rulesRepo.saveRule(rule);
      existing.add(`${rule.key}@${rule.version}`);
      rulesPublished += 1;
    }
  }

  return { sourcesPublished, rulesPublished, rulesAlreadyPresent, modulesWithoutRuleSet };
}

let publishOnce: Promise<PublishSummary> | null = null;

/**
 * Publish once per server instance. On failure the cache is cleared so the next
 * request retries (a cold start or a transient DB error must not permanently
 * disable analysis).
 */
export function ensureModuleRuleSetsPublished(
  registry: ProblemRegistry,
  rulesRepo: RulesRepository,
): Promise<PublishSummary> {
  if (!publishOnce) {
    publishOnce = publishModuleRuleSets(registry, rulesRepo).catch((error: unknown) => {
      publishOnce = null;
      throw error;
    });
  }
  return publishOnce;
}

/**
 * Route-facing wrapper: publishing must never turn a readable result into a 500.
 * If it fails, the analysis reports the missing rules itself, and the failure is
 * logged for diagnosis.
 */
export async function ensureRuleSetsPublishedSafe(
  registry: ProblemRegistry,
  rulesRepo: RulesRepository,
): Promise<void> {
  try {
    await ensureModuleRuleSetsPublished(registry, rulesRepo);
  } catch (error) {
    console.error(
      "[rules] could not publish module rule sets:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Test seam: forget that publishing already ran in this process. */
export function resetRulePublishCache(): void {
  publishOnce = null;
}
