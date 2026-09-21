/**
 * Shared input validation utilities (Fase 10 — security hardening).
 *
 * Provides server-side validation for common inputs that cross the
 * trust boundary: caseId, problemKey, factKey, etc.
 *
 * Convention: validate at the API boundary, never trust client data.
 */

/**
 * Validate a caseId format. Accepts UUID v4 and simple alphanumeric IDs.
 * Rejects dangerous patterns: path traversal, SQL injection, null bytes.
 *
 * @returns true if valid, false otherwise
 */
export function isValidCaseId(caseId: string): boolean {
  if (caseId.length === 0 || caseId.length > 128) return false;
  // Block dangerous characters: path traversal, SQL, null bytes, control chars
  if (/[/\\.\x00-\x1f]/.test(caseId)) return false;
  // Must be alphanumeric + hyphens only
  return /^[a-zA-Z0-9-]+$/.test(caseId);
}

/**
 * Validate a problemKey. Problem keys are lowercase alphanumeric with hyphens.
 * Matches the pattern used in problem module definitions.
 */
export function isValidProblemKey(problemKey: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(problemKey);
}

/**
 * Validate a factKey. Fact keys are namespaced like "domain.field".
 */
export function isValidFactKey(factKey: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}\.[a-z][a-z0-9_-]{0,63}$/.test(factKey);
}

/**
 * Sanitize an error message for client consumption.
 * Strips filesystem paths, API keys, connection strings, and stack traces.
 * Returns a generic safe message for unexpected errors.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "An unexpected error occurred.";

  const msg = error.message;

  // If the message contains patterns that indicate internal details, return generic
  if (
    /password|secret|key|token|credential|connection string|DATABASE_URL|API_KEY/i.test(msg) ||
    /\/[a-z]:\\/i.test(msg) || // Windows paths
    /\/home\/|\/usr\/|\/var\/|\/tmp\/|\/etc\//i.test(msg) || // Unix paths
    /node_modules/i.test(msg) ||
    /at\s+\w+\s*\(/i.test(msg) // Stack trace fragments
  ) {
    return "An unexpected error occurred.";
  }

  // Domain errors are safe to show (they're business logic messages)
  if (error.name === "DomainError" || error.name === "CaseNotFoundError") {
    return msg;
  }

  // For other errors, truncate to prevent information overflow
  return msg.length > 200 ? "An unexpected error occurred." : msg;
}
