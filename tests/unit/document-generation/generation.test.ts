/**
 * Document Generation tests (Fase 12).
 *
 * Tests the complete document generation pipeline:
 *   1. Input builder (facts → structured input)
 *   2. Validator (draft → validation result)
 *   3. Adversarial (hallucination, injection, access control)
 *   4. Schemas (Zod validation)
 */
import { describe, expect, it } from "vitest";

// ── Input Builder Tests ─────────────────────────────────────────────

import { determineDocumentType, buildDocumentInput } from "@core/document-generation/input-builder";
import type { Fact, FactId, FactKey } from "@core/types";
import type { IsoDate, IsoDateTime } from "@core/shared/temporal";
import type { Result, Claim } from "@core/result/types";
import type { ActionPlan } from "@core/actions/types";

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "fact-1" as FactId,
    caseId: "case-1",
    key: "cancellation.request_date" as FactKey,
    value: { type: "date", value: "2026-09-10" as IsoDate },
    provenance: "USER_PROVIDED",
    status: "CONFIRMED",
    confidence: "USER",
    evidenceRefs: [],
    createdAt: "2026-09-10T10:00:00Z" as IsoDateTime,
    updatedAt: "2026-09-10T10:00:00Z" as IsoDateTime,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim-1",
    ruleKey: "cancellation-charge.charge-after-cancellation",
    ruleVersion: 1,
    status: "SUPPORTED",
    assertion: "El cargo se produjo después de la fecha de cancelación",
    explanation: "Con la información disponible, el cargo se registró después de la cancelación.",
    supportingFacts: [],
    supportingSources: [],
    missingFacts: [],
    contradictedFacts: [],
    ruleTraces: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<Result> = {}): Result {
  return {
    caseId: "case-1",
    problemKey: "cancellation-charge",
    evaluatedAt: "2026-09-15T10:00:00Z" as IsoDateTime,
    engineVersion: "1.0.0",
    overallStatus: "SUPPORTED",
    summary: "Análisis: 1 afirmación confirmada.",
    claims: [makeClaim()],
    missingInformation: [],
    contradictions: [],
    sources: [],
    disclaimers: ["Esta información no constituye asesoramiento legal."],
    channels: [],
    intakeComplete: true,
    ...overrides,
    company: overrides.company ?? null,
  };
}

function makeActionPlan(overrides: Partial<ActionPlan> = {}): ActionPlan {
  return {
    caseId: "case-1",
    problemKey: "cancellation-charge",
    generatedAt: "2026-09-15T10:00:00Z",
    actions: [],
    nextStep: "Siguiente paso: Generar reclamación.",
    complete: true,
    ...overrides,
  };
}

describe("determineDocumentType", () => {
  it("maps cancellation-charge to CONSUMER_COMPLAINT", () => {
    expect(determineDocumentType("cancellation-charge", [])).toBe("CONSUMER_COMPLAINT");
  });

  it("maps no-delivery-refund to REFUND_REQUEST", () => {
    expect(determineDocumentType("no-delivery-refund", [])).toBe("REFUND_REQUEST");
  });

  it("maps warranty-rejection to WARRANTY_CLAIM", () => {
    expect(determineDocumentType("warranty-rejection", [])).toBe("WARRANTY_CLAIM");
  });

  it("maps flight-cancel to FLIGHT_CANCELLATION_CLAIM", () => {
    expect(determineDocumentType("flight-cancel", [])).toBe("FLIGHT_CANCELLATION_CLAIM");
  });

  it("maps unknown to GENERAL_FORMAL_REQUEST", () => {
    expect(determineDocumentType("unknown-problem", [])).toBe("GENERAL_FORMAL_REQUEST");
  });

  it("upgrades to REFUND_REQUEST when reimbursement claim exists", () => {
    const claims = [
      makeClaim({
        ruleKey: "cancellation-charge.reimbursement-entitlement",
        status: "SUPPORTED",
      }),
    ];
    expect(determineDocumentType("cancellation-charge", claims)).toBe("REFUND_REQUEST");
  });
});

describe("buildDocumentInput", () => {
  it("builds input from confirmed facts only", () => {
    const facts = [
      makeFact({ key: "cancellation.request_date" as Fact["key"], status: "CONFIRMED" }),
      makeFact({
        id: "fact-2" as FactId,
        key: "cancellation.service_name" as FactKey,
        value: { type: "string", value: "Netflix" },
        status: "UNCONFIRMED",
      }),
    ];

    const input = buildDocumentInput({
      caseId: "case-1",
      result: makeResult(),
      actionPlan: makeActionPlan(),
      facts,
      sender: { name: "Juan García" },
      recipient: { name: "Netflix España" },
      requestedAction: "Solicitar reembolso del cargo",
    });

    // Only confirmed facts should be in confirmedFacts
    expect(input.confirmedFacts).toHaveLength(1);
    expect(input.confirmedFacts[0]!.factKey).toBe("cancellation.request_date");
  });

  it("builds legal statements from SUPPORTED claims only", () => {
    const claims = [
      makeClaim({ id: "claim-1", status: "SUPPORTED" }),
      makeClaim({
        id: "claim-2",
        ruleKey: "cancellation-charge.contract-duration-exceeds-24-months",
        status: "POTENTIALLY_APPLICABLE",
      }),
    ];

    const input = buildDocumentInput({
      caseId: "case-1",
      result: makeResult({ claims }),
      actionPlan: makeActionPlan(),
      facts: [],
      sender: { name: "Juan García" },
      recipient: { name: "Netflix España" },
      requestedAction: "Solicitar reembolso",
    });

    expect(input.supportedClaims).toHaveLength(1);
    expect(input.supportedClaims[0]!.claimId).toBe("claim-1");
  });

  it("includes contradictions as unresolved items", () => {
    const result = makeResult({
      contradictions: [
        {
          factKey: "cancellation.request_date" as FactKey,
          description: "Información contradictoria sobre la fecha",
          conflictingValues: [],
          affectedClaims: ["claim-1"],
        },
      ],
    });

    const input = buildDocumentInput({
      caseId: "case-1",
      result,
      actionPlan: makeActionPlan(),
      facts: [],
      sender: { name: "Juan García" },
      recipient: { name: "Netflix España" },
      requestedAction: "Solicitar reembolso",
    });

    expect(input.unresolvedItems).toHaveLength(1);
    expect(input.unresolvedItems[0]!.type).toBe("CONTRADICTION");
  });
});

// ── Validator Tests ─────────────────────────────────────────────────

import { validateDraft } from "@core/document-generation/validator";
import type { GeneratedDraft, DocumentGenerationInput } from "@core/document-generation/types";

function makeDraft(overrides: Partial<GeneratedDraft> = {}): GeneratedDraft {
  return {
    title: "Reclamación por cargo indebido",
    subject: "Solicitud de reembolso",
    sections: [
      {
        type: "INTRODUCTION",
        title: "Introducción",
        content: "Me dirijo a usted para reclamar el reembolso.",
      },
      {
        type: "FACTS",
        title: "Hechos",
        content: "El cargo se realizó el 10 de septiembre de 2026.",
      },
    ],
    factualStatements: [
      { factKey: "cancellation.request_date", text: "Fecha de solicitud: 10/09/2026" },
    ],
    legalStatements: [
      { claimId: "claim-1", text: "El cargo se produjo después de la cancelación." },
    ],
    requestedActions: ["Reembolso del importe cobrado"],
    unresolvedItems: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<DocumentGenerationInput> = {}): DocumentGenerationInput {
  return {
    documentType: "CONSUMER_COMPLAINT",
    jurisdiction: "ES",
    language: "es",
    sender: { name: "Juan García" },
    recipient: { name: "Netflix España" },
    confirmedFacts: [
      {
        factKey: "cancellation.request_date" as FactKey,
        factId: "fact-1" as FactId,
        text: "Fecha de solicitud: 10/09/2026",
        confidence: "CONFIRMED",
      },
    ],
    supportedClaims: [
      {
        claimId: "claim-1",
        ruleKey: "cancellation-charge.charge-after-cancellation",
        text: "El cargo se produjo después de la cancelación.",
        citationIds: [],
      },
    ],
    applicableSources: [],
    timeline: [],
    requestedAction: "Solicitar reembolso del cargo",
    caseMetadata: {
      problemKey: "cancellation-charge",
      problemTitle: "Cobro después de cancelar servicio",
      createdAt: "2026-09-10",
    },
    unresolvedItems: [],
    ...overrides,
  };
}

describe("validateDraft", () => {
  it("passes for a valid draft", () => {
    const result = validateDraft(makeDraft(), makeInput());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("blocks untraceable factual statements", () => {
    const draft = makeDraft({
      factualStatements: [{ factKey: "nonexistent.fact", text: "This fact doesn't exist" }],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "UNTRACEABLE_FACT")).toBe(true);
  });

  it("blocks untraceable legal statements", () => {
    const draft = makeDraft({
      legalStatements: [{ claimId: "fake-claim", text: "This claim doesn't exist" }],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "UNTRACEABLE_CLAIM")).toBe(true);
  });

  it("warns about invented numbers", () => {
    const draft = makeDraft({
      sections: [
        {
          type: "FACTS",
          title: "Hechos",
          content: "El cargo fue de 999.99 €, una cantidad indebida.",
        },
      ],
    });

    const input = makeInput();
    const result = validateDraft(draft, input);
    // Should warn about 999.99 if it's not in the input
    expect(result.warnings.some((w) => w.code === "INVENTED_NUMBER")).toBe(true);
  });

  it("warns when LEGAL_BASIS section has no sources", () => {
    const draft = makeDraft({
      sections: [
        {
          type: "LEGAL_BASIS",
          title: "Fundamento jurídico",
          content: "Según el artículo 43 del TRLGDCU, el vendedor es responsable.",
        },
      ],
    });

    const input = makeInput({ applicableSources: [] });
    const result = validateDraft(draft, input);
    expect(result.warnings.some((w) => w.code === "LEGAL_BASIS_NO_SOURCES")).toBe(true);
  });

  it("blocks hidden contradictions", () => {
    const draft = makeDraft({
      unresolvedItems: [],
    });

    const input = makeInput({
      unresolvedItems: [
        {
          type: "CONTRADICTION",
          description: "Fecha contradictoria",
        },
      ],
    });

    const result = validateDraft(draft, input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "HIDDEN_CONTRADICTION")).toBe(true);
  });

  it("warns about missing introduction section", () => {
    const draft = makeDraft({
      sections: [
        {
          type: "FACTS",
          title: "Hechos",
          content: "El cargo se realizó.",
        },
      ],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.warnings.some((w) => w.code === "MISSING_INTRODUCTION")).toBe(true);
  });
});

// ── Adversarial Tests ───────────────────────────────────────────────

describe("Adversarial: Hallucination Protection", () => {
  it("blocks facts not in the confirmed list", () => {
    const draft = makeDraft({
      factualStatements: [{ factKey: "invented.fact", text: "The seller owes €500" }],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.valid).toBe(false);
  });

  it("blocks claims not in the supported list", () => {
    const draft = makeDraft({
      legalStatements: [{ claimId: "invented-claim", text: "You have the right to €1000" }],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.valid).toBe(false);
  });
});

describe("Adversarial: Content Safety", () => {
  it("warns about absolute legal claims with amounts", () => {
    const draft = makeDraft({
      sections: [
        {
          type: "LEGAL_BASIS",
          title: "Fundamento",
          content: "Tiene derecho a recibir 500 € en concepto de indemnización.",
        },
      ],
    });

    const result = validateDraft(draft, makeInput());
    expect(result.warnings.some((w) => w.code === "ABSOLUTE_LEGAL_CLAIM")).toBe(true);
  });
});

// ── Schema Tests ────────────────────────────────────────────────────

import { generatedDraftSchema } from "@core/document-generation/schemas";

describe("generatedDraftSchema", () => {
  it("accepts a valid draft", () => {
    const draft = makeDraft();
    const result = generatedDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it("rejects empty sections", () => {
    const result = generatedDraftSchema.safeParse({
      title: "Test",
      subject: "Test",
      sections: [],
      factualStatements: [],
      legalStatements: [],
      requestedActions: [],
      unresolvedItems: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = generatedDraftSchema.safeParse({
      subject: "Test",
      sections: [{ type: "FACTS", title: "Facts", content: "Content" }],
      factualStatements: [],
      legalStatements: [],
      requestedActions: [],
      unresolvedItems: [],
    });
    expect(result.success).toBe(false);
  });

  it("strips unexpected fields (strict mode)", () => {
    const result = generatedDraftSchema.safeParse({
      title: "Test",
      subject: "Test",
      sections: [{ type: "FACTS", title: "Facts", content: "Content" }],
      factualStatements: [],
      legalStatements: [],
      requestedActions: [],
      unresolvedItems: [],
      injectedField: "malicious",
    });
    // strict() should reject unexpected fields
    expect(result.success).toBe(false);
  });
});
