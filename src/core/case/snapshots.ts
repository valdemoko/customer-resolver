/**
 * Snapshot creation (Fase 1).
 * Immutable, reproducible analysis anchors (ARCHITECTURE.md §5 + STRESS_TEST fix #3).
 */
import type { Case, CaseSnapshot, Contradiction, Fact, RulesetHash, SnapshotId } from "../types";
import type { IsoDateTime } from "../shared/temporal";
import { createHash } from "node:crypto";
import { newSnapshotId } from "./ids";

export interface CreateSnapshotInput {
  readonly case: Case;
  readonly currentFacts: readonly Fact[];
  readonly contradictions: readonly Contradiction[];
  readonly engineVersion: string;
  readonly rulesetHash?: RulesetHash;
  readonly sourceVersions?: Readonly<Record<string, string>>;
  readonly aiRequestIds?: readonly string[];
  readonly previousSnapshotId?: SnapshotId;
  readonly now: IsoDateTime;
  readonly id?: string;
}

export function createSnapshot(input: CreateSnapshotInput): CaseSnapshot {
  const activeFacts = input.currentFacts.filter((f) => f.status !== "SUPERSEDED");

  return {
    id: (input.id ?? newSnapshotId()) as SnapshotId,
    caseId: input.case.id,
    previousSnapshotId: input.previousSnapshotId,
    engineVersion: input.engineVersion,
    rulesetHash: input.rulesetHash,
    sourceVersions: { ...(input.sourceVersions ?? {}) },
    aiRequestIds: [...(input.aiRequestIds ?? [])],
    factIds: activeFacts.map((f) => f.id),
    contradictionIds: input.contradictions.map((c) => c.id),
    createdAt: input.now,
  };
}

/**
 * Deterministic digest of a snapshot's semantic content. Two snapshots built
 * from identical inputs (facts, contradictions, engine, ruleset, sources)
 * produce the same hash — the reproducibility property (docs prompt §18).
 */
export function snapshotHash(snapshot: CaseSnapshot): string {
  const canonical = JSON.stringify({
    engineVersion: snapshot.engineVersion,
    rulesetHash: snapshot.rulesetHash ?? null,
    sourceVersions: sortedEntries(snapshot.sourceVersions),
    aiRequestIds: [...snapshot.aiRequestIds].sort(),
    factIds: [...snapshot.factIds].sort(),
    contradictionIds: [...snapshot.contradictionIds].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function sortedEntries(record: Readonly<Record<string, string>>): Array<[string, string]> {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}
