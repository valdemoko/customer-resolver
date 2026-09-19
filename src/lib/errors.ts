/**
 * Typed error taxonomy (Phase 0 base).
 *
 * Direction for Fase 1 (docs/ARCHITECTURE.md §34):
 *  - DomainError: business rule violations, safe to show to users (mapped via i18n later).
 *  - ValidationError: input failed Zod/schema validation.
 *  - HTTP-level errors are handled in app/ route handlers; unexpected errors never
 *    leak internals to clients. Each error carries a stable `code` for logging/metrics
 *    and an optional user-safe message.
 */

export type ErrorCode =
  | "DOMAIN_RULE_VIOLATION"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface AppErrorOptions {
  code: ErrorCode;
  /** Stable machine-readable code, safe to log. */
  message: string;
  /** User-safe message (already localized or localizable). May be shown in UI. */
  userMessage?: string;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage?: string;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.userMessage = options.userMessage;
  }
}

export class DomainError extends AppError {
  constructor(message: string, userMessage?: string, cause?: unknown) {
    super({ code: "DOMAIN_RULE_VIOLATION", message, userMessage, cause });
    this.name = "DomainError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, userMessage?: string, cause?: unknown) {
    super({ code: "VALIDATION_FAILED", message, userMessage, cause });
    this.name = "ValidationError";
  }
}

/** Convert an unknown thrown value into a user-safe response payload (no internals). */
export function toUserSafeError(error: unknown): { code: ErrorCode; userMessage: string } {
  if (error instanceof AppError) {
    return {
      code: error.code,
      userMessage: error.userMessage ?? "An unexpected error occurred.",
    };
  }
  return { code: "INTERNAL", userMessage: "An unexpected error occurred." };
}
