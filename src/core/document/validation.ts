/**
 * Upload security validation (Fase 5).
 *
 * Deterministic, pure logic — no I/O. Validates:
 *  - MIME type (declared + magic bytes)
 *  - File size limits
 *  - Filename sanitization (no path traversal, no double extensions)
 *  - Content sniffing via magic bytes
 *
 * This module does NOT log file contents (privacy, see ARCHITECTURE.md §26).
 */
import type { ValidateUploadInput, ValidateUploadResult } from "./ports";
import type { UploadConfig } from "./types";
import { DEFAULT_UPLOAD_CONFIG } from "./types";

// ── MIME → magic bytes mapping ──────────────────────────────────────

const MAGIC_BYTES: ReadonlyArray<{ mime: string; bytes: Uint8Array; offset: number }> = [
  { mime: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), offset: 0 },
  { mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]), offset: 0 },
  { mime: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), offset: 0 },
  { mime: "image/webp", bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]), offset: 0 },
];

// text/plain and text/csv have no reliable magic bytes — validated by content sniffing heuristic.

function detectMimeType(buffer: Uint8Array): string | undefined {
  for (const { mime, bytes, offset } of MAGIC_BYTES) {
    if (buffer.length >= offset + bytes.length) {
      let match = true;
      for (let i = 0; i < bytes.length; i++) {
        if (buffer[offset + i] !== bytes[i]) {
          match = false;
          break;
        }
      }
      if (match) return mime;
    }
  }
  // Heuristic for text: check if bytes are mostly printable ASCII / UTF-8
  if (isLikelyText(buffer)) return "text/plain";
  return undefined;
}

function isLikelyText(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.slice(0, Math.min(512, buffer.length));
  let nonText = 0;
  for (const byte of sample) {
    // Null byte is a strong indicator of binary content
    if (byte === 0x00) return false;
    // Control characters (except common whitespace) indicate binary
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) nonText++;
  }
  return nonText / sample.length < 0.1;
}

// ── Filename sanitization ───────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /\.\./, // path traversal
  /[/\\]/, // path separators
  /[\x00-\x1f]/, // control characters
  /^\.+$/, // dots only
];

/**
 * Sanitize a user-provided filename for metadata storage.
 * Returns a safe filename; never used as storage key (keys are system-generated).
 */
export function sanitizeFilename(raw: string): string {
  let name = raw.trim();
  // Remove any path components
  name = name.replace(/^.*[/\\]/, "");
  // Remove null bytes and control characters
  name = name.replace(/[\x00-\x1f]/g, "");
  // Collapse multiple dots (double extension attack)
  name = name.replace(/\.{2,}/g, ".");
  // Trim leading dots (hidden files)
  name = name.replace(/^\.+/, "");
  // Limit length
  if (name.length > 255) name = name.slice(0, 255);
  // Fallback if empty
  if (!name) name = "document";
  return name;
}

// ── Extension validation ────────────────────────────────────────────

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

// ── Main validation function ────────────────────────────────────────

/**
 * Validate an upload against security rules. Deterministic, pure, no I/O.
 */
export function validateUpload(
  input: ValidateUploadInput,
  config: UploadConfig = DEFAULT_UPLOAD_CONFIG,
): ValidateUploadResult {
  // 1. Size check
  if (input.sizeBytes > config.maxFileSizeBytes) {
    return {
      valid: false,
      error: `File too large: ${input.sizeBytes} bytes exceeds limit of ${config.maxFileSizeBytes} bytes`,
    };
  }

  if (input.sizeBytes === 0) {
    return { valid: false, error: "File is empty" };
  }

  // 2. Filename validation (path traversal, double extension, control chars)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input.filename)) {
      return { valid: false, error: "Invalid filename: contains dangerous characters" };
    }
  }

  // 3. Double extension check: factura.pdf.exe, document.pdf%00.exe
  const dotParts = input.filename.split(".");
  if (dotParts.length > 2) {
    const extensions = dotParts.slice(1).map((e) => e.toLowerCase());
    const suspiciousPairs = ["pdf.exe", "txt.exe", "jpg.exe", "png.exe", "csv.exe", "pdf%00exe"];
    const combined = extensions.join(".").toLowerCase();
    if (suspiciousPairs.some((s) => combined.includes(s))) {
      return { valid: false, error: "Suspicious double extension detected" };
    }
  }

  // 4. Extension check
  const ext = getExtension(input.filename);
  if (ext && !config.allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension not allowed: ${ext}` };
  }

  // 5. MIME type check (declared)
  if (!config.allowedMimeTypes.includes(input.declaredMimeType)) {
    return { valid: false, error: `MIME type not allowed: ${input.declaredMimeType}` };
  }

  // 6. Content sniffing: verify magic bytes match declared MIME
  const detected = detectMimeType(input.buffer);
  if (detected && detected !== input.declaredMimeType) {
    // Allow text/plain override (browsers sometimes declare text/csv for text/plain)
    if (!(detected === "text/plain" && input.declaredMimeType === "text/csv")) {
      return {
        valid: false,
        error: `MIME mismatch: declared ${input.declaredMimeType} but content appears to be ${detected}`,
      };
    }
  }

  // 7. Final normalized MIME
  return { valid: true, normalizedMimeType: input.declaredMimeType };
}

// ── Storage key generation ──────────────────────────────────────────

/**
 * Generate a storage key that is NEVER derived from user filename.
 * Format: {caseId}/{uuid}.{ext}
 */
export function generateStorageKey(caseId: string, filename: string): string {
  // Strip any path components — only use the basename for extension detection
  const basename = filename.replace(/^.*[/\\]/, "");
  const ext = getExtension(basename);
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${caseId}/${id}${ext}`;
}
