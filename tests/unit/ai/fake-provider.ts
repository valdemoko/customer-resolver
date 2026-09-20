/**
 * Deterministic fake AI provider (Fase 6 test infrastructure).
 *
 * Scripted behaviors replace real APIs — the unit suite never touches the
 * network (spec §22). Each scenario resolves in a fixed order; usage numbers
 * are fixed so cost/provenance assertions are deterministic.
 */
import { AIError, type AIErrorCode } from "@core/ai/errors";
import type { AIProviderPort } from "@core/ai/ports";
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIModelDescriptor,
  AIProviderId,
} from "@core/ai/types";
import { aiProviderId } from "@core/ai/types";

export type FakeBehavior =
  | { kind: "success"; text: string }
  | { kind: "timeout" }
  | { kind: "rateLimited" }
  | { kind: "serverError" }
  | { kind: "invalidResponse"; detail?: string }
  | { kind: "configurationError" }
  | { kind: "unavailable" };

export interface FakeProviderOptions {
  /** Behaviors consumed in order per complete() call; last one repeats. */
  readonly script: FakeBehavior[];
  readonly models?: readonly AIModelDescriptor[];
  /** Provider id (models of other providers must not resolve to this one). */
  readonly providerId?: string;
  /** Simulated latency per call in ms (default 0 — deterministic, fast). */
  readonly latencyMs?: number;
}

export const FAKE_USAGE = {
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  estimatedCost: null as number | null,
  costCurrency: null as string | null,
};

export class FakeAIProvider implements AIProviderPort {
  readonly providerId: AIProviderId;
  readonly models: readonly AIModelDescriptor[];
  /** Every request seen by this provider (assertions on prompts/limits). */
  readonly requests: AICompletionRequest[] = [];
  private index = 0;

  constructor(private readonly options: FakeProviderOptions) {
    this.providerId = aiProviderId(options.providerId ?? "groq");
    this.models = options.models ?? [];
  }

  supports(model: string): boolean {
    return this.models.some((m) => m.modelId === model);
  }

  private next(): FakeBehavior {
    if (this.index >= this.options.script.length) {
      const last = this.options.script[this.options.script.length - 1];
      return last ?? { kind: "unavailable" };
    }
    return this.options.script[this.index++] as FakeBehavior;
  }

  private throwFor(behavior: FakeBehavior): never {
    switch (behavior.kind) {
      case "timeout":
        throw new AIError({ code: "AI_TIMEOUT", message: "fake timeout" });
      case "rateLimited":
        throw new AIError({ code: "AI_RATE_LIMITED", message: "fake 429" });
      case "serverError":
        throw new AIError({ code: "AI_PROVIDER_UNAVAILABLE", message: "fake 500" });
      case "invalidResponse":
        throw new AIError({ code: "AI_INVALID_RESPONSE", message: "fake 400" });
      case "configurationError":
        throw new AIError({ code: "AI_CONFIGURATION_ERROR", message: "fake 401" });
      case "unavailable":
        throw new AIError({ code: "AI_PROVIDER_UNAVAILABLE", message: "fake network" });
      default:
        throw new AIError({ code: "AI_PROVIDER_UNAVAILABLE", message: "unreachable" });
    }
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    this.requests.push(request);
    const behavior = this.next();
    if (behavior.kind !== "success") {
      if (this.options.latencyMs) {
        await new Promise((r) => setTimeout(r, this.options.latencyMs));
      }
      this.throwFor(behavior);
    }
    const text = (behavior as { kind: "success"; text: string }).text;
    return {
      providerId: this.providerId,
      model: request.model,
      text,
      usage: FAKE_USAGE,
      finishReason: "stop",
    };
  }
}

/** Error code of a thrown AIError (for compact assertions). */
export function aiErrorCode(error: unknown): AIErrorCode {
  if (error instanceof AIError) return error.aiCode;
  throw new Error(`expected AIError, got: ${String(error)}`);
}
