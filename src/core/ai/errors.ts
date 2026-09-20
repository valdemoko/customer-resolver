/**
 * AI typed error taxonomy (Fase 6, spec §19).
 *
 * Raw provider/SDK errors NEVER cross the core boundary: adapters translate
 * transport-level failures into these typed errors. The error messages are
 * safe to log — they never contain API keys, headers, provider internals,
 * private prompts or stack traces (privacy, spec §18).
 */
import type { AIAttemptStatus } from "./types";
import { AppError } from "@lib/errors";

export type AIErrorCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_RESPONSE"
  | "AI_INVALID_STRUCTURED_OUTPUT"
  | "AI_CAPABILITY_UNAVAILABLE"
  | "AI_CONFIGURATION_ERROR"
  | "AI_POLICY_REJECTED";

export interface AIErrorOptions {
  code: AIErrorCode;
  message: string;
  /** Optional stable detail safe for logs (status code, attempt number…). */
  detail?: string;
  cause?: unknown;
}

export class AIError extends AppError {
  readonly aiCode: AIErrorCode;
  readonly detail?: string;

  constructor(options: AIErrorOptions) {
    super({ code: "DOMAIN_RULE_VIOLATION", message: options.message, cause: options.cause });
    this.name = "AIError";
    this.aiCode = options.code;
    this.detail = options.detail;
  }
}

/**
 * Transient errors are eligible for retry (spec §15): timeout, rate limit,
 * provider unavailability (5xx / network). Everything else — invalid schema,
 * invalid API key, capability unavailable, policy rejection, bad request —
 * is permanent and must fail fast (no retry loops against a wall).
 */
export function isTransientAIError(code: AIErrorCode): boolean {
  switch (code) {
    case "AI_TIMEOUT":
    case "AI_RATE_LIMITED":
    case "AI_PROVIDER_UNAVAILABLE":
      return true;
    case "AI_INVALID_RESPONSE":
    case "AI_INVALID_STRUCTURED_OUTPUT":
    case "AI_CAPABILITY_UNAVAILABLE":
    case "AI_CONFIGURATION_ERROR":
    case "AI_POLICY_REJECTED":
      return false;
  }
}

/** Map an AIErrorCode to the AIAttemptStatus used in provenance records. */
export function attemptStatusForCode(code: AIErrorCode): AIAttemptStatus {
  switch (code) {
    case "AI_TIMEOUT":
      return "TIMEOUT";
    case "AI_RATE_LIMITED":
      return "RATE_LIMITED";
    case "AI_PROVIDER_UNAVAILABLE":
      return "PROVIDER_ERROR";
    case "AI_INVALID_RESPONSE":
      return "INVALID_RESPONSE";
    case "AI_INVALID_STRUCTURED_OUTPUT":
      return "INVALID_RESPONSE";
    case "AI_CAPABILITY_UNAVAILABLE":
      return "CAPABILITY_UNAVAILABLE";
    case "AI_CONFIGURATION_ERROR":
      return "CONFIGURATION_ERROR";
    case "AI_POLICY_REJECTED":
      return "POLICY_REJECTED";
  }
}
