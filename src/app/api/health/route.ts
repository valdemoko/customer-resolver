/**
 * API Route: GET /api/health
 *
 * Health check endpoint for production monitoring.
 * Verifies:
 *   - Application is running
 *   - Database is reachable (if configured)
 *   - Returns basic status without exposing internal details
 *
 * Uses a lightweight SELECT 1 for DB check — no expensive operations.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    application: "ok";
    database: "ok" | "unavailable" | "not_configured";
  };
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const timestamp = new Date().toISOString();
  const version = process.env.npm_package_version ?? "unknown";

  // Check database
  let databaseStatus: "ok" | "unavailable" | "not_configured" = "not_configured";

  try {
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();

    if (env.DATABASE_URL) {
      const { createNeonDb } = await import("@server/db/client");
      const db = createNeonDb(env.DATABASE_URL);
      // Lightweight query to verify connectivity
      const { sql } = await import("drizzle-orm");
      await db.select({ ok: sql`1::int` }).from(sql`(SELECT 1) AS t`);
      databaseStatus = "ok";
    }
  } catch {
    databaseStatus = "unavailable";
  }

  const overallStatus = databaseStatus === "unavailable" ? "unhealthy" : "healthy";

  const response: HealthStatus = {
    status: overallStatus,
    timestamp,
    version,
    checks: {
      application: "ok",
      database: databaseStatus,
    },
  };

  return NextResponse.json(response, {
    status: overallStatus === "healthy" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
