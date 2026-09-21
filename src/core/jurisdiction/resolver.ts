/**
 * Jurisdiction Resolver (Fase 15).
 *
 * Handles jurisdiction detection, validation, and resolution.
 *
 * Key principles:
 *   - Never silently assume a jurisdiction
 *   - Language ≠ Jurisdiction
 *   - User-provided jurisdiction takes precedence
 *   - AI hints are suggestions, not confirmations
 */

import type { JurisdictionCode, Locale } from "../types";
import {
  getJurisdictionConfig,
  isValidJurisdictionCode,
  type JurisdictionConfig,
  type JurisdictionSupportLevel,
} from "./config";
import { getDefaultCurrency } from "./config";

// ── Jurisdiction Resolution Status ──────────────────────────────────

export type JurisdictionResolutionStatus =
  | "CONFIRMED"      // Jurisdiction explicitly confirmed by user
  | "DETECTED"       // Jurisdiction inferred from context (needs confirmation)
  | "AMBIGUOUS"      // Multiple possible jurisdictions
  | "UNKNOWN"        // No jurisdiction information available
  | "UNSUPPORTED";   // Jurisdiction exists but not supported

// ── Jurisdiction Resolution Result ──────────────────────────────────

export interface JurisdictionResolution {
  readonly status: JurisdictionResolutionStatus;
  readonly jurisdictionCode: JurisdictionCode | null;
  readonly locale: Locale;
  readonly currency: string;
  readonly supportLevel: JurisdictionSupportLevel | null;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
  readonly signals: readonly string[];
  readonly needsConfirmation: boolean;
  readonly userMessage?: string;
}

// ── Jurisdiction Resolver ───────────────────────────────────────────

export class JurisdictionResolver {
  /**
   * Resolve jurisdiction from user input and context.
   *
   * Resolution priority:
   *   1. Explicitly provided jurisdiction (highest confidence)
   *   2. Inferred from user location/country (medium confidence)
   *   3. Inferred from language (lowest confidence, requires confirmation)
   *
   * IMPORTANT: Language alone is NEVER sufficient for jurisdiction.
   */
  resolve(params: {
    providedJurisdiction?: string;
    inferredCountry?: string;
    userLocale?: string;
    userLanguage?: string;
  }): JurisdictionResolution {
    const { providedJurisdiction, inferredCountry, userLocale, userLanguage } = params;

    // 1. Explicitly provided jurisdiction (highest confidence)
    if (providedJurisdiction) {
      return this.resolveFromExplicit(providedJurisdiction, userLocale);
    }

    // 2. Inferred from country (medium confidence)
    if (inferredCountry) {
      return this.resolveFromCountry(inferredCountry, userLocale);
    }

    // 3. Inferred from language (lowest confidence)
    if (userLanguage) {
      return this.resolveFromLanguage(userLanguage, userLocale);
    }

    // 4. Default to locale if provided
    if (userLocale) {
      return this.resolveFromLocale(userLocale);
    }

    // 5. Unknown
    return {
      status: "UNKNOWN",
      jurisdictionCode: null,
      locale: "en-GB" as Locale,
      currency: "EUR",
      supportLevel: null,
      confidence: "LOW",
      signals: [],
      needsConfirmation: true,
      userMessage: "Necesitamos saber en qué país se realizó la compra para poder ayudarte.",
    };
  }

  /**
   * Validate a jurisdiction code.
   */
  validateJurisdiction(code: string): {
    valid: boolean;
    config?: JurisdictionConfig;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!isValidJurisdictionCode(code)) {
      errors.push(`Invalid jurisdiction code format: ${code}`);
      return { valid: false, errors };
    }

    const config = getJurisdictionConfig(code);
    if (!config) {
      errors.push(`Jurisdiction not registered: ${code}`);
      return { valid: false, errors };
    }

    if (config.supportLevel === "UNSUPPORTED") {
      errors.push(`Jurisdiction is unsupported: ${code}`);
    }

    return {
      valid: errors.length === 0,
      config,
      errors,
    };
  }

  /**
   * Check if a jurisdiction is compatible with a problem module.
   */
  isModuleCompatible(moduleKey: string, jurisdictionCode: string): {
    compatible: boolean;
    supportLevel: JurisdictionSupportLevel;
    reason?: string;
  } {
    const config = getJurisdictionConfig(jurisdictionCode);

    if (!config) {
      return {
        compatible: false,
        supportLevel: "UNSUPPORTED",
        reason: `Jurisdiction ${jurisdictionCode} is not registered`,
      };
    }

    if (config.supportLevel === "UNSUPPORTED") {
      return {
        compatible: false,
        supportLevel: "UNSUPPORTED",
        reason: `Jurisdiction ${jurisdictionCode} is not supported`,
      };
    }

    if (config.deterministicModules.includes(moduleKey)) {
      return {
        compatible: true,
        supportLevel: "DETERMINISTIC",
      };
    }

    if (config.researchSupported) {
      return {
        compatible: true,
        supportLevel: "RESEARCH_ONLY",
        reason: `Module ${moduleKey} is not available deterministically in ${jurisdictionCode}, but Research Resolver can investigate`,
      };
    }

    return {
      compatible: false,
      supportLevel: config.supportLevel,
      reason: `Module ${moduleKey} is not available in ${jurisdictionCode}`,
    };
  }

  /**
   * Get the appropriate locale for a jurisdiction.
   */
  getLocaleForJurisdiction(jurisdictionCode: string, preferredLocale?: string): Locale {
    const config = getJurisdictionConfig(jurisdictionCode);
    if (!config) {
      return (preferredLocale ?? "en-GB") as Locale;
    }

    // Check if preferred locale is supported in this jurisdiction
    if (preferredLocale && config.supportedLocales.includes(preferredLocale)) {
      return preferredLocale as Locale;
    }

    return config.defaultLocale as Locale;
  }

  /**
   * Get the appropriate currency for a jurisdiction.
   */
  getCurrencyForJurisdiction(jurisdictionCode: string): string {
    return getDefaultCurrency(jurisdictionCode);
  }

  // ── Private Methods ───────────────────────────────────────────────

  private resolveFromExplicit(
    jurisdictionCode: string,
    userLocale?: string,
  ): JurisdictionResolution {
    const validation = this.validateJurisdiction(jurisdictionCode);

    if (!validation.valid) {
      return {
        status: "UNSUPPORTED",
        jurisdictionCode: jurisdictionCode as JurisdictionCode,
        locale: (userLocale ?? "en-GB") as Locale,
        currency: "EUR",
        supportLevel: "UNSUPPORTED",
        confidence: "HIGH",
        signals: ["explicit_jurisdiction"],
        needsConfirmation: false,
        userMessage: validation.errors[0],
      };
    }

    const config = validation.config!;
    const locale = this.getLocaleForJurisdiction(jurisdictionCode, userLocale);

    return {
      status: "CONFIRMED",
      jurisdictionCode: jurisdictionCode as JurisdictionCode,
      locale,
      currency: config.defaultCurrency,
      supportLevel: config.supportLevel,
      confidence: "HIGH",
      signals: ["explicit_jurisdiction"],
      needsConfirmation: false,
    };
  }

  private resolveFromCountry(
    country: string,
    userLocale?: string,
  ): JurisdictionResolution {
    // Try to match country to jurisdiction code
    const countryToUpper = country.toUpperCase();
    const config = getJurisdictionConfig(countryToUpper);

    if (config) {
      const locale = this.getLocaleForJurisdiction(countryToUpper, userLocale);
      return {
        status: "DETECTED",
        jurisdictionCode: countryToUpper as JurisdictionCode,
        locale,
        currency: config.defaultCurrency,
        supportLevel: config.supportLevel,
        confidence: "MEDIUM",
        signals: ["inferred_from_country"],
        needsConfirmation: true,
      };
    }

    // Country not recognized
    return {
      status: "UNKNOWN",
      jurisdictionCode: null,
      locale: (userLocale ?? "en-GB") as Locale,
      currency: "EUR",
      supportLevel: null,
      confidence: "LOW",
      signals: ["unrecognized_country"],
      needsConfirmation: true,
    };
  }

  private resolveFromLanguage(
    language: string,
    userLocale?: string,
  ): JurisdictionResolution {
    // Language alone is NOT sufficient for jurisdiction
    // This is a critical design decision
    const lang = language.toLowerCase();

    // Map common languages to possible jurisdictions (for UI hints only)
    const languageToJurisdictions: Record<string, string[]> = {
      es: ["ES"],
      en: ["UK", "US"],
      fr: ["FR"],
      de: ["DE"],
      it: ["IT"],
      pt: ["PT"],
    };

    const possibleJurisdictions = languageToJurisdictions[lang] ?? [];

    if (possibleJurisdictions.length === 1) {
      // Single match — still needs confirmation
      const config = getJurisdictionConfig(possibleJurisdictions[0]!);
      return {
        status: "DETECTED",
        jurisdictionCode: possibleJurisdictions[0] as JurisdictionCode,
        locale: (userLocale ?? config?.defaultLocale ?? "en-GB") as Locale,
        currency: config?.defaultCurrency ?? "EUR",
        supportLevel: config?.supportLevel ?? null,
        confidence: "LOW",
        signals: ["inferred_from_language"],
        needsConfirmation: true,
        userMessage: "El idioma no determina la jurisdicción. ¿En qué país se realizó la compra?",
      };
    }

    // Multiple possibilities or unknown
    return {
      status: "AMBIGUOUS",
      jurisdictionCode: null,
      locale: (userLocale ?? "en-GB") as Locale,
      currency: "EUR",
      supportLevel: null,
      confidence: "LOW",
      signals: ["inferred_from_language", "multiple_possibilities"],
      needsConfirmation: true,
      userMessage: "Necesitamos saber en qué país se realizó la compra para poder ayudarte.",
    };
  }

  private resolveFromLocale(userLocale: string): JurisdictionResolution {
    // Locale alone is NOT sufficient for jurisdiction
    // A Spanish-speaking user could be in Spain, Mexico, Argentina, etc.
    return {
      status: "AMBIGUOUS",
      jurisdictionCode: null,
      locale: userLocale as Locale,
      currency: "EUR",
      supportLevel: null,
      confidence: "LOW",
      signals: ["locale_only"],
      needsConfirmation: true,
      userMessage: "El idioma no determina la jurisdicción. ¿En qué país se realizó la compra?",
    };
  }
}
