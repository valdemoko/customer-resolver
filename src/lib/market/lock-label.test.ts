import { describe, expect, it } from "vitest";
import { lockedUntil, LOCK_MS } from "./pricing";
import { formatLockEnd, lockHour } from "./lock-label";

describe("protección de cinco días", () => {
  it("dura exactamente 5 días desde la compra y después se acaba", () => {
    const bought = "2026-10-10T10:00:00.000Z";
    const t0 = Date.parse(bought);
    expect(LOCK_MS).toBe(5 * 86_400_000);
    expect(lockedUntil(bought, t0 + 5 * 86_400_000 - 1000)).toBe("2026-10-15T10:00:00.000Z");
    expect(lockedUntil(bought, t0 + 5 * 86_400_000)).toBeNull();
    expect(lockedUntil(null)).toBeNull();
  });

  it("el texto da día y hora de Madrid", () => {
    expect(formatLockEnd("2026-10-15T10:00:00.000Z")).toBe("el 15 de octubre a las 12:00");
    expect(lockHour("2026-10-15T10:00:00.000Z", Date.parse("2026-10-11T00:00:00Z"))).toBe("el 15 de octubre a las 12:00");
    expect(lockHour("2026-10-15T10:00:00.000Z", Date.parse("2026-10-16T00:00:00Z"))).toBeNull();
  });
});
