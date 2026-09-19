import { describe, expect, it } from "vitest";

import { buildEvidenceView, evidenceViewHash } from "@core/evidence/snapshot-view";
import { createEvidence } from "@core/evidence/lifecycle";
import type { Evidence, EvidenceFactLink } from "@core/evidence/types";

const NOW = "2026-09-19T10:00:00.000Z" as Evidence["createdAt"];

function ev(id: string, text: string): Evidence {
  return createEvidence({
    caseId: "c1",
    type: "EMAIL",
    source: "USER",
    content: { kind: "text", text },
    now: NOW,
    id,
  });
}

function link(
  evidenceId: string,
  factId: string,
  relation: EvidenceFactLink["relation"],
): EvidenceFactLink {
  return { evidenceId: evidenceId as Evidence["id"], factId, relation, createdAt: NOW };
}

describe("evidence snapshot view", () => {
  it("hash is deterministic regardless of order", () => {
    const e1 = ev("e1", "contenido uno");
    const e2 = ev("e2", "contenido dos");
    const a = evidenceViewHash(buildEvidenceView([e1, e2], [link("e1", "f1", "SUPPORTS")]));
    const b = evidenceViewHash(buildEvidenceView([e2, e1], [link("e1", "f1", "SUPPORTS")]));
    expect(a).toBe(b);
  });

  it("changing a relationship changes the hash (Case E vs J)", () => {
    const e1 = ev("e1", "contenido");
    const before = evidenceViewHash(buildEvidenceView([e1], []));
    const after = evidenceViewHash(buildEvidenceView([e1], [link("e1", "f1", "SUPPORTS")]));
    expect(before).not.toBe(after);
  });

  it("changing evidence status changes the hash (replaced evidence is visible)", () => {
    const e1 = ev("e1", "contenido");
    const rejected: Evidence = { ...e1, status: "REJECTED" };
    expect(evidenceViewHash(buildEvidenceView([e1], []))).not.toBe(
      evidenceViewHash(buildEvidenceView([rejected], [])),
    );
  });

  it("volatile metadata (label/notes) does NOT change the semantic hash", () => {
    const e1 = ev("e1", "contenido");
    const labeled: Evidence = { ...e1, label: "etiqueta añadida después" };
    const withNote: EvidenceFactLink = { ...link("e1", "f1", "SUPPORTS"), note: "nota interna" };
    expect(evidenceViewHash(buildEvidenceView([e1], [link("e1", "f1", "SUPPORTS")]))).toBe(
      evidenceViewHash(buildEvidenceView([labeled], [withNote])),
    );
  });

  it("different location on a link changes the hash (semantic, not volatile)", () => {
    const e1 = ev("e1", "contenido");
    const l1 = link("e1", "f1", "SUPPORTS");
    const l2 = { ...l1, location: "página 2" };
    expect(evidenceViewHash(buildEvidenceView([e1], [l1]))).not.toBe(
      evidenceViewHash(buildEvidenceView([e1], [l2])),
    );
  });
});
