"use client";

/**
 * Resolver Client — Resolveo.
 *
 * Premium, adaptive problem resolution flow.
 * Connects to the real backend architecture.
 *
 * Phases:
 *   1. INTAKE — User describes the problem
 *   2. INTERPRETATION — AI interprets, shows what it understood
 *   3. QUESTIONING — Adaptive questions to fill gaps
 *   4. EVIDENCE — Optional document upload
 *   5. ANALYSIS — Backend processes the case
 *   6. RESULT — Structured result with sources and actions
 */
import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

/* ══════════════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════════════ */

type Phase =
  | "intake"
  | "interpreting"
  | "interpretation"
  | "questioning"
  | "evidence"
  | "analyzing"
  | "result"
  | "error";

interface FactCandidate {
  candidateId: string;
  factKey: string;
  proposedValue: { type: string; value: unknown };
  certainty: string;
}

interface MissingInfo {
  factKey: string;
  questionHint: string;
  priority: string;
}

interface Question {
  factKey: string;
  questionText: string;
  reason: string;
  priority: string;
  remainingCount: number;
}

interface Interpretation {
  summary: string;
  candidateModules: Array<{
    problemKey: string;
    confidence: string;
  }>;
  factCandidates: FactCandidate[];
  missingInformation: MissingInfo[];
  jurisdictionHints: Array<{
    jurisdiction: string;
    confidence: string;
  }>;
}

interface Routing {
  status: string;
  moduleKey?: string;
  moduleTitle?: string;
  userExplanation: string;
}

interface Claim {
  id: string;
  ruleKey: string;
  status: string;
  assertion: string;
  explanation: string;
  missingFacts: string[];
}

interface Source {
  sourceId: string;
  title: string;
  url: string;
  type: string;
}

interface Action {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
}

interface CaseResult {
  overallStatus: string;
  summary: string;
  claims: Claim[];
  sources: Source[];
  disclaimers: string[];
}

interface ActionPlan {
  actions: Action[];
  nextStep: string;
}

interface AppState {
  phase: Phase;
  caseId: string | null;
  interpretation: Interpretation | null;
  routing: Routing | null;
  nextQuestion: Question | null;
  allRequiredConfirmed: boolean;
  confirmedFacts: Array<{ key: string; value: unknown }>;
  result: CaseResult | null;
  actionPlan: ActionPlan | null;
  error: string | null;
  budget: { current: number; max: number } | null;
}

/* ══════════════════════════════════════════════════════════════════════
   STATUS CONFIG
   ══════════════════════════════════════════════════════════════════════ */

const DEFAULT_STATUS = { label: "No determinado", color: "var(--color-ink-faint)" } as const;

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  SUPPORTED: { label: "Resultado respaldado", color: "var(--color-supported)" },
  POTENTIALLY_APPLICABLE: { label: "Puede ser aplicable", color: "var(--color-potentially)" },
  INSUFFICIENT_DATA: { label: "Falta información", color: "var(--color-insufficient)" },
  CONTRADICTED: { label: "Hay información contradictoria", color: "var(--color-contradicted)" },
  NOT_APPLICABLE: { label: "No aplicable", color: "var(--color-ink-faint)" },
  UNKNOWN: DEFAULT_STATUS,
};

function getStatusDisplay(status: string): { label: string; color: string } {
  return STATUS_DISPLAY[status] ?? DEFAULT_STATUS;
}

/* ══════════════════════════════════════════════════════════════════════
   HELPER — Build value input from answer
   ══════════════════════════════════════════════════════════════════════ */

function buildValueInput(factKey: string, answer: string): { type: string; value: unknown } {
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

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

export function ResolverClient() {
  const [state, setState] = useState<AppState>({
    phase: "intake",
    caseId: null,
    interpretation: null,
    routing: null,
    nextQuestion: null,
    allRequiredConfirmed: false,
    confirmedFacts: [],
    result: null,
    actionPlan: null,
    error: null,
    budget: null,
  });

  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const answerRef = useRef<HTMLInputElement>(null);

  // ── Phase 1: Submit problem description ────────────────────────

  const handleIntake = useCallback(async () => {
    if (!input.trim() || submitting) return;

    setSubmitting(true);
    setState((prev) => ({ ...prev, phase: "interpreting", error: null }));

    try {
      const res = await fetch("/api/intake/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "No se pudo interpretar el mensaje");
      }

      const data = await res.json();

      setState((prev) => ({
        ...prev,
        phase: "interpretation",
        caseId: data.caseId,
        interpretation: data.interpretation,
        routing: data.routing,
        nextQuestion: data.nextQuestion,
        budget: data.budget,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "Error inesperado",
      }));
    } finally {
      setSubmitting(false);
    }
  }, [input, submitting]);

  // ── Phase 2: Move to questioning ──────────────────────────────

  const handleStartQuestioning = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "questioning" }));
  }, []);

  // ── Phase 3: Confirm answer ────────────────────────────────────

  const handleConfirmAnswer = useCallback(async () => {
    if (!state.caseId || !state.nextQuestion || !answer.trim()) return;

    setSubmitting(true);
    try {
      const value = buildValueInput(state.nextQuestion.factKey, answer.trim());
      const res = await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: state.caseId,
          candidateId: `intake-${state.nextQuestion.factKey}`,
          factKey: state.nextQuestion.factKey,
          decision: "confirm",
          value,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          // Reload case status
          await loadCaseStatus(state.caseId);
          return;
        }
        throw new Error(err.error?.message || "No se pudo confirmar");
      }

      // Add to confirmed facts
      const newFact = { key: state.nextQuestion.factKey, value: value.value };

      // Load next question
      setAnswer("");
      const intakeRes = await fetch(`/api/cases/${state.caseId}/intake`);
      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        setState((prev) => ({
          ...prev,
          confirmedFacts: [...prev.confirmedFacts, newFact],
          phase: intakeData.allRequiredConfirmed ? "evidence" : "questioning",
          nextQuestion: intakeData.nextQuestion,
          allRequiredConfirmed: intakeData.allRequiredConfirmed,
          error: null,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Error al confirmar",
      }));
    } finally {
      setSubmitting(false);
    }
  }, [state.caseId, state.nextQuestion, answer]);

  // ── Phase 3b: Skip question ────────────────────────────────────

  const handleSkipQuestion = useCallback(async () => {
    if (!state.caseId || !state.nextQuestion) return;

    setSubmitting(true);
    try {
      await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: state.caseId,
          candidateId: `intake-${state.nextQuestion.factKey}`,
          factKey: state.nextQuestion.factKey,
          decision: "reject",
        }),
      });

      const intakeRes = await fetch(`/api/cases/${state.caseId}/intake`);
      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        setAnswer("");
        setState((prev) => ({
          ...prev,
          phase: intakeData.allRequiredConfirmed ? "evidence" : "questioning",
          nextQuestion: intakeData.nextQuestion,
          allRequiredConfirmed: intakeData.allRequiredConfirmed,
          error: null,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Error al omitir",
      }));
    } finally {
      setSubmitting(false);
    }
  }, [state.caseId, state.nextQuestion]);

  // ── Phase 4: Skip evidence → analysis ──────────────────────────

  const handleSkipEvidence = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "analyzing" }));
  }, []);

  // ── Phase 4b: Upload evidence ──────────────────────────────────

  const handleUploadEvidence = useCallback(async (files: File[]) => {
    if (!state.caseId || files.length === 0) return;

    // For now, just proceed to analysis
    // TODO: Connect to Evidence Engine upload endpoint
    setState((prev) => ({ ...prev, phase: "analyzing" }));
  }, [state.caseId]);

  // ── Phase 5: Load result ───────────────────────────────────────

  const loadResult = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/result`);
      if (res.ok) {
        const { result } = await res.json();
        const actionsRes = await fetch(`/api/cases/${caseId}/actions`);
        let actionPlan = null;
        if (actionsRes.ok) {
          const { actionPlan: ap } = await actionsRes.json();
          actionPlan = ap;
        }
        setState((prev) => ({
          ...prev,
          phase: "result",
          result,
          actionPlan,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          phase: "result",
          result: {
            overallStatus: "UNKNOWN",
            summary: "No se pudo completar el análisis en este momento.",
            claims: [],
            sources: [],
            disclaimers: [],
          },
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        phase: "result",
        result: {
          overallStatus: "UNKNOWN",
          summary: "Error al obtener el resultado.",
          claims: [],
          sources: [],
          disclaimers: [],
        },
      }));
    }
  }, []);

  // ── Load case status ───────────────────────────────────────────

  const loadCaseStatus = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/intake`);
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          phase: data.allRequiredConfirmed ? "evidence" : "questioning",
          nextQuestion: data.nextQuestion,
          allRequiredConfirmed: data.allRequiredConfirmed,
          confirmedFacts: data.confirmedFacts ?? [],
        }));
      }
    } catch {
      // Ignore
    }
  }, []);

  // ── Auto-trigger analysis when phase changes to analyzing ──────

  useEffect(() => {
    if (state.phase === "analyzing" && state.caseId) {
      loadResult(state.caseId);
    }
  }, [state.phase, state.caseId, loadResult]);

  // ── Focus answer input when question appears ────────────────────

  useEffect(() => {
    if (state.phase === "questioning" && state.nextQuestion) {
      setTimeout(() => answerRef.current?.focus(), 100);
    }
  }, [state.phase, state.nextQuestion]);

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */

  // ── INTAKE ─────────────────────────────────────────────────────

  if (state.phase === "intake" || state.phase === "interpreting") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-[var(--surface-page)]">
        <div className="max-w-[640px] w-full mx-auto px-5 md:px-8 py-12">
          <div className="text-center mb-10">
            <p className="label mb-4">Resolver problema</p>
            <h1 className="mb-3">¿Qué problema quieres resolver?</h1>
            <p className="text-[var(--color-ink-muted)] max-w-md mx-auto leading-relaxed">
              Explícanos qué ha ocurrido. Resolveo analizará la situación y te pedirá
              únicamente la información necesaria.
            </p>
          </div>

          <div className="relative bg-[var(--surface-paper)] border border-[var(--border-light)] rounded-lg overflow-hidden transition-all duration-200 focus-within:border-[var(--color-accent)]/30 focus-within:shadow-[var(--shadow-elevated)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe lo que ha pasado..."
              className="w-full bg-transparent border-none outline-none resize-none py-4 px-5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] min-h-[120px] leading-relaxed font-[var(--font-body)]"
              aria-label="Describe tu problema de consumo"
              disabled={state.phase === "interpreting"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleIntake();
                }
              }}
            />
            <div className="flex items-center justify-between px-5 pb-4">
              <p className="text-xs text-[var(--color-ink-faint)]">
                {input.length > 0 ? `${input.length} caracteres` : "Mínimo 10 caracteres"}
              </p>
              <button
                onClick={handleIntake}
                disabled={input.trim().length < 10 || state.phase === "interpreting"}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-ink)] text-white text-xs font-medium rounded hover:bg-[var(--color-ink-soft)] transition-colors disabled:opacity-40"
              >
                {state.phase === "interpreting" ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analizando...</>
                ) : (
                  <>Analizar</>
                )}
              </button>
            </div>
          </div>

          {state.phase === "interpreting" && (
            <div className="mt-8 space-y-3 anim-fade-in">
              {["Interpretando tu descripción", "Identificando el problema", "Detectando datos relevantes"].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-sm text-[var(--color-ink-muted)]" style={{ animationDelay: `${i * 400}ms` }}>
                  <div className="w-4 h-4 rounded-full border border-[var(--border-default)] flex items-center justify-center anim-fade-in" style={{ animationDelay: `${i * 400 + 300}ms` }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                  </div>
                  {step}
                </div>
              ))}
            </div>
          )}

          {state.error && (
            <div className="mt-6 p-4 bg-[var(--color-contradicted-bg)] border border-[var(--color-contradicted)]/20 text-sm text-[var(--color-contradicted)] anim-fade-in">
              {state.error}
              <button
                onClick={() => setState((prev) => ({ ...prev, error: null, phase: "intake" }))}
                className="ml-3 underline underline-offset-2 hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── INTERPRETATION ─────────────────────────────────────────────

  if (state.phase === "interpretation" && state.interpretation) {
    const interp = state.interpretation;
    const routing = state.routing;

    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Back */}
          <button
            onClick={() => setState((prev) => ({ ...prev, phase: "intake" }))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors mb-8"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Volver
          </button>

          <div className="anim-slide-up">
            <p className="label mb-3">Hemos entendido lo siguiente</p>
            <h1 className="mb-6">Esto es lo que hemos detectado</h1>

            {/* Module detected */}
            {routing?.moduleTitle && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-1">Problema detectado</p>
                <p className="text-base font-medium text-[var(--color-ink)]">{routing.moduleTitle}</p>
                {routing.userExplanation && (
                  <p className="text-sm text-[var(--color-ink-muted)] mt-1">{routing.userExplanation}</p>
                )}
              </div>
            )}

            {/* Summary */}
            {interp.summary && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-1">Resumen</p>
                <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{interp.summary}</p>
              </div>
            )}

            {/* Detected facts */}
            {interp.factCandidates.length > 0 && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-3">Datos detectados</p>
                <div className="space-y-2">
                  {interp.factCandidates.map((fact) => (
                    <div key={fact.candidateId} className="flex items-center gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                      <span className="font-medium text-[var(--color-ink)]">{fact.factKey}:</span>
                      <span className="text-[var(--color-ink-muted)]">{String(fact.proposedValue.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing info */}
            {interp.missingInformation.length > 0 && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-3">Necesitamos confirmar</p>
                <div className="space-y-2">
                  {interp.missingInformation.map((info) => (
                    <div key={info.factKey} className="flex items-start gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-potentially)] mt-2 flex-shrink-0" />
                      <span className="text-[var(--color-ink-muted)]">{info.questionHint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-8">
              <button onClick={handleStartQuestioning} className="btn-primary">
                Completar datos
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
              <button
                onClick={() => setState((prev) => ({ ...prev, phase: "evidence" }))}
                className="btn-secondary"
              >
                Saltar a análisis
              </button>
            </div>

            <p className="text-xs text-[var(--color-ink-faint)] mt-6">
              La información detectada es orientativa. Necesitamos confirmarla antes de analizar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONING ────────────────────────────────────────────────

  if (state.phase === "questioning") {
    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="label">Confirmando datos</p>
              {state.nextQuestion && state.nextQuestion.remainingCount > 0 && (
                <span className="text-xs text-[var(--color-ink-faint)]">
                  {state.nextQuestion.remainingCount} restante{state.nextQuestion.remainingCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="h-1 bg-[var(--surface-warm)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-all duration-500"
                style={{ width: `${state.allRequiredConfirmed ? 100 : 70}%` }}
              />
            </div>
          </div>

          {/* Current question */}
          {state.nextQuestion ? (
            <div className="anim-slide-up">
              <div className="p-6 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-6">
                <p className="text-base font-medium text-[var(--color-ink)] leading-relaxed mb-4">
                  {state.nextQuestion.questionText}
                </p>

                <input
                  ref={answerRef}
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && answer.trim()) {
                      handleConfirmAnswer();
                    }
                  }}
                  placeholder="Escribe tu respuesta..."
                  className="input-base"
                  disabled={submitting}
                />

                {state.error && (
                  <p className="text-sm text-[var(--color-contradicted)] mt-3">{state.error}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirmAnswer}
                  disabled={!answer.trim() || submitting}
                  className="btn-primary"
                >
                  {submitting ? "Confirmando..." : "Confirmar"}
                </button>
                <button
                  onClick={handleSkipQuestion}
                  disabled={submitting}
                  className="btn-ghost"
                >
                  No sé / Omitir
                </button>
              </div>

              <p className="text-xs text-[var(--color-ink-faint)] mt-6">
                Tu respuesta se almacena únicamente para este caso.
              </p>
            </div>
          ) : (
            <div className="text-center py-12 anim-fade-in">
              <p className="text-[var(--color-ink-muted)] mb-4">No hay más preguntas en este momento.</p>
              <button onClick={() => setState((prev) => ({ ...prev, phase: "evidence" }))} className="btn-primary">
                Continuar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── EVIDENCE ───────────────────────────────────────────────────

  if (state.phase === "evidence") {
    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <p className="label mb-3">Documentos</p>
          <h1 className="mb-3">¿Tienes algún documento?</h1>
          <p className="text-[var(--color-ink-muted)] leading-relaxed mb-8">
            Puedes subir una factura, contrato, correo o confirmación. Esto es opcional pero puede
            ayudar a verificar los datos.
          </p>

          <div className="p-8 bg-[var(--surface-paper)] border border-dashed border-[var(--border-default)] text-center mb-6">
            <svg className="w-8 h-8 text-[var(--color-ink-faint)] mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <p className="text-sm text-[var(--color-ink-muted)] mb-1">Arrastra archivos o haz clic para seleccionar</p>
            <p className="text-xs text-[var(--color-ink-faint)]">PDF, TXT, JPG, PNG</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleUploadEvidence([])} className="btn-primary">
              Analizar mi caso
            </button>
            <button onClick={handleSkipEvidence} className="btn-secondary">
              Sin documentos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ANALYZING ──────────────────────────────────────────────────

  if (state.phase === "analyzing") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-[var(--surface-page)]">
        <div className="max-w-[400px] mx-auto px-5 text-center">
          <div className="w-8 h-8 border-2 border-[var(--border-default)] border-t-[var(--color-accent)] rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>Revisando la información</h2>
          <div className="space-y-2.5 mt-6 text-left max-w-xs mx-auto">
            {[
              "Organizando los hechos",
              "Comprobando las fechas",
              "Consultando las fuentes relevantes",
              "Preparando el resultado",
            ].map((step, i) => (
              <div key={step} className="flex items-center gap-3 text-sm text-[var(--color-ink-muted)] anim-fade-in" style={{ animationDelay: `${i * 600}ms` }}>
                <div className="w-4 h-4 rounded-full border border-[var(--border-default)] flex items-center justify-center anim-fade-in" style={{ animationDelay: `${i * 600 + 500}ms` }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                </div>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────

  if (state.phase === "result" && state.result) {
    const { result, actionPlan } = state;
    const statusCfg = getStatusDisplay(result.overallStatus);

    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Header */}
          <div className="mb-10">
            <p className="label mb-3">Resultado del análisis</p>
            <h1 className="mb-4">Esto es lo que hemos encontrado</h1>

            {/* Status */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: `${statusCfg.color}10`, color: statusCfg.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.color }} />
              <span className="text-xs font-medium">{statusCfg.label}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-6">
            <p className="label mb-2">Resumen</p>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{result.summary}</p>
          </div>

          {/* Claims */}
          {result.claims.length > 0 && (
            <div className="mb-6">
              <p className="label mb-3">Qué hemos podido confirmar</p>
              <div className="space-y-3">
                {result.claims.map((claim) => {
                  const claimStatus = getStatusDisplay(claim.status);
                  return (
                    <div key={claim.id} className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                      <div className="flex items-start gap-3">
                        <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: claimStatus.color }} />
                        <div>
                          <p className="text-sm font-medium text-[var(--color-ink)] mb-1">{claim.assertion}</p>
                          <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">{claim.explanation}</p>
                          {claim.missingFacts.length > 0 && (
                            <p className="text-xs text-[var(--color-potentially)] mt-2">
                              Datos faltantes: {claim.missingFacts.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {actionPlan && actionPlan.actions.length > 0 && (
            <div className="mb-6">
              <p className="label mb-3">Qué hacer ahora</p>
              <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-3">
                <p className="text-sm font-medium text-[var(--color-ink)]">{actionPlan.nextStep}</p>
              </div>
              <div className="space-y-2">
                {actionPlan.actions.map((action) => (
                  <div key={action.id} className="flex items-start gap-3 p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                    <span className="w-5 h-5 rounded bg-[var(--surface-warm)] flex items-center justify-center text-[10px] font-medium text-[var(--color-ink-muted)] flex-shrink-0 mt-0.5">
                      {action.priority}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-ink)]">{action.title}</p>
                      <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">{action.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {result.sources.length > 0 && (
            <div className="mb-6">
              <p className="label mb-3">Fuentes consultadas</p>
              <div className="space-y-2">
                {result.sources.map((source) => (
                  <div key={source.sourceId} className="p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                    <p className="text-sm font-medium text-[var(--color-ink)]">{source.title}</p>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] underline underline-offset-2 hover:no-underline mt-1 inline-block">
                      Ver fuente externa
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimers */}
          {result.disclaimers.length > 0 && (
            <div className="p-4 bg-[var(--surface-warm)] border border-[var(--border-light)] mb-8">
              <p className="text-[10px] font-medium text-[var(--color-ink-faint)] uppercase tracking-wider mb-2">Aviso</p>
              {result.disclaimers.map((d, i) => (
                <p key={i} className="text-xs text-[var(--color-ink-muted)] leading-relaxed">{d}</p>
              ))}
            </div>
          )}

          {/* Export */}
          {state.caseId && (
            <div className="flex gap-3 mb-8">
              <a href={`/api/cases/${state.caseId}/export?format=txt`} className="btn-secondary text-sm">
                Descargar informe
              </a>
              <Link href="/" className="btn-ghost text-sm">
                Volver al inicio
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────

  if (state.phase === "error") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-[var(--surface-page)]">
        <div className="max-w-[400px] mx-auto px-5 text-center">
          <div className="w-12 h-12 rounded bg-[var(--color-contradicted-bg)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[var(--color-contradicted)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl mb-2" style={{ fontFamily: "var(--font-display)" }}>Ha ocurrido un error</h2>
          <p className="text-sm text-[var(--color-ink-muted)] mb-6">{state.error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setState({ phase: "intake", caseId: null, interpretation: null, routing: null, nextQuestion: null, allRequiredConfirmed: false, confirmedFacts: [], result: null, actionPlan: null, error: null, budget: null })} className="btn-primary">
              Intentar de nuevo
            </button>
            <Link href="/" className="btn-secondary">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Default ────────────────────────────────────────────────────

  return null;
}
