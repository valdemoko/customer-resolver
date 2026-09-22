/**
 * Which company the case is against.
 *
 * The name must come from an answered fact only. A wrong company here means the
 * report shows the wrong customer service, so the tests cover the module keys,
 * the "no company yet" case and superseded facts.
 */
import { describe, expect, it } from "vitest";

import { buildCaseCompany, detectCompanyName } from "@core/result/company";
import type { Fact, FactKey } from "@core/types";

function fact(key: string, value: unknown, overrides: Partial<Fact> = {}): Fact {
  return {
    id: `f-${key}`,
    caseId: "case-1",
    key: key as FactKey,
    value,
    status: "CONFIRMED",
    confidence: "USER",
    provenance: "USER_PROVIDED",
    evidenceRefs: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as unknown as Fact;
}

describe("detectCompanyName", () => {
  it("reads the company from the module's own fact", () => {
    expect(detectCompanyName([fact("airline.name", { type: "string", value: "Vueling" })])).toEqual({
      name: "Vueling",
      factKey: "airline.name",
    });
    expect(detectCompanyName([fact("seller.name", { type: "string", value: "MediaMarkt" })])).toEqual(
      { name: "MediaMarkt", factKey: "seller.name" },
    );
    expect(
      detectCompanyName([fact("provider.name", { type: "string", value: "Iberdrola" })]),
    ).toEqual({ name: "Iberdrola", factKey: "provider.name" });
  });

  it("returns null when the company is still unknown", () => {
    expect(detectCompanyName([])).toBeNull();
    expect(detectCompanyName([fact("charge.amount", { type: "money", value: { amountMinor: 1, currency: "EUR" } })])).toBeNull();
    // An empty or non-text answer is not a company name.
    expect(detectCompanyName([fact("seller.name", { type: "string", value: "   " })])).toBeNull();
    expect(detectCompanyName([fact("seller.name", { type: "boolean", value: true })])).toBeNull();
  });

  it("ignores a superseded answer", () => {
    expect(
      detectCompanyName([
        fact("seller.name", { type: "string", value: "Tienda vieja" }, { status: "SUPERSEDED" }),
      ]),
    ).toBeNull();
  });
});

describe("buildCaseCompany", () => {
  it("attaches the verified channels of a known company", () => {
    const company = buildCaseCompany([fact("airline.name", { type: "string", value: "Ryanair" })]);

    expect(company?.name).toBe("Ryanair");
    expect(company?.known).toBe(true);
    expect(company?.sector).toBe("Aerolínea");
    expect(company?.sourceUrl).toMatch(/^https:\/\//);
    expect(company?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(company?.channels.some((channel) => channel.kind === "phone")).toBe(true);
  });

  it("says it does not know the channels rather than inventing them", () => {
    const company = buildCaseCompany([
      fact("seller.name", { type: "string", value: "Ferretería del barrio" }),
    ]);

    expect(company?.name).toBe("Ferretería del barrio");
    expect(company?.known).toBe(false);
    expect(company?.channels).toEqual([]);
    expect(company?.sourceUrl).toBeUndefined();
  });

  it("has no company section at all when nothing was answered", () => {
    expect(buildCaseCompany([])).toBeNull();
  });
});
