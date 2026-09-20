/**
 * Export Service (Fase 7).
 *
 * Orchestrates document generation from case data.
 * Selects the appropriate adapter based on the requested format.
 *
 * The service NEVER invents content — only uses data from ExportData.
 */
import { DomainError } from "@lib/errors";
import type { ExportPort } from "./ports";
import type { ExportData, ExportFormat, ExportOptions, ExportResult } from "./types";

export class ExportService {
  private readonly adapters: Map<ExportFormat, ExportPort>;

  constructor(adapters: readonly ExportPort[]) {
    this.adapters = new Map();
    for (const adapter of adapters) {
      this.adapters.set(adapter.format, adapter);
    }
  }

  /**
   * Export case data in the requested format.
   * Throws DomainError if the format is not supported.
   */
  async exportCase(
    data: ExportData,
    format: ExportFormat = "txt",
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const adapter = this.adapters.get(format);
    if (!adapter) {
      throw new DomainError(
        `Export format not supported: ${format}. Available: ${[...this.adapters.keys()].join(", ")}`,
      );
    }

    return adapter.export(data, {
      format,
      ...options,
    });
  }

  /**
   * List supported export formats.
   */
  supportedFormats(): readonly ExportFormat[] {
    return [...this.adapters.keys()];
  }
}
