/**
 * Resolver — Resolveo.
 *
 * Premium problem resolution flow.
 * Entry point for AI-powered analysis of consumer problems.
 *
 * Replaces the legacy /problema-libre ticket/feedback form.
 * Connects to the real backend architecture:
 *   /api/intake/interpret → case creation → fact confirmation → analysis → result
 */
import type { Metadata } from "next";
import { ResolverClient } from "./ResolverClient";

export const metadata: Metadata = {
  title: "Resolver mi problema",
  description:
    "Describe tu problema de consumo. Resolveo analizará la situación con normativa verificable y te mostrará qué puedes hacer.",
  robots: { index: false, follow: false },
};

export default function ResolverPage() {
  return <ResolverClient />;
}
