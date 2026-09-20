/**
 * AI orchestration ports (Fase 6).
 *
 * Core defines WHAT it needs; infrastructure (src/server/adapters/ai)
 * implements HOW. The core never imports a provider SDK (spec §28) —
 * adapters translate to Groq/OpenAI HTTP APIs and translate transport
 * failures into typed AIError codes (core/ai/errors.ts).
 */
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIModelDescriptor,
  AIProviderId,
  AIRequestRecord,
} from "./types";

// ── Provider port ───────────────────────────────────────────────────
//
// The port returns RAW output + usage. Structured-output validation (Zod) is
// a core concern (core/ai/structured-output.ts) applied uniformly to every
// provider — an adapter can never "pre-validate itself into trust".

export interface AIProviderPort {
  readonly providerId: AIProviderId;

  /** Model descriptors this provider offers (catalog, not a hardcoded string). */
  readonly models: readonly AIModelDescriptor[];

  supports(model: string): boolean;

  /**
   * Execute one completion. MUST:
   *  - enforce the request timeout (abort beyond it) → AIError AI_TIMEOUT
   *  - map HTTP/network failures to typed AIError codes, never raw SDK errors
   *  - never include the API key, headers or response body internals in errors
   */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

// ── Provenance persistence port ─────────────────────────────────────
//
// Every AI request leaves an append-only audit trail (spec §11/§26).
// Implemented by the Drizzle repository (ai_requests table); an in-memory
// implementation is used in tests. Persisting is best-effort from the
// caller's perspective: an audit failure must never corrupt the case flow.

export interface AIRequestAuditPort {
  record(entry: AIRequestRecord): Promise<void>;
}
