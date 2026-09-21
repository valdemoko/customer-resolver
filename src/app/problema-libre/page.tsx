/**
 * Problema Libre — REDIRECT to /resolver.
 *
 * This page now redirects to the canonical resolution flow.
 * The legacy ticket/feedback form has been replaced.
 */
import { redirect } from "next/navigation";

export default function FreeProblemPage() {
  redirect("/resolver");
}
