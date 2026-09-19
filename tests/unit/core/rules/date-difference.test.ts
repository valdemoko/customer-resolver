/**
 * DATE_DIFFERENCE — calendar semantics (F1 fix, docs prompt §5).
 *
 * Semantics under test (ISO-8601 duration arithmetic, pure UTC):
 *   met ⇔ date(end) >  date(start) + duration   (GREATER_THAN)
 *   met ⇔ date(end) >= date(start) + duration   (GREATER_OR_EQUAL)
 * addMonths preserves day-of-month, CLAMPED to the last day of the target
 * month (31-01 → 28/29-02). Inverted dates (end < start) never satisfy a
 * positive duration. No timezone, locale, clock or global state involved.
 */
import { describe, expect, it } from "vitest";

import { evaluateRule, type Condition, type Rule, type RuleEvaluationContext } from "@core/rules";
import { isoDate, isoDateAddMonths } from "@core/shared/temporal";

const TODAY = isoDate("2026-09-19");

const diff = (overrides?: Partial<Extract<Condition, { kind: "DATE_DIFFERENCE" }>>): Condition => ({
  kind: "DATE_DIFFERENCE",
  startFact: "start" as never,
  endFact: "end" as never,
  duration: 24,
  unit: "MONTHS",
  comparison: "GREATER_THAN",
  ...overrides,
});

const rule = (root: Condition): Rule => ({
  key: "test.date-diff" as never,
  version: 1 as never,
  title: "test",
  scope: { level: "COUNTRY_WIDE", country: "ES" },
  root,
  sourceIds: [],
  id: "r" as never,
  status: "PUBLISHED",
  createdAt: "2026-01-01T00:00:00.000Z",
});

const ctx = (facts: RuleEvaluationContext["facts"]): RuleEvaluationContext => ({
  facts,
  contradictedKeys: new Set(),
  jurisdiction: { country: "ES" },
  currentDate: TODAY,
});

const dateFact = (key: string, value: string, status = "CONFIRMED") => ({
  key: key as never,
  status: status as never,
  value,
  evidenceRefs: [],
});

function evaluate(condition: Condition, facts: RuleEvaluationContext["facts"]) {
  return evaluateRule(rule(condition), ctx(facts));
}

describe("DATE_DIFFERENCE · calendar-month semantics", () => {
  it("exactly 24 months (2024-01-01 → 2026-01-01) is NOT greater than 24", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01"), dateFact("end", "2026-01-01")]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("one day past 24 months (2024-01-01 → 2026-01-02) IS greater", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01"), dateFact("end", "2026-01-02")]);
    expect(e.status).toBe("SUPPORTED");
  });

  it("less than 24 months → NOT_APPLICABLE", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01"), dateFact("end", "2025-12-12")]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("ONE DAY (2024-01-01 → 2024-01-02) never produces SUPPORTED — the audited bug", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01"), dateFact("end", "2024-01-02")]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("GREATER_OR_EQUAL accepts exactly 24 months", () => {
    const e = evaluate(diff({ comparison: "GREATER_OR_EQUAL" }), [
      dateFact("start", "2024-01-01"),
      dateFact("end", "2026-01-01"),
    ]);
    expect(e.status).toBe("SUPPORTED");
  });
});

describe("DATE_DIFFERENCE · calendar edge cases (documented semantics)", () => {
  it("day preserved across months with fewer days: 2024-03-31 + 1 month = 2024-04-30", () => {
    expect(isoDateAddMonths(isoDate("2024-03-31"), 1)).toBe("2024-04-30");
  });

  it("leap-year clamp: 2024-01-31 + 1 month = 2024-02-29; non-leap: 2023-01-31 → 2023-02-28", () => {
    expect(isoDateAddMonths(isoDate("2024-01-31"), 1)).toBe("2024-02-29");
    expect(isoDateAddMonths(isoDate("2023-01-31"), 1)).toBe("2023-02-28");
  });

  it("29 February anniversary: 2024-02-29 + 12 months = 2025-02-28 (clamp)", () => {
    expect(isoDateAddMonths(isoDate("2024-02-29"), 12)).toBe("2025-02-28");
    // And exactly GREATER_OR_EQUAL 12 months from 2024-02-29 to 2025-02-28:
    const e = evaluate(diff({ duration: 12, comparison: "GREATER_OR_EQUAL" }), [
      dateFact("start", "2024-02-29"),
      dateFact("end", "2025-02-28"),
    ]);
    expect(e.status).toBe("SUPPORTED");
  });

  it("month-end start: 2024-01-31 + 24 months = 2026-01-31 (both have 31 days); met only strictly after", () => {
    expect(isoDateAddMonths(isoDate("2024-01-31"), 24)).toBe("2026-01-31");
    const at = evaluate(diff(), [dateFact("start", "2024-01-31"), dateFact("end", "2026-01-31")]);
    const after = evaluate(diff(), [
      dateFact("start", "2024-01-31"),
      dateFact("end", "2026-02-01"),
    ]);
    expect(at.status).toBe("NOT_APPLICABLE"); // GREATER_THAN: anniversary itself not enough
    expect(after.status).toBe("SUPPORTED");
  });

  it("clamped anchor: 2024-03-31 + 24 months = 2026-03-31; 2026-03-30 does not meet it", () => {
    expect(isoDateAddMonths(isoDate("2024-03-31"), 24)).toBe("2026-03-31");
    const e = evaluate(diff(), [dateFact("start", "2024-03-31"), dateFact("end", "2026-03-30")]);
    expect(e.status).toBe("NOT_APPLICABLE");
    const met = evaluate(diff(), [dateFact("start", "2024-03-31"), dateFact("end", "2026-04-01")]);
    expect(met.status).toBe("SUPPORTED");
  });

  it("inverted dates (end < start) never satisfy a positive duration", () => {
    const e = evaluate(diff(), [dateFact("start", "2026-01-01"), dateFact("end", "2024-01-01")]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("same dates (duration 0 would be needed for equality; duration ≥ 1 → NOT_APPLICABLE)", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01"), dateFact("end", "2024-01-01")]);
    expect(e.status).toBe("NOT_APPLICABLE");
  });

  it("DAYS unit counts 24h days (UTC), no month approximation anywhere", () => {
    const e = evaluate(diff({ unit: "DAYS", duration: 730 }), [
      dateFact("start", "2024-01-01"),
      dateFact("end", "2026-01-01"),
    ]);
    // 2024 is leap: 2024-01-01 → 2026-01-01 spans 731 days, so 730 IS exceeded.
    expect(e.status).toBe("SUPPORTED");
    const notYet = evaluate(diff({ unit: "DAYS", duration: 731 }), [
      dateFact("start", "2024-01-01"),
      dateFact("end", "2026-01-01"),
    ]);
    expect(notYet.status).toBe("NOT_APPLICABLE"); // exactly 731 → not GREATER_THAN
  });
});

describe("DATE_DIFFERENCE · evaluation states (existing vocabulary respected)", () => {
  it("unknown start fact → INSUFFICIENT_DATA naming it", () => {
    const e = evaluate(diff(), [dateFact("end", "2026-01-01")]);
    expect(e.status).toBe("INSUFFICIENT_DATA");
    expect(e.missingFacts).toContain("start");
  });

  it("unknown end fact → INSUFFICIENT_DATA naming it", () => {
    const e = evaluate(diff(), [dateFact("start", "2024-01-01")]);
    expect(e.status).toBe("INSUFFICIENT_DATA");
    expect(e.missingFacts).toContain("end");
  });

  it("start fact in unresolved contradiction → CONTRADICTED", () => {
    const e = evaluate(diff(), [
      { ...dateFact("start", "2024-01-01"), status: "CONTRADICTED" },
      dateFact("end", "2026-01-02"),
    ]);
    expect(e.status).toBe("CONTRADICTED");
    expect(e.contradictedFacts).toContain("start");
  });

  it("end fact blocked via contradictedKeys → CONTRADICTED (never guessed)", () => {
    const e = evaluateRule(rule(diff()), {
      ...ctx([dateFact("start", "2024-01-01"), dateFact("end", "2026-01-02")]),
      contradictedKeys: new Set(["end" as never]),
    });
    expect(e.status).toBe("CONTRADICTED");
  });

  it("met condition with UNCONFIRMED facts → POTENTIALLY_APPLICABLE", () => {
    const e = evaluate(diff(), [
      dateFact("start", "2024-01-01", "UNCONFIRMED"),
      dateFact("end", "2026-01-02", "UNCONFIRMED"),
    ]);
    expect(e.status).toBe("POTENTIALLY_APPLICABLE");
  });

  it("non-date value → fails safely (TYPE_MISMATCH, no crash, no match)", () => {
    const e = evaluate(diff(), [
      { key: "start" as never, status: "CONFIRMED", value: "not-a-date", evidenceRefs: [] },
      dateFact("end", "2026-01-02"),
    ]);
    expect(e.status).toBe("NOT_APPLICABLE");
    expect(e.traces[0]?.reason).toBe("TYPE_MISMATCH");
  });
});
