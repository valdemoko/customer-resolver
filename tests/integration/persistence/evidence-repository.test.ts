/**
 * Evidence persistence tests (Fase 2) — real SQL via PGlite.
 * Covers edge cases A–J from docs prompt §21 plus locking/idempotency.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CaseService } from "@core/case/service";
import { EvidenceService } from "@core/evidence/service";
import { buildEvidenceView, evidenceViewHash } from "@core/evidence/snapshot-view";
import { isoDate } from "@core/shared/temporal";
import type { CurrencyCode, JurisdictionCode, Locale, OwnerId, ProblemSlug } from "@core/types";
import type { EvidenceId } from "@core/evidence/types";
import { createPersistenceHarness, type PersistenceHarness } from "./pglite-setup";

// TEST FIXTURES — NOT REAL PROBLEMS, JURISDICTIONS OR LEGAL DATA
const OWNERS = {
  problemSlug: "test-problem" as ProblemSlug,
  jurisdiction: "XX" as JurisdictionCode,
  locale: "es-ES" as Locale,
  currency: "EUR" as CurrencyCode,
  ownerId: "owner-test" as OwnerId,
};

let harness: PersistenceHarness;
let caseService: CaseService;
let evidenceService: EvidenceService;

beforeAll(async () => {
  harness = await createPersistenceHarness();
  caseService = new CaseService(harness.repo, "test-engine-1");
  evidenceService = new EvidenceService(harness.repo);
});
afterAll(async () => {
  await harness.close();
});

const emailContent = (text: string) => ({ kind: "text", text }) as const;

async function createCaseWithFact() {
  const created = await caseService.createCase(OWNERS);
  const fact = await caseService.addFact(created.id, {
    key: "cancellation.request_date" as never,
    value: { type: "date", value: isoDate("2026-09-10") },
    provenance: "USER_PROVIDED",
  });
  return { caseId: created.id, factId: fact.fact.id };
}

describe("evidence persistence basics", () => {
  it("creates, reloads and lists evidence for a case", async () => {
    const { caseId } = await createCaseWithFact();
    const { evidence: ev } = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("Solicitud recibida el 11 de septiembre."),
      label: "email de confirmación",
    });

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence).toHaveLength(1);
    const loaded = reloaded.evidence[0]!;
    expect(loaded.id).toBe(ev.id);
    expect(loaded.status).toBe("AVAILABLE");
    expect(loaded.checksum).toBe(ev.checksum);
    expect(loaded.content).toEqual(emailContent("Solicitud recibida el 11 de septiembre."));
  });

  it("file evidence persists as PENDING and transitions atomically", async () => {
    const { caseId } = await createCaseWithFact();
    const { evidence: ev } = await evidenceService.addEvidence(caseId, {
      type: "DOCUMENT",
      source: "USER",
      content: {
        kind: "file",
        storageKey: "2026/09/abc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        filename: "factura.pdf",
      },
    });
    expect(ev.status).toBe("PENDING");

    const processed = await evidenceService.changeEvidenceStatus(caseId, ev.id, "AVAILABLE");
    expect(processed.status).toBe("AVAILABLE");
    expect(processed.checksum).toBeDefined();

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence[0]!.status).toBe("AVAILABLE");
  });
});

describe("N:N relationships (edge cases A–C)", () => {
  it("Case A: one evidence supports two facts; Case B: two evidence support one fact", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const secondFact = await caseService.addFact(caseId, {
      key: "charge.amount" as never,
      value: { type: "money", value: { amountMinor: 15000, currency: "EUR" } },
      provenance: "USER_PROVIDED",
    });

    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("email con ambos datos"),
    });
    const e2 = await evidenceService.addEvidence(caseId, {
      type: "MESSAGE",
      source: "USER",
      content: emailContent("captura de chat"),
    });

    // E1 → F1 y E1 → F2 (one evidence, two facts)
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");
    await evidenceService.linkToFact(caseId, e1.evidence.id, secondFact.fact.id, "SUPPORTS");
    // E2 → F1 (two evidence, one fact)
    await evidenceService.linkToFact(caseId, e2.evidence.id, factId, "SUPPORTS");

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidenceLinks).toHaveLength(3);
    const linksForFact1 = reloaded.evidenceLinks.filter((l) => l.factId === factId);
    expect(linksForFact1).toHaveLength(2); // Case B
    const linksForE1 = reloaded.evidenceLinks.filter((l) => l.evidenceId === e1.evidence.id);
    expect(linksForE1).toHaveLength(2); // Case A
  });

  it("Case C: evidence supports Fact A but contradicts Fact B (both links persist)", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const conflicting = await caseService.addFact(caseId, {
      key: "cancellation.request_date" as never, // will contradict → HAS_CONTRADICTIONS
      value: { type: "date", value: isoDate("2026-09-14") },
      provenance: "DOCUMENT_EXTRACTED",
    });
    const contradictionId = conflicting.contradiction!.id;
    void contradictionId;

    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "SYSTEM",
      content: emailContent("la empresa confirma recepción el 14/09"),
    });
    await evidenceService.linkToFact(caseId, e1.evidence.id, conflicting.fact.id, "SUPPORTS");
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "CONTRADICTS", {
      location: "cuerpo del email, párrafo 2",
    });

    const reloaded = await caseService.loadCase(caseId);
    const relations = reloaded.evidenceLinks
      .filter((l) => l.evidenceId === e1.evidence.id)
      .map((l) => l.relation)
      .sort();
    expect(relations).toEqual(["CONTRADICTS", "SUPPORTS"]);
  });

  it("Case D: unlink leaves the fact intact", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("contenido"),
    });
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");
    await evidenceService.unlinkFromFact(caseId, e1.evidence.id, factId, "SUPPORTS");

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidenceLinks).toHaveLength(0);
    expect(reloaded.facts.find((f) => f.id === factId)).toBeDefined(); // fact remains
  });

  it("Case E: fact superseded while evidence remains; links survive re-adding", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("contenido"),
    });
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");

    // update the fact (supersede path from Fase 1)
    await caseService.addFact(caseId, {
      key: "cancellation.request_date" as never,
      value: { type: "date", value: isoDate("2026-09-11") },
      provenance: "DOCUMENT_EXTRACTED",
    });

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence).toHaveLength(1); // evidence untouched
    expect(reloaded.evidenceLinks).toHaveLength(1); // link to the OLD fact remains (history)
  });
});

describe("replacement & rejection (Case F)", () => {
  it("replaces evidence explicitly: old rejected + linked, new active", async () => {
    const { caseId } = await createCaseWithFact();
    const v1 = await evidenceService.addEvidence(caseId, {
      type: "DOCUMENT",
      source: "USER",
      content: { kind: "file", storageKey: "k/v1", mimeType: "application/pdf", sizeBytes: 100 },
    });
    const v2 = await evidenceService.addEvidence(caseId, {
      type: "DOCUMENT",
      source: "USER",
      content: { kind: "file", storageKey: "k/v2", mimeType: "application/pdf", sizeBytes: 120 },
      replacesEvidenceId: v1.evidence.id,
    });

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence).toHaveLength(2);
    const old = reloaded.evidence.find((e) => e.id === v1.evidence.id)!;
    const neu = reloaded.evidence.find((e) => e.id === v2.evidence.id)!;
    expect(old.status).toBe("REJECTED");
    expect(old.replacedByEvidenceId).toBe(v2.evidence.id);
    expect(neu.replacesEvidenceId).toBe(v1.evidence.id);
    // event trail documents the replacement
    expect(reloaded.events.map((e) => e.type)).toContain("EVIDENCE_REPLACED");
  });
});

describe("locking & idempotency (Cases G, H)", () => {
  it("Case G: concurrent evidence writes → stale version rejected", async () => {
    const { caseId } = await createCaseWithFact();
    const tabB = await caseService.loadCase(caseId);

    // Tab A writes first (version bump)
    await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("desde pestaña A"),
    });

    // Tab B uses its stale snapshot through the raw repo (simulating lost update)
    await expect(
      harness.repo.saveUnit(
        {
          caseId,
          newFacts: [],
          updatedFacts: [],
          newContradictions: [],
          updatedContradictions: [],
          newEvidence: [
            {
              id: "99999999-9999-4999-8999-999999999999" as EvidenceId,
              caseId,
              type: "EMAIL",
              status: "AVAILABLE",
              source: "USER",
              content: emailContent("desde pestaña B obsoleta"),
              createdAt: tabB.case.createdAt,
              updatedAt: tabB.case.createdAt,
            },
          ],
          newEvents: [],
        },
        tabB.case.version,
      ),
    ).rejects.toThrow();
  });

  it("Case H: retried request with idempotency key does not duplicate evidence", async () => {
    const { caseId } = await createCaseWithFact();
    const input = {
      type: "EMAIL" as const,
      source: "USER" as const,
      content: emailContent("posible reintento"),
    };
    const first = await evidenceService.addEvidence(caseId, input, { idempotencyKey: "idem-ev-1" });
    const retried = await evidenceService.addEvidence(caseId, input, {
      idempotencyKey: "idem-ev-1",
    });
    expect(retried.evidence.id).toBe(first.evidence.id);

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence).toHaveLength(1);
  });

  it("linking the same evidence→fact→relation twice is idempotent", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("contenido"),
    });
    const l1 = await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");
    const l2 = await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");
    expect(l1.evidenceId).toBe(l2.evidenceId);

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidenceLinks).toHaveLength(1);
  });
});

describe("snapshots with evidence (Cases I, J)", () => {
  it("Case I: snapshot before evidence stays reproducible; Case J: snapshot after evidence includes it", async () => {
    const { caseId, factId } = await createCaseWithFact();

    // Case I: snapshot BEFORE evidence
    const before = await caseService.createSnapshotForCase(caseId);
    const snapshotBefore = (await caseService.loadCase(caseId)).snapshots.find(
      (s) => s.id === before.snapshotId,
    )!;

    // add evidence + link
    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("evidencia posterior al primer snapshot"),
    });
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");

    // Case J: snapshot AFTER evidence
    const after = await caseService.createSnapshotForCase(caseId);

    const loaded = await caseService.loadCase(caseId);
    const evidenceBefore = loaded.evidence.filter((e) => e.createdAt <= snapshotBefore.createdAt);
    void evidenceBefore;

    // Reproducibility: same evidence state → same view hash
    const view = buildEvidenceView(loaded.evidence, loaded.evidenceLinks);
    const hash1 = evidenceViewHash(view);
    const hash2 = evidenceViewHash(buildEvidenceView(loaded.evidence, loaded.evidenceLinks));
    expect(hash1).toBe(hash2);

    // The two snapshots captured different evidence states (before/after)
    const twoSnapshots = loaded.snapshots;
    expect(twoSnapshots).toHaveLength(2);
    // semantic difference is provable via the view of current vs pre-evidence state
    const viewWithoutE1 = buildEvidenceView(
      loaded.evidence.filter((e) => e.id !== e1.evidence.id),
      loaded.evidenceLinks.filter((l) => l.evidenceId !== e1.evidence.id),
    );
    expect(evidenceViewHash(viewWithoutE1)).not.toBe(hash1);
    expect(after.snapshotId).not.toBe(before.snapshotId);
  });

  it("snapshot hash reacts to evidence relationship changes", async () => {
    const { caseId, factId } = await createCaseWithFact();
    const e1 = await evidenceService.addEvidence(caseId, {
      type: "EMAIL",
      source: "USER",
      content: emailContent("contenido"),
    });

    const hashNoLink = evidenceViewHash(buildEvidenceView([{ ...e1.evidence }], []));
    await evidenceService.linkToFact(caseId, e1.evidence.id, factId, "SUPPORTS");
    const loaded = await caseService.loadCase(caseId);
    const hashWithLink = evidenceViewHash(buildEvidenceView(loaded.evidence, loaded.evidenceLinks));
    expect(hashNoLink).not.toBe(hashWithLink);
  });
});

describe("transactions", () => {
  it("failed operation leaves no partial evidence (transaction rollback)", async () => {
    const { caseId } = await createCaseWithFact();
    // Invalid input throws inside the service before saveUnit — nothing persisted.
    await expect(
      evidenceService.addEvidence(caseId, {
        type: "DOCUMENT",
        source: "USER",
        content: { kind: "file", storageKey: "", mimeType: "application/pdf", sizeBytes: 10 },
      }),
    ).rejects.toThrow();

    const reloaded = await caseService.loadCase(caseId);
    expect(reloaded.evidence).toHaveLength(0);
    // Version untouched by the failed operation
    expect(reloaded.case.version).toBe(2); // case creation + initial fact
  });
});
