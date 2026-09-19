/**
 * Rules & Sources persistence tests (Fase 3) — real SQL via PGlite.
 * Rules are stored as validated declarative data (never executed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRule, nextRuleVersion, transitionRuleStatus } from "@core/rules/factory";
import { transitionSource, verifySource, type Source } from "@core/rules/sources";
import { evaluateRule } from "@core/rules/evaluator";
import { isoDate } from "@core/shared/temporal";
import type { Rule, RuleEvaluationContext } from "@core/rules/types";
import { RulesRepository } from "@server/db/repositories/rules-repository";
import { createPersistenceHarness, type PersistenceHarness } from "./pglite-setup";

let harness: PersistenceHarness;
let repo: RulesRepository;

beforeAll(async () => {
  harness = await createPersistenceHarness();
  repo = new RulesRepository(harness.db as never);
});
afterAll(async () => {
  await harness.close();
});

// TEST FIXTURES — NOT REAL LEGAL RULES OR SOURCES
let srcSeq = 0;
const testSource = (): Source => {
  srcSeq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(srcSeq).padStart(12, "0")}` as Source["id"],
    externalId: `TEST-SRC-${srcSeq}`,
    title: "TEST FIXTURE SOURCE — NOT LEGAL DATA",
    publisher: "Test Publisher",
    url: "https://example.com/source",
    jurisdiction: { country: "XX" },
    type: "LAW",
    retrievedAt: "2026-09-19T10:00:00.000Z",
    versionIdentifier: "test-v1",
    status: "DRAFT",
  } as Source;
};

let ruleSeq = 0;
const makeRule = (): Rule => {
  ruleSeq += 1;
  return createRule({
    key: `test.persisted-rule-${ruleSeq}`,
    version: 1 as Rule["version"],
    title: "TEST FIXTURE RULE",
    scope: { level: "COUNTRY_WIDE", country: "XX" },
    root: { kind: "DATE_WITHIN_DAYS", key: "a.b" as never, withinDays: 30 },
    sourceIds: ["TEST-SRC-1"],
  });
};

describe("rule persistence & versioning", () => {
  it("saves and reloads a rule with definition intact (JSON round-trip)", async () => {
    const rule = makeRule();
    await repo.saveRule(rule);

    const loaded = await repo.getRule(rule.key, 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.root).toEqual(rule.root);
    expect(loaded!.scope).toEqual(rule.scope);
    expect(loaded!.status).toBe("DRAFT");
  });

  it("two versions of the same key coexist; each is reproducible", async () => {
    const v1 = makeRule();
    await repo.saveRule(v1);
    const v2 = nextRuleVersion(v1, { title: "TEST FIXTURE RULE v2 — changed window" });
    await repo.saveRule(v2);

    const loadedV1 = await repo.getRule(v1.key, 1);
    const loadedV2 = await repo.getRule(v1.key, 2);
    expect(loadedV1!.version).toBe(1);
    expect(loadedV2!.version).toBe(2);
    expect(loadedV1!.title).not.toBe(loadedV2!.title);
  });

  it("status updates persist without changing the definition", async () => {
    const rule = transitionRuleStatus(makeRule(), "REVIEWED");
    await repo.saveRule(rule);
    const loaded = await repo.getRule(rule.key, 1);
    expect(loaded!.status).toBe("REVIEWED");
    expect(loaded!.title).toBe("TEST FIXTURE RULE"); // definition untouched
  });
});

describe("source persistence & verification record", () => {
  it("saves source, verifies with human record, persists both", async () => {
    const src = verifySource(transitionSource(testSource(), "REVIEWED"), {
      verifiedAt: "2026-09-19T11:00:00.000Z",
      verifiedBy: "reviewer-1",
      verificationNote: "TEST: URL y contenido revisados",
    });
    await repo.saveSource(src);

    const loaded = await repo.getSource(src.id);
    expect(loaded!.status).toBe("VERIFIED");
    expect(loaded!.verification?.verifiedBy).toBe("reviewer-1");
    expect(loaded!.versionIdentifier).toBe("test-v1");
  });

  it("deprecates a source without deleting it (history kept)", async () => {
    const src = testSource(); // unique externalId per call
    const verified = verifySource(transitionSource(src, "REVIEWED"), {
      verifiedAt: "2026-09-19T11:00:00.000Z",
      verifiedBy: "reviewer-1",
      verificationNote: "TEST",
    });
    const deprecated = transitionSource(verified, "PUBLISHED");
    const final = transitionSource(deprecated, "DEPRECATED");
    await repo.saveSource(final);

    const loaded = await repo.getSource(final.id);
    expect(loaded!.status).toBe("DEPRECATED"); // still there, just deprecated
  });
});

describe("rule ↔ source traceability", () => {
  it("links persist and are queryable by rule version", async () => {
    const rule = makeRule();
    const src = testSource();
    await repo.saveRule(rule);
    await repo.saveSource(src);

    await repo.linkRuleToSource({
      ruleId: rule.id,
      sourceId: src.id,
      ruleKey: rule.key,
      ruleVersion: rule.version,
      claim: "TEST claim: the rule condition derives from this source section",
    });

    const links = await repo.listRuleSources(rule.key, rule.version);
    expect(links).toHaveLength(1);
    expect(links[0]!.claim).toContain("TEST claim");
  });
});

describe("persisted evaluations & ruleset hash", () => {
  it("records an evaluation append-only and lists it per case", async () => {
    // Create a real case for the FK
    const { CaseService } = await import("@core/case/service");
    const caseService = new CaseService(harness.repo, "test-engine-1");
    const created = await caseService.createCase({
      problemSlug: "test-problem" as never,
      jurisdiction: "XX" as never,
      locale: "es-ES" as never,
      currency: "EUR" as never,
      ownerId: "owner-test" as never,
    });

    const rule = makeRule();
    const context: RuleEvaluationContext = {
      facts: [
        {
          key: "a.b" as never,
          status: "CONFIRMED",
          value: isoDate("2026-09-10"),
          evidenceRefs: [],
        },
      ],
      contradictedKeys: new Set(),
      jurisdiction: { country: "XX" },
      currentDate: isoDate("2026-09-19"),
    };
    const evaluation = evaluateRule(rule, context);

    await repo.recordEvaluation({
      caseId: created.id,
      evaluation,
      rulesetHash: "test-hash",
      evaluatedAt: "2026-09-19T12:00:00.000Z",
    });

    const list = await repo.listEvaluationsForCase(created.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe(evaluation.status);
    expect((list[0]!.evaluation as typeof evaluation).ruleVersion).toBe(1);
    // append-only: recording again adds, never overwrites
    await repo.recordEvaluation({
      caseId: created.id,
      evaluation,
      evaluatedAt: "2026-09-19T12:01:00.000Z",
    });
    expect(await repo.listEvaluationsForCase(created.id)).toHaveLength(2);
  });

  it("ruleset hash is deterministic and reacts to rule changes", () => {
    const r1 = makeRule();
    const v2 = nextRuleVersion(r1, {});
    const h1 = repo.rulesetHash([r1]);
    expect(repo.rulesetHash([r1])).toBe(h1); // deterministic
    expect(repo.rulesetHash([v2])).not.toBe(h1); // version change → new hash
    expect(repo.rulesetHash([r1, v2])).not.toBe(h1); // different ruleset → new hash
  });
});
