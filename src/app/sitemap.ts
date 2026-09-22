import type { MetadataRoute } from "next";
import { PROBLEM_CATALOGUE } from "@/lib/problem-catalogue";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Last date the copy of a *static* page changed. Bump it whenever the text of
 * any static page is edited: emitting the build timestamp instead (as this
 * used to) makes every <lastmod> identical and meaningless, and Google devalues
 * a signal that never varies. Problem pages don't use this — they carry their
 * own `updatedAt` from the catalogue.
 */
const STATIC_CONTENT_UPDATED = "2026-09-22";

export default function sitemap(): MetadataRoute.Sitemap {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: STATIC_CONTENT_UPDATED, changeFrequency: "weekly", priority: 1 },
    {
      url: `${siteUrl}/problemas`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/como-funciona`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/fuentes`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/autor`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/correcciones`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/sobre`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/contacto`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/privacidad`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${siteUrl}/cookies`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${siteUrl}/terminos`,
      lastModified: STATIC_CONTENT_UPDATED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  // Dynamic problem landing pages (from shared catalogue): each one carries the
  // real date on which its public content was last reviewed.
  const problemPages: MetadataRoute.Sitemap = PROBLEM_CATALOGUE.map((p) => ({
    url: `${siteUrl}/problemas/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...problemPages];
}
