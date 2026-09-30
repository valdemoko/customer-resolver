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

/** Bump on each diagnostic deploy so /api/health proves which build is live. */
const BUILD_MARKER = "diag-2026-09-30-1245";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  buildMarker: string;
  checks: {
    application: "ok";
    database: "ok" | "unavailable" | "not_configured";
    ai: {
      configured: boolean;
      /** Length of GROQ_API_KEY (never the value) — a paste error usually shows here. */
      keyLength: number | null;
      /** Groq keys start with "gsk_" — false means wrong key pasted or whitespace before it. */
      prefixOk: boolean | null;
      /** Leading/trailing whitespace or quotes — the classic dashboard paste error. */
      hasWrappingWhitespaceOrQuotes: boolean | null;
    };
  };
  /** One-shot minimal call to the AI provider — typed error code only, no internals. */
  aiProbe?: { reached: boolean; errorCode?: string; httpStatus?: number; ms?: number };
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

  // One-shot minimal probe: does a tiny chat completion reach the provider?
  // Returns only typed outcomes (error code / HTTP status), never key or body.
  let aiProbe: HealthStatus["aiProbe"];
  try {
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();
    const key = env.GROQ_API_KEY ?? env.OPENAI_API_KEY;
    if (key) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const isGroq = Boolean(env.GROQ_API_KEY);
        const base = isGroq ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: isGroq ? "openai/gpt-oss-20b" : "gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        });
        aiProbe = {
          reached: res.ok,
          httpStatus: res.status,
          ms: Date.now() - started,
        };
        if (!res.ok) {
          const body = (await res.text().catch(() => "")).slice(0, 200);
          console.error("[health:aiProbe] HTTP", res.status, body);
        }
      } catch (probeError) {
        aiProbe = {
          reached: false,
          errorCode: controller.signal.aborted ? "AI_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE",
          ms: Date.now() - started,
        };
        console.error(
          "[health:aiProbe] threw:",
          probeError instanceof Error ? probeError.name : "unknown",
          controller.signal.aborted ? "(aborted/timeout)" : "",
        );
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    // probe is best-effort
  }

  const overallStatus = databaseStatus === "unavailable" ? "unhealthy" : "healthy";

  // AI key diagnostics — length/prefix/whitespace only, never the key value.
  // A dashboard-pasted secret with stray quotes or a newline is the most common
  // cause of 401 from Groq while everything else works.
  let ai: HealthStatus["checks"]["ai"] = {
    configured: false,
    keyLength: null,
    prefixOk: null,
    hasWrappingWhitespaceOrQuotes: null,
  };
  try {
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();
    const key = env.GROQ_API_KEY ?? env.OPENAI_API_KEY ?? env.GEMINI_API_KEY;
    if (key) {
      const trimmed = key.trim();
      ai = {
        configured: trimmed.length > 0,
        keyLength: key.length,
        prefixOk: key.startsWith("gsk_") || key.startsWith("sk-"),
        hasWrappingWhitespaceOrQuotes:
          key !== trimmed ||
          key.startsWith("\"") ||
          key.endsWith("\"") ||
          key.startsWith("'") ||
          key.endsWith("'"),
      };
    }
  } catch {
    // env validation failure already implies the app is misconfigured
  }

  const response: HealthStatus = {
    status: overallStatus,
    timestamp,
    version,
    buildMarker: BUILD_MARKER,
    checks: {
      application: "ok",
      database: databaseStatus,
      ai,
    },
    aiProbe,
  };

  return NextResponse.json(response, {
    status: overallStatus === "healthy" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
