/**
 * Case Intake Flow — Resolveo (Fase 8.3).
 *
 * Progressive intake: user description → AI interpretation → questions → confirmation → analysis.
 *
 * Flow:
 *   1. User arrives with a caseId (created by SearchBar → /api/intake/interpret)
 *   2. System shows interpretation summary + first question
 *   3. User answers questions one at a time
 *   4. When all required facts confirmed → redirect to results
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────

interface IntakeInterpretation {
  summary: string;
  candidateModules: Array<{
    problemKey: string;
    signals: string[];
    matchedRequiredFacts: string[];
    missingRequiredFacts: string[];
    confidence: string;
  }>;
  factCandidates: Array<{
    candidateId: string;
    factKey: string;
    proposedValue: { type: string; value: unknown };
    sourceText: string;
    aiInterpretation: string;
    certainty: string;
    problemKey: string;
    status: string;
  }>;
  missingInformation: Array<{
    factKey: string;
    questionHint: string;
    priority: string;
  }>;
  entities: Array<{
    type: string;
    rawText: string;
    normalizedValue?: string;
  }>;
  jurisdictionHints: Array<{
    jurisdiction: string;
    confidence: string;
  }>;
}

interface RoutingDecision {
  status: string;
  moduleKey?: string;
  moduleTitle?: string;
  userExplanation: string;
}

interface Question {
  factKey: string;
  questionText: string;
  reason: string;
  priority: string;
  remainingCount: number;
}

interface IntakeState {
  caseId: string;
  phase: "loading" | "interpretation" | "questioning" | "analyzing" | "complete" | "error";
  interpretation: IntakeInterpretation | null;
  routing: RoutingDecision | null;
  nextQuestion: Question | null;
  allRequiredConfirmed: boolean;
  budget: { current: number; max: number } | null;
  error: string | null;
  // Evidence files pending upload
  evidenceFiles: File[];
  evidenceUploaded: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildValueInput(factKey: string, answer: string): { type: string; value: unknown } {
  // Map fact keys to appropriate value types
  if (factKey.includes("date") || factKey.includes("delivery")) {
    return { type: "date", value: answer };
  }
  if (factKey.includes("amount") || factKey.includes("price")) {
    const num = parseFloat(answer.replace(/[€$,]/g, ""));
    return { type: "number", value: isNaN(num) ? 0 : num };
  }
  if (factKey.includes("is_used") || factKey.includes("has_") || factKey.includes("completed")) {
    const lower = answer.toLowerCase().trim();
    return {
      type: "boolean",
      value: lower === "sí" || lower === "si" || lower === "yes" || lower === "true",
    };
  }
  return { type: "string", value: answer };
}

// ── Component ────────────────────────────────────────────────────────

export default function IntakePage({ params }: { params: Promise<{ caseId: string }> }) {
  const [caseId, setCaseId] = useState<string>("");
  const [state, setState] = useState<IntakeState>({
    caseId: "",
    phase: "loading",
    interpretation: null,
    routing: null,
    nextQuestion: null,
    allRequiredConfirmed: false,
    budget: null,
    error: null,
    evidenceFiles: [],
    evidenceUploaded: false,
  });
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initialize case ID from params + load the case status from the server.
  //
  // This used to read a cached interpretation from `sessionStorage` that the
  // search bar wrote. The search bar now sends known problems to `/resolver`
  // deterministically and free text there too, so nothing writes that key: the
  // cache read was dead code, and the case status is the single source of truth.
  useEffect(() => {
    params.then(({ caseId: id }) => {
      setCaseId(id);
      loadCaseStatus(id);
    });
  }, [params]);

  const loadCaseStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/cases/${id}/intake`);
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: "No se pudo cargar el caso. Verifica el identificador.",
        }));
        return;
      }
      const data = await res.json();

      // Case exists and has facts — show questioning phase
      if (data.confirmedFacts && data.confirmedFacts.length > 0) {
        setState((prev) => ({
          ...prev,
          caseId: id,
          phase: data.allRequiredConfirmed ? "complete" : "questioning",
          nextQuestion: data.nextQuestion,
          allRequiredConfirmed: data.allRequiredConfirmed,
        }));
      } else if (data.problemKey && data.problemKey !== "unknown") {
        // Case has a module but no facts — need interpretation first
        // This shouldn't normally happen, but handle gracefully
        setState((prev) => ({
          ...prev,
          caseId: id,
          phase: "questioning",
          nextQuestion: data.nextQuestion,
          routing: {
            status: "ROUTED",
            moduleKey: data.problemKey,
            moduleTitle: data.problemKey,
            userExplanation: "",
          },
        }));
      } else {
        // Case created but no interpretation yet — this is the initial state
        // The interpretation was done in the API but we need to re-fetch it
        // For now, show the initial state
        setState((prev) => ({
          ...prev,
          caseId: id,
          phase: "questioning",
          nextQuestion: data.nextQuestion,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: "Error de conexión. Inténtalo de nuevo.",
      }));
    }
  };

  const handleConfirmAnswer = useCallback(async () => {
    if (!caseId || !state.nextQuestion || !answer.trim()) return;

    setSubmitting(true);
    try {
      const value = buildValueInput(state.nextQuestion.factKey, answer.trim());
      const res = await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          candidateId: `intake-${state.nextQuestion.factKey}`,
          factKey: state.nextQuestion.factKey,
          decision: "confirm",
          value,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          setState((prev) => ({
            ...prev,
            error: "El caso fue modificado concurrently. Recargando...",
          }));
          await loadCaseStatus(caseId);
          return;
        }
        setState((prev) => ({
          ...prev,
          error: err.error?.message || "No se pudo confirmar el dato.",
        }));
        return;
      }

      await res.json();

      // Fact confirmed — load next question
      setAnswer("");
      const intakeRes = await fetch(`/api/cases/${caseId}/intake`);
      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        setState((prev) => ({
          ...prev,
          phase: intakeData.allRequiredConfirmed ? "complete" : "questioning",
          nextQuestion: intakeData.nextQuestion,
          allRequiredConfirmed: intakeData.allRequiredConfirmed,
          error: null,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Error de conexión al confirmar.",
      }));
    } finally {
      setSubmitting(false);
    }
  }, [caseId, state.nextQuestion, answer]);

  const handleSkipQuestion = useCallback(async () => {
    if (!caseId || !state.nextQuestion) return;

    setSubmitting(true);
    try {
      await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          candidateId: `intake-${state.nextQuestion.factKey}`,
          factKey: state.nextQuestion.factKey,
          decision: "reject",
        }),
      });

      // Load next question
      const intakeRes = await fetch(`/api/cases/${caseId}/intake`);
      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        setAnswer("");
        setState((prev) => ({
          ...prev,
          phase: intakeData.allRequiredConfirmed ? "complete" : "questioning",
          nextQuestion: intakeData.nextQuestion,
          allRequiredConfirmed: intakeData.allRequiredConfirmed,
          error: null,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Error al omitir la pregunta.",
      }));
    } finally {
      setSubmitting(false);
    }
  }, [caseId, state.nextQuestion]);

  // ── Render states ──────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-5 md:px-8 py-16 text-center">
        <div className="w-10 h-10 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-5" />
        <p className="text-slate-500 font-medium">Cargando caso...</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-2xl px-5 md:px-8 py-12 md:py-16">
        <div className="cr-surface p-8 border-l-4 border-red-400">
          <p className="text-red-700 font-medium mb-4">{state.error}</p>
          <div className="flex gap-3">
            <Link href="/" className="cr-btn-primary text-sm">
              Volver al inicio
            </Link>
            <button onClick={() => loadCaseStatus(caseId)} className="cr-btn-secondary text-sm">
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "complete") {
    return (
      <div className="mx-auto max-w-2xl px-5 md:px-8 py-12 md:py-16">
        <div className="text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1
            className="text-2xl md:text-3xl font-bold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Información completa
          </h1>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Tenemos toda la información necesaria. Ahora analizaremos tu caso con la normativa
            aplicable.
          </p>

          {/* Evidence upload before analysis */}
          <div className="cr-surface p-6 mb-6 text-left max-w-md mx-auto">
            <p className="text-sm font-medium text-slate-700 mb-3">
              Documentos de soporte (opcional)
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Facturas, correos o contratos pueden fortalecer tu caso.
            </p>
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 transition-colors"
              onClick={() => document.getElementById("evidence-input")?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                setState((prev) => ({ ...prev, evidenceFiles: [...prev.evidenceFiles, ...files] }));
              }}
            >
              <input
                id="evidence-input"
                type="file"
                multiple
                accept=".pdf,.txt,.csv,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setState((prev) => ({ ...prev, evidenceFiles: [...prev.evidenceFiles, ...files] }));
                }}
              />
              <svg className="w-8 h-8 text-slate-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-sm text-slate-500">Arrastra o haz clic para adjuntar</p>
              <p className="text-xs text-slate-400 mt-1">PDF, TXT, JPG, PNG</p>
            </div>
            {state.evidenceFiles.length > 0 && (
              <ul className="mt-3 space-y-1">
                {state.evidenceFiles.map((f, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {f.name}
                    <button
                      onClick={() => {
                        setState((prev) => ({
                          ...prev,
                          evidenceFiles: prev.evidenceFiles.filter((_, j) => j !== i),
                        }));
                      }}
                      className="text-slate-400 hover:text-red-500 ml-auto"
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <a href={`/case/${caseId}`} className="cr-btn-primary">
            Ver resultado
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
          </a>
        </div>
      </div>
    );
  }

  // ── Interpretation phase ────────────────────────────────────────

  if (state.phase === "interpretation" && state.interpretation) {
    const interp = state.interpretation;
    const routing = state.routing;

    return (
      <div className="mx-auto max-w-2xl px-5 md:px-8 py-10 md:py-16">
        <Link href="/" className="cr-btn-ghost text-sm mb-6 -ml-2 inline-flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Volver
        </Link>

        <div className="animate-fade-in">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
            Hemos entendido lo siguiente
          </h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Revisa la información detectada. Podemos hacer preguntas adicionales para completar los datos.
          </p>

          {/* Problem detected */}
          {routing?.moduleTitle && (
            <div className="cr-surface p-5 mb-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Problema detectado</p>
              <p className="text-base font-semibold text-slate-900">{routing.moduleTitle}</p>
              {routing.userExplanation && (
                <p className="text-sm text-slate-500 mt-1">{routing.userExplanation}</p>
              )}
            </div>
          )}

          {/* Summary */}
          {interp.summary && (
            <div className="cr-surface p-5 mb-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Resumen</p>
              <p className="text-sm text-slate-600 leading-relaxed">{interp.summary}</p>
            </div>
          )}

          {/* Fact candidates */}
          {interp.factCandidates.length > 0 && (
            <div className="cr-surface p-5 mb-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Datos detectados</p>
              <div className="space-y-2">
                {interp.factCandidates.map((fact) => (
                  <div key={fact.candidateId} className="flex items-center gap-3 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="font-medium text-slate-700">{fact.factKey}:</span>
                    <span className="text-slate-500">{String(fact.proposedValue.value)}</span>
                    <span className="text-xs text-slate-400">({fact.certainty})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing information */}
          {interp.missingInformation.length > 0 && (
            <div className="cr-surface p-5 mb-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Necesitamos confirmar</p>
              <div className="space-y-2">
                {interp.missingInformation.map((info) => (
                  <div key={info.factKey} className="flex items-start gap-3 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    <span className="text-slate-600">{info.questionHint}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget info */}
          {state.budget && (
            <p className="text-xs text-slate-400 mb-6">
              Interpretes restantes: {state.budget.max - state.budget.current} de {state.budget.max}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setState((prev) => ({ ...prev, phase: "questioning" }));
              }}
              className="cr-btn-primary"
            >
              Completar datos
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-400">
            La información detectada es orientativa. Necesitamos confirmarla antes de analizar tu caso.
          </p>
        </div>
      </div>
    );
  }

  // ── Questioning phase ──────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-5 md:px-8 py-10 md:py-16">
      {/* Back link */}
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
      <div className="mb-8 animate-fade-in">
        <h1
          className="text-2xl md:text-3xl font-bold text-slate-900 mb-2"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Vamos a comprobar los datos
        </h1>
        <p className="text-slate-500 leading-relaxed">
          Para analizar tu caso necesitamos confirmar algunos datos. Responde con la información que
          tengas.
        </p>
      </div>

      {/* Module routing info */}
      {state.routing && state.routing.moduleTitle && (
        <div className="cr-surface p-4 mb-6 animate-fade-in">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            Problema detectado
          </p>
          <p className="text-sm font-medium text-slate-900">{state.routing.moduleTitle}</p>
          {state.routing.userExplanation && (
            <p className="text-sm text-slate-500 mt-1">{state.routing.userExplanation}</p>
          )}
        </div>
      )}

      {/* Current question */}
      {state.nextQuestion && (
        <div className="animate-fade-in">
          <div className="cr-surface p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-sm font-bold text-slate-600">?</span>
              </div>
              <div>
                <p className="text-base font-medium text-slate-900 leading-relaxed">
                  {state.nextQuestion.questionText}
                </p>
                {state.nextQuestion.remainingCount > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Quedan {state.nextQuestion.remainingCount} pregunta
                    {state.nextQuestion.remainingCount !== 1 ? "s" : ""} más
                  </p>
                )}
              </div>
            </div>

            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && answer.trim()) {
                  handleConfirmAnswer();
                }
              }}
              placeholder="Escribe tu respuesta..."
              className="cr-input"
              autoFocus
              disabled={submitting}
            />

            {/* Error message */}
            {state.error && <p className="text-sm text-red-600 mt-3">{state.error}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirmAnswer}
              disabled={!answer.trim() || submitting}
              className="cr-btn-primary"
            >
              {submitting ? "Confirmando..." : "Confirmar"}
              {!submitting && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
            <button
              onClick={handleSkipQuestion}
              disabled={submitting}
              className="cr-btn-ghost text-sm"
            >
              No sé / Omitir
            </button>
          </div>

          {/* Privacy note */}
          <p className="mt-6 text-xs text-slate-400">
            Tu respuesta se almacena únicamente para este caso. No se envía a servicios externos más
            allá del análisis necesario.
          </p>
        </div>
      )}

      {/* No question available but not complete */}
      {!state.nextQuestion && state.phase === "questioning" && (
        <div className="cr-surface p-8 text-center animate-fade-in">
          <p className="text-slate-500 mb-4">No hay más preguntas disponibles en este momento.</p>
          <a href={`/case/${caseId}`} className="cr-btn-primary">
            Ver resultado
          </a>
        </div>
      )}
    </div>
  );
}
