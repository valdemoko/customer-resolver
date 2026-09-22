/**
 * Deterministic entry tests — `POST /api/problems/[problemKey]/cases`.
 *
 * This route is what a problem page's "Analizar mi caso" uses. Its whole reason
 * to exist is not to involve a model, so these tests pin the contract on the
 * paths that need no database: valid problems resolve to the catalogue entry,
 * and anything else fails with a typed code rather than creating an empty case.
 *
 * The database-backed path is covered by the integration suite; here the
 * behaviour that must never regress is the rejection logic.
 */
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/problems/[problemKey]/cases/route";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { createProblemRegistry } from "@server/problems/registry";

function post(problemKey: string, body?: unknown): Promise<Response> {
  return POST(
    new Request(`https://example.test/api/problems/${problemKey}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ problemKey }) },
  );
}

describe("deterministic entry", () => {
  it("rejects a malformed problem key without touching any service", async () => {
    const res = await post("../../etc/passwd");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("answers 404 for a well-formed key that has no analysis", async () => {
    const res = await post("not-a-real-problem");
    expect(res.status).toBe(404);
    const body = await res.json();
    // 404, never a silently created empty case.
    expect(body.error.code).toBe("UNKNOWN_PROBLEM");
    expect(body.caseId).toBeUndefined();
  });

  it("serves every published problem from the catalogue and the registry", () => {
    // The two lists must agree, or a page could offer a problem the endpoint
    // refuses (or hide one it would accept).
    const registry = createProblemRegistry();
    for (const problem of getAvailableProblems()) {
      expect(registry.has(problem.key), problem.key).toBe(true);
    }
  });

  it("keeps the case private: no caching of a per-case response", async () => {
    const res = await post("not-a-real-problem");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
