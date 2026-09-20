/**
 * OpenAI provider adapter (Fase 6) — fallback provider after Groq.
 * Plain fetch, no SDK. See groq-provider.ts for the security posture.
 */
import type { AIModelDescriptor } from "@core/ai/types";
import { aiModelId, aiProviderId } from "@core/ai/types";
import { HttpAIProvider } from "./http-ai-provider";

export const OPENAI_MODELS: readonly AIModelDescriptor[] = [
  {
    providerId: aiProviderId("openai"),
    modelId: aiModelId("gpt-4o-mini"),
    capabilities: {
      structuredOutput: true,
      maxInputTokens: 128_000,
      maxOutputTokens: 16_384,
      vision: false,
    },
    taskTypes: [
      "DOCUMENT_FACT_EXTRACTION",
      "DOCUMENT_CLASSIFICATION",
      "TEXT_NORMALIZATION",
      "AMBIGUITY_INTERPRETATION",
      "EXPLANATION",
      "DRAFTING",
    ],
    priority: 1,
  },
];

export function createOpenAIProvider(config: { apiKey: string; baseUrl?: string }) {
  return new HttpAIProvider({
    providerId: aiProviderId("openai"),
    baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
    apiKey: config.apiKey,
    models: OPENAI_MODELS,
  });
}
