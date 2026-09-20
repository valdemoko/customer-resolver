/**
 * TXT Export adapter tests (Fase 7, spec §Testing).
 *
 * Tests the TxtExportAdapter:
 * - Export with valid data
 * - No invented content
 * - Disclaimers included
 * - Sources included when requested
 * - Unknown fields remain as placeholders
 */
import { describe, expect, it } from "vitest";
import { TxtExportAdapter } from "@core/export/txt-adapter";
import type { ExportData } from "@core/export/types";

// ── Test Data ───────────────────────────────────────────────────────

function makeExportData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    result: {
      caseId: "case-1",
      problemKey: "cancellation-charge",
      evaluatedAt: "2026-09-20T00:00:00Z" as unknown as import("@core/shared/temporal").IsoDateTime,
      engineVersion: "1.0.0",
      overallStatus: "SUPPORTED",
      summary: "Análisis: 1 afirmación confirmada.",
      claims: [
        {
          id: "claim-1",
          ruleKey: "cancellation-charge.charge-after-cancellation",
          ruleVersion: 1,
          status: "SUPPORTED",
          assertion: "El cargo se produjo después de la cancelación",
          explanation: "Con la información disponible, el cargo se registró después.",
          supportingFacts: [],
          supportingSources: [],
          missingFacts: [],
          contradictedFacts: [],
          ruleTraces: [],
        },
      ],
      missingInformation: [],
      contradictions: [],
      sources: [
        {
          sourceId: "src:ley-3-2014",
          title: "Ley 3/2014",
          url: "https://www.boe.es/buscar/act.php?id=BOE-A-2014-33296",
          type: "law",
          retrievedAt: "2026-09-20",
          claim: "Derecho de desistimiento",
        },
      ],
      disclaimers: ["Esta información no constituye asesoramiento legal."],
      intakeComplete: true,
    },
    actionPlan: {
      caseId: "case-1",
      problemKey: "cancellation-charge",
      generatedAt: "2026-09-20T00:00:00Z" as unknown as import("@core/shared/temporal").IsoDateTime,
      actions: [
        {
          id: "action-1",
          type: "REQUEST_REFUND",
          title: "Solicitar reembolso",
          description: "Solicite el reembolso del cargo.",
          priority: 1,
          status: "AVAILABLE",
          prerequisites: [],
          relatedClaims: ["claim-1"],
          relatedEvidence: [],
        },
      ],
      nextStep: "Siguiente paso: Solicitar reembolso.",
      complete: true,
    },
    caseMetadata: {
      problemTitle: "Cobro después de cancelar un servicio",
      jurisdiction: "ES",
      createdAt: "2026-09-19T00:00:00Z",
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("TXT Export Adapter", () => {
  const adapter = new TxtExportAdapter();

  it("supports txt format", () => {
    expect(adapter.supports("txt")).toBe(true);
    expect(adapter.supports("pdf")).toBe(false);
    expect(adapter.supports("docx")).toBe(false);
  });

  it("generates a valid txt document", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);

    expect(result.format).toBe("txt");
    expect(result.mimeType).toBe("text/plain; charset=utf-8");
    expect(result.filename).toContain("case-1");
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("includes header with case metadata", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("CONSUMER RESOLVER");
    expect(content).toContain("Cobro después de cancelar un servicio");
    expect(content).toContain("ES");
  });

  it("includes summary", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("RESUMEN");
    expect(content).toContain("1 afirmación confirmada");
  });

  it("includes claims", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("AFIRMACIONES");
    expect(content).toContain("El cargo se produjo después de la cancelación");
    expect(content).toContain("Confirmado");
  });

  it("includes actions", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("ACCIONES RECOMENDADAS");
    expect(content).toContain("Solicitar reembolso");
  });

  it("includes sources when requested", async () => {
    const data = makeExportData();
    const result = await adapter.export(data, { includeSources: true });
    const content = result.content as string;

    expect(content).toContain("FUENTES CONSULTADAS");
    expect(content).toContain("Ley 3/2014");
    expect(content).toContain("https://www.boe.es/buscar/act.php?id=BOE-A-2014-33296");
  });

  it("excludes sources when not requested", async () => {
    const data = makeExportData();
    const result = await adapter.export(data, { includeSources: false });
    const content = result.content as string;

    expect(content).not.toContain("FUENTES CONSULTADAS");
  });

  it("includes disclaimers", async () => {
    const data = makeExportData();
    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("AVISO LEGAL");
    expect(content).toContain("Esta información no constituye asesoramiento legal.");
  });

  it("never invents content — only uses provided data", async () => {
    const data = makeExportData({
      result: {
        ...makeExportData().result,
        claims: [],
        sources: [],
        disclaimers: [],
      },
    });

    const result = await adapter.export(data);
    const content = result.content as string;

    // Should not contain invented legal articles or URLs
    expect(content).not.toContain("Artículo");
    expect(content).not.toContain("BOE-A-2024");
  });

  it("handles missing information section", async () => {
    const data = makeExportData({
      result: {
        ...makeExportData().result,
        missingInformation: [
          {
            factKey: "charge.date" as never,
            description: "Fecha del cargo",
            impact: "required",
            blockedClaims: ["rule-1"],
          },
        ],
      },
    });

    const result = await adapter.export(data);
    const content = result.content as string;

    expect(content).toContain("INFORMACIÓN FALTANTE");
    expect(content).toContain("Fecha del cargo");
  });
});
