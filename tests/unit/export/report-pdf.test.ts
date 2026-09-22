/**
 * The downloaded report.
 *
 * Two things must hold for a document a person sends to a company or to an
 * official body:
 *  - it contains the case (their answers, the conclusions, the pending data, the
 *    channels, the sources) and never an internal fact key;
 *  - it is a real, readable PDF, not a text file with a .pdf name.
 */
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

/**
 * Read the text back out of a generated PDF.
 * pdf-lib writes each text run either as a literal string or as hex, inside
 * deflated content streams, so both shapes are decoded here.
 */
function extractPdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let content = "";
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      content += `${inflateSync(Buffer.from(match[1] as string, "latin1")).toString("latin1")}\n`;
    } catch {
      // Not a deflated stream (fonts, embedded files): ignore.
    }
  }

  const runs: string[] = [];
  for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    runs.push(Buffer.from(match[1] as string, "hex").toString("latin1"));
  }
  for (const match of content.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
    runs.push((match[1] as string).replace(/\\([()\\])/g, "$1"));
  }
  return runs.join("\n");
}

import { deriveActions } from "@core/actions/engine";
import { buildExportAnswers, formatFactValue } from "@core/export/answers";
import { buildCaseHighlights } from "@core/export/highlights";
import { ExportService } from "@core/export/service";
import { buildResult } from "@core/result/engine";
import type { RuleEvaluation } from "@core/rules/types";
import type { Fact, FactKey } from "@core/types";
import { PdfExportAdapter } from "@server/adapters/export/pdf-adapter";
import { TxtExportAdapter } from "@core/export/txt-adapter";

function fact(key: string, value: unknown): Fact {
  return {
    id: `f-${key}`,
    caseId: "case-1",
    key: key as FactKey,
    value,
    status: "CONFIRMED",
    confidence: "USER",
    provenance: "USER_PROVIDED",
    evidenceRefs: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
  } as unknown as Fact;
}

const FACTS = [
  fact("flight.departure_airport", { type: "string", value: "Madrid" }),
  // The company the claim is against: the report names it and prints its
  // verified customer service.
  fact("airline.name", { type: "string", value: "Vueling" }),
  fact("passenger.additional_costs", {
    type: "money",
    value: { amountMinor: 24990, currency: "EUR" },
  }),
  fact("airline.re_routing_offered", { type: "boolean", value: true }),
  fact("flight.scheduled_date", { type: "date", value: "2026-08-10" }),
];

const QUESTIONS = [
  { id: "q-dep", text: "¿De qué aeropuerto salía tu vuelo?", factKey: "flight.departure_airport", required: true, type: "string" },
  { id: "q-costs", text: "¿Tuviste gastos adicionales?", factKey: "passenger.additional_costs", required: false, type: "money" },
  { id: "q-reroute", text: "¿La aerolínea te ofreció un vuelo alternativo?", factKey: "airline.re_routing_offered", required: true, type: "boolean" },
  { id: "q-sched", text: "¿Cuál era la fecha programada del vuelo?", factKey: "flight.scheduled_date", required: true, type: "date" },
];

const EVALUATION = {
  ruleKey: "flight-cancel.compensation-amount",
  ruleVersion: 1,
  status: "INSUFFICIENT_DATA",
  traces: [],
  missingFacts: ["flight.compensation_tier"] as FactKey[],
  contradictedFacts: [],
  evidenceRefs: [],
  sourceIds: ["src-eu261-art7"],
} as unknown as RuleEvaluation;

function buildExportData() {
  const result = buildResult({
    caseId: "case-1",
    problemKey: "flight-cancel",
    evaluatedAt: "2026-09-01T00:00:00.000Z",
    engineVersion: "test",
    facts: FACTS,
    evaluations: [EVALUATION],
    sources: [
      {
        sourceId: "src-eu261-art7",
        title: "Reglamento (CE) 261/2004, art. 7",
        url: "https://eur-lex.europa.eu/eli/reg/2004/261/oj",
        type: "Reglamento",
        retrievedAt: "2026-09-01T00:00:00.000Z",
        claim: "Cuantía de la compensación",
      },
    ],
    questions: QUESTIONS,
    factLabels: { "flight.compensation_tier": "Tier de compensación según distancia" },
    intakeComplete: false,
  });

  return {
    result,
    actionPlan: deriveActions(result),
    answers: buildExportAnswers(FACTS, {
      questions: Object.fromEntries(QUESTIONS.map((q) => [q.factKey, q.text])),
      factLabels: {},
    }),
    highlights: buildCaseHighlights(FACTS, {
      questions: Object.fromEntries(QUESTIONS.map((q) => [q.factKey, q.text])),
      factLabels: {},
    }),
    caseMetadata: {
      problemTitle: "Vuelo cancelado",
      jurisdiction: "ES",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  };
}

describe("buildExportAnswers", () => {
  it("names facts the way they were asked and formats their values", () => {
    const answers = buildExportAnswers(FACTS, {
      questions: Object.fromEntries(QUESTIONS.map((q) => [q.factKey, q.text])),
      factLabels: {},
    });

    const byLabel = new Map(answers.map((a) => [a.label, a.value]));
    expect(byLabel.get("¿De qué aeropuerto salía tu vuelo?")).toBe("Madrid");
    expect(byLabel.get("¿Tuviste gastos adicionales?")).toBe("249,90 €");
    expect(byLabel.get("¿La aerolínea te ofreció un vuelo alternativo?")).toBe("Sí");
    expect(byLabel.get("¿Cuál era la fecha programada del vuelo?")).toBe("10/08/2026");
  });

  it("omits facts it cannot name instead of printing the key", () => {
    const answers = buildExportAnswers(
      [fact("internal.unknown_fact", { type: "string", value: "x" })],
      { questions: {}, factLabels: {} },
    );
    expect(answers).toHaveLength(0);
  });

  it("formats money, booleans and dates for reading", () => {
    expect(formatFactValue({ type: "boolean", value: false })).toBe("No");
    expect(formatFactValue({ type: "money", value: { amountMinor: 5, currency: "EUR" } })).toBe(
      "0,05 €",
    );
    expect(formatFactValue({ type: "date", value: "2026-01-02" })).toBe("02/01/2026");
    expect(formatFactValue({ type: "number", value: 12 })).toBe("12");
    expect(formatFactValue(null)).toBeNull();
  });
});

describe("PdfExportAdapter", () => {
  it("generates a readable PDF", async () => {
    const service = new ExportService([new PdfExportAdapter(), new TxtExportAdapter()]);
    const exported = await service.exportCase(buildExportData(), "pdf");

    expect(exported.format).toBe("pdf");
    expect(exported.mimeType).toBe("application/pdf");
    expect(exported.filename).toMatch(/\.pdf$/);

    const bytes = exported.content as Uint8Array;
    // A real PDF file, openable by any reader.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toContain("case-1");
  });

  it("carries the answers, the conclusions, the channels and the sources", async () => {
    const exported = await new PdfExportAdapter().export(buildExportData());
    const text = extractPdfText(exported.content as Uint8Array);

    expect(text).toContain("Informe del caso");
    expect(text).toContain("Vuelo cancelado");
    // The answers, with the question they answered and the value they gave.
    expect(text).toContain("De qué aeropuerto salía tu vuelo");
    expect(text).toContain("Madrid");
    expect(text).toContain("249,90");
    // Pending data, in words (section headings are printed uppercased).
    expect(text).toContain("DATOS QUE FALTAN");
    expect(text).toContain("no reconocemos los aeropuertos");
    // Where to act and what backs the analysis.
    expect(text).toContain("DÓNDE RECLAMAR");
    expect(text).toContain("OMIC");
    expect(text).toContain("FUENTES CONSULTADAS");
    expect(text).toContain("Reglamento (CE) 261/2004");
  });

  it("names the company and prints its verified customer service", async () => {
    const exported = await new PdfExportAdapter().export(buildExportData());
    const text = extractPdfText(exported.content as Uint8Array);

    expect(text).toContain("EMPRESA A LA QUE RECLAMAS: VUELING");
    expect(text).toContain("900 645 000");
    // Always attributable: where the channels were read and when.
    expect(text).toContain("help.vueling.com");
    expect(text).toContain("2026-09-22");
  });

  it("opens with the amounts and dates of the case", async () => {
    const exported = await new PdfExportAdapter().export(buildExportData());
    const text = extractPdfText(exported.content as Uint8Array);

    expect(text).toContain("DATOS CLAVE DEL CASO");
    expect(text).toContain("249,90 EUR");
    expect(text).toContain("10/08/2026");
  });

  it("never leaves an internal fact key in the document", async () => {
    const exported = await new PdfExportAdapter().export(buildExportData());
    const text = extractPdfText(exported.content as Uint8Array);

    for (const key of [
      "flight.compensation_tier",
      "airline.re_routing_offered",
      "passenger.additional_costs",
    ]) {
      expect(text).not.toContain(key);
    }
  });

  it("keeps accented Spanish text readable in the PDF", async () => {
    const exported = await new PdfExportAdapter().export(buildExportData());
    const text = extractPdfText(exported.content as Uint8Array);
    expect(text).toMatch(/análisis/i);
  });
});
