/**
 * Export domain types (Fase 7).
 *
 * Pure types — no I/O, no framework, per ARCHITECTURE.md §4.
 *
 * The export system generates documents from Result + ActionPlan data.
 * It NEVER invents facts, NEVER fabricates content, and NEVER
 * misrepresents the case status.
 */
import type { Result } from "../result/types";
import type { ActionPlan } from "../actions/types";

// ── Export Format ───────────────────────────────────────────────────

export type ExportFormat = "txt" | "pdf" | "docx";

// ── Export Options ──────────────────────────────────────────────────

export interface ExportOptions {
  readonly format?: ExportFormat;
  readonly language?: string;
  /** Include full claim details (default: true). */
  readonly includeClaimDetails?: boolean;
  /** Include source URLs (default: true). */
  readonly includeSources?: boolean;
  /** Include disclaimers (default: true, should rarely be false). */
  readonly includeDisclaimers?: boolean;
}

// ── Export Result ───────────────────────────────────────────────────

export interface ExportResult {
  readonly format: ExportFormat;
  /** The generated content (string for txt, Buffer for pdf/docx). */
  readonly content: string | Uint8Array;
  /** MIME type of the generated content. */
  readonly mimeType: string;
  /** Suggested filename. */
  readonly filename: string;
  /** Size in bytes. */
  readonly sizeBytes: number;
}

// ── Export Data ─────────────────────────────────────────────────────

/**
 * The data needed to generate an export.
 * This is a subset of Result + ActionPlan — no raw rule evaluations.
 */
export interface ExportData {
  readonly result: Result;
  readonly actionPlan: ActionPlan;
  /** Case metadata (for the document header). */
  readonly caseMetadata: {
    readonly problemTitle: string;
    readonly jurisdiction: string;
    readonly createdAt: string;
  };
}
