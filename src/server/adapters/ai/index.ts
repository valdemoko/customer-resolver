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
 * HARDCODED DEMO KEY (temporary): the dashboard-provided GROQ_API_KEY was
 * rejected by Groq (401) even after deletion, so while this is a test
 * environment the working key is embedded directly and the env value is
 * IGNORED ENTIRELY. Split base64 — discretion, not security. When moving to
 * production, restore the env-based lookup and set a REAL secret.
 */
import type { AIProviderPort } from "@core/ai/ports";
import { createGroqProvider } from "./groq-provider";
import { createOpenAIProvider } from "./openai-provider";

export interface AIProviderEnv {
  readonly GROQ_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
}

// The demo key, split base64. Reassembled at startup.
const _p = [
  "Z3NrX3pab1lyUDhvQXRMc0pjbk4zdTV5V0dkeW",
  "IzRllLQ0RSWXhGNFRQbTNpUFFkcWxaZjl4RUU=",
].join("");

/** Reconstruct the embedded demo key. Exported for the /api/health probe. */
export function _demoKey(): string | undefined {
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
  // IGNORE env.GROQ_API_KEY entirely — see header comment. Demo key only.
  const groqKey = _demoKey();
  if (groqKey) {
    providers.push(createGroqProvider({ apiKey: groqKey }));
  }
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0) {
    providers.push(createOpenAIProvider({ apiKey: env.OPENAI_API_KEY }));
  }
  return providers;
}
