/**
 * Groq provider adapter (Fase 6).
 *
 * OpenAI-compatible chat completions over plain fetch (no SDK).
 * Catalog: capability descriptors the router filters on — NOT hardcoded
 * model strings at call sites. If GROQ_API_KEY is unset, this provider is
 * simply not constructed (see createAIProvidersFromEnv) and the router
 * reports AI_PROVIDER_UNAVAILABLE — development/test keeps working.
 */
import type { AIModelDescriptor } from "@core/ai/types";
import { aiModelId, aiProviderId } from "@core/ai/types";
import { HttpAIProvider } from "./http-ai-provider";

export const GROQ_MODELS: readonly AIModelDescriptor[] = [
  {
    providerId: aiProviderId("groq"),
    modelId: aiModelId("openai/gpt-oss-20b"),
    capabilities: {
      structuredOutput: true,
      maxInputTokens: 131_000,
      maxOutputTokens: 65_536,
      vision: false,
    },
    taskTypes: [
      "DOCUMENT_FACT_EXTRACTION",
      "DOCUMENT_CLASSIFICATION",
      "TEXT_NORMALIZATION",
      "AMBIGUITY_INTERPRETATION",
      "EXPLANATION",
      "DRAFTING",
      "PROBLEM_INTERPRETATION",
    ],
    priority: 1, // cheapest/fastest — first choice for extraction tasks
  },
  {
    providerId: aiProviderId("groq"),
    modelId: aiModelId("openai/gpt-oss-120b"),
    capabilities: {
      structuredOutput: true,
      maxInputTokens: 131_000,
      maxOutputTokens: 65_536,
      vision: false,
    },
    taskTypes: [
      "DOCUMENT_FACT_EXTRACTION",
      "DOCUMENT_CLASSIFICATION",
      "AMBIGUITY_INTERPRETATION",
      "EXPLANATION",
      "DRAFTING",
      "PROBLEM_INTERPRETATION",
    ],
    priority: 2,
  },
];

export function createGroqProvider(config: { apiKey: string; baseUrl?: string }) {
  return new HttpAIProvider({
    providerId: aiProviderId("groq"),
    baseUrl: config.baseUrl ?? "https://api.groq.com/openai/v1",
    apiKey: config.apiKey,
    models: GROQ_MODELS,
  });
}
