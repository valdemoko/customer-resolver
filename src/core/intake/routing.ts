/**
 * Deterministic multi-signal routing engine (Fase 8.3, spec §5).
 *
 * AI confidence alone is NEVER sufficient for routing.
 * The routing decision combines:
 *   - AI classification confidence (one signal among many)
 *   - Structural signals present in the input
 *   - Matched required facts
 *   - Module jurisdiction compatibility
 *   - Absence of blocking contradictions
 *
 * Rules:
 *   - HIGH confidence but no structural signals → DO NOT ROUTE
 *   - HIGH confidence but zero matched required facts → DO NOT ROUTE
 *   - Module exists but jurisdiction incompatible → UNSUPPORTED_JURISDICTION
 *   - Multiple near-equal candidates → NEEDS_CLARIFICATION
 *   - Routing is stateless: same input → same decision
 */
import type {
  IntakeInterpretation,
  ModuleCandidate,
  RoutingDecision,
  RoutingRationale,
  RoutingStatus,
  ClassificationConfidence,
  AISafeModuleDescriptor,
} from "./types";

// ── Routing thresholds ───────────────────────────────────────────────

/**
 * Minimum total score required for ROUTED status.
 * Score components:
 *   - AI confidence: HIGH=3, MEDIUM=1, LOW=0
 *   - Structural signals present: +1 per signal (max 5)
 *   - Matched required facts: +2 per fact (max 6)
 *   - Missing required facts: -1 per fact
 *   - Jurisdiction compatible: +3
 *   - No blocking contradictions: +2
 *
 * Maximum possible score: 3 + 5 + 6 + 3 + 2 = 19
 * Threshold: 8 (requires confidence + signals + facts or jurisdiction)
 */
export const ROUTING_THRESHOLD = 8;

/**
 * Threshold for "near miss" — when multiple candidates are close,
 * NEEDS_CLARIFICATION is returned instead of picking one.
 */
export const NEAR_MISS_DIFFERENCE = 2;

/**
 * Minimum number of structural signals required for routing.
 * Even with HIGH confidence, routing requires at least 2 signals.
 */
export const MIN_STRUCTURAL_SIGNALS = 2;

// ── Confidence scoring ───────────────────────────────────────────────

function confidenceScore(confidence: ClassificationConfidence): number {
  switch (confidence) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 1;
    case "LOW":
      return 0;
  }
}

// ── Structural signal counting ───────────────────────────────────────

/**
 * Count how many of the module's semantic signals are present
 * in the interpretation's candidate module signals.
 */
function countStructuralSignals(candidate: ModuleCandidate): number {
  return candidate.signals.length;
}

// ── Score computation ────────────────────────────────────────────────

interface ScoredCandidate {
  readonly candidate: ModuleCandidate;
  readonly score: number;
  readonly hasStructuralSignals: boolean;
  readonly jurisdictionCompatible: boolean;
  readonly noBlockingContradictions: boolean;
  readonly rationale: RoutingRationale;
}

function computeScore(
  candidate: ModuleCandidate,
  interpretation: IntakeInterpretation,
  catalogue: AISafeModuleDescriptor[],
  hasBlockingContradictions: boolean,
): ScoredCandidate {
  // 1. AI confidence (one signal)
  const confScore = confidenceScore(candidate.confidence);

  // 2. Structural signals
  const signalCount = countStructuralSignals(candidate);
  const signalScore = Math.min(signalCount, 5);
  const hasStructuralSignals = signalCount >= MIN_STRUCTURAL_SIGNALS;

  // 3. Matched required facts
  const matchedScore = Math.min(candidate.matchedRequiredFacts.length * 2, 6);

  // 4. Missing required facts (penalty)
  const missingPenalty = candidate.missingRequiredFacts.length;

  // 5. Jurisdiction compatibility
  // No jurisdiction hints = UNKNOWN jurisdiction = NOT compatible
  // (Spec §12.4: no default jurisdiction assumption)
  const moduleDescriptor = catalogue.find((c) => c.problemKey === candidate.problemKey);
  const jurisdictionCompatible =
    interpretation.jurisdictionHints.length > 0 && moduleDescriptor
      ? interpretation.jurisdictionHints.some((h) =>
          moduleDescriptor.supportedJurisdictions.includes(h.jurisdiction),
        )
      : false;
  const jurisdictionScore = jurisdictionCompatible ? 3 : -5;

  // 6. No blocking contradictions
  const noContradictions = !hasBlockingContradictions;
  const contradictionScore = noContradictions ? 2 : -3;

  const total =
    confScore +
    signalScore +
    matchedScore -
    missingPenalty +
    jurisdictionScore +
    contradictionScore;

  const rationale: RoutingRationale = {
    signals: candidate.signals,
    matchedFacts: candidate.matchedRequiredFacts,
    missingFacts: candidate.missingRequiredFacts,
    jurisdictionCompatible,
    noBlockingContradictions: noContradictions,
    score: total,
    threshold: ROUTING_THRESHOLD,
  };

  return {
    candidate,
    score: total,
    hasStructuralSignals,
    jurisdictionCompatible,
    noBlockingContradictions: noContradictions,
    rationale,
  };
}

// ── User-facing explanations ─────────────────────────────────────────

function generateUserExplanation(
  status: RoutingStatus,
  candidate?: ModuleCandidate,
  catalogue?: readonly AISafeModuleDescriptor[],
): string {
  switch (status) {
    case "ROUTED": {
      const descriptor = catalogue?.find((c) => c.problemKey === candidate?.problemKey);
      const title = descriptor?.title ?? candidate?.problemKey ?? "unknown";
      return `Por lo que nos has contado, parece que tu problema puede estar relacionado con: ${title}.`;
    }
    case "NEEDS_CLARIFICATION":
      return "Necesito un poco mas de informacion para entender mejor tu situacion.";
    case "NEEDS_INFORMATION":
      return "Creo que puedo ayudarte, pero necesito algunos datos mas.";
    case "UNSUPPORTED":
      return "Tu problema no coincide con los modulos disponibles actualmente.";
    case "UNSUPPORTED_JURISDICTION":
      return "Necesitamos saber en que pais se realizo la compra para poder ayudarte.";
    case "FAILED":
      return "No hemos podido procesar tu mensaje en este momento.";
  }
}

// ── Main routing function ────────────────────────────────────────────

/**
 * Route an interpretation to a module using multi-signal deterministic policy.
 *
 * This function is PURE and DETERMINISTIC:
 * same interpretation + same catalogue → same routing decision.
 */
export function routeInterpretation(
  interpretation: IntakeInterpretation,
  catalogue: readonly AISafeModuleDescriptor[],
  registeredKeys: ReadonlySet<string>,
): RoutingDecision {
  // Filter to only registered modules
  const candidates = interpretation.candidateModules.filter((c) =>
    registeredKeys.has(c.problemKey),
  );

  if (candidates.length === 0) {
    return {
      status: "UNSUPPORTED",
      rationale: {
        signals: [],
        matchedFacts: [],
        missingFacts: [],
        jurisdictionCompatible: false,
        noBlockingContradictions: false,
        score: 0,
        threshold: ROUTING_THRESHOLD,
      },
      userExplanation: generateUserExplanation("UNSUPPORTED"),
    };
  }

  // Check for blocking contradictions
  const hasBlockingContradictions = interpretation.contradictions.length > 0;

  // Score all candidates
  const scored = candidates.map((c) =>
    computeScore(c, interpretation, [...catalogue], hasBlockingContradictions),
  );

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]!;

  // Check jurisdiction incompatibility
  if (!best.jurisdictionCompatible && interpretation.jurisdictionHints.length > 0) {
    return {
      status: "UNSUPPORTED_JURISDICTION",
      moduleCandidate: best.candidate,
      rationale: best.rationale,
      userExplanation: generateUserExplanation("UNSUPPORTED_JURISDICTION"),
    };
  }

  // Check routing gate: multiple conditions must ALL be met
  const canRoute =
    best.score >= ROUTING_THRESHOLD &&
    best.hasStructuralSignals &&
    best.jurisdictionCompatible &&
    best.noBlockingContradictions;

  if (canRoute) {
    // Check for near-miss with second candidate
    const second = scored[1];
    if (second && best.score - second.score <= NEAR_MISS_DIFFERENCE) {
      return {
        status: "NEEDS_CLARIFICATION",
        moduleCandidate: best.candidate,
        rationale: best.rationale,
        userExplanation: generateUserExplanation("NEEDS_CLARIFICATION"),
      };
    }

    return {
      status: "ROUTED",
      moduleCandidate: best.candidate,
      rationale: best.rationale,
      userExplanation: generateUserExplanation("ROUTED", best.candidate, catalogue),
    };
  }

  // Cannot route to a deterministic module — check if research is possible
  // If no candidates matched at all, this is an UNSUPPORTED problem
  if (candidates.length === 0) {
    return {
      status: "UNSUPPORTED",
      rationale: {
        signals: [],
        matchedFacts: [],
        missingFacts: [],
        jurisdictionCompatible: false,
        noBlockingContradictions: false,
        score: 0,
        threshold: ROUTING_THRESHOLD,
      },
      userExplanation: generateUserExplanation("UNSUPPORTED"),
    };
  }

  // Candidates exist but don't meet routing threshold — offer research
  return {
    status: "NEEDS_CLARIFICATION",
    moduleCandidate: best.candidate,
    rationale: best.rationale,
    userExplanation: generateUserExplanation("NEEDS_CLARIFICATION"),
  };
}
