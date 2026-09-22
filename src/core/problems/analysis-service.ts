/**
 * Problem Analysis Service (Fase 4) — generic application service.
 *
 * Runs a Problem Module end-to-end over the F1–F3 substrate:
 *   case → facts → evidence → jurisdiction → rules → evaluations → snapshot.
 *
 * The core knows NO concrete problem: modules are resolved from a
 * ProblemRegistry injected by the composition root. Only PUBLISHED rules are
 * evaluated — draft rules never serve users. The service depends exclusively
 * on ports + pure domain logic (no Drizzle, no HTTP, no AI).
 */
import { DomainError } from "@lib/errors";
import type { CaseRepository } from "../ports";
import { CaseNotFoundError } from "../case/service";
import type { CaseService } from "../case/service";
import type { FactKey, SnapshotId } from "../types";
import { isoDateAddMonths, isoDateDaysBetween } from "../shared/temporal";
import { evaluateRule, type Rule, type RuleEvaluation, type RuleEvaluationContext } from "../rules";
import { jurisdictionApplies } from "../rules/jurisdiction";
import type { ProblemModuleDefinition } from "./contract";
import { resolveNextQuestionWithValues } from "./intake";
import type { KnownFact } from "./intake";

/** Port: read the current PUBLISHED rules the analysis needs. */
export interface PublishedRulesProvider {
  getPublishedRules(keys: readonly string[]): Promise<readonly Rule[]>;
}

/** Thrown when the requested problem module is not registered. */
export class UnknownProblemError extends Error {
  readonly code = "UNKNOWN_PROBLEM";
  constructor(readonly problemKey: string) {
    super(`Unknown problem module: ${problemKey}`);
    this.name = "UnknownProblemError";
  }
}

/** Thrown when the case's jurisdiction is not supported by the module. */
export class UnsupportedJurisdictionError extends Error {
  readonly code = "UNSUPPORTED_JURISDICTION";
  constructor(
    readonly problemKey: string,
    readonly jurisdiction: string,
    readonly supported: readonly string[],
  ) {
    super(
      `Problem ${problemKey} does not support jurisdiction ${jurisdiction} ` +
        `(supported: ${supported.join(", ")})`,
    );
    this.name = "UnsupportedJurisdictionError";
  }
}

export interface ProblemAnalysis {
  readonly caseId: string;
  readonly problemKey: string;
  readonly moduleVersion: number;
  readonly jurisdiction: string;
  readonly evaluatedAt: string;
  /** Deterministic context date (injected, never new Date() inside rules). */
  readonly currentDate: string;
  readonly evaluations: readonly RuleEvaluation[];
  readonly snapshotId: SnapshotId;
  readonly intakeComplete: boolean;
  readonly missingRequiredFacts: readonly string[];
  readonly engineVersion: string;
}

export interface RunAnalysisOptions {
  /** Analysis date — injectable for reproducibility (defaults to now). */
  readonly currentDate?: string;
  /** sourceId → version identifier, frozen into the snapshot. */
  readonly sourceVersions?: Readonly<Record<string, string>>;
}

export interface ProblemAnalysisServiceDeps {
  readonly repo: CaseRepository;
  readonly caseService: CaseService;
  readonly rules: PublishedRulesProvider;
  /** Evaluation recorder port (implemented by the rules repository adapter). */
  readonly evaluationRecorder: {
    recordEvaluation(params: {
      caseId: string;
      evaluation: RuleEvaluation;
      rulesetHash?: string;
      evaluatedAt: string;
    }): Promise<void>;
  };
  readonly registry: {
    get(problemKey: string): ProblemModuleDefinition;
    has(problemKey: string): boolean;
  };
  readonly engineVersion?: string;
}

export class ProblemAnalysisService {
  private readonly engineVersion: string;

  constructor(private readonly deps: ProblemAnalysisServiceDeps) {
    this.engineVersion = deps.engineVersion ?? "1.0.0";
  }

  private get repo() {
    return this.deps.repo;
  }

  private get caseService() {
    return this.deps.caseService;
  }

  private get rules() {
    return this.deps.rules;
  }

  private get registry() {
    return this.deps.registry;
  }

  /**
   * Run the full module analysis for a case:
   * load aggregate → validate module/jurisdiction → build evaluation context
   * (facts + contradicted keys + evidence refs) → evaluate each PUBLISHED rule
   * of the module → persist evaluations + analysis snapshot atomically.
   */
  async runProblemAnalysis(caseId: string, options?: RunAnalysisOptions): Promise<ProblemAnalysis> {
    const loaded = await this.repo.loadCase(caseId);
    if (!loaded) throw new CaseNotFoundError(caseId);
    const problemKey = loaded.case.problemSlug as string;

    if (!this.registry.has(problemKey)) throw new UnknownProblemError(problemKey);
    const problemModule = this.registry.get(problemKey);

    const jurisdiction = loaded.case.jurisdiction as string;
    if (!problemModule.jurisdictions.includes(jurisdiction as never)) {
      throw new UnsupportedJurisdictionError(problemKey, jurisdiction, problemModule.jurisdictions);
    }

    // ── Build the pure evaluation context ────────────────────────────
    const contradictedKeys = new Set(
      loaded.contradictions
        .filter((c) => c.status === "UNRESOLVED")
        .map((c) => c.factKey as string),
    ) as unknown as Set<
      RuleEvaluationContext["contradictedKeys"] extends ReadonlySet<infer K> ? K : never
    >;
    const evidenceRefsByFact = new Map<string, string[]>();
    for (const link of loaded.evidenceLinks) {
      const refs = evidenceRefsByFact.get(link.factId) ?? [];
      refs.push(link.evidenceId);
      evidenceRefsByFact.set(link.factId, refs);
    }

    const currentFacts = loaded.facts.filter((f) => f.status !== "SUPERSEDED");

    // ── Compute derived facts ────────────────────────────────────────
    // Some modules define derived facts that are computed from other facts
    // rather than collected from the user. For example, no-delivery-refund
    // computes `delivery.applicable_deadline` from `delivery.promised_date`
    // and `purchase.date` + 30-day legal default (Art. 66 bis.1).
    const derivedFacts = computeDerivedFacts(currentFacts, problemModule);

    const baseFacts = currentFacts.map((f) => ({
      key: f.key,
      status: f.status,
      value: extractPrimitive(f.value),
      evidenceRefs:
        evidenceRefsByFact.get(f.id as string) ?? f.evidenceRefs.map((r) => r.evidenceId),
    }));
    const derivedMapped = derivedFacts.map((f) => ({
      key: f.key as FactKey,
      status: f.status as "CONFIRMED" | "UNCONFIRMED" | "CONTRADICTED" | "SUPERSEDED",
      value: f.value,
      evidenceRefs: [] as readonly string[],
    }));

    const context: RuleEvaluationContext = {
      facts: [...baseFacts, ...derivedMapped],
      contradictedKeys,
      jurisdiction: parseJurisdiction(jurisdiction),
      currentDate: (options?.currentDate ?? todayIso()) as RuleEvaluationContext["currentDate"],
    };

    // ── Evaluate only the module's PUBLISHED rules ───────────────────
    const published = await this.rules.getPublishedRules(problemModule.ruleKeys);
    const publishedKeys = new Set(published.map((r) => r.key));
    const missingRules = problemModule.ruleKeys.filter((k) => !publishedKeys.has(k));
    if (missingRules.length > 0) {
      throw new DomainError(
        `Problem ${problemKey}: rules not available as PUBLISHED: ${missingRules.join(", ")}`,
      );
    }

    // Cheap deterministic pre-filter: skip rules whose jurisdiction cannot match.
    const evaluations = published
      .filter((rule) => jurisdictionApplies(rule.scope, context.jurisdiction))
      .map((rule) => evaluateRule(rule, context));

    // ── Persist evaluations + snapshot ───────────────────────────────
    const evaluatedAt = new Date().toISOString();
    const sourceVersions = { ...(options?.sourceVersions ?? {}) };
    const hash = rulesetHash(published);

    for (const evaluation of evaluations) {
      await this.deps.evaluationRecorder.recordEvaluation({
        caseId,
        evaluation,
        rulesetHash: hash,
        evaluatedAt,
      });
    }

    const { snapshotId } = await this.caseService.createSnapshotForCase(caseId, {
      rulesetHash: hash as never,
      sourceVersions,
      at: evaluatedAt as never,
    });

    // ── Intake status (informational, drives the UI later) ───────────
    // "Complete" means every REQUIRED question's fact is known — optional
    // questions may remain unanswered without blocking analysis.
    const knownKeys = new Set(currentFacts.map((f) => f.key as string));
    const missingRequiredFacts = problemModule.intake
      .filter((q) => q.required && !knownKeys.has(q.factKey as string))
      .map((q) => q.factKey as string);
    const values = new Map(currentFacts.map((f) => [f.key as string, extractPrimitive(f.value)]));
    const known: KnownFact[] = currentFacts.map((f) => ({
      key: f.key,
      status: f.status,
    }));
    // Informational next-question resolution (consumed by the UI in a later phase);
    // completion semantics above are requirement-based, not presence-based.
    resolveNextQuestionWithValues(problemModule, known, values as never);

    return {
      caseId,
      problemKey,
      moduleVersion: problemModule.version,
      jurisdiction,
      evaluatedAt,
      currentDate: context.currentDate,
      evaluations,
      snapshotId,
      intakeComplete: missingRequiredFacts.length === 0,
      missingRequiredFacts,
      engineVersion: this.engineVersion,
    };
  }
}

/** Extract the comparable primitive from a FactValue for the evaluator context. */
function extractPrimitive(value: { type: string; value: unknown }): unknown {
  // money keeps its structured form (amountMinor/currency) — v1 rules cannot
  // compare it; enum/object values are passed as-is for FACT_EQUALS on strings.
  if (value && typeof value === "object" && "amountMinor" in (value as object)) {
    return value;
  }
  return (value as { value?: unknown }).value ?? value;
}

/** Parse "ES" / "ES-AN" into { country, region? }. */
function parseJurisdiction(code: string): { country: string; region?: string } {
  const dash = code.indexOf("-");
  if (dash === -1) return { country: code };
  return { country: code.slice(0, dash), region: code.slice(dash + 1) };
}

/** Today as an IsoDate (UTC) — the only permitted "now" read, injected via options. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic identity hash of the evaluated ruleset (same FNV-1a as infra). */
function rulesetHash(rules: readonly Rule[]): string {
  const canonical = JSON.stringify(
    rules
      .map((r) => ({ key: r.key, version: r.version }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.version - b.version),
  );
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(canonical, "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute derived facts that are not collected from the user but derived
 * from other facts + legal rules. Currently handles:
 * - no-delivery-refund: delivery.applicable_deadline from delivery.promised_date
 *   or purchase.date + 30 days (Art. 66 bis.1 TRLGDCU).
 *
 * This is a generic mechanism: any module can define derived facts in its
 * fact catalogue, and this function computes them before rule evaluation.
 */
/**
 * Read a stored fact's PRIMITIVE value.
 *
 * Facts are persisted as structured values ({ type: "date", value: "2026-05-01" }).
 * The derived-fact logic used to read `fact.value` directly, so every
 * `typeof === "string"` / `=== true` / `=== "number"` check was false and NO
 * derived fact was ever produced (responsibility deadlines, notice days, flight
 * distance…). Every rule depending on them then reported INSUFFICIENT_DATA.
 */
function primitiveFactValue(fact: { value: unknown } | undefined): unknown {
  if (!fact) return undefined;
  return extractPrimitive(fact.value as { type: string; value: unknown });
}

function computeDerivedFacts(
  facts: readonly { key: string; value: unknown; status: string }[],
  _module: ProblemModuleDefinition,
): readonly { key: string; value: unknown; status: string; provenance: string }[] {
  const derived: { key: string; value: unknown; status: string; provenance: string }[] = [];
  const factMap = new Map(facts.map((f) => [f.key, f]));

  // no-delivery-refund: compute delivery.applicable_deadline
  if (_module.key === "no-delivery-refund" && !factMap.has("delivery.applicable_deadline")) {
    const promisedDate = primitiveFactValue(factMap.get("delivery.promised_date"));
    const purchaseDate = primitiveFactValue(factMap.get("purchase.date"));

    if (typeof promisedDate === "string") {
      // Agreed date exists → applicable_deadline = promised_date
      derived.push({
        key: "delivery.applicable_deadline",
        value: promisedDate,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });
    } else if (typeof purchaseDate === "string") {
      // No agreed date → applicable_deadline = purchase.date + 30 days
      // Art. 66 bis.1 TRLGDCU: "plazo máximo de treinta días naturales"
      const purchase = new Date(purchaseDate);
      purchase.setDate(purchase.getDate() + 30);
      const deadline = purchase.toISOString().slice(0, 10);
      derived.push({
        key: "delivery.applicable_deadline",
        value: deadline,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });
    }
  }

  // warranty-rejection: compute compliance deadlines
  if (_module.key === "warranty-rejection" && !factMap.has("compliance.responsibility_deadline")) {
    const deliveryDate = primitiveFactValue(factMap.get("purchase.delivery_date"));

    if (typeof deliveryDate === "string") {
      const dv = deliveryDate;

      // Art. 120.1 TRLGDCU: 3-year responsibility period for goods.
      // For used goods, parties may agree to a shorter period (min 1 year).
      // Default: 36 months. We cannot know the agreed period from facts
      // alone (it would require a separate fact), so we use 36 months.
      const responsibilityDeadline = isoDateAddMonths(dv as never, 36);
      derived.push({
        key: "compliance.responsibility_deadline",
        value: responsibilityDeadline,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });

      // Art. 121.1 TRLGDCU: 2-year presumption period.
      // For used goods, the presumption period cannot be less than the
      // agreed responsibility period (minimum 1 year).
      const presumptionDeadline = isoDateAddMonths(dv as never, 24);
      derived.push({
        key: "compliance.presumption_deadline",
        value: presumptionDeadline,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });
    }

    // Art. 122.3 TRLGDCU: 1-year post-repair presumption.
    // Only computed when repair.completed = true.
    const repairCompleted = primitiveFactValue(factMap.get("repair.completed"));
    const repairDeliveryDate = primitiveFactValue(factMap.get("repair.delivery_date"));
    if (repairCompleted === true && typeof repairDeliveryDate === "string") {
      const afterRepairDeadline = isoDateAddMonths(repairDeliveryDate as never, 12);
      derived.push({
        key: "compliance.after_repair_deadline",
        value: afterRepairDeadline,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });
    }
  }

  // flight-cancel: compute cancellation.notice_days and flight.distance_km
  if (_module.key === "flight-cancel") {
    const scheduledDate = primitiveFactValue(factMap.get("flight.scheduled_date"));
    const cancellationDate = primitiveFactValue(factMap.get("cancellation.date"));

    // Compute notice_days: days between cancellation and scheduled departure
    if (
      typeof scheduledDate === "string" &&
      typeof cancellationDate === "string" &&
      !factMap.has("cancellation.notice_days")
    ) {
      const noticeDays = isoDateDaysBetween(cancellationDate as never, scheduledDate as never);
      // NOTE: noticeDays can be negative when cancellation is communicated
      // after the scheduled departure date. We preserve the real value
      // because the rules correctly handle negative notice periods.
      derived.push({
        key: "cancellation.notice_days",
        value: noticeDays,
        status: "CONFIRMED",
        provenance: "DERIVED",
      });
    }

    // Compute flight.distance_km from IATA codes
    const depAirport = primitiveFactValue(factMap.get("flight.departure_airport"));
    const arrAirport = primitiveFactValue(factMap.get("flight.arrival_airport"));
    if (
      typeof depAirport === "string" &&
      typeof arrAirport === "string" &&
      !factMap.has("flight.distance_km")
    ) {
      const dep = AIRPORT_COORDS[depAirport.toUpperCase()];
      const arr = AIRPORT_COORDS[arrAirport.toUpperCase()];
      if (dep && arr) {
        const distanceKm = haversineDistance(dep.lat, dep.lon, arr.lat, arr.lon);
        derived.push({
          key: "flight.distance_km",
          value: Math.round(distanceKm),
          status: "CONFIRMED",
          provenance: "DERIVED",
        });

        // Compute compensation tier (Art. 7 EU261/2004)
        let tier: number;
        if (distanceKm <= 1500) {
          tier = 250; // Art. 7.1.a
        } else if (distanceKm <= 3500) {
          tier = 400; // Art. 7.1.b (intra-UE >1500km)
        } else {
          tier = 600; // Art. 7.1.c (>3500km)
        }
        derived.push({
          key: "flight.compensation_tier",
          value: tier,
          status: "CONFIRMED",
          provenance: "DERIVED",
        });

        // Compute Art. 7(2) reduction eligibility
        // Art. 7(2): 50% reduction when alternative transport arrives within:
        //   (a) 2 hours for flights ≤ 1500 km
        //   (b) 3 hours for intra-Community >1500 km and 1500-3500 km
        //   (c) 4 hours for > 3500 km
        //
        // CRITICAL: This is DIFFERENT from Art. 5(1)(c) exemption.
        // Exemption (Art. 5(1)(c)) = airline pays NOTHING
        // Reduction (Art. 7(2)) = airline pays 50% of base
        //
        // Conditions: (1) passenger accepted re-routing,
        //             (2) arrival delay within Art. 7(2) threshold,
        //             (3) airline NOT exempt under Art. 5(1)(c)
        if (!factMap.has("passenger.compensation_reduction_eligible")) {
          const reRoutingAccepted = primitiveFactValue(factMap.get("airline.re_routing.accepted"));
          const altTransportCompliant = primitiveFactValue(
            factMap.get("airline.alternative_transport_compliant"),
          );
          const altDelayHours = primitiveFactValue(
            factMap.get("airline.alternative_arrival_delay_hours"),
          );

          if (reRoutingAccepted === true && typeof altDelayHours === "number") {
            // Determine Art. 7(2) threshold based on distance tier
            let thresholdHours: number;
            if (distanceKm <= 1500) {
              thresholdHours = 2; // Art. 7(2)(a)
            } else if (distanceKm <= 3500) {
              thresholdHours = 3; // Art. 7(2)(b)
            } else {
              thresholdHours = 4; // Art. 7(2)(c)
            }

            const withinThreshold = altDelayHours < thresholdHours;

            // Art. 7(2) applies ONLY when Art. 5(1)(c) exemption does NOT apply
            const isExempt = altTransportCompliant === true;

            const reductionEligible = withinThreshold && !isExempt;

            derived.push({
              key: "passenger.compensation_reduction_eligible",
              value: reductionEligible,
              status: "CONFIRMED",
              provenance: "DERIVED",
            });
          }
        }
      }
    }
  }

  return derived;
}

// ── Airport coordinate lookup (major European airports) ────────────
// Simplified lookup for distance computation. Only airports that
// appear in common consumer travel routes are included.
const AIRPORT_COORDS: Record<string, { lat: number; lon: number }> = {
  MAD: { lat: 40.4983, lon: -3.5676 }, // Madrid Barajas
  VLC: { lat: 39.4914, lon: -0.4732 }, // Valencia
  SVQ: { lat: 37.3902, lon: -5.8765 }, // Sevilla
  AGP: { lat: 36.6749, lon: -4.4991 }, // Málaga
  PMI: { lat: 39.5517, lon: 2.7388 }, // Palma de Mallorca
  LPA: { lat: 27.9319, lon: -15.3866 }, // Gran Canaria
  TFN: { lat: 28.4827, lon: -16.3415 }, // Tenerife Norte
  TFS: { lat: 28.0443, lon: -16.5725 }, // Tenerife Sur
  CDG: { lat: 49.0097, lon: 2.5479 }, // Paris Charles de Gaulle
  ORY: { lat: 48.7262, lon: 2.3652 }, // Paris Orly
  FCO: { lat: 41.8003, lon: 12.2389 }, // Roma Fiumicino
  FRA: { lat: 50.0379, lon: 8.5622 }, // Frankfurt
  AMS: { lat: 52.3105, lon: 4.7683 }, // Amsterdam Schiphol
  LHR: { lat: 51.47, lon: -0.4543 }, // London Heathrow
  LGW: { lat: 51.1537, lon: -0.1821 }, // London Gatwick
  LIS: { lat: 38.7756, lon: -9.1354 }, // Lisbon
  OPO: { lat: 41.2481, lon: -8.6814 }, // Porto
  ZRH: { lat: 47.4647, lon: 8.5492 }, // Zurich
  MUC: { lat: 48.3537, lon: 11.775 }, // Munich
  BCN: { lat: 41.2974, lon: 2.0833 }, // Barcelona
  DUB: { lat: 53.4264, lon: -6.2499 }, // Dublin
  ATH: { lat: 37.9364, lon: 23.9475 }, // Athens
  IST: { lat: 41.2753, lon: 28.7519 }, // Istanbul
  NRT: { lat: 35.7647, lon: 140.3864 }, // Tokyo Narita
  JFK: { lat: 40.6413, lon: -73.7781 }, // New York JFK
  EWR: { lat: 40.6895, lon: -74.1745 }, // Newark
  MIA: { lat: 25.7959, lon: -80.287 }, // Miami
  GRU: { lat: -23.4356, lon: -46.4731 }, // São Paulo
  MEX: { lat: 19.4363, lon: -99.0721 }, // Mexico City
  BOG: { lat: 4.7016, lon: -74.1469 }, // Bogotá
  EZE: { lat: -34.8222, lon: -58.5358 }, // Buenos Aires
};

/** Haversine formula: distance in km between two lat/lon points. */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export { isoDateDaysBetween };
