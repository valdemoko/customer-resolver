import { describe, expect, it } from "vitest";

import { detectContradiction, resolveContradiction, blockedKeys } from "@core/case/contradictions";
import { createFact } from "@core/case/facts";
import { DomainError } from "@lib/errors";
import type { Contradiction, Fact, FactKey } from "@core/types";
import { isoDate } from "@core/shared/temporal";

const NOW = "2026-09-19T10:00:00.000Z" as Fact["createdAt"];
const key = (k: string) => k as FactKey;

function fact(id: string, value: string, provenance: Fact["provenance"]): Fact {
  return createFact({
    caseId: "c1",
    key: key("cancellation.request_date"),
    value: { type: "date", value: isoDate(value) },
    provenance,
    now: NOW,
    id: id as Fact["id"],
  });
}

describe("contradictions", () => {
  const userFact = fact("f-user", "2026-09-10", "USER_PROVIDED");
  const docFact = fact("f-doc", "2026-09-14", "DOCUMENT_EXTRACTED");

  it("detects a contradiction between conflicting candidates", () => {
    const c = detectContradiction({ caseId: "c1", factA: userFact, factB: docFact, now: NOW });
    expect(c.status).toBe("UNRESOLVED");
    expect(c.factKey).toBe(key("cancellation.request_date"));
  });

  it("refuses to detect non-conflicting or cross-case/cross-key contradictions", () => {
    const same = fact("f-same", "2026-09-10", "DOCUMENT_EXTRACTED");
    expect(() =>
      detectContradiction({ caseId: "c1", factA: userFact, factB: same, now: NOW }),
    ).toThrow(DomainError);
    expect(() =>
      detectContradiction({
        caseId: "c1",
        factA: userFact,
        factB: { ...docFact, caseId: "c2" },
        now: NOW,
      }),
    ).toThrow(DomainError);
    expect(() =>
      detectContradiction({
        caseId: "c1",
        factA: userFact,
        factB: { ...docFact, key: key("other.key") },
        now: NOW,
      }),
    ).toThrow(DomainError);
  });

  it("resolves explicitly and supersedes ALL candidates without deleting history", () => {
    const c = detectContradiction({ caseId: "c1", factA: userFact, factB: docFact, now: NOW });
    const { contradiction, resolution, supersededCandidates } = resolveContradiction({
      contradiction: c,
      candidates: [userFact, docFact],
      winnerId: "f-doc",
      resolvedBy: "USER",
      reason: "la empresa confirmó por email la recepción el día 14",
      now: NOW,
    });
    expect(contradiction.status).toBe("RESOLVED_BY_USER");
    expect(resolution.chosenFactId).toBe("f-doc");
    expect(resolution.reason.length).toBeGreaterThan(0);
    expect(supersededCandidates).toHaveLength(2);
    expect(supersededCandidates.every((f) => f.status === "SUPERSEDED")).toBe(true);
    // original facts unchanged (immutability)
    expect(userFact.status).toBe("UNCONFIRMED");
  });

  it("double resolution is rejected — history is never overwritten", () => {
    const c = detectContradiction({ caseId: "c1", factA: userFact, factB: docFact, now: NOW });
    const { contradiction } = resolveContradiction({
      contradiction: c,
      candidates: [userFact, docFact],
      winnerId: "f-user",
      resolvedBy: "USER",
      reason: "primera decisión",
      now: NOW,
    });
    expect(() =>
      resolveContradiction({
        contradiction,
        candidates: [userFact, docFact],
        winnerId: "f-doc",
        resolvedBy: "USER",
        reason: "segunda decisión que intenta sobrescribir",
        now: NOW,
      }),
    ).toThrow(DomainError);
  });

  it("requires a real reason and a valid winner", () => {
    const c: Contradiction = detectContradiction({
      caseId: "c1",
      factA: userFact,
      factB: docFact,
      now: NOW,
    });
    expect(() =>
      resolveContradiction({
        contradiction: c,
        candidates: [userFact, docFact],
        winnerId: "f-user",
        resolvedBy: "USER",
        reason: "   ",
        now: NOW,
      }),
    ).toThrow(DomainError);
    expect(() =>
      resolveContradiction({
        contradiction: c,
        candidates: [userFact, docFact],
        winnerId: "f-ghost",
        resolvedBy: "USER",
        reason: "ok",
        now: NOW,
      }),
    ).toThrow(DomainError);
  });

  it("blockedKeys lists only unresolved contradictions", () => {
    const c = detectContradiction({ caseId: "c1", factA: userFact, factB: docFact, now: NOW });
    const resolved = resolveContradiction({
      contradiction: c,
      candidates: [userFact, docFact],
      winnerId: "f-user",
      resolvedBy: "USER",
      reason: "ok",
      now: NOW,
    }).contradiction;
    expect(blockedKeys([c, resolved])).toEqual([key("cancellation.request_date")]);
    expect(blockedKeys([resolved])).toEqual([]);
  });
});
