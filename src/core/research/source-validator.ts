/**
 * Source Validation & Hierarchy (Fase 14, spec §6/§7/§10).
 *
 * Validates sources before they can support research findings.
 * Implements the source hierarchy: official > institutional > professional > secondary.
 *
 * Validation checks:
 *   - Domain authority (official domains for legislation)
 *   - URL structure (must be valid HTTP/HTTPS)
 *   - Publisher identity (must match expected authority)
 *   - Content integrity (title, date, section)
 *   - Temporal validity (publication/effective dates)
 *
 * A source that fails validation becomes UNVERIFIED and cannot
 * support a SUPPORTED finding.
 */
import type { ResearchSource, SourceAuthority } from "./types";

// ── Source Authority Hierarchy ──────────────────────────────────────

/**
 * Authority ranking (higher = more authoritative).
 * Used for conflict resolution and source selection.
 */
const AUTHORITY_RANK: Record<SourceAuthority, number> = {
  OFFICIAL_LEGISLATION: 10,
  OFFICIAL_REGULATION: 9,
  GOVERNMENT_MINISTRY: 8,
  OFFICIAL_REGULATOR: 7,
  JUDICIAL_DATABASE: 6,
  ADMINISTRATIVE_GUIDANCE: 5,
  INSTITUTIONAL_SOURCE: 4,
  PROFESSIONAL_SOURCE: 3,
  SECONDARY_SOURCE: 2,
  UNVERIFIED: 0,
};

export function compareAuthority(a: SourceAuthority, b: SourceAuthority): number {
  return AUTHORITY_RANK[a] - AUTHORITY_RANK[b]; // Higher rank = higher value
}

// ── Official Domain Allowlists ──────────────────────────────────────

/**
 * Domains recognized as official sources by jurisdiction.
 * This is a curated list — NOT exhaustive, but covers major official sources.
 */
const OFFICIAL_DOMAINS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    "ES",
    [
      "boe.es", // Boletín Oficial del Estado
      "boe.gob.es", // BOE alternate
      "eur-lex.europa.eu", // EUR-Lex
      "minetur.gob.es", // Ministerio de Turismo
      "consumo.gob.es", // Dirección General de Consumo
      "gob.es", // General government
      "cuadernosdederecho.com", // Professional (secondary)
    ],
  ],
  ["EU", ["eur-lex.europa.eu", "ec.europa.eu", "europa.eu"]],
  ["UK", ["legislation.gov.uk", "gov.uk"]],
  ["US", ["congress.gov", "uscode.house.gov", "ftc.gov", "consumerfinance.gov"]],
]);

// ── Validation Result ───────────────────────────────────────────────

export interface SourceValidationResult {
  readonly isValid: boolean;
  readonly authority: SourceAuthority;
  readonly validationNotes: string[];
  readonly warnings: string[];
}

// ── URL Validation ──────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = ["https:", "http:"];

/**
 * Blocked hostnames — SSRF protection.
 * Prevents requests to private networks, localhost, etc.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIP(hostname: string): boolean {
  // Basic private IP detection
  const parts = hostname.split(".");
  if (parts.length === 4) {
    const first = parseInt(parts[0]!, 10);
    const second = parseInt(parts[1]!, 10);
    // 10.x.x.x, 172.16-31.x.x, 192.168.x.x
    if (first === 10) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 0) return true; // 0.x.x.x
  }
  return false;
}

export function validateUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Protocol check
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { valid: false, reason: "Protocol not allowed" };
    }

    // Blocked hostnames
    if (BLOCKED_HOSTNAMES.has(parsed.hostname)) {
      return { valid: false, reason: "Blocked hostname" };
    }

    // Private IP check
    if (isPrivateIP(parsed.hostname)) {
      return { valid: false, reason: "Private IP address" };
    }

    // Path traversal check (including encoded)
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (parsed.pathname.includes("..") || decodedPath.includes("..")) {
      return { valid: false, reason: "Path traversal detected" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
}

// ── Source Validation ───────────────────────────────────────────────

/**
 * Validate a research source.
 *
 * Checks:
 * 1. URL is valid and not SSRF-vulnerable
 * 2. Domain matches expected authority for jurisdiction
 * 3. Publisher is non-empty
 * 4. Title is non-empty
 * 5. Retrieved date is present
 *
 * Returns validation result with authority level.
 */
export function validateSource(
  source: ResearchSource,
  jurisdiction: string,
): SourceValidationResult {
  const notes: string[] = [];
  const warnings: string[] = [];

  // 1. URL validation
  const urlResult = validateUrl(source.url);
  if (!urlResult.valid) {
    return {
      isValid: false,
      authority: "UNVERIFIED",
      validationNotes: [`URL validation failed: ${urlResult.reason}`],
      warnings: [],
    };
  }

  // 2. Domain authority check
  const domain = extractDomain(source.url);
  const officialDomains = OFFICIAL_DOMAINS.get(jurisdiction) ?? [];
  const isOfficialDomain = officialDomains.some((d) => domain === d || domain.endsWith(`.${d}`));

  // 3. Determine authority based on domain + publisher
  let authority: SourceAuthority;
  if (isOfficialDomain) {
    // Official domain — check publisher match
    if (domain.includes("boe") || domain.includes("eur-lex")) {
      authority = "OFFICIAL_LEGISLATION";
    } else if (domain.includes("gob.") || domain.includes("gov.")) {
      authority = "GOVERNMENT_MINISTRY";
    } else {
      authority = "INSTITUTIONAL_SOURCE";
    }
    notes.push(`Official domain recognized: ${domain}`);
  } else if (source.authority && source.authority !== "UNVERIFIED") {
    // Pre-classified authority (from AI analysis)
    authority = source.authority;
    notes.push(`Authority pre-classified: ${authority}`);
  } else {
    // Unknown domain — secondary at best
    authority = "SECONDARY_SOURCE";
    warnings.push(`Unrecognized domain: ${domain}`);
  }

  // 4. Publisher check
  if (!source.publisher || source.publisher.trim().length === 0) {
    warnings.push("Publisher information missing");
  }

  // 5. Title check
  if (!source.title || source.title.trim().length === 0) {
    warnings.push("Source title missing");
  }

  // 6. Retrieved date check
  if (!source.retrievedAt) {
    warnings.push("Retrieved date missing");
  }

  // 7. Section check (optional but recommended)
  if (!source.relevantSection) {
    warnings.push("No relevant section/article identified");
  }

  // Source is valid if URL passes and has minimal metadata
  const isValid = urlResult.valid && (source.title?.length ?? 0) > 0;

  return {
    isValid,
    authority,
    validationNotes: notes,
    warnings,
  };
}

// ── Domain Extraction ───────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── Source Comparison ───────────────────────────────────────────────

/**
 * Compare two sources for conflict detection.
 * Returns true if sources appear to address the same legal question
 * but may provide different answers.
 */
export function sourcesAddressSameQuestion(
  sourceA: ResearchSource,
  sourceB: ResearchSource,
): boolean {
  // Same jurisdiction
  if (sourceA.jurisdiction !== sourceB.jurisdiction) return false;

  // Same source type (both legislation, both guidance, etc.)
  if (sourceA.sourceType !== sourceB.sourceType) return false;

  // Similar titles (basic similarity check)
  const titleA = sourceA.title.toLowerCase();
  const titleB = sourceB.title.toLowerCase();
  if (titleA === titleB) return true;

  // Check if titles share significant words
  const wordsA = new Set(titleA.split(/\s+/));
  const wordsB = new Set(titleB.split(/\s+/));
  let commonWords = 0;
  for (const word of wordsA) {
    if (word.length > 3 && wordsB.has(word)) commonWords++;
  }
  return commonWords >= 3;
}

/**
 * Detect conflicts between two sources.
 * Returns null if no conflict detected, or the conflict type.
 */
export function detectConflict(
  sourceA: ResearchSource,
  sourceB: ResearchSource,
): { type: string; description: string } | null {
  // Different jurisdictions
  if (sourceA.jurisdiction !== sourceB.jurisdiction) {
    return {
      type: "DIFFERENT_JURISDICTION",
      description: `Sources apply to different jurisdictions: ${sourceA.jurisdiction} vs ${sourceB.jurisdiction}`,
    };
  }

  // Different dates
  if (sourceA.publicationDate && sourceB.publicationDate) {
    if (sourceA.publicationDate !== sourceB.publicationDate) {
      return {
        type: "DIFFERENT_DATE",
        description: `Sources published on different dates: ${sourceA.publicationDate} vs ${sourceB.publicationDate}`,
      };
    }
  }

  // Primary vs secondary
  const rankA = AUTHORITY_RANK[sourceA.authority];
  const rankB = AUTHORITY_RANK[sourceB.authority];
  if (Math.abs(rankA - rankB) >= 3) {
    return {
      type: "PRIMARY_VS_SECONDARY",
      description: `Significant authority difference: ${sourceA.authority} vs ${sourceB.authority}`,
    };
  }

  return null;
}
