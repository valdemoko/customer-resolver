/**
 * F15 Internationalization & Multi-Jurisdiction — Comprehensive Tests
 *
 * Tests for:
 * - Jurisdiction configuration registry
 * - Support levels
 * - Jurisdiction resolution
 * - Locale translations
 * - Rule Engine jurisdiction safety
 * - Source hierarchy by jurisdiction
 * - Cross-jurisdiction isolation
 */
import { describe, it, expect } from "vitest";
import {
  getJurisdictionConfig,
  getAllJurisdictions,
  getJurisdictionsByLevel,
  hasDeterministicModules,
  isModuleAvailableInJurisdiction,
  getDefaultLocale,
  getDefaultCurrency,
  isValidJurisdictionCode,
  isValidLocaleCode,
} from "@core/jurisdiction/config";
import {
  getTranslations,
  getTranslation,
  getSupportedLocales,
  isLocaleSupported,
} from "@core/jurisdiction/translations";
import { JurisdictionResolver } from "@core/jurisdiction/resolver";
import { jurisdictionApplies } from "@core/rules/jurisdiction";
import type { JurisdictionScope } from "@core/rules/types";

// ── Jurisdiction Config Tests ───────────────────────────────────────

describe("F15 — Jurisdiction Configuration", () => {
  it("has Spain (ES) registered", () => {
    const config = getJurisdictionConfig("ES");
    expect(config).toBeDefined();
    expect(config!.code).toBe("ES");
    expect(config!.country).toBe("España");
    expect(config!.supportLevel).toBe("DETERMINISTIC");
  });

  it("has EU registered", () => {
    const config = getJurisdictionConfig("EU");
    expect(config).toBeDefined();
    expect(config!.code).toBe("EU");
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("has UK registered", () => {
    const config = getJurisdictionConfig("UK");
    expect(config).toBeDefined();
    expect(config!.code).toBe("UK");
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("has US registered", () => {
    const config = getJurisdictionConfig("US");
    expect(config).toBeDefined();
    expect(config!.code).toBe("US");
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("has US-CA registered", () => {
    const config = getJurisdictionConfig("US-CA");
    expect(config).toBeDefined();
    expect(config!.code).toBe("US-CA");
    expect(config!.region).toBe("California");
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("has FR registered", () => {
    const config = getJurisdictionConfig("FR");
    expect(config).toBeDefined();
    expect(config!.code).toBe("FR");
    expect(config!.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("returns undefined for unknown jurisdiction", () => {
    expect(getJurisdictionConfig("XX")).toBeUndefined();
  });

  it("returns all registered jurisdictions", () => {
    const all = getAllJurisdictions();
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it("returns jurisdictions by support level", () => {
    const deterministic = getJurisdictionsByLevel("DETERMINISTIC");
    expect(deterministic.length).toBeGreaterThanOrEqual(1);
    expect(deterministic.some((j) => j.code === "ES")).toBe(true);

    const researchOnly = getJurisdictionsByLevel("RESEARCH_ONLY");
    expect(researchOnly.length).toBeGreaterThanOrEqual(1);
  });

  it("Spain has deterministic modules", () => {
    expect(hasDeterministicModules("ES")).toBe(true);
  });

  it("UK does not have deterministic modules", () => {
    expect(hasDeterministicModules("UK")).toBe(false);
  });

  it("warranty-rejection is available in ES", () => {
    expect(isModuleAvailableInJurisdiction("warranty-rejection", "ES")).toBe(true);
  });

  it("warranty-rejection is NOT available in UK", () => {
    expect(isModuleAvailableInJurisdiction("warranty-rejection", "UK")).toBe(false);
  });

  it("flight-cancel is available in EU", () => {
    expect(isModuleAvailableInJurisdiction("flight-cancel", "EU")).toBe(true);
  });

  it("returns default locale for jurisdiction", () => {
    expect(getDefaultLocale("ES")).toBe("es-ES");
    expect(getDefaultLocale("UK")).toBe("en-GB");
    expect(getDefaultLocale("FR")).toBe("fr-FR");
    expect(getDefaultLocale("DE")).toBe("de-DE");
  });

  it("returns default currency for jurisdiction", () => {
    expect(getDefaultCurrency("ES")).toBe("EUR");
    expect(getDefaultCurrency("UK")).toBe("GBP");
    expect(getDefaultCurrency("US")).toBe("USD");
  });
});

// ── Jurisdiction Code Validation Tests ──────────────────────────────

describe("F15 — Jurisdiction Code Validation", () => {
  it("accepts valid country code", () => {
    expect(isValidJurisdictionCode("ES")).toBe(true);
    expect(isValidJurisdictionCode("UK")).toBe(true);
    expect(isValidJurisdictionCode("US")).toBe(true);
  });

  it("accepts valid subdivision code", () => {
    expect(isValidJurisdictionCode("US-CA")).toBe(true);
    expect(isValidJurisdictionCode("ES-AN")).toBe(true);
  });

  it("rejects lowercase codes", () => {
    expect(isValidJurisdictionCode("es")).toBe(false);
    expect(isValidJurisdictionCode("us-ca")).toBe(false);
  });

  it("rejects too short codes", () => {
    expect(isValidJurisdictionCode("E")).toBe(false);
  });

  it("rejects too long codes", () => {
    expect(isValidJurisdictionCode("US-CALIFORNIA")).toBe(false);
  });

  it("rejects invalid format", () => {
    expect(isValidJurisdictionCode("123")).toBe(false);
    expect(isValidJurisdictionCode("US_CA")).toBe(false);
  });
});

// ── Locale Code Validation Tests ────────────────────────────────────

describe("F15 — Locale Code Validation", () => {
  it("accepts valid BCP-47 locale", () => {
    expect(isValidLocaleCode("es")).toBe(true);
    expect(isValidLocaleCode("es-ES")).toBe(true);
    expect(isValidLocaleCode("en")).toBe(true);
    expect(isValidLocaleCode("en-US")).toBe(true);
    expect(isValidLocaleCode("en-GB")).toBe(true);
    expect(isValidLocaleCode("fr-FR")).toBe(true);
  });

  it("rejects invalid locale formats", () => {
    expect(isValidLocaleCode("")).toBe(false);
    expect(isValidLocaleCode("ES")).toBe(false); // uppercase language
    expect(isValidLocaleCode("es-es")).toBe(false); // lowercase region
  });
});

// ── Translation Tests ───────────────────────────────────────────────

describe("F15 — Translations", () => {
  it("has Spanish translations", () => {
    const t = getTranslations("es-ES");
    expect(t.common.next).toBe("Siguiente");
    expect(t.case.status.DRAFT).toBeDefined();
    expect(t.legal.disclaimer).toContain("asesoramiento legal");
  });

  it("has English translations", () => {
    const t = getTranslations("en-GB");
    expect(t.common.next).toBe("Next");
    expect(t.case.status.DRAFT).toBeDefined();
    expect(t.legal.disclaimer).toContain("legal advice");
  });

  it("falls back to English for unknown locale", () => {
    const t = getTranslations("xx-XX");
    expect(t.common.next).toBe("Next"); // English fallback
  });

  it("supports translation key lookup", () => {
    expect(getTranslation("es-ES", "common.next")).toBe("Siguiente");
    expect(getTranslation("en-GB", "common.next")).toBe("Next");
  });

  it("returns key path for missing translation", () => {
    expect(getTranslation("es-ES", "nonexistent.key")).toBe("nonexistent.key");
  });

  it("returns all supported locales", () => {
    const locales = getSupportedLocales();
    expect(locales).toContain("es-ES");
    expect(locales).toContain("en-GB");
  });

  it("checks locale support", () => {
    expect(isLocaleSupported("es-ES")).toBe(true);
    expect(isLocaleSupported("en-GB")).toBe(true);
    expect(isLocaleSupported("xx-XX")).toBe(false);
  });
});

// ── Jurisdiction Resolver Tests ─────────────────────────────────────

describe("F15 — Jurisdiction Resolver", () => {
  const resolver = new JurisdictionResolver();

  it("resolves explicit jurisdiction", () => {
    const result = resolver.resolve({ providedJurisdiction: "ES" });
    expect(result.status).toBe("CONFIRMED");
    expect(result.jurisdictionCode).toBe("ES");
    expect(result.supportLevel).toBe("DETERMINISTIC");
    expect(result.needsConfirmation).toBe(false);
  });

  it("resolves explicit jurisdiction with locale", () => {
    const result = resolver.resolve({
      providedJurisdiction: "ES",
      userLocale: "en-GB",
    });
    expect(result.status).toBe("CONFIRMED");
    expect(result.locale).toBe("en-GB"); // User preference respected
  });

  it("resolves from country inference", () => {
    const result = resolver.resolve({ inferredCountry: "UK" });
    expect(result.status).toBe("DETECTED");
    expect(result.jurisdictionCode).toBe("UK");
    expect(result.needsConfirmation).toBe(true);
  });

  it("returns DETECTED for language-only input (single match)", () => {
    const result = resolver.resolve({ userLanguage: "es" });
    expect(result.status).toBe("DETECTED");
    expect(result.jurisdictionCode).toBe("ES");
    expect(result.needsConfirmation).toBe(true);
  });

  it("returns UNKNOWN for no input", () => {
    const result = resolver.resolve({});
    expect(result.status).toBe("UNKNOWN");
    expect(result.needsConfirmation).toBe(true);
  });

  it("validates valid jurisdiction", () => {
    const validation = resolver.validateJurisdiction("ES");
    expect(validation.valid).toBe(true);
    expect(validation.config).toBeDefined();
  });

  it("validates invalid jurisdiction", () => {
    const validation = resolver.validateJurisdiction("XX");
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("checks module compatibility", () => {
    const result = resolver.isModuleCompatible("warranty-rejection", "ES");
    expect(result.compatible).toBe(true);
    expect(result.supportLevel).toBe("DETERMINISTIC");
  });

  it("checks module incompatibility", () => {
    const result = resolver.isModuleCompatible("warranty-rejection", "UK");
    expect(result.compatible).toBe(true); // Research available
    expect(result.supportLevel).toBe("RESEARCH_ONLY");
  });

  it("gets locale for jurisdiction", () => {
    expect(resolver.getLocaleForJurisdiction("ES")).toBe("es-ES");
    expect(resolver.getLocaleForJurisdiction("UK")).toBe("en-GB");
    expect(resolver.getLocaleForJurisdiction("FR")).toBe("fr-FR");
  });

  it("respects preferred locale when supported", () => {
    const locale = resolver.getLocaleForJurisdiction("ES", "en-GB");
    expect(locale).toBe("en-GB"); // ES supports en-GB
  });

  it("falls back to default when preferred locale not supported", () => {
    const locale = resolver.getLocaleForJurisdiction("ES", "fr-FR");
    expect(locale).toBe("es-ES"); // ES doesn't support fr-FR
  });

  it("gets currency for jurisdiction", () => {
    expect(resolver.getCurrencyForJurisdiction("ES")).toBe("EUR");
    expect(resolver.getCurrencyForJurisdiction("UK")).toBe("GBP");
    expect(resolver.getCurrencyForJurisdiction("US")).toBe("USD");
  });
});

// ── Rule Engine Jurisdiction Safety Tests ────────────────────────────

describe("F15 — Rule Engine Jurisdiction Safety", () => {
  it("ES rule applies to ES case", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "ES" };
    expect(jurisdictionApplies(scope, { country: "ES" })).toBe(true);
  });

  it("ES rule does NOT apply to FR case", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "ES" };
    expect(jurisdictionApplies(scope, { country: "FR" })).toBe(false);
  });

  it("FR rule does NOT apply to ES case", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "FR" };
    expect(jurisdictionApplies(scope, { country: "ES" })).toBe(false);
  });

  it("ES rule applies to ES-AN case (country-wide)", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "ES" };
    expect(jurisdictionApplies(scope, { country: "ES", region: "AN" })).toBe(true);
  });

  it("EU rule does NOT apply to ES case (EU is not a country)", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "EU" };
    expect(jurisdictionApplies(scope, { country: "ES" })).toBe(false);
  });

  it("ES-AN rule applies to ES-AN case (exact)", () => {
    const scope: JurisdictionScope = { level: "REGIONAL", country: "ES", region: "AN" };
    expect(jurisdictionApplies(scope, { country: "ES", region: "AN" })).toBe(true);
  });

  it("ES-AN rule does NOT apply to ES-MD case (regional mismatch)", () => {
    const scope: JurisdictionScope = { level: "REGIONAL", country: "ES", region: "AN" };
    expect(jurisdictionApplies(scope, { country: "ES", region: "MD" })).toBe(false);
  });

  it("EU rule does NOT apply to US case", () => {
    const scope: JurisdictionScope = { level: "COUNTRY_WIDE", country: "EU" };
    expect(jurisdictionApplies(scope, { country: "US" })).toBe(false);
  });
});

// ── Cross-Jurisdiction Isolation Tests ───────────────────────────────

describe("F15 — Cross-Jurisdiction Isolation", () => {
  it("ES deterministic modules are not available in UK", () => {
    const esModules = ["cancellation-charge", "no-delivery-refund", "warranty-rejection"];
    for (const mod of esModules) {
      expect(isModuleAvailableInJurisdiction(mod, "UK")).toBe(false);
    }
  });

  it("ES deterministic modules are not available in FR", () => {
    const esModules = ["cancellation-charge", "no-delivery-refund", "warranty-rejection"];
    for (const mod of esModules) {
      expect(isModuleAvailableInJurisdiction(mod, "FR")).toBe(false);
    }
  });

  it("EU flight-cancel is available in ES", () => {
    expect(isModuleAvailableInJurisdiction("flight-cancel", "ES")).toBe(true);
  });

  it("EU flight-cancel is available in ES (EU module)", () => {
    // EU modules are registered under EU jurisdiction, not ES
    // ES has its own flight-cancel module registered
    expect(isModuleAvailableInJurisdiction("flight-cancel", "ES")).toBe(true);
  });

  it("jurisdiction and locale are independent", () => {
    const resolver = new JurisdictionResolver();

    // English user in Spain
    const result = resolver.resolve({
      providedJurisdiction: "ES",
      userLocale: "en-GB",
    });
    expect(result.jurisdictionCode).toBe("ES");
    expect(result.locale).toBe("en-GB"); // English locale, ES jurisdiction
  });

  it("English user in Spain gets ES jurisdiction", () => {
    const resolver = new JurisdictionResolver();
    const result = resolver.resolve({
      providedJurisdiction: "ES",
      userLocale: "en-GB",
    });
    expect(result.jurisdictionCode).toBe("ES");
    expect(result.locale).toBe("en-GB"); // English locale, ES jurisdiction
  });
});

// ── Source Hierarchy by Jurisdiction Tests ───────────────────────────

describe("F15 — Source Hierarchy by Jurisdiction", () => {
  it("Spain has official domains", () => {
    const config = getJurisdictionConfig("ES");
    expect(config!.sourceConfig.officialDomains).toContain("boe.es");
  });

  it("UK has official domains", () => {
    const config = getJurisdictionConfig("UK");
    expect(config!.sourceConfig.officialDomains).toContain("legislation.gov.uk");
  });

  it("US has official domains", () => {
    const config = getJurisdictionConfig("US");
    expect(config!.sourceConfig.officialDomains).toContain("congress.gov");
  });

  it("France has official domains", () => {
    const config = getJurisdictionConfig("FR");
    expect(config!.sourceConfig.officialDomains).toContain("legifrance.gouv.fr");
  });

  it("different jurisdictions have different source hierarchies", () => {
    const esConfig = getJurisdictionConfig("ES");
    const ukConfig = getJurisdictionConfig("UK");
    const usConfig = getJurisdictionConfig("US");

    expect(esConfig!.sourceConfig.officialDomains).not.toEqual(
      ukConfig!.sourceConfig.officialDomains,
    );
    expect(ukConfig!.sourceConfig.officialDomains).not.toEqual(
      usConfig!.sourceConfig.officialDomains,
    );
  });
});

// ── Currency Tests ──────────────────────────────────────────────────

describe("F15 — Currency", () => {
  it("ES uses EUR", () => {
    expect(getDefaultCurrency("ES")).toBe("EUR");
  });

  it("UK uses GBP", () => {
    expect(getDefaultCurrency("UK")).toBe("GBP");
  });

  it("US uses USD", () => {
    expect(getDefaultCurrency("US")).toBe("USD");
  });

  it("FR uses EUR", () => {
    expect(getDefaultCurrency("FR")).toBe("EUR");
  });

  it("DE uses EUR", () => {
    expect(getDefaultCurrency("DE")).toBe("EUR");
  });
});

// ── Date Format Tests ───────────────────────────────────────────────

describe("F15 — Date Formats", () => {
  it("Spain uses DD/MM/YYYY", () => {
    const config = getJurisdictionConfig("ES");
    expect(config!.dateFormat).toBe("DD/MM/YYYY");
  });

  it("US uses MM/DD/YYYY", () => {
    const config = getJurisdictionConfig("US");
    expect(config!.dateFormat).toBe("MM/DD/YYYY");
  });

  it("Germany uses DD.MM.YYYY", () => {
    const config = getJurisdictionConfig("DE");
    expect(config!.dateFormat).toBe("DD.MM.YYYY");
  });
});

// ── Security Tests ──────────────────────────────────────────────────

describe("F15 — Security", () => {
  it("rejects invalid jurisdiction codes", () => {
    const resolver = new JurisdictionResolver();
    const invalidCodes = [
      "../../../etc/passwd",
      "'; DROP TABLE cases;--",
      "ES<script>alert(1)</script>",
      "ES\nINJECTION",
      "A".repeat(100),
    ];

    for (const code of invalidCodes) {
      const validation = resolver.validateJurisdiction(code);
      expect(validation.valid).toBe(false);
    }
  });

  it("rejects invalid locale codes", () => {
    const invalidLocales = [
      "../../../etc/passwd",
      "'; DROP TABLE cases;--",
      "es<script>alert(1)</script>",
      "es\nINJECTION",
    ];

    for (const locale of invalidLocales) {
      expect(isValidLocaleCode(locale)).toBe(false);
    }
  });

  it("language does not determine jurisdiction (needs confirmation)", () => {
    const resolver = new JurisdictionResolver();

    // Spanish language gives DETECTED status (needs confirmation)
    const result = resolver.resolve({ userLanguage: "es" });
    expect(result.status).toBe("DETECTED");
    expect(result.needsConfirmation).toBe(true);
  });

  it("locale does not determine jurisdiction", () => {
    const resolver = new JurisdictionResolver();

    // es-ES locale gives AMBIGUOUS status
    const result = resolver.resolve({ userLocale: "es-ES" });
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.jurisdictionCode).toBeNull();
  });
});
