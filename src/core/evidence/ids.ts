/**
 * Evidence id generation (Fase 2). Reuses the case id strategy (UUID).
 */
import type { EvidenceId } from "./types";

export function newEvidenceId(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") return cryptoObj.randomUUID();
  throw new Error("Web Crypto not available");
}

export function isEvidenceId(value: string): value is EvidenceId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
