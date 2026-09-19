/**
 * Evidence checksum semantics (Fase 2).
 *
 * The checksum covers ONLY the content the system actually holds:
 *  - text evidence: UTF-8 bytes of the text
 *  - url evidence:  UTF-8 bytes of the normalized URL string
 *  - file evidence: the checksum reported at registration time (the domain
 *    does not read file bytes; Fase 5 storage will verify server-side)
 *
 * It guarantees change-detection of what we hold. It does NOT promise
 * cryptographic integrity of a file we have not stored or hashed ourselves —
 * that verification belongs to the future storage layer (documented, not faked).
 */
import { createHash } from "node:crypto";
import type { EvidenceContent } from "./types";

export function contentChecksum(content: EvidenceContent): string {
  const hash = createHash("sha256");
  switch (content.kind) {
    case "text":
      hash.update("text\0");
      hash.update(content.text, "utf8");
      break;
    case "url":
      hash.update("url\0");
      hash.update(content.url, "utf8");
      break;
    case "file":
      // We hash the *declared* identity; actual byte verification is Fase 5's job.
      hash.update("file-declared\0");
      hash.update(`${content.mimeType}\0${content.sizeBytes}\0${content.storageKey}`, "utf8");
      break;
  }
  return hash.digest("hex");
}
