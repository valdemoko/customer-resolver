/**
 * Company contacts: every entry must be attributable, and matching must never
 * hand a person the wrong company's phone number.
 *
 * The report prints these channels, so a wrong match would send somebody to
 * complain to a different airline. The matcher is therefore tested for the
 * false positives that actually happen ("Iberia Express" containing "Iberia")
 * as well as for the normal cases.
 */
import { describe, expect, it } from "vitest";

import {
  COMPANY_CONTACTS,
  COMPANY_CONTACT_GUIDANCE,
  findCompanyContact,
  normalizeCompanyName,
} from "@core/result/company-contacts";

describe("company contacts directory", () => {
  it("attributes every entry to an official page and a verification date", () => {
    expect(COMPANY_CONTACTS.length).toBeGreaterThan(0);

    for (const record of COMPANY_CONTACTS) {
      expect(record.sourceUrl, record.id).toMatch(/^https:\/\//);
      expect(record.verifiedAt, record.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.channels.length, record.id).toBeGreaterThan(0);
      expect(record.aliases.length, record.id).toBeGreaterThan(0);

      for (const channel of record.channels) {
        // A channel either carries a value (a phone) or a link: never a bare
        // label that promises a contact it cannot deliver.
        expect(channel.value ?? channel.url, `${record.id}/${channel.label}`).toBeTruthy();
        if (channel.url) expect(channel.url).toMatch(/^https:\/\//);
      }
    }
  });

  it("keeps the guidance actionable and free of invented data", () => {
    expect(COMPANY_CONTACT_GUIDANCE.length).toBeGreaterThanOrEqual(4);
    for (const tip of COMPANY_CONTACT_GUIDANCE) {
      // No phone numbers, no mailboxes: the guidance teaches where to look.
      expect(tip).not.toMatch(/\d{3}\s?\d{3}\s?\d{3}/);
      expect(tip).not.toMatch(/@/);
    }
  });
});

describe("normalizeCompanyName", () => {
  it("ignores case, accents, punctuation and legal forms", () => {
    expect(normalizeCompanyName("Vueling Airlines, S.A.")).toBe("vueling");
    expect(normalizeCompanyName("AIR EUROPA LÍNEAS AÉREAS S.A.U.")).toBe("air europa");
    expect(normalizeCompanyName("  Iberia  ")).toBe("iberia");
  });
});

describe("findCompanyContact", () => {
  it("finds the company from the many ways people write it", () => {
    expect(findCompanyContact("Vueling")?.id).toBe("vueling");
    expect(findCompanyContact("vueling airlines sa")?.id).toBe("vueling");
    expect(findCompanyContact("Ryanair")?.id).toBe("ryanair");
    expect(findCompanyContact("Air Europa Líneas Aéreas")?.id).toBe("air-europa");
    expect(findCompanyContact("easyJet")?.id).toBe("easyjet");
  });

  it("never resolves a different company that contains an alias", () => {
    // Iberia Express is a different airline: its record does not exist here, so
    // the honest answer is null, not Iberia's phone number.
    expect(findCompanyContact("Iberia Express")).toBeNull();
  });

  it("returns null instead of guessing", () => {
    expect(findCompanyContact("Tienda de la esquina")).toBeNull();
    expect(findCompanyContact("")).toBeNull();
    expect(findCompanyContact("ab")).toBeNull();
    expect(findCompanyContact(null)).toBeNull();
    expect(findCompanyContact(undefined)).toBeNull();
  });
});
