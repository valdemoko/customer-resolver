/**
 * Free-form problem entry — Consumer Resolver.
 *
 * For problems not yet covered by a specific module.
 * Classifies intent, detects if it matches a supported problem,
 * and provides a structured entry point.
 *
 * No promises of automatic resolution for unsupported problems.
 */
"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const KNOWN_SLUGS = [
  {
    slug: "cancellation-charge",
    keywords: [
      "cancelar",
      "cancelación",
      "cobrado",
      "cargo",
      "factura",
      "permanencia",
      "internet",
      "móvil",
      "telefonía",
    ],
    title: "Cancelación y cargos posteriores",
    available: true,
  },
] as const;

function detectMatch(text: string): (typeof KNOWN_SLUGS)[number] | null {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let bestScore = 0;
  let bestMatch: (typeof KNOWN_SLUGS)[number] | null = null;
  for (const entry of KNOWN_SLUGS) {
    let score = 0;
    for (const kw of entry.keywords) {
      const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(kwNorm)) score++;
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestMatch;
}

function ProblemForm() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [description, setDescription] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(false);

  const match = useMemo(
    () => (description.length >= 5 ? detectMatch(description) : null),
    [description],
  );

  if (submitted) {
    return (
      <div className="animate-fade-in">
        <div className="cr-surface p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-xl font-bold text-slate-900 mb-2"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Hemos leído tu descripción
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Todavía no existe un flujo automático para este tipo de problema. No se ha creado ni
                guardado ningún caso.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-1">
              Tu descripción
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
          </div>

          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            Cuando añadamos nuevos módulos de problemas, casos como el tuyo podrán analizarse con
            más profundidad. Mientras tanto, puedes consultar directamente la normativa aplicable o
            contactar con una asociación de consumidores.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/" className="cr-btn-primary">
              Volver al inicio
            </Link>
            <button onClick={() => setSubmitted(false)} className="cr-btn-secondary">
              Modificar descripción
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="El lunes cancelé mi contrato de internet por teléfono. Me dijeron que estaba hecho. Pero esta mañana me han cobrado 80 euros en mi cuenta..."
        className="cr-input min-h-[200px] resize-y leading-relaxed"
        aria-label="Describe tu problema"
      />

      {/* Auto-detected match */}
      {match && match.available && (
        <div className="mt-4 cr-surface p-4 animate-scale-in">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Parece que podemos ayudarte directamente
          </p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{match.title}</p>
            </div>
            <Link
              href={`/case/new?problem=${match.slug}`}
              className="cr-btn-primary text-sm flex-shrink-0"
            >
              Usar este módulo
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setSubmitted(true)}
          disabled={description.trim().length < 10}
          className="cr-btn-primary"
        >
          Continuar
        </button>
        <Link href="/" className="cr-btn-secondary">
          Volver
        </Link>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Esta entrada nos ayuda a entender qué problemas necesitan nuevos módulos. No constituye un
        caso activo ni asesoría legal.
      </p>
    </div>
  );
}

export default function FreeProblemPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cuéntanos qué ha pasado
        </h1>
        <p className="text-slate-500 leading-relaxed">
          No necesitas saber cómo se llama el problema. Explícalo con tus palabras y haremos lo
          posible para orientarte.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="cr-surface p-12 text-center">
            <div className="loading-shimmer h-40 rounded-lg" />
          </div>
        }
      >
        <ProblemForm />
      </Suspense>
    </div>
  );
}
