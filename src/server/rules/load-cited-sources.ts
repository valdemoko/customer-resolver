/**
 * Resolves the official sources cited by a set of rule evaluations.
 *
 * The Result Engine never fabricates references: a claim may only cite a source
 * that exists in the `sources` table with identity, version and verification
 * metadata. This is the missing half of that contract — the evaluations carry
 * `sourceIds`, and this turns them into displayable, traceable sources.
 */
import type { RuleEvaluation } from "@core/rules";
import type { SupportingSource } from "@core/result/types";
import type { RulesRepository } from "@server/db/repositories/rules-repository";

export async function loadCitedSources(
  rulesRepo: RulesRepository,
  evaluations: readonly RuleEvaluation[],
): Promise<readonly SupportingSource[]> {
  const citedIds = new Set<string>();
  for (const evaluation of evaluations) {
    for (const sourceId of evaluation.sourceIds) citedIds.add(sourceId as string);
  }
  if (citedIds.size === 0) return [];

  // Rule titles let each source state WHICH analysis it backs.
  const publishedRules = await rulesRepo.listRules("PUBLISHED");
  const titleByRuleKey = new Map(publishedRules.map((rule) => [rule.key, rule.title]));

  const backedBy = new Map<string, string[]>();
  for (const evaluation of evaluations) {
    const title = titleByRuleKey.get(evaluation.ruleKey) ?? evaluation.ruleKey;
    for (const sourceId of evaluation.sourceIds) {
      const key = sourceId as string;
      const list = backedBy.get(key) ?? [];
      if (!list.includes(title)) list.push(title);
      backedBy.set(key, list);
    }
  }

  const sources = await rulesRepo.listSources("VERIFIED");

  return sources
    .filter((source) => citedIds.has(source.id as string))
    .map((source) => ({
      sourceId: source.id as string,
      title: source.title,
      url: source.url,
      type: source.type,
      retrievedAt: source.retrievedAt,
      claim: (backedBy.get(source.id as string) ?? []).join(" · "),
    }));
}
