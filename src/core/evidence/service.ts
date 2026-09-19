/**
 * Evidence application service (Fase 2).
 *
 * Orchestration over pure evidence + case logic, through the CaseRepository
 * port. Every mutation goes through saveUnit → one transaction, one version
 * bump, evidence + links + events atomic. No Drizzle, no HTTP.
 */
import { DomainError } from "@lib/errors";
import type { CaseRepository } from "../ports";
import { CaseNotFoundError } from "../case/service";
import { createEvent } from "../case/events";
import { now as systemNow, type IsoDateTime } from "../shared/temporal";
import type { EvidenceId } from "./types";
import type {
  Evidence,
  EvidenceFactLink,
  EvidenceFactRelation,
  EvidenceStatus,
  EvidenceType,
} from "./types";
import {
  createEvidence,
  linkEvidenceToFact,
  replaceEvidence,
  transitionEvidence,
} from "./lifecycle";

export interface CreateEvidenceResult {
  readonly evidence: Evidence;
  readonly savedCaseId: string;
}

export class EvidenceNotFoundError extends Error {
  readonly code = "EVIDENCE_NOT_FOUND";
  constructor(readonly evidenceId: string) {
    super(`Evidence not found: ${evidenceId}`);
    this.name = "EvidenceNotFoundError";
  }
}

export interface AddEvidenceInput {
  readonly type: EvidenceType;
  readonly source: Evidence["source"];
  readonly content: Evidence["content"];
  readonly label?: string;
  /** Replace an existing evidence item (user substitutes a document). */
  readonly replacesEvidenceId?: EvidenceId;
}

export class EvidenceService {
  constructor(private readonly repo: CaseRepository) {}

  /**
   * Register evidence on a case. Atomic: evidence + (optional replacement
   * rejection) + EVIDENCE_CREATED event in one transaction/version bump.
   * Idempotent via the shared idempotency store when a key is provided.
   */
  async addEvidence(
    caseId: string,
    input: AddEvidenceInput,
    options?: { at?: IsoDateTime; idempotencyKey?: string },
  ): Promise<CreateEvidenceResult> {
    if (options?.idempotencyKey) {
      const existing = await this.repo.findIdempotencyResponse(options.idempotencyKey);
      if (existing !== null)
        return { evidence: existing as Evidence, savedCaseId: (existing as Evidence).caseId };
    }

    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();
    const events = [];
    const updatedEvidence: Evidence[] = [];

    let evidence = createEvidence({
      caseId,
      type: input.type,
      source: input.source,
      content: input.content,
      label: input.label,
      now: at,
      replacesEvidenceId: input.replacesEvidenceId,
    });

    if (input.replacesEvidenceId) {
      const old = loaded.evidence.find((e) => e.id === input.replacesEvidenceId);
      if (!old) throw new EvidenceNotFoundError(input.replacesEvidenceId);
      const { existing, replacement } = replaceEvidence({
        existing: old,
        replacement: evidence,
        now: at,
      });
      evidence = replacement;
      updatedEvidence.push(existing);
      events.push(
        createEvent(
          caseId,
          "EVIDENCE_REPLACED",
          {
            oldEvidenceId: existing.id,
            newEvidenceId: evidence.id,
          },
          at,
        ),
      );
    }

    events.push(
      createEvent(
        caseId,
        "EVIDENCE_CREATED",
        {
          evidenceId: evidence.id,
          evidenceType: evidence.type,
          contentKind: evidence.content.kind,
        },
        at,
      ),
    );

    const savedCase = await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvidence: [evidence],
        updatedEvidence,
        newEvents: events,
      },
      loaded.case.version,
    );

    if (options?.idempotencyKey) {
      await this.repo.recordIdempotency(options.idempotencyKey, evidence);
    }
    return { evidence, savedCaseId: savedCase.id };
  }

  /** Transition an evidence item's status (validated machine), atomically. */
  async changeEvidenceStatus(
    caseId: string,
    evidenceId: string,
    to: EvidenceStatus,
    options?: { at?: IsoDateTime },
  ): Promise<Evidence> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();
    const current = loaded.evidence.find((e) => e.id === evidenceId);
    if (!current) throw new EvidenceNotFoundError(evidenceId);

    const next = transitionEvidence({ evidence: current, to, now: at });
    await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        updatedEvidence: [next],
        newEvents: [createEvent(caseId, "EVIDENCE_STATUS_CHANGED", { evidenceId, to }, at)],
      },
      loaded.case.version,
    );
    return next;
  }

  /** Link evidence to a fact (N:N). Atomic: link + event in one transaction. */
  async linkToFact(
    caseId: string,
    evidenceId: string,
    factId: string,
    relation: EvidenceFactRelation,
    options?: { location?: string; note?: string; at?: IsoDateTime },
  ): Promise<EvidenceFactLink> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();

    const evidence = loaded.evidence.find((e) => e.id === evidenceId);
    if (!evidence) throw new EvidenceNotFoundError(evidenceId);
    if (evidence.status === "REJECTED") {
      throw new DomainError("Cannot link REJECTED evidence to a fact");
    }
    const fact = loaded.facts.find((f) => f.id === factId);
    if (!fact) throw new DomainError(`Fact not found: ${factId}`);
    if (fact.caseId !== caseId) throw new DomainError("Fact belongs to a different case");

    const duplicate = loaded.evidenceLinks.find(
      (l) => l.evidenceId === evidenceId && l.factId === factId && l.relation === relation,
    );
    if (duplicate) return duplicate; // idempotent linking

    const link = linkEvidenceToFact({
      evidence,
      factId,
      relation,
      location: options?.location,
      note: options?.note,
      now: at,
    });

    await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        newEvidenceLinks: [link],
        newEvents: [
          createEvent(
            caseId,
            "EVIDENCE_LINKED_TO_FACT",
            {
              evidenceId,
              factId,
              relation,
            },
            at,
          ),
        ],
      },
      loaded.case.version,
    );
    return link;
  }

  /** Remove an evidence→fact relationship. The fact remains (only the link goes). */
  async unlinkFromFact(
    caseId: string,
    evidenceId: string,
    factId: string,
    relation: EvidenceFactRelation,
    options?: { at?: IsoDateTime },
  ): Promise<void> {
    const loaded = await this.loadCase(caseId);
    const at = options?.at ?? systemNow();
    const link = loaded.evidenceLinks.find(
      (l) => l.evidenceId === evidenceId && l.factId === factId && l.relation === relation,
    );
    if (!link) throw new DomainError(`Link not found: ${evidenceId} → ${factId} (${relation})`);

    await this.repo.saveUnit(
      {
        caseId,
        newFacts: [],
        updatedFacts: [],
        newContradictions: [],
        updatedContradictions: [],
        removedEvidenceLinks: [link],
        newEvents: [
          createEvent(caseId, "EVIDENCE_UNLINKED_FROM_FACT", { evidenceId, factId, relation }, at),
        ],
      },
      loaded.case.version,
    );
  }

  private async loadCase(caseId: string) {
    const loaded = await this.repo.loadCase(caseId);
    if (!loaded) throw new CaseNotFoundError(caseId);
    return loaded;
  }
}
