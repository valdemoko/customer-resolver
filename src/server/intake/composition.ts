/**
 * Composition root for F8.3 intake API routes.
 *
 * Creates services from environment — follows existing pattern
 * from src/app/api/problems/[problemKey]/cases/route.ts.
 */
import { CaseService } from "@core/case/service";
import type { ProblemRegistry } from "@core/problems";
import { IntakeService } from "@core/intake/service";
import { AIRouter } from "@core/ai/router";
import { createDefaultPromptRegistry } from "@core/ai/prompts";
import { createNeonDb, type AppDb } from "@server/db/client";
import { DrizzleCaseRepository } from "@server/db/repositories/case-repository";
import { AIRequestAuditRepository } from "@server/db/repositories/ai-request-repository";
import { createAIProvidersFromEnv } from "@server/adapters/ai";
import { DrizzleBudgetStore } from "@server/db/repositories/budget-store";
import { setBudgetStore } from "@server/intake/budget-store";
import { getServerEnv } from "@/lib/env";
import { createProblemRegistry } from "@server/problems/registry";

type Repo = ConstructorParameters<typeof DrizzleCaseRepository>[0];
type BudgetDb = ConstructorParameters<typeof DrizzleBudgetStore>[0];

export interface IntakeServices {
  registry: ProblemRegistry;
  caseService: CaseService;
  intakeService: IntakeService;
  /** Shared AI router (document fact extraction uses it too). */
  router: AIRouter;
}

/**
 * Create all services needed for intake routes.
 * Throws if DATABASE_URL is not configured.
 */
export function createIntakeServices(): IntakeServices {
  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for intake API");
  }

  const db: AppDb = createNeonDb(env.DATABASE_URL);
  const repo = new DrizzleCaseRepository(db as unknown as Repo);
  const caseService = new CaseService(repo);

  // Problem registry — single shared registration
  const registry = createProblemRegistry();

  // AI infrastructure
  const providers = createAIProvidersFromEnv(env);
  const promptRegistry = createDefaultPromptRegistry();
  const auditRepo = new AIRequestAuditRepository(db);
  const router = new AIRouter(providers, promptRegistry, auditRepo);

  // Persistent budget store (F11: replaces in-memory Map)
  const budgetStore = new DrizzleBudgetStore(db as unknown as BudgetDb);
  setBudgetStore(budgetStore);

  // Intake service
  const intakeService = new IntakeService(router, registry);

  return { registry, caseService, intakeService, router };
}
