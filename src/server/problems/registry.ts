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
