/**
 * Resolver — Resolveo.
 *
 * The two ways a case starts, both on this one surface:
 *   1. Deterministic — `?problema=<slug>` (from a problem page): the module is
 *      known, so the case is created with that problem key and the AI is never
 *      asked to guess it.
 *   2. Free description — no problem selected: the AI interprets the text and
 *      routes it to a module.
 *
 * The page itself stays out of the index: it is application state, not content.
 */
import type { Metadata } from "next";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { ResolverClient, type ResolverProblemOption } from "./ResolverClient";

export const metadata: Metadata = {
  title: "Resolver mi problema",
  description:
    "Describe tu problema de consumo. Resolveo analizará la situación con normativa verificable y te mostrará qué puedes hacer.",
  robots: { index: false, follow: false },
};

interface ResolverPageProps {
  searchParams: Promise<{ problema?: string | string[] }>;
}

export default async function ResolverPage({ searchParams }: ResolverPageProps) {
  const { problema } = await searchParams;

  const availableProblems: readonly ResolverProblemOption[] = getAvailableProblems().map(
    (problem) => ({ key: problem.key, slug: problem.slug, title: problem.title }),
  );

  const requestedSlug = Array.isArray(problema) ? problema[0] : problema;
  const initialProblem = requestedSlug
    ? (availableProblems.find((problem) => problem.slug === requestedSlug) ?? null)
    : null;

  return <ResolverClient initialProblem={initialProblem} availableProblems={availableProblems} />;
}
