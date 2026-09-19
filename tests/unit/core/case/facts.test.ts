import { describe, expect, it } from "vitest";

import { applyResolution, createFact, updateFact, validateFactValue } from "@core/case/facts";
import { valuesConflict } from "@core/case/fact-value";
import { DomainError } from "@lib/errors";
import type { Fact, FactKey } from "@core/types";
import { isoDate } from "@core/shared/temporal";

const NOW = "2026-09-19T10:00:00.000Z" as Fact["createdAt"];
const LATER = "2026-09-19T11:00:00.000Z" as Fact["createdAt"];
const key = (k: string) => k as FactKey;
const d = (v: string) => ({ type: "date", value: isoDate(v) }) as const;

const baseFact: Fact = createFact({
  caseId: "c1",
  key: key("cancellation.request_date"),
  value: d("2026-09-10"),
  provenance: "USER_PROVIDED",
  now: NOW,
  id: "fact-1" as Fact["id"],
});

describe("facts", () => {
  it("creates facts with correct provenance→confidence defaults", () => {
    expect(baseFact.status).toBe("UNCONFIRMED");
    expect(baseFact.confidence).toBe("USER");

    const ocr = createFact({
      caseId: "c1",
      key: key("charge.amount"),
      value: { type: "money", value: { amountMinor: 15000, currency: "EUR" } },
      provenance: "DOCUMENT_EXTRACTED",
      now: NOW,
    });
    expect(ocr.confidence).toBe("PARSER");

    const ai = createFact({
      caseId: "c1",
      key: key("clause.meaning"),
      value: { type: "string", value: "penalty applies" },
      provenance: "AI_INTERPRETED",
      now: NOW,
    });
    expect(ai.confidence).toBe("AI");
  });

  it("enforces namespaced keys and value invariants", () => {
    expect(() => validateFactValue(key("nofield"), { type: "string", value: "x" })).toThrow(
      DomainError,
    );
    expect(() => validateFactValue(key("a.b"), { type: "number", value: Number.NaN })).toThrow(
      DomainError,
    );
    expect(() =>
      validateFactValue(key("a.b"), {
        type: "money",
        value: { amountMinor: 10.5, currency: "EUR" },
      }),
    ).toThrow(DomainError);
    expect(() =>
      validateFactValue(key("a.b"), { type: "enum", value: "X", options: ["A", "B"] }),
    ).toThrow(DomainError);
  });

  it("rejects USER_RESOLVED facts created directly", () => {
    expect(() =>
      createFact({
        caseId: "c1",
        key: key("a.b"),
        value: { type: "string", value: "x" },
        provenance: "USER_RESOLVED",
        now: NOW,
      }),
    ).toThrow(DomainError);
  });

  it("update = supersede: history preserved with pointers in both directions", () => {
    const { next, previous } = updateFact({
      existing: baseFact,
      value: d("2026-09-14"),
      provenance: "DOCUMENT_EXTRACTED",
      now: LATER,
    });
    expect(previous.status).toBe("SUPERSEDED");
    expect(previous.supersededById).toBe(next.id);
    expect(next.supersedesId).toBe(baseFact.id);
    expect(next.status).toBe("UNCONFIRMED");
    expect(next.value).toEqual(d("2026-09-14"));
    // never mutate the old fact in place
    expect(baseFact.status).toBe("UNCONFIRMED");
  });

  it("cannot update an already SUPERSEDED fact", () => {
    const superseded: Fact = { ...baseFact, status: "SUPERSEDED" };
    expect(() =>
      updateFact({
        existing: superseded,
        value: d("2026-09-12"),
        provenance: "USER_PROVIDED",
        now: LATER,
      }),
    ).toThrow(DomainError);
  });

  it("resolution facts must be USER_RESOLVED and become CONFIRMED", () => {
    // Only the CaseService creates USER_RESOLVED facts (allowUserResolved bypass).
    const winner = createFact({
      caseId: "c1",
      key: key("cancellation.request_date"),
      value: d("2026-09-10"),
      provenance: "USER_RESOLVED",
      now: LATER,
      allowUserResolved: true,
    });
    const resolved = applyResolution({
      newFact: winner,
      resolution: {
        resolvedBy: "USER",
        chosenFactId: baseFact.id,
        reason: "el email de confirmación lo respalda",
        resolvedAt: LATER,
      },
      now: LATER,
    });
    expect(resolved.status).toBe("CONFIRMED");
    expect(resolved.resolution?.reason).toContain("email");

    expect(() =>
      applyResolution({
        newFact: { ...winner, provenance: "USER_PROVIDED" },
        resolution: {
          resolvedBy: "USER",
          chosenFactId: baseFact.id,
          reason: "x",
          resolvedAt: LATER,
        },
        now: LATER,
      }),
    ).toThrow(DomainError);
  });

  it("conflict semantics: same type different value conflicts; type mismatch conflicts too", () => {
    expect(valuesConflict(baseFact.value, d("2026-09-14"))).toBe(true);
    expect(valuesConflict(baseFact.value, d("2026-09-10"))).toBe(false);
    expect(valuesConflict(baseFact.value, { type: "string", value: "2026-09-10" })).toBe(true);
  });
});
