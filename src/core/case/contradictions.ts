/**
 * Contradiction detection & explicit resolution (Fase 1).
 * Implements ARCHITECTURE.md §10 protocol + STRESS_TEST fix #2:
 * conflicts are first-class; resolution is explicit, recorded, and never silent.
 */
import type { Contradiction, ContradictionId, Fact, FactKey } from "../types";
import type { IsoDateTime } from "../shared/temporal";
import { DomainError } from "@lib/errors";
import { newContradictionId } from "./ids";
import { valuesConflict } from "./fact-value";

export interface DetectContradictionInput {
  readonly caseId: string;
  readonly factA: Fact;
  readonly factB: Fact;
  readonly now: IsoDateTime;
  readonly id?: string;
}

/** Detect a contradiction between two facts. Caller must have verified same case + key. */
export function detectContradiction(input: DetectContradictionInput): Contradiction {
  if (input.factA.caseId !== input.factB.caseId) {
    throw new DomainError("Cannot detect contradiction across different cases");
  }
  if (input.factA.key !== input.factB.key) {
    throw new DomainError(
      `Cannot detect contradiction across different keys: ${input.factA.key} vs ${input.factB.key}`,
    );
  }
  if (!valuesConflict(input.factA.value, input.factB.value)) {
    throw new DomainError(`Facts for ${String(input.factA.key)} do not actually conflict`);
  }

  return {
    id: (input.id ?? newContradictionId()) as ContradictionId,
    caseId: input.caseId,
    factIdA: input.factA.id,
    factIdB: input.factB.id,
    factKey: input.factA.key,
    status: "UNRESOLVED",
    detectedAt: input.now,
  };
}

export interface ResolveContradictionInput {
  readonly contradiction: Contradiction;
  readonly candidates: readonly Fact[]; // both original facts
  readonly winnerId: string;
  readonly resolvedBy: "USER" | "VERIFIED_EVIDENCE";
  readonly reason: string;
  readonly now: IsoDateTime;
}

export interface ResolutionResult {
  readonly contradiction: Contradiction;
  /** The resolution record embedded in the resolved contradiction. */
  readonly resolution: NonNullable<Contradiction["resolution"]>;
  /** All candidate facts marked SUPERSEDED (history preserved, pointers intact). */
  readonly supersededCandidates: readonly Fact[];
}

/**
 * Resolve a contradiction. Both original candidate facts become SUPERSEDED —
 * the caller creates the new USER_RESOLVED fact via facts.applyResolution.
 * Resolving twice throws: history must never be overwritten.
 */
export function resolveContradiction(input: ResolveContradictionInput): ResolutionResult {
  if (input.contradiction.status !== "UNRESOLVED") {
    throw new DomainError(
      `Contradiction ${input.contradiction.id} already resolved (${input.contradiction.status})`,
    );
  }
  const winner = input.candidates.find((c) => c.id === input.winnerId);
  if (!winner)
    throw new DomainError(`Winner ${input.winnerId} is not a candidate of this contradiction`);
  if (input.reason.trim().length === 0) {
    throw new DomainError("A resolution requires an explicit reason");
  }

  const resolution = {
    resolvedBy: input.resolvedBy,
    chosenFactId: winner.id as Fact["id"],
    reason: input.reason,
    resolvedAt: input.now,
  } as const;

  return {
    contradiction: {
      ...input.contradiction,
      status: input.resolvedBy === "USER" ? "RESOLVED_BY_USER" : "RESOLVED_BY_VERIFIED_EVIDENCE",
      resolution,
      resolvedAt: input.now,
    },
    resolution,
    supersededCandidates: input.candidates.map((c) => ({
      ...c,
      status: "SUPERSEDED" as const,
      supersededById: undefined,
      updatedAt: input.now,
    })),
  };
}

/** Which fact key(s) are blocked by unresolved contradictions (rules return unknown). */
export function blockedKeys(contradictions: readonly Contradiction[]): readonly FactKey[] {
  return contradictions.filter((c) => c.status === "UNRESOLVED").map((c) => c.factKey);
}
