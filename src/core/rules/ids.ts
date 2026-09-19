/**
 * Id generation for rules/sources (Fase 3) — same UUID strategy as the case engine.
 */
export function newId(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") return cryptoObj.randomUUID();
  throw new Error("Web Crypto not available");
}
