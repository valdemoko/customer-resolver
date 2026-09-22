/**
 * The one place where problem modules are registered.
 *
 * Every route used to build its own registry and re-register the same four
 * modules. That duplication is how a module can end up registered for the
 * analysis but not for the questionnaire (or vice versa), which is exactly the
 * kind of drift that breaks the intake flow. There is now a single list.
 *
 * Adding a module: register it here and add its rule set to
 * `src/server/rules/publish-module-rules.ts` (a guard test enforces the pair).
 */
import { ProblemRegistry } from "@core/problems";
import type { ProblemModuleDefinition } from "@core/problems/contract";
import { cancellationChargeModule } from "@problems/cancellation-charge";
import { noDeliveryRefundModule } from "@problems/no-delivery-refund";
import { warrantyRejectionModule } from "@problems/warranty-rejection";
import { flightCancelModule } from "@problems/flight-cancel";

export function createProblemRegistry(): ProblemRegistry {
  const registry = new ProblemRegistry();
  registry.register(cancellationChargeModule);
  registry.register(noDeliveryRefundModule);
  registry.register(warrantyRejectionModule);
  registry.register(flightCancelModule);
  return registry;
}

/**
 * The module's intake questions in the shape `buildResult` expects.
 *
 * Kept here (not in each route) so the report, the actions and the export always
 * describe missing data with the same wording the questionnaire used. When the
 * routes each mapped the questions themselves, the export forgot to pass them
 * and its report listed raw fact keys.
 */
export interface ModuleIntakeQuestion {
  readonly id: string;
  readonly text: string;
  readonly factKey: string;
  readonly required: boolean;
  /** Declared answer type, so the report can render the right control. */
  readonly type?: string;
  readonly options?: readonly string[];
}

export function moduleIntakeQuestions(
  module: ProblemModuleDefinition | null,
): readonly ModuleIntakeQuestion[] {
  return (module?.intake ?? []).map((q) => {
    const catalogueEntry = module?.factCatalogue.find((f) => f.key === q.factKey);
    return {
      id: q.id,
      text: q.text,
      factKey: q.factKey as string,
      required: q.required,
      type: q.type ?? catalogueEntry?.type,
      options: q.options ?? (catalogueEntry?.options as readonly string[] | undefined),
    };
  });
}

/**
 * Human description per fact key from the module catalogue.
 *
 * Used for facts no question can collect, so the report never shows the user a
 * raw key such as `flight.compensation_tier`.
 */
export function moduleFactLabels(
  module: ProblemModuleDefinition | null,
): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const fact of module?.factCatalogue ?? []) {
    labels[fact.key as string] = fact.description;
  }
  return labels;
}
