/**
 * Rule factory & versioning (Fase 3).
 * A published rule's definition is immutable: changing anything creates v+1.
 */
import { DomainError } from "@lib/errors";
import { newId } from "./ids";
import type { Rule, RuleDefinition, RuleStatus } from "./types";

const RULE_STATUS_FLOW: Readonly<Record<RuleStatus, readonly RuleStatus[]>> = {
  DRAFT: ["REVIEWED", "DEPRECATED"],
  REVIEWED: ["VERIFIED", "DEPRECATED"],
  VERIFIED: ["PUBLISHED", "DEPRECATED"],
  PUBLISHED: ["DEPRECATED"],
  DEPRECATED: [],
};

export function createRule(definition: RuleDefinition): Rule {
  validateDefinition(definition);
  return {
    ...definition,
    id: newId() as Rule["id"],
    status: "DRAFT",
    createdAt: new Date().toISOString(),
  };
}

export function transitionRuleStatus(rule: Rule, to: RuleStatus): Rule {
  if (!RULE_STATUS_FLOW[rule.status].includes(to)) {
    throw new DomainError(`Invalid rule transition: ${rule.status} → ${to}`);
  }
  return { ...rule, status: to };
}

/**
 * Derive the next version from an existing rule. The original stays untouched;
 * the new version starts as DRAFT and must pass the full lifecycle again.
 */
export function nextRuleVersion(rule: Rule, changes: Partial<RuleDefinition>): Rule {
  const next: RuleDefinition = {
    ...rule,
    ...changes,
    key: rule.key,
    version: (rule.version + 1) as Rule["version"],
  };
  validateDefinition(next);
  return {
    ...next,
    id: newId() as Rule["id"],
    status: "DRAFT",
    createdAt: new Date().toISOString(),
  };
}

function validateDefinition(definition: RuleDefinition): void {
  if (!definition.key.includes(".")) {
    throw new DomainError(`Rule key must be namespaced ("domain.rule"), got: ${definition.key}`);
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new DomainError(`Rule version must be a positive integer`);
  }
  if (definition.title.trim().length === 0) {
    throw new DomainError("Rule requires a title");
  }
  if (definition.root.kind === "ALL" && definition.root.conditions.length === 0) {
    throw new DomainError("Rule root ALL composition cannot be empty");
  }
  if (definition.root.kind === "ANY" && definition.root.conditions.length === 0) {
    throw new DomainError("Rule root ANY composition cannot be empty");
  }
}
