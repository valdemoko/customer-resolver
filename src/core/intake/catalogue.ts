/**
 * AI-safe module catalogue generator (Fase 8.3, spec §4.1, §9).
 *
 * Generates descriptors from ProblemRegistry — no manual module lists.
 * The AI sees ONLY safe metadata: key, title, description, signals,
 * required fact categories, and supported jurisdictions.
 *
 * NEVER exposes: rule logic, source internals, implementation details,
 * database schema, internal prompts, or secrets.
 */
import type { ProblemRegistry, ProblemModuleDefinition } from "../problems/contract";
import type { AISafeModuleDescriptor } from "./types";

/**
 * Semantic signals derived from a module's definition.
 * These are keywords/themes the AI can match against user input.
 */
function deriveSemanticSignals(module: ProblemModuleDefinition): readonly string[] {
  const signals: string[] = [];

  // Extract from title words (meaningful words >= 3 chars)
  const titleWords = module.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  signals.push(...titleWords);

  // Extract from fact catalogue descriptions (key nouns)
  for (const fact of module.factCatalogue) {
    const words = fact.description
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    // Only take first few words from each fact description
    signals.push(...words.slice(0, 3));
  }

  // Deduplicate
  return [...new Set(signals)];
}

/**
 * Derive required fact categories from the module's fact catalogue.
 * These are general categories, NOT internal fact keys.
 */
function deriveRequiredFactCategories(module: ProblemModuleDefinition): readonly string[] {
  const categories = new Set<string>();

  for (const fact of module.factCatalogue) {
    if (fact.required) {
      // Extract the domain prefix (e.g. "purchase" from "purchase.delivery_date")
      const parts = fact.key.split(".");
      if (parts.length >= 1) {
        categories.add(parts[0]!);
      }
    }
  }

  return [...categories];
}

/**
 * Build the AI-safe module catalogue from the ProblemRegistry.
 * This is deterministic: same registry → same catalogue.
 */
export function buildModuleCatalogue(registry: ProblemRegistry): readonly AISafeModuleDescriptor[] {
  return registry.list().map((module) => ({
    problemKey: module.key,
    title: module.title,
    description: module.description,
    semanticSignals: deriveSemanticSignals(module),
    requiredFactCategories: deriveRequiredFactCategories(module),
    supportedJurisdictions: [...module.jurisdictions],
  }));
}

/**
 * Format the catalogue for inclusion in an AI prompt.
 * Compact representation to minimize tokens.
 */
export function formatCatalogueForPrompt(catalogue: readonly AISafeModuleDescriptor[]): string {
  return catalogue
    .map(
      (m) =>
        `Module: ${m.problemKey}\n` +
        `  Title: ${m.title}\n` +
        `  Description: ${m.description}\n` +
        `  Signals: ${m.semanticSignals.join(", ")}\n` +
        `  Required fact categories: ${m.requiredFactCategories.join(", ")}\n` +
        `  Jurisdictions: ${m.supportedJurisdictions.join(", ")}`,
    )
    .join("\n\n");
}
