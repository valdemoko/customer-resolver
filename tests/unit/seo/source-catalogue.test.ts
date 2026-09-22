/**
 * Public source catalogue tests.
 *
 * Guards the audit findings of 2026-09-22:
 * - the /fuentes page lists what the modules actually use, so it cannot drift;
 * - Art. 102.2 TRLGDCU is attributed to the TRLGDCU, not to the Ley 11/2022;
 * - the Reglamento 261/2004 section follows the published Spanish text
 *   ("dos semanas"), and no mixed-language fragment survives.
 */
import { describe, expect, it } from "vitest";

import { buildPublicSourceIndex, formatConsultedAt, getSourceGroups } from "@/lib/source-catalogue";

const OFFICIAL_HOSTS = ["www.boe.es", "boe.es", "eur-lex.europa.eu"];

describe("public source catalogue", () => {
  it("lists sources for every problem module in the catalogue", () => {
    const groups = getSourceGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.sources.length, `module ${group.key} has no sources`).toBeGreaterThan(0);
    }
  });

  it("does not repeat a source inside the same module", () => {
    for (const group of getSourceGroups()) {
      const ids = group.sources.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps traceability metadata on every source", () => {
    for (const source of buildPublicSourceIndex().values()) {
      expect(source.externalId.length, source.id).toBeGreaterThan(0);
      expect(source.versionIdentifier.length, source.id).toBeGreaterThan(0);
      expect(source.retrievedAt, source.id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(source.url, source.id).toMatch(/^https:\/\//);
    }
  });

  it("links only to official publications", () => {
    for (const source of buildPublicSourceIndex().values()) {
      const host = new URL(source.url).host;
      expect(OFFICIAL_HOSTS, `${source.id} → ${host}`).toContain(host);
    }
  });

  it("records the article text the rules rely on", () => {
    for (const group of getSourceGroups()) {
      for (const source of group.sources) {
        expect(source.relevantSection, source.id).toBeTruthy();
      }
    }
  });

  it("attributes art. 102.2 TRLGDCU to the TRLGDCU, not to the Ley 11/2022", () => {
    const ley = [...buildPublicSourceIndex().values()].find((s) => s.title.includes("Ley 11/2022"));
    expect(ley).toBeDefined();
    expect(ley!.relevantSection).not.toContain("102.2");
    expect(ley!.relevantSection).toContain("Art. 67.7");

    const trlgdcu102 = [...buildPublicSourceIndex().values()].find((s) =>
      s.externalId.includes("art102"),
    );
    expect(trlgdcu102).toBeDefined();
    expect(trlgdcu102!.relevantSection).toContain("Art. 102.2");
  });

  it("quotes the published Spanish text of Regulation 261/2004", () => {
    const regulation = [...buildPublicSourceIndex().values()].find((s) =>
      s.externalId.includes("32004R0261"),
    );
    expect(regulation).toBeDefined();
    const section = regulation!.relevantSection ?? "";
    // The old fragment was a mixed-language paraphrase of the English text.
    expect(section).not.toContain("en accordance");
    expect(section).not.toContain("catorce días");
    expect(section).toContain("dos semanas");
    expect(section).toContain("siete días");
    // Amounts come from art. 7.1 as published.
    expect(section).toContain("250 euros para vuelos de hasta 1500 kilómetros");
    expect(section).toContain("600 euros");
  });

  it("does not cite art. 8.3 as the basis for reimbursing out-of-pocket costs", () => {
    const regulation = [...buildPublicSourceIndex().values()].find((s) =>
      s.externalId.includes("32004R0261"),
    );
    const section = regulation!.relevantSection ?? "";
    expect(section).not.toMatch(/Art\. 8\.3: si la aerolínea/);
    expect(section).toContain("Art. 9.1");
  });

  it("formats the consultation date for the public page", () => {
    expect(formatConsultedAt("2026-09-22T12:00:00.000Z")).toBe("22/09/2026");
    expect(formatConsultedAt("not-a-date")).toBe("not-a-date");
  });
});
