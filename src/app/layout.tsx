import type { Metadata, Viewport } from "next";
import { GeistMono, GeistSans } from "geist/font";
import { Bricolage_Grotesque } from "next/font/google";
import { brand } from "@/lib/brand";
import { appOrigin } from "@/lib/env";
import "./globals.css";
import "./motion.css";
import { SiteChrome } from "@/components/marketing/SiteChrome";

/**
 * Interfaz: Geist (geométrica, moderna, self-hosted vía el paquete `geist`,
 * sin peticiones en tiempo de ejecución a Google).
 * Display: Bricolage Grotesque (grotesca con carácter, tamaños ópticos), para
 * titulares, nombres de ciudad y el wordmark. Cifras y etiquetas: Geist Mono.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin zoom bloqueado: accesibilidad (WCAG 1.4.4)
  maximumScale: 5,
  themeColor: "#0a1124",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
      <head>
        {/* Sin selector de tema: la interfaz es de un solo modo, oscuro. */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/brand/icon-32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
      </head>
      <body className="min-h-dvh bg-ivory text-ink antialiased">
        <SiteChrome />
        {children}
      </body>
    </html>
  );
}
