import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import "./globals.css";

/**
 * Root layout — Consumer Resolver.
 *
 * Professional editorial design. Source Serif 4 + DM Sans.
 * Deep slate palette with warm editorial accents.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Consumer Resolver",
    template: "%s · Consumer Resolver",
  },
  description:
    "Resuelve problemas de consumo con información estructurada, fuentes verificables y pasos claros.",
  robots: process.env.NODE_ENV === "production" ? undefined : { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Consumer Resolver",
    description:
      "Resuelve problemas de consumo con información estructurada, fuentes verificables y pasos claros.",
    type: "website",
    locale: "es_ES",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e293b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen bg-surface-base text-slate-900 antialiased font-sans">
        <div className="min-h-screen flex flex-col">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
            <div className="mx-auto max-w-6xl px-5 md:px-8 h-16 flex items-center justify-between">
              <Logo size="sm" />
              <Nav />
            </div>
          </header>

          {/* ── Main ───────────────────────────────────────────────── */}
          <main className="flex-1">{children}</main>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <footer className="border-t border-slate-200/60 bg-white mt-auto">
            <div className="mx-auto max-w-6xl px-5 md:px-8">
              <div className="py-12 grid grid-cols-1 md:grid-cols-12 gap-10">
                {/* Brand column */}
                <div className="md:col-span-5">
                  <Logo size="sm" linked={false} />
                  <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-sm">
                    Resuelve problemas de consumo con información estructurada, fuentes verificables
                    y pasos claros. Basado en normativa vigente en España.
                  </p>
                </div>

                {/* Product links */}
                <div className="md:col-span-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Producto
                  </h3>
                  <ul className="space-y-2.5">
                    <li>
                      <Link
                        href="/#resolver"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Resolver un problema
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/#como-funciona"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Cómo funciona
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/casos"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Consultar caso
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Information links */}
                <div className="md:col-span-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                    Información
                  </h3>
                  <ul className="space-y-2.5">
                    <li>
                      <Link
                        href="/sobre"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Sobre Consumer Resolver
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/contacto"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Contacto
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/privacidad"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Privacidad
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/terminos"
                        className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Términos de uso
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="py-5 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  &copy; {new Date().getFullYear()} Consumer Resolver
                </p>
                <p className="text-xs text-slate-400">
                  Información basada en normativa vigente. No constituye asesoría legal.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
