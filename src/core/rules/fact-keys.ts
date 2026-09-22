/**
 * Which facts does a rule actually read? (pure tree walk)
 *
 * The condition vocabulary is closed (see `./types`), so the fact keys a rule
 * depends on can be read straight off its `root`. This is what makes it possible
 * to ask the user for exactly the data the analysis needs, instead of guessing
 * from the module's `required` flags alone.
 *
 * PURE and DETERMINISTIC: no I/O, no clock, no registry.
 */
import type { FactKey } from "../types";
import type { Condition, Rule } from "./types";

/**
 * Collect every fact key referenced by a condition tree into `into`.
 *
 * Composite conditions recurse; leaf conditions carry their keys in one of
 * three shapes (`key`, `key`+`otherKey`, `startFact`+`endFact`).
 */
export function collectConditionFactKeys(
  condition: Condition,
  into: Set<FactKey> = new Set<FactKey>(),
): Set<FactKey> {
  if ("conditions" in condition) {
    for (const child of condition.conditions) collectConditionFactKeys(child, into);
    return into;
  }
  if ("condition" in condition) {
    collectConditionFactKeys(condition.condition, into);
    return into;
  }

  if ("key" in condition) into.add(condition.key);
  if ("otherKey" in condition) into.add(condition.otherKey);
  if ("startFact" in condition) into.add(condition.startFact);
  if ("endFact" in condition) into.add(condition.endFact);

  return into;
}

/** Every fact key read by any of the given rules. */
export function collectRuleFactKeys(rules: readonly Rule[]): ReadonlySet<FactKey> {
  const keys = new Set<FactKey>();
  for (const rule of rules) collectConditionFactKeys(rule.root, keys);
  return keys;
}
