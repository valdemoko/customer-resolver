/**
 * Guides cluster tests.
 *
 * The /guias pages were added because three intents (how to claim, how to
 * withdraw from an online purchase, what a flight delay entitles you to) had no
 * page at all. These tests hold the invariants that keep the cluster from
 * turning into thin or duplicated content: a guide must link to real problems,
 * carry a review date, resolve without leaking raw fact keys, and appear in the
 * sitemap.
 */
import { describe, expect, it } from "vitest";

import { GUIDES, getGuideBySlug, getGuidesForProblem } from "@/lib/guides";
import { PROBLEM_CATALOGUE, getProblemBySlug } from "@/lib/problem-catalogue";
import sitemap from "@/app/sitemap";

const rawFactKeyPattern = /\b(flight|cancellation|charge|service|passenger|airline)\.[a-z_]+/;

describe("guides catalogue", () => {
  it("has at least one guide", () => {
    expect(GUIDES.length).toBeGreaterThan(0);
  });

  it("uses unique, URL-safe slugs", () => {
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toMatch(/^-|-$|--/);
    }
  });

  it("writes a title a search result can show", () => {
    for (const guide of GUIDES) {
      expect(guide.metaTitle.length, guide.slug).toBeGreaterThan(25);
      // Room for the " · Resolveo" the layout template appends.
      expect(guide.metaTitle.length, guide.slug).toBeLessThanOrEqual(60);
      expect(guide.description.length, guide.slug).toBeGreaterThan(80);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(165);
      expect(guide.lead.length, guide.slug).toBeGreaterThan(80);
    }
  });

  it("dates every guide with a real review date", () => {
    for (const guide of GUIDES) {
      expect(guide.updatedAt, guide.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("sends every guide to problems that exist, and keeps the link bidirectional", () => {
    for (const guide of GUIDES) {
      expect(guide.relatedSlugs.length, guide.slug).toBeGreaterThan(0);
      for (const slug of guide.relatedSlugs) {
        expect(getProblemBySlug(slug), `${guide.slug} → ${slug}`).toBeDefined();
        // The problem page renders the reverse link from the same data.
        expect(
          getGuidesForProblem(slug).map((g) => g.slug),
          `${slug} ← ${guide.slug}`,
        ).toContain(guide.slug);
      }
    }
  });

  it("answers real questions and never leaks a raw fact key", () => {
    for (const guide of GUIDES) {
      expect(guide.faq.length, guide.slug).toBeGreaterThanOrEqual(3);
      const copy = guide.faq.flatMap((f) => [f.question, f.answer]).join(" ");
      for (const item of guide.faq) {
        expect(item.question.endsWith("?"), item.question).toBe(true);
        expect(item.answer.length, item.question).toBeGreaterThan(80);
      }
      expect(rawFactKeyPattern.test(copy), `${guide.slug} leaks a fact key`).toBe(false);
      expect(copy).not.toContain("tres meses");
      expect(copy).not.toContain("3 meses");
    }
  });

  it("returns undefined for an unknown guide instead of throwing", () => {
    expect(getGuideBySlug("no-existe")).toBeUndefined();
  });
});

describe("guides pages", () => {
  it("gives the index a canonical URL", async () => {
    const { metadata } = await import("@/app/guias/page");
    expect(metadata.title).toContain("Guías");
    expect(metadata.alternates?.canonical).toBe("/guias");
  });

  it("gives every guide its own canonical and description", async () => {
    const pageModules: Record<string, string> = {
      "como-reclamar": "@/app/guias/como-reclamar/page",
      "devolver-compra-online": "@/app/guias/devolver-compra-online/page",
      "retraso-de-vuelo": "@/app/guias/retraso-de-vuelo/page",
    };

    for (const guide of GUIDES) {
      const modulePath = pageModules[guide.slug];
      expect(modulePath, `${guide.slug} has no page module`).toBeDefined();
      const { metadata, default: Page } = await import(modulePath!);
      expect(metadata.title).toBe(guide.metaTitle);
      expect(metadata.description).toBe(guide.description);
      expect(metadata.alternates?.canonical).toBe(`/guias/${guide.slug}`);
      expect(typeof Page).toBe("function");
    }
  });
});

describe("guides in the sitemap", () => {
  it("lists the hub and every guide with its own review date", () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${siteUrl}/guias`);
    for (const guide of GUIDES) {
      const entry = entries.find((e) => e.url === `${siteUrl}/guias/${guide.slug}`);
      expect(entry, `${guide.slug} missing from sitemap`).toBeDefined();
      expect(entry!.lastModified).toBe(guide.updatedAt);
    }
  });

  it("keeps every problem page too, and no private route", () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const urls = sitemap().map((entry) => entry.url);

    for (const problem of PROBLEM_CATALOGUE) {
      expect(urls).toContain(`${siteUrl}/problemas/${problem.slug}`);
    }
    expect(urls.some((url) => url.includes("/resolver"))).toBe(false);
    expect(urls.some((url) => url.includes("/case"))).toBe(false);
  });
});
