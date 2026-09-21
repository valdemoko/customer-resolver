/**
 * Cost / usage tracking (Fase 6, spec §14).
 *
 * Pricing lives in ONE versioned table — never magic numbers scattered
 * through code. If a model has no pricing entry, estimatedCost is null:
 * we do NOT invent prices. Changing prices = adding a new pricingVersion.
 */

export interface ModelPricing {
  /** USD per 1,000 input tokens. */
  readonly inputPer1k: number;
  /** USD per 1,000 output tokens. */
  readonly outputPer1k: number;
  readonly currency: "USD";
  /** Pricing table version (bump when prices change; keep history auditable). */
  readonly pricingVersion: string;
}

/**
 * Pricing version `2026-09` — public list prices of the F6 default models.
 * Placeholders for planning only; real billing comes from provider dashboards.
 */
export const PRICING_VERSION = "2026-09";

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  "openai/gpt-oss-20b": {
    inputPer1k: 0.000075,
    outputPer1k: 0.0003,
    currency: "USD",
    pricingVersion: PRICING_VERSION,
  },
  "openai/gpt-oss-120b": {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    currency: "USD",
    pricingVersion: PRICING_VERSION,
  },
  "gpt-4o-mini": {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    currency: "USD",
    pricingVersion: PRICING_VERSION,
  },
};

export interface UsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Estimate cost from usage + pricing table. Returns null when the model has
 * no pricing entry or usage is missing — never a fabricated number.
 */
export function estimateCost(model: string, usage: UsageTotals | null): number | null {
  if (!usage) return null;
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const cost =
    (usage.inputTokens / 1000) * pricing.inputPer1k +
    (usage.outputTokens / 1000) * pricing.outputPer1k;
  return cost;
}
