/**
 * Jurisdiction Configuration Registry (Fase 15).
 *
 * Centralizes jurisdiction-specific configuration:
 *   - Support level (UNSUPPORTED, RESEARCH_ONLY, DETERMINISTIC)
 *   - Supported deterministic modules
 *   - Default locale
 *   - Currency
 *   - Date format
 *   - Number format
 *   - Source authority configuration
 *
 * This registry is the single source of truth for what jurisdictions
 * Resolveo can handle.
 *
 * IMPORTANT:
 *   - A jurisdiction being in this registry does NOT mean it has legal support
 *   - Support level must be explicitly set
 *   - UI availability ≠ legal support availability
 */

// ── Support Levels ──────────────────────────────────────────────────

/**
 * Support levels for jurisdictions.
 */
export type JurisdictionSupportLevel =
  | "UNSUPPORTED" // No reliable support available
  | "RESEARCH_ONLY" // Research Resolver may investigate, no deterministic module
  | "DETERMINISTIC"; // Reviewed, versioned Rule Engine modules exist

// ── Jurisdiction Configuration ──────────────────────────────────────

/**
 * Configuration for a specific jurisdiction.
 */
export interface JurisdictionConfig {
  /** ISO 3166-1 alpha-2 country code or subdivision (e.g., "ES", "US-CA") */
  readonly code: string;

  /** Human-readable country name */
  readonly country: string;

  /** Optional region/subdivision name */
  readonly region?: string;

  /** Default locale for this jurisdiction */
  readonly defaultLocale: string;

  /** Supported locales (BCP-47 format) */
  readonly supportedLocales: readonly string[];

  /** Default currency (ISO 4217) */
  readonly defaultCurrency: string;

  /** Date format pattern */
  readonly dateFormat: string;

  /** Number format (decimal separator, thousands separator) */
  readonly numberFormat: {
    readonly decimal: string;
    readonly thousands: string;
  };

  /** Support level */
  readonly supportLevel: JurisdictionSupportLevel;

  /** Deterministic modules available in this jurisdiction */
  readonly deterministicModules: readonly string[];

  /** Whether Research Resolver is available */
  readonly researchSupported: boolean;

  /** Source authority configuration */
  readonly sourceConfig: {
    readonly officialDomains: readonly string[];
    readonly legislationRepository?: string;
    readonly regulatorUrl?: string;
  };
}

// ── Registry ────────────────────────────────────────────────────────

const JURISDICTION_REGISTRY = new Map<string, JurisdictionConfig>();

// ── Spain (ES) ──────────────────────────────────────────────────────

JURISDICTION_REGISTRY.set("ES", {
  code: "ES",
  country: "España",
  defaultLocale: "es-ES",
  supportedLocales: ["es-ES", "en-GB"],
  defaultCurrency: "EUR",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ",", thousands: "." },
  supportLevel: "DETERMINISTIC",
  deterministicModules: [
    "cancellation-charge",
    "no-delivery-refund",
    "warranty-rejection",
    "flight-cancel",
  ],
  researchSupported: true,
  sourceConfig: {
    officialDomains: [
      "boe.es",
      "boe.gob.es",
      "consumo.gob.es",
      "minetur.gob.es",
      "cuadernosdederecho.com",
    ],
    legislationRepository: "https://www.boe.es",
    regulatorUrl: "https://www.consumo.gob.es",
  },
});

// ── European Union (EU) ─────────────────────────────────────────────

JURISDICTION_REGISTRY.set("EU", {
  code: "EU",
  country: "Unión Europea",
  defaultLocale: "en-GB",
  supportedLocales: ["en-GB", "es-ES", "fr-FR", "de-DE", "it-IT", "pt-PT"],
  defaultCurrency: "EUR",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ",", thousands: "." },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: ["flight-cancel"], // EU regulation applies
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["eur-lex.europa.eu", "ec.europa.eu", "europa.eu"],
    legislationRepository: "https://eur-lex.europa.eu",
  },
});

// ── United Kingdom (UK) ─────────────────────────────────────────────

JURISDICTION_REGISTRY.set("UK", {
  code: "UK",
  country: "United Kingdom",
  defaultLocale: "en-GB",
  supportedLocales: ["en-GB"],
  defaultCurrency: "GBP",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ".", thousands: "," },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["legislation.gov.uk", "gov.uk"],
    legislationRepository: "https://legislation.gov.uk",
    regulatorUrl: "https://www.gov.uk/government/organisations/competition-and-markets-authority",
  },
});

// ── United States (US) ──────────────────────────────────────────────

JURISDICTION_REGISTRY.set("US", {
  code: "US",
  country: "United States",
  defaultLocale: "en-US",
  supportedLocales: ["en-US", "es-US"],
  defaultCurrency: "USD",
  dateFormat: "MM/DD/YYYY",
  numberFormat: { decimal: ".", thousands: "," },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["congress.gov", "uscode.house.gov", "ftc.gov", "consumerfinance.gov"],
    legislationRepository: "https://www.congress.gov",
    regulatorUrl: "https://www.ftc.gov",
  },
});

// ── US California (US-CA) ───────────────────────────────────────────

JURISDICTION_REGISTRY.set("US-CA", {
  code: "US-CA",
  country: "United States",
  region: "California",
  defaultLocale: "en-US",
  supportedLocales: ["en-US", "es-US"],
  defaultCurrency: "USD",
  dateFormat: "MM/DD/YYYY",
  numberFormat: { decimal: ".", thousands: "," },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["oag.ca.gov", "leginfo.legislature.ca.gov"],
    legislationRepository: "https://leginfo.legislature.ca.gov",
    regulatorUrl: "https://oag.ca.gov",
  },
});

// ── France (FR) ─────────────────────────────────────────────────────

JURISDICTION_REGISTRY.set("FR", {
  code: "FR",
  country: "France",
  defaultLocale: "fr-FR",
  supportedLocales: ["fr-FR", "en-GB"],
  defaultCurrency: "EUR",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ",", thousands: " " },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["legifrance.gouv.fr", ".service-public.fr"],
    legislationRepository: "https://legifrance.gouv.fr",
    regulatorUrl: "https://www.economie.gouv.fr/dgccrf",
  },
});

// ── Germany (DE) ────────────────────────────────────────────────────

JURISDICTION_REGISTRY.set("DE", {
  code: "DE",
  country: "Deutschland",
  defaultLocale: "de-DE",
  supportedLocales: ["de-DE", "en-GB"],
  defaultCurrency: "EUR",
  dateFormat: "DD.MM.YYYY",
  numberFormat: { decimal: ",", thousands: "." },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["bundesgesetzblatt.de", "bmi.bund.de"],
    legislationRepository: "https://www.bundesgesetzblatt.de",
    regulatorUrl: "https://www.bmi.bund.de",
  },
});

// ── Portugal (PT) ───────────────────────────────────────────────────

JURISDICTION_REGISTRY.set("PT", {
  code: "PT",
  country: "Portugal",
  defaultLocale: "pt-PT",
  supportedLocales: ["pt-PT", "en-GB"],
  defaultCurrency: "EUR",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ",", thousands: "." },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["dre.pt", "portaldasqueixas.dgdrj.pt"],
    legislationRepository: "https://dre.pt",
    regulatorUrl: "https://www.dgdrj.pt",
  },
});

// ── Italy (IT) ──────────────────────────────────────────────────────

JURISDICTION_REGISTRY.set("IT", {
  code: "IT",
  country: "Italia",
  defaultLocale: "it-IT",
  supportedLocales: ["it-IT", "en-GB"],
  defaultCurrency: "EUR",
  dateFormat: "DD/MM/YYYY",
  numberFormat: { decimal: ",", thousands: "." },
  supportLevel: "RESEARCH_ONLY",
  deterministicModules: [],
  researchSupported: true,
  sourceConfig: {
    officialDomains: ["gazzettaufficiale.it", "giustizia.it"],
    legislationRepository: "https://www.gazzettaufficiale.it",
    regulatorUrl: "https://www.antitrust.it",
  },
});

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get configuration for a jurisdiction.
 */
export function getJurisdictionConfig(code: string): JurisdictionConfig | undefined {
  return JURISDICTION_REGISTRY.get(code);
}

/**
 * Get all registered jurisdictions.
 */
export function getAllJurisdictions(): readonly JurisdictionConfig[] {
  return Array.from(JURISDICTION_REGISTRY.values());
}

/**
 * Get jurisdictions with a specific support level.
 */
export function getJurisdictionsByLevel(
  level: JurisdictionSupportLevel,
): readonly JurisdictionConfig[] {
  return Array.from(JURISDICTION_REGISTRY.values()).filter((j) => j.supportLevel === level);
}

/**
 * Check if a jurisdiction is supported (any level).
 */
export function isJurisdictionSupported(code: string): boolean {
  return JURISDICTION_REGISTRY.has(code);
}

/**
 * Check if a jurisdiction has deterministic modules.
 */
export function hasDeterministicModules(code: string): boolean {
  const config = JURISDICTION_REGISTRY.get(code);
  return config?.supportLevel === "DETERMINISTIC" && config.deterministicModules.length > 0;
}

/**
 * Check if a specific module is available in a jurisdiction.
 */
export function isModuleAvailableInJurisdiction(
  moduleKey: string,
  jurisdictionCode: string,
): boolean {
  const config = JURISDICTION_REGISTRY.get(jurisdictionCode);
  if (!config) return false;
  return config.deterministicModules.includes(moduleKey);
}

/**
 * Get the default locale for a jurisdiction.
 */
export function getDefaultLocale(jurisdictionCode: string): string {
  const config = JURISDICTION_REGISTRY.get(jurisdictionCode);
  return config?.defaultLocale ?? "en-GB";
}

/**
 * Get the default currency for a jurisdiction.
 */
export function getDefaultCurrency(jurisdictionCode: string): string {
  const config = JURISDICTION_REGISTRY.get(jurisdictionCode);
  return config?.defaultCurrency ?? "EUR";
}

/**
 * Validate a jurisdiction code format.
 * Accepts ISO 3166-1 alpha-2 or subdivision format (e.g., "ES", "US-CA").
 */
export function isValidJurisdictionCode(code: string): boolean {
  // Basic format validation
  if (code.length < 2 || code.length > 6) return false;
  if (!/^[A-Z]{2}(-[A-Z0-9]{1,4})?$/.test(code)) return false;
  return true;
}

/**
 * Validate a locale code format.
 * Accepts BCP-47 format (e.g., "es-ES", "en-US").
 */
export function isValidLocaleCode(code: string): boolean {
  // Basic BCP-47 validation
  if (code.length < 2 || code.length > 10) return false;
  if (!/^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(code)) return false;
  return true;
}
