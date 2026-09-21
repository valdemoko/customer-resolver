/**
 * Fact operations (Fase 1). Pure domain logic over the `Fact` type.
 * Facts are the ONLY input the future Rule Engine trusts (ARCHITECTURE.md §5).
 */
import type {
  ConfidenceBucket,
  ContradictionResolution,
  EvidenceReference,
  Fact,
  FactId,
  FactKey,
  FactProvenance,
  FactStatus,
  FactValue,
} from "../types";
import type { IsoDateTime } from "../shared/temporal";
import { newFactId } from "./ids";
import { DomainError } from "@lib/errors";

const PROVENANCE_DEFAULT_CONFIDENCE: Readonly<Record<FactProvenance, ConfidenceBucket>> = {
  USER_PROVIDED: "USER",
  DOCUMENT_EXTRACTED: "PARSER",
  AI_INTERPRETED: "AI",
  DERIVED: "DERIVED",
  SYSTEM: "USER",
  USER_RESOLVED: "USER",
};

export function defaultConfidenceFor(provenance: FactProvenance): ConfidenceBucket {
  return PROVENANCE_DEFAULT_CONFIDENCE[provenance];
}

export interface CreateFactInput {
  readonly caseId: string;
  readonly key: FactKey;
  readonly value: FactValue;
  readonly provenance: FactProvenance;
  readonly now: IsoDateTime;
  readonly evidenceRefs?: readonly EvidenceReference[];
  readonly confidence?: ConfidenceBucket;
  readonly supersedesId?: string;
  readonly id?: string; // injection point for deterministic tests
  /** Only CaseService passes this when creating USER_RESOLVED winners. */
  readonly allowUserResolved?: boolean;
  /** Override initial status. Default: UNCONFIRMED. Use "CONFIRMED" for user-confirmed facts. */
  readonly initialStatus?: FactStatus;
}

export function createFact(input: CreateFactInput): Fact {
  validateFactValue(input.key, input.value);

  if (input.provenance === "USER_RESOLVED" && !input.allowUserResolved) {
    throw new DomainError(
      "USER_RESOLVED facts must be created via resolveContradiction, not createFact",
    );
  }

  const status = input.initialStatus ?? "UNCONFIRMED";

  // Only USER_PROVIDED and USER_RESOLVED provenance can produce CONFIRMED facts
  if (status === "CONFIRMED" && input.provenance !== "USER_PROVIDED" && input.provenance !== "USER_RESOLVED") {
    throw new DomainError(
      `Cannot create CONFIRMED fact with provenance ${input.provenance}. Only USER_PROVIDED or USER_RESOLVED allowed.`,
    );
  }

  return {
    id: (input.id ?? newFactId()) as FactId,
    caseId: input.caseId,
    key: input.key,
    value: input.value,
    provenance: input.provenance,
    status,
    confidence: input.confidence ?? defaultConfidenceFor(input.provenance),
    evidenceRefs: input.evidenceRefs ?? [],
    createdAt: input.now,
    updatedAt: input.now,
    supersedesId: input.supersedesId as FactId | undefined,
  };
}

/**
 * Create a user-confirmed fact from an intake candidate.
 * This is the ONLY way to go from UNCONFIRMED candidate to CONFIRMED fact.
 * Enforces F8.3 invariant: AI output → user confirmation → CONFIRMED fact.
 */
export function confirmFact(input: {
  readonly caseId: string;
  readonly key: FactKey;
  readonly value: FactValue;
  readonly evidenceRefs?: readonly EvidenceReference[];
  readonly now: IsoDateTime;
  readonly id?: string;
}): Fact {
  return createFact({
    ...input,
    provenance: "USER_PROVIDED",
    initialStatus: "CONFIRMED",
  });
}

export interface UpdateFactInput {
  readonly existing: Fact;
  readonly value: FactValue;
  readonly provenance: FactProvenance;
  readonly now: IsoDateTime;
  readonly evidenceRefs?: readonly EvidenceReference[];
  readonly id?: string;
}

/**
 * Update = supersede: the old fact is returned with status SUPERSEDED and
 * supersededById pointing to the new fact; the new fact carries supersedesId.
 * History is never silently overwritten (ARCHITECTURE.md §10 protocol).
 */
export function updateFact(input: UpdateFactInput): { next: Fact; previous: Fact } {
  if (input.existing.status === "SUPERSEDED") {
    throw new DomainError("Cannot update a SUPERSEDED fact; supersede the current one instead");
  }
  validateFactValue(input.existing.key, input.value);

  const next: Fact = {
    ...createFact({
      caseId: input.existing.caseId,
      key: input.existing.key,
      value: input.value,
      provenance: input.provenance,
      now: input.now,
      evidenceRefs: input.evidenceRefs ?? input.existing.evidenceRefs,
      supersedesId: input.existing.id,
      id: input.id,
    }),
    // Preserve CONFIRMED status if the update comes from an equally trusted source;
    // otherwise the new value starts UNCONFIRMED and must be re-confirmed.
    status: "UNCONFIRMED",
  };

  const previous: Fact = {
    ...input.existing,
    status: "SUPERSEDED",
    supersededById: next.id,
    updatedAt: input.now,
  };

  return { next, previous };
}

export function validateFactValue(key: FactKey, value: FactValue): void {
  if (key.length === 0 || !key.includes(".")) {
    throw new DomainError(`FactKey must be namespaced like "domain.field", got: ${key}`);
  }
  switch (value.type) {
    case "number":
      if (!Number.isFinite(value.value)) {
        throw new DomainError(`Fact ${key}: number value must be finite`);
      }
      break;
    case "money":
      if (!Number.isInteger(value.value.amountMinor)) {
        throw new DomainError(`Fact ${key}: money amountMinor must be an integer`);
      }
      break;
    case "enum":
      if (!value.options.includes(value.value)) {
        throw new DomainError(`Fact ${key}: enum value "${value.value}" not in options`);
      }
      break;
    case "object":
      if (value.value === null || typeof value.value !== "object") {
        throw new DomainError(`Fact ${key}: object value must be a record`);
      }
      break;
    default:
      break;
  }
}

export interface ApplyResolutionInput {
  readonly newFact: Fact; // fact created to carry the winning value (USER_RESOLVED)
  readonly resolution: ContradictionResolution;
  readonly now: IsoDateTime;
}

/** Mark a fact as the explicit winner of a contradiction (status CONFIRMED). */
export function applyResolution(input: ApplyResolutionInput): Fact {
  if (input.newFact.provenance !== "USER_RESOLVED") {
    throw new DomainError("Resolution facts must have USER_RESOLVED provenance");
  }
  return {
    ...input.newFact,
    status: "CONFIRMED",
    resolution: input.resolution,
    updatedAt: input.now,
  };
}
