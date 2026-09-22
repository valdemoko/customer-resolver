/**
 * Source catalogue for the public /fuentes page.
 *
 * The page used to keep its own hand-written copy of the sources, and that copy
 * drifted from the rule sets: it attributed Art. 102.2 TRLGDCU (nullity of
 * penalty clauses) to the Ley 11/2022, and showed no version identifier or
 * consultation date even though the registry records both (audit 2026-09-22).
 *
 * The list is now derived from the modules themselves, so what the site
 * publishes is exactly what the analysis evaluates. A test in
 * `tests/unit/seo/source-catalogue.test.ts` guards the invariants.
 */
import type { Source } from "@core/rules";
import { buildSources as cancellationChargeSources } from "@problems/cancellation-charge";
import { buildSources as flightCancelSources } from "@problems/flight-cancel";
import { buildSources as noDeliveryRefundSources } from "@problems/no-delivery-refund";
import { buildSources as warrantyRejectionSources } from "@problems/warranty-rejection";

import { PROBLEM_CATALOGUE } from "./problem-catalogue";

const MODULE_SOURCES: Readonly<Record<string, () => readonly Source[]>> = {
  "cancellation-charge": cancellationChargeSources,
  "no-delivery-refund": noDeliveryRefundSources,
  "warranty-rejection": warrantyRejectionSources,
  "flight-cancel": flightCancelSources,
};

/** Human label per source type, for the public chips. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  LAW: "Legislación nacional",
  REGULATION: "Reglamento europeo",
  OFFICIAL_GUIDANCE: "Guía oficial",
  OFFICIAL_DATA: "Datos oficiales",
  COURT_DECISION: "Resolución judicial",
  GOVERNMENT_PAGE: "Página oficial",
  OTHER_OFFICIAL: "Fuente oficial",
};

export interface PublicSource {
  /** Stable internal identifier (traceability). */
  readonly id: string;
  /** Publisher-side identifier, e.g. BOE-A-2007-20555-art117. */
  readonly externalId: string;
  readonly title: string;
  readonly publisher: string;
  /** Official publication the text was consulted in. */
  readonly url: string;
  readonly typeLabel: string;
  readonly scopeLabel: string;
  /** Publisher-side version (consolidation) that was consulted. */
  readonly versionIdentifier: string;
  /** ISO date on which the text was retrieved and verified. */
  readonly retrievedAt: string;
  readonly statusLabel: string;
  /** Article text used by the rules, when documented. */
  readonly relevantSection?: string;
  /** Public problem pages whose rules rely on this source. */
  readonly moduleSlugs: readonly string[];
}

export interface SourceGroup {
  readonly key: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly sources: readonly PublicSource[];
}

function statusLabel(status: Source["status"]): string {
  switch (status) {
    case "VERIFIED":
    case "PUBLISHED":
      return "Verificada (revisión humana registrada)";
    case "REVIEWED":
      return "Revisada, pendiente de verificación";
    case "DRAFT":
      return "Borrador";
    case "DEPRECATED":
      return "Sustituida por una versión posterior";
    default:
      return status;
  }
}

function scopeLabel(source: Source): string {
  const country = source.jurisdiction.country === "ES" ? "España" : source.jurisdiction.country;
  if (source.type === "REGULATION") {
    return `Unión Europea — aplicación directa en ${country}`;
  }
  return country;
}

/** All distinct sources across the modules, with the pages that rely on them. */
export function buildPublicSourceIndex(): ReadonlyMap<string, PublicSource> {
  const index = new Map<string, PublicSource>();
  const moduleSlugs = new Map<string, Set<string>>();

  for (const [key, build] of Object.entries(MODULE_SOURCES)) {
    const entry = PROBLEM_CATALOGUE.find((p) => p.key === key);
    if (!entry) continue;
    for (const source of build()) {
      if (!moduleSlugs.has(source.id)) moduleSlugs.set(source.id, new Set());
      moduleSlugs.get(source.id)!.add(entry.slug);
      if (!index.has(source.id)) {
        index.set(source.id, {
          id: source.id,
          externalId: source.externalId,
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          typeLabel: TYPE_LABELS[source.type] ?? source.type,
          scopeLabel: scopeLabel(source),
          versionIdentifier: source.versionIdentifier,
          retrievedAt: source.retrievedAt,
          statusLabel: statusLabel(source.status),
          relevantSection: source.relevantSection,
          moduleSlugs: [],
        });
      }
    }
  }

  // Attach the (deduplicated) module list now that every module has been read.
  const withModules = new Map<string, PublicSource>();
  for (const [id, source] of index) {
    withModules.set(id, { ...source, moduleSlugs: [...(moduleSlugs.get(id) ?? [])].sort() });
  }
  return withModules;
}

/** Sources grouped per problem module, in catalogue order. */
export function getSourceGroups(): readonly SourceGroup[] {
  const index = buildPublicSourceIndex();
  const groups: SourceGroup[] = [];

  for (const [key, build] of Object.entries(MODULE_SOURCES)) {
    const entry = PROBLEM_CATALOGUE.find((p) => p.key === key);
    if (!entry) continue;
    const seen = new Set<string>();
    const sources: PublicSource[] = [];
    for (const source of build()) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      const publicSource = index.get(source.id);
      if (publicSource) sources.push(publicSource);
    }
    groups.push({
      key,
      title: entry.title,
      slug: entry.slug,
      description: entry.description,
      sources,
    });
  }

  return groups;
}

/** `2026-09-22T12:00:00.000Z` → `22/09/2026`. */
export function formatConsultedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}
