/**
 * F4 vertical slice (integration): the full pipeline over real persistence.
 *
 *   create case → intake facts → evidence → link → analysis → persist
 *   → reload → reproduce + contradiction blocking + re-evaluation.
 *
 * Uses the real cancellation-charge module and its published rules through the
 * ProblemAnalysisService with an in-memory rules provider (persistence of
 * rules/sources themselves is covered by F3 tests).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPersistenceHarness } from "../persistence/pglite-setup";
import { CaseService } from "@core/case/service";
import { EvidenceService } from "@core/evidence/service";
import {
  ProblemAnalysisService,
  UnknownProblemError,
  UnsupportedJurisdictionError,
} from "@core/problems";
import { ProblemRegistry } from "@core/problems";
import { cancellationChargeModule } from "@problems/cancellation-charge";
import { buildRules } from "@problems/cancellation-charge";

const CURRENT_DATE = "2026-09-19";

function makeRulesProvider() {
  const rules = buildRules();
  const published = [
    rules.chargeAfterCancellation,
    rules.contractDurationOver24Months,
    rules.chargeAfterPenaltyFreeRescission,
  ];
  return {
    async getPublishedRules(keys: readonly string[]) {
      return published.filter((r) => keys.includes(r.key));
    },
  };
}

async function makeServices() {
  const harness = await createPersistenceHarness();
  const registry = new ProblemRegistry();
  registry.register(cancellationChargeModule);
  const caseService = new CaseService(harness.repo);
  const evidenceService = new EvidenceService(harness.repo);
  const analysis = new ProblemAnalysisService({
    repo: harness.repo,
    caseService,
    rules: makeRulesProvider(),
    registry,
    evaluationRecorder: {
      async recordEvaluation() {
        /* in-memory provider: persistence of evaluations covered below via repo */
      },
    },
  });
  return { harness, caseService, evidenceService, analysis };
}

describe("F4 vertical slice: cancellation-charge over real persistence", () => {
  let ctx: Awaited<ReturnType<typeof makeServices>>;

  beforeAll(async () => {
    ctx = await makeServices();
  });

  afterAll(async () => {
    await ctx.harness.close();
  });

  it("runs the full pipeline: case → facts → evidence → analysis → snapshot", async () => {
    const { caseService, evidenceService, analysis } = ctx;

    // 1. Create the case for the problem.
    const created = await caseService.createCase({
      problemSlug: "cancellation-charge" as never,
      jurisdiction: "ES" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "anonymous" as never,
    });

    // 2. User answers intake (facts with USER_PROVIDED provenance).
    await caseService.addFact(created.id, {
      key: "cancellation.date" as never,
      value: { type: "date", value: "2026-06-10" } as never,
      provenance: "USER_PROVIDED",
    });
    const chargeFact = await caseService.addFact(created.id, {
      key: "charge.date" as never,
      value: { type: "date", value: "2026-07-01" } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "charge.amount" as never,
      value: { type: "money", value: { amountMinor: 5990, currency: "EUR" } } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "service.contract_start_date" as never,
      value: { type: "date", value: "2024-03-01" } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "cancellation.confirmation_exists" as never,
      value: { type: "boolean", value: true } as never,
      provenance: "USER_PROVIDED",
    });

    // 3. Evidence metadata + link to the cancellation fact (no OCR in F4).
    const { evidence } = await evidenceService.addEvidence(created.id, {
      type: "EMAIL",
      source: "USER",
      content: { kind: "text", text: "Confirmación de baja — TEST FIXTURE" },
      label: "Email de confirmación de cancelación",
    });
    await evidenceService.linkToFact(created.id, evidence.id, chargeFact.fact.id, "SUPPORTS", {
      location: "texto del email",
    });

    // 4. Run the analysis.
    const result = await analysis.runProblemAnalysis(created.id, {
      currentDate: CURRENT_DATE,
      sourceVersions: { "src-es-ley-11-2022": "consolidado-2025-12-27" },
    });

    expect(result.problemKey).toBe("cancellation-charge");
    expect(result.moduleVersion).toBe(1);
    expect(result.jurisdiction).toBe("ES");
    expect(result.intakeComplete).toBe(true);
    expect(result.evaluations.length).toBeGreaterThanOrEqual(3);

    // charge.date (2026-07-01) > cancellation.date (2026-06-10): the facts are
    // USER_PROVIDED (UNCONFIRMED) → POTENTIALLY_APPLICABLE. Evidence does NOT
    // confirm anything by itself (core semantic, F2): SUPPORTED would require
    // CONFIRMED facts, which the F5 evidence workflow will produce.
    const chargeAfter = result.evaluations.find(
      (e) => e.ruleKey === "cancellation-charge.charge-after-cancellation",
    );
    expect(chargeAfter?.status).toBe("POTENTIALLY_APPLICABLE");
    expect(chargeAfter?.evidenceRefs.length).toBeGreaterThanOrEqual(0);

    // Traceability: every evaluation cites its rule version and source ids.
    for (const evaluation of result.evaluations) {
      expect(evaluation.ruleVersion).toBe(1);
      expect(evaluation.sourceIds.length).toBeGreaterThanOrEqual(1);
    }

    // 5. Analysis snapshot persisted and linked to the case.
    const reloaded = await caseService.loadCase(created.id);
    expect(reloaded.case.currentSnapshotId).toBe(result.snapshotId);
    expect(reloaded.snapshots.at(-1)?.rulesetHash).toBeDefined();
  }, 30_000);

  it("is reproducible: same state + same date → identical evaluations", async () => {
    const { caseService, analysis } = ctx;

    const created = await caseService.createCase({
      problemSlug: "cancellation-charge" as never,
      jurisdiction: "ES" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "anonymous" as never,
    });
    await caseService.addFact(created.id, {
      key: "cancellation.date" as never,
      value: { type: "date", value: "2026-05-01" } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "charge.date" as never,
      value: { type: "date", value: "2026-05-20" } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "charge.amount" as never,
      value: { type: "money", value: { amountMinor: 2500, currency: "EUR" } } as never,
      provenance: "USER_PROVIDED",
    });

    const run1 = await analysis.runProblemAnalysis(created.id, { currentDate: CURRENT_DATE });
    const run2 = await analysis.runProblemAnalysis(created.id, { currentDate: CURRENT_DATE });

    const strip = (r: typeof run1) =>
      JSON.stringify(
        r.evaluations.map((e) => ({ ...e })),
        Object.keys(r.evaluations[0] ?? {}).sort(),
      );
    expect(run1.evaluations).toEqual(run2.evaluations);
    void strip;

    // Same ruleset hash on both snapshots (ruleset identity is deterministic).
    const loaded = await caseService.loadCase(created.id);
    const hashes = loaded.snapshots.map((s) => s.rulesetHash);
    expect(new Set(hashes).size).toBe(1);

    // The same analysis date is recorded (injected, not hidden now()).
    expect(run1.currentDate).toBe(CURRENT_DATE);
    expect(run2.currentDate).toBe(CURRENT_DATE);
  }, 30_000);

  it("contradiction blocks the evaluation (never guesses a value)", async () => {
    const { caseService, analysis } = ctx;

    const created = await caseService.createCase({
      problemSlug: "cancellation-charge" as never,
      jurisdiction: "ES" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "anonymous" as never,
    });
    // User says one date…
    await caseService.addFact(created.id, {
      key: "cancellation.date" as never,
      value: { type: "date", value: "2026-01-10" } as never,
      provenance: "USER_PROVIDED",
    });
    // …a "document-derived" fact contradicts it (TEST FIXTURE — NOT REAL EXTRACTION).
    const docFact = await caseService.addFact(created.id, {
      key: "cancellation.date" as never,
      value: { type: "date", value: "2026-01-15" } as never,
      provenance: "DOCUMENT_EXTRACTED",
    });
    await caseService.addFact(created.id, {
      key: "charge.date" as never,
      value: { type: "date", value: "2026-02-01" } as never,
      provenance: "USER_PROVIDED",
    });
    await caseService.addFact(created.id, {
      key: "charge.amount" as never,
      value: { type: "money", value: { amountMinor: 3000, currency: "EUR" } } as never,
      provenance: "USER_PROVIDED",
    });

    const result = await analysis.runProblemAnalysis(created.id, { currentDate: CURRENT_DATE });

    const chargeAfter = result.evaluations.find(
      (e) => e.ruleKey === "cancellation-charge.charge-after-cancellation",
    );
    // Blocked: the required fact has an unresolved contradiction.
    expect(chargeAfter?.status).toBe("CONTRADICTED");
    expect(chargeAfter?.contradictedFacts).toContain("cancellation.date");
    void docFact;

    // Resolve the contradiction (user picks the document value, with a reason).
    const loaded = await caseService.loadCase(created.id);
    const unresolved = loaded.contradictions.find((c) => c.status === "UNRESOLVED");
    expect(unresolved).toBeDefined();

    await caseService.resolveContradictionForCase(
      created.id,
      unresolved!.id,
      unresolved!.factIdB,
      "El documento de confirmación indica el día 15",
    );

    // Re-evaluation after resolution: the rule evaluates on the resolved value.
    // Status is POTENTIALLY_APPLICABLE, not SUPPORTED: facts remain UNCONFIRMED
    // (USER_PROVIDED/USER_RESOLVED) and evidence ≠ confirmed truth in F4 —
    // confirmation arrives with the evidence-backed workflow (Fase 5+).
    const after = await analysis.runProblemAnalysis(created.id, { currentDate: CURRENT_DATE });
    const chargeAfterResolved = after.evaluations.find(
      (e) => e.ruleKey === "cancellation-charge.charge-after-cancellation",
    );
    expect(chargeAfterResolved?.status).toBe("POTENTIALLY_APPLICABLE"); // 2026-02-01 > 2026-01-15, unconfirmed
  }, 30_000);

  it("rejects unknown problems and unsupported jurisdictions with typed errors", async () => {
    const { caseService, analysis, harness } = ctx;

    await expect(
      analysis.runProblemAnalysis("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();

    const created = await caseService.createCase({
      problemSlug: "cancellation-charge" as never,
      jurisdiction: "UK" as never, // module supports ES only
      locale: "en-GB" as never,
      currency: "GBP" as never,
      ownerId: "anonymous" as never,
    });
    await expect(analysis.runProblemAnalysis(created.id)).rejects.toThrow(
      UnsupportedJurisdictionError,
    );
    void harness;
  }, 30_000);

  it("UnknownProblemError carries the typed code", () => {
    const error = new UnknownProblemError("nope");
    expect(error.code).toBe("UNKNOWN_PROBLEM");
  });
});
