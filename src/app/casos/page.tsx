/**
 * Case Lookup — Resolveo.
 *
 * Lets users retrieve an existing case by its ID.
 * Without full authentication, this provides a direct lookup mechanism.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CasesPage() {
  const [caseId, setCaseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = caseId.trim();
    if (!trimmed) {
      setError("Introduce un identificador de caso.");
      return;
    }

    // Basic format validation (UUID-like)
    if (trimmed.length < 8) {
      setError("El identificador parece demasiado corto. Revisa que lo has copiado completo.");
      return;
    }

    router.push(`/case/${trimmed}`);
  };

  return (
    <div className="mx-auto max-w-xl px-5 md:px-8 py-12 md:py-16">
      <div className="mb-8">
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Consultar un caso
        </h1>
        <p className="text-slate-500 leading-relaxed">
          Introduce el identificador de tu caso para ver su estado, resultados y acciones
          disponibles.
        </p>
      </div>

      <form onSubmit={handleLookup} className="animate-fade-in">
        <div className="cr-surface p-6">
          <label htmlFor="case-id" className="block text-sm font-medium text-slate-700 mb-2">
            Identificador del caso
          </label>
          <input
            id="case-id"
            type="text"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="Ej: a1b2c3d4-e5f6-..."
            className="cr-input"
            autoFocus
          />

          {error && <p className="mt-3 text-sm text-red-600 animate-fade-in">{error}</p>}

          <button type="submit" className="cr-btn-primary mt-4 w-full">
            Buscar caso
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
        </div>
      </form>

      <div className="mt-6 text-sm text-slate-400">
        <p>
          ¿No tienes un identificador?{" "}
          <Link
            href="/"
            className="text-slate-600 hover:text-slate-900 underline underline-offset-2 transition-colors"
          >
            Comienza un nuevo caso
          </Link>
        </p>
      </div>
    </div>
  );
}
