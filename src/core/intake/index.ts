/**
 * Universal Problem Intake public surface (Fase 8.3).
 */
export * from "./types";
export * from "./schemas";
export * from "./catalogue";
export * from "./routing";
export * from "./question-selector";
export * from "./service";
export * from "./prompt";
export {
  IntakeError,
  BudgetExceededError,
  UnsupportedProblemError,
  UnsupportedJurisdictionError,
  toIntakeErrorResponse,
  type IntakeErrorCode,
} from "./errors";
