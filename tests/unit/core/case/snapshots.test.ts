import { describe, expect, it } from "vitest";

import { createSnapshot, snapshotHash } from "@core/case/snapshots";
import { createFact } from "@core/case/facts";
import { detectContradiction } from "@core/case/contradictions";
import type { Case, Fact, FactKey, ProblemSlug, SnapshotId } from "@core/types";
import { isoDate } from "@core/shared/temporal";

const NOW = "2026-09-19T10:00:00.000Z" as Fact["createdAt"];
const key = (k: string) => k as FactKey;

const baseCase: Case = {
  id: "11111111-1111-4111-8111-111111111111",
  problemSlug: "generic-problem" as ProblemSlug,
  jurisdiction: "ES" as Case["jurisdiction"],
  locale: "es-ES" as Case["locale"],
  currency: "EUR" as Case["currency"],
  status: "COLLECTING_INFORMATION",
  ownerId: "owner-1" as Case["ownerId"],
  version: 1 as Case["version"],
  createdAt: NOW,
  updatedAt: NOW,
};

function buildFact(id: string, value: string): Fact {
  return createFact({
    caseId: baseCase.id,
    key: key("cancellation.request_date"),
    value: { type: "date", value: isoDate(value) },
    provenance: "USER_PROVIDED",
    now: NOW,
    id: id as Fact["id"],
  });
}

describe("snapshots", () => {
  it("freezes active facts (excluding SUPERSEDED) and all contradictions", () => {
    const f1 = buildFact("f1", "2026-09-10");
    const f2 = { ...buildFact("f2", "2026-09-01"), status: "SUPERSEDED" as const };
    const contradiction = detectContradiction({
      caseId: baseCase.id,
      factA: f1,
      factB: buildFact("f3", "2026-09-14"),
      now: NOW,
    });

    const snap = createSnapshot({
      case: baseCase,
      currentFacts: [f1, f2],
      contradictions: [contradiction],
      engineVersion: "1.0.0",
      now: NOW,
    });

    expect(snap.factIds).toEqual([f1.id]);
    expect(snap.contradictionIds).toEqual([contradiction.id]);
  });

  it("hash is deterministic for identical semantic content regardless of id/time", () => {
    const f1 = buildFact("f1", "2026-09-10");
    const a = createSnapshot({
      case: baseCase,
      currentFacts: [f1],
      contradictions: [],
      engineVersion: "1.0.0",
      sourceVersions: { "src:ley": "2" },
      aiRequestIds: ["ai-2", "ai-1"],
      previousSnapshotId: "00000000-0000-4000-8000-000000000000" as SnapshotId,
      now: NOW,
      id: "snap-a" as SnapshotId,
    });
    const b = createSnapshot({
      case: baseCase,
      currentFacts: [f1],
      contradictions: [],
      engineVersion: "1.0.0",
      sourceVersions: { "src:ley": "2" },
      aiRequestIds: ["ai-1", "ai-2"],
      previousSnapshotId: "00000000-0000-4000-8000-000000000000" as SnapshotId,
      now: NOW,
      id: "snap-b" as SnapshotId,
    });
    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });

  it("hash changes when ruleset or engine version changes (reproducibility guard)", () => {
    const f1 = buildFact("f1", "2026-09-10");
    const base = {
      case: baseCase,
      currentFacts: [f1],
      contradictions: [],
      engineVersion: "1.0.0",
      rulesetHash: "rules-v1" as never,
      now: NOW,
    };
    const s1 = createSnapshot(base);
    const s2 = createSnapshot({ ...base, rulesetHash: "rules-v2" as never });
    const s3 = createSnapshot({ ...base, engineVersion: "2.0.0" });
    const h1 = snapshotHash(s1);
    expect(snapshotHash(s2)).not.toBe(h1);
    expect(snapshotHash(s3)).not.toBe(h1);
  });
});
