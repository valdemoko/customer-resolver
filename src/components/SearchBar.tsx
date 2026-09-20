"use client";

/**
 * Consumer Resolver — SearchBar.
 *
 * Central entry point to the product. Lets users describe their problem
 * in natural language and routes them to available modules or free-form entry.
 *
 * No Algolia, no external search. Local deterministic matching over registered problems.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ── Problem catalogue (mirrors available modules) ───────────────── */

interface ProblemEntry {
  slug: string;
  title: string;
  category: string;
  keywords: string[];
  available: boolean;
}

const PROBLEMS: ProblemEntry[] = [
  {
    slug: "cancellation-charge",
    title: "Cancelación y cargos posteriores",
    category: "Pagos y facturas",
    keywords: [
      "cancelar",
      "cancelación",
      "cobrado",
      "cargo",
      "factura",
      "servicio",
      "telecomunicaciones",
      "suscripción",
      "permanencia",
      "internet",
      "móvil",
      "telefonía",
      "contrato",
    ],
    available: true,
  },
  {
    slug: "no-delivery-refund",
    title: "Compras y reembolsos",
    category: "Compras",
    keywords: [
      "pedido",
      "compra",
      "reembolso",
      "devolución",
      "dinero",
      "vendedor",
      "tienda",
      "envío",
      "entrega",
      "llegar",
    ],
    available: false,
  },
  {
    slug: "warranty-rejection",
    title: "Garantías y reparaciones",
    category: "Garantías",
    keywords: [
      "garantía",
      "reparación",
      "producto",
      "defectuoso",
      "sustitución",
      "rechazado",
      "técnico",
    ],
    available: false,
  },
];

const CATEGORIES = [...new Set(PROBLEMS.map((p) => p.category))];

/* ── Search scoring ──────────────────────────────────────────────── */

function scoreProblem(problem: ProblemEntry, query: string): number {
  if (!query.trim()) return 0;
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let score = 0;
  const titleLower = problem.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const categoryLower = problem.category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const term of terms) {
    // Title match — strong signal
    if (titleLower.includes(term)) score += 10;
    // Category match
    if (categoryLower.includes(term)) score += 5;
    // Keyword match
    for (const kw of problem.keywords) {
      const kwNorm = kw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (kwNorm === term) score += 8;
      else if (kwNorm.includes(term) || term.includes(kwNorm)) score += 4;
    }
  }

  return score;
}

interface SearchResult {
  problem: ProblemEntry;
  score: number;
}

function searchProblems(query: string): SearchResult[] {
  return PROBLEMS.map((problem) => ({ problem, score: scoreProblem(problem, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* ── Component ───────────────────────────────────────────────────── */

interface SearchBarProps {
  /** Render size variant */
  size?: "default" | "large";
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function SearchBar({ size = "default", autoFocus = false }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pendingNotice, setPendingNotice] = useState<ProblemEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length >= 2 ? searchProblems(query) : [];
  const hasQuery = query.trim().length > 0;

  // Build menu items: results + custom problem option
  type MenuItem = { kind: "result"; result: SearchResult } | { kind: "custom"; label: string };

  const menuItems: MenuItem[] = [
    ...results.map((r) => ({ kind: "result" as const, result: r })),
    ...(hasQuery ? [{ kind: "custom" as const, label: "Describir mi problema" }] : []),
  ];

  const totalItems = menuItems.length;

  const handleSelect = useCallback(
    (item: MenuItem) => {
      if (item.kind === "result") {
        if (item.result.problem.available) {
          setIsOpen(false);
          window.location.href = `/case/new?problem=${item.result.problem.slug}`;
        } else {
          // Próximamente — show inline notice, keep dropdown open briefly
          setPendingNotice(item.result.problem);
          setIsOpen(false);
        }
      } else {
        setIsOpen(false);
        window.location.href = `/problema-libre?q=${encodeURIComponent(query)}`;
      }
    },
    [query],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && e.key !== "Escape") return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % totalItems);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < totalItems) {
            handleSelect(menuItems[activeIndex]!);
          } else if (hasQuery) {
            // Default: go to free-form
            window.location.href = `/problema-libre?q=${encodeURIComponent(query)}`;
          }
          break;
        case "Escape":
          setIsOpen(false);
          setActiveIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, activeIndex, totalItems, menuItems, hasQuery, handleSelect],
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isLarge = size === "large";

  return (
    <div className="relative w-full">
      {/* Input container */}
      <div
        className={`relative flex items-center transition-all duration-200 ${
          isOpen
            ? "ring-2 ring-white/20 shadow-xl shadow-black/20"
            : "shadow-lg shadow-black/15 hover:shadow-xl hover:shadow-black/20"
        } rounded-2xl bg-white border border-white/20`}
      >
        {/* Search icon */}
        <div className="pl-5 pr-2 flex-shrink-0">
          <svg
            className={`w-5 h-5 transition-colors ${isOpen ? "text-slate-800" : "text-slate-400"}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLarge
              ? "Describe lo que te ha pasado..."
              : "Buscar un problema o describe lo que te ha pasado"
          }
          className={`w-full bg-transparent border-none outline-none font-sans text-slate-900 placeholder:text-slate-400 ${
            isLarge ? "py-5 pr-5 pl-1 text-lg" : "py-4 pr-4 pl-1 text-base"
          }`}
          role="combobox"
          aria-expanded={isOpen && totalItems > 0}
          aria-controls="search-results"
          aria-activedescendant={activeIndex >= 0 ? `search-item-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-label="Buscar problema de consumo"
          autoFocus={autoFocus}
        />

        {/* Submit arrow — visible when there's a query */}
        {hasQuery && (
          <button
            onClick={() => {
              window.location.href = `/problema-libre?q=${encodeURIComponent(query)}`;
            }}
            className="mr-3 p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Continuar"
          >
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
          </button>
        )}
      </div>

      {/* Próximamente notice — inline feedback */}
      {pendingNotice && (
        <div className="mt-3 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-black/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
                <span className="text-amber-600 text-sm font-bold">!</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{pendingNotice.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Este tipo de problema todavía no tiene un flujo disponible.
                </p>
              </div>
              <button
                onClick={() => setPendingNotice(null)}
                className="flex-shrink-0 p-1 rounded-md hover:bg-slate-100 transition-colors"
                aria-label="Cerrar"
              >
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/problema-libre?q=${encodeURIComponent(pendingNotice.title)}`}
                className="cr-btn-primary text-xs py-2 px-3"
              >
                Describir mi problema
              </Link>
              <button
                onClick={() => setPendingNotice(null)}
                className="cr-btn-ghost text-xs py-2 px-3"
              >
                Volver a buscar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results panel */}
      {isOpen && totalItems > 0 && (
        <div
          ref={panelRef}
          id="search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute z-50 left-0 right-0 mt-3 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-black/10 overflow-hidden animate-scale-in"
        >
          {/* Category filter hint */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Coincidencias
            </p>
          </div>

          {/* Results */}
          <div className="px-2 pb-1">
            {menuItems.map((item, index) => (
              <button
                key={item.kind === "result" ? item.result.problem.slug : "custom"}
                id={`search-item-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                  activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                {item.kind === "result" ? (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.result.problem.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.result.problem.category}
                      </p>
                    </div>
                    {item.result.problem.available ? (
                      <span className="cr-badge bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                        Disponible
                      </span>
                    ) : (
                      <span className="cr-badge bg-slate-100 text-slate-500 flex-shrink-0">
                        Próximamente
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-slate-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Describe tu caso con tus propias palabras
                      </p>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Categories hint */}
          {CATEGORIES.length > 0 && (
            <>
              <div className="mx-5 cr-divider" />
              <div className="px-5 py-3">
                <p className="text-xs text-slate-400 mb-2">Categorías</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <span key={cat} className="cr-tag text-xs">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* No results — show custom entry */}
      {isOpen && hasQuery && results.length === 0 && (
        <div
          ref={panelRef}
          className="absolute z-50 left-0 right-0 mt-3 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-black/10 overflow-hidden animate-scale-in"
        >
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-slate-500 mb-3">No encontramos un módulo exacto para eso.</p>
            <Link
              href={`/problema-libre?q=${encodeURIComponent(query)}`}
              onClick={() => setIsOpen(false)}
              className="cr-btn-primary inline-flex"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Describir mi problema
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
