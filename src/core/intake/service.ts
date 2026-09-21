/**
 * Universal Problem Intake Service (Fase 8.3, spec §7).
 *
 * Orchestrates:
 *   - AI interpretation of user text
 *   - Deterministic routing to modules
 *   - Deterministic question selection
 *   - Fact confirmation flow
 *
 * Fundamental principle:
 *   AI interprets → System routes → User confirms → Rules evaluate
 *
 * Never:
 *   User → LLM → Legal answer
 */
import type { FactKey, FactValue } from "../types";
import type { AIRequestId } from "../ai/types";
import type { AIRouter } from "../ai/router";
import type { ProblemRegistry, ProblemModuleDefinition } from "../problems/contract";
import type { KnownFact } from "../problems/intake";
import { sanitizeUntrustedText, assembleUserMessage } from "../ai/sanitize";
import {
  type IntakeInterpretation,
  type RoutingDecision,
  type QuestionSelection,
  type AISafeModuleDescriptor,
} from "./types";
import {
  intakeInterpretationSchema,
  INTAKE_SCHEMA_VERSION,
  type IntakeInterpretationOutput,
} from "./schemas";
import { buildModuleCatalogue, formatCatalogueForPrompt } from "./catalogue";
import { routeInterpretation } from "./routing";
import { selectNextQuestion, allRequiredFactsConfirmed } from "./question-selector";
import { BudgetExceededError } from "./errors";

// ── Constants ────────────────────────────────────────────────────────

/** Maximum PROBLEM_INTERPRETATION AI calls per intake session. */
export const MAX_INTERPRETATION_CALLS = 3;

/** Prompt ID for the interpretation task. */
export const INTERPRETATION_PROMPT_ID = "problem-interpretation";

// ── Intake Service ───────────────────────────────────────────────────

export class IntakeService {
  private readonly catalogue: readonly AISafeModuleDescriptor[];
  private readonly registeredKeys: ReadonlySet<string>;

  constructor(
    private readonly router: AIRouter,
    private readonly registry: ProblemRegistry,
  ) {
    this.catalogue = buildModuleCatalogue(registry);
    this.registeredKeys = new Set(registry.list().map((m) => m.key));
  }

  /**
   * Interpret a user message using AI.
   *
   * Flow:
   *   1. Sanitize user text (prompt injection defense)
   *   2. Build AI prompt with module catalogue
   *   3. Call AI router with structured output schema
   *   4. Validate output with Zod
   *   5. Filter invalid fact keys against module catalogue
   *   6. Return structured interpretation
   *
   * The AI output is DATA — never legal truth.
   */
  async interpretUserMessage(
    userMessage: string,
    options: {
      caseId?: string;
      previouslyConfirmedFacts?: ReadonlyMap<FactKey, FactValue>;
      interpretationCount: number;
      now: () => string;
    },
  ): Promise<{
    interpretation: IntakeInterpretation;
    aiRequestId: AIRequestId;
  }> {
    // Budget check
    if (options.interpretationCount >= MAX_INTERPRETATION_CALLS) {
      throw new BudgetExceededError(MAX_INTERPRETATION_CALLS);
    }

    // Sanitize user text (prompt injection defense layer 1+2)
    const sanitized = sanitizeUntrustedText(userMessage);

    // Build catalogue text for prompt
    const catalogueText = formatCatalogueForPrompt(this.catalogue);

    // Build context for the AI
    let contextNote = "";
    if (options.previouslyConfirmedFacts && options.previouslyConfirmedFacts.size > 0) {
      const factsList = [...options.previouslyConfirmedFacts.entries()]
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      contextNote = `\n\nPreviously confirmed facts: ${factsList}`;
    }

    // Assemble user message with sanitization
    const instruction = `Analyze this consumer problem description and produce a structured interpretation.\n\nCATALOGUE:\n${catalogueText}${contextNote}`;
    const fullUserMessage = assembleUserMessage(sanitized.text, instruction);

    // Call AI router
    const result = await this.router.run({
      task: "PROBLEM_INTERPRETATION" as never, // Will be added to AITaskType
      caseId: options.caseId,
      maxOutputTokens: 2048,
      temperature: 0,
      userMessage: fullUserMessage,
      inputContentParts: [userMessage, catalogueText],
      promptId: INTERPRETATION_PROMPT_ID,
      outputSchema: intakeInterpretationSchema,
      now: options.now,
    });

    const rawOutput = result.data as IntakeInterpretationOutput;

    // Build allowlists from registered modules
    const validFactKeys = new Set<string>();
    const moduleRequiredFacts = new Map<string, Set<string>>();
    for (const mod of this.registry.list()) {
      const required = new Set<string>();
      for (const fact of mod.factCatalogue) {
        validFactKeys.add(fact.key);
        if (fact.required) required.add(fact.key);
      }
      moduleRequiredFacts.set(mod.key, required);
    }

    // Validate sourceText: must be a substring of user input (verbatim quote)
    const userTextLower = userMessage.toLowerCase();
    const validatedCandidates = rawOutput.factCandidates
      .filter((c) => validFactKeys.has(c.factKey))
      .map((c) => {
        // Validate sourceText is actually from user input
        const sourceTextValid = userTextLower.includes(c.sourceText.toLowerCase().trim());
        return {
          candidateId: c.candidateId,
          factKey: c.factKey as FactKey,
          proposedValue: c.proposedValue as unknown as FactValue,
          sourceText: sourceTextValid ? c.sourceText : "[source not verified]",
          aiInterpretation: c.aiInterpretation,
          certainty: c.certainty,
          problemKey: c.problemKey,
          status: "UNCONFIRMED" as const,
          aiRequestId: result.record.aiRequestId,
        };
      });

    // Sanitize candidates (matchedRequiredFacts sanitization happens in candidateModules below)
    const sanitizedCandidates = validatedCandidates.map((c) => ({
      ...c,
    }));

    // Sanitize candidateModules: filter matchedRequiredFacts to only real required facts
    const sanitizedCandidateModules = rawOutput.candidateModules.map((cm) => {
      const modRequired = moduleRequiredFacts.get(cm.problemKey);
      if (!modRequired) return cm;
      return {
        ...cm,
        matchedRequiredFacts: cm.matchedRequiredFacts.filter((f) => modRequired.has(f)),
        // Also ensure missingRequiredFacts contains only real required facts
        missingRequiredFacts: cm.missingRequiredFacts.filter((f) => modRequired.has(f)),
      };
    });

    // Build interpretation
    const interpretation: IntakeInterpretation = {
      summary: rawOutput.summary,
      candidateModules: sanitizedCandidateModules,
      factCandidates: sanitizedCandidates,
      missingInformation: rawOutput.missingInformation,
      ambiguities: rawOutput.ambiguities,
      contradictions: rawOutput.contradictions,
      entities: rawOutput.entities,
      jurisdictionHints: rawOutput.jurisdictionHints,
      classificationConfidence: rawOutput.classificationConfidence,
      interpretationVersion: INTAKE_SCHEMA_VERSION,
      aiRequestId: result.record.aiRequestId,
    };

    return { interpretation, aiRequestId: result.record.aiRequestId };
  }

  /**
   * Route an interpretation to a module.
   *
   * Deterministic: same interpretation + same catalogue → same decision.
   * AI confidence is one signal among many — never sufficient alone.
   */
  routeInterpretation(interpretation: IntakeInterpretation): RoutingDecision {
    return routeInterpretation(interpretation, this.catalogue, this.registeredKeys);
  }

  /**
   * Select the next question for a routed module.
   *
   * Deterministic: same module + same confirmed facts → same question.
   * UNCONFIRMED AI candidates do NOT satisfy questions.
   */
  selectNextQuestion(
    module: ProblemModuleDefinition,
    confirmedFacts: readonly KnownFact[],
    factValues: ReadonlyMap<FactKey, unknown>,
  ): QuestionSelection | null {
    return selectNextQuestion(module, confirmedFacts, factValues);
  }

  /**
   * Check if all required facts are confirmed for a module.
   */
  allRequiredFactsConfirmed(
    module: ProblemModuleDefinition,
    confirmedFacts: readonly KnownFact[],
  ): boolean {
    return allRequiredFactsConfirmed(module, confirmedFacts);
  }

  /**
   * Get the AI-safe module catalogue.
   */
  getCatalogue(): readonly AISafeModuleDescriptor[] {
    return this.catalogue;
  }

  /**
   * Check if a problem key is registered.
   */
  isRegistered(problemKey: string): boolean {
    return this.registeredKeys.has(problemKey);
  }
}
