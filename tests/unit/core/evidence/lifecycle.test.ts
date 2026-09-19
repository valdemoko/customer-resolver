import { describe, expect, it } from "vitest";

import {
  canTransition,
  createEvidence,
  linkEvidenceToFact,
  replaceEvidence,
  transitionEvidence,
} from "@core/evidence/lifecycle";
import { contentChecksum } from "@core/evidence/checksum";
import { DomainError } from "@lib/errors";
import type { Evidence, EvidenceFactLink } from "@core/evidence/types";

const NOW = "2026-09-19T10:00:00.000Z" as Evidence["createdAt"];

function textEvidence(overrides?: Partial<Parameters<typeof createEvidence>[0]>): Evidence {
  return createEvidence({
    caseId: "c1",
    type: "EMAIL",
    source: "USER",
    content: { kind: "text", text: "Solicitud recibida el 11 de septiembre." },
    now: NOW,
    ...overrides,
  });
}

describe("evidence creation", () => {
  it("creates text evidence as AVAILABLE with a content checksum", () => {
    const e = textEvidence();
    expect(e.status).toBe("AVAILABLE");
    expect(e.checksum).toBe(contentChecksum(e.content));
    expect(e.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates file evidence as PENDING (content not yet validated)", () => {
    const e = textEvidence({
      type: "DOCUMENT",
      content: { kind: "file", storageKey: "k/1", mimeType: "application/pdf", sizeBytes: 10 },
    });
    expect(e.status).toBe("PENDING");
    expect(e.checksum).toBeUndefined();
  });

  it("rejects invalid evidence", () => {
    expect(() => textEvidence({ content: { kind: "text", text: "   " } })).toThrow(DomainError);
    expect(() => textEvidence({ content: { kind: "url", url: "not-a-url" } })).toThrow(DomainError);
    expect(() =>
      textEvidence({
        type: "URL",
        content: { kind: "text", text: "x" },
      }),
    ).toThrow(DomainError);
    expect(() =>
      textEvidence({
        type: "DOCUMENT",
        content: { kind: "url", url: "https://example.com" },
      }),
    ).toThrow(DomainError);
    expect(() =>
      textEvidence({
        type: "DOCUMENT",
        content: { kind: "file", storageKey: "", mimeType: "application/pdf", sizeBytes: 10 },
      }),
    ).toThrow(DomainError);
  });

  it("checksum covers content, not metadata (label changes do not alter it)", () => {
    const a = textEvidence();
    const b = textEvidence({ label: "etiqueta distinta" });
    expect(a.checksum).toBe(b.checksum);
  });

  it("different content → different checksum", () => {
    const a = textEvidence();
    const b = textEvidence({ content: { kind: "text", text: "otro contenido" } });
    expect(a.checksum).not.toBe(b.checksum);
  });
});

describe("evidence lifecycle", () => {
  it("follows the documented machine: PENDING → AVAILABLE → PROCESSING → PROCESSED", () => {
    let e = textEvidence({
      type: "DOCUMENT",
      content: { kind: "file", storageKey: "k/2", mimeType: "application/pdf", sizeBytes: 5 },
    });
    expect(canTransition("PENDING", "AVAILABLE")).toBe(true);
    e = transitionEvidence({ evidence: e, to: "AVAILABLE", now: NOW });
    e = transitionEvidence({ evidence: e, to: "PROCESSING", now: NOW });
    e = transitionEvidence({ evidence: e, to: "PROCESSED", now: NOW });
    expect(e.status).toBe("PROCESSED");
    expect(canTransition("PROCESSED", "PENDING")).toBe(false);
  });

  it("rejects invalid transitions", () => {
    const e = textEvidence(); // AVAILABLE
    expect(() => transitionEvidence({ evidence: e, to: "PENDING", now: NOW })).toThrow(DomainError);
    expect(() => transitionEvidence({ evidence: e, to: "PROCESSED", now: NOW })).toThrow(
      DomainError,
    );
  });

  it("FAILED can retry to AVAILABLE or end REJECTED", () => {
    expect(canTransition("FAILED", "AVAILABLE")).toBe(true);
    expect(canTransition("FAILED", "REJECTED")).toBe(true);
  });

  it("replaces explicitly: old evidence REJECTED + linked to replacement, history intact", () => {
    const old = textEvidence();
    const replacement = textEvidence({ content: { kind: "text", text: "versión corregida" } });
    const { existing, replacement: linked } = replaceEvidence({
      existing: old,
      replacement,
      now: NOW,
    });
    expect(existing.status).toBe("REJECTED");
    expect(existing.replacedByEvidenceId).toBe(replacement.id);
    expect(linked.replacesEvidenceId).toBe(old.id);
    // originals not mutated
    expect(old.status).toBe("AVAILABLE");
  });

  it("rejects double replacement", () => {
    const old = textEvidence();
    const { existing } = replaceEvidence({
      existing: old,
      replacement: textEvidence({ content: { kind: "text", text: "v2" } }),
      now: NOW,
    });
    expect(() =>
      replaceEvidence({
        existing,
        replacement: textEvidence({ content: { kind: "text", text: "v3" } }),
        now: NOW,
      }),
    ).toThrow(DomainError);
  });
});

describe("evidence ↔ fact links", () => {
  it("creates N:N links with explicit semantics", () => {
    const e = textEvidence();
    const link: EvidenceFactLink = linkEvidenceToFact({
      evidence: e,
      factId: "f1",
      relation: "SUPPORTS",
      location: "página 1, línea 3",
      now: NOW,
    });
    expect(link).toMatchObject({ evidenceId: e.id, factId: "f1", relation: "SUPPORTS" });
  });

  it("supports all relation types including contradictory ones", () => {
    const e = textEvidence();
    expect(
      linkEvidenceToFact({ evidence: e, factId: "f1", relation: "CONTRADICTS", now: NOW }).relation,
    ).toBe("CONTRADICTS");
    expect(
      linkEvidenceToFact({ evidence: e, factId: "f2", relation: "MENTIONS", now: NOW }).relation,
    ).toBe("MENTIONS");
  });

  it("rejects empty factId", () => {
    const e = textEvidence();
    expect(() =>
      linkEvidenceToFact({ evidence: e, factId: "", relation: "SUPPORTS", now: NOW }),
    ).toThrow(DomainError);
  });
});
