import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Phase 0 placeholder. Fase 9 generates this from the Problem Registry
 * (docs/ARCHITECTURE.md §23). Only public, indexable pages belong here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 }];
}
