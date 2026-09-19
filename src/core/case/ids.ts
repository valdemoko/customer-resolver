/**
 * Id generation for the core domain (Fase 1).
 *
 * Prefers UUID v7 (time-sortable) when available, falls back to v4.
 * Kept behind a function so tests can stay deterministic if needed.
 */

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") return cryptoObj.randomUUID();
  // Fallback: v4 via getRandomValues
  if (!cryptoObj) throw new Error("Web Crypto not available");
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newCaseId(): string {
  return uuid();
}

export function newFactId(): string {
  return uuid();
}

export function newContradictionId(): string {
  return uuid();
}

export function newSnapshotId(): string {
  return uuid();
}

export function newEventId(): string {
  return uuid();
}

export function isUuid(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    UUID_V7_RE.test(value)
  );
}
