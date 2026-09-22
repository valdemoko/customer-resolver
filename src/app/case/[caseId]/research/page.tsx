/**
 * Research Tab — F14 Research Resolver
 *
 * Displays research status, findings, sources, and conflicts
 * for cases using Research Resolver.
 */
"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface ResearchFinding {
  id: string;
  proposition: string;
  status: string;
  reasoningSummary: string;
}

interface ResearchSource {
  id: string;
  title: string;
  url: string;
  authority: string;
  validationStatus: string;
}

interface ResearchConflict {
  id: string;
  conflictType: string;
  description: string;
  resolutionStatus: string;
}

interface ResearchSession {
  id: string;
  status: string;
  jurisdiction: string;
  problemDescription: string;
  legalDomain: string;
  researchVersion: string;
  createdAt: string;
  completedAt?: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  conflicts: ResearchConflict[];
}

// ── Configuration ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  RESEARCH_PENDING: { bg: "bg-slate-100", text: "text-slate-600", label: "Pendiente" },
  RESEARCHING: { bg: "bg-blue-100", text: "text-blue-700", label: "Investigando..." },
  SOURCES_FOUND: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Fuentes encontradas" },
  SOURCES_VALIDATED: { bg: "bg-purple-100", text: "text-purple-700", label: "Fuentes validadas" },
  ANALYSIS_READY: { bg: "bg-amber-100", text: "text-amber-700", label: "Análisis listo" },
  RESULT_READY: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Resultado listo" },
  INSUFFICIENT_INFORMATION: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    label: "Información insuficiente",
  },
  NO_RELIABLE_SOURCE: { bg: "bg-red-100", text: "text-red-700", label: "Sin fuente fiable" },
  JURISDICTION_UNCERTAIN: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    label: "Jurisdicción incierta",
  },
  SOURCE_CONFLICT: { bg: "bg-red-100", text: "text-red-700", label: "Conflicto entre fuentes" },
  RESEARCH_FAILED: { bg: "bg-red-100", text: "text-red-700", label: "Investigación fallida" },
};

const AUTHORITY_CONFIG: Record<string, { label: string; color: string }> = {
  OFFICIAL_LEGISLATION: { label: "Legislación oficial", color: "bg-emerald-100 text-emerald-700" },
  OFFICIAL_REGULATION: { label: "Regulación oficial", color: "bg-emerald-100 text-emerald-700" },
  GOVERNMENT_MINISTRY: { label: "Ministerio", color: "bg-blue-100 text-blue-700" },
  OFFICIAL_REGULATOR: { label: "Regulador oficial", color: "bg-blue-100 text-blue-700" },
  JUDICIAL_DATABASE: { label: "Base de datos judicial", color: "bg-indigo-100 text-indigo-700" },
  ADMINISTRATIVE_GUIDANCE: {
    label: "Orientación administrativa",
    color: "bg-purple-100 text-purple-700",
  },
  INSTITUTIONAL_SOURCE: { label: "Fuente institucional", color: "bg-slate-100 text-slate-700" },
  PROFESSIONAL_SOURCE: { label: "Fuente profesional", color: "bg-slate-100 text-slate-600" },
  SECONDARY_SOURCE: { label: "Fuente secundaria", color: "bg-slate-100 text-slate-500" },
  UNVERIFIED: { label: "Sin verificar", color: "bg-red-100 text-red-600" },
};

const FINDING_STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  SUPPORTED: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Confirmado" },
  POTENTIALLY_APPLICABLE: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Potencialmente aplicable",
  },
  INSUFFICIENT_DATA: { bg: "bg-orange-50", text: "text-orange-700", label: "Datos insuficientes" },
  CONTRADICTED: { bg: "bg-red-50", text: "text-red-700", label: "Contradictorio" },
  NOT_APPLICABLE: { bg: "bg-slate-50", text: "text-slate-500", label: "No aplicable" },
  UNKNOWN: { bg: "bg-slate-50", text: "text-slate-500", label: "Desconocido" },
};

// ── Component ──────────────────────────────────────────────────────

export default function ResearchPage({ params }: { params: Promise<{ caseId: string }> }) {
  const [caseId, setCaseId] = useState<string>("");
  const [researchSessions, setResearchSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingResearch, setStartingResearch] = useState(false);
  const [showStartForm, setShowStartForm] = useState(false);

  useEffect(() => {
    params.then(({ caseId: id }) => {
      setCaseId(id);
      loadData(id);
    });
  }, [params]);

  const loadData = async (id: string) => {
    try {
      const res = await fetch(`/api/cases/${id}/research`);
      if (res.ok) {
        const data = await res.json();
        setResearchSessions(data.researchSessions ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading research");
    } finally {
      setLoading(false);
    }
  };

  const handleStartResearch = useCallback(
    async (description: string, jurisdiction: string) => {
      if (!caseId || startingResearch) return;
      setStartingResearch(true);
      try {
        const res = await fetch(`/api/cases/${caseId}/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemDescription: description,
            jurisdiction,
          }),
        });
        if (res.ok) {
          setShowStartForm(false);
          await loadData(caseId);
        }
      } finally {
        setStartingResearch(false);
      }
    },
    [caseId, startingResearch],
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">Cargando investigación...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cr-surface p-6 border-l-4 border-red-400">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-xl font-semibold text-slate-900"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Investigación
        </h2>
        <button onClick={() => setShowStartForm(!showStartForm)} className="cr-btn-primary text-sm">
          + Nueva investigación
        </button>
      </div>

      {/* Start Research Form */}
      {showStartForm && (
        <StartResearchForm
          onSubmit={handleStartResearch}
          onCancel={() => setShowStartForm(false)}
        />
      )}

      {/* No Research */}
      {researchSessions.length === 0 && !showStartForm && (
        <div className="cr-surface p-8 text-center">
          <p className="text-slate-500 mb-2">No hay investigaciones realizadas.</p>
          <p className="text-sm text-slate-400">
            La investigación busca fuentes oficiales para problemas no cubiertos por los módulos
            deterministas.
          </p>
        </div>
      )}

      {/* Research Sessions */}
      {researchSessions.map((session) => (
        <ResearchSessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}

// ── Start Research Form ─────────────────────────────────────────────

function StartResearchForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (description: string, jurisdiction: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  const [jurisdiction, setJurisdiction] = useState("ES");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.length >= 10) {
      onSubmit(description, jurisdiction);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cr-surface p-5 space-y-4 animate-fade-in">
      <h3 className="font-medium text-slate-900">Nueva investigación</h3>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Descripción del problema</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el problema de consumo que necesitas investigar..."
          rows={4}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          required
          minLength={10}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Jurisdicción</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="ES">España</option>
          <option value="EU">Unión Europea</option>
          <option value="UK">Reino Unido</option>
          <option value="US">Estados Unidos</option>
        </select>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={description.length < 10} className="cr-btn-primary text-sm">
          Iniciar investigación
        </button>
        <button type="button" onClick={onCancel} className="cr-btn-ghost text-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Research Session Card ───────────────────────────────────────────

function ResearchSessionCard({ session }: { session: ResearchSession }) {
  const statusConfig = (STATUS_CONFIG[session.status] ?? STATUS_CONFIG.RESEARCH_PENDING)!;

  return (
    <div className="cr-surface p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
            >
              {statusConfig.label}
            </span>
            <span className="text-xs text-slate-400">{session.jurisdiction}</span>
          </div>
          <p className="text-sm text-slate-600 line-clamp-2">{session.problemDescription}</p>
        </div>
        <time className="text-xs text-slate-400 whitespace-nowrap">
          {new Date(session.createdAt).toLocaleDateString("es-ES")}
        </time>
      </div>

      {/* Findings */}
      {session.findings.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-700 mb-2">Conclusiones</h4>
          <div className="space-y-2">
            {session.findings.map((finding) => {
              const findingConfig = (FINDING_STATUS_CONFIG[finding.status] ??
                FINDING_STATUS_CONFIG.UNKNOWN)!;
              return (
                <div key={finding.id} className={`p-3 rounded-lg border ${findingConfig.bg}`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-xs font-medium ${findingConfig.text}`}>
                      {findingConfig.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{finding.proposition}</p>
                  <p className="text-xs text-slate-500 mt-1">{finding.reasoningSummary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sources */}
      {session.sources.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-700 mb-2">
            Fuentes ({session.sources.length})
          </h4>
          <div className="space-y-2">
            {session.sources.slice(0, 5).map((source) => {
              const authorityConfig = (AUTHORITY_CONFIG[source.authority] ??
                AUTHORITY_CONFIG.UNVERIFIED)!;
              return (
                <div key={source.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${authorityConfig.color}`}
                  >
                    {authorityConfig.label}
                  </span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-700 hover:text-slate-900 underline truncate"
                  >
                    {source.title}
                  </a>
                </div>
              );
            })}
            {session.sources.length > 5 && (
              <p className="text-xs text-slate-400">+{session.sources.length - 5} más</p>
            )}
          </div>
        </div>
      )}

      {/* Conflicts */}
      {session.conflicts.length > 0 && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50">
          <h4 className="text-sm font-medium text-red-700 mb-1">
            Conflictos detectados ({session.conflicts.length})
          </h4>
          {session.conflicts.map((conflict) => (
            <p key={conflict.id} className="text-xs text-red-600 mt-1">
              • {conflict.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
