/**
 * Structured output validation (Fase 6, spec §6).
 *
 * NEVER trust JSON.parse(modelOutput) directly. Pipeline:
 *
 *   model → raw response → JSON parse → Zod validation → validated object
 *
 * Any failure becomes AI_INVALID_STRUCTURED_OUTPUT. A partially invalid
 * response NEVER becomes facts/candidates. Common LLM formatting noise
 * (```json fences) is stripped deterministically before parsing — that is
 * transport cleanup, not validation relaxation.
 */
import type { ZodType } from "zod";
import { AIError } from "./errors";

/** Strip markdown code fences an LLM may wrap its JSON in. Deterministic. */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;
  const match = fence.exec(trimmed);
  return match ? (match[1] as string).trim() : trimmed;
}

export interface ParsedStructuredOutput<T> {
  readonly data: T;
  readonly raw: string;
}

/**
 * Parse + validate a raw model response against a Zod schema.
 * Throws AI_INVALID_STRUCTURED_OUTPUT (never a SyntaxError/ZodError to callers).
 */
/**
 * Remove object properties whose value is explicitly `null`, recursively.
 *
 * Models write `"field": null` for "not applicable" while a schema expresses
 * that as an omitted optional field; Zod rejects `null` on an optional field, so
 * a semantically valid answer was thrown away as invalid output (503).
 *
 * Soundness: this runs only AFTER the strict parse failed, and it only removes
 * `null`s. A `null` in a REQUIRED position stays missing and is still rejected,
 * so this can never accept an incomplete answer — it can only accept an answer
 * that the schema already considers "absent is fine".
 */
function dropNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNullProperties);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null) continue;
    out[key] = dropNullProperties(entry);
  }
  return out;
}

export function parseStructuredOutput<T>(
  raw: string,
  schema: ZodType<T>,
  context: { promptId: string; promptVersion: number },
): ParsedStructuredOutput<T> {
  const cleaned = stripCodeFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new AIError({
      code: "AI_INVALID_STRUCTURED_OUTPUT",
      message: `Model output is not valid JSON for ${context.promptId}@${context.promptVersion}`,
      detail: "invalid-json",
    });
  }

  const strict = schema.safeParse(json);
  if (!strict.success) {
    const withoutNulls = schema.safeParse(dropNullProperties(json));
    if (withoutNulls.success) {
      return { data: withoutNulls.data, raw: cleaned };
    }
  }

  const result = strict;
  if (!result.success) {
    // Only the issue count + paths go into the error — never the content.
    const paths = result.error.issues
      .slice(0, 5)
      .map((issue) => issue.path.join("."))
      .join(",");
    throw new AIError({
      code: "AI_INVALID_STRUCTURED_OUTPUT",
      message: `Model output failed schema validation for ${context.promptId}@${context.promptVersion}`,
      detail: `schema-mismatch:${paths}`,
    });
  }

  return { data: result.data, raw: cleaned };
}
