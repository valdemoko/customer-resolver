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
// Pure data from the domain: the same guidance the exported PDF prints when we
// have no verified contacts for the company.
import { COMPANY_CONTACT_GUIDANCE as COMPANY_CONTACT_TIPS } from "@core/result/company-contacts";

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
  /** Declared answer type from the problem module (drives the input control). */
  questionType?: "string" | "number" | "boolean" | "date" | "money" | "enum";
  options?: string[];
  required?: boolean;
  totalApplicable?: number;
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
  /** Facts the rule actually read — what the conclusion is based on. */
  supportingFacts?: Array<{ factKey: string; value: unknown }>;
}

interface Source {
  sourceId: string;
  title: string;
  url: string;
  type: string;
  /** Which conclusion this source backs — shown so the list is checkable. */
  claim?: string;
}

/** Amount or date the claim turns on, already formatted by the server. */
interface CaseHighlight {
  label: string;
  value: string;
  kind: "money" | "date" | "number";
  factKey: string;
}

/** One official way of reaching the company (never invented: see the server). */
interface CompanyChannel {
  kind: string;
  label: string;
  value?: string;
  url?: string;
  hours?: string;
  note?: string;
}

/** The company the claim is against, with its verified customer service. */
interface CaseCompany {
  name: string;
  factKey: string;
  known: boolean;
  sector?: string;
  channels: CompanyChannel[];
  sourceUrl?: string;
  verifiedAt?: string;
  note?: string;
}

/** The module's question that tells us which company the claim is against. */
interface CompanyQuestion {
  id: string;
  text: string;
  factKey: string;
  type?: string;
}

interface Action {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
}

interface MissingInformation {
  factKey: string;
  questionId?: string;
  /** The fact the USER can answer, when a question exists for it. */
  answerFactKey?: string;
  description: string;
  /** Answer type declared by the module (`boolean`, `date`, `money`…). */
  answerType?: string;
  /** Allowed values when the declared type is `enum`. */
  answerOptions?: string[];
  /** `question` = the user can answer it; `review` = we could not compute it. */
  kind: "question" | "review";
  impact: "required" | "recommended";
  /** False when no question can supply the fact. */
  answerable: boolean;
  blockedClaims: string[];
}

/** A fact the person supplied, already formatted by the server for reading. */
interface CaseAnswer {
  label: string;
  value: string;
  origin: "USER" | "DOCUMENT" | "DERIVED";
  /** Present when the report can correct this answer in place. */
  factKey?: string;
  answerType?: string;
  answerOptions?: string[];
}

interface CaseResult {
  overallStatus: string;
  summary: string;
  claims: Claim[];
  sources: Source[];
  disclaimers: string[];
  /** Present in the API response; used to name missing data in human terms. */
  missingInformation?: MissingInformation[];
  /** Official bodies where the case can be taken (always present). */
  channels?: ConsumerChannel[];
  /** Company the claim is against, with its verified customer service. */
  company?: CaseCompany | null;
}

/** Answer type the report form must send, derived from what was asked. */
type AnswerInputKind = "boolean" | "number" | "money" | "date" | "enum" | "string";

/**
 * Intake URL, telling the server which questions the person already declined.
 *
 * Without this the selector returned the same unanswered question right after a
 * "no lo sé", so the questionnaire could not advance past it.
 */
function intakeUrl(caseId: string, skipped: readonly string[]): string {
  const settled = skipped.filter((key) => key.length > 0);
  const query = settled.length > 0 ? `?skipped=${encodeURIComponent(settled.join(","))}` : "";
  return `/api/cases/${caseId}/intake${query}`;
}

interface ConsumerChannel {
  id: string;
  target: string;
  channel: string;
  why: string;
  url: string;
}

interface ActionPlan {
  actions: Action[];
  nextStep: string;
}

/** General orientation for problems with no registered module (Fase 8.4). */
interface Guidance {
  understanding: string;
  generalSteps: Array<{ title: string; detail: string }>;
  whereToComplain: Array<{ target: string; channel: string; why: string }>;
  documentsToGather: string[];
  whatWeCannotDo: string[];
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
  guidance: Guidance | null;
  guidanceDisclaimer: string | null;
  guidanceLoading: boolean;
  guidanceError: string | null;
  /** Highest question count seen in this session — used for honest progress. */
  questionTotal: number | null;
  /** Data found in uploaded documents. Unconfirmed candidates are NOT analysed. */
  documentCandidates: DocumentCandidate[];
  uploading: boolean;
  uploadError: string | null;
  uploadSummary: string | null;
  /** What the person answered, formatted by the server (shared with the PDF). */
  answers: CaseAnswer[];
  /** Amounts and dates the claim turns on. */
  highlights: CaseHighlight[];
  /** Human name per fact key, so a conclusion can say what it is based on. */
  factLabels: Record<string, string>;
  /** Asked only while the company is still unknown (fills the contact section). */
  companyQuestion: CompanyQuestion | null;
  /** Facts the person said they did not know — never asked twice by accident. */
  skippedFacts: string[];
  /** True while completing pending data and re-running the analysis. */
  reanalyzing: boolean;
  /**
   * Title of the problem whose case is being prepared deterministically.
   * Non-null only while the deterministic entry is running (no AI involved).
   */
  bootstrapTitle: string | null;
}

/** A fact candidate extracted from a document (never a fact until confirmed). */
interface DocumentCandidate {
  candidateId: string;
  factKey: string;
  proposedValue: unknown;
  confirmed: boolean;
  rejected: boolean;
}

/** Only values already shaped as a fact value can be confirmed by the server. */
function isFactValueShaped(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
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

/**
 * Name a missing fact the way the user can act on it.
 *
 * The engine reports fact keys (`compliance.presumption_deadline`); the result
 * carries the question that supplies each one. Falling back to the key keeps the
 * screen honest when no question exists — never hide that data is missing.
 */
function describeMissingFact(result: CaseResult, factKey: string): string {
  const known = result.missingInformation?.find((m) => m.factKey === factKey);
  return known?.description ?? factKey;
}

/* ══════════════════════════════════════════════════════════════════════
   HELPER — Build value input from answer
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Build the fact value from the question's DECLARED type.
 *
 * The rule engine compares real booleans, numbers and dates: sending "sí" as a
 * string for a boolean fact would silently block every rule that depends on it.
 * Returns null when the answer does not fit the expected type.
 */
function buildTypedValue(
  question: Question,
  rawAnswer: string,
): { type: string; value: unknown; options?: string[] } | null {
  const raw = rawAnswer.trim();
  if (!raw) return null;

  switch (question.questionType) {
    case "boolean": {
      const lower = raw.toLowerCase();
      if (["sí", "si", "sí.", "yes", "true"].includes(lower)) {
        return { type: "boolean", value: true };
      }
      if (["no", "false", "nunca"].includes(lower)) {
        return { type: "boolean", value: false };
      }
      return null;
    }
    case "number": {
      const value = Number(raw.replace(",", "."));
      return Number.isFinite(value) ? { type: "number", value } : null;
    }
    case "money": {
      const value = Number(
        raw
          .replace(/\./g, "")
          .replace(",", ".")
          .replace(/[^\d.-]/g, ""),
      );
      if (!Number.isFinite(value)) return null;
      return { type: "money", value: { amountMinor: Math.round(value * 100), currency: "EUR" } };
    }
    case "date":
      // The date input already produces YYYY-MM-DD (calendar date, no time).
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { type: "date", value: raw } : null;
    case "enum": {
      const options = question.options ?? [];
      const match = options.find((o) => o.toLowerCase() === raw.toLowerCase());
      return { type: "enum", value: match ?? raw, options: options.length > 0 ? options : [raw] };
    }
    default:
      return { type: "string", value: raw };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   REPORT — pending data controls
   ══════════════════════════════════════════════════════════════════════ */

/** Answer type declared by the module, mapped to the control to render. */
function answerKindOf(declaredType?: string): AnswerInputKind {
  switch (declaredType) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "money":
      return "money";
    case "date":
      return "date";
    case "enum":
      return "enum";
    default:
      return "string";
  }
}

const ORIGIN_TAGS: Record<CaseAnswer["origin"], string> = {
  USER: "Indicado por ti",
  DOCUMENT: "Leído de un documento",
  DERIVED: "Calculado",
};

/**
 * One pending fact, answerable right where it is reported.
 *
 * A missing datum used to be a sentence the person could not act on: the report
 * said "falta información" and stopped there. Filling it here saves the fact and
 * re-runs the analysis, so the resolution is regenerated with the new data.
 */
function PendingFactCard({
  item,
  busy,
  onSubmit,
}: {
  item: MissingInformation;
  busy: boolean;
  onSubmit: (factKey: string, kind: AnswerInputKind, raw: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const factKey = item.answerFactKey ?? item.factKey;
  const kind = answerKindOf(item.answerType);
  const options = item.answerOptions ?? [];

  // Not answerable: explain what could not be computed instead of showing a
  // control the person cannot fill in.
  if (!item.answerable || item.answerFactKey === undefined) {
    return (
      <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
        <p className="text-sm text-[var(--color-ink)] leading-relaxed">{item.description}</p>
      </div>
    );
  }

  const submit = async (raw: string) => {
    setLocalError(null);
    const ok = await onSubmit(factKey, kind, raw);
    if (ok) {
      setSaved(true);
      setValue("");
    } else {
      setLocalError("No pudimos guardar ese dato. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
      <p className="text-sm font-medium text-[var(--color-ink)] leading-relaxed mb-3">
        {item.description}
      </p>

      {kind === "boolean" && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void submit("sí")}
            disabled={busy}
            className="btn-primary flex-1 text-sm"
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => void submit("no")}
            disabled={busy}
            className="btn-secondary flex-1 text-sm"
          >
            No
          </button>
        </div>
      )}

      {kind === "enum" && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((option: string) => (
            <button
              key={option}
              type="button"
              onClick={() => void submit(option)}
              disabled={busy}
              className="btn-secondary text-sm"
            >
              {option.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {(kind === "string" || kind === "number" || kind === "money" || kind === "date") && (
        <>
          <input
            type={kind === "date" ? "date" : kind === "string" ? "text" : "number"}
            inputMode={kind === "number" || kind === "money" ? "decimal" : undefined}
            step={kind === "money" ? "0.01" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) void submit(value);
            }}
            placeholder={
              kind === "money"
                ? "Importe en euros, por ejemplo 249,90"
                : kind === "number"
                  ? "Escribe un número"
                  : kind === "date"
                    ? ""
                    : "Escribe tu respuesta..."
            }
            className="input-base"
            disabled={busy}
            list={options.length > 0 ? `pending-options-${factKey}` : undefined}
          />
          {options.length > 0 && (
            <datalist id={`pending-options-${factKey}`}>
              {options.map((option: string) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
          <button
            type="button"
            onClick={() => void submit(value)}
            disabled={!value.trim() || busy}
            className="btn-primary text-sm mt-3"
          >
            {busy ? "Analizando de nuevo…" : "Guardar y actualizar el análisis"}
          </button>
        </>
      )}

      {saved && (
        <p className="text-xs text-[var(--color-supported)] mt-3">
          Dato guardado. El análisis se ha actualizado con este dato.
        </p>
      )}
      {localError && <p className="text-xs text-[var(--color-contradicted)] mt-3">{localError}</p>}
    </div>
  );
}

/**
 * One answer of the report, correctable in place.
 *
 * Reading the report is when a wrong date or amount is noticed, so correcting it
 * has to happen here. The correction goes through the same fact endpoint as a new
 * answer: the previous value is superseded rather than edited, so the change is
 * recorded instead of silently rewriting the case.
 *
 * Only facts the person supplied (`USER`, or read from a document) with a declared
 * type are editable — a value the analysis computed cannot be "answered" again.
 */
function AnswerRow({
  answer,
  busy,
  onSubmit,
}: {
  answer: CaseAnswer;
  busy: boolean;
  onSubmit: (factKey: string, kind: AnswerInputKind, raw: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const factKey = answer.factKey;
  const kind = answer.answerType ? answerKindOf(answer.answerType) : null;
  const options = answer.answerOptions ?? [];
  const editable = Boolean(factKey) && answer.origin !== "DERIVED" && kind !== null;

  const save = async (raw: string) => {
    if (!factKey || !kind) return;
    setError(null);
    const ok = await onSubmit(factKey, kind, raw);
    if (ok) {
      setSaved(true);
      setEditing(false);
      setValue("");
    } else {
      setError("No pudimos guardar la corrección. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <dt className="text-xs text-[var(--color-ink-muted)]">{answer.label}:</dt>
      <dd className="text-xs font-medium text-[var(--color-ink)]">
        {answer.value}
        <span className="ml-2 text-[10px] text-[var(--color-ink-faint)] uppercase tracking-wide">
          {ORIGIN_TAGS[answer.origin]}
        </span>
      </dd>

      {editable && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="text-[11px] text-[var(--color-accent)] underline underline-offset-2 hover:no-underline min-h-[24px]"
        >
          Corregir
        </button>
      )}

      {saved && !editing && (
        <span className="text-[11px] text-[var(--color-supported)]">Corregido</span>
      )}

      {editing && kind && (
        <div className="w-full mt-2 p-3 bg-[var(--surface-warm)] border border-[var(--border-light)]">
          <p className="text-[11px] text-[var(--color-ink-muted)] leading-relaxed mb-3">
            Valor actual: {answer.value}. El valor anterior se conserva como superado y el análisis
            se regenera con el nuevo.
          </p>

          {kind === "boolean" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save("sí")}
                disabled={busy}
                className="btn-primary text-xs"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => void save("no")}
                disabled={busy}
                className="btn-secondary text-xs"
              >
                No
              </button>
            </div>
          )}

          {kind === "enum" && options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void save(option)}
                  disabled={busy}
                  className="btn-secondary text-xs"
                >
                  {option.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}

          {kind !== "boolean" && kind !== "enum" && (
            <div className="flex flex-wrap gap-2">
              <input
                type={kind === "date" ? "date" : kind === "string" ? "text" : "number"}
                inputMode={kind === "number" || kind === "money" ? "decimal" : undefined}
                step={kind === "money" ? "0.01" : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) void save(value.trim());
                }}
                aria-label={`Nuevo valor para ${answer.label}`}
                placeholder={
                  kind === "money"
                    ? "Importe en euros, por ejemplo 249,90"
                    : kind === "number"
                      ? "Escribe un número"
                      : "Escribe el valor correcto"
                }
                className="input-base flex-1 min-w-[180px]"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void save(value.trim())}
                disabled={!value.trim() || busy}
                className="btn-primary text-xs"
              >
                {busy ? "Actualizando…" : "Guardar"}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
            className="btn-ghost text-xs mt-3"
          >
            Cancelar
          </button>

          {error && <p className="text-[11px] text-[var(--color-contradicted)] mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   REPORT — full case report
   ══════════════════════════════════════════════════════════════════════ */

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Teléfono",
  web: "Web oficial",
  form: "Formulario",
  email: "Correo",
  chat: "Chat",
  post: "Correo postal",
};

/**
 * Official customer service of the company the claim is against.
 *
 * Server-side rule: only channels read on the company's own page are listed, and
 * always with the verification date and the source, because companies change
 * phone numbers. When we have nothing verified, the report teaches how to find
 * the official channel instead of inventing one.
 */
function CompanyContact({ company }: { company: CaseCompany }) {
  return (
    <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
      <p className="text-sm font-medium text-[var(--color-ink)]">{company.name}</p>
      {company.sector && (
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)] mt-0.5">
          {company.sector}
        </p>
      )}

      {company.known ? (
        <div className="mt-3 space-y-3">
          {company.channels.map((channel, index) => (
            <div
              key={`${channel.kind}-${index}`}
              className="border-l-2 border-[var(--border-light)] pl-3"
            >
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                {CHANNEL_LABELS[channel.kind] ?? "Contacto"} · {channel.label}
              </p>
              {channel.value && (
                <p className="text-sm font-medium text-[var(--color-ink)] mt-0.5">
                  {channel.value}
                </p>
              )}
              {channel.hours && (
                <p className="text-xs text-[var(--color-ink-muted)] mt-1">{channel.hours}</p>
              )}
              {channel.note && (
                <p className="text-xs text-[var(--color-ink-soft)] mt-1 leading-relaxed">
                  {channel.note}
                </p>
              )}
              {channel.url && (
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--color-accent)] underline underline-offset-2 hover:no-underline mt-1 inline-block"
                >
                  Abrir el canal oficial
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-[var(--color-ink-soft)] leading-relaxed">
            No tenemos verificados los canales de atención al cliente de esta empresa, así que no te
            damos ningún teléfono para no darte un dato equivocado. Encontrar el correcto es rápido:
          </p>
          <ol className="space-y-2 list-decimal list-inside">
            {COMPANY_CONTACT_TIPS.map((tip) => (
              <li key={tip} className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                {tip}
              </li>
            ))}
          </ol>
        </div>
      )}

      {company.note && company.known && (
        <p className="text-xs text-[var(--color-ink-muted)] mt-3 leading-relaxed">{company.note}</p>
      )}

      {company.known && company.sourceUrl && (
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-3 leading-relaxed">
          Canales verificados el {company.verifiedAt} en la web oficial:{" "}
          <a
            href={company.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            comprobar el dato
          </a>
          .
        </p>
      )}
    </div>
  );
}

/**
 * Asks which company the claim is against, right in the contact section.
 *
 * Only rendered while the company is unknown: answering it names the company,
 * fills the contact section and re-runs the analysis.
 */
function CompanyQuestionCard({
  question,
  busy,
  onSubmit,
}: {
  question: CompanyQuestion;
  busy: boolean;
  onSubmit: (factKey: string, kind: AnswerInputKind, raw: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    const ok = await onSubmit(question.factKey, "string", value);
    if (ok) {
      setSaved(true);
      setValue("");
    } else {
      setLocalError("No pudimos guardar el nombre de la empresa. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)] mt-3">
      <p className="text-sm font-medium text-[var(--color-ink)] leading-relaxed">{question.text}</p>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim() && !busy) void submit();
        }}
        placeholder="Escribe el nombre de la empresa"
        className="input-base mt-3"
        disabled={busy}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!value.trim() || busy}
        className="btn-primary text-sm mt-3"
      >
        {busy ? "Actualizando el informe…" : "Guardar y actualizar el informe"}
      </button>
      {saved && (
        <p className="text-xs text-[var(--color-supported)] mt-3">
          Empresa guardada. El informe se ha actualizado con su atención al cliente.
        </p>
      )}
      {localError && <p className="text-xs text-[var(--color-contradicted)] mt-3">{localError}</p>}
    </div>
  );
}

const CLAIM_GROUPS: readonly { status: string; title: string; note?: string }[] = [
  { status: "SUPPORTED", title: "Lo que hemos podido confirmar" },
  { status: "POTENTIALLY_APPLICABLE", title: "Lo que puede ser aplicable" },
  {
    status: "INSUFFICIENT_DATA",
    title: "Lo que aún no podemos determinar",
    note: "Los datos que faltan aparecen más arriba: complétalos y el análisis se rehará solo.",
  },
  { status: "CONTRADICTED", title: "Información que no encaja" },
  { status: "NOT_APPLICABLE", title: "Lo que no resulta aplicable" },
];

function CaseReport({
  result,
  actionPlan,
  answers,
  highlights,
  factLabels,
  companyQuestion,
  caseId,
  problemTitle,
  busy,
  error,
  onCompleteMissing,
}: {
  result: CaseResult;
  actionPlan: ActionPlan | null;
  answers: CaseAnswer[];
  highlights: CaseHighlight[];
  factLabels: Record<string, string>;
  companyQuestion: CompanyQuestion | null;
  caseId: string;
  problemTitle: string | null;
  busy: boolean;
  error: string | null;
  onCompleteMissing: (factKey: string, kind: AnswerInputKind, raw: string) => Promise<boolean>;
}) {
  const statusCfg = getStatusDisplay(result.overallStatus);
  const missing = result.missingInformation ?? [];
  const actionable = missing.filter((m) => m.kind === "question" && m.answerable);
  const uncomputable = missing.filter((m) => m.kind !== "question");

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-12 md:py-16">
        {/* Header */}
        <div className="mb-8">
          <p className="label mb-3">Informe del caso</p>
          <h1 className="mb-3">Esto es lo que hemos encontrado</h1>
          {problemTitle && (
            <p className="text-sm text-[var(--color-ink-muted)] mb-4">{problemTitle}</p>
          )}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded"
            style={{ backgroundColor: `${statusCfg.color}10`, color: statusCfg.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: statusCfg.color }}
            />
            <span className="text-xs font-medium">{statusCfg.label}</span>
          </div>
        </div>

        {/* Dictamen */}
        <section className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-8">
          <p className="label mb-2">Dictamen</p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{result.summary}</p>
        </section>

        {/* Datos clave: el caso en cifras antes que en prosa */}
        {highlights.length > 0 && (
          <section className="mb-8">
            <p className="label mb-3">Datos clave de tu caso</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {highlights.map((item) => (
                <div
                  key={item.factKey}
                  className="p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                >
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                    {item.label}
                  </p>
                  <p className="text-base font-medium text-[var(--color-ink)] mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pending data — answerable in place, then re-analysed */}
        {(actionable.length > 0 || uncomputable.length > 0) && (
          <section className="mb-8">
            <p className="label mb-1">Datos que faltan</p>
            <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed mb-3">
              {actionable.length > 0
                ? `Cada dato de esta lista decide una conclusión que no podemos dar sin él (${actionable.length === 1 ? "falta 1" : `faltan ${actionable.length}`}). Complétalos aquí y regeneramos el informe con los datos nuevos; no hay que repetir el cuestionario.`
                : "Estos datos no dependen de una respuesta tuya que podamos pedir: te explicamos qué habría que comprobar en cada caso."}
            </p>
            {uncomputable.length > 0 && actionable.length > 0 && (
              <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed mb-3">
                Los que no se pueden responder aquí quedan explicados igualmente, para que sepas qué
                comprobar por tu cuenta.
              </p>
            )}
            <div className="space-y-3">
              {[...actionable, ...uncomputable].map((item) => (
                <PendingFactCard
                  key={item.factKey}
                  item={item}
                  busy={busy}
                  onSubmit={onCompleteMissing}
                />
              ))}
            </div>
            {busy && (
              <p className="text-xs text-[var(--color-accent)] mt-3 anim-fade-in">
                Actualizando el informe con los datos nuevos…
              </p>
            )}
            {error && <p className="text-xs text-[var(--color-contradicted)] mt-3">{error}</p>}
          </section>
        )}

        {/* Claims, grouped by what they mean for the person */}
        {CLAIM_GROUPS.map((group) => {
          const claims = result.claims.filter((claim) => claim.status === group.status);
          if (claims.length === 0) return null;
          const cfg = getStatusDisplay(group.status);
          return (
            <section key={group.status} className="mb-8">
              <p className="label mb-3" style={{ color: cfg.color }}>
                {group.title}
              </p>
              {group.note && (
                <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed mb-3">
                  {group.note}
                </p>
              )}
              <div className="space-y-2">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                  >
                    <p className="text-sm font-medium text-[var(--color-ink)] mb-1">
                      {claim.assertion}
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                      {claim.explanation}
                    </p>
                    {(() => {
                      const basis = (claim.supportingFacts ?? [])
                        .map((fact) => factLabels[fact.factKey])
                        .filter(
                          (label): label is string => typeof label === "string" && label.length > 0,
                        );
                      if (basis.length === 0) return null;
                      return (
                        <p className="text-xs text-[var(--color-ink-muted)] mt-2 leading-relaxed">
                          En qué se basa: {basis.join(" · ")}
                        </p>
                      );
                    })()}
                    {claim.missingFacts.length > 0 && (
                      <p className="text-xs text-[var(--color-insufficient)] mt-2">
                        Datos que faltan para esta conclusión:{" "}
                        {claim.missingFacts
                          .map((key) => describeMissingFact(result, key))
                          .join("; ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {/* Actions */}
        {actionPlan && actionPlan.actions.length > 0 && (
          <section className="mb-8">
            <p className="label mb-3">Qué hacer ahora</p>
            <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-3">
              <p className="text-sm font-medium text-[var(--color-ink)]">{actionPlan.nextStep}</p>
            </div>
            <div className="space-y-2">
              {actionPlan.actions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                >
                  <span className="w-5 h-5 rounded bg-[var(--surface-warm)] flex items-center justify-center text-[10px] font-medium text-[var(--color-ink-muted)] flex-shrink-0 mt-0.5">
                    {action.priority}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-ink)]">{action.title}</p>
                    <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                      {action.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact with the company — verified channels only, or how to find them */}
        {(result.company || companyQuestion) && (
          <section className="mb-8">
            <p className="label mb-1">A quién contactar en la empresa</p>
            <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed mb-3">
              Antes de escalar la reclamación a un organismo, conviene reclamar por escrito a la
              propia empresa y guardar la referencia que te den.
            </p>
            {result.company ? (
              <CompanyContact company={result.company} />
            ) : (
              <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
                  Todavía no sabemos contra qué empresa reclamas, así que no podemos darte su
                  atención al cliente. Dinos cuál es y el informe la incluirá.
                </p>
              </div>
            )}
            {!result.company && companyQuestion && (
              <CompanyQuestionCard
                question={companyQuestion}
                busy={busy}
                onSubmit={onCompleteMissing}
              />
            )}
          </section>
        )}

        {/* Where to complain — official bodies, never invented contacts */}
        {result.channels && result.channels.length > 0 && (
          <section className="mb-8">
            <p className="label mb-3">Dónde reclamar</p>
            <div className="space-y-2">
              {result.channels.map((channel) => (
                <div
                  key={channel.id}
                  className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                >
                  <p className="text-sm font-medium text-[var(--color-ink)]">{channel.target}</p>
                  <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">{channel.channel}</p>
                  <p className="text-xs text-[var(--color-ink-soft)] mt-2 leading-relaxed">
                    {channel.why}
                  </p>
                  <a
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-accent)] underline underline-offset-2 hover:no-underline mt-2 inline-block"
                  >
                    Ir al canal oficial
                  </a>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-ink-faint)] leading-relaxed mt-3">
              El teléfono y el correo de cada organismo se publican en su página oficial. No los
              reproducimos aquí porque cambian con el tiempo.
            </p>
          </section>
        )}

        {/* What the person answered — the report has to be checkable, and fixable */}
        {answers.length > 0 && (
          <section className="mb-8">
            <p className="label mb-1">Tus respuestas</p>
            <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed mb-3">
              El informe se apoya en estos datos. Si alguno no es correcto, corrígelo aquí: se
              guarda como una corrección y el análisis se regenera.
            </p>
            <div className="p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
              <dl className="space-y-3">
                {answers.map((answer, index) => (
                  <AnswerRow
                    key={`${answer.label}-${index}`}
                    answer={answer}
                    busy={busy}
                    onSubmit={onCompleteMissing}
                  />
                ))}
              </dl>
            </div>
          </section>
        )}

        {/* Sources */}
        {result.sources.length > 0 && (
          <section className="mb-8">
            <p className="label mb-3">Fuentes consultadas</p>
            <div className="space-y-2">
              {result.sources.map((source) => (
                <div
                  key={source.sourceId}
                  className="p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                >
                  <p className="text-sm font-medium text-[var(--color-ink)]">{source.title}</p>
                  {source.claim && (
                    <p className="text-xs text-[var(--color-ink-muted)] mt-1 leading-relaxed">
                      {source.claim}
                    </p>
                  )}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-accent)] underline underline-offset-2 hover:no-underline mt-1 inline-block"
                  >
                    Ver fuente externa
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Disclaimers */}
        {result.disclaimers.length > 0 && (
          <div className="p-4 bg-[var(--surface-warm)] border border-[var(--border-light)] mb-8">
            <p className="text-[10px] font-medium text-[var(--color-ink-faint)] uppercase tracking-wider mb-2">
              Aviso
            </p>
            {result.disclaimers.map((d, i) => (
              <p key={i} className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                {d}
              </p>
            ))}
          </div>
        )}

        {/* Export */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <a
            href={`/api/cases/${caseId}/export?format=pdf`}
            className="btn-primary text-sm"
            download
          >
            Descargar informe en PDF
          </a>
          <a href={`/api/cases/${caseId}/export?format=txt`} className="btn-ghost text-sm" download>
            Versión de texto
          </a>
          <Link href="/" className="btn-ghost text-sm">
            Volver al inicio
          </Link>
        </div>
        <p className="text-[11px] text-[var(--color-ink-faint)] leading-relaxed">
          El PDF incluye el problema, los datos clave, tus respuestas, el contacto de la empresa,
          las conclusiones, los datos pendientes, los pasos a seguir, los organismos oficiales y las
          fuentes consultadas.
        </p>
      </div>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

const INITIAL_STATE: AppState = {
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
  guidance: null,
  guidanceDisclaimer: null,
  guidanceLoading: false,
  guidanceError: null,
  questionTotal: null,
  documentCandidates: [],
  uploading: false,
  uploadError: null,
  uploadSummary: null,
  answers: [],
  highlights: [],
  factLabels: {},
  companyQuestion: null,
  skippedFacts: [],
  reanalyzing: false,
  bootstrapTitle: null,
};

export interface ResolverProblemOption {
  readonly key: string;
  readonly slug: string;
  readonly title: string;
}

interface ResolverClientProps {
  /**
   * Set when the person arrived from a problem page (`/resolver?problema=slug`).
   * The problem is already known, so the case is created deterministically and
   * the AI is never asked to guess it.
   */
  readonly initialProblem?: ResolverProblemOption | null;
  /** Published problems: the deterministic entry offered wherever the AI is not needed. */
  readonly availableProblems?: readonly ResolverProblemOption[];
}

/**
 * Server error codes → what the person can actually do about it.
 *
 * The API answers with typed codes (`AI_UNAVAILABLE`, `BUDGET_EXCEEDED`…); showing
 * its English fallback text to a Spanish reader was both confusing and a dead end.
 * Every branch here names a way to continue.
 */
function analysisErrorMessage(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case "AI_UNAVAILABLE":
      return "El análisis automático no está disponible en este momento. Puedes elegir tu problema en la lista o volver a intentarlo.";
    case "AI_INVALID_STRUCTURED_OUTPUT":
      return "El análisis no devolvió un resultado válido. Vuelve a intentarlo o elige tu problema en la lista.";
    case "BUDGET_EXCEEDED":
      return "Has agotado los intentos de análisis de esta sesión. Elige tu problema en la lista para continuar.";
    case "SERVICE_UNAVAILABLE":
      return "El servicio de análisis no está configurado en este momento. Elige tu problema en la lista para continuar.";
    default:
      return fallback && fallback.trim().length > 0
        ? fallback
        : "No pudimos analizar tu descripción. Vuelve a intentarlo o elige tu problema en la lista.";
  }
}

/** Friendly message for a fetch that never completed. */
function networkErrorMessage(error: unknown): string | null {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "La operación tardó demasiado. Vuelve a intentarlo o elige tu problema en la lista.";
  }
  if (error instanceof TypeError) {
    return "No pudimos conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.";
  }
  return null;
}

export function ResolverClient({
  initialProblem = null,
  availableProblems = [],
}: ResolverClientProps) {
  const [state, setState] = useState<AppState>(INITIAL_STATE);

  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const answerRef = useRef<HTMLInputElement>(null);

  // Pre-fill from ?q= URL param (free description carried from elsewhere)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setInput(q);
  }, []);

  // ── Deterministic entry: the problem is already known ──────────────
  //
  // Creates the case for that module and lands on its first question. No AI
  // call happens: asking a model to guess a problem the person just picked
  // wasted budget and turned every provider outage into a dead end.
  const startFromProblem = useCallback(async (problemKey: string, problemTitle: string) => {
    setState((prev) => ({
      ...prev,
      phase: "interpreting",
      error: null,
      bootstrapTitle: problemTitle,
      routing: null,
      interpretation: null,
      guidance: null,
      guidanceDisclaimer: null,
      guidanceError: null,
      guidanceLoading: false,
    }));

    try {
      const res = await fetch(`/api/problems/${encodeURIComponent(problemKey)}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(analysisErrorMessage(data?.error?.code, data?.error?.message));
      }
      if (typeof data?.caseId !== "string" || data.caseId.length === 0) {
        throw new Error("No pudimos preparar el caso. Vuelve a intentarlo.");
      }

      const next = (data.nextQuestion ?? null) as Question | null;
      setState((prev) => ({
        ...prev,
        phase: data.allRequiredConfirmed && !next ? "evidence" : "questioning",
        caseId: data.caseId,
        nextQuestion: next,
        allRequiredConfirmed: Boolean(data.allRequiredConfirmed),
        questionTotal: next?.totalApplicable ?? 0,
        bootstrapTitle: null,
        routing: {
          status: "DETERMINISTIC",
          moduleKey: data.problemKey,
          moduleTitle: data.problemTitle ?? problemTitle,
          userExplanation: "",
        },
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        bootstrapTitle: null,
        error:
          networkErrorMessage(err) ?? (err instanceof Error ? err.message : "Error inesperado"),
      }));
    }
  }, []);

  const bootstrapStarted = useRef(false);
  useEffect(() => {
    if (!initialProblem || bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void startFromProblem(initialProblem.key, initialProblem.title);
  }, [initialProblem, startFromProblem]);

  // ── Phase 1b: general orientation when the problem has no module ──

  const loadGuidance = useCallback(async (message: string, caseId: string | null) => {
    if (!caseId) return;

    setState((prev) => ({
      ...prev,
      guidance: null,
      guidanceDisclaimer: null,
      guidanceError: null,
      guidanceLoading: true,
    }));

    try {
      const res = await fetch("/api/intake/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, caseId }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.guidance) {
        throw new Error(data.error?.message || "No pudimos preparar la orientación");
      }
      setState((prev) => ({
        ...prev,
        guidance: data.guidance,
        guidanceDisclaimer: data.disclaimer ?? null,
        guidanceLoading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        guidanceLoading: false,
        guidanceError: err instanceof Error ? err.message : "Error inesperado",
      }));
    }
  }, []);

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
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(analysisErrorMessage(err.error?.code, err.error?.message));
      }

      const data = await res.json();

      setState((prev) => ({
        ...prev,
        phase: "interpretation",
        caseId: data.caseId,
        interpretation: data.interpretation,
        routing: data.routing,
        nextQuestion: data.nextQuestion,
        questionTotal: data.nextQuestion?.totalApplicable ?? 0,
        budget: data.budget,
        guidance: null,
        guidanceDisclaimer: null,
        guidanceError: null,
        guidanceLoading: false,
      }));

      // No registered module → ask for general orientation in the background.
      // The interpretation above is already visible; a failure here only
      // removes the extra orientation, never the interpretation.
      if (
        data.routing?.status === "UNSUPPORTED" ||
        data.routing?.status === "UNSUPPORTED_JURISDICTION"
      ) {
        void loadGuidance(input.trim(), data.caseId ?? null);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error:
          networkErrorMessage(err) ?? (err instanceof Error ? err.message : "Error inesperado"),
      }));
    } finally {
      setSubmitting(false);
    }
  }, [input, submitting, loadGuidance]);

  // ── Phase 2: Move to questioning ──────────────────────────────

  const handleStartQuestioning = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "questioning" }));
  }, []);

  // ── Phase 3: Confirm answer ────────────────────────────────────

  const handleConfirmAnswer = useCallback(
    async (rawOverride?: string) => {
      const raw = (rawOverride ?? answer).trim();
      if (!state.caseId || !state.nextQuestion || !raw) return;

      const typedValue = buildTypedValue(state.nextQuestion, raw);
      if (!typedValue) {
        setState((prev) => ({
          ...prev,
          error: "La respuesta no encaja con el tipo de dato esperado.",
        }));
        return;
      }

      setSubmitting(true);
      try {
        const value = typedValue;
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
        const intakeRes = await fetch(intakeUrl(state.caseId, state.skippedFacts));
        if (intakeRes.ok) {
          const intakeData = await intakeRes.json();
          setState((prev) => ({
            ...prev,
            confirmedFacts: [...prev.confirmedFacts, newFact],
            phase: intakeData.allRequiredConfirmed ? "evidence" : "questioning",
            nextQuestion: intakeData.nextQuestion,
            allRequiredConfirmed: intakeData.allRequiredConfirmed,
            questionTotal: Math.max(
              prev.questionTotal ?? 0,
              intakeData.nextQuestion?.totalApplicable ?? 0,
            ),
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
    },
    [state.caseId, state.nextQuestion, answer],
  );

  // ── Phase 3b: Skip question ────────────────────────────────────

  /**
   * "I don't know" is a legitimate answer and must not trap the person.
   *
   * The server always returns the first unanswered fact, so a skipped question
   * came back immediately and the form looked stuck. The skipped key is now
   * remembered: the question is not asked again, and the report offers it later
   * with the rest of the pending data.
   */
  const handleSkipQuestion = useCallback(async () => {
    if (!state.caseId || !state.nextQuestion) return;
    const skippedKey = state.nextQuestion.factKey;
    setSubmitting(true);
    try {
      await fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: state.caseId,
          candidateId: `intake-${skippedKey}`,
          factKey: skippedKey,
          decision: "reject",
        }),
      });

      const nextSkipped = [...new Set([...state.skippedFacts, skippedKey])];
      const intakeRes = await fetch(intakeUrl(state.caseId, nextSkipped));
      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        setAnswer("");
        setState((prev) => ({
          ...prev,
          phase: intakeData.allRequiredConfirmed ? "evidence" : "questioning",
          nextQuestion: intakeData.nextQuestion,
          allRequiredConfirmed: intakeData.allRequiredConfirmed,
          questionTotal: Math.max(
            prev.questionTotal ?? 0,
            intakeData.nextQuestion?.totalApplicable ?? 0,
          ),
          skippedFacts: nextSkipped,
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

  // ── Phase 3c: Leave the questionnaire with data still pending ──

  /**
   * The form never holds the person hostage: whatever is left is completed from
   * the report itself, which then re-runs the analysis with the new data.
   */
  const handleFinishQuestionnaire = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "evidence", error: null }));
  }, []);

  // ── Phase 4: Skip evidence → analysis ──────────────────────────

  const handleSkipEvidence = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "analyzing" }));
  }, []);

  // ── Phase 4b: Upload evidence ──────────────────────────────────

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles((prev) => [...prev, ...files]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Upload each document to the evidence endpoint, which extracts its text and
   * returns the fact candidates it found. A failure is REPORTED, never hidden:
   * analysing without a document the user believes was read would be a lie.
   */
  const handleUploadEvidence = useCallback(
    async (files: File[]) => {
      if (!state.caseId) return;

      if (files.length === 0) {
        setState((prev) => ({ ...prev, phase: "analyzing" }));
        return;
      }

      setState((prev) => ({ ...prev, uploading: true, uploadError: null }));

      const failures: string[] = [];
      const found: DocumentCandidate[] = [];
      let totalCharacters = 0;
      let processedDocuments = 0;

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch(`/api/cases/${state.caseId}/evidence`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            failures.push(`${file.name}: ${data.error?.message ?? "no se pudo procesar"}`);
            continue;
          }

          processedDocuments += 1;
          totalCharacters += data.extractedCharacters ?? 0;
          // The text was read but the AI could not turn it into data: say so.
          // Otherwise the user would believe an unread document was empty.
          if (data.factExtractionError) {
            console.warn(`[evidence] ${file.name}: extracción fallida —`, data.factExtractionError);
            failures.push(
              `${file.name}: no pudimos leer los datos del documento; puedes continuar y completarlos a mano`,
            );
          }
          for (const candidate of data.candidates ?? []) {
            if (found.some((c) => c.candidateId === candidate.candidateId)) continue;
            found.push({
              candidateId: candidate.candidateId,
              factKey: candidate.factKey,
              proposedValue: candidate.proposedValue,
              confirmed: false,
              rejected: false,
            });
          }
        } catch {
          failures.push(`${file.name}: error de conexión`);
        }
      }

      setState((prev) => ({
        ...prev,
        uploading: false,
        documentCandidates: found,
        uploadError: failures.length > 0 ? failures.join(" · ") : null,
        uploadSummary:
          processedDocuments > 0
            ? `${processedDocuments} documento${processedDocuments > 1 ? "s" : ""} leído${
                processedDocuments > 1 ? "s" : ""
              } · ${totalCharacters} caracteres extraídos · ${found.length} dato${
                found.length === 1 ? "" : "s"
              } encontrado${found.length === 1 ? "" : "s"}`
            : null,
      }));
    },
    [state.caseId],
  );

  /** Confirm ONE document-derived candidate. Only confirmed data is analysed. */
  const handleConfirmCandidate = useCallback(
    async (candidate: DocumentCandidate) => {
      if (!state.caseId) return;

      setState((prev) => ({ ...prev, error: null }));
      try {
        const res = await fetch("/api/intake/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: state.caseId,
            candidateId: candidate.candidateId,
            factKey: candidate.factKey,
            decision: "confirm",
            value: candidate.proposedValue,
          }),
        });
        if (!res.ok) {
          setState((prev) => ({
            ...prev,
            error: "No pudimos registrar ese dato del documento. Puedes continuar sin él.",
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          documentCandidates: prev.documentCandidates.map((c) =>
            c.candidateId === candidate.candidateId
              ? { ...c, confirmed: true, rejected: false }
              : c,
          ),
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          error: "No pudimos registrar ese dato del documento. Puedes continuar sin él.",
        }));
      }
    },
    [state.caseId],
  );

  // ── Phase 5: Load result ───────────────────────────────────────

  const loadResult = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/result`);
      if (res.ok) {
        const { result, answers, highlights, companyQuestion, factLabels } = await res.json();
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
          answers: answers ?? [],
          highlights: highlights ?? [],
          factLabels: factLabels ?? {},
          companyQuestion: companyQuestion ?? null,
          error: null,
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
            channels: [],
            company: null,
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
          channels: [],
          company: null,
        },
      }));
    }
  }, []);

  // ── Complete a pending fact from the report and re-run the analysis ──

  /**
   * Answer one of the pending facts from the report itself and re-analyse.
   *
   * This is the difference between "falta información" as a dead end and as a
   * step: the person fills the gap where it is shown and the report is
   * regenerated with the new data, without repeating the questionnaire.
   */
  const handleCompleteMissing = useCallback(
    async (factKey: string, inputKind: AnswerInputKind, raw: string) => {
      const caseId = state.caseId;
      if (!caseId || !raw.trim()) return false;

      const question: Question = {
        factKey,
        questionText: "",
        reason: "",
        priority: "REQUIRED",
        remainingCount: 0,
        questionType: inputKind,
      };
      const typedValue = buildTypedValue(question, raw.trim());
      if (!typedValue) {
        setState((prev) => ({ ...prev, error: "Ese dato no encaja con el formato esperado." }));
        return false;
      }

      setState((prev) => ({ ...prev, reanalyzing: true, error: null }));
      try {
        const res = await fetch(`/api/cases/${caseId}/intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factKey, value: typedValue, decision: "confirm" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || "No pudimos guardar ese dato");
        }

        await loadResult(caseId);
        return true;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "No pudimos guardar ese dato",
        }));
        return false;
      } finally {
        setState((prev) => ({ ...prev, reanalyzing: false }));
      }
    },
    [state.caseId, loadResult],
  );

  // ── Load case status ───────────────────────────────────────────

  const loadCaseStatus = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(intakeUrl(caseId, []));
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

  // ── DETERMINISTIC BOOTSTRAP — preparing a known problem's case ──

  if (state.phase === "interpreting" && state.bootstrapTitle) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-[var(--surface-page)]">
        <div className="max-w-[560px] w-full mx-auto px-5 py-12 text-center">
          <div
            className="w-10 h-10 mx-auto mb-6 border-2 border-[var(--border-default)] border-t-[var(--color-accent)] rounded-full animate-spin"
            role="status"
            aria-label="Preparando el caso"
          />
          <p className="label mb-3">Preparando tu caso</p>
          <h1 className="mb-3">{state.bootstrapTitle}</h1>
          <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">
            No hace falta que describas nada: ya sabemos qué problema es. Vamos directos a las
            preguntas que necesitamos para analizarlo.
          </p>
        </div>
      </div>
    );
  }

  // ── INTAKE ─────────────────────────────────────────────────────

  if (state.phase === "intake" || state.phase === "interpreting") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-[var(--surface-page)]">
        <div className="max-w-[640px] w-full mx-auto px-5 md:px-8 py-12">
          <div className="text-center mb-10">
            <p className="label mb-4">Resolver problema</p>
            <h1 className="mb-3">¿Qué problema quieres resolver?</h1>
            <p className="text-[var(--color-ink-muted)] max-w-md mx-auto leading-relaxed">
              Explícanos qué ha ocurrido. Resolveo analizará la situación y te pedirá únicamente la
              información necesaria.
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
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                    Analizando...
                  </>
                ) : (
                  <>Analizar</>
                )}
              </button>
            </div>
          </div>

          {/* Known problems: deterministic entry, no interpretation needed. */}
          {availableProblems.length > 0 && state.phase === "intake" && (
            <div className="mt-8">
              <p className="label mb-3">O elige tu problema</p>
              <div className="flex flex-wrap gap-2">
                {availableProblems.map((problem) => (
                  <button
                    key={problem.key}
                    type="button"
                    onClick={() => void startFromProblem(problem.key, problem.title)}
                    className="text-sm px-3.5 py-2 border border-[var(--border-light)] bg-[var(--surface-paper)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors min-h-[40px]"
                  >
                    {problem.title}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-ink-faint)] mt-3 leading-relaxed">
                Con un problema de la lista no hace falta interpretar nada: vas directo a las
                preguntas del análisis.
              </p>
            </div>
          )}

          {state.phase === "interpreting" && (
            <div className="mt-8 space-y-3 anim-fade-in">
              {[
                "Interpretando tu descripción",
                "Identificando el problema",
                "Detectando datos relevantes",
              ].map((step, i) => (
                <div
                  key={step}
                  className="flex items-center gap-3 text-sm text-[var(--color-ink-muted)]"
                  style={{ animationDelay: `${i * 400}ms` }}
                >
                  <div
                    className="w-4 h-4 rounded-full border border-[var(--border-default)] flex items-center justify-center anim-fade-in"
                    style={{ animationDelay: `${i * 400 + 300}ms` }}
                  >
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
    const isUnsupported =
      routing?.status === "UNSUPPORTED" || routing?.status === "UNSUPPORTED_JURISDICTION";

    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Back */}
          <button
            onClick={() => setState((prev) => ({ ...prev, phase: "intake" }))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors mb-8"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Volver
          </button>

          <div className="anim-slide-up">
            <p className="label mb-3">Hemos entendido lo siguiente</p>
            <h1 className="mb-6">Esto es lo que hemos detectado</h1>

            {/* Module detected (or out-of-scope notice) */}
            {(routing?.moduleTitle || routing?.userExplanation) && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-1">
                  {routing?.moduleTitle ? "Problema detectado" : "Aviso"}
                </p>
                {routing?.moduleTitle && (
                  <p className="text-base font-medium text-[var(--color-ink)]">
                    {routing.moduleTitle}
                  </p>
                )}
                {routing?.userExplanation && (
                  <p className="text-sm text-[var(--color-ink-muted)] mt-1">
                    {routing.userExplanation}
                  </p>
                )}
              </div>
            )}

            {/* Summary */}
            {interp.summary && (
              <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-5">
                <p className="label mb-1">Resumen</p>
                <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
                  {interp.summary}
                </p>
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
                      <span className="text-[var(--color-ink-muted)]">
                        {String(fact.proposedValue.value)}
                      </span>
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
            {isUnsupported ? (
              <div className="mt-8">
                {/* Orientation is being prepared */}
                {state.guidanceLoading && (
                  <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                    <p className="label mb-3">Preparando orientación</p>
                    <div className="space-y-3">
                      {["Situación detectada", "Qué puedes hacer", "Dónde reclamar"].map(
                        (step, i) => (
                          <div
                            key={step}
                            className="flex items-center gap-3 text-sm text-[var(--color-ink-faint)] anim-fade-in"
                            style={{ animationDelay: `${i * 250}ms` }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                            {step}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Guidance generated for this specific problem */}
                {state.guidance && (
                  <div className="space-y-5 anim-fade-in">
                    <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                      <p className="label mb-1">Orientación general</p>
                      <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
                        {state.guidance.understanding}
                      </p>
                    </div>

                    {state.guidance.generalSteps.length > 0 && (
                      <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                        <p className="label mb-3">Qué puedes hacer</p>
                        <ol className="space-y-4">
                          {state.guidance.generalSteps.map((step, i) => (
                            <li key={step.title} className="flex items-start gap-3">
                              <span className="w-5 h-5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-[var(--color-ink)]">
                                  {step.title}
                                </p>
                                <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mt-1">
                                  {step.detail}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {state.guidance.whereToComplain.length > 0 && (
                      <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                        <p className="label mb-3">Dónde reclamar</p>
                        <div className="space-y-4">
                          {state.guidance.whereToComplain.map((channel) => (
                            <div key={channel.target} className="flex items-start gap-3">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-2 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-[var(--color-ink)]">
                                  {channel.target}
                                </p>
                                {channel.channel && (
                                  <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                                    {channel.channel}
                                  </p>
                                )}
                                <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mt-1">
                                  {channel.why}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {state.guidance.documentsToGather.length > 0 && (
                      <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                        <p className="label mb-3">Documentos y pruebas que conviene reunir</p>
                        <ul className="space-y-2">
                          {state.guidance.documentsToGather.map((doc) => (
                            <li key={doc} className="flex items-start gap-3 text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-stone)] mt-2 flex-shrink-0" />
                              <span className="text-[var(--color-ink-muted)]">{doc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {state.guidance.whatWeCannotDo.length > 0 && (
                      <div className="p-5 bg-[var(--surface-elevated)] border border-[var(--border-light)]">
                        <p className="label mb-3">Qué no hace esta orientación</p>
                        <ul className="space-y-2">
                          {state.guidance.whatWeCannotDo.map((limit) => (
                            <li key={limit} className="flex items-start gap-3 text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-insufficient)] mt-2 flex-shrink-0" />
                              <span className="text-[var(--color-ink-muted)]">{limit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {state.guidanceDisclaimer && (
                      <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">
                        {state.guidanceDisclaimer}
                      </p>
                    )}
                  </div>
                )}

                {/* Orientation failed — the interpretation is still valid */}
                {state.guidanceError && !state.guidanceLoading && !state.guidance && (
                  <div className="p-4 bg-[var(--color-potentially-bg)] border border-[var(--color-potentially)]/20 text-sm text-[var(--color-potentially)]">
                    No pudimos preparar la orientación general para este problema.
                    <button
                      onClick={() => void loadGuidance(input.trim(), state.caseId)}
                      className="ml-3 underline underline-offset-2 hover:no-underline"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                <div className="mt-8">
                  <button onClick={() => setState(INITIAL_STATE)} className="btn-secondary">
                    Describir otro problema
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-3 mt-8">
                  <button onClick={handleStartQuestioning} className="btn-primary">
                    Completar datos
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
                  <button
                    onClick={() => setState((prev) => ({ ...prev, phase: "evidence" }))}
                    className="btn-secondary"
                  >
                    Saltar a análisis
                  </button>
                </div>

                <p className="text-xs text-[var(--color-ink-faint)] mt-6">
                  La información detectada es orientativa. Necesitamos confirmarla antes de
                  analizar.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONING ────────────────────────────────────────────────

  if (state.phase === "questioning") {
    const currentQuestion = state.nextQuestion;
    const questionControl = currentQuestion?.questionType ?? "string";
    const isSkipped = currentQuestion
      ? state.skippedFacts.includes(currentQuestion.factKey)
      : false;
    const totalQuestions = Math.max(
      state.questionTotal ?? 0,
      currentQuestion?.totalApplicable ?? 0,
      1,
    );
    const remainingQuestions = currentQuestion?.totalApplicable ?? 0;
    const answeredQuestions = Math.max(0, totalQuestions - remainingQuestions);
    const questionProgressPercent = state.allRequiredConfirmed
      ? 100
      : Math.min(95, Math.round(((answeredQuestions + 1) / totalQuestions) * 100));
    const questionProgressLabel = currentQuestion
      ? `Pregunta ${answeredQuestions + 1} de ${totalQuestions}${
          currentQuestion.required ? " · obligatoria" : ""
        }`
      : null;

    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Progress — real position, not a decorative bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="label">Confirmando datos</p>
              {questionProgressLabel && (
                <span className="text-xs text-[var(--color-ink-faint)]">
                  {questionProgressLabel}
                </span>
              )}
            </div>
            <div className="h-1 bg-[var(--surface-warm)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-all duration-500"
                style={{ width: `${questionProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Current question */}
          {state.nextQuestion ? (
            <div className="anim-slide-up">
              <div className="p-6 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-6">
                {/* Already declined: say so instead of asking the same thing again. */}
                {isSkipped && (
                  <div className="mb-4 p-3 bg-[var(--surface-warm)] border border-[var(--border-light)]">
                    <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                      Indicaste que no sabes este dato. Puedes contestarlo ahora o dejarlo para el
                      informe: allí podrás completarlo y volveremos a analizar el caso.
                    </p>
                  </div>
                )}
                <p className="text-base font-medium text-[var(--color-ink)] leading-relaxed mb-4">
                  {state.nextQuestion.questionText}
                </p>

                {questionControl === "boolean" && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => void handleConfirmAnswer("sí")}
                      disabled={submitting}
                      className="btn-primary flex-1"
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmAnswer("no")}
                      disabled={submitting}
                      className="btn-secondary flex-1"
                    >
                      No
                    </button>
                  </div>
                )}

                {questionControl === "enum" && (
                  <div className="flex flex-wrap gap-3">
                    {(state.nextQuestion.options ?? []).map((option: string) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => void handleConfirmAnswer(option)}
                        disabled={submitting}
                        className="btn-secondary"
                      >
                        {option.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                )}

                {(questionControl === "string" ||
                  questionControl === "number" ||
                  questionControl === "money" ||
                  questionControl === "date") && (
                  <>
                    <input
                      ref={answerRef}
                      type={
                        questionControl === "date"
                          ? "date"
                          : questionControl === "number" || questionControl === "money"
                            ? "number"
                            : "text"
                      }
                      inputMode={
                        questionControl === "money" || questionControl === "number"
                          ? "decimal"
                          : undefined
                      }
                      step={questionControl === "money" ? "0.01" : undefined}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && answer.trim()) {
                          void handleConfirmAnswer();
                        }
                      }}
                      placeholder={
                        questionControl === "date"
                          ? ""
                          : questionControl === "money"
                            ? "Importe en euros, por ejemplo 249,90"
                            : questionControl === "number"
                              ? "Escribe un número"
                              : "Escribe tu respuesta..."
                      }
                      className="input-base"
                      disabled={submitting}
                      /* Suggestions from the module (e.g. airports). Free text is
                         still accepted: the value is resolved server-side. */
                      list={
                        (state.nextQuestion.options ?? []).length > 0
                          ? "answer-suggestions"
                          : undefined
                      }
                    />
                    {(state.nextQuestion.options ?? []).length > 0 && (
                      <datalist id="answer-suggestions">
                        {(state.nextQuestion.options ?? []).map((option: string) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    )}

                    <div className="flex gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => void handleConfirmAnswer()}
                        disabled={!answer.trim() || submitting}
                        className="btn-primary"
                      >
                        {submitting ? "Confirmando..." : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipQuestion}
                        disabled={submitting}
                        className="btn-ghost"
                      >
                        No lo sé
                      </button>
                    </div>
                  </>
                )}

                {state.error && (
                  <p className="text-sm text-[var(--color-contradicted)] mt-3">{state.error}</p>
                )}
              </div>

              {questionControl !== "string" &&
                questionControl !== "number" &&
                questionControl !== "money" &&
                questionControl !== "date" && (
                  <button
                    type="button"
                    onClick={handleSkipQuestion}
                    disabled={submitting}
                    className="btn-ghost"
                  >
                    No lo sé
                  </button>
                )}

              <div className="flex flex-wrap gap-4 mt-6">
                <button
                  type="button"
                  onClick={handleFinishQuestionnaire}
                  disabled={submitting}
                  className="text-xs text-[var(--color-accent)] underline underline-offset-2 hover:no-underline"
                >
                  Terminar aquí y completar el resto en el informe
                </button>
              </div>

              <p className="text-xs text-[var(--color-ink-faint)] mt-6">
                Tu respuesta se almacena únicamente para este caso. Los datos que confirmes son los
                que se usan para analizar tu situación.
              </p>
            </div>
          ) : (
            <div className="text-center py-12 anim-fade-in">
              <p className="text-[var(--color-ink-muted)] mb-4">
                No hay más preguntas en este momento.
              </p>
              <button
                onClick={() => setState((prev) => ({ ...prev, phase: "evidence" }))}
                className="btn-primary"
              >
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
            Puedes subir una factura, contrato, correo o confirmación. Leemos el documento y te
            mostramos los datos que encontremos: solo se usan en el análisis los que tú confirmes.
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Drop area */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-8 bg-[var(--surface-paper)] border border-dashed border-[var(--border-default)] text-center mb-4 hover:border-[var(--color-accent)]/30 transition-colors cursor-pointer"
          >
            <svg
              className="w-8 h-8 text-[var(--color-ink-faint)] mx-auto mb-3"
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
            <p className="text-sm text-[var(--color-ink-muted)] mb-1">
              Haz clic para seleccionar archivos
            </p>
            <p className="text-xs text-[var(--color-ink-faint)]">PDF, TXT, JPG, PNG</p>
          </button>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2 mb-6">
              {selectedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-3 p-3 bg-[var(--surface-paper)] border border-[var(--border-light)]"
                >
                  <svg
                    className="w-4 h-4 text-[var(--color-ink-faint)] flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <span className="text-sm text-[var(--color-ink)] flex-1 truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-[var(--color-ink-faint)]">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={() => handleRemoveFile(i)}
                    className="text-[var(--color-ink-faint)] hover:text-[var(--color-contradicted)] transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload feedback — never silent */}
          {state.uploading && (
            <p className="text-sm text-[var(--color-ink-muted)] mb-4">Leyendo los documentos…</p>
          )}

          {state.uploadSummary && !state.uploading && (
            <div className="p-4 bg-[var(--color-supported-bg)] border border-[var(--color-accent-border)] text-sm text-[var(--color-ink-soft)] mb-4">
              {state.uploadSummary}
            </div>
          )}

          {state.uploadError && !state.uploading && (
            <div className="p-4 bg-[var(--color-potentially-bg)] border border-[var(--color-potentially)]/20 text-sm text-[var(--color-potentially)] mb-4">
              No pudimos procesar: {state.uploadError}. Puedes continuar sin esos documentos.
            </div>
          )}

          {/* Data found in the documents: confirm or discard, one by one */}
          {state.documentCandidates.length > 0 && (
            <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)] mb-6">
              <p className="label mb-3">Datos encontrados en tus documentos</p>
              <div className="space-y-3">
                {state.documentCandidates.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="flex flex-wrap items-center gap-3 justify-between"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-[var(--color-ink)]">
                        {candidate.factKey}:
                      </span>{" "}
                      <span className="text-sm text-[var(--color-ink-muted)]">
                        {isFactValueShaped(candidate.proposedValue)
                          ? String(
                              (candidate.proposedValue as { value: unknown }).value ?? "",
                            ).slice(0, 120)
                          : "valor no interpretable"}
                      </span>
                    </div>

                    {candidate.confirmed ? (
                      <span className="text-xs text-[var(--color-supported)]">Confirmado</span>
                    ) : candidate.rejected ? (
                      <span className="text-xs text-[var(--color-ink-faint)]">Descartado</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleConfirmCandidate(candidate)}
                          disabled={!isFactValueShaped(candidate.proposedValue)}
                          className="btn-secondary text-xs"
                        >
                          Es correcto
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setState((prev) => ({
                              ...prev,
                              documentCandidates: prev.documentCandidates.map((c) =>
                                c.candidateId === candidate.candidateId
                                  ? { ...c, rejected: true, confirmed: false }
                                  : c,
                              ),
                            }))
                          }
                          className="btn-ghost text-xs"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {state.error && (
                <p className="text-sm text-[var(--color-contradicted)] mt-3">{state.error}</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => void handleUploadEvidence(selectedFiles)}
              disabled={state.uploading}
              className="btn-primary"
            >
              {state.uploading
                ? "Leyendo documentos…"
                : selectedFiles.length > 0
                  ? `Leer ${selectedFiles.length} documento${selectedFiles.length > 1 ? "s" : ""}`
                  : "Analizar mi caso"}
            </button>
            <button
              onClick={handleSkipEvidence}
              disabled={state.uploading}
              className="btn-secondary"
            >
              {state.documentCandidates.length > 0 ? "Analizar sin documentos" : "Sin documentos"}
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
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Revisando la información
          </h2>
          <div className="space-y-2.5 mt-6 text-left max-w-xs mx-auto">
            {[
              "Organizando los hechos",
              "Comprobando las fechas",
              "Consultando las fuentes relevantes",
              "Preparando el resultado",
            ].map((step, i) => (
              <div
                key={step}
                className="flex items-center gap-3 text-sm text-[var(--color-ink-muted)] anim-fade-in"
                style={{ animationDelay: `${i * 600}ms` }}
              >
                <div
                  className="w-4 h-4 rounded-full border border-[var(--border-default)] flex items-center justify-center anim-fade-in"
                  style={{ animationDelay: `${i * 600 + 500}ms` }}
                >
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

  if (state.phase === "result" && state.result && state.caseId) {
    return (
      <CaseReport
        result={state.result}
        actionPlan={state.actionPlan}
        answers={state.answers}
        highlights={state.highlights}
        factLabels={state.factLabels}
        companyQuestion={state.companyQuestion}
        caseId={state.caseId}
        problemTitle={state.routing?.moduleTitle ?? null}
        busy={state.reanalyzing}
        error={state.error}
        onCompleteMissing={handleCompleteMissing}
      />
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────

  if (state.phase === "error") {
    const canRetry = input.trim().length >= 10;

    return (
      <div className="min-h-[80vh] bg-[var(--surface-page)]">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded bg-[var(--color-contradicted-bg)] flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-[var(--color-contradicted)]"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="mb-3">No hemos podido completar el análisis</h1>
            <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">{state.error}</p>
            <p className="text-xs text-[var(--color-ink-faint)] mt-3 leading-relaxed">
              No se ha guardado ningún caso a medias. Elige una de estas vías para continuar.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            {canRetry ? (
              <button
                onClick={() => void handleIntake()}
                disabled={submitting}
                className="btn-primary"
              >
                Volver a intentarlo
              </button>
            ) : (
              <button onClick={() => setState({ ...INITIAL_STATE })} className="btn-primary">
                Describir mi problema
              </button>
            )}
            <Link href="/problemas" className="btn-secondary">
              Ver los problemas disponibles
            </Link>
          </div>

          {canRetry && (
            <div className="mb-8 p-4 bg-[var(--surface-paper)] border border-[var(--border-light)]">
              <p className="label mb-2">Tu descripción</p>
              <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">{input}</p>
            </div>
          )}

          {availableProblems.length > 0 && (
            <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
              <p className="label mb-3">Continuar sin análisis automático</p>
              <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4">
                Estos problemas no dependen de ningún servicio externo: creamos el caso y empezamos
                por las preguntas.
              </p>
              <div className="flex flex-wrap gap-2">
                {availableProblems.map((problem) => (
                  <button
                    key={problem.key}
                    type="button"
                    onClick={() => void startFromProblem(problem.key, problem.title)}
                    className="text-sm px-3.5 py-2 border border-[var(--border-light)] bg-[var(--surface-warm)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors min-h-[40px]"
                  >
                    {problem.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Default ────────────────────────────────────────────────────

  return null;
}
