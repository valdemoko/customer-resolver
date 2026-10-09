import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nada de rutas de usuario, administración ni el taller de diseño
        // debe indexarse. La autorización real se comprueba en servidor.
        disallow: ["/api/", "/cuenta", "/admin", "/design", "/carrito", "/pago"],
      },
    ],
    sitemap: `${appOrigin()}/sitemap.xml`,
    host: appOrigin(),
  };
}
