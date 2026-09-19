/**
 * Evidence lifecycle & operations (Fase 2).
 * Pure domain logic over `Evidence` / `EvidenceFactLink`.
 */
import { DomainError } from "@lib/errors";
import type { IsoDateTime } from "../shared/temporal";
import type {
  Evidence,
  EvidenceFactLink,
  EvidenceFactRelation,
  EvidenceId,
  EvidenceStatus,
  EvidenceType,
} from "./types";
import { contentChecksum } from "./checksum";
import { newEvidenceId } from "./ids";

/** Valid status transitions (documented machine; see types.ts for semantics). */
const STATUS_TRANSITIONS: Readonly<Record<EvidenceStatus, readonly EvidenceStatus[]>> = {
  PENDING: ["AVAILABLE", "REJECTED"],
  AVAILABLE: ["PROCESSING", "REJECTED"],
  PROCESSING: ["PROCESSED", "FAILED"],
  PROCESSED: [], // terminal for now; reprocessing creates new pipeline runs (Fase 5+)
  FAILED: ["AVAILABLE", "REJECTED"], // retry may re-validate content
  REJECTED: [], // terminal; history kept, never deleted
};

export function canTransition(from: EvidenceStatus, to: EvidenceStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export interface CreateEvidenceInput {
  readonly caseId: string;
  readonly type: EvidenceType;
  readonly source: Evidence["source"];
  readonly content: Evidence["content"];
  readonly label?: string;
  readonly now: IsoDateTime;
  readonly id?: string;
  readonly replacesEvidenceId?: EvidenceId;
}

const URL_PATTERN = /^https?:\/\/\S+$/;

export function createEvidence(input: CreateEvidenceInput): Evidence {
  if (!input.caseId) throw new DomainError("Evidence requires a caseId");

  switch (input.content.kind) {
    case "text":
      if (input.content.text.trim().length === 0) {
        throw new DomainError("Text evidence cannot be empty");
      }
      break;
    case "url":
      if (!URL_PATTERN.test(input.content.url)) {
        throw new DomainError(`Invalid URL evidence: ${input.content.url}`);
      }
      break;
    case "file":
      if (!input.content.storageKey) throw new DomainError("File evidence requires a storageKey");
      if (input.content.sizeBytes <= 0)
        throw new DomainError("File evidence sizeBytes must be > 0");
      if (!input.content.mimeType) throw new DomainError("File evidence requires a mimeType");
      break;
  }

  // Content must match type expectations (coarse guard, extensible).
  if (input.type === "URL" && input.content.kind !== "url") {
    throw new DomainError("URL evidence requires url content");
  }
  if ((input.type === "DOCUMENT" || input.type === "IMAGE") && input.content.kind === "url") {
    throw new DomainError(`${input.type} evidence cannot be url-backed`);
  }

  const initialStatus: EvidenceStatus = input.content.kind === "file" ? "PENDING" : "AVAILABLE";

  return {
    id: (input.id ?? newEvidenceId()) as EvidenceId,
    caseId: input.caseId,
    type: input.type,
    status: initialStatus,
    source: input.source,
    content: input.content,
    label: input.label,
    checksum: initialStatus === "AVAILABLE" ? contentChecksum(input.content) : undefined,
    createdAt: input.now,
    updatedAt: input.now,
    replacesEvidenceId: input.replacesEvidenceId,
  };
}

export interface TransitionEvidenceInput {
  readonly evidence: Evidence;
  readonly to: EvidenceStatus;
  readonly now: IsoDateTime;
}

/** Status change with validated transition and checksum on becoming AVAILABLE. */
export function transitionEvidence(input: TransitionEvidenceInput): Evidence {
  if (!canTransition(input.evidence.status, input.to)) {
    throw new DomainError(`Invalid evidence transition: ${input.evidence.status} → ${input.to}`);
  }
  return {
    ...input.evidence,
    status: input.to,
    checksum:
      input.to === "AVAILABLE" ? contentChecksum(input.evidence.content) : input.evidence.checksum,
    updatedAt: input.now,
  };
}

export interface ReplaceEvidenceInput {
  readonly existing: Evidence;
  readonly replacement: Evidence;
  readonly now: IsoDateTime;
}

/**
 * Explicit replacement (user substitutes a document): the old evidence is kept
 * with `replacedByEvidenceId`; it is also REJECTED so its history stays but it
 * no longer reads as usable. Silent overwrite is impossible.
 */
export function replaceEvidence(input: ReplaceEvidenceInput): {
  existing: Evidence;
  replacement: Evidence;
} {
  if (input.existing.caseId !== input.replacement.caseId) {
    throw new DomainError("Cannot replace evidence across different cases");
  }
  if (input.existing.replacedByEvidenceId) {
    throw new DomainError("Evidence already replaced");
  }
  return {
    existing: {
      ...transitionEvidence({ evidence: input.existing, to: "REJECTED", now: input.now }),
      replacedByEvidenceId: input.replacement.id,
      updatedAt: input.now,
    },
    replacement: { ...input.replacement, replacesEvidenceId: input.existing.id },
  };
}

export interface LinkEvidenceInput {
  readonly evidence: Evidence;
  readonly factId: string;
  readonly relation: EvidenceFactRelation;
  readonly location?: string;
  readonly note?: string;
  readonly now: IsoDateTime;
}

/** Create an N:N evidence→fact link. Association ≠ proof of truth. */
export function linkEvidenceToFact(input: LinkEvidenceInput): EvidenceFactLink {
  if (input.evidence.caseId === undefined) throw new DomainError("Evidence without case");
  if (!input.factId) throw new DomainError("Link requires a factId");
  return {
    evidenceId: input.evidence.id,
    factId: input.factId,
    relation: input.relation,
    location: input.location,
    note: input.note,
    createdAt: input.now,
  };
}
