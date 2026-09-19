/**
 * Problem Module contract (Fase 4).
 *
 * Generic contract in the core: a problem module is DECLARATIVE DATA plus
 * rule references. The core never imports a concrete module (ESLint + FS scan
 * enforce it); modules import core services. Identity is domain-level
 * ("cancellation-charge@1"), never a web route.
 */
import { z } from "zod";
import type { FactKey, JurisdictionCode, Locale } from "../types";

export type ProblemModuleId = string & { readonly __brand: "ProblemModuleId" };

// ── Fact catalogue entry ────────────────────────────────────────────

export const factTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "money",
  "enum",
  "object",
]);

export interface FactCatalogueEntry {
  readonly key: FactKey;
  readonly type: z.infer<typeof factTypeSchema>;
  /** What this fact means (module-local documentation). */
  readonly description: string;
  /** Which intake question (if any) normally provides it. */
  readonly questionId?: string;
  readonly required: boolean;
  /** Enum options when type = "enum". */
  readonly options?: readonly string[];
}

// ── Adaptive intake ─────────────────────────────────────────────────

export const questionTypeSchema = z.enum(["string", "number", "boolean", "date", "money", "enum"]);

export interface IntakeQuestion {
  readonly id: string;
  readonly text: string;
  readonly type: z.infer<typeof questionTypeSchema>;
  /** Fact key the answer maps to. */
  readonly factKey: FactKey;
  readonly required: boolean;
  readonly options?: readonly string[];
  /** Show only when these facts are already known AND match (skip logic). */
  readonly askIf?: readonly {
    readonly factKey: FactKey;
    readonly equals: string | number | boolean;
  }[];
}

// ── Module definition ───────────────────────────────────────────────

export interface ProblemModuleDefinition {
  /** Stable domain identity, e.g. "cancellation-charge". */
  readonly key: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly jurisdictions: readonly JurisdictionCode[];
  readonly locales: readonly Locale[];
  readonly factCatalogue: readonly FactCatalogueEntry[];
  readonly intake: readonly IntakeQuestion[];
  /** Rule keys this module evaluates (rules live in the rules registry). */
  readonly ruleKeys: readonly string[];
  /** Related problem keys for future SEO/linking (not used in F4 runtime). */
  readonly relatedProblems?: readonly string[];
}

export const problemModuleSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  jurisdictions: z.array(z.string()).min(1),
  locales: z.array(z.string()).min(1),
  factCatalogue: z
    .array(
      z.object({
        key: z.string(),
        type: factTypeSchema,
        description: z.string().min(1),
        questionId: z.string().optional(),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  intake: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1),
        type: questionTypeSchema,
        factKey: z.string(),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        askIf: z
          .array(
            z.object({
              factKey: z.string(),
              equals: z.union([z.string(), z.number(), z.boolean()]),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  ruleKeys: z.array(z.string()).min(1),
  relatedProblems: z.array(z.string()).optional(),
});

/**
 * Input variant with branded strings widened to plain strings: module authors
 * write literals ("cancellation.date"), the domain keeps the brands.
 */
type BrandedString = string & { readonly __brand: unknown };
export type DeepWiden<T> = T extends BrandedString
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepWiden<U>[]
    : T extends object
      ? { [K in keyof T]: DeepWiden<T[K]> }
      : T;

export function defineProblemModule(
  definition: DeepWiden<ProblemModuleDefinition>,
): ProblemModuleDefinition {
  const parsed = problemModuleSchema.parse(definition);

  const factKeys = new Set(parsed.factCatalogue.map((f) => f.key));
  for (const question of parsed.intake) {
    if (!factKeys.has(question.factKey)) {
      throw new Error(`Question "${question.id}" maps to unknown fact key "${question.factKey}"`);
    }
  }
  for (const fact of parsed.factCatalogue) {
    if (fact.required && !parsed.intake.some((q) => q.factKey === fact.key)) {
      throw new Error(`Required fact "${fact.key}" has no intake question`);
    }
  }
  for (const question of parsed.intake) {
    for (const dep of question.askIf ?? []) {
      if (!factKeys.has(dep.factKey)) {
        throw new Error(`Question "${question.id}" depends on unknown fact key "${dep.factKey}"`);
      }
    }
  }

  // Zod parse produces plain strings; the domain types are branded strings, so
  // re-type through unknown (values are structurally identical by construction).
  return parsed as unknown as ProblemModuleDefinition;
}

// ── Registry ────────────────────────────────────────────────────────

export class ProblemRegistry {
  private readonly byKey = new Map<string, ProblemModuleDefinition>();

  register(module: ProblemModuleDefinition): void {
    if (this.byKey.has(module.key)) {
      throw new Error(`Problem module already registered: ${module.key}`);
    }
    this.byKey.set(module.key, module);
  }

  get(key: string): ProblemModuleDefinition {
    const found = this.byKey.get(key);
    if (!found) throw new Error(`Unknown problem module: ${key}`);
    return found;
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  list(): readonly ProblemModuleDefinition[] {
    return [...this.byKey.values()];
  }
}
