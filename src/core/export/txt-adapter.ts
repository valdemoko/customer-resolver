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
import { COMPANY_CONTACT_GUIDANCE } from "../result/company-contacts";

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

/** Amounts and dates the claim turns on, before the prose. */
function buildHighlights(data: ExportData): string {
  const highlights = data.highlights ?? [];
  if (highlights.length === 0) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("DATOS CLAVE DEL CASO");
  lines.push("-".repeat(60));
  lines.push("");

  for (const item of highlights) {
    lines.push(`• ${item.label}: ${item.value}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * The company the claim is against and its official customer service.
 *
 * Only verified channels are printed, always with the official page and the
 * verification date, so the reader can confirm them before calling.
 */
function buildCompany(data: ExportData): string {
  const company = data.result.company;
  if (!company) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push(`EMPRESA A LA QUE RECLAMAS: ${company.name}`);
  lines.push("-".repeat(60));
  lines.push("");

  if (!company.known) {
    lines.push(
      "No tenemos verificados los canales oficiales de atención al cliente de esta empresa, así que no reproducimos ningún teléfono ni correo. Puedes encontrarlos así:",
    );
    for (const step of COMPANY_CONTACT_GUIDANCE) lines.push(`• ${step}`);
    lines.push("");
    return lines.join("\n");
  }

  for (const channel of company.channels) {
    lines.push(`• ${channel.label}${channel.value ? `: ${channel.value}` : ""}`);
    if (channel.hours) lines.push(`   ${channel.hours}`);
    if (channel.url) lines.push(`   ${channel.url}`);
    if (channel.note) lines.push(`   ${channel.note}`);
    lines.push("");
  }

  if (company.note) lines.push(`${company.note}`);
  if (company.sourceUrl) {
    lines.push(
      `Canales verificados el ${company.verifiedAt ?? ""} en la página oficial: ${company.sourceUrl}`,
    );
  }
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

function buildChannels(data: ExportData): string {
  const channels = data.result.channels;
  if (channels.length === 0) return "";

  const lines: string[] = [];
  lines.push("-".repeat(60));
  lines.push("DÓNDE RECLAMAR");
  lines.push("-".repeat(60));
  lines.push("");

  for (const channel of channels) {
    lines.push(`• ${channel.target}`);
    lines.push(`   ${channel.channel}`);
    lines.push(`   ${channel.why}`);
    lines.push(`   URL oficial: ${channel.url}`);
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
      buildHighlights(data),
      buildCompany(data),
      buildSummary(data),
      buildClaims(data, includeDetails),
      buildMissingInfo(data),
      buildActions(data),
      buildChannels(data),
      buildSources(data, includeSources),
      buildDisclaimers(data, includeDisclaimers),
    ].join("\n");

    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);

    return {
      format: "txt",
      content,
      mimeType: "text/plain; charset=utf-8",
      filename: `resolveo-${data.result.caseId}.txt`,
      sizeBytes: bytes.length,
    };
  }
}
