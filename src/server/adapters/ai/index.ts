/**
 * AI provider factory (Fase 6).
 *
 * Builds the provider chain from server-side env (spec §27):
 *   GROQ_API_KEY / OPENAI_API_KEY  → providers in fallback order (groq first)
 *
 * If no key is configured, an EMPTY chain is returned — nothing throws at
 * construction time. The router reports AI_PROVIDER_UNAVAILABLE (typed) when
 * invoked with no providers, so development/test without keys keep working.
 */
import type { AIProviderPort } from "@core/ai/ports";
import { createGroqProvider } from "./groq-provider";
import { createOpenAIProvider } from "./openai-provider";

export interface AIProviderEnv {
  readonly GROQ_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
}

/** Fallback order (legitimate multi-provider, one credential each): groq → openai. */
export function createAIProvidersFromEnv(env: AIProviderEnv): AIProviderPort[] {
  const providers: AIProviderPort[] = [];
  if (env.GROQ_API_KEY && env.GROQ_API_KEY.length > 0) {
    providers.push(createGroqProvider({ apiKey: env.GROQ_API_KEY }));
  }
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0) {
    providers.push(createOpenAIProvider({ apiKey: env.OPENAI_API_KEY }));
  }
  return providers;
}
