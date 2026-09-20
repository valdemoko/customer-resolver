/**
 * Case View Page — Consumer Resolver.
 *
 * Displays case results, claims, actions, and sources.
 * Improved: better surface hierarchy, animations, visual clarity.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Claim {
  id: string;
  ruleKey: string;
  status: string;
  assertion: string;
  explanation: string;
  missingFacts: string[];
  contradictedFacts: string[];
}

interface Action {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  status: string;
}

interface Source {
  sourceId: string;
  title: string;
  url: string;
  type: string;
  retrievedAt: string;
}

interface CaseResult {
  caseId: string;
  overallStatus: string;
  summary: string;
  claims: Claim[];
  missingInformation: Array<{ factKey: string; description: string; impact: string }>;
  contradictions: Array<{ factKey: string; description: string }>;
  sources: Source[];
  disclaimers: string[];
}

interface ActionPlan {
  actions: Action[];
  nextStep: string;
  complete: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; border: string; text: string; icon: string; label: string }
> = {
  SUPPORTED: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "✓",
    label: "Confirmado",
  },
  POTENTIALLY_APPLICABLE: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "◐",
    label: "Potencialmente aplicable",
  },
  INSUFFICIENT_DATA: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    icon: "?",
    label: "Datos insuficientes",
  },
  CONTRADICTED: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    icon: "!",
    label: "Información contradictoria",
  },
  NOT_APPLICABLE: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-500",
    icon: "—",
    label: "No aplicable",
  },
  UNKNOWN: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-500",
    icon: "?",
    label: "No determinado",
  },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  COLLECT_INFORMATION: "Recopilar información",
  PRESERVE_EVIDENCE: "Conservar evidencia",
  CONTACT_MERCHANT: "Contactar al proveedor",
  REQUEST_REFUND: "Solicitar reembolso",
  SUBMIT_COMPLAINT: "Presentar reclamación",
  GENERATE_DOCUMENT: "Generar documento",
  WAIT_FOR_RESPONSE: "Esperar respuesta",
  ESCALATE: "Escalar",
};

export default function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const [caseId, setCaseId] = useState<string>("");
  const [result, setResult] = useState<CaseResult | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ caseId: id }) => {
      setCaseId(id);
      loadData(id);
    });
  }, [params]);

  const loadData = async (id: string) => {
    try {
      const [resultRes, actionsRes] = await Promise.all([
        fetch(`/api/cases/${id}/result`),
        fetch(`/api/cases/${id}/actions`),
      ]);

      if (resultRes.ok) {
        const { result: r } = await resultRes.json();
        setResult(r);
      }

      if (actionsRes.ok) {
        const { actionPlan: ap } = await actionsRes.json();
        setActionPlan(ap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading case");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 md:px-8 py-12 md:py-16">
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-slate-500 font-medium">Cargando caso...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-5 md:px-8 py-12 md:py-16">
        <div className="cr-surface p-6 border-l-4 border-red-400">
          <p className="text-red-700 font-medium">{error}</p>
          <Link href="/" className="cr-btn-ghost text-sm mt-4 inline-flex">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = (
    result ? (STATUS_CONFIG[result.overallStatus] ?? STATUS_CONFIG.UNKNOWN) : STATUS_CONFIG.UNKNOWN
  )!;

  return (
    <div className="mx-auto max-w-4xl px-5 md:px-8 py-10 md:py-16">
      {/* Back */}
      <Link href="/" className="cr-btn-ghost text-sm mb-6 -ml-2 inline-flex">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Volver
      </Link>

      {/* Header */}
      <div className="mb-10 animate-fade-in">
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Resultado de tu caso
        </h1>
        {result && (
          <div className="flex items-center gap-3">
            <span
              className={`cr-badge border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}
            >
              {statusConfig.icon} {statusConfig.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">{caseId}</span>
          </div>
        )}
      </div>

      <div className="space-y-10">
        {/* Summary */}
        {result && (
          <section className="animate-fade-in">
            <h2
              className="text-xl font-semibold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Resumen
            </h2>
            <div className="cr-surface p-6">
              <p className="text-slate-600 leading-relaxed">{result.summary}</p>
            </div>
          </section>
        )}

        {/* Claims */}
        {result && result.claims.length > 0 && (
          <section className="animate-fade-in">
            <h2
              className="text-xl font-semibold text-slate-900 mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Qué hemos podido confirmar
            </h2>
            <div className="space-y-3 stagger">
              {result.claims.map((claim) => {
                const cfg = (STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.UNKNOWN)!;
                return (
                  <div key={claim.id} className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}
                      >
                        {cfg.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold ${cfg.text} mb-1`}>{claim.assertion}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {claim.explanation}
                        </p>
                        {claim.missingFacts.length > 0 && (
                          <p className="text-sm text-amber-700 mt-2">
                            Datos faltantes: {claim.missingFacts.join(", ")}
                          </p>
                        )}
                        {claim.contradictedFacts.length > 0 && (
                          <p className="text-sm text-red-700 mt-2">
                            Información contradictoria: {claim.contradictedFacts.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Missing Information */}
        {result && result.missingInformation.length > 0 && (
          <section className="animate-fade-in">
            <h2
              className="text-xl font-semibold text-slate-900 mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Qué no hemos podido confirmar
            </h2>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <ul className="space-y-2.5">
                {result.missingInformation.map((missing) => (
                  <li
                    key={missing.factKey}
                    className="flex items-start gap-2.5 text-sm text-amber-800"
                  >
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center text-xs font-bold">
                      ?
                    </span>
                    <span>{missing.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Actions */}
        {actionPlan && actionPlan.actions.length > 0 && (
          <section className="animate-fade-in">
            <h2
              className="text-xl font-semibold text-slate-900 mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Qué puedes hacer ahora
            </h2>
            <div className="cr-surface p-5 mb-4">
              <p className="text-slate-700 font-medium">{actionPlan.nextStep}</p>
            </div>
            <div className="space-y-2.5 stagger">
              {actionPlan.actions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                    {action.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 mb-1">
                      {ACTION_TYPE_LABELS[action.type] ?? action.type}: {action.title}
                    </h3>
                    <p className="text-sm text-slate-500">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sources */}
        {result && result.sources.length > 0 && (
          <section className="animate-fade-in">
            <h2
              className="text-xl font-semibold text-slate-900 mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Fuentes consultadas
            </h2>
            <div className="space-y-2.5 stagger">
              {result.sources.map((source) => (
                <div key={source.sourceId} className="cr-surface p-4">
                  <h3 className="font-medium text-slate-900 mb-1">{source.title}</h3>
                  <p className="text-sm text-slate-500 mb-2">
                    {source.type} · Consultado: {source.retrievedAt}
                  </p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
                  >
                    Ver fuente externa
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Export */}
        {caseId && (
          <section className="animate-fade-in">
            <a
              href={`/api/cases/${caseId}/export?format=txt`}
              className="cr-btn-secondary inline-flex"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Descargar informe (TXT)
            </a>
          </section>
        )}

        {/* Disclaimers */}
        {result && result.disclaimers.length > 0 && (
          <section className="pt-8 border-t border-slate-200/60 animate-fade-in">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
              Aviso legal
            </h2>
            <ul className="space-y-1.5">
              {result.disclaimers.map((disclaimer, i) => (
                <li key={i} className="text-xs text-slate-400 leading-relaxed">
                  {disclaimer}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
