/**
 * Intake error taxonomy (Fase 8.3, spec §21, §31).
 *
 * Errors are typed and safe to show to users.
 * No provider stack traces, no API keys, no database details.
 */
import { AppError } from "@lib/errors";

export type IntakeErrorCode =
  | "AI_UNAVAILABLE"
  | "SCHEMA_INVALID"
  | "BUDGET_EXCEEDED"
  | "UNSUPPORTED_PROBLEM"
  | "UNSUPPORTED_JURISDICTION"
  | "INTERNAL_ERROR"
  | "CASE_NOT_FOUND"
  | "INVALID_INPUT";

export class IntakeError extends AppError {
  readonly intakeCode: IntakeErrorCode;

  constructor(options: {
    code: IntakeErrorCode;
    message: string;
    userMessage?: string;
    cause?: unknown;
  }) {
    super({
      code: "DOMAIN_RULE_VIOLATION",
      message: options.message,
      userMessage: options.userMessage,
      cause: options.cause,
    });
    this.name = "IntakeError";
    this.intakeCode = options.code;
  }
}

export class BudgetExceededError extends IntakeError {
  constructor(maxCalls: number) {
    super({
      code: "BUDGET_EXCEEDED",
      message: `AI interpretation budget exceeded (${maxCalls} calls max)`,
      userMessage:
        "Hemos agotado las consultas automaticas. Por favor, responde a estas preguntas directamente.",
    });
    this.name = "BudgetExceededError";
  }
}

export class UnsupportedProblemError extends IntakeError {
  constructor() {
    super({
      code: "UNSUPPORTED_PROBLEM",
      message: "Problem not supported by any registered module",
      userMessage: "Tu problema no coincide con los modulos disponibles actualmente.",
    });
    this.name = "UnsupportedProblemError";
  }
}

export class UnsupportedJurisdictionError extends IntakeError {
  constructor(jurisdiction: string) {
    super({
      code: "UNSUPPORTED_JURISDICTION",
      message: `Jurisdiction not supported: ${jurisdiction}`,
      userMessage: "Necesitamos saber en que pais se realizo la compra para poder ayudarte.",
    });
    this.name = "UnsupportedJurisdictionError";
  }
}

/** Map intake errors to safe API responses. */
export function toIntakeErrorResponse(error: unknown): {
  code: IntakeErrorCode;
  userMessage: string;
} {
  if (error instanceof IntakeError) {
    return {
      code: error.intakeCode,
      userMessage: error.userMessage ?? "An unexpected error occurred.",
    };
  }
  return {
    code: "INTERNAL_ERROR",
    userMessage: "An unexpected error occurred.",
  };
}
