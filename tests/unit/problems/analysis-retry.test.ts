/**
 * Two analyses of the same case at once.
 *
 * Analysing a case appends a snapshot, so it bumps the case version. The report
 * reads `/result` and `/actions` around the same case, and a second browser tab
 * does the same, so two runs can collide on the optimistic lock. Before this the
 * losing run surfaced as "ANALYSIS_FAILED: version conflict", and the person lost
 * the "what to do now" section of their report.
 *
 * The conflict is not a failure: the case moved, so the run is retried against
 * the fresh version.
 */
import { describe, expect, it, vi } from "vitest";

import { isConcurrentUpdateError, withConcurrentRetry } from "@core/problems/analysis-service";

class ConcurrentCaseUpdateDbError extends Error {
  readonly code = "CONCURRENT_CASE_UPDATE";
  constructor() {
    super("Case case-1 version conflict (expected 4)");
    this.name = "ConcurrentCaseUpdateDbError";
  }
}

describe("isConcurrentUpdateError", () => {
  it("recognises a lost optimistic lock", () => {
    expect(isConcurrentUpdateError(new ConcurrentCaseUpdateDbError())).toBe(true);
    expect(isConcurrentUpdateError(new Error("Case x version conflict (expected 2)"))).toBe(true);
    expect(isConcurrentUpdateError(Object.assign(new Error("nope"), { code: "CONCURRENT_UPDATE" }))).toBe(
      true,
    );
  });

  it("leaves every other error alone", () => {
    expect(isConcurrentUpdateError(new Error("rules not available as PUBLISHED"))).toBe(false);
    expect(isConcurrentUpdateError(new Error("database is down"))).toBe(false);
    expect(isConcurrentUpdateError("not even an error")).toBe(false);
    expect(isConcurrentUpdateError(undefined)).toBe(false);
  });
});

describe("withConcurrentRetry", () => {
  it("retries once the competing run has finished", async () => {
    let calls = 0;
    const result = await withConcurrentRetry(async () => {
      calls += 1;
      if (calls === 1) throw new ConcurrentCaseUpdateDbError();
      return "analysed";
    });

    expect(result).toBe("analysed");
    expect(calls).toBe(2);
  });

  it("gives up after a few attempts instead of looping forever", async () => {
    const run = vi.fn(async () => {
      throw new ConcurrentCaseUpdateDbError();
    });

    await expect(withConcurrentRetry(run)).rejects.toThrow(/version conflict/);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error that has nothing to do with concurrency", async () => {
    const run = vi.fn(async () => {
      throw new Error("rules not available as PUBLISHED");
    });

    await expect(withConcurrentRetry(run)).rejects.toThrow(/PUBLISHED/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns the first successful result without further calls", async () => {
    const run = vi.fn(async () => "ok");
    await expect(withConcurrentRetry(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
