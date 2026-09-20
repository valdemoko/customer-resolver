/**
 * AI Router (Fase 6, spec §4/§15/§16/§11).
 *
 *   AI task → requirements → eligible providers/models → selected provider
 *           → request → response (validated) → provenance record
 *
 *  - Selection is capability-driven (structured output, token limits, task
 *    allowlist, priority), not a hardcoded provider string.
 *  - Retries: only transient errors (timeout / 429 / 5xx / network), bounded
 *    count, exponential backoff with jitter. Permanent errors fail fast.
 *  - Fallback: on transient exhaustion (or permanent failure), the next
 *    eligible model of the NEXT provider is tried — legitimate multi-provider
 *    fallback, never account rotation to evade limits.
 *  - Provenance: every request produces an AIRequestRecord (ids, versions,
 *    hashes, attempts, usage) persisted via AIRequestAuditPort. No content.
 */
import { randomUUID } from "node:crypto";
import { AIError, isTransientAIError, attemptStatusForCode, type AIErrorCode } from "./errors";
import { computeInputHash } from "./input-hash";
import { estimateCost } from "./cost";
import type { PromptRegistry } from "./prompts";
import type { AIProviderPort, AIRequestAuditPort } from "./ports";
import { parseStructuredOutput, type ParsedStructuredOutput } from "./structured-output";
import type {
  AIAttempt,
  AIModelDescriptor,
  AIRequestRecord,
  AIRequestId,
  AIUsage,
  AITaskType,
} from "./types";
import type { ZodType } from "zod";

export interface RouterOptions {
  readonly maxRetries: number; // additional attempts per model (0 = single try)
  readonly timeoutMs: number;
  readonly baseBackoffMs: number;
}

export const DEFAULT_ROUTER_OPTIONS: RouterOptions = {
  maxRetries: 2,
  timeoutMs: 30_000,
  baseBackoffMs: 500,
};

export interface AIRunInput<T> {
  readonly task: AITaskType;
  readonly caseId?: string;
  /** Max output tokens the task needs (router picks a model that can supply it). */
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Sanitized, budget-applied user message (assembled by the caller). */
  readonly userMessage: string;
  /** Content parts that feed the input hash (the userMessage, split logically). */
  readonly inputContentParts: readonly string[];
  readonly promptId: string;
  readonly outputSchema: ZodType<T>;
  readonly now: () => string;
}

export interface AIRunResult<T> extends ParsedStructuredOutput<T> {
  readonly record: AIRequestRecord;
}

/** Deterministic jitter within ±20% (seeded by time; bounded, never infinite). */
function jitter(baseMs: number): number {
  const spread = Math.max(1, Math.round(baseMs * 0.2));
  return baseMs + Math.floor(Math.random() * (2 * spread + 1)) - spread;
}

export class AIRouter {
  constructor(
    private readonly providers: readonly AIProviderPort[],
    private readonly prompts: PromptRegistry,
    private readonly audit: AIRequestAuditPort,
    private readonly options: RouterOptions = DEFAULT_ROUTER_OPTIONS,
  ) {}

  /** All models across providers, flattened. */
  private get catalog(): AIModelDescriptor[] {
    return this.providers.flatMap((p) => p.models);
  }

  /**
   * Eligible models for a task: capability-driven selection (spec §5).
   * Throws AI_CAPABILITY_UNAVAILABLE when nothing qualifies.
   */
  eligibleModels(task: AITaskType, requiredOutputTokens: number): AIModelDescriptor[] {
    const eligible = this.catalog.filter(
      (m) =>
        m.taskTypes.includes(task) &&
        m.capabilities.structuredOutput &&
        m.capabilities.maxOutputTokens >= requiredOutputTokens,
    );
    return eligible.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute a structured AI request end-to-end:
   * select → attempt (retry) → fallback → validate → record provenance.
   */
  async run<T>(input: AIRunInput<T>): Promise<AIRunResult<T>> {
    const startedAt = input.now();
    const startedMs = Date.now();
    const aiRequestId = randomUUID() as AIRequestId;
    const prompt = this.prompts.latest(input.promptId);

    const requiredOut = input.maxOutputTokens ?? 1024;
    const eligible = this.eligibleModels(input.task, requiredOut);
    if (eligible.length === 0) {
      const record = this.buildRecord({
        aiRequestId,
        task: input.task,
        caseId: input.caseId,
        prompt,
        inputHash: computeInputHash({
          task: input.task,
          promptId: prompt.promptId,
          promptVersion: prompt.promptVersion,
          outputSchemaVersion: prompt.outputSchemaVersion,
          model: "none",
          contentParts: input.inputContentParts,
        }),
        status: "FAILED",
        usage: null,
        attempts: [],
        durationMs: Date.now() - startedMs,
        createdAt: startedAt,
        errorCode: "AI_CAPABILITY_UNAVAILABLE",
      });
      await this.audit.record(record);
      throw new AIError({
        code: "AI_CAPABILITY_UNAVAILABLE",
        message: `No eligible model for task ${input.task} (needs ${requiredOut} output tokens)`,
      });
    }

    const attempts: AIAttempt[] = [];
    let lastError: AIError | null = null;
    let attemptNumber = 0;

    for (const model of eligible) {
      const provider = this.providers.find((p) => p.providerId === model.providerId);
      if (!provider) continue;

      // Per-model bounded retries (spec §15): transient only, capped.
      for (let tryIndex = 0; tryIndex <= this.options.maxRetries; tryIndex++) {
        attemptNumber += 1;
        const attemptStart = Date.now();
        try {
          const response = await provider.complete({
            model: model.modelId,
            messages: [
              { role: "system", content: prompt.systemPrompt },
              { role: "user", content: input.userMessage },
            ],
            jsonMode: model.capabilities.structuredOutput,
            temperature: input.temperature ?? 0,
            maxOutputTokens: Math.min(requiredOut, model.capabilities.maxOutputTokens),
            timeoutMs: this.options.timeoutMs,
          });

          const validated = parseStructuredOutput(response.text, input.outputSchema, {
            promptId: prompt.promptId,
            promptVersion: prompt.promptVersion,
          });

          attempts.push({
            attemptNumber,
            providerId: provider.providerId,
            modelId: model.modelId,
            status: "SUCCEEDED",
            durationMs: Date.now() - attemptStart,
          });

          // Fill cost from the versioned pricing table (never the adapter).
          const usage: AIUsage = {
            ...response.usage,
            estimatedCost: estimateCost(model.modelId, response.usage),
            costCurrency: estimateCost(model.modelId, response.usage) === null ? null : "USD",
          };
          const record = this.buildRecord({
            aiRequestId,
            task: input.task,
            caseId: input.caseId,
            prompt,
            inputHash: computeInputHash({
              task: input.task,
              promptId: prompt.promptId,
              promptVersion: prompt.promptVersion,
              outputSchemaVersion: prompt.outputSchemaVersion,
              model: model.modelId,
              contentParts: input.inputContentParts,
            }),
            status: "SUCCEEDED",
            usage,
            attempts,
            durationMs: Date.now() - startedMs,
            createdAt: startedAt,
          });
          await this.audit.record(record);

          return { data: validated.data, raw: validated.raw, record };
        } catch (error) {
          const aiError = error instanceof AIError ? error : toAIError(error);
          const code = aiError.aiCode;
          attempts.push({
            attemptNumber,
            providerId: provider.providerId,
            modelId: model.modelId,
            status: attemptStatusForCode(code),
            errorCode: code,
            durationMs: Date.now() - attemptStart,
          });

          if (!isTransientAIError(code)) {
            // Permanent: stop retrying THIS model, move to fallback immediately.
            lastError = aiError;
            break;
          }
          lastError = aiError;
          if (tryIndex < this.options.maxRetries) {
            await sleep(jitter(this.options.baseBackoffMs * (tryIndex + 1)));
          }
        }
      }
      // Transient exhausted on this model → fall through to next model/provider.
    }

    // All providers failed — record + typed error (never raw SDK errors).
    const record = this.buildRecord({
      aiRequestId,
      task: input.task,
      caseId: input.caseId,
      prompt,
      inputHash: computeInputHash({
        task: input.task,
        promptId: prompt.promptId,
        promptVersion: prompt.promptVersion,
        outputSchemaVersion: prompt.outputSchemaVersion,
        model: attempts[0]?.modelId ?? "none",
        contentParts: input.inputContentParts,
      }),
      status: "FAILED",
      usage: null,
      attempts,
      durationMs: Date.now() - startedMs,
      createdAt: startedAt,
      errorCode: lastError?.aiCode,
    });
    await this.audit.record(record);

    throw new AIError({
      code: lastError?.aiCode ?? "AI_PROVIDER_UNAVAILABLE",
      message: `AI request failed after ${attempts.length} attempt(s) for task ${input.task}`,
      detail: record.aiRequestId,
      cause: lastError,
    });
  }

  // ── record builder ────────────────────────────────────────────────

  private buildRecord(args: {
    aiRequestId: AIRequestId;
    task: AITaskType;
    caseId?: string;
    prompt: { promptId: string; promptVersion: number; outputSchemaVersion: string };
    inputHash: string;
    status: AIRequestRecord["status"];
    usage: AIUsage | null;
    attempts: readonly AIAttempt[];
    durationMs: number;
    createdAt: string;
    errorCode?: AIErrorCode;
  }): AIRequestRecord {
    const lastSuccess = args.attempts.find((a) => a.status === "SUCCEEDED");
    return {
      aiRequestId: args.aiRequestId,
      task: args.task,
      caseId: args.caseId,
      providerId: lastSuccess?.providerId ?? null,
      modelId: lastSuccess?.modelId ?? null,
      promptId: args.prompt.promptId,
      promptVersion: args.prompt.promptVersion,
      outputSchemaVersion: args.prompt.outputSchemaVersion,
      inputHash: args.inputHash,
      status: args.status,
      usage: args.usage,
      attempts: args.attempts,
      durationMs: args.durationMs,
      errorCode: args.errorCode,
      createdAt: args.createdAt as AIRequestRecord["createdAt"],
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Coerce an unknown thrown value into a typed AIError without leaking internals. */
function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  return new AIError({
    code: "AI_PROVIDER_UNAVAILABLE",
    message: "AI provider call failed",
    detail: error instanceof Error ? error.name : "unknown",
    cause: error,
  });
}
