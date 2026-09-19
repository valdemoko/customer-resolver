/**
 * Evidence domain types (Fase 2).
 *
 * Evidence is WHAT THE CASE HAS — never WHAT IS TRUE. It feeds facts; the
 * fact's provenance/status and (later) the Rule Engine own truth semantics.
 * Pure domain, infrastructure-independent (ARCHITECTURE.md §4).
 */
import type { IsoDateTime } from "../shared/temporal";

export type EvidenceId = string & { readonly __brand: "EvidenceId" };

/** Coarse initial taxonomy — extensible by adding members, not by special-casing. */
export type EvidenceType = "DOCUMENT" | "IMAGE" | "EMAIL" | "MESSAGE" | "URL" | "OTHER";

/**
 * Evidence lifecycle. Explicit semantics:
 *  - PENDING: registered, content not yet available/validated.
 *  - AVAILABLE: content is available and integrity-checked. Does NOT mean interpreted.
 *  - PROCESSING: a future pipeline (docintel/AI) is working on it — Fase 5+.
 *  - PROCESSED: a pipeline finished extracting from it. Does NOT imply conclusions are true.
 *  - FAILED: a processing attempt failed (content may still be AVAILABLE).
 *  - REJECTED: unusable (corrupt, irrelevant, policy violation). History is kept, never deleted.
 */
export type EvidenceStatus =
  "PENDING" | "AVAILABLE" | "PROCESSING" | "PROCESSED" | "FAILED" | "REJECTED";

/** Convenience tuple of lifecycle statuses in display order. */
export const EVIDENCE_STATUSES = [
  "PENDING",
  "AVAILABLE",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "REJECTED",
] as const;

/** Who supplied the evidence. Anonymous actors are first-class (no auth yet). */
export type EvidenceSource = "USER" | "SYSTEM" | "FUTURE_IMPORT";

/**
 * Content representation — separated from evidence type on purpose:
 * an EMAIL can be text; a URL needs no file; a DOCUMENT will (in Fase 5+)
 * be file-backed. Exactly one variant per evidence item.
 */
export type EvidenceContent =
  | { readonly kind: "text"; readonly text: string; readonly encoding?: "utf-8" }
  | {
      readonly kind: "url";
      readonly url: string;
    }
  | {
      readonly kind: "file";
      /** Storage key (future R2). The domain does NOT interpret it as a path. */
      readonly storageKey: string;
      /** Reported MIME — never trusted as proof of content (security, see §18). */
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly filename?: string;
    };

export interface Evidence {
  readonly id: EvidenceId;
  readonly caseId: string;
  readonly type: EvidenceType;
  readonly status: EvidenceStatus;
  readonly source: EvidenceSource;
  readonly content: EvidenceContent;
  /** Human-supplied description (e.g. "factura final de septiembre"). May be empty. */
  readonly label?: string;
  /**
   * Integrity checksum of the AVAILABLE CONTENT (text bytes / url string /
   * reported file checksum), never of volatile metadata. Semantics documented
   * in checksum.ts. Undefined while PENDING.
   */
  readonly checksum?: string;
  /** Status history is preserved via events; this is the timestamp of last change. */
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** If this evidence replaces an earlier one (user corrected a document). */
  readonly replacesEvidenceId?: EvidenceId;
  /** Set on the OLD evidence when replaced — history is never silently overwritten. */
  readonly replacedByEvidenceId?: EvidenceId;
}

/**
 * Evidence → Fact relationship (N:N). `SUPPORTS` means "associated as support"
 * — it does NOT mean the fact is proven true. Truth belongs to Fact provenance
 * + status and, later, the Rule Engine.
 */
export type EvidenceFactRelation = "SUPPORTS" | "CONTRADICTS" | "MENTIONS";

export interface EvidenceFactLink {
  readonly evidenceId: EvidenceId;
  readonly factId: string;
  readonly relation: EvidenceFactRelation;
  /** Extensible location for future parsers: "page 2", "line 17", "t=00:31", … */
  readonly location?: string;
  readonly note?: string;
  readonly createdAt: IsoDateTime;
}
