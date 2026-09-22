/**
 * 404 — Resolveo.
 *
 * Renders inside the root layout, so a wrong URL still offers the header, the
 * footer and a way back into the site instead of Next's bare default page.
 * Returns a real 404 status (route convention); nothing here asks to be indexed.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "La página que buscas no existe o ha cambiado de dirección.",
};

const SUGGESTED_LINKS = [
  { href: "/problemas", label: "Problemas de consumo" },
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/fuentes", label: "Fuentes normativas" },
  { href: "/contacto", label: "Contacto" },
] as const;

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-16 md:py-24">
      <p className="label mb-3">Error 404</p>
      <h1 className="mb-4">Página no encontrada</h1>
      <p className="text-lg text-[var(--color-ink-muted)] leading-relaxed max-w-2xl mb-10">
        La dirección que has visitado no existe o ha cambiado. Si llegaste desde un enlace de otro
        sitio, puedes indicárnoslo desde{" "}
        <Link
          href="/contacto"
          className="text-[var(--color-ink)] underline underline-offset-2 hover:text-[var(--color-ink-muted)] transition-colors"
        >
          contacto
        </Link>
        .
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-12">
        <Link href="/" className="btn-primary">
          Volver al inicio
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
            />
          </svg>
        </Link>
        <Link href="/problemas" className="btn-secondary">
          Ver los problemas disponibles
        </Link>
      </div>

      <div className="pt-8 border-t border-[var(--border-light)]">
        <p className="label mb-4">Quizá buscabas</p>
        <ul className="flex flex-wrap gap-2">
          {SUGGESTED_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-block text-sm text-[var(--color-ink-muted)] bg-[var(--surface-warm)] border border-[var(--border-light)] px-3 py-1.5 rounded hover:border-[var(--border-strong)] hover:text-[var(--color-ink)] transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
