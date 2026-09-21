/**
 * Case View Page — Resolveo (F13 Enhanced).
 *
 * Displays case results, claims, actions, sources, timeline, communications,
 * and provides case management controls (reanalyze, escalate, close).
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────

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

interface TimelineEvent {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  description: string;
}

interface Communication {
  id: string;
  direction: string;
  channel: string;
  counterparty: string;
  subject?: string;
  summary: string;
  linkedEvidenceIds: string[];
  occurredAt: string;
  createdAt: string;
}

interface CaseSummary {
  case: {
    id: string;
    problemSlug: string;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  timeline: {
    totalEvents: number;
    recentEvents: TimelineEvent[];
  };
}

// ── Configuration ──────────────────────────────────────────────────

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

const CASE_STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  DRAFT: { bg: "bg-slate-100", text: "text-slate-600", label: "Borrador" },
  COLLECTING_INFORMATION: { bg: "bg-blue-100", text: "text-blue-700", label: "Recopilando información" },
  READY_FOR_ANALYSIS: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Listo para analizar" },
  ANALYZING_X: { bg: "bg-purple-100", text: "text-purple-700", label: "Analizando" },
  NEEDS_INFORMATION: { bg: "bg-amber-100", text: "text-amber-700", label: "Necesita información" },
  HAS_CONTRADICTIONS: { bg: "bg-red-100", text: "text-red-700", label: "Contradicciones" },
  RESULT_AVAILABLE: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Resultado disponible" },
  ACTION_IN_PROGRESS: { bg: "bg-cyan-100", text: "text-cyan-700", label: "Acción en progreso" },
  AWAITING_RESPONSE: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Esperando respuesta" },
  ESCALATED: { bg: "bg-orange-100", text: "text-orange-700", label: "Escalado" },
  CLOSED: { bg: "bg-slate-200", text: "text-slate-600", label: "Cerrado" },
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

const EVENT_ICONS: Record<string, string> = {
  CASE_CREATED: "📋",
  CASE_STATUS_CHANGED: "🔄",
  FACT_ADDED: "✅",
  FACT_UPDATED: "📝",
  FACT_SUPERSEDED: "🔄",
  CONTRADICTION_DETECTED: "⚠️",
  CONTRADICTION_RESOLVED: "✓",
  EVIDENCE_CREATED: "📎",
  EVIDENCE_STATUS_CHANGED: "📎",
  EVIDENCE_REPLACED: "🔄",
  EVIDENCE_LINKED_TO_FACT: "🔗",
  EVIDENCE_UNLINKED_FROM_FACT: "🔗",
  SNAPSHOT_CREATED: "📊",
  CASE_UPDATED: "📝",
  DOCUMENT_UPLOADED: "📄",
  ANALYSIS_RECALCULATED: "🔄",
  DOCUMENT_GENERATED: "📄",
  DOCUMENT_FINALIZED: "✅",
  COMMUNICATION_RECORDED: "💬",
  FOLLOW_UP_CREATED: "📅",
  CASE_ESCALATED: "⬆️",
  CASE_REOPENED: "🔓",
  CASE_CLOSED: "🔒",
};

// ── Component ──────────────────────────────────────────────────────

export default function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const [caseId, setCaseId] = useState<string>("");
  const [result, setResult] = useState<CaseResult | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showAddCommunication, setShowAddCommunication] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | "timeline" | "communications">("result");

  useEffect(() => {
    params.then(({ caseId: id }) => {
      setCaseId(id);
      loadData(id);
    });
  }, [params]);

  const loadData = async (id: string) => {
    try {
      const [resultRes, actionsRes, summaryRes, timelineRes, commsRes] = await Promise.all([
        fetch(`/api/cases/${id}/result`),
        fetch(`/api/cases/${id}/actions`),
        fetch(`/api/cases/${id}`),
        fetch(`/api/cases/${id}/timeline`),
        fetch(`/api/cases/${id}/communications`),
      ]);

      if (resultRes.ok) {
        const { result: r } = await resultRes.json();
        setResult(r);
      }

      if (actionsRes.ok) {
        const { actionPlan: ap } = await actionsRes.json();
        setActionPlan(ap);
      }

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setCaseSummary(data);
      }

      if (timelineRes.ok) {
        const data = await timelineRes.json();
        setTimeline(data.events ?? []);
      }

      if (commsRes.ok) {
        const data = await commsRes.json();
        setCommunications(data.communications ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading case");
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyze = useCallback(async () => {
    if (!caseId || reanalyzing) return;
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/reanalyze`, { method: "POST" });
      if (res.ok) {
        // Reload data to show updated results
        await loadData(caseId);
      }
    } finally {
      setReanalyzing(false);
    }
  }, [caseId, reanalyzing]);

  const handleTransition = useCallback(
    async (event: string, reason?: string) => {
      if (!caseId) return;
      const res = await fetch(`/api/cases/${caseId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, reason }),
      });
      if (res.ok) {
        await loadData(caseId);
      }
    },
    [caseId],
  );

  // ── Loading / Error States ─────────────────────────────────────

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

  // ── Derived State ──────────────────────────────────────────────

  const caseStatus = caseSummary?.case?.status ?? "UNKNOWN";
  const statusConfig = (CASE_STATUS_CONFIG[caseStatus] ?? CASE_STATUS_CONFIG.DRAFT)!;
  const claimStatusConfig = (
    result ? (STATUS_CONFIG[result.overallStatus] ?? STATUS_CONFIG.UNKNOWN) : STATUS_CONFIG.UNKNOWN
  )!;

  const canEscalate = ["RESULT_AVAILABLE", "ACTION_IN_PROGRESS", "AWAITING_RESPONSE"].includes(caseStatus);
  const canClose = caseStatus !== "CLOSED";
  const canReopen = caseStatus === "CLOSED";
  const canReanalyze = ["RESULT_AVAILABLE", "ACTION_IN_PROGRESS", "AWAITING_RESPONSE", "ESCALATED"].includes(caseStatus);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-5 md:px-8 py-10 md:py-16">
      {/* Back */}
      <Link href="/" className="cr-btn-ghost text-sm mb-6 -ml-2 inline-flex">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Volver
      </Link>

      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Resultado de tu caso
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`cr-badge border ${statusConfig.bg} ${statusConfig.text}`}>
            {statusConfig.label}
          </span>
          {result && (
            <span className={`cr-badge border ${claimStatusConfig.bg} ${claimStatusConfig.border} ${claimStatusConfig.text}`}>
              {claimStatusConfig.icon} {claimStatusConfig.label}
            </span>
          )}
          <span className="text-xs text-slate-400 font-mono">{caseId}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-slate-200">
        {[
          { key: "result" as const, label: "Resultado", count: result?.claims.length },
          { key: "timeline" as const, label: "Cronología", count: timeline.length },
          { key: "communications" as const, label: "Comunicaciones", count: communications.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 text-xs bg-slate-100 px-1.5 py-0.5 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Result Tab ───────────────────────────────────────────── */}
      {activeTab === "result" && (
        <div className="space-y-10">
          {/* Summary */}
          {result && (
            <section className="animate-fade-in">
              <h2 className="text-xl font-semibold text-slate-900 mb-3" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
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
              <h2 className="text-xl font-semibold text-slate-900 mb-4" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                Qué hemos podido confirmar
              </h2>
              <div className="space-y-3 stagger">
                {result.claims.map((claim) => {
                  const cfg = (STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.UNKNOWN)!;
                  return (
                    <div key={claim.id} className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-start gap-3">
                        <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                          {cfg.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold ${cfg.text} mb-1`}>{claim.assertion}</h3>
                          <p className="text-sm text-slate-600 leading-relaxed">{claim.explanation}</p>
                          {claim.missingFacts.length > 0 && (
                            <p className="text-sm text-amber-700 mt-2">Datos faltantes: {claim.missingFacts.join(", ")}</p>
                          )}
                          {claim.contradictedFacts.length > 0 && (
                            <p className="text-sm text-red-700 mt-2">Información contradictoria: {claim.contradictedFacts.join(", ")}</p>
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
              <h2 className="text-xl font-semibold text-slate-900 mb-4" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                Qué no hemos podido confirmar
              </h2>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <ul className="space-y-2.5">
                  {result.missingInformation.map((missing) => (
                    <li key={missing.factKey} className="flex items-start gap-2.5 text-sm text-amber-800">
                      <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center text-xs font-bold">?</span>
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
              <h2 className="text-xl font-semibold text-slate-900 mb-4" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                Qué puedes hacer ahora
              </h2>
              <div className="cr-surface p-5 mb-4">
                <p className="text-slate-700 font-medium">{actionPlan.nextStep}</p>
              </div>
              <div className="space-y-2.5 stagger">
                {actionPlan.actions.map((action) => (
                  <div key={action.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors">
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
              <h2 className="text-xl font-semibold text-slate-900 mb-4" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                Fuentes consultadas
              </h2>
              <div className="space-y-2.5 stagger">
                {result.sources.map((source) => (
                  <div key={source.sourceId} className="cr-surface p-4">
                    <h3 className="font-medium text-slate-900 mb-1">{source.title}</h3>
                    <p className="text-sm text-slate-500 mb-2">{source.type} · Consultado: {source.retrievedAt}</p>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors">
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
              <a href={`/api/cases/${caseId}/export?format=txt`} className="cr-btn-secondary inline-flex">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Descargar informe (TXT)
              </a>
            </section>
          )}

          {/* Disclaimers */}
          {result && result.disclaimers.length > 0 && (
            <section className="pt-8 border-t border-slate-200/60 animate-fade-in">
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Aviso legal</h2>
              <ul className="space-y-1.5">
                {result.disclaimers.map((disclaimer, i) => (
                  <li key={i} className="text-xs text-slate-400 leading-relaxed">{disclaimer}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Timeline Tab ─────────────────────────────────────────── */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          {timeline.length === 0 ? (
            <div className="cr-surface p-8 text-center">
              <p className="text-slate-500">No hay eventos registrados aún.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {timeline.map((event) => (
                  <div key={event.id} className="relative pl-10 animate-fade-in">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-slate-200 border-2 border-white" />
                    <div className="cr-surface p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="text-lg mr-2">{EVENT_ICONS[event.type] ?? "📌"}</span>
                          <span className="font-medium text-slate-900">{event.description}</span>
                        </div>
                        <time className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(event.occurredAt).toLocaleString("es-ES", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Communications Tab ───────────────────────────────────── */}
      {activeTab === "communications" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddCommunication(!showAddCommunication)}
              className="cr-btn-primary text-sm"
            >
              + Registrar comunicación
            </button>
          </div>

          {showAddCommunication && (
            <AddCommunicationForm
              caseId={caseId}
              onSaved={() => {
                setShowAddCommunication(false);
                loadData(caseId);
              }}
            />
          )}

          {communications.length === 0 ? (
            <div className="cr-surface p-8 text-center">
              <p className="text-slate-500">No hay comunicaciones registradas.</p>
              <p className="text-sm text-slate-400 mt-1">Registra correos, llamadas u otros contactos con el proveedor.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {communications.map((comm) => (
                <div key={comm.id} className="cr-surface p-4 animate-fade-in">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          comm.direction === "SENT" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {comm.direction === "SENT" ? "Enviado" : "Recibido"}
                        </span>
                        <span className="text-xs text-slate-400">{comm.channel}</span>
                      </div>
                      <p className="font-medium text-slate-900">{comm.counterparty}</p>
                      {comm.subject && <p className="text-sm text-slate-600 mt-1">{comm.subject}</p>}
                      <p className="text-sm text-slate-500 mt-1">{comm.summary}</p>
                    </div>
                    <time className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(comm.occurredAt).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Case Controls ────────────────────────────────────────── */}
      <div className="mt-10 pt-8 border-t border-slate-200">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Acciones del caso</h2>
        <div className="flex flex-wrap gap-3">
          {canReanalyze && (
            <button onClick={handleReanalyze} disabled={reanalyzing} className="cr-btn-secondary text-sm">
              {reanalyzing ? "Recalculando..." : "🔄 Recalcular análisis"}
            </button>
          )}
          {canEscalate && (
            <button onClick={() => handleTransition("ESCALATE")} className="cr-btn-secondary text-sm">
              ⬆️ Escalar caso
            </button>
          )}
          {canClose && (
            <button onClick={() => handleTransition("CLOSE_CASE")} className="cr-btn-secondary text-sm">
              🔒 Cerrar caso
            </button>
          )}
          {canReopen && (
            <button onClick={() => handleTransition("REOPEN")} className="cr-btn-secondary text-sm">
              🔓 Reabrir caso
            </button>
          )}
          {caseId && (
            <a href={`/api/cases/${caseId}/export?format=txt`} className="cr-btn-ghost text-sm">
              📥 Descargar informe
            </a>
          )}
          {caseId && (
            <a href={`/api/cases/${caseId}/data`} className="cr-btn-ghost text-sm">
              📦 Exportar datos (JSON)
            </a>
          )}
          {caseId && (
            <button
              onClick={() => {
                if (confirm("¿Estás seguro de que quieres eliminar este caso permanentemente? Esta acción no se puede deshacer.")) {
                  fetch(`/api/cases/${caseId}/delete`, { method: "DELETE" })
                    .then((res) => {
                      if (res.ok) {
                        window.location.href = "/";
                      } else {
                        alert("Error al eliminar el caso");
                      }
                    })
                    .catch(() => alert("Error al eliminar el caso"));
                }
              }}
              className="cr-btn-ghost text-sm text-red-600 hover:text-red-700"
            >
              🗑️ Eliminar caso
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Communication Form ─────────────────────────────────────────

function AddCommunicationForm({
  caseId,
  onSaved,
}: {
  caseId: string;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState("SENT");
  const [channel, setChannel] = useState("EMAIL");
  const [counterparty, setCounterparty] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterparty || !summary) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, channel, counterparty, subject, summary }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cr-surface p-5 space-y-4 animate-fade-in">
      <h3 className="font-medium text-slate-900">Nueva comunicación</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Dirección</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="SENT">Enviado</option>
            <option value="RECEIVED">Recibido</option>
            <option value="PHONE_CALL">Llamada telefónica</option>
            <option value="IN_PERSON">En persona</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Canal</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="EMAIL">Email</option>
            <option value="LETTER">Carta</option>
            <option value="PHONE">Teléfono</option>
            <option value="ONLINE_FORM">Formulario web</option>
            <option value="IN_PERSON">En persona</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Contraparte</label>
        <input
          type="text"
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Nombre del comercio/proveedor"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Asunto (opcional)</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Asunto del email, tema de la llamada..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Resumen</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Describe brevemente la comunicación..."
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          required
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="cr-btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar comunicación"}
        </button>
        <button type="button" onClick={onSaved} className="cr-btn-ghost text-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}
