/**
 * TXT export adapter (Fase 7).
 *
 * Generates plain-text documents from case data.
 * This is the simplest adapter — no external dependencies.
 *
 * Content is generated deterministically from ExportData only.
 * Unknown fields remain as placeholders — never invented.
 */
import type { ExportPort } from "./ports";
import type { ExportData, ExportFormat, ExportOptions, ExportResult } from "./types";
import type { ClaimStatus } from "../result/types";

// ── Status Labels ───────────────────────────────────────────────────

const STATUS_LABELS: Record<ClaimStatus, string> = {
  SUPPORTED: "Confirmado",
  POTENTIALLY_APPLICABLE: "Potencialmente aplicable",
  INSUFFICIENT_DATA: "Datos insuficientes",
  CONTRADICTED: "Información contradictoria",
  NOT_APPLICABLE: "No aplicable",
  UNKNOWN: "No determinado",
};

// ── Section Builders ────────────────────────────────────────────────

function buildHeader(data: ExportData): string {
  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push("CONSUMER RESOLVER — INFORME DEL CASO");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Problema: ${data.caseMetadata.problemTitle}`);
  lines.push(`Jurisdicción: ${data.caseMetadata.jurisdiction}`);
  lines.push(`Fecha de creación: ${data.caseMetadata.createdAt}`);
  lines.push(`Fecha de análisis: ${data.result.evaluatedAt}`);
  lines.push(`Estado general: ${STATUS_LABELS[data.result.overallStatus]}`);
  lines.push("");
  return lines.join("\n");
}

function buildSummary(data: ExportData): string {
  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("RESUMEN");
  lines.push("-".repeat(60));
  lines.push("");
  lines.push(data.result.summary);
  lines.push("");
  return lines.join("\n");
}

function buildClaims(data: ExportData, includeDetails: boolean): string {
  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("AFIRMACIONES");
  lines.push("-".repeat(60));
  lines.push("");

  for (const claim of data.result.claims) {
    lines.push(`[${STATUS_LABELS[claim.status]}] ${claim.assertion}`);
    if (includeDetails) {
      lines.push(`  ${claim.explanation}`);
      if (claim.missingFacts.length > 0) {
        lines.push(`  Datos faltantes: ${claim.missingFacts.join(", ")}`);
      }
      if (claim.contradictedFacts.length > 0) {
        lines.push(`  Información contradictoria: ${claim.contradictedFacts.join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildMissingInfo(data: ExportData): string {
  if (data.result.missingInformation.length === 0) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("INFORMACIÓN FALTANTE");
  lines.push("-".repeat(60));
  lines.push("");

  for (const missing of data.result.missingInformation) {
    lines.push(`• ${missing.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildActions(data: ExportData): string {
  if (data.actionPlan.actions.length === 0) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("ACCIONES RECOMENDADAS");
  lines.push("-".repeat(60));
  lines.push("");
  lines.push(`Siguiente paso: ${data.actionPlan.nextStep}`);
  lines.push("");

  for (const action of data.actionPlan.actions) {
    lines.push(`${action.priority}. ${action.title}`);
    lines.push(`   ${action.description}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildSources(data: ExportData, includeSources: boolean): string {
  if (!includeSources || data.result.sources.length === 0) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("FUENTES CONSULTADAS");
  lines.push("-".repeat(60));
  lines.push("");

  for (const source of data.result.sources) {
    lines.push(`• ${source.title}`);
    lines.push(`  Tipo: ${source.type}`);
    lines.push(`  URL: ${source.url}`);
    lines.push(`  Consultado: ${source.retrievedAt}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildDisclaimers(data: ExportData, includeDisclaimers: boolean): string {
  if (!includeDisclaimers || data.result.disclaimers.length === 0) return "";

  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push("AVISO LEGAL");
  lines.push("=".repeat(60));
  lines.push("");

  for (const disclaimer of data.result.disclaimers) {
    lines.push(`• ${disclaimer}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ── TXT Adapter ─────────────────────────────────────────────────────

export class TxtExportAdapter implements ExportPort {
  readonly format: ExportFormat = "txt";

  supports(format: ExportFormat): boolean {
    return format === "txt";
  }

  async export(data: ExportData, options?: ExportOptions): Promise<ExportResult> {
    const includeDetails = options?.includeClaimDetails ?? true;
    const includeSources = options?.includeSources ?? true;
    const includeDisclaimers = options?.includeDisclaimers ?? true;

    const content = [
      buildHeader(data),
      buildSummary(data),
      buildClaims(data, includeDetails),
      buildMissingInfo(data),
      buildActions(data),
      buildSources(data, includeSources),
      buildDisclaimers(data, includeDisclaimers),
    ].join("\n");

    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);

    return {
      format: "txt",
      content,
      mimeType: "text/plain; charset=utf-8",
      filename: `consumer-resolver-${data.result.caseId}.txt`,
      sizeBytes: bytes.length,
    };
  }
}
