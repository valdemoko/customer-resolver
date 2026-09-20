/**
 * Deterministic input hashing (Fase 6, spec §12).
 *
 * same logical input + same prompt version + same model → same inputHash
 *
 * The hash covers only information RELEVANT to the request (task, prompt,
 * schema, model, logical content parts) — never timestamps, request ids,
 * retry counters or other volatile data. The hash is of the SANITIZED,
 * budget-applied content actually sent, so truncation changes the hash
 * (which is correct: it is a different logical input).
 */
import { createHash } from "node:crypto";

export interface InputHashParts {
  readonly task: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly outputSchemaVersion: string;
  readonly model: string;
  /** Ordered logical content parts (system prompt excluded — versioned by promptVersion). */
  readonly contentParts: readonly string[];
}

/** Canonical JSON: stable key order, no whitespace. */
function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export function computeInputHash(parts: InputHashParts): string {
  const canonical = canonicalize({
    task: parts.task,
    promptId: parts.promptId,
    promptVersion: parts.promptVersion,
    outputSchemaVersion: parts.outputSchemaVersion,
    model: parts.model,
    contentParts: [...parts.contentParts],
  });
  return createHash("sha256").update(canonical).digest("hex");
}
