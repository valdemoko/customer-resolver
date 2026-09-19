/**
 * Structured logging base (Phase 0).
 *
 * Direction for Fase 1+: these loggers are the ONLY allowed console output in
 * server code. They never log secrets (keys are redacted) and callers must not
 * pass PII. Distinguishes application logs from security events; audit events
 * live in dedicated DB tables (see ARCHITECTURE.md §5 event taxonomy), and
 * metrics go to a metrics system later.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  /** Non-sensitive, typed context. Never include document contents, emails, names or amounts. */
  readonly [key: string]: string | number | boolean | null | undefined;
}

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const SECRET_KEY_PATTERN = /(key|secret|token|password|authorization|cookie)/i;

function redact(fields: LogFields): LogFields {
  const output: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : value;
  }
  return output;
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
  if (levelOrder[level] < levelOrder[minLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(fields ? redact(fields) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else process.stdout.write(`${line}\n`);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, fields?: LogFields) => emit("debug", scope, msg, fields),
    info: (msg: string, fields?: LogFields) => emit("info", scope, msg, fields),
    warn: (msg: string, fields?: LogFields) => emit("warn", scope, msg, fields),
    error: (msg: string, fields?: LogFields) => emit("error", scope, msg, fields),
  };
}

/** Security-relevant events (auth failures, rate limits, abuse signals). */
export const securityLog = createLogger("security");
