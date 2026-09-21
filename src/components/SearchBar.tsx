"use client";

/**
 * SearchBar — Resolveo.
 *
 * AI-powered search entry point for consumer problems.
 * Connects to the intake API for real analysis.
 *
 * Design: Clean, editorial, premium input.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  searchProblems as catalogueSearch,
  type ProblemCatalogueEntry,
} from "@/lib/problem-catalogue";

/* ── Component ───────────────────────────────────────────────────── */

interface SearchBarProps {
  size?: "default" | "large";
  autoFocus?: boolean;
  initialQuery?: string;
}

export function SearchBar({ size = "default", autoFocus = false, initialQuery }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length >= 2 ? catalogueSearch(query) : [];
  const hasQuery = query.trim().length > 0;

  type MenuItem =
    | { kind: "result"; problem: ProblemCatalogueEntry }
    | { kind: "ai"; label: string };

  const menuItems: MenuItem[] = [
    ...results.map((p) => ({ kind: "result" as const, problem: p })),
    ...(hasQuery
      ? [{ kind: "ai" as const, label: "Analizar con IA" }]
      : []),
  ];

  const totalItems = menuItems.length;

  const handleSelect = useCallback(
    (item: MenuItem) => {
      setIsOpen(false);
      setIsLoading(true);

      const message =
        item.kind === "result"
          ? `${item.problem.title} — ${query}`
          : query;

      fetch("/api/intake/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Interpretation failed");
          return res.json();
        })
        .then((data) => {
          if (data.caseId && data.interpretation) {
            sessionStorage.setItem(
              `intake-${data.caseId}`,
              JSON.stringify({
                interpretation: data.interpretation,
                routing: data.routing,
                budget: data.budget,
              }),
            );
            window.location.href = `/case/${data.caseId}/intake`;
          } else {
            window.location.href = `/resolver?q=${encodeURIComponent(query)}`;
          }
        })
        .catch(() => {
          window.location.href = `/resolver?q=${encodeURIComponent(query)}`;
        });
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
            handleSelect({ kind: "ai", label: "Analizar con IA" });
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
    <div className="relative w-full z-50">
      {/* Input container */}
      <div
        className={`relative flex items-center transition-all duration-200 ${
          isOpen
            ? "ring-2 ring-[var(--color-accent)]/20 shadow-[var(--shadow-elevated)]"
            : "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]"
        } rounded-lg bg-[var(--surface-paper)] border border-[var(--border-light)]`}
      >
        {/* Search icon */}
        <div className="pl-4 pr-2 flex-shrink-0">
          <svg
            className={`w-4 h-4 transition-colors ${isOpen ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
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
              ? "Describe tu problema de consumo..."
              : "Describe tu problema..."
          }
          className={`w-full bg-transparent border-none outline-none font-[var(--font-body)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] ${
            isLarge ? "py-4 pr-4 pl-2 text-[15px]" : "py-3.5 pr-4 pl-2 text-sm"
          }`}
          role="combobox"
          aria-expanded={isOpen && totalItems > 0}
          aria-controls="search-results"
          aria-activedescendant={
            activeIndex >= 0 ? `search-item-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-label="Buscar problema de consumo"
          autoFocus={autoFocus}
        />

        {/* Submit button */}
        {hasQuery && (
          <button
            onClick={() =>
              handleSelect({ kind: "ai", label: "Analizar con IA" })
            }
            disabled={isLoading}
            className="mr-3 px-4 py-2 bg-[var(--color-ink)] text-white text-xs font-medium rounded hover:bg-[var(--color-ink-soft)] transition-colors flex-shrink-0 disabled:opacity-50"
            aria-label="Analizar con IA"
          >
            {isLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Analizar"
            )}
          </button>
        )}
      </div>

      {/* Results panel */}
      {isOpen && totalItems > 0 && (
        <div
          ref={panelRef}
          id="search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="absolute z-[100] left-0 right-0 mt-2 bg-white border border-[var(--border-light)] shadow-[var(--shadow-elevated)] overflow-hidden anim-scale-in"
        >
          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border-light)]">
            <p className="text-[10px] font-medium text-[var(--color-ink-faint)] uppercase tracking-widest">
              {results.length > 0 ? "Problemas encontrados" : "Opciones"}
            </p>
          </div>

          {/* Results */}
          <div className="py-1">
            {menuItems.map((item, index) => (
              <button
                key={
                  item.kind === "result" ? item.problem.slug : "ai-option"
                }
                id={`search-item-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeIndex === index ? "bg-[var(--surface-warm)]" : "hover:bg-[var(--surface-warm)]"
                }`}
              >
                {item.kind === "result" ? (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-ink)] truncate">
                        {item.problem.title}
                      </p>
                      <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">
                        {item.problem.category}
                      </p>
                    </div>
                    <span className="text-[10px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded flex-shrink-0">
                      Resolver
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-ink)]">
                        Analizar con IA
                      </p>
                      <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">
                        Describe tu caso y lo analizaremos
                      </p>
                    </div>
                    <span className="text-[10px] font-medium text-[var(--color-ink-muted)] bg-[var(--surface-warm)] px-2 py-0.5 rounded flex-shrink-0">
                      Nuevo
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Hint */}
          <div className="px-4 py-2.5 border-t border-[var(--border-light)] bg-[var(--surface-warm)]/50">
            <p className="text-[11px] text-[var(--color-ink-faint)]">
              Presiona Enter para analizar con IA
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
