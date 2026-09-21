/**
 * Case Creation Page — Resolveo.
 *
 * Progressive intake form for cancellation-charge.
 * Improved visuals: better progress, transitions, input styling, status feedback.
 */
"use client";

import { useState } from "react";
import Link from "next/link";

type Step = "intro" | "dates" | "amount" | "evidence" | "submitting" | "done";

interface FormData {
  cancellationDate: string;
  chargeDate: string;
  chargeAmount: string;
  hasConfirmation: boolean | null;
  hasCommitment: boolean | null;
}

const STEP_META: Record<Step, { label: string; progress: number }> = {
  intro: { label: "Introducción", progress: 0 },
  dates: { label: "Fechas", progress: 33 },
  amount: { label: "Importe", progress: 66 },
  evidence: { label: "Evidencia", progress: 100 },
  submitting: { label: "Procesando", progress: 100 },
  done: { label: "Completado", progress: 100 },
};

export default function NewCasePage() {
  const [step, setStep] = useState<Step>("intro");
  const [form, setForm] = useState<FormData>({
    cancellationDate: "",
    chargeDate: "",
    chargeAmount: "",
    hasConfirmation: null,
    hasCommitment: null,
  });
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateForm = (field: keyof FormData, value: string | boolean | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canProceedFromDates = form.cancellationDate !== "" && form.chargeDate !== "";
  const canProceedFromAmount = form.chargeAmount !== "";

  const meta = STEP_META[step];

  const handleSubmit = async () => {
    setStep("submitting");
    setError(null);

    try {
      const createRes = await fetch("/api/problems/cancellation-charge/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: "anonymous" }),
      });

      if (!createRes.ok) {
        throw new Error("No se pudo crear el caso");
      }

      const { case: createdCase } = await createRes.json();
      setCaseId(createdCase.id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setStep("dates");
    }
  };

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

      {/* Progress */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-500">Cancelación y cargos</span>
          <span className="text-sm font-medium text-slate-900">
            {step === "submitting" ? "Procesando..." : meta.label}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-800 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${meta.progress}%` }}
          />
        </div>
      </div>

      {/* Step: Intro */}
      {step === "intro" && (
        <div className="animate-fade-in">
          <h1
            className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cobro después de cancelar un servicio
          </h1>
          <p className="text-slate-500 mb-8 leading-relaxed text-lg">
            Vamos a recopilar la información necesaria para analizar tu caso. Necesitaremos fechas,
            importes y si dispones de documentación de soporte.
          </p>
          <button onClick={() => setStep("dates")} className="cr-btn-primary">
            Comenzar
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
      )}

      {/* Step: Dates */}
      {step === "dates" && (
        <div className="animate-fade-in">
          <h2
            className="text-2xl md:text-3xl font-bold text-slate-900 mb-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Fechas relevantes
          </h2>
          <p className="text-slate-500 mb-8">
            Necesitamos saber cuándo solicitaste la cancelación y cuándo se produjo el cargo.
          </p>

          <div className="space-y-6">
            <div>
              <label
                htmlFor="cancellationDate"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                ¿En qué fecha solicitaste la cancelación? *
              </label>
              <input
                id="cancellationDate"
                type="date"
                value={form.cancellationDate}
                onChange={(e) => updateForm("cancellationDate", e.target.value)}
                className="cr-input"
                required
              />
            </div>

            <div>
              <label htmlFor="chargeDate" className="block text-sm font-medium text-slate-700 mb-2">
                ¿En qué fecha te han cobrado el cargo? *
              </label>
              <input
                id="chargeDate"
                type="date"
                value={form.chargeDate}
                onChange={(e) => updateForm("chargeDate", e.target.value)}
                className="cr-input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                ¿Tu contrato incluía compromiso de permanencia?
              </label>
              <div className="flex gap-2">
                {(["true", "false", "null"] as const).map((val) => {
                  const boolVal = val === "true" ? true : val === "false" ? false : null;
                  const label = val === "true" ? "Sí" : val === "false" ? "No" : "No recuerdo";
                  const isActive = form.hasCommitment === boolVal;
                  return (
                    <button
                      key={val}
                      onClick={() => updateForm("hasCommitment", boolVal)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-slate-800 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {form.hasCommitment === false && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  ¿Tienes algún documento o mensaje que confirme la cancelación?
                </label>
                <div className="flex gap-2">
                  {([true, false] as const).map((val) => {
                    const label = val ? "Sí" : "No";
                    const isActive = form.hasConfirmation === val;
                    return (
                      <button
                        key={String(val)}
                        onClick={() => updateForm("hasConfirmation", val)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-slate-800 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex gap-3">
            <button
              onClick={() => setStep("amount")}
              disabled={!canProceedFromDates}
              className="cr-btn-primary"
            >
              Continuar
            </button>
            <button onClick={() => setStep("intro")} className="cr-btn-secondary">
              Atrás
            </button>
          </div>
        </div>
      )}

      {/* Step: Amount */}
      {step === "amount" && (
        <div className="animate-fade-in">
          <h2
            className="text-2xl md:text-3xl font-bold text-slate-900 mb-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Importe del cargo
          </h2>
          <p className="text-slate-500 mb-8">¿De cuánto es el importe que te han cobrado?</p>

          <div>
            <label htmlFor="chargeAmount" className="block text-sm font-medium text-slate-700 mb-2">
              Importe (EUR) *
            </label>
            <input
              id="chargeAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.chargeAmount}
              onChange={(e) => updateForm("chargeAmount", e.target.value)}
              className="cr-input"
              required
            />
          </div>

          <div className="mt-10 flex gap-3">
            <button
              onClick={() => setStep("evidence")}
              disabled={!canProceedFromAmount}
              className="cr-btn-primary"
            >
              Continuar
            </button>
            <button onClick={() => setStep("dates")} className="cr-btn-secondary">
              Atrás
            </button>
          </div>
        </div>
      )}

      {/* Step: Evidence */}
      {step === "evidence" && (
        <div className="animate-fade-in">
          <h2
            className="text-2xl md:text-3xl font-bold text-slate-900 mb-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Evidencia
          </h2>
          <p className="text-slate-500 mb-8">
            Puedes añadir documentos de soporte (facturas, correos, contratos). Esto es opcional
            pero ayuda a fortalecer tu caso.
          </p>

          <div
            className="cr-upload mb-8 cursor-pointer"
            onClick={() => document.getElementById("file-input")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                console.log("Files dropped:", files);
              }
            }}
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.txt,.csv,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  console.log("Files selected:", Array.from(files).map(f => f.name));
                }
              }}
            />
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
            </div>
            <p className="text-sm text-slate-500 mb-1">
              Arrastra archivos aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-slate-400">PDF, TXT, CSV, JPG, PNG — Máximo 20 MB</p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmit} className="cr-btn-primary">
              Analizar mi caso
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
            <button onClick={() => setStep("amount")} className="cr-btn-secondary">
              Atrás
            </button>
          </div>
        </div>
      )}

      {/* Step: Submitting */}
      {step === "submitting" && (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-12 h-12 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-lg text-slate-600 font-medium">Estamos analizando tu caso...</p>
          <p className="text-sm text-slate-400 mt-2">Esto puede tardar unos segundos.</p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && caseId && (
        <div className="text-center py-16 animate-fade-in">
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
          <h2
            className="text-2xl md:text-3xl font-bold text-slate-900 mb-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Caso creado
          </h2>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">
            Tu caso ha sido creado y está siendo procesado. Guarda tu identificador para poder
            consultarlo después.
          </p>
          <div className="cr-surface inline-block px-4 py-3 mb-6">
            <p className="text-xs text-slate-400 mb-1">Identificador del caso</p>
            <p className="font-mono text-sm text-slate-900 font-medium">{caseId}</p>
          </div>
          <div>
            <a href={`/case/${caseId}`} className="cr-btn-primary">
              Ver mi caso
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
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
