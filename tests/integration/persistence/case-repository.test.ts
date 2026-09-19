/**
 * Vertical slice + persistence tests (Fase 1, docs prompt §37).
 * Runs against real SQL (PGlite embedded Postgres) with the production adapter.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CaseService } from "@core/case/service";
import { isoDate } from "@core/shared/temporal";
import { ConcurrentCaseUpdateDbError } from "@server/db/repositories/case-repository";
import type { CurrencyCode, JurisdictionCode, Locale, OwnerId, ProblemSlug } from "@core/types";
import { createPersistenceHarness, type PersistenceHarness } from "./pglite-setup";

const OWNERS = {
  problemSlug: "test-problem" as ProblemSlug, // TEST FIXTURE — NOT A REAL PROBLEM MODULE
  jurisdiction: "XX" as JurisdictionCode, // TEST FIXTURE — NOT A REAL JURISDICTION
  locale: "es-ES" as Locale,
  currency: "EUR" as CurrencyCode,
  ownerId: "owner-test" as OwnerId,
};

let harness: PersistenceHarness;

beforeAll(async () => {
  harness = await createPersistenceHarness();
});
afterAll(async () => {
  await harness.close();
});

describe("vertical slice: create → fact → contradiction → resolve → snapshot → persist → reload", () => {
  it("executes the full domain flow and preserves every invariant", async () => {
    const service = new CaseService(harness.repo, "test-engine-1");

    // 1. create case (idempotent)
    const created = await service.createCaseIdempotent("test-key-1", OWNERS);
    expect(created.status).toBe("DRAFT");
    expect(created.version).toBe(1);

    const again = await service.createCaseIdempotent("test-key-1", OWNERS);
    expect(again.id).toBe(created.id);

    // 2. add user fact
    const first = await service.addFact(created.id, {
      key: "cancellation.request_date" as never,
      value: { type: "date", value: isoDate("2026-09-10") },
      provenance: "USER_PROVIDED",
    });
    expect(first.case.status).toBe("COLLECTING_INFORMATION");

    // 3. add conflicting document fact → contradiction detected
    const second = await service.addFact(created.id, {
      key: "cancellation.request_date" as never,
      value: { type: "date", value: isoDate("2026-09-14") },
      provenance: "DOCUMENT_EXTRACTED",
      evidenceRefs: [{ evidenceId: "ev-1", documentId: "doc-1", location: "page 2" }],
    });
    expect(second.case.status).toBe("HAS_CONTRADICTIONS");
    expect(second.contradiction).toBeDefined();
    const contradictionId = second.contradiction!.id;

    // 4. duplicate value → NO new contradiction, no state change
    const dup = await service.addFact(created.id, {
      key: "cancellation.request_date" as never,
      value: { type: "date", value: isoDate("2026-09-10") },
      provenance: "USER_PROVIDED",
    });
    expect(dup.contradiction).toBeUndefined();
    expect(dup.fact.id).toBe(first.fact.id);

    // 5. resolve contradiction explicitly (user wins with a reason)
    const resolution = await service.resolveContradictionForCase(
      created.id,
      contradictionId,
      first.fact.id,
      "mantengo la fecha que comuniqué por teléfono",
    );
    expect(resolution.resolvedFact.status).toBe("CONFIRMED");
    expect(resolution.resolvedFact.provenance).toBe("USER_RESOLVED");
    expect(resolution.case.status).toBe("COLLECTING_INFORMATION");

    // 6. snapshot
    const { snapshotId } = await service.createSnapshotForCase(created.id);
    expect(snapshotId).toBeDefined();

    // 7. reload from DB and verify EVERYTHING persisted coherently
    const reloaded = await service.loadCase(created.id);
    expect(reloaded.case.currentSnapshotId).toBe(snapshotId);
    expect(reloaded.snapshots).toHaveLength(1);
    // Exact event sequence produced by the flow (order is part of the contract).
    expect(reloaded.events.map((e) => e.type)).toEqual([
      "CASE_CREATED",
      "FACT_ADDED", // user fact + DRAFT → COLLECTING_INFORMATION
      "CASE_STATUS_CHANGED",
      "FACT_ADDED", // document fact (conflicting)
      "CONTRADICTION_DETECTED",
      "CASE_STATUS_CHANGED", // → HAS_CONTRADICTIONS
      "CONTRADICTION_RESOLVED",
      "FACT_ADDED", // USER_RESOLVED winner fact
      "CASE_STATUS_CHANGED", // → back to COLLECTING_INFORMATION
      "SNAPSHOT_CREATED",
    ]);
    const facts = reloaded.facts;
    expect(facts.filter((f) => f.status === "SUPERSEDED")).toHaveLength(2); // loser candidate + duplicate
    expect(facts.filter((f) => f.status === "CONFIRMED")).toHaveLength(1);
    expect(facts.find((f) => f.status === "CONFIRMED")?.resolution?.reason).toContain("teléfono");
    const contradiction = reloaded.contradictions[0]!;
    expect(contradiction.status).toBe("RESOLVED_BY_USER");
    expect(contradiction.resolution?.chosenFactId).toBe(first.fact.id);
  });
});

describe("optimistic locking", () => {
  it("detects concurrent writes with a typed conflict error", async () => {
    const service = new CaseService(harness.repo, "test-engine-1");
    const created = await service.createCase(OWNERS);

    // Two tabs read the same version...
    const tabA = await service.loadCase(created.id);
    const tabB = await service.loadCase(created.id);
    expect(tabA.case.version).toBe(tabB.case.version);

    // Tab A writes successfully (version bump)...
    await service.addFact(created.id, {
      key: "a.field" as never,
      value: { type: "string", value: "from tab A" },
      provenance: "USER_PROVIDED",
    });

    // ...Tab B's stale write must fail, not silently overwrite.
    await expect(
      harness.repo.saveUnit(
        {
          caseId: created.id,
          newFacts: [],
          updatedFacts: [],
          newContradictions: [],
          updatedContradictions: [],
          newEvents: [],
          nextStatus: "CLOSED",
        },
        tabB.case.version,
      ),
    ).rejects.toBeInstanceOf(ConcurrentCaseUpdateDbError);
  });
});

describe("idempotency of critical operations", () => {
  it("createCaseIdempotent returns the stored case for repeated keys", async () => {
    const service = new CaseService(harness.repo, "test-engine-1");
    const c1 = await service.createCaseIdempotent("idem-2", OWNERS);
    const c2 = await service.createCaseIdempotent("idem-2", OWNERS);
    expect(c1.id).toBe(c2.id);
  });
});

describe("state persistence across reload", () => {
  it("case status transitions persist and reload correctly", async () => {
    const service = new CaseService(harness.repo, "test-engine-1");
    const created = await service.createCase(OWNERS);
    await service.addFact(created.id, {
      key: "b.field" as never,
      value: { type: "boolean", value: true },
      provenance: "USER_PROVIDED",
    });
    const closed = await service.applyTransition(created.id, "CLOSE_CASE");
    expect(closed.status).toBe("CLOSED");

    const reloaded = await service.loadCase(created.id);
    expect(reloaded.case.status).toBe("CLOSED");
    expect(reloaded.case.version).toBe(closed.version);
  });
});
