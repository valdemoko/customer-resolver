/**
 * Source Registry (Fase 3).
 *
 * A source has identity + version metadata — never just a URL. A PUBLISHED
 * rule REQUIRES at least one VERIFIED, non-deprecated source; the gate is
 * enforced in code (human verification gate, docs prompt §16).
 */
import { DomainError } from "@lib/errors";
import type { Rule } from "./types";

export type SourceId = string & { readonly __brand: "SourceId" };

export type SourceType =
  | "LAW"
  | "REGULATION"
  | "OFFICIAL_GUIDANCE"
  | "OFFICIAL_DATA"
  | "COURT_DECISION"
  | "GOVERNMENT_PAGE"
  | "OTHER_OFFICIAL";

export type SourceStatus = "DRAFT" | "REVIEWED" | "VERIFIED" | "PUBLISHED" | "DEPRECATED";

export interface Source {
  readonly id: SourceId;
  /** Stable identifier independent of URL (e.g. "ES-LCGC-art94" or "TEST-SRC-1"). */
  readonly externalId: string;
  readonly title: string;
  readonly publisher: string;
  /** Treated as DATA. Never fetched automatically in this phase (§30 security). */
  readonly url: string;
  readonly jurisdiction: { readonly country: string; readonly region?: string };
  readonly type: SourceType;
  readonly publishedOn?: string;
  readonly effectiveFrom?: string;
  /** When WE retrieved/verified the content (reproducibility). */
  readonly retrievedAt: string;
  /** Publisher-side version/identifier (e.g. "BOE-A-2014-33296", "consolidation 2026-02"). */
  readonly versionIdentifier: string;
  readonly status: SourceStatus;
  readonly verification?: SourceVerification;
  /** If superseded by another source (history preserved, never overwritten). */
  readonly supersededById?: SourceId;
  /** What part of the source backs rules (documented section reference). */
  readonly relevantSection?: string;
}

/** Human verification record — `verifiedBy` is an abstract identity for now. */
export interface SourceVerification {
  readonly verifiedAt: string;
  readonly verifiedBy: string;
  readonly verificationNote: string;
}

const SOURCE_STATUS_FLOW: Readonly<Record<SourceStatus, readonly SourceStatus[]>> = {
  DRAFT: ["REVIEWED", "DEPRECATED"],
  REVIEWED: ["VERIFIED", "DEPRECATED"],
  VERIFIED: ["PUBLISHED", "DEPRECATED"],
  PUBLISHED: ["DEPRECATED"],
  DEPRECATED: [],
};

export function transitionSource(source: Source, to: SourceStatus): Source {
  if (!SOURCE_STATUS_FLOW[source.status].includes(to)) {
    throw new DomainError(`Invalid source transition: ${source.status} → ${to}`);
  }
  return { ...source, status: to };
}

/** Mark VERIFIED with the mandatory human record. */
export function verifySource(
  source: Source,
  verification: SourceVerification,
  verifiedStatus: Extract<SourceStatus, "VERIFIED"> = "VERIFIED",
): Source {
  if (source.status !== "REVIEWED") {
    throw new DomainError(`Only REVIEWED sources can be verified (got ${source.status})`);
  }
  if (!verification.verifiedBy || verification.verificationNote.trim().length === 0) {
    throw new DomainError("Verification requires verifiedBy and a non-empty note");
  }
  return { ...source, status: verifiedStatus, verification };
}

/** The publication gate: a rule can only be PUBLISHED with verified, live sources. */
export function canPublishRule(
  rule: Rule,
  sources: ReadonlyMap<string, Source>,
): { ok: boolean; problems: readonly string[] } {
  const problems: string[] = [];

  if (rule.sourceIds.length === 0) {
    problems.push("Rule declares no sources");
  }
  for (const sourceId of rule.sourceIds) {
    const source = sources.get(sourceId);
    if (!source) {
      problems.push(`Source "${sourceId}" not found in registry`);
      continue;
    }
    if (source.status !== "VERIFIED" && source.status !== "PUBLISHED") {
      problems.push(`Source "${sourceId}" is ${source.status}, not VERIFIED/PUBLISHED`);
      continue;
    }
    if (!source.verification) {
      problems.push(`Source "${sourceId}" lacks a human verification record`);
      continue;
    }
    if (!source.versionIdentifier) {
      problems.push(`Source "${sourceId}" lacks a version identifier`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Publish a rule through the gate. Throws with explicit problems when blocked. */
export function publishRule(rule: Rule, sources: ReadonlyMap<string, Source>): Rule {
  if (rule.status !== "VERIFIED") {
    throw new DomainError(`Only VERIFIED rules can be published (got ${rule.status})`);
  }
  const gate = canPublishRule(rule, sources);
  if (!gate.ok) {
    throw new DomainError(`Publication gate blocked: ${gate.problems.join("; ")}`);
  }
  return { ...rule, status: "PUBLISHED" };
}

/** Immutability guard: published definitions can never be mutated in place. */
export function assertPublishedRuleImmutable(existing: Rule, updated: Rule): void {
  if (existing.status === "PUBLISHED") {
    const changed =
      JSON.stringify(definitionOf(existing)) !== JSON.stringify(definitionOf(updated));
    if (changed) {
      throw new DomainError(
        `Published rule ${existing.key} v${existing.version} is immutable — create a new version instead`,
      );
    }
  }
}

function definitionOf(rule: Rule): unknown {
  const { id: _id, status: _status, createdAt: _createdAt, ...definition } = rule;
  return definition;
}
