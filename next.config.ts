import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDev = process.env.NODE_ENV === "development";

/**
 * Cabeceras de seguridad. La CSP estricta con nonce se activará cuando exista
 * middleware (Fase D, junto con autenticación). Aquí dejamos las cabeceras que
 * no dependen del nonce para no romper el dev server.
 */
/**
 * CSP: solo se carga lo propio. Next.js escribe scripts y estilos en línea para
 * hidratar la página, así que `'unsafe-inline'` sigue hasta que haya nonce; lo
 * demás va cerrado: sin `eval`, sin plugins, sin incrustar la web en otra, sin
 * enviar formularios fuera y sin conectar con terceros. Las fotos de perfil de
 * Google son lo único externo (`img-src`). Stripe y Google se abren como página
 * propia (navegación), no incrustados. En desarrollo no se aplica (Next usa eval).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "Content-Security-Policy", value: csp },
      ]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // El indicador de desarrollo se solapaba con el pie de página en las
  // revisiones de diseño. Se mantiene el aviso en la consola del navegador.
  devIndicators: false,
  // Las imágenes de las miniaturas de ciudad se generan en el propio proyecto
  // (render del visor 3D), no se sirven desde dominios externos de stock.
  images: {
    remotePatterns: [],
  },
  /**
   * SIN REESCRITURAS PARA EL VISOR.
   *
   * Aquí había una: la que servía el worker de MapLibre en la ruta exacta que la
   * librería calculaba con `import.meta.url`. Con el visor de diorama y three.js
   * ya no hace falta —three.js no usa workers propios— y se ha quitado junto con
   * MapLibre, en lugar de dejarla «por si acaso»: una reescritura de la ruta
   * `/_next/static/chunks/*` que ya no sirve a nadie es una trampa para el
   * siguiente que lea este archivo.
   */

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // El catálogo y las fichas no deben ir a caché compartida si más
        // adelante incluyen estado por sesión (favoritos).
        source: "/",
        headers: [{ key: "Cache-Control", value: isDev ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300" }],
      },
    ];
  },
};

// Solo en desarrollo: da acceso local a los bindings de Cloudflare (no afecta al build).
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();

export default nextConfig;
