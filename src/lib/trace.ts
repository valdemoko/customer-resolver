/**
 * Public traceability of the analysis: which facts a rule reads, and which
 * source backs it.
 *
 * Used by the problem pages and `/como-funciona` to *show* the method instead of
 * describing it: HECHO → REGLA → ARTÍCULO → FUENTE → CONCLUSIÓN.
 *
 * Everything here is derived from the modules themselves (the same rule sets the
 * engine evaluates and the same sources it cites). Nothing is hand-copied, so the
 * demo cannot drift from the analysis — the failure mode that made the old
 * `/fuentes` page attribute an article to the wrong law.
 */
import type { Condition, Rule } from "@core/rules";
import { createProblemRegistry } from "@server/problems/registry";
import { moduleCodeRules } from "@server/rules/publish-module-rules";

import { getSourceGroups, type PublicSource } from "./source-catalogue";

/** One fact a rule reads. */
export interface TraceFact {
  /** Namespaced fact key, e.g. `cancellation.notice_days`. */
  readonly key: string;
  /** Human sentence from the module's fact catalogue. */
  readonly label: string;
  /** True when the system computes it (no question can supply it). */
  readonly derived: boolean;
}

/** One rule of the module, with the facts it reads and the sources it cites. */
export interface TraceRule {
  readonly key: string;
  readonly title: string;
  readonly facts: readonly TraceFact[];
  readonly sources: readonly PublicSource[];
}

export interface ProblemTrace {
  readonly problemKey: string;
  readonly problemTitle: string;
  readonly rules: readonly TraceRule[];
  /** Every fact read by at least one rule, in catalogue order. */
  readonly factCount: number;
  /** Every distinct source cited by at least one rule. */
  readonly sourceCount: number;
}

/**
 * Fact keys read by a condition tree.
 *
 * Walks the closed condition vocabulary (see `@core/rules/types`): only leaves
 * carry keys, so this is a pure, total function over the rule definition — no
 * evaluation, no facts required.
 */
export function collectFactKeys(condition: Condition): string[] {
  switch (condition.kind) {
    case "ALL":
    case "ANY":
      return condition.conditions.flatMap(collectFactKeys);
    case "NOT":
      return collectFactKeys(condition.condition);
    case "DATE_DIFFERENCE":
      return [condition.startFact as string, condition.endFact as string];
    case "DATE_AFTER_FACT":
    case "DATE_BEFORE_FACT":
      return [condition.key as string, condition.otherKey as string];
    case "FACT_EXISTS":
    case "FACT_EQUALS":
    case "FACT_NOT_EQUALS":
    case "FACT_GREATER_THAN":
    case "FACT_LESS_THAN":
    case "FACT_GREATER_OR_EQUAL":
    case "FACT_LESS_OR_EQUAL":
    case "DATE_BEFORE":
    case "DATE_AFTER":
    case "DATE_WITHIN_DAYS":
    case "BOOLEAN_IS_TRUE":
    case "BOOLEAN_IS_FALSE":
      return [condition.key as string];
    default:
      return [];
  }
}

/** First useful clause of a catalogue description, for a compact label. */
function shortLabel(description: string): string {
  const cut = description.split(/[.(]/)[0]?.trim() ?? description;
  return cut.length > 110 ? `${cut.slice(0, 107)}…` : cut;
}

function publishedRules(problemKey: string): readonly Rule[] {
  return moduleCodeRules(problemKey).filter((rule) => rule.status === "PUBLISHED");
}

/**
 * Traceability of a problem: its published rules, the facts each one reads and
 * the official sources it cites.
 */
export function getProblemTrace(problemKey: string, problemTitle: string): ProblemTrace {
  const group = getSourceGroups().find((entry) => entry.key === problemKey);
  const sourcesById = new Map<string, PublicSource>(
    (group?.sources ?? []).map((source) => [source.id, source]),
  );

  const factCatalogue = (() => {
    try {
      return createProblemRegistry().get(problemKey).factCatalogue;
    } catch {
      return [];
    }
  })();

  const factsByKey = new Map(
    factCatalogue.map((fact) => [
      fact.key as string,
      {
        key: fact.key as string,
        label: shortLabel(fact.description),
        derived: !fact.questionId,
      } satisfies TraceFact,
    ]),
  );

  const allFactKeys = new Set<string>();
  const rules: TraceRule[] = publishedRules(problemKey).map((rule) => {
    const keys = [...new Set(collectFactKeys(rule.root))];
    keys.forEach((key) => allFactKeys.add(key));

    return {
      key: rule.key,
      title: rule.title,
      facts: keys.map(
        (key) =>
          factsByKey.get(key) ?? { key, label: key, derived: false },
      ),
      sources: rule.sourceIds
        .map((id) => sourcesById.get(id))
        .filter((source): source is PublicSource => Boolean(source)),
    };
  });

  const sourceIds = new Set(rules.flatMap((rule) => rule.sources.map((s) => s.id)));

  return {
    problemKey,
    problemTitle,
    rules,
    factCount: allFactKeys.size,
    sourceCount: sourceIds.size,
  };
}
