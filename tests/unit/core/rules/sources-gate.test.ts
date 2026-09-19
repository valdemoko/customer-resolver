import { describe, expect, it } from "vitest";

import {
  assertPublishedRuleImmutable,
  canPublishRule,
  publishRule,
  transitionSource,
  verifySource,
} from "@core/rules/sources";
import { createRule, nextRuleVersion, transitionRuleStatus } from "@core/rules/factory";
import { DomainError } from "@lib/errors";
import type { Rule } from "@core/rules/types";
import type { Source } from "@core/rules/sources";

// TEST FIXTURES — NOT REAL LEGAL SOURCES
function source(overrides?: Partial<Source>): Source {
  return {
    id: "src-1" as Source["id"],
    externalId: "TEST-SRC-1",
    title: "TEST FIXTURE SOURCE — NOT LEGAL DATA",
    publisher: "Test Publisher",
    url: "https://example.com/official-source",
    jurisdiction: { country: "XX" },
    type: "LAW",
    retrievedAt: "2026-09-19T10:00:00.000Z",
    versionIdentifier: "test-v1",
    status: "DRAFT",
    ...overrides,
  };
}

function rule(overrides?: Partial<Rule>): Rule {
  return createRule({
    key: "test.rule",
    version: 1 as Rule["version"],
    title: "TEST FIXTURE RULE",
    scope: { level: "COUNTRY_WIDE", country: "XX" },
    root: {
      kind: "FACT_EXISTS",
      key: "a.b" as Rule["root"] extends never ? never : never as never,
    } as never,
    sourceIds: ["src-1"],
    ...overrides,
  });
}

function publishedChain(): { rule: Rule; sources: Map<string, Source> } {
  const src = verifySource(transitionSource(source(), "REVIEWED"), {
    verifiedAt: "2026-09-19T10:00:00.000Z",
    verifiedBy: "reviewer-1",
    verificationNote: "TEST verification",
  });
  let r = rule();
  r = transitionRuleStatus(r, "REVIEWED");
  r = transitionRuleStatus(r, "VERIFIED");
  return { rule: publishRule(r, new Map([["src-1", src]])), sources: new Map([["src-1", src]]) };
}

describe("source lifecycle & verification", () => {
  it("DRAFT → REVIEWED → VERIFIED → PUBLISHED flow works", () => {
    let s = source();
    s = transitionSource(s, "REVIEWED");
    s = verifySource(s, {
      verifiedAt: "2026-09-19T10:00:00.000Z",
      verifiedBy: "rev-1",
      verificationNote: "ok",
    });
    expect(s.status).toBe("VERIFIED");
    expect(s.verification?.verifiedBy).toBe("rev-1");
    s = transitionSource(s, "PUBLISHED");
    expect(s.status).toBe("PUBLISHED");
  });

  it("rejects invalid transitions and verification without human record", () => {
    expect(() => transitionSource(source(), "VERIFIED")).toThrow(DomainError); // DRAFT → VERIFIED
    const reviewed = transitionSource(source(), "REVIEWED");
    expect(() =>
      verifySource(reviewed, { verifiedAt: "x", verifiedBy: "", verificationNote: " " }),
    ).toThrow(DomainError);
  });

  it("deprecated is terminal", () => {
    const s = transitionSource(source(), "DEPRECATED");
    expect(() => transitionSource(s, "REVIEWED")).toThrow(DomainError);
  });
});

describe("publication gate (adversarial F, G, M)", () => {
  it("blocks rule with no sources", () => {
    const r = rule({ sourceIds: [] });
    const gate = canPublishRule(r, new Map());
    expect(gate.ok).toBe(false);
    expect(gate.problems.join()).toContain("no sources");
  });

  it("blocks rule referencing a nonexistent source (F)", () => {
    const r = transitionRuleStatus(rule(), "REVIEWED");
    const gate = canPublishRule(r, new Map());
    expect(gate.ok).toBe(false);
    expect(gate.problems.join()).toContain("not found");
  });

  it("blocks unverified source (G)", () => {
    const r = transitionRuleStatus(rule(), "REVIEWED");
    const gate = canPublishRule(r, new Map([["src-1", source()]])); // DRAFT source
    expect(gate.ok).toBe(false);
    expect(gate.problems.join()).toContain("not VERIFIED");
  });

  it("blocks source without human verification record", () => {
    const r = transitionRuleStatus(rule(), "REVIEWED");
    const unverified = { ...transitionSource(source(), "REVIEWED"), status: "VERIFIED" as const };
    const gate = canPublishRule(r, new Map([["src-1", unverified]]));
    expect(gate.ok).toBe(false);
    expect(gate.problems.join()).toContain("human verification");
  });

  it("attempting publish without verification throws with explicit problems (M)", () => {
    const r = transitionRuleStatus(transitionRuleStatus(rule(), "REVIEWED"), "VERIFIED");
    expect(() => publishRule(r, new Map([["src-1", source()]]))).toThrow(
      /Publication gate blocked/,
    );
  });

  it("publishes cleanly with verified source and full lifecycle", () => {
    const { rule: published } = publishedChain();
    expect(published.status).toBe("PUBLISHED");
  });
});

describe("rule versioning & immutability (adversarial H, L)", () => {
  it("published rule definition is immutable — changing it throws (H)", () => {
    const { rule: published, sources: map } = publishedChain();
    const tampered: Rule = { ...published, title: "MODIFIED TITLE" };
    expect(() => assertPublishedRuleImmutable(published, tampered)).toThrow(/immutable/);
    void map;
  });

  it("changes create a new DRAFT version instead of mutating (H)", () => {
    const { rule: published } = publishedChain();
    const v2 = nextRuleVersion(published, { title: "TEST FIXTURE RULE v2" });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("DRAFT");
    expect(published.version).toBe(1);
    expect(published.title).not.toBe(v2.title);
  });

  it("rule status flow is validated (no DRAFT → PUBLISHED shortcut)", () => {
    const r = rule();
    expect(() => transitionRuleStatus(r, "PUBLISHED")).toThrow(DomainError);
    expect(() => transitionRuleStatus(r, "VERIFIED")).toThrow(DomainError);
  });
});
