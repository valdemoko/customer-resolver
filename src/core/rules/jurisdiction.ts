/**
 * Jurisdiction model & matching (Fase 3).
 *
 * Deliberately minimal: country + optional region (e.g. ES, ES-AN). No world
 * database, no complex inheritance. Matching precedence: EXACT > REGIONAL >
 * COUNTRY_WIDE > no match (docs prompt §19).
 */
import type { JurisdictionScope } from "./types";

export type JurisdictionMatch = "EXACT" | "REGIONAL" | "COUNTRY_WIDE" | "NOT_APPLICABLE";

export interface Jurisdiction {
  readonly country: string;
  readonly region?: string;
}

/**
 * Does a rule scope apply to a case jurisdiction? Deterministic, pure.
 * A REGIONAL rule only matches the exact (country, region) pair; a
 * COUNTRY_WIDE rule matches any region of the country. EXACT is reported when
 * the rule is regional and the case matches it precisely (highest precedence
 * for ordering multiple applicable rules).
 */
export function jurisdictionMatch(
  scope: JurisdictionScope,
  jurisdiction: Jurisdiction,
): JurisdictionMatch {
  if (scope.country !== jurisdiction.country) return "NOT_APPLICABLE";
  if (scope.level === "REGIONAL") {
    return scope.region === jurisdiction.region ? "EXACT" : "NOT_APPLICABLE";
  }
  return jurisdiction.region !== undefined ? "REGIONAL" : "COUNTRY_WIDE";
}

/** Rule applies at all? (ANY match other than NOT_APPLICABLE.) */
export function jurisdictionApplies(scope: JurisdictionScope, jurisdiction: Jurisdiction): boolean {
  return jurisdictionMatch(scope, jurisdiction) !== "NOT_APPLICABLE";
}
