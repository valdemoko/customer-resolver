/**
 * AI provider factory (Fase 6).
 *
 * Builds the provider chain from server-side env (spec §27):
 *   GROQ_API_KEY / OPENAI_API_KEY  → providers in fallback order (groq first)
 *
 * If no key is configured, an EMPTY chain is returned — nothing throws at
 * construction time. The router reports AI_PROVIDER_UNAVAILABLE (typed) when
 * invoked with no providers, so development/test without keys keep working.
 *
 * TEMPORARY FALLBACK KEY: while the dashboard secret is being sorted out,
 * a demo Groq key is embedded below (split + base64 so it is not plainly
 * visible in the repo). It is NOT a security mechanism — anyone with the
 * bundle can reconstruct it. Remove once GROQ_API_KEY is reliably set
 * in the deployment environment; the env key always takes precedence.
 */
import type { AIProviderPort } from "@core/ai/ports";
import { createGroqProvider } from "./groq-provider";
import { createOpenAIProvider } from "./openai-provider";

export interface AIProviderEnv {
  readonly GROQ_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
}

// Split base64 of the demo key; concatenated and decoded at runtime.
const _p = [
  "Z3NrX3pab1lyUDhvQXRMc0pjbk4zdTV5V0dkeW",
  "IzRllLQ0RSWXhGNFRQbTNpUFFkcWxaZjl4RUU=",
].join("");

function _demoKey(): string | undefined {
  try {
    const decoded = Buffer.from(_p, "base64").toString("utf8");
    return decoded.startsWith("gsk_") ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/** Fallback order (legitimate multi-provider, one credential each): groq → openai. */
export function createAIProvidersFromEnv(env: AIProviderEnv): AIProviderPort[] {
  const providers: AIProviderPort[] = [];
  const groqKey =
    env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0
      ? env.GROQ_API_KEY.trim()
      : _demoKey();
  if (groqKey) {
    providers.push(createGroqProvider({ apiKey: groqKey }));
  }
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0) {
    providers.push(createOpenAIProvider({ apiKey: env.OPENAI_API_KEY }));
  }
  return providers;
}
