/**
 * Which company is this case against — and how to reach it.
 *
 * The report used to talk about "la aerolínea" or "el vendedor" without ever
 * naming it, and gave no contact at all. This resolves the company from the
 * facts the person already answered and attaches the official customer-service
 * channels we have verified for it (see `company-contacts.ts`).
 *
 * Honest by construction:
 *  - The name always comes from a fact the user (or a document) provided. Never
 *    guessed from the problem type.
 *  - `known: false` means "we have no verified channels", not "here is a phone
 *    number we made up". The report then explains how to find the official
 *    channel.
 *
 * PURE: no I/O, no clock.
 */
import type { Fact, FactKey } from "../types";
import {
  findCompanyContact,
  type CompanyChannel,
  type CompanyContactRecord,
} from "./company-contacts";

/**
 * Facts that hold the company the claim is against, one per module.
 *
 * Kept explicit (and shared with the intake requirements) so adding a module
 * cannot silently lose the contact section.
 */
export const COMPANY_FACT_KEYS: readonly string[] = [
  "airline.name",
  "seller.name",
  "provider.name",
  "company.name",
  "merchant.name",
];

export interface CaseCompany {
  /** Company name as the case knows it. */
  readonly name: string;
  /** Fact key it came from. */
  readonly factKey: FactKey;
  /** True only when we have channels verified against the company's own page. */
  readonly known: boolean;
  /** Sector, when known (Aerolínea, …). */
  readonly sector?: string;
  readonly channels: readonly CompanyChannel[];
  /** Official page the channels were read from. */
  readonly sourceUrl?: string;
  /** ISO date of that verification. */
  readonly verifiedAt?: string;
  readonly note?: string;
}

/** Unwrap a stored FactValue into the text it carries, if any. */
function readTextValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim().length > 0 ? value.trim() : null;
  if (typeof value === "object" && value !== null && "value" in (value as object)) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === "string") return readTextValue(inner);
  }
  return null;
}

/**
 * The company name the case knows, with the fact it came from.
 * Null when no company fact has been answered — never a guess.
 */
export function detectCompanyName(
  facts: readonly Fact[],
): { readonly name: string; readonly factKey: FactKey } | null {
  for (const key of COMPANY_FACT_KEYS) {
    const fact = facts.find((f) => (f.key as string) === key && f.status !== "SUPERSEDED");
    if (!fact) continue;
    const name = readTextValue(fact.value);
    if (name && name.length >= 2) return { name, factKey: fact.key };
  }
  return null;
}

/** Build the company section of the result: name + verified channels, or null. */
export function buildCaseCompany(facts: readonly Fact[]): CaseCompany | null {
  const detected = detectCompanyName(facts);
  if (!detected) return null;

  const record: CompanyContactRecord | null = findCompanyContact(detected.name);

  if (!record) {
    return {
      name: detected.name,
      factKey: detected.factKey,
      known: false,
      channels: [],
    };
  }

  return {
    name: record.name,
    factKey: detected.factKey,
    known: true,
    sector: record.sector,
    channels: record.channels,
    sourceUrl: record.sourceUrl,
    verifiedAt: record.verifiedAt,
    ...(record.note ? { note: record.note } : {}),
  };
}
