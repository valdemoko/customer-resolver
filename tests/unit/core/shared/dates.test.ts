import { describe, expect, it } from "vitest";

import { daysBetween, isAfter, isBefore, parseIsoDate } from "@core/shared/dates";

describe("core/shared/dates", () => {
  it("parses valid ISO calendar dates", () => {
    expect(parseIsoDate("2026-02-10").toISOString()).toBe("2026-02-10T00:00:00.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    expect(() => parseIsoDate("2026-13-01")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
    expect(() => parseIsoDate("10/02/2026")).toThrow(RangeError);
  });

  it("computes whole-day differences deterministically", () => {
    const a = parseIsoDate("2026-09-10");
    const b = parseIsoDate("2026-09-14");
    expect(daysBetween(a, b)).toBe(4);
    expect(daysBetween(b, a)).toBe(-4);
  });

  it("compares dates strictly", () => {
    const a = parseIsoDate("2026-09-10");
    const b = parseIsoDate("2026-09-11");
    expect(isBefore(a, b)).toBe(true);
    expect(isAfter(a, b)).toBe(false);
  });
});
