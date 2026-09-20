"use client";

/**
 * Navigation — Consumer Resolver.
 *
 * Desktop and mobile nav with hamburger toggle.
 * Uses Next.js Link for client-side navigation.
 */
import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/#resolver", label: "Resolver un problema" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/casos", label: "Consultar caso" },
  { href: "/contacto", label: "Contacto" },
] as const;

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="cr-btn-ghost text-sm">
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile menu trigger */}
      <button
        className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? (
          <svg
            className="w-5 h-5 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
          </svg>
        )}
      </button>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-white border-t border-slate-100 shadow-lg z-50 animate-scale-in">
          <nav className="px-5 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="cr-btn-ghost text-sm justify-start"
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
