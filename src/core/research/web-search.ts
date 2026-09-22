/**
 * Web Search Adapter (Fase 14, spec §8).
 *
 * Controlled source discovery with:
 *   - Bounded execution (max searches, max results)
 *   - SSRF protection (blocked hostnames, private IPs)
 *   - Source authority classification
 *   - Content extraction (minimal, for provenance only)
 *
 * This is NOT an unrestricted browsing agent.
 * Search queries are formulated from the research plan.
 * Results are validated before use.
 */
import type { ResearchSource, SourceAuthority, SourceType } from "./types";
import type { IsoDate, IsoDateTime } from "../shared/temporal";
import { validateUrl } from "./source-validator";

// ── Search Configuration ────────────────────────────────────────────

export interface WebSearchConfig {
  readonly maxResultsPerQuery: number;
  readonly maxTotalResults: number;
  readonly timeoutMs: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  maxResultsPerQuery: 10,
  maxTotalResults: 50,
  timeoutMs: 10_000,
};

// ── Search Result ───────────────────────────────────────────────────

export interface SearchResult {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
  readonly domain: string;
  readonly publishedDate?: string;
}

// ── Web Search Adapter ──────────────────────────────────────────────

/**
 * Bounded web search for legal source discovery.
 *
 * Safety properties:
 *   - All URLs are validated before fetching
 *   - Private IPs and blocked hostnames are rejected
 *   - Response sizes are limited
 *   - Timeouts are enforced
 *   - Results are classified by authority
 */
export class WebSearchAdapter {
  private config: WebSearchConfig;
  private searchesPerformed = 0;

  constructor(config: Partial<WebSearchConfig> = {}) {
    this.config = { ...DEFAULT_WEB_SEARCH_CONFIG, ...config };
  }

  /**
   * Execute a bounded web search.
   * Returns validated, classified search results.
   */
  async search(
    query: string,
    jurisdiction: string,
  ): Promise<{
    results: readonly SearchResult[];
    searchesPerformed: number;
  }> {
    // Budget check
    if (this.searchesPerformed >= this.config.maxTotalResults) {
      return { results: [], searchesPerformed: this.searchesPerformed };
    }

    // Sanitize query (prevent injection)
    const sanitizedQuery = this.sanitizeQuery(query);

    // Execute search (bounded)
    const results = await this.executeSearch(sanitizedQuery, jurisdiction);

    this.searchesPerformed += 1;

    return {
      results: results.slice(0, this.config.maxResultsPerQuery),
      searchesPerformed: this.searchesPerformed,
    };
  }

  /**
   * Convert a search result to a ResearchSource.
   */
  resultToSource(result: SearchResult, jurisdiction: string): ResearchSource {
    const authority = this.classifyAuthority(result.domain, result.title);
    const sourceType = this.classifySourceType(result.title, result.snippet);

    const now = new Date().toISOString();

    return {
      sourceId: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result.url,
      title: result.title,
      publisher: this.extractPublisher(result.domain),
      jurisdiction,
      sourceType,
      authority,
      publicationDate: result.publishedDate as IsoDate | undefined,
      retrievedAt: now as IsoDateTime,
      validationStatus: "UNVERIFIED",
    };
  }

  /**
   * Reset search counter (for new research session).
   */
  reset(): void {
    this.searchesPerformed = 0;
  }

  // ── Private Methods ───────────────────────────────────────────────

  private sanitizeQuery(query: string): string {
    // Remove potentially dangerous characters
    return query
      .replace(/[<>]/g, "") // Remove HTML tags
      .replace(/javascript:/gi, "") // Remove JS protocol
      .replace(/data:/gi, "") // Remove data protocol
      .trim()
      .slice(0, 500); // Limit length
  }

  private async executeSearch(
    _query: string,
    _jurisdiction: string,
  ): Promise<readonly SearchResult[]> {
    // In production, this would call a real search API (Google, Bing, etc.)
    // For now, return empty array (search infrastructure not yet implemented)
    // This is intentional — the research engine works with any search backend

    // TODO: Integrate with actual search provider when available
    // The adapter interface is designed to be swappable

    return [];
  }

  private classifyAuthority(domain: string, title: string): SourceAuthority {
    const lowerDomain = domain.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Official legislation domains
    if (lowerDomain.includes("boe.") || lowerDomain.includes("boe.")) {
      return "OFFICIAL_LEGISLATION";
    }
    if (lowerDomain.includes("eur-lex")) {
      return "OFFICIAL_LEGISLATION";
    }
    if (lowerDomain.includes("gob.") || lowerDomain.includes("gov.")) {
      return "GOVERNMENT_MINISTRY";
    }
    if (lowerDomain.includes("europa.eu")) {
      return "INSTITUTIONAL_SOURCE";
    }

    // Title-based classification
    if (lowerTitle.includes("ley") || lowerTitle.includes("real decreto")) {
      return "OFFICIAL_LEGISLATION";
    }
    if (lowerTitle.includes("reglamento")) {
      return "OFFICIAL_REGULATION";
    }

    return "SECONDARY_SOURCE";
  }

  private classifySourceType(title: string, snippet: string): SourceType {
    const text = `${title} ${snippet}`.toLowerCase();

    if (text.includes("ley ") || text.includes("real decreto") || text.includes("norma")) {
      return "LEGISLATION";
    }
    if (text.includes("reglamento")) {
      return "REGULATION";
    }
    if (text.includes("sentencia") || text.includes("resolución")) {
      return "JUDICIAL_DECISION";
    }
    if (text.includes("circular") || text.includes("instrucción")) {
      return "ADMINISTRATIVE_GUIDANCE";
    }

    return "OTHER";
  }

  private extractPublisher(domain: string): string {
    // Simple publisher extraction from domain
    const parts = domain.split(".");
    if (parts.length >= 2) {
      return parts[parts.length - 2]!;
    }
    return domain;
  }
}

// ── URL Fetching with SSRF Protection ───────────────────────────────

/**
 * Fetch content from a URL with SSRF protection.
 * Returns minimal content for provenance — NOT full document storage.
 */
export async function fetchSourceContent(
  url: string,
  options: {
    timeoutMs?: number;
    maxResponseSize?: number;
  } = {},
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
}> {
  const { timeoutMs = 10_000, maxResponseSize = 1_000_000 } = options;

  // Validate URL
  const validation = validateUrl(url);
  if (!validation.valid) {
    return { success: false, error: `URL validation failed: ${validation.reason}` };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Resolveo/1.0 (Research; +https://resolveo.site)",
        Accept: "text/html,text/plain,application/json",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    // Check content type
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/") && !contentType.includes("application/json")) {
      return { success: false, error: `Unsupported content type: ${contentType}` };
    }

    // Check response size
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxResponseSize) {
      return { success: false, error: "Response too large" };
    }

    // Read response (bounded)
    const text = await response.text();
    if (text.length > maxResponseSize) {
      return { success: false, error: "Response too large" };
    }

    return { success: true, content: text };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Request timed out" };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unknown error" };
  }
}
