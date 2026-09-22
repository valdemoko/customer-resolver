/**
 * Locale Translation Layer (Fase 15).
 *
 * Provides structured translations for UI elements.
 * Uses translation keys to avoid scattered `if locale === "es"` logic.
 *
 * IMPORTANT:
 *   - Legal source text is NEVER translated (would change legal meaning)
 *   - Domain terminology remains in English internally
 *   - UI translations are locale-specific
 *   - Legal concepts may not have direct translations
 */

// ── Translation Types ───────────────────────────────────────────────

/**
 * Translation keys organized by domain.
 */
export interface Translations {
  readonly common: {
    readonly next: string;
    readonly back: string;
    readonly save: string;
    readonly cancel: string;
    readonly loading: string;
    readonly error: string;
    readonly success: string;
  };
  readonly case: {
    readonly status: Record<string, string>;
    readonly actions: Record<string, string>;
    readonly timeline: Record<string, string>;
  };
  readonly research: {
    readonly status: Record<string, string>;
    readonly findings: Record<string, string>;
    readonly sources: Record<string, string>;
  };
  readonly documents: {
    readonly types: Record<string, string>;
    readonly status: Record<string, string>;
  };
  readonly intake: {
    readonly welcome: string;
    readonly questionPrefix: string;
    readonly confirmation: string;
  };
  readonly jurisdiction: {
    readonly select: string;
    readonly whereOccurred: string;
    readonly unsupported: string;
    readonly researchAvailable: string;
  };
  readonly legal: {
    readonly disclaimer: string;
    readonly notLegalAdvice: string;
    readonly sourcesDisclaimer: string;
  };
}

// ── Spanish (es-ES) ─────────────────────────────────────────────────

const ES_ES: Translations = {
  common: {
    next: "Siguiente",
    back: "Volver",
    save: "Guardar",
    cancel: "Cancelar",
    loading: "Cargando...",
    error: "Error",
    success: "Éxito",
  },
  case: {
    status: {
      DRAFT: "Borrador",
      COLLECTING_INFORMATION: "Recopilando información",
      READY_FOR_ANALYSIS: "Listo para analizar",
      ANALYZING_X: "Analizando",
      NEEDS_INFORMATION: "Necesita información",
      HAS_CONTRADICTIONS: "Contradicciones",
      RESULT_AVAILABLE: "Resultado disponible",
      ACTION_IN_PROGRESS: "Acción en progreso",
      AWAITING_RESPONSE: "Esperando respuesta",
      ESCALATED: "Escalado",
      CLOSED: "Cerrado",
    },
    actions: {
      COLLECT_INFORMATION: "Recopilar información",
      PRESERVE_EVIDENCE: "Conservar evidencia",
      CONTACT_MERCHANT: "Contactar al proveedor",
      REQUEST_REFUND: "Solicitar reembolso",
      SUBMIT_COMPLAINT: "Presentar reclamación",
      GENERATE_DOCUMENT: "Generar documento",
      WAIT_FOR_RESPONSE: "Esperar respuesta",
      ESCALATE: "Escalar",
    },
    timeline: {
      CASE_CREATED: "Caso creado",
      CASE_STATUS_CHANGED: "Estado del caso actualizado",
      FACT_ADDED: "Nuevo dato confirmado",
      FACT_UPDATED: "Dato actualizado",
      CONTRADICTION_DETECTED: "Información contradictoria detectada",
      CONTRADICTION_RESOLVED: "Contradicción resuelta",
      EVIDENCE_CREATED: "Nueva evidencia añadida",
      SNAPSHOT_CREATED: "Análisis del caso actualizado",
      ANALYSIS_RECALCULATED: "Análisis recalculado",
      DOCUMENT_GENERATED: "Documento generado",
      COMMUNICATION_RECORDED: "Comunicación registrada",
      CASE_ESCALATED: "Caso escalado",
      CASE_REOPENED: "Caso reabierto",
      CASE_CLOSED: "Caso cerrado",
    },
  },
  research: {
    status: {
      RESEARCH_PENDING: "Pendiente",
      RESEARCHING: "Investigando...",
      SOURCES_FOUND: "Fuentes encontradas",
      SOURCES_VALIDATED: "Fuentes validadas",
      ANALYSIS_READY: "Análisis listo",
      RESULT_READY: "Resultado listo",
      INSUFFICIENT_INFORMATION: "Información insuficiente",
      NO_RELIABLE_SOURCE: "Sin fuente fiable",
      JURISDICTION_UNCERTAIN: "Jurisdicción incierta",
      SOURCE_CONFLICT: "Conflicto entre fuentes",
      RESEARCH_FAILED: "Investigación fallida",
    },
    findings: {
      SUPPORTED: "Confirmado",
      POTENTIALLY_APPLICABLE: "Potencialmente aplicable",
      INSUFFICIENT_DATA: "Datos insuficientes",
      CONTRADICTED: "Contradictorio",
      NOT_APPLICABLE: "No aplicable",
      UNKNOWN: "Desconocido",
    },
    sources: {
      OFFICIAL_LEGISLATION: "Legislación oficial",
      OFFICIAL_REGULATION: "Regulación oficial",
      GOVERNMENT_MINISTRY: "Ministerio",
      OFFICIAL_REGULATOR: "Regulador oficial",
      INSTITUTIONAL_SOURCE: "Fuente institucional",
      PROFESSIONAL_SOURCE: "Fuente profesional",
      SECONDARY_SOURCE: "Fuente secundaria",
      UNVERIFIED: "Sin verificar",
    },
  },
  documents: {
    types: {
      CONSUMER_COMPLAINT: "Reclamación de consumidor",
      REFUND_REQUEST: "Solicitud de reembolso",
      WARRANTY_CLAIM: "Reclamación de garantía",
      FLIGHT_CANCELLATION_CLAIM: "Reclamación por cancelación de vuelo",
      GENERAL_FORMAL_REQUEST: "Solicitud formal general",
    },
    status: {
      DRAFT: "Borrador",
      VALIDATED: "Validado",
      USER_EDITED: "Editado por usuario",
      FINAL: "Final",
      EXPORTED: "Exportado",
    },
  },
  intake: {
    welcome: "¿Qué problema de consumo necesitas resolver?",
    questionPrefix: "Para entender mejor tu situación,",
    confirmation: "¿Es correcta esta información?",
  },
  jurisdiction: {
    select: "¿Dónde ocurrió el problema?",
    whereOccurred: "¿En qué país se realizó la compra o tuvo lugar el problema?",
    unsupported: "Actualmente no tenemos soporte legal para este país.",
    researchAvailable: "Podemos investigar la legislación aplicable en tu país.",
  },
  legal: {
    disclaimer: "Esta información no constituye asesoramiento legal.",
    notLegalAdvice:
      "Los resultados se basan en la información proporcionada y las normativas vigentes.",
    sourcesDisclaimer: "Las fuentes consultadas son de carácter público e informativo.",
  },
};

// ── English (en-GB) ─────────────────────────────────────────────────

const EN_GB: Translations = {
  common: {
    next: "Next",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading...",
    error: "Error",
    success: "Success",
  },
  case: {
    status: {
      DRAFT: "Draft",
      COLLECTING_INFORMATION: "Collecting information",
      READY_FOR_ANALYSIS: "Ready for analysis",
      ANALYZING_X: "Analysing",
      NEEDS_INFORMATION: "Needs information",
      HAS_CONTRADICTIONS: "Contradictions",
      RESULT_AVAILABLE: "Result available",
      ACTION_IN_PROGRESS: "Action in progress",
      AWAITING_RESPONSE: "Awaiting response",
      ESCALATED: "Escalated",
      CLOSED: "Closed",
    },
    actions: {
      COLLECT_INFORMATION: "Collect information",
      PRESERVE_EVIDENCE: "Preserve evidence",
      CONTACT_MERCHANT: "Contact merchant",
      REQUEST_REFUND: "Request refund",
      SUBMIT_COMPLAINT: "Submit complaint",
      GENERATE_DOCUMENT: "Generate document",
      WAIT_FOR_RESPONSE: "Wait for response",
      ESCALATE: "Escalate",
    },
    timeline: {
      CASE_CREATED: "Case created",
      CASE_STATUS_CHANGED: "Case status updated",
      FACT_ADDED: "New fact confirmed",
      FACT_UPDATED: "Fact updated",
      CONTRADICTION_DETECTED: "Contradiction detected",
      CONTRADICTION_RESOLVED: "Contradiction resolved",
      EVIDENCE_CREATED: "New evidence added",
      SNAPSHOT_CREATED: "Case analysis updated",
      ANALYSIS_RECALCULATED: "Analysis recalculated",
      DOCUMENT_GENERATED: "Document generated",
      COMMUNICATION_RECORDED: "Communication recorded",
      CASE_ESCALATED: "Case escalated",
      CASE_REOPENED: "Case reopened",
      CASE_CLOSED: "Case closed",
    },
  },
  research: {
    status: {
      RESEARCH_PENDING: "Pending",
      RESEARCHING: "Researching...",
      SOURCES_FOUND: "Sources found",
      SOURCES_VALIDATED: "Sources validated",
      ANALYSIS_READY: "Analysis ready",
      RESULT_READY: "Result ready",
      INSUFFICIENT_INFORMATION: "Insufficient information",
      NO_RELIABLE_SOURCE: "No reliable source",
      JURISDICTION_UNCERTAIN: "Jurisdiction uncertain",
      SOURCE_CONFLICT: "Source conflict",
      RESEARCH_FAILED: "Research failed",
    },
    findings: {
      SUPPORTED: "Confirmed",
      POTENTIALLY_APPLICABLE: "Potentially applicable",
      INSUFFICIENT_DATA: "Insufficient data",
      CONTRADICTED: "Contradicted",
      NOT_APPLICABLE: "Not applicable",
      UNKNOWN: "Unknown",
    },
    sources: {
      OFFICIAL_LEGISLATION: "Official legislation",
      OFFICIAL_REGULATION: "Official regulation",
      GOVERNMENT_MINISTRY: "Government ministry",
      OFFICIAL_REGULATOR: "Official regulator",
      INSTITUTIONAL_SOURCE: "Institutional source",
      PROFESSIONAL_SOURCE: "Professional source",
      SECONDARY_SOURCE: "Secondary source",
      UNVERIFIED: "Unverified",
    },
  },
  documents: {
    types: {
      CONSUMER_COMPLAINT: "Consumer complaint",
      REFUND_REQUEST: "Refund request",
      WARRANTY_CLAIM: "Warranty claim",
      FLIGHT_CANCELLATION_CLAIM: "Flight cancellation claim",
      GENERAL_FORMAL_REQUEST: "General formal request",
    },
    status: {
      DRAFT: "Draft",
      VALIDATED: "Validated",
      USER_EDITED: "User edited",
      FINAL: "Final",
      EXPORTED: "Exported",
    },
  },
  intake: {
    welcome: "What consumer problem do you need help with?",
    questionPrefix: "To better understand your situation,",
    confirmation: "Is this information correct?",
  },
  jurisdiction: {
    select: "Where did this happen?",
    whereOccurred: "In which country did the purchase or problem occur?",
    unsupported: "We currently do not have legal support for this country.",
    researchAvailable: "We can research the applicable legislation in your country.",
  },
  legal: {
    disclaimer: "This information does not constitute legal advice.",
    notLegalAdvice: "Results are based on the information provided and current regulations.",
    sourcesDisclaimer: "Sources consulted are public and informational in nature.",
  },
};

// ── Translation Registry ────────────────────────────────────────────

const TRANSLATIONS = new Map<string, Translations>([
  ["es-ES", ES_ES],
  ["en-GB", EN_GB],
  ["en-US", EN_GB], // Use en-GB as fallback for en-US
]);

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get translations for a locale.
 * Falls back to en-GB if locale not found.
 */
export function getTranslations(locale: string): Translations {
  return TRANSLATIONS.get(locale) ?? EN_GB;
}

/**
 * Get a translated string by key path.
 * Example: getTranslation("es-ES", "case.status.ACTIVE")
 */
export function getTranslation(locale: string, keyPath: string): string {
  const translations = getTranslations(locale);
  const keys = keyPath.split(".");

  let value: unknown = translations;
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return keyPath; // Return key path if translation not found
    }
  }

  return typeof value === "string" ? value : keyPath;
}

/**
 * Get all supported locales.
 */
export function getSupportedLocales(): readonly string[] {
  return Array.from(TRANSLATIONS.keys());
}

/**
 * Check if a locale is supported.
 */
export function isLocaleSupported(locale: string): boolean {
  return TRANSLATIONS.has(locale);
}
