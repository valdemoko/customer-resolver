import { NextResponse } from "next/server";

/**
 * Health check (Phase 0). Reports process liveness only — no secrets, no PII,
 * no internal details. DB/storage probes arrive with their phases.
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", service: "resolveo" },
    { headers: { "cache-control": "no-store" } },
  );
}
