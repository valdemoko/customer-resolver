import type { MetadataRoute } from "next";
import { cities } from "@/lib/cities/registry";
import { appOrigin } from "@/lib/env";
import { legalDocs } from "@/lib/legal";

/**
 * Solo se incluyen páginas con contenido real. No hay páginas vacías ni
 * duplicadas: una ciudad entra en el sitemap cuando tiene ficha propia, y su
 * ficha siempre describe cobertura, fuentes y estado.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  const now = new Date();

  return [
    {
      url: `${origin}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${origin}/como-funciona`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: `${origin}/preguntas-frecuentes`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${origin}/contacto`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 },
    ...legalDocs.map((doc) => ({ url: `${origin}/legal/${doc.slug}`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.2 })),
    {
      url: `${origin}/atribuciones`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...cities.map((city) => ({
      url: `${origin}/city/${city.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: city.status === "available" ? 0.9 : 0.6,
    })),
  ];
}
