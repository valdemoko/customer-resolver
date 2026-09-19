import { describe, expect, it } from "vitest";

import { add, compareTo, isNegative, money, subtract } from "@core/shared/money";

describe("core/shared/money", () => {
  it("adds and subtracts in minor units without float drift", () => {
    const a = money(1999, "EUR");
    const b = money(1, "EUR");
    expect(add(a, b).amountMinor).toBe(2000);
    expect(subtract(a, b).amountMinor).toBe(1998);
  });

  it("compares amounts within the same currency", () => {
    expect(compareTo(money(100, "EUR"), money(200, "EUR"))).toBeLessThan(0);
    expect(compareTo(money(100, "EUR"), money(100, "EUR"))).toBe(0);
  });

  it("rejects mixed-currency operations", () => {
    expect(() => add(money(100, "EUR"), money(100, "USD"))).toThrow(RangeError);
  });

  it("rejects non-integer minor units and malformed currency", () => {
    expect(() => money(10.5, "EUR")).toThrow(RangeError);
    expect(() => money(100, "eur")).toThrow(RangeError);
    expect(() => money(100, "EURO")).toThrow(RangeError);
  });

  it("flags negative amounts", () => {
    expect(isNegative(money(-1, "EUR"))).toBe(true);
    expect(isNegative(money(0, "EUR"))).toBe(false);
  });
});
