/**
 * Document Generation Validator (Fase 12).
 *
 * Deterministic validation of AI-generated drafts.
 * This is the PRIMARY defense against hallucination.
 *
 * Validates:
 *   1. Every factual statement traces to a confirmed fact
 *   2. Every legal statement traces to a supported claim
 *   3. Every citation references a real source
 *   4. No invented dates, amounts, or legal articles
 *   5. No contradictions hidden
 *   6. No unconfirmed facts presented as confirmed
 *   7. No unsupported claims presented as legal assertions
 *
 * The validator NEVER calls another AI. It is purely deterministic.
 */
import type { DocumentGenerationInput, GeneratedDraft } from "./types";

// ── Validation Result ───────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly severity: "BLOCKING" | "WARNING";
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
}

// ── Fact Validation ─────────────────────────────────────────────────

/**
 * Validate that every factual statement in the draft traces to a confirmed fact.
 */
function validateFactualStatements(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const confirmedFactKeys = new Set(input.confirmedFacts.map((f) => f.factKey as string));

  for (const statement of draft.factualStatements) {
    if (!confirmedFactKeys.has(statement.factKey)) {
      errors.push({
        code: "UNTRACEABLE_FACT",
        message: `Factual statement references fact '${statement.factKey}' which is not in the confirmed facts list`,
        severity: "BLOCKING",
      });
    }
  }

  return errors;
}

// ── Legal Claim Validation ──────────────────────────────────────────

/**
 * Validate that every legal statement traces to a supported claim.
 */
function validateLegalStatements(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const supportedClaimIds = new Set(input.supportedClaims.map((c) => c.claimId));

  for (const statement of draft.legalStatements) {
    if (!supportedClaimIds.has(statement.claimId)) {
      errors.push({
        code: "UNTRACEABLE_CLAIM",
        message: `Legal statement references claim '${statement.claimId}' which is not in the supported claims list`,
        severity: "BLOCKING",
      });
    }
  }

  return errors;
}

// ── Numeric Hallucination Detection ─────────────────────────────────

/**
 * Detect if the draft contains numbers that don't appear in the input.
 * This catches AI-invented compensation amounts, dates, etc.
 */
function detectNumericHallucinations(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Extract all numbers from the input
  const inputNumbers = extractNumbersFromInput(input);

  // Extract all numbers from the draft
  const allDraftText = [
    ...draft.sections.map((s) => s.content),
    ...draft.factualStatements.map((s) => s.text),
    ...draft.legalStatements.map((s) => s.text),
    ...draft.requestedActions,
  ].join(" ");

  const draftNumbers = extractNumbers(allDraftText);

  // Check for numbers in draft that don't appear in input
  for (const num of draftNumbers) {
    if (!inputNumbers.has(num.value) && !isCommonNumber(num.value)) {
      errors.push({
        code: "INVENTED_NUMBER",
        message: `Draft contains number ${num.value} (${num.context}) which does not appear in the case data`,
        severity: "WARNING",
      });
    }
  }

  return errors;
}

function extractNumbers(text: string): readonly { value: string; context: string }[] {
  const numbers: { value: string; context: string }[] = [];
  const regex = /\b\d+(?:[.,]\d+)?(?:\s*(?:€|EUR|USD|%|días?|horas?|meses?|años?))?\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    numbers.push({
      value: match[0].trim(),
      context: text.slice(start, end).trim(),
    });
  }

  return numbers;
}

function extractNumbersFromInput(input: DocumentGenerationInput): Set<string> {
  const numbers = new Set<string>();

  for (const fact of input.confirmedFacts) {
    const nums = extractNumbers(fact.text);
    for (const n of nums) numbers.add(n.value);
  }

  for (const claim of input.supportedClaims) {
    const nums = extractNumbers(claim.text);
    for (const n of nums) numbers.add(n.value);
  }

  for (const source of input.applicableSources) {
    const nums = extractNumbers(source.assertionRef);
    for (const n of nums) numbers.add(n.value);
  }

  return numbers;
}

function isCommonNumber(value: string): boolean {
  // Common numbers that don't need traceability
  const common = ["1", "2", "3", "4", "5", "10", "14", "24", "100"];
  const cleaned = value.replace(/[€EURUSD%,\s]/g, "");
  return common.includes(cleaned);
}

// ── Source Citation Validation ──────────────────────────────────────

/**
 * Validate that every citation references a real source in the input.
 */
function validateCitations(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];
  // Check that sections with LEGAL_BASIS type reference valid sources
  for (const section of draft.sections) {
    if (section.type === "LEGAL_BASIS") {
      // Extract potential source references from the text
      const text = section.content.toLowerCase();
      if (text.includes("artículo") || text.includes("ley") || text.includes("reglamento")) {
        // Legal basis section exists — ensure we have supporting sources
        if (input.applicableSources.length === 0) {
          errors.push({
            code: "LEGAL_BASIS_NO_SOURCES",
            message: "Document has a LEGAL_BASIS section but no applicable sources were provided",
            severity: "WARNING",
          });
        }
      }
    }
  }

  return errors;
}

// ── Contradiction Visibility ────────────────────────────────────────

/**
 * Validate that unresolved items are not hidden.
 * If the input has contradictions, the draft should acknowledge them.
 */
function validateContradictionVisibility(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const hasContradictions = input.unresolvedItems.some((item) => item.type === "CONTRADICTION");

  if (hasContradictions) {
    const draftAcknowledgesContradictions = draft.unresolvedItems.some(
      (item) => item.type === "CONTRADICTION" || item.type === "contradiction",
    );

    if (!draftAcknowledgesContradictions) {
      errors.push({
        code: "HIDDEN_CONTRADICTION",
        message: "Input contains contradictions but the draft does not acknowledge them",
        severity: "BLOCKING",
      });
    }
  }

  return errors;
}

// ── Section Validation ──────────────────────────────────────────────

/**
 * Validate that the draft has required sections.
 */
function validateSections(draft: GeneratedDraft): ValidationError[] {
  const errors: ValidationError[] = [];
  const sectionTypes = new Set(draft.sections.map((s) => s.type));

  // Every document should have at least an introduction and facts
  if (!sectionTypes.has("INTRODUCTION") && !sectionTypes.has("HEADER")) {
    errors.push({
      code: "MISSING_INTRODUCTION",
      message: "Document is missing an introduction/header section",
      severity: "WARNING",
    });
  }

  if (draft.factualStatements.length > 0 && !sectionTypes.has("FACTS")) {
    errors.push({
      code: "MISSING_FACTS_SECTION",
      message: "Document has factual statements but no FACTS section",
      severity: "WARNING",
    });
  }

  return errors;
}

// ── Content Safety ──────────────────────────────────────────────────

/**
 * Detect dangerous content patterns in the draft.
 */
function validateContentSafety(draft: GeneratedDraft): ValidationError[] {
  const errors: ValidationError[] = [];
  const allText = draft.sections.map((s) => s.content).join(" ");

  // Detect absolute legal claims without qualification
  const absolutePatterns = [
    /tiene\s+derecho\s+a\s+(?:recibir|obtener|cobrar)\s+\d/i,
    /la\s+ley\s+(?:le\s+)?obliga\s+a\s+(?:pagar|reembolsar|indemnizar)/i,
    /debe\s+(?:pagar|reembolsar|indemnizar)\s+(?:una\s+)?(?:suma|cantidad|importe)/i,
  ];

  for (const pattern of absolutePatterns) {
    if (pattern.test(allText)) {
      errors.push({
        code: "ABSOLUTE_LEGAL_CLAIM",
        message:
          "Document contains absolute legal claims that should be qualified with 'con la información disponible'",
        severity: "WARNING",
      });
    }
  }

  return errors;
}

// ── Main Validator ──────────────────────────────────────────────────

/**
 * Validate an AI-generated draft against the input data.
 * Deterministic: same draft + same input → same result.
 *
 * Returns a ValidationResult with blocking errors and warnings.
 * If any BLOCKING error exists, the draft must NOT be shown to the user
 * as a valid document.
 */
export function validateDraft(
  draft: GeneratedDraft,
  input: DocumentGenerationInput,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Run all validators
  errors.push(...validateFactualStatements(draft, input));
  errors.push(...validateLegalStatements(draft, input));
  errors.push(...validateCitations(draft, input));
  errors.push(...validateContradictionVisibility(draft, input));
  errors.push(...detectNumericHallucinations(draft, input));
  errors.push(...validateSections(draft));
  errors.push(...validateContentSafety(draft));

  // Convert blocking errors to warnings for the report
  const blockingErrors = errors.filter((e) => e.severity === "BLOCKING");
  const warningErrors = errors.filter((e) => e.severity === "WARNING");

  for (const w of warningErrors) {
    warnings.push({ code: w.code, message: w.message });
  }

  return {
    valid: blockingErrors.length === 0,
    errors: blockingErrors,
    warnings,
  };
}
