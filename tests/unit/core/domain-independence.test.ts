import { describe, expect, it } from "vitest";

/**
 * Architectural property test (Phase 0): the core package must execute
 * independently of browser, DOM, Next.js, React, database and network.
 *
 * If these imports ever pull in framework code (transitively), this test
 * environment ("node", no DOM) or the import itself will fail.
 */
import { add, money } from "@core/shared/money";
import { daysBetween, parseIsoDate } from "@core/shared/dates";
import { AppError, toUserSafeError } from "@lib/errors";

describe("core domain independence", () => {
  it("executes pure domain logic without any runtime infrastructure", () => {
    const total = add(money(15000, "EUR"), money(2500, "EUR"));
    const start = parseIsoDate("2026-09-10");
    const end = parseIsoDate("2026-09-15");
    expect(total.amountMinor).toBe(17500);
    expect(daysBetween(start, end)).toBe(5);
  });

  it("produces user-safe errors without leaking internals", () => {
    const safe = toUserSafeError(new AppError({ code: "NOT_FOUND", message: "case 123 missing" }));
    expect(safe.code).toBe("NOT_FOUND");
    expect(safe.userMessage).not.toContain("case 123");
  });

  it("never exposes unexpected error details to users", () => {
    const safe = toUserSafeError(new Error("db connection string postgres://secret"));
    expect(safe.code).toBe("INTERNAL");
    expect(safe.userMessage).not.toContain("postgres://");
  });
});
