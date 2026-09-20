/**
 * Export port (Fase 7).
 *
 * Core defines WHAT it needs; infrastructure implements HOW.
 * The core never generates files directly.
 */
import type { ExportData, ExportFormat, ExportOptions, ExportResult } from "./types";

/**
 * Export port: generates documents from case data.
 * Each format (txt, pdf, docx) has its own adapter.
 */
export interface ExportPort {
  readonly format: ExportFormat;

  /**
   * Check if this adapter supports the requested format.
   */
  supports(format: ExportFormat): boolean;

  /**
   * Generate a document from case data.
   * NEVER invents content — only uses data from ExportData.
   */
  export(data: ExportData, options?: ExportOptions): Promise<ExportResult>;
}
