/**
 * Footer — Resolveo.
 *
 * Full-width site footer with 4 columns on desktop, stacked on mobile.
 * Adapted from TechnologyTools footer layout.
 */
import Link from "next/link";

/* ── Problem categories ────────────────────────────────────────────── */

const PROBLEM_CATEGORIES = [
  { href: "/problemas/cancelacion-cargo-posterior", label: "Cancelación con cargo" },
  { href: "/problemas/pedido-no-llega", label: "Pedido no llega" },
  { href: "/problemas/garantia-rechazada", label: "Garantía rechazada" },
  { href: "/problemas/vuelo-cancelado", label: "Vuelo cancelado" },
  { href: "/problemas", label: "Ver todos" },
  { href: "/resolver", label: "Resolver un problema" },
] as const;

/* ── Platform links ────────────────────────────────────────────────── */

const PLATFORM_LINKS = [
  { href: "/sobre", label: "Sobre Resolveo" },
  { href: "/autor", label: "Autor" },
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/fuentes", label: "Fuentes" },
  { href: "/correcciones", label: "Correcciones" },
  { href: "/casos", label: "Recuperar un caso" },
  { href: "/contacto", label: "Contacto" },
] as const;

/* ── Legal links ───────────────────────────────────────────────────── */

const LEGAL_LINKS = [
  { href: "/privacidad", label: "Política de privacidad" },
  { href: "/cookies", label: "Política de cookies" },
  { href: "/terminos", label: "Términos de uso" },
] as const;

/* ── Component ─────────────────────────────────────────────────────── */

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-[var(--border-light)] bg-[var(--surface-warm)] text-sm mt-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-8">

          {/* ── Column 1: Brand ──────────────────────────────────── */}
          <div className="md:col-span-2">
            {/* Logo + name */}
            <div className="flex items-center gap-2 mb-3">
              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <rect width="32" height="32" rx="7" fill="#1a1a18" />
                <path
                  d="M10 16h12M22 16l-4-4M22 16l-4 4M10 16l4-4M10 16l4 4"
                  stroke="#2dd4bf"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-semibold text-sm text-[var(--color-ink)]">
                Resolveo
              </span>
            </div>

            {/* Description */}
            <p className="text-xs max-w-sm mb-4 leading-relaxed text-[var(--color-ink-muted)]">
              Analiza tus problemas de consumo con normativa verificable.
              Compras, garantías, servicios, vuelos y más — con fuentes oficiales y pasos concretos.
            </p>

            {/* Copyright */}
            <p className="text-xs font-mono text-[var(--color-ink-faint)]">
              &copy; {year} Resolveo · La información se basa en normativa vigente
            </p>
          </div>

          {/* ── Column 2: Problem categories ─────────────────────── */}
          <div className="md:col-span-2">
            <h3 className="footer-heading mb-3">Categorías</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {PROBLEM_CATEGORIES.map((cat) => (
                <Link
                  key={cat.href}
                  href={cat.href}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
                >
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ── Column 3: Platform ───────────────────────────────── */}
          <div className="md:col-span-1">
            <h3 className="footer-heading mb-3">Plataforma</h3>
            <ul className="space-y-2 text-xs">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://www.linkedin.com/in/miguel-iglesias-valenzuela-14069b367/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

          {/* ── Column 4: Legal ──────────────────────────────────── */}
          <div className="md:col-span-1">
            <h3 className="footer-heading mb-3">Legal</h3>
            <ul className="space-y-2 text-xs">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </footer>
  );
}
