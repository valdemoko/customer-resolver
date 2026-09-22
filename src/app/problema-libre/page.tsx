/**
 * Problema Libre — REDIRECT to /resolver.
 *
 * This route is the legacy entry point; it now points permanently (308) to the
 * canonical resolution flow, so crawlers transfer any signals to /resolver
 * instead of keeping a temporary redirect alive forever.
 */
import { permanentRedirect } from "next/navigation";

export default function FreeProblemPage() {
  permanentRedirect("/resolver");
}
