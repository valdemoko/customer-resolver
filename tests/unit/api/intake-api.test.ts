/**
 * API Route Tests — F8.3 Intake API endpoints.
 *
 * Tests validation, error handling, and contract correctness.
 * Composition root is mocked at the highest level to avoid dependency chain issues.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock composition root ────────────────────────────────────────────
// The routes import createIntakeServices from @server/intake/composition.
// We mock that single module to return controlled services.

const mockCreateCase = vi.fn().mockResolvedValue({
  id: "case-test-001",
  status: "DRAFT",
  version: 1,
  problemSlug: "unknown",
  jurisdiction: "UNKNOWN",
  locale: "es-ES",
  currency: "EUR",
  ownerId: "anonymous",
});

const mockLoadCase = vi.fn().mockResolvedValue({
  case: {
    id: "case-test-001",
    status: "DRAFT",
    version: 1,
    problemSlug: "unknown",
    jurisdiction: "UNKNOWN",
    locale: "es-ES",
    currency: "EUR",
    ownerId: "anonymous",
  },
  facts: [],
  contradictions: [],
  events: [],
  snapshots: [],
  evidence: [],
  evidenceLinks: [],
  physicalObjects: [],
  processingRuns: [],
  documentLocations: [],
  factCandidates: [],
});

const mockConfirmFact = vi.fn().mockResolvedValue({
  case: { id: "case-test-001", status: "COLLECTING_INFORMATION", version: 2 },
  fact: {
    id: "fact-001",
    key: "cancellation.date",
    value: { type: "date", value: "2025-01-15" },
    status: "CONFIRMED",
    provenance: "USER_PROVIDED",
  },
});

const mockInterpret = vi.fn().mockResolvedValue({
  interpretation: {
    summary: "Test interpretation",
    candidateModules: [
      {
        problemKey: "cancellation-charge",
        signals: ["cancelación", "cobro"],
        matchedRequiredFacts: ["cancellation.date"],
        missingRequiredFacts: ["charge.amount"],
        confidence: "HIGH",
      },
    ],
    factCandidates: [],
    missingInformation: [],
    ambiguities: [],
    contradictions: [],
    entities: [],
    jurisdictionHints: [{ jurisdiction: "ES", confidence: "HIGH", signals: ["language"] }],
    classificationConfidence: "HIGH",
    interpretationVersion: "1.0",
    aiRequestId: "req-001",
  },
  aiRequestId: "req-001",
});

const mockRoute = vi.fn().mockReturnValue({
  status: "ROUTED",
  moduleCandidate: { problemKey: "cancellation-charge" },
  rationale: {
    signals: ["cancelación"],
    matchedFacts: [],
    missingFacts: [],
    jurisdictionCompatible: true,
    noBlockingContradictions: true,
    score: 10,
    threshold: 8,
  },
  userExplanation: "Parece que tu problema puede estar relacionado con: Cancelación y cargos.",
});

const mockSelectQuestion = vi.fn().mockReturnValue(null);
const mockAllRequired = vi.fn().mockReturnValue(false);

const mockRegistry = {
  list: vi.fn().mockReturnValue([
    {
      key: "cancellation-charge",
      title: "Cancelación y cargos",
      factCatalogue: [
        { key: "cancellation.date", required: true },
        { key: "charge.amount", required: true },
      ],
      intake: [
        { factKey: "cancellation.date", text: "¿Cuándo cancelaste?", required: true },
        { factKey: "charge.amount", text: "¿Cuánto te cobraron?", required: true },
      ],
    },
  ]),
  get: vi.fn().mockReturnValue({
    key: "cancellation-charge",
    title: "Cancelación y cargos",
    jurisdictions: ["ES"],
    factCatalogue: [
      { key: "cancellation.date", required: true },
      { key: "charge.amount", required: true },
    ],
    intake: [
      { factKey: "cancellation.date", text: "¿Cuándo cancelaste?", required: true },
      { factKey: "charge.amount", text: "¿Cuánto te cobraron?", required: true },
    ],
  }),
  has: vi.fn().mockReturnValue(true),
};

vi.mock("@server/intake/composition", () => ({
  createIntakeServices: vi.fn(() => ({
    registry: mockRegistry,
    caseService: {
      createCase: mockCreateCase,
      loadCase: mockLoadCase,
      confirmFactForCase: mockConfirmFact,
    },
    intakeService: {
      interpretUserMessage: mockInterpret,
      routeInterpretation: mockRoute,
      selectNextQuestion: mockSelectQuestion,
      allRequiredFactsConfirmed: mockAllRequired,
    },
  })),
}));

vi.mock("@server/intake/budget-store", () => ({
  tryReserveBudget: vi.fn().mockReturnValue({
    allowed: true,
    currentCount: 1,
    maxAllowed: 3,
  }),
  releaseBudget: vi.fn(),
  resetBudget: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/intake/interpret", () => {
  let POST: typeof import("@/app/api/intake/interpret/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-mock budget store since clearAllMocks resets it
    const budget = await import("@server/intake/budget-store");
    vi.mocked(budget.tryReserveBudget).mockReturnValue({
      allowed: true,
      currentCount: 1,
      maxAllowed: 3,
    });
    const mod = await import("@/app/api/intake/interpret/route");
    POST = mod.POST;
  });

  it("rejects empty body", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "text/plain" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("rejects message shorter than 10 chars", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({ message: "short" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("rejects extra fields (strict schema)", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas",
        extra: "field",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("succeeds with valid message", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas y me han cobrado otra vez",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.caseId).toBe("case-test-001");
    expect(data.interpretation).toBeDefined();
    expect(data.routing).toBeDefined();
    expect(data.routing.status).toBe("ROUTED");
    expect(data.routing.moduleKey).toBe("cancellation-charge");
  });

  it("returns budget information", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas y me han cobrado otra vez",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    const data = await res.json();
    expect(data.budget).toBeDefined();
    expect(data.budget.current).toBe(1);
    expect(data.budget.max).toBe(3);
  });

  it("does not expose internal AI details", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas y me han cobrado otra vez",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    const text = await res.text();
    expect(text).not.toContain("systemInstruction");
    expect(text).not.toContain("apiKey");
  });

  it("rejects oversized messages", async () => {
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({ message: "a".repeat(6000) }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("returns 429 when budget exhausted", async () => {
    const budget = await import("@server/intake/budget-store");
    vi.mocked(budget.tryReserveBudget).mockReturnValue({
      allowed: false,
      currentCount: 3,
      maxAllowed: 3,
    });
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas y me han cobrado otra vez",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error.code).toBe("BUDGET_EXCEEDED");
  });
});

describe("POST /api/intake/confirm", () => {
  let POST: typeof import("@/app/api/intake/confirm/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/intake/confirm/route");
    POST = mod.POST;
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "text/plain" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({ caseId: "case-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("rejects unknown fact key", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "nonexistent.fact",
        decision: "confirm",
        value: { type: "string", value: "test" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_INPUT");
  });

  it("rejects confirm without value", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "cancellation.date",
        decision: "confirm",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("handles rejection correctly — no fact created", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "cancellation.date",
        decision: "reject",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision).toBe("rejected");
    expect(data.factKey).toBe("cancellation.date");
    // confirmFactForCase should NOT be called on rejection
    expect(mockConfirmFact).not.toHaveBeenCalled();
  });

  it("confirmation creates fact via confirmFactForCase", async () => {
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "cancellation.date",
        decision: "confirm",
        value: { type: "date", value: "2025-01-15" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decision).toBe("confirmed");
    expect(data.fact.status).toBe("CONFIRMED");
    expect(mockConfirmFact).toHaveBeenCalledTimes(1);
  });
});

describe("F8.3 API Security Invariants", () => {
  it("interpret rejects arbitrary problemKey injection", async () => {
    const mod = await import("@/app/api/intake/interpret/route");
    const request = new Request("http://localhost/api/intake/interpret", {
      method: "POST",
      body: JSON.stringify({
        message: "Cancelé mi servicio de internet hace dos semanas",
        problemKey: "injected-module",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await mod.POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    // Strict schema should reject extra fields
    expect(res.status).toBe(400);
  });

  it("confirm rejects arbitrary factKey not in any module", async () => {
    const mod = await import("@/app/api/intake/confirm/route");
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "admin.deleteAll",
        decision: "confirm",
        value: { type: "boolean", value: true },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await mod.POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(400);
  });

  it("confirm routes through loadCase before processing", async () => {
    // Verify that loadCase is always called — this is the case-existence check
    const request = new Request("http://localhost/api/intake/confirm", {
      method: "POST",
      body: JSON.stringify({
        caseId: "case-test-001",
        candidateId: "c-1",
        factKey: "cancellation.date",
        decision: "reject",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await (await import("@/app/api/intake/confirm/route")).POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Next.js route handler type mismatch in tests
    expect(res.status).toBe(200);
    // loadCase must have been called to verify the case exists
    expect(mockLoadCase).toHaveBeenCalledWith("case-test-001");
  });
});
