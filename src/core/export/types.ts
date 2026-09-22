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
import type { CaseHighlight } from "./highlights";

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
  /**
   * What the person answered, in their own words' terms.
   *
   * The report is meant to be readable on its own: without this section the
   * document listed conclusions but not the data they came from, so nobody
   * could check it against the claim they are about to send.
   */
  readonly answers?: readonly ExportAnswer[];
  /**
   * Amounts and dates the claim turns on (see `buildCaseHighlights`).
   * Shown before everything else so the case can be read in numbers.
   */
  readonly highlights?: readonly CaseHighlight[];
}

/** A fact supplied by the user, already formatted for reading. */
export interface ExportAnswer {
  /** Human name of the fact (never a raw fact key). */
  readonly label: string;
  /** Value formatted for reading ("Sí", "10/08/2026", "249,90 €"). */
  readonly value: string;
  /** Who provided it: the person, a document, or the analysis. */
  readonly origin: "USER" | "DOCUMENT" | "DERIVED";
  /**
   * Fact key behind the answer, when the report can let the person change it.
   *
   * Reading a report and finding a wrong date is when the mistake is noticed;
   * without the key there is no way to correct it from the screen, so the person
   * had to re-run the whole questionnaire to fix one field.
   */
  readonly factKey?: string;
  /** Declared answer type (`boolean`, `date`, `money`…), for the edit control. */
  readonly answerType?: string;
  /** Allowed values when the declared type is `enum`. */
  readonly answerOptions?: readonly string[];
}
