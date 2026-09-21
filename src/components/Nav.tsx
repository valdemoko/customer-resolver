"use client";

/**
 * Navigation — Resolveo.
 *
 * Compact, editorial navigation with AI entry point.
 */
import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/problemas", label: "Problemas" },
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/fuentes", label: "Fuentes" },
  { href: "/contacto", label: "Contacto" },
] as const;

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="btn-ghost text-[13px]"
          >
            {item.label}
          </Link>
        ))}
        <div className="w-px h-4 bg-[var(--border-light)] mx-2" />
        <Link href="/#resolver" className="btn-primary text-[13px] py-2 px-4">
          Contar mi problema
        </Link>
      </nav>

      {/* Mobile menu trigger */}
      <div className="md:hidden flex items-center gap-2">
        <Link href="/#resolver" className="btn-primary text-[12px] py-1.5 px-3">
          Contar
        </Link>
        <button
          className="p-2 rounded hover:bg-[var(--surface-warm)] transition-colors"
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <svg className="w-4 h-4 text-[var(--color-ink)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[var(--color-ink)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 bg-[var(--surface-paper)] border-b border-[var(--border-light)] shadow-lg z-50 anim-slide-down">
          <nav className="max-w-[1200px] mx-auto px-5 py-4 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="btn-ghost text-sm justify-start"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
