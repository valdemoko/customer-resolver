/**
 * AI request audit repository (Fase 6).
 *
 * Implements core/ai/ports.AIRequestAuditPort on top of the ai_requests
 * table. Best-effort semantics live with the CALLER: this repository only
 * persists what it is given. Records contain no prompts, no document
 * content, no PII (enforced upstream by the router's record builder).
 */
import type { AIRequestAuditPort } from "@core/ai/ports";
import type { AIRequestRecord } from "@core/ai/types";
import type { AppDb } from "../client";
import { aiRequests } from "../schema";

export class AIRequestAuditRepository implements AIRequestAuditPort {
  constructor(private readonly db: AppDb) {}

  async record(entry: AIRequestRecord): Promise<void> {
    await this.db.insert(aiRequests).values({
      id: entry.aiRequestId,
      caseId: entry.caseId ?? null,
      task: entry.task,
      provider: entry.providerId,
      model: entry.modelId,
      promptId: entry.promptId,
      promptVersion: entry.promptVersion,
      schemaVersion: entry.outputSchemaVersion,
      inputHash: entry.inputHash,
      status: entry.status,
      usage: entry.usage
        ? {
            inputTokens: entry.usage.inputTokens,
            outputTokens: entry.usage.outputTokens,
            totalTokens: entry.usage.totalTokens,
            estimatedCost: entry.usage.estimatedCost,
            costCurrency: entry.usage.costCurrency,
          }
        : null,
      attempts: entry.attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        providerId: a.providerId,
        modelId: a.modelId,
        status: a.status,
        errorCode: a.errorCode ?? null,
        durationMs: a.durationMs,
      })),
      durationMs: entry.durationMs,
      errorCode: entry.errorCode ?? null,
      createdAt: entry.createdAt,
    });
  }
}
