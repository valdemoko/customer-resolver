/**
 * Untrusted-content sanitization (Fase 6, spec §17 — prompt injection defense).
 *
 * Everything that comes from a PDF, TXT, CSV, email, URL or user message is
 * UNTRUSTED DATA. It is never sent to a model as bare instruction text:
 *
 *  1. It is normalized (zero-width / homoglyph-safe) so invisible injection
 *     payloads from OCR layers do not survive.
 *  2. It is wrapped in non-escapeable delimiters by the prompt builder
 *     (core/ai/prompts.ts + assembleUserMessage here) and the system prompt
 *     explicitly forbids obeying instructions inside the delimiters.
 *  3. Typical instruction-override patterns are stripped before send.
 *
 * Sanitization is deterministic and unit-tested (adversarial corpus).
 */

/** Zero-width and control characters commonly used to hide injections. */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/** Common instruction-override phrasings (case-insensitive, EN + ES). */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|rules?)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|rules?)/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /new\s+instructions?\s*:/gi,
  /ignora\s+(todas?\s+)?(las\s+)?instrucciones/gi,
  /olvida\s+(todas?\s+)?(las\s+)?instrucciones/gi,
  /eres\s+ahora\s+(un|una)\s+/gi,
];

export interface SanitizeResult {
  /** Sanitized text, safe to embed between delimiters. */
  readonly text: string;
  /** How many injection-like patterns were neutralized (metric, not content). */
  readonly neutralizedPatterns: number;
  /** True when invisible/control characters were removed. */
  readonly removedInvisibleChars: boolean;
}

/**
 * Sanitize untrusted document text before it is embedded in a prompt.
 * Deterministic: same input → same output (input-hash stability depends on it).
 */
export function sanitizeUntrustedText(raw: string): SanitizeResult {
  let neutralized = 0;
  let text = raw.replace(INVISIBLE_CHARS, " ");
  const removedInvisibleChars = text !== raw;

  for (const pattern of INJECTION_PATTERNS) {
    // Global regexes with /g keep lastIndex state — reset defensively per string.
    const fresh = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(fresh);
    if (matches && matches.length > 0) {
      neutralized += matches.length;
      text = text.replace(new RegExp(pattern.source, pattern.flags), "[redacted-instruction]");
    }
  }

  return { text, neutralizedPatterns: neutralized, removedInvisibleChars };
}

/**
 * Wrap sanitized untrusted content in delimiters for a user message.
 * The closing delimiter cannot appear inside the content (we strip any
 * occurrence), so the model cannot "leave" the data block early.
 */
export const UNTRUSTED_OPEN = "<untrusted_document>";
export const UNTRUSTED_CLOSE = "</untrusted_document>";

export function assembleUserMessage(sanitizedText: string, instruction: string): string {
  const safe = sanitizedText.replaceAll(UNTRUSTED_CLOSE, "[redacted-delimiter]");
  return `${UNTRUSTED_OPEN}\n${safe}\n${UNTRUSTED_CLOSE}\n\n${instruction}`;
}
