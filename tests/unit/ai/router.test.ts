/**
 * AI Router tests (Fase 6, spec §22).
 * Provider behaviors, router selection/fallback, provenance records.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AIError } from "@core/ai/errors";
import { PromptRegistry } from "@core/ai/prompts";
import { AIRouter, DEFAULT_ROUTER_OPTIONS, type RouterOptions } from "@core/ai/router";
import type { AIRequestAuditPort } from "@core/ai/ports";
import type { AIModelDescriptor, AIRequestRecord } from "@core/ai/types";
import { aiModelId, aiProviderId } from "@core/ai/types";
import { FakeAIProvider, aiErrorCode, FAKE_USAGE } from "./fake-provider";
import { BUILT_IN_PROMPTS } from "@core/ai/prompts";

const SCHEMA = z.object({ answer: z.string() });

function catalog(): AIModelDescriptor[] {
  return [
    {
      providerId: aiProviderId("groq"),
      modelId: aiModelId("groq-fast"),
      capabilities: {
        structuredOutput: true,
        maxInputTokens: 8000,
        maxOutputTokens: 4096,
        vision: false,
      },
      taskTypes: ["DOCUMENT_FACT_EXTRACTION", "TEXT_NORMALIZATION"],
      priority: 1,
    },
    {
      providerId: aiProviderId("groq"),
      modelId: aiModelId("groq-small"),
      capabilities: {
        structuredOutput: true,
        maxInputTokens: 8000,
        maxOutputTokens: 128,
        vision: false,
      },
      taskTypes: ["TEXT_NORMALIZATION"],
      priority: 1,
    },
  ];
}

function makeRouter(
  providers: FakeAIProvider[],
  audit: AIRequestAuditPort,
  options?: Partial<RouterOptions>,
): AIRouter {
  const registry = new PromptRegistry();
  for (const p of BUILT_IN_PROMPTS) registry.register(p);
  return new AIRouter(providers, registry, audit, {
    ...DEFAULT_ROUTER_OPTIONS,
    ...options,
  });
}

const NOW = () => "2026-09-20T00:00:00.000Z";

class MemoryAudit implements AIRequestAuditPort {
  readonly records: AIRequestRecord[] = [];
  async record(entry: AIRequestRecord): Promise<void> {
    this.records.push(entry);
  }
}

const BASE_INPUT = {
  task: "TEXT_NORMALIZATION" as const,
  userMessage: "hello",
  inputContentParts: ["hello"],
  promptId: "test-echo",
  outputSchema: SCHEMA,
  now: NOW,
};

describe("AI router — capability selection", () => {
  it("selects models by capability and task, rejecting output-token mismatch", () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "success", text: '{"answer":"ok"}' }],
    });
    const router = makeRouter([provider], new MemoryAudit());

    // TEXT_NORMALIZATION: both models qualify, but needs 1024 output tokens
    // → groq-small (max 128) is ineligible; groq-fast is selected.
    const eligible = router.eligibleModels("TEXT_NORMALIZATION", 1024);
    expect(eligible.map((m) => m.modelId)).toEqual([aiModelId("groq-fast")]);
  });

  it("throws AI_CAPABILITY_UNAVAILABLE when no model supports the task", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "success", text: "{}" }],
    });
    const audit = new MemoryAudit();
    const router = makeRouter([provider], audit);

    const error = await router
      .run({ ...BASE_INPUT, task: "DRAFTING", maxOutputTokens: 2048 })
      .catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_CAPABILITY_UNAVAILABLE");
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]?.status).toBe("FAILED");
  });
});

describe("AI router — provider behaviors (spec §22)", () => {
  it("success: returns validated data + records provenance", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "success", text: '{"answer":"ok"}' }],
    });
    const audit = new MemoryAudit();
    const router = makeRouter([provider], audit, { maxRetries: 0 });

    const result = await router.run(BASE_INPUT);
    expect(result.data).toEqual({ answer: "ok" });
    expect(result.record.status).toBe("SUCCEEDED");
    expect(result.record.providerId).toBe(aiProviderId("groq"));
    expect(result.record.modelId).toBe(aiModelId("groq-fast"));
    expect(result.record.promptVersion).toBe(1);
    expect(result.record.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.record.usage).toEqual({
      ...FAKE_USAGE,
      estimatedCost: null, // no pricing entry for test model
      costCurrency: null,
    });
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]?.aiRequestId).toBe(result.record.aiRequestId);
  });

  it("timeout is retried (transient) and succeeds on next attempt", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "timeout" }, { kind: "success", text: '{"answer":"recovered"}' }],
    });
    const router = makeRouter([provider], new MemoryAudit(), {
      maxRetries: 2,
      baseBackoffMs: 1,
    });

    const result = await router.run(BASE_INPUT);
    expect(result.data).toEqual({ answer: "recovered" });
    expect(result.record.attempts.map((a) => a.status)).toEqual(["TIMEOUT", "SUCCEEDED"]);
    expect(provider.requests).toHaveLength(2);
  });

  it("429 is retried then falls back through remaining models/providers", async () => {
    const groq = new FakeAIProvider({
      models: catalog(),
      script: [
        { kind: "rateLimited" },
        { kind: "rateLimited" },
        { kind: "rateLimited" }, // exhausts retries (maxRetries: 2)
      ],
    });
    const openai = new FakeAIProvider({
      providerId: "openai",
      models: [
        {
          providerId: aiProviderId("openai"),
          modelId: aiModelId("openai-fallback"),
          capabilities: {
            structuredOutput: true,
            maxInputTokens: 8000,
            maxOutputTokens: 4096,
            vision: false,
          },
          taskTypes: ["TEXT_NORMALIZATION"],
          priority: 1,
        },
      ],
      script: [{ kind: "success", text: '{"answer":"from-openai"}' }],
    });
    const router = makeRouter([groq, openai], new MemoryAudit(), {
      maxRetries: 2,
      baseBackoffMs: 1,
    });

    const result = await router.run(BASE_INPUT);
    expect(result.data).toEqual({ answer: "from-openai" });
    expect(result.record.attempts.map((a) => a.modelId)).toEqual([
      aiModelId("groq-fast"),
      aiModelId("groq-fast"),
      aiModelId("groq-fast"),
      aiModelId("openai-fallback"),
    ]);
    // The provider that finally responded is recorded.
    expect(result.record.providerId).toBe(aiProviderId("openai"));
  });

  it("500 (transient) is retried with bounded attempts — never infinite", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "serverError" }], // repeats forever
    });
    const router = makeRouter([provider], new MemoryAudit(), {
      maxRetries: 2,
      baseBackoffMs: 1,
    });

    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(error).toBeInstanceOf(AIError);
    // 1 model eligible × (1 + 2 retries) = 3 attempts, then failure.
    expect(provider.requests).toHaveLength(3);
    expect(aiErrorCode(error)).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("invalid API key (permanent) fails fast with no retry", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "configurationError" }],
    });
    const router = makeRouter([provider], new MemoryAudit(), {
      maxRetries: 2,
      baseBackoffMs: 1,
    });

    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_CONFIGURATION_ERROR");
    expect(provider.requests).toHaveLength(1); // no retries
  });

  it("invalid response (permanent) fails fast", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "invalidResponse" }],
    });
    const router = makeRouter([provider], new MemoryAudit(), { maxRetries: 2, baseBackoffMs: 1 });

    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_INVALID_RESPONSE");
    expect(provider.requests).toHaveLength(1);
  });

  it("no providers configured → typed AI_PROVIDER_UNAVAILABLE", async () => {
    const router = makeRouter([], new MemoryAudit());
    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_CAPABILITY_UNAVAILABLE");
  });

  it("invalid JSON from a successful call → AI_INVALID_STRUCTURED_OUTPUT", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "success", text: "not json at all" }],
    });
    const audit = new MemoryAudit();
    const router = makeRouter([provider], audit, { maxRetries: 0 });

    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_INVALID_STRUCTURED_OUTPUT");
    expect(audit.records[0]?.status).toBe("FAILED");
    // Non-retryable: exactly one call.
    expect(provider.requests).toHaveLength(1);
  });

  it("schema mismatch (missing field) → AI_INVALID_STRUCTURED_OUTPUT", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "success", text: '{"wrong":"shape"}' }],
    });
    const router = makeRouter([provider], new MemoryAudit(), { maxRetries: 0 });

    const error = await router.run(BASE_INPUT).catch((e) => e);
    expect(aiErrorCode(error)).toBe("AI_INVALID_STRUCTURED_OUTPUT");
  });
});

describe("AI router — provenance determinism", () => {
  it("same logical input + same prompt/model → same inputHash", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [
        { kind: "success", text: '{"answer":"a"}' },
        { kind: "success", text: '{"answer":"b"}' },
      ],
    });
    const router = makeRouter([provider], new MemoryAudit(), { maxRetries: 0 });

    const r1 = await router.run(BASE_INPUT);
    const r2 = await router.run(BASE_INPUT);
    expect(r1.record.inputHash).toBe(r2.record.inputHash);
  });

  it("different logical input → different inputHash", async () => {
    const provider = new FakeAIProvider({
      models: catalog(),
      script: [
        { kind: "success", text: '{"answer":"a"}' },
        { kind: "success", text: '{"answer":"b"}' },
      ],
    });
    const router = makeRouter([provider], new MemoryAudit(), { maxRetries: 0 });

    const r1 = await router.run(BASE_INPUT);
    const r2 = await router.run({ ...BASE_INPUT, inputContentParts: ["changed"] });
    expect(r1.record.inputHash).not.toBe(r2.record.inputHash);
  });

  it("records each attempt with provider, model, status and duration", async () => {
    const groq = new FakeAIProvider({
      models: catalog(),
      script: [{ kind: "timeout" }],
    });
    const openai = new FakeAIProvider({
      providerId: "openai",
      models: [
        {
          providerId: aiProviderId("openai"),
          modelId: aiModelId("openai-fallback"),
          capabilities: {
            structuredOutput: true,
            maxInputTokens: 8000,
            maxOutputTokens: 4096,
            vision: false,
          },
          taskTypes: ["TEXT_NORMALIZATION"],
          priority: 1,
        },
      ],
      script: [{ kind: "success", text: '{"answer":"ok"}' }],
    });
    const router = makeRouter([groq, openai], new MemoryAudit(), {
      maxRetries: 0,
      baseBackoffMs: 1,
    });

    const result = await router.run(BASE_INPUT);
    const attempts = result.record.attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      providerId: aiProviderId("groq"),
      modelId: aiModelId("groq-fast"),
      status: "TIMEOUT",
    });
    expect(attempts[1]).toMatchObject({
      providerId: aiProviderId("openai"),
      modelId: aiModelId("openai-fallback"),
      status: "SUCCEEDED",
    });
    expect(typeof attempts[0]?.durationMs).toBe("number");
  });
});
