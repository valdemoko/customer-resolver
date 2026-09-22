/**
 * HTTP chat-completions provider base (Fase 6).
 *
 * Both Groq and OpenAI expose an OpenAI-compatible /chat/completions API.
 * Rather than importing SDKs (which would drag provider internals into the
 * server layer), adapters speak plain `fetch` and translate transport
 * failures into typed AIError codes. Security rules:
 *  - the API key never appears in errors, logs or messages
 *  - response bodies are never included in error text
 *  - timeouts are enforced with AbortController
 */
import { AIError } from "@core/ai/errors";
import type { AIProviderPort } from "@core/ai/ports";
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIModelDescriptor,
  AIProviderId,
  AIUsage,
} from "@core/ai/types";

export interface HttpAIProviderConfig {
  readonly providerId: AIProviderId;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly models: readonly AIModelDescriptor[];
}

interface ChatCompletionWireResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function extractRetryAfter(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export class HttpAIProvider implements AIProviderPort {
  readonly providerId: AIProviderId;
  readonly models: readonly AIModelDescriptor[];

  constructor(private readonly config: HttpAIProviderConfig) {
    this.providerId = config.providerId;
    this.models = config.models;
  }

  supports(model: string): boolean {
    return this.models.some((m) => m.modelId === model);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.supports(request.model)) {
      throw new AIError({
        code: "AI_CAPABILITY_UNAVAILABLE",
        message: `Model ${request.model} is not offered by provider ${this.providerId}`,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: request.temperature ?? 0,
          max_tokens: request.maxOutputTokens,
          ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!response.ok) {
        // Log the actual error response for debugging
        const errorBody = await response.text().catch(() => "unable to read body");
        console.error(
          `[ai:${this.config.providerId}] HTTP ${response.status}:`,
          errorBody.slice(0, 500),
        );
        throw this.mapHttpError(response.status, response.headers);
      }

      const wire = (await response.json()) as ChatCompletionWireResponse;
      const text = wire.choices?.[0]?.message?.content ?? "";
      const usage: AIUsage = {
        inputTokens: wire.usage?.prompt_tokens ?? 0,
        outputTokens: wire.usage?.completion_tokens ?? 0,
        totalTokens: wire.usage?.total_tokens ?? 0,
        // Cost is computed by the core from its versioned pricing table —
        // never by the adapter (no magic prices in infrastructure).
        estimatedCost: null,
        costCurrency: null,
      };

      return {
        providerId: this.providerId,
        model: request.model,
        text,
        usage,
        finishReason: wire.choices?.[0]?.finish_reason,
      };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (controller.signal.aborted) {
        throw new AIError({
          code: "AI_TIMEOUT",
          message: `AI provider ${this.providerId} timed out`,
          detail: `${request.timeoutMs}ms`,
        });
      }
      // Network failure — never leak internals.
      throw new AIError({
        code: "AI_PROVIDER_UNAVAILABLE",
        message: `AI provider ${this.providerId} is unreachable`,
        detail: error instanceof Error ? error.name : "network-error",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private mapHttpError(status: number, headers: Headers): AIError {
    switch (true) {
      case status === 429:
        return new AIError({
          code: "AI_RATE_LIMITED",
          message: `AI provider ${this.providerId} rate limited the request`,
          detail: extractRetryAfter(headers) ? "retry-after-present" : undefined,
        });
      case status === 401 || status === 403:
        return new AIError({
          code: "AI_CONFIGURATION_ERROR",
          message: `AI provider ${this.providerId} rejected the credentials`,
        });
      case status === 400 || status === 422:
        return new AIError({
          code: "AI_INVALID_RESPONSE",
          message: `AI provider ${this.providerId} rejected the request as malformed`,
          detail: `http-${status}`,
        });
      case status >= 500:
        return new AIError({
          code: "AI_PROVIDER_UNAVAILABLE",
          message: `AI provider ${this.providerId} returned a server error`,
          detail: `http-${status}`,
        });
      default:
        return new AIError({
          code: "AI_PROVIDER_UNAVAILABLE",
          message: `AI provider ${this.providerId} returned an unexpected status`,
          detail: `http-${status}`,
        });
    }
  }
}
