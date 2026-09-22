/**
 * Deterministic intake progress, shared by every route that needs it.
 *
 * Extracted from `/api/cases/[caseId]/intake` when the deterministic entry
 * (`/api/problems/[problemKey]/cases`) started returning the first question in
 * the same response: two copies of "what does this case still need?" is exactly
 * how the questionnaire and the analysis drift apart.
 *
 * "Finished" means every fact the module's rules actually read is confirmed —
 * not "the module's three required facts are present". Using the latter ended
 * the form after three questions, so the rules ran with half their inputs
 * missing and every claim came back INSUFFICIENT_DATA.
 */
import type { IntakeService } from "@core/intake/service";
import type { ProblemModuleDefinition, ProblemRegistry } from "@core/problems";
import type { QuestionSelection } from "@core/intake/types";
import { factValueMap } from "@core/problems/intake";
import type { KnownFact } from "@core/problems";
import { moduleIntakeRequirements } from "@server/rules/publish-module-rules";

/** Facts loaded for a case, as returned by the case service. */
export interface LoadedFactsView {
  readonly facts: readonly { key: string; value: unknown; status: string }[];
}

export interface IntakeProgressView {
  readonly nextQuestion: QuestionSelection | null;
  readonly allRequiredConfirmed: boolean;
}

export interface IntakeProgressServices {
  readonly registry: ProblemRegistry;
  readonly intakeService: IntakeService;
}

/** Progress for a case: the next fact the analysis still needs, and whether the questionnaire is done. */
export function resolveIntakeProgress(
  services: IntakeProgressServices,
  loaded: LoadedFactsView,
  problemKey: string,
  declinedFactKeys?: ReadonlySet<string>,
): IntakeProgressView {
  try {
    const problemModule = services.registry.get(problemKey);
    const requirements = moduleIntakeRequirements(problemModule);
    const knownFacts: KnownFact[] = loaded.facts.map((f) => ({
      key: f.key as KnownFact["key"],
      status: f.status as KnownFact["status"],
    }));
    const factValues = factValueMap(
      loaded.facts.map((f) => ({
        key: f.key as KnownFact["key"],
        value: f.value,
        status: f.status,
      })),
    );

    return {
      nextQuestion: services.intakeService.selectNextQuestion(
        problemModule,
        knownFacts,
        factValues,
        requirements.neededFactKeys,
        declinedFactKeys,
      ),
      allRequiredConfirmed: services.intakeService.intakeRequirementsSatisfied(
        problemModule,
        knownFacts,
        factValues,
        requirements.neededFactKeys,
        declinedFactKeys,
      ),
    };
  } catch {
    // Unknown module — the case simply has no next question.
    return { nextQuestion: null, allRequiredConfirmed: false };
  }
}

/**
 * Facts the client reports as "I don't know", taken from `?skipped=a,b`.
 *
 * The questionnaire is stateless per request, so the client tells the server
 * which questions to stop asking. Only keys the module actually declares are
 * accepted; anything else is ignored.
 */
export function parseDeclinedFactKeys(
  request: Request,
  services: IntakeProgressServices,
  problemKey: string | null | undefined,
): ReadonlySet<string> {
  const raw = new URL(request.url).searchParams.get("skipped");
  if (!raw || !problemKey || !services.registry.has(problemKey)) return new Set();

  const declared = new Set(
    services.registry.get(problemKey).intake.map((q) => q.factKey as string),
  );
  return new Set(
    raw
      .split(",")
      .map((key) => key.trim())
      .filter((key) => key.length > 0 && declared.has(key)),
  );
}

/** Jurisdiction/locale/currency a case for this module must be created with. */
export function caseDefaultsForModule(problemModule: ProblemModuleDefinition): {
  readonly problemSlug: string;
  readonly jurisdiction: string;
  readonly locale: string;
  readonly currency: string;
} {
  return {
    problemSlug: problemModule.key,
    jurisdiction: problemModule.jurisdictions[0] ?? "UNKNOWN",
    locale: problemModule.locales[0] ?? "es-ES",
    currency: "EUR",
  };
}
