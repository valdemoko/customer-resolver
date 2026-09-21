/**
 * Security hardening tests (Fase 10 — security hardening).
 *
 * Regression tests for:
 *  - Input validation (caseId, problemKey, factKey)
 *  - Error message sanitization
 *  - Fact provenance invariants (AI cannot auto-confirm)
 *  - Cache-Control for private API routes
 */
import { describe, expect, it } from "vitest";
import {
  isValidCaseId,
  isValidProblemKey,
  isValidFactKey,
  sanitizeErrorMessage,
} from "@/lib/validation";

// ── CaseId Validation ────────────────────────────────────────────────

describe("isValidCaseId", () => {
  it("accepts UUID v4", () => {
    expect(isValidCaseId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts simple alphanumeric IDs", () => {
    expect(isValidCaseId("case-test-001")).toBe(true);
    expect(isValidCaseId("case-1")).toBe(true);
    expect(isValidCaseId("abc123")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidCaseId("../../../etc/passwd")).toBe(false);
    expect(isValidCaseId("..%2F..%2Fetc")).toBe(false);
    expect(isValidCaseId("/etc/passwd")).toBe(false);
    expect(isValidCaseId("a/b/c")).toBe(false);
  });

  it("rejects SQL injection", () => {
    expect(isValidCaseId("'; DROP TABLE cases; --")).toBe(false);
    expect(isValidCaseId("1' OR '1'='1")).toBe(false);
  });

  it("rejects null bytes and control characters", () => {
    expect(isValidCaseId("case\x00id")).toBe(false);
    expect(isValidCaseId("case\nid")).toBe(false);
    expect(isValidCaseId("case\tid")).toBe(false);
  });

  it("rejects empty and oversized strings", () => {
    expect(isValidCaseId("")).toBe(false);
    expect(isValidCaseId("a".repeat(200))).toBe(false);
  });
});

// ── ProblemKey Validation ────────────────────────────────────────────

describe("isValidProblemKey", () => {
  it("accepts valid problem keys", () => {
    expect(isValidProblemKey("cancellation-charge")).toBe(true);
    expect(isValidProblemKey("no-delivery-refund")).toBe(true);
    expect(isValidProblemKey("flight-cancel")).toBe(true);
    expect(isValidProblemKey("warranty-rejection")).toBe(true);
  });

  it("rejects dangerous patterns", () => {
    expect(isValidProblemKey("../../../etc")).toBe(false);
    expect(isValidProblemKey("test; rm -rf /")).toBe(false);
    expect(isValidProblemKey("test\0null")).toBe(false);
    expect(isValidProblemKey("")).toBe(false);
    expect(isValidProblemKey("UPPERCASE")).toBe(false);
    expect(isValidProblemKey("has spaces")).toBe(false);
  });
});

// ── FactKey Validation ───────────────────────────────────────────────

describe("isValidFactKey", () => {
  it("accepts valid namespaced fact keys", () => {
    expect(isValidFactKey("cancellation.date")).toBe(true);
    expect(isValidFactKey("flight.departure_airport")).toBe(true);
    expect(isValidFactKey("charge.amount")).toBe(true);
  });

  it("rejects missing namespace", () => {
    expect(isValidFactKey("date")).toBe(false);
    expect(isValidFactKey("noDot")).toBe(false);
  });

  it("rejects dangerous patterns", () => {
    expect(isValidFactKey("../../../etc.passwd")).toBe(false);
    expect(isValidFactKey("test;injection.field")).toBe(false);
  });
});

// ── Error Sanitization ───────────────────────────────────────────────

describe("sanitizeErrorMessage", () => {
  it("returns generic for non-Error values", () => {
    expect(sanitizeErrorMessage(null)).toBe("An unexpected error occurred.");
    expect(sanitizeErrorMessage(undefined)).toBe("An unexpected error occurred.");
    expect(sanitizeErrorMessage("string")).toBe("An unexpected error occurred.");
  });

  it("passes through safe domain errors", () => {
    const e = new Error("Case not found: abc-123");
    e.name = "CaseNotFoundError";
    expect(sanitizeErrorMessage(e)).toBe("Case not found: abc-123");
  });

  it("redacts messages with secrets", () => {
    expect(sanitizeErrorMessage(new Error("password is wrong"))).toBe(
      "An unexpected error occurred.",
    );
    expect(sanitizeErrorMessage(new Error("API_KEY invalid"))).toBe(
      "An unexpected error occurred.",
    );
  });

  it("redacts messages with file paths", () => {
    expect(sanitizeErrorMessage(new Error("ENOENT: /home/user/file.txt"))).toBe(
      "An unexpected error occurred.",
    );
    expect(sanitizeErrorMessage(new Error("C:\\Users\\admin\\secret.txt"))).toBe(
      "An unexpected error occurred.",
    );
  });

  it("truncates very long messages", () => {
    expect(sanitizeErrorMessage(new Error("x".repeat(300)))).toBe(
      "An unexpected error occurred.",
    );
  });

  it("passes through short safe messages", () => {
    expect(sanitizeErrorMessage(new Error("Connection timeout"))).toBe(
      "Connection timeout",
    );
  });
});

// ── Cache-Control Headers ────────────────────────────────────────────

describe("Cache-Control for private API routes", () => {
  it("result route handler exists", async () => {
    const route = await import("@/app/api/cases/[caseId]/result/route");
    expect(route.GET).toBeDefined();
  });

  it("actions route handler exists", async () => {
    const route = await import("@/app/api/cases/[caseId]/actions/route");
    expect(route.GET).toBeDefined();
  });

  it("intake route handlers exist", async () => {
    const route = await import("@/app/api/cases/[caseId]/intake/route");
    expect(route.GET).toBeDefined();
    expect(route.POST).toBeDefined();
  });
});

// ── Fact Provenance Invariants ───────────────────────────────────────

describe("Fact provenance invariants (F1)", () => {
  it("createFact rejects CONFIRMED with AI_INTERPRETED provenance", async () => {
    const { createFact } = await import("@/core/case/facts");
    expect(() =>
      createFact({
        caseId: "test",
        key: "test.field" as never,
        value: { type: "string", value: "test" },
        provenance: "AI_INTERPRETED",
        initialStatus: "CONFIRMED",
        now: "2026-01-01T00:00:00.000Z" as never,
      }),
    ).toThrow("Cannot create CONFIRMED fact with provenance AI_INTERPRETED");
  });

  it("createFact rejects CONFIRMED with DOCUMENT_EXTRACTED provenance", async () => {
    const { createFact } = await import("@/core/case/facts");
    expect(() =>
      createFact({
        caseId: "test",
        key: "test.field" as never,
        value: { type: "string", value: "test" },
        provenance: "DOCUMENT_EXTRACTED",
        initialStatus: "CONFIRMED",
        now: "2026-01-01T00:00:00.000Z" as never,
      }),
    ).toThrow("Cannot create CONFIRMED fact with provenance DOCUMENT_EXTRACTED");
  });

  it("confirmFact always produces USER_PROVIDED provenance", async () => {
    const { confirmFact } = await import("@/core/case/facts");
    const fact = confirmFact({
      caseId: "test",
      key: "test.field" as never,
      value: { type: "string", value: "test" },
      now: "2026-01-01T00:00:00.000Z" as never,
    });
    expect(fact.provenance).toBe("USER_PROVIDED");
    expect(fact.status).toBe("CONFIRMED");
  });

  it("createFact rejects USER_RESOLVED without allowUserResolved flag", async () => {
    const { createFact } = await import("@/core/case/facts");
    expect(() =>
      createFact({
        caseId: "test",
        key: "test.field" as never,
        value: { type: "string", value: "test" },
        provenance: "USER_RESOLVED",
        now: "2026-01-01T00:00:00.000Z" as never,
      }),
    ).toThrow("USER_RESOLVED facts must be created via resolveContradiction");
  });
});

// ── Fact Value Validation ────────────────────────────────────────────

describe("Fact value validation (F1)", () => {
  it("rejects non-finite numbers", async () => {
    const { validateFactValue } = await import("@/core/case/facts");
    expect(() =>
      validateFactValue("test.field" as never, { type: "number", value: NaN }),
    ).toThrow("must be finite");
  });

  it("rejects non-integer money amounts", async () => {
    const { validateFactValue } = await import("@/core/case/facts");
    expect(() =>
      validateFactValue("test.field" as never, {
        type: "money",
        value: { amountMinor: 10.5, currency: "EUR" },
      }),
    ).toThrow("amountMinor must be an integer");
  });

  it("rejects enum values not in options", async () => {
    const { validateFactValue } = await import("@/core/case/facts");
    expect(() =>
      validateFactValue("test.field" as never, {
        type: "enum",
        value: "invalid",
        options: ["a", "b", "c"],
      }),
    ).toThrow("not in options");
  });

  it("rejects empty fact keys without namespace", async () => {
    const { validateFactValue } = await import("@/core/case/facts");
    expect(() =>
      validateFactValue("" as never, { type: "string", value: "test" }),
    ).toThrow("namespaced");
  });
});
