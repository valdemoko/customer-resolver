import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { GoogleConsentCmp } from "@/components/GoogleConsentCmp";
import { GoogleAdSense, isValidAdSenseClient } from "@/components/GoogleAdSense";
import { PlausibleLoader } from "@/components/PlausibleLoader";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
/**
 * Google Privacy & Messaging CMP tag, copied verbatim from AdSense.
 * Unset until AdSense is configured: the site then runs without a CMP, which is
 * the real state, instead of shipping a placeholder that never loads.
 */
const googleCmpSrc = process.env.NEXT_PUBLIC_GOOGLE_CMP_SRC;
/**
 * AdSense client (`ca-pub-…`), unset until ads are deliberately enabled.
 * ads.txt identifies the domain; nothing is loaded until this is configured —
 * and it must only be configured once the certified CMP above is in place.
 */
const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
const adsenseEnabled = Boolean(adsenseClient && isValidAdSenseClient(adsenseClient));

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Resolveo",
    template: "%s · Resolveo",
  },
  description:
    "Entiende tu problema de consumo. Analizamos tu caso con normativa verificable y te mostramos qué puedes hacer.",
  robots: process.env.NODE_ENV === "production" ? undefined : { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Resolveo",
    description:
      "Entiende tu problema de consumo. Analizamos tu caso con normativa verificable y te mostramos qué puedes hacer.",
    url: siteUrl,
    siteName: "Resolveo",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Resolveo — Entiende tu problema. Resuélvelo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resolveo",
    description:
      "Entiende tu problema de consumo. Analizamos tu caso con normativa verificable y te mostramos qué puedes hacer.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a1a1a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Resolveo",
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    sameAs: ["https://www.linkedin.com/in/miguel-iglesias-valenzuela-14069b367/"],
    description:
      "Entiende tu problema de consumo. Analizamos tu caso con normativa verificable y te mostramos qué puedes hacer.",
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "Resolveo",
    url: siteUrl,
  };

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: fonts loaded in root layout */}
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/*
          Google Privacy & Messaging (CMP for AdSense in EEA/UK/CH).

          Configure NEXT_PUBLIC_GOOGLE_CMP_SRC with the exact script URL from the
          tag Google generates at:
            AdSense → Privacidad y mensajería → Reglamentos europeos → Copiar etiqueta

          Do NOT build that URL by hand: it carries a publisher-specific path.
        */}
        <GoogleConsentCmp src={googleCmpSrc} />
        {/* AdSense loader: absent until NEXT_PUBLIC_ADSENSE_CLIENT is set, and
            then only alongside the certified CMP configured above. */}
        <GoogleAdSense client={adsenseEnabled ? adsenseClient : null} />
        {adsenseEnabled && adsenseClient && (
          <meta name="google-adsense-account" content={adsenseClient} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body className="min-h-screen bg-[var(--surface-page)] text-[var(--color-ink)] antialiased">
        <div className="min-h-screen flex flex-col">
          {/* ── Header ───────────────────────────────────────────── */}
          <header className="sticky top-0 z-50 bg-[var(--surface-page)]/90 backdrop-blur-md border-b border-[var(--border-light)]">
            <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between">
              <Logo size="sm" />
              <Nav />
            </div>
          </header>

          {/* ── Main ─────────────────────────────────────────────── */}
          <main className="flex-1">{children}</main>

          {/* ── Footer ───────────────────────────────────────────── */}
          <Footer />
        </div>
        {plausibleDomain && <PlausibleLoader domain={plausibleDomain} />}
      </body>
    </html>
  );
}
