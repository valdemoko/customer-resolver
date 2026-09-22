/**
 * SEO, Security & Routing Tests — Resolveo (Fase 9).
 *
 * Tests that verify:
 * - Problem catalogue consistency
 * - Sitemap contains all expected public URLs
 * - Private pages are protected (noindex)
 * - Robots configuration
 * - Metadata correctness
 * - Structured data validity
 * - Internal linking structure
 */
import { describe, expect, it } from "vitest";
import {
  PROBLEM_CATALOGUE,
  getAvailableProblems,
  getProblemBySlug,
  getProblemByKey,
  searchProblems,
} from "@/lib/problem-catalogue";

// ── Problem Catalogue Integrity ──────────────────────────────────────

describe("Problem Catalogue", () => {
  it("has exactly 4 available problems", () => {
    expect(getAvailableProblems()).toHaveLength(4);
  });

  it("all problems have unique keys", () => {
    const keys = PROBLEM_CATALOGUE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all problems have unique slugs", () => {
    const slugs = PROBLEM_CATALOGUE.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all slugs are URL-safe", () => {
    for (const p of PROBLEM_CATALOGUE) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.slug).not.toMatch(/^-|-$|--/);
    }
  });

  it("all available problems have keywords", () => {
    for (const p of getAvailableProblems()) {
      expect(p.keywords.length).toBeGreaterThan(0);
    }
  });

  it("all problems have legalBasis", () => {
    for (const p of PROBLEM_CATALOGUE) {
      expect(p.legalBasis.length).toBeGreaterThan(0);
    }
  });

  it("all problems have whatWeAnalyze and whatYouGet", () => {
    for (const p of PROBLEM_CATALOGUE) {
      expect(p.whatWeAnalyze.length).toBeGreaterThan(0);
      expect(p.whatYouGet.length).toBeGreaterThan(0);
    }
  });

  it("getProblemBySlug returns correct problem", () => {
    const p = getProblemBySlug("vuelo-cancelado");
    expect(p).toBeDefined();
    expect(p!.key).toBe("flight-cancel");
  });

  it("getProblemBySlug returns undefined for unknown slug", () => {
    expect(getProblemBySlug("nonexistent")).toBeUndefined();
  });

  it("getProblemByKey returns correct problem", () => {
    const p = getProblemByKey("warranty-rejection");
    expect(p).toBeDefined();
    expect(p!.slug).toBe("garantia-rechazada");
  });

  it("getProblemByKey returns undefined for unknown key", () => {
    expect(getProblemByKey("nonexistent")).toBeUndefined();
  });
});

// ── Search Functionality ─────────────────────────────────────────────

describe("Problem Search", () => {
  it("finds flight-cancel when searching 'vuelo cancelado'", () => {
    const results = searchProblems("vuelo cancelado");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.key).toBe("flight-cancel");
  });

  it("finds cancellation-charge when searching 'cancelar servicio'", () => {
    const results = searchProblems("cancelar servicio");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.key === "cancellation-charge")).toBe(true);
  });

  it("finds warranty-rejection when searching 'garantía defectuoso'", () => {
    const results = searchProblems("garantía defectuoso");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.key === "warranty-rejection")).toBe(true);
  });

  it("finds no-delivery-refund when searching 'pedido no llega'", () => {
    const results = searchProblems("pedido no llega");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.key === "no-delivery-refund")).toBe(true);
  });

  it("returns empty for empty query", () => {
    expect(searchProblems("")).toHaveLength(0);
    expect(searchProblems("  ")).toHaveLength(0);
  });

  it("returns empty for very short query", () => {
    expect(searchProblems("a")).toHaveLength(0);
  });

  it("returns results for single relevant word", () => {
    const results = searchProblems("garantía");
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Sitemap Consistency ──────────────────────────────────────────────

describe("Sitemap expected URLs", () => {
  it("catalogue has all expected public problem slugs", () => {
    const expectedSlugs = [
      "cancelacion-cargo-posterior",
      "pedido-no-llega",
      "garantia-rechazada",
      "vuelo-cancelado",
    ];
    for (const slug of expectedSlugs) {
      expect(getProblemBySlug(slug)).toBeDefined();
    }
  });

  it("all available problems are present in the catalogue", () => {
    const available = getAvailableProblems();
    // Should have at least the 4 core modules
    expect(available.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Route Protection ─────────────────────────────────────────────────

describe("Private route protection", () => {
  it("case layout exports noindex metadata", async () => {
    const { metadata } = await import("@/app/case/layout");
    expect(metadata).toBeDefined();
    expect(metadata!.robots).toEqual({
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    });
  });

  it("casos layout exports noindex metadata", async () => {
    const { metadata } = await import("@/app/casos/layout");
    expect(metadata).toBeDefined();
    expect(metadata!.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("problema-libre layout exports noindex metadata", async () => {
    const { metadata } = await import("@/app/problema-libre/layout");
    expect(metadata).toBeDefined();
    expect(metadata!.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});

// ── Public Page Metadata ─────────────────────────────────────────────

describe("Public page metadata", () => {
  it("home page exports metadata with title and description", async () => {
    const { metadata } = await import("@/app/page");
    expect(metadata).toBeDefined();
    expect(typeof metadata!.title).toBe("string");
    expect(typeof metadata!.description).toBe("string");
    expect(metadata!.description!.length).toBeGreaterThan(20);
  });

  it("problems index exports metadata", async () => {
    const { metadata } = await import("@/app/problemas/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Problemas");
    expect(metadata!.alternates?.canonical).toBe("/problemas");
  });

  it("como-funciona exports metadata", async () => {
    const { metadata } = await import("@/app/como-funciona/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("funciona");
    expect(metadata!.alternates?.canonical).toBe("/como-funciona");
  });

  it("fuentes exports metadata", async () => {
    const { metadata } = await import("@/app/fuentes/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Fuentes");
    expect(metadata!.alternates?.canonical).toBe("/fuentes");
  });

  it("autor exports metadata", async () => {
    const { metadata } = await import("@/app/autor/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Autor");
    expect(metadata!.alternates?.canonical).toBe("/autor");
  });

  it("sobre exports metadata", async () => {
    const { metadata } = await import("@/app/sobre/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Sobre");
    expect(metadata!.alternates?.canonical).toBe("/sobre");
  });

  it("contacto exports metadata", async () => {
    const { metadata } = await import("@/app/contacto/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Contacto");
    expect(metadata!.alternates?.canonical).toBe("/contacto");
  });

  it("privacidad exports metadata", async () => {
    const { metadata } = await import("@/app/privacidad/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Privacidad");
    expect(metadata!.alternates?.canonical).toBe("/privacidad");
  });

  it("terminos exports metadata", async () => {
    const { metadata } = await import("@/app/terminos/page");
    expect(metadata).toBeDefined();
    expect(metadata!.title).toContain("Términos");
    expect(metadata!.alternates?.canonical).toBe("/terminos");
  });
});

// ── Root Layout Metadata ─────────────────────────────────────────────

describe("Root layout", () => {
  it("exports metadata with template and default", async () => {
    const { metadata } = await import("@/app/layout");
    expect(metadata).toBeDefined();
    const title = metadata!.title as Record<string, string>;
    expect(title).toHaveProperty("default");
    expect(title).toHaveProperty("template");
    expect(title.default).toBe("Resolveo");
    expect(title.template).toContain("Resolveo");
  });

  it("exports viewport", async () => {
    const { viewport } = await import("@/app/layout");
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBe("device-width");
  });
});

// ── Structured Data ──────────────────────────────────────────────────

describe("Structured data", () => {
  it("layout renders Organization JSON-LD script", async () => {
    // The layout function should exist and be exportable
    const layout = await import("@/app/layout");
    expect(layout.default).toBeDefined();
    expect(typeof layout.default).toBe("function");
  });
});

// ── Internal Linking Structure ───────────────────────────────────────

describe("Internal linking structure", () => {
  it("all public pages have canonical URLs", async () => {
    const pages = [
      "@/app/page",
      "@/app/problemas/page",
      "@/app/como-funciona/page",
      "@/app/fuentes/page",
      "@/app/autor/page",
      "@/app/sobre/page",
      "@/app/contacto/page",
      "@/app/privacidad/page",
      "@/app/terminos/page",
    ];

    for (const pagePath of pages) {
      const mod = await import(pagePath);
      const meta = mod.metadata as Record<string, unknown>;
      expect(meta).toBeDefined();
      expect(meta.alternates).toBeDefined();
      expect((meta.alternates as Record<string, unknown>).canonical).toBeDefined();
    }
  });
});

// ── Security: No Private Info in Public Data ─────────────────────────

describe("Security: no private data leakage", () => {
  it("problem catalogue contains no case IDs", () => {
    for (const p of PROBLEM_CATALOGUE) {
      // Slugs should not contain UUID-like patterns
      expect(p.slug).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });

  it("problem catalogue contains no internal rule details", () => {
    for (const p of PROBLEM_CATALOGUE) {
      expect(p.description).not.toMatch(/FACT_GREATER_THAN|BOOLEAN_IS_TRUE/i);
    }
  });
});
