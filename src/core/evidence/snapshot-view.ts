/**
 * Evidence snapshot view (Fase 2).
 *
 * Snapshots must be able to answer "what evidence existed and what
 * evidence→fact relationships existed at this moment" — without storing blobs.
 * The view contains only semantically relevant fields; volatile metadata
 * (labels, notes, timestamps) is excluded from the semantic hash on purpose.
 */
import { createHash } from "node:crypto";
import type { Evidence, EvidenceFactLink, EvidenceId } from "./types";

export interface EvidenceSnapshotView {
  readonly evidence: ReadonlyArray<{
    readonly id: EvidenceId;
    readonly type: Evidence["type"];
    readonly status: Evidence["status"];
    readonly source: Evidence["source"];
    readonly contentKind: Evidence["content"]["kind"];
    readonly checksum?: string;
    readonly replacesEvidenceId?: EvidenceId;
    readonly replacedByEvidenceId?: EvidenceId;
  }>;
  readonly links: ReadonlyArray<{
    readonly evidenceId: EvidenceId;
    readonly factId: string;
    readonly relation: EvidenceFactLink["relation"];
    readonly location?: string;
  }>;
}

export function buildEvidenceView(
  evidence: readonly Evidence[],
  links: readonly EvidenceFactLink[],
): EvidenceSnapshotView {
  return {
    evidence: evidence.map((e) => ({
      id: e.id,
      type: e.type,
      status: e.status,
      source: e.source,
      contentKind: e.content.kind,
      checksum: e.checksum,
      replacesEvidenceId: e.replacesEvidenceId,
      replacedByEvidenceId: e.replacedByEvidenceId,
    })),
    links: links.map((l) => ({
      evidenceId: l.evidenceId,
      factId: l.factId,
      relation: l.relation,
      location: l.location,
    })),
  };
}

/** Deterministic digest of the evidence view — order-independent. */
export function evidenceViewHash(view: EvidenceSnapshotView): string {
  const canonical = JSON.stringify({
    evidence: [...view.evidence].sort((a, b) => a.id.localeCompare(b.id)),
    links: [...view.links].sort((a, b) =>
      `${a.evidenceId}|${a.factId}|${a.relation}`.localeCompare(
        `${b.evidenceId}|${b.factId}|${b.relation}`,
      ),
    ),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
