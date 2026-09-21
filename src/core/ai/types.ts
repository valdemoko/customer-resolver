/**
 * AI Orchestration domain types (Fase 6).
 *
 * Pure, provider-agnostic types — no SDK, no I/O, no framework.
 * The core NEVER imports groq-sdk / openai / any provider SDK (enforced by
 * eslint boundaries + tests/unit/boundaries). Adapters live in src/server/adapters/ai.
 *
 * Fundamental principle (docs/PHASE_6_REPORT.md):
 *
 *   AI → interpretation/extraction → FactCandidate (UNCONFIRMED)
 *      → Evidence + provenance → Rule Engine → validated result
 *
 * The AI produces DATA (candidates, interpretations, drafts) — never legal
 * decisions, never confirmed facts, never rules, never sources.
 */
import type { IsoDateTime } from "../shared/temporal";

// ── Identifiers ─────────────────────────────────────────────────────

export type AIProviderId = string & { readonly __brand: "AIProviderId" }; // "groq", "openai"
export type AIModelId = string & { readonly __brand: "AIModelId" }; // "llama-3.1-8b-instant"
export type AIRequestId = string & { readonly __brand: "AIRequestId" };

/** Brand constructors (adapters/catalogs use these; plain strings never pass). */
export function aiProviderId(id: string): AIProviderId {
  return id as AIProviderId;
}

export function aiModelId(id: string): AIModelId {
  return id as AIModelId;
}

// ── Task taxonomy ───────────────────────────────────────────────────
//
// Tasks the AI may perform. Deliberately EXCLUDED (architecture barrier,
// docs/PHASE_6_REPORT.md §15): LEGAL_DECISION, LEGAL_VERDICT — the AI is an
// interpreter, never the source of legal truth. Rules decide; AI explains.

export type AITaskType =
  | "DOCUMENT_FACT_EXTRACTION"
  | "DOCUMENT_CLASSIFICATION"
  | "TEXT_NORMALIZATION"
  | "AMBIGUITY_INTERPRETATION"
  | "EXPLANATION"
  | "DRAFTING"
  | "PROBLEM_INTERPRETATION"
  | "RESEARCH_PLAN_GENERATION"
  | "SOURCE_CLASSIFICATION"
  | "LEGAL_TEXT_EXTRACTION"
  | "SOURCE_COMPARISON";

// ── Model capabilities ──────────────────────────────────────────────

export interface AIModelCapabilities {
  /** Can the model reliably honor a JSON output contract? */
  readonly structuredOutput: boolean;
  /** Maximum input tokens accepted. */
  readonly maxInputTokens: number;
  /** Maximum output tokens the model can generate. */
  readonly maxOutputTokens: number;
  /** Can accept image inputs (NOT used in F6 — vision deferred). */
  readonly vision: boolean;
}

export interface AIModelDescriptor {
  readonly providerId: AIProviderId;
  readonly modelId: AIModelId;
  readonly capabilities: AIModelCapabilities;
  /** Tasks this model is approved for (a router eligibility filter). */
  readonly taskTypes: readonly AITaskType[];
  /** Lower = tried first within the same provider (cost/latency preference). */
  readonly priority: number;
}

// ── Provider-facing request/response (raw text, pre-validation) ─────
//
// The provider port returns RAW TEXT + usage. Structured-output validation
// (Zod) happens in the core router, never inside an adapter — so every
// provider is validated by exactly the same code path.

export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string;
}

export interface AICompletionRequest {
  readonly model: AIModelId;
  readonly messages: readonly AIMessage[];
  /** Ask the provider for JSON mode (only when the model declares structuredOutput). */
  readonly jsonMode: boolean;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  /** Wall-clock budget for THIS call. The adapter must abort beyond it. */
  readonly timeoutMs: number;
}

export interface AICompletionResponse {
  readonly providerId: AIProviderId;
  readonly model: AIModelId;
  /** Raw model text. EMPTY string is a valid transport result — validation decides. */
  readonly text: string;
  readonly usage: AIUsage;
  readonly finishReason?: string;
}

// ── Usage / cost ────────────────────────────────────────────────────

export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /**
   * Estimated cost in `costCurrency`, computed from the versioned pricing
   * table (core/ai/cost.ts) — NEVER from magic numbers at call sites.
   * Null when no pricing entry exists (we do not invent prices).
   */
  readonly estimatedCost: number | null;
  readonly costCurrency: string | null;
}

// ── Attempts & provenance record ────────────────────────────────────

export type AIAttemptStatus =
  | "SUCCEEDED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "CAPABILITY_UNAVAILABLE"
  | "CONFIGURATION_ERROR"
  | "POLICY_REJECTED";

export interface AIAttempt {
  readonly attemptNumber: number;
  readonly providerId: AIProviderId;
  readonly modelId: AIModelId;
  readonly status: AIAttemptStatus;
  /** Stable error code when failed (AIErrorCode), never provider internals. */
  readonly errorCode?: string;
  readonly durationMs: number;
}

export type AIRequestStatus = "SUCCEEDED" | "FAILED";

/**
 * Provenance record for every AI request (spec §11).
 * Contains NO document content and NO PII — identifiers and metrics only.
 */
export interface AIRequestRecord {
  readonly aiRequestId: AIRequestId;
  readonly task: AITaskType;
  readonly caseId?: string;
  /** Provider that PRODUCED the final accepted response (null when all failed). */
  readonly providerId: AIProviderId | null;
  readonly modelId: AIModelId | null;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly outputSchemaVersion: string;
  /** Deterministic hash of the logical input (core/ai/input-hash.ts). */
  readonly inputHash: string;
  readonly status: AIRequestStatus;
  readonly usage: AIUsage | null;
  /** Full trace of every provider/model attempt, in order. */
  readonly attempts: readonly AIAttempt[];
  readonly durationMs: number;
  readonly errorCode?: string;
  readonly createdAt: IsoDateTime;
}

// ── Model catalog entry (used by the router) ────────────────────────

export interface AIProviderInfo {
  readonly providerId: AIProviderId;
  readonly models: readonly AIModelDescriptor[];
}
